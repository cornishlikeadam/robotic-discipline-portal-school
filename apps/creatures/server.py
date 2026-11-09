#!/usr/bin/env python3
"""
Creature tag pages + owner workspace (MVP done-conditions #1–#5).

Pages
  GET  /c/<id>                       Tag page the QR code / NFC tag opens. Public profile for
                                     everyone; claim form for a signed-in finder; full
                                     workspace (chat, memory ledger, pairing, export) for the owner.
API
  GET  /api/creature-config          Public: auth mode, Supabase public URL + anon key, model mode.
  GET  /api/c/<id>/profile           Public profile + how the viewer relates to this creature.
  POST /api/c/<id>/claim             {code} — signed-in user claims an unclaimed creature.
  GET  /api/c/<id>/state             Owner: manifest, pairing, memories, recent conversation.
  POST /api/c/<id>/chat              Owner: {message} → reply + any PROPOSED memories.
  POST /api/c/<id>/memory/review     Owner: {memory_id, approve, updated_content?}.
  POST /api/c/<id>/messages/clear    Owner: delete the conversation log.
  GET  /api/c/<id>/export            Owner: portable identity bundle (.json).
"""

from __future__ import annotations

import html
import json
import os
import pathlib
import re
import time
from typing import Any, Dict, Optional, Tuple

from skeleton.interfaces import AnimalScryptKernel, ChassisSpec

from . import auth, chat, llm

PAGE_PATH = pathlib.Path(__file__).resolve().parent / "page.html"
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
JSON_HEADERS = {"Content-Type": "application/json", "Cache-Control": "no-store"}
HTML_HEADERS = {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}

DEV_DEMO_ID = "mk-demo-patch"
DEV_DEMO_CODE = "DEMO-DEMO-DEMO"

Response = Tuple[int, Dict[str, str], str]


def _json(status: int, payload: Any) -> Response:
    return status, dict(JSON_HEADERS), json.dumps(payload)


def _error(status: int, code: str, message: str) -> Response:
    return _json(status, {"error": code, "message": message})


class CreatureApp:
    def __init__(self, db_target: str, storage_label: Optional[str] = None) -> None:
        self.kernel = AnimalScryptKernel(db_path=db_target)
        if storage_label:
            self.storage = storage_label
        elif self.kernel.backend == "postgres":
            self.storage = "postgres"
        else:
            self.storage = "sqlite"
        self._claim_attempts: Dict[str, list] = {}
        if auth.dev_auth_enabled():
            self._seed_dev_demo()

    # --- local demo creature (dev mode only; never on Vercel) ---
    def _seed_dev_demo(self) -> None:
        try:
            self.kernel.get_companion(DEV_DEMO_ID)
            return
        except KeyError:
            pass
        self.kernel.register_companion(
            companion_id=DEV_DEMO_ID,
            owner_id="studio",
            name="PATCH",
            authored_lore=(
                "A robotic rabbit with one folded ear and a habit of asking what happens next. "
                "PATCH is the curious maker of the School: hands-on, a little restless, and always "
                "one prototype ahead."
            ),
            chassis=ChassisSpec(),
        )
        # Fixed, publicly known code — acceptable only because dev mode can't run on Vercel.
        from skeleton.interfaces import hash_claim_code, utc_now

        self.kernel.conn.execute(
            "INSERT INTO tag_claims (companion_id, claim_code_hash, created_at) VALUES (?, ?, ?)",
            (DEV_DEMO_ID, hash_claim_code(DEV_DEMO_ID, DEV_DEMO_CODE), utc_now()),
        )
        self.kernel.conn.commit()

    # --- helpers ---
    def config(self) -> Dict[str, Any]:
        sb_url, sb_key = auth.supabase_settings()
        return {
            "auth_mode": auth.auth_mode(),
            "supabase_url": sb_url if auth.supabase_enabled() else "",
            "supabase_anon_key": sb_key if auth.supabase_enabled() else "",
            "model_mode": llm.provider_name(),
            "storage": self.storage,
            "storage_is_durable": self.storage != "temporary",
            "dev_demo": {"id": DEV_DEMO_ID, "code": DEV_DEMO_CODE} if auth.dev_auth_enabled() else None,
        }

    def _profile(self, companion_id: str, viewer: Optional[auth.User]) -> Dict[str, Any]:
        companion = self.kernel.get_companion(companion_id)
        pairing = self.kernel.pairing_record(companion_id)
        claimed = bool(pairing and pairing["claimed_by"])
        if viewer and self.kernel.is_owner(companion_id, viewer.id):
            relation = "owner"
        elif not pairing:
            relation = "untagged"
        elif not claimed:
            relation = "unclaimed"
        else:
            relation = "other"
        return {
            "id": companion["id"],
            "name": companion["name"],
            "authored_lore": companion["authored_lore"],
            "chassis_spec": json.loads(companion["chassis_spec_json"]),
            "claimed": claimed,
            "relation": relation,
            "signed_in": bool(viewer),
            "viewer_email": viewer.email if viewer else "",
        }

    def _state(self, companion_id: str, user: auth.User) -> Dict[str, Any]:
        pairing = self.kernel.pairing_record(companion_id) or {}
        return {
            "profile": self._profile(companion_id, user),
            "pairing": {
                "tag_path": f"/c/{companion_id}",
                "claimed_at": pairing.get("claimed_at"),
                "owner_email": user.email,
            },
            "proposed": self.kernel.list_memories(companion_id, "PROPOSED"),
            "approved": self.kernel.list_memories(companion_id, "APPROVED"),
            "messages": self.kernel.recent_messages(companion_id, user.id, limit=60),
            "model_mode": llm.provider_name(),
            "storage": self.storage,
            "storage_is_durable": self.storage != "temporary",
        }

    def _claim_allowed(self, key: str) -> bool:
        now = time.time()
        window = [t for t in self._claim_attempts.get(key, []) if now - t < 900]
        if len(window) >= 8:
            self._claim_attempts[key] = window
            return False
        window.append(now)
        self._claim_attempts[key] = window
        return True

    def render_page(self, companion_id: str) -> Response:
        try:
            name = self.kernel.get_companion(companion_id)["name"]
            status = 200
        except KeyError:
            name, status = "Unknown tag", 404
        page = (
            PAGE_PATH.read_text(encoding="utf-8")
            .replace("__CREATURE_NAME__", html.escape(name))
            .replace("__CREATURE_ID_JSON__", json.dumps(companion_id))
        )
        return status, dict(HTML_HEADERS), page

    # --- router ---
    def handle_request(
        self,
        method: str,
        path: str,
        body: Optional[str] = None,
        authorization: Optional[str] = None,
        ip_address: str = "",
    ) -> Response:
        if method == "GET" and path == "/api/creature-config":
            return _json(200, self.config())

        if path.startswith("/c/"):
            companion_id = path[3:].strip("/").lower()
            if method != "GET" or not ID_PATTERN.match(companion_id):
                return _error(404, "not_found", "No creature at this address.")
            return self.render_page(companion_id)

        match = re.match(r"^/api/c/([^/]+)/([a-z/]+)$", path)
        if not match:
            return _error(404, "not_found", "Unknown creature route.")
        companion_id, action = match.group(1).lower(), match.group(2)
        if not ID_PATTERN.match(companion_id):
            return _error(404, "not_found", "No creature at this address.")
        try:
            self.kernel.get_companion(companion_id)
        except KeyError:
            return _error(404, "not_found", "No creature at this address.")

        try:
            user = auth.resolve_user(authorization)
        except Exception:
            return _error(503, "auth_unavailable", "Couldn't check your sign-in. Try again in a moment.")

        try:
            payload = json.loads(body) if body else {}
            if not isinstance(payload, dict):
                raise ValueError
        except ValueError:
            return _error(400, "bad_json", "Request body must be a JSON object.")

        if method == "GET" and action == "profile":
            return _json(200, self._profile(companion_id, user))

        if not user:
            return _error(401, "sign_in_required", "Sign in first.")

        if method == "POST" and action == "claim":
            key = f"{(ip_address or '').split(',')[0].strip()}|{companion_id}"
            if not self._claim_allowed(key):
                return _error(429, "too_many_attempts", "Too many tries. Wait 15 minutes and try again.")
            try:
                self.kernel.claim_companion(companion_id, user.id, str(payload.get("code", "")))
            except PermissionError as exc:
                return _error(403, "claim_refused", str(exc))
            return _json(200, self._profile(companion_id, user))

        if not self.kernel.is_owner(companion_id, user.id):
            return _error(403, "not_owner", "Only this creature's owner can do that.")

        if method == "GET" and action == "state":
            return _json(200, self._state(companion_id, user))

        if method == "POST" and action == "chat":
            try:
                turn = chat.run_turn(self.kernel, companion_id, user.id, str(payload.get("message", "")))
            except ValueError as exc:
                return _error(400, "bad_message", str(exc))
            except llm.LLMError as exc:
                return _error(502, "model_unavailable", f"Your creature couldn't answer just now. ({exc})")
            return _json(200, turn)

        if method == "POST" and action == "memory/review":
            memory = self.kernel.get_memory(str(payload.get("memory_id", "")))
            if not memory or memory["companion_id"] != companion_id:
                return _error(404, "not_found", "That memory isn't on this creature.")
            if memory["status"] == "DELETED":
                return _error(409, "already_deleted", "That memory was already removed.")
            updated = payload.get("updated_content")
            if updated is not None:
                updated = " ".join(str(updated).split())
                if not (3 <= len(updated) <= chat.MAX_MEMORY_CHARS):
                    return _error(400, "bad_memory", f"Keep memories between 3 and {chat.MAX_MEMORY_CHARS} characters.")
            record = self.kernel.review_memory(memory["id"], approve=bool(payload.get("approve")), updated_content=updated)
            return _json(200, record)

        if method == "POST" and action == "messages/clear":
            removed = self.kernel.clear_messages(companion_id, user.id)
            return _json(200, {"removed": removed})

        if method == "GET" and action == "export":
            bundle = self.kernel.export_portable_bundle(companion_id)
            bundle["synthetic_demo_data"] = False
            bundle["pairing_record"] = self.kernel.pairing_record(companion_id)
            headers = dict(JSON_HEADERS)
            headers["Content-Disposition"] = f'attachment; filename="{companion_id}-identity.json"'
            return 200, headers, json.dumps(bundle, indent=2)

        return _error(404, "not_found", "Unknown creature route.")


def default_db_target(tmp_dir: pathlib.Path) -> Tuple[str, Optional[str]]:
    """DATABASE_URL (Supabase) when set; otherwise a SQLite file that won't survive restarts on Vercel."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url, None
    if os.environ.get("VERCEL"):
        return str(tmp_dir / "portal_school_creatures.db"), "temporary"
    return os.environ.get("CREATURE_DB", str(tmp_dir / "portal_school_creatures.db")), None
