"""Journal OS data layer: durable SQLite storage with backend authorization.

Every public method takes the acting user id and checks workspace membership
before touching data. Companion identity and memory reuse the existing
Animal Scrypt kernel (skeleton/interfaces.py) against the same database file.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from skeleton.interfaces import AnimalScryptKernel, ChassisSpec

SCHEMA_PATH = pathlib.Path(__file__).resolve().parent / "schema.sql"

ROLE_RANK = {"viewer": 1, "editor": 2, "owner": 3}
EVENT_KINDS = ("event", "task", "reminder", "routine")
RECURRENCES = ("none", "daily", "weekly")
CALENDARS = ("personal", "companion")
MEMORY_CATEGORIES = ("interest", "project", "routine", "observation")

# Fictional companions seeded for every new personal workspace. Lore is
# authored (immutable) and kept separate from user-approved memories.
DEFAULT_COMPANIONS = [
    ("PATCH", "The curious maker. A robotic rabbit who builds first and asks questions while the glue dries."),
    ("MOSS", "The steady observer. Notices patterns, keeps the log, never rushes a decision."),
    ("PIP", "The bright collaborator. Turns any session into a game with rules everyone can follow."),
]


class AuthError(Exception):
    """Caller is not signed in."""


class Forbidden(Exception):
    """Caller is signed in but lacks permission."""


class NotFound(Exception):
    pass


class Invalid(Exception):
    pass


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _stable(handle: str) -> str:
    return hashlib.sha256(("journal-os-user:" + handle).encode("utf-8")).hexdigest()[:10]


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def parse_local(value: str) -> dt.datetime:
    try:
        return dt.datetime.fromisoformat(str(value)[:16])
    except (TypeError, ValueError) as exc:
        raise Invalid(f"Bad date/time: {value!r} (expected YYYY-MM-DDTHH:MM)") from exc


def fmt_local(value: dt.datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M")


class JournalStore:
    def __init__(self, db_path: str) -> None:
        if db_path != ":memory:":
            pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        # Reuse the Animal Scrypt kernel: it owns companions + memory_records.
        self.kernel = AnimalScryptKernel(db_path=db_path)
        self.conn: sqlite3.Connection = self.kernel.conn
        self.conn.execute("PRAGMA journal_mode=WAL") if db_path != ":memory:" else None
        self.conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # ------------------------------------------------------------------ util
    def _one(self, sql: str, args: tuple = ()) -> Optional[Dict[str, Any]]:
        row = self.conn.execute(sql, args).fetchone()
        return dict(row) if row else None

    def _all(self, sql: str, args: tuple = ()) -> List[Dict[str, Any]]:
        return [dict(r) for r in self.conn.execute(sql, args).fetchall()]

    def audit(self, workspace_id: Optional[str], user_id: Optional[str], action: str,
              target_type: str, target_id: Optional[str], detail: Optional[Dict[str, Any]] = None) -> None:
        self.conn.execute(
            "INSERT INTO audit_log (workspace_id, user_id, action, target_type, target_id, detail_json, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (workspace_id, user_id, action, target_type, target_id, json.dumps(detail or {}), utc_now()),
        )

    # ------------------------------------------------------- users/sessions
    # Session tokens are signed (HMAC), not stored. Any server instance can
    # verify one without a database lookup, so serverless hosts that run
    # several copies with separate /tmp storage don't sign people out.
    TOKEN_DAYS = 30

    def _secret(self) -> bytes:
        env = os.environ.get("JOURNAL_OS_SECRET")
        if env:
            return env.encode("utf-8")
        if os.environ.get("VERCEL"):
            # Shared across instances of one deployment. Sign-in has no password,
            # so this is no weaker than the sign-in itself; set JOURNAL_OS_SECRET
            # before adding real authentication.
            return ("journal-os:" + os.environ.get("VERCEL_PROJECT_ID", "vercel")).encode("utf-8")
        row = self._one("SELECT value FROM meta WHERE key = 'token_secret'")
        if row:
            return row["value"].encode("utf-8")
        value = secrets.token_hex(32)
        self.conn.execute("INSERT OR IGNORE INTO meta VALUES ('token_secret', ?)", (value,))
        self.conn.commit()
        return self._one("SELECT value FROM meta WHERE key = 'token_secret'")["value"].encode("utf-8")

    def _sign(self, body: str) -> str:
        return hmac.new(self._secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()[:40]

    def make_token(self, handle: str) -> str:
        exp = int(time.time()) + self.TOKEN_DAYS * 86400
        body = f"v1.{handle}.{exp}"
        return f"{body}.{self._sign(body)}"

    @staticmethod
    def _clean_handle(handle: str) -> str:
        handle = (handle or "").strip().lower()
        if not handle or not handle.replace("-", "").replace("_", "").isalnum() or len(handle) > 32:
            raise Invalid("Handle must be 1-32 letters, digits, '-' or '_'.")
        return handle

    def _ensure_user(self, handle: str, display_name: Optional[str] = None) -> Dict[str, Any]:
        user = self._one("SELECT * FROM users WHERE handle = ?", (handle,))
        if user:
            return user
        # Stable ids derived from the handle: a fresh server instance recreates
        # the same user/workspace/companion ids the browser already holds.
        user = {"id": "usr-" + _stable(handle), "handle": handle,
                "display_name": (display_name or handle).strip()[:60], "created_at": utc_now()}
        self.conn.execute("INSERT INTO users VALUES (:id, :handle, :display_name, :created_at)", user)
        self._create_personal_workspace(user)
        self.conn.commit()
        return user

    def sign_in(self, handle: str, display_name: Optional[str] = None) -> Dict[str, Any]:
        """Local-profile sign-in (device trust model, no password).

        Creates the user + personal workspace + companions on first use.
        """
        handle = self._clean_handle(handle)
        user = self._ensure_user(handle, display_name)
        self.audit(None, user["id"], "session.create", "user", user["id"])
        self.conn.commit()
        return {"token": self.make_token(handle), "user": user, "workspaces": self.list_workspaces(user["id"])}

    def user_for_token(self, token: Optional[str]) -> Dict[str, Any]:
        if not token:
            raise AuthError("Sign in required.")
        parts = token.split(".")
        if len(parts) != 4 or parts[0] != "v1":
            raise AuthError("Session expired or invalid.")
        body = ".".join(parts[:3])
        if not hmac.compare_digest(self._sign(body), parts[3]):
            raise AuthError("Session expired or invalid.")
        try:
            exp = int(parts[2])
            handle = self._clean_handle(parts[1])
        except (ValueError, Invalid):
            raise AuthError("Session expired or invalid.")
        if exp < time.time():
            raise AuthError("Session expired.")
        return self._ensure_user(handle)

    def sign_out(self, token: str) -> None:
        """Signed tokens are dropped by the browser; nothing is stored server-side."""
        return None

    def _create_personal_workspace(self, user: Dict[str, Any]) -> str:
        key = _stable(user["handle"])
        ws_id = "ws-" + key
        now = utc_now()
        self.conn.execute("INSERT INTO workspaces VALUES (?, ?, 'personal', ?, ?)",
                          (ws_id, f"{user['display_name']}'s desk", user["id"], now))
        self.conn.execute("INSERT INTO workspace_memberships VALUES (?, ?, 'owner', ?)", (ws_id, user["id"], now))
        for name, lore in DEFAULT_COMPANIONS:
            cid = f"cmp-{name.lower()}-{key[:6]}"
            # kernel commits internally
            self.kernel.register_companion(cid, user["id"], name, lore, ChassisSpec())
            self.conn.execute("INSERT INTO workspace_companions VALUES (?, ?)", (ws_id, cid))
            # Companions may propose to planner/journal/memory; they never get 'write'.
            for resource in ("planner", "journal", "memory", "companion_calendar"):
                self.conn.execute(
                    "INSERT INTO access_grants VALUES (?, ?, ?, ?, 'propose', ?, ?, NULL)",
                    (_id("grant"), ws_id, f"companion:{cid}", resource, user["id"], now),
                )
        self.audit(ws_id, user["id"], "workspace.create", "workspace", ws_id)
        return ws_id

    # ------------------------------------------------------------ authz
    def list_workspaces(self, user_id: str) -> List[Dict[str, Any]]:
        return self._all(
            "SELECT w.*, m.role FROM workspaces w JOIN workspace_memberships m ON m.workspace_id = w.id"
            " WHERE m.user_id = ? ORDER BY w.created_at",
            (user_id,),
        )

    def require_role(self, user_id: str, workspace_id: str, minimum: str) -> str:
        row = self._one("SELECT role FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?",
                        (workspace_id, user_id))
        if not row:
            # Do not reveal whether the workspace exists.
            raise Forbidden("No access to this workspace.")
        if ROLE_RANK[row["role"]] < ROLE_RANK[minimum]:
            raise Forbidden(f"Requires {minimum} role.")
        return row["role"]

    def add_member(self, actor_id: str, workspace_id: str, handle: str, role: str) -> Dict[str, Any]:
        self.require_role(actor_id, workspace_id, "owner")
        if role not in ("editor", "viewer"):
            raise Invalid("role must be editor or viewer")
        target = self._one("SELECT * FROM users WHERE handle = ?", (handle.strip().lower(),))
        if not target:
            raise NotFound("No such user.")
        self.conn.execute("INSERT OR REPLACE INTO workspace_memberships VALUES (?, ?, ?, ?)",
                          (workspace_id, target["id"], role, utc_now()))
        self.audit(workspace_id, actor_id, "membership.grant", "user", target["id"], {"role": role})
        self.conn.commit()
        return {"workspace_id": workspace_id, "user_id": target["id"], "role": role}

    def companion_may(self, workspace_id: str, companion_id: str, resource: str, permission: str) -> bool:
        row = self._one(
            "SELECT 1 FROM access_grants WHERE workspace_id = ? AND grantee = ? AND resource = ?"
            " AND permission = ? AND revoked_at IS NULL",
            (workspace_id, f"companion:{companion_id}", resource, permission),
        )
        return bool(row)

    def list_grants(self, user_id: str, workspace_id: str) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        return self._all("SELECT * FROM access_grants WHERE workspace_id = ? ORDER BY grantee, resource",
                         (workspace_id,))

    # ------------------------------------------------------------ events
    def _clean_event(self, data: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        if "title" in data or not partial:
            title = str(data.get("title") or "").strip()
            if not title:
                raise Invalid("Event title is required.")
            out["title"] = title[:200]
        if "start_at" in data or not partial:
            start = parse_local(data.get("start_at"))
            out["start_at"] = fmt_local(start)
            if "end_at" in data and data.get("end_at"):
                end = parse_local(data["end_at"])
            else:
                minutes = int(data.get("duration_minutes") or 60)
                end = start + dt.timedelta(minutes=max(5, min(minutes, 24 * 60)))
            if end <= start:
                raise Invalid("End time must be after start time.")
            out["end_at"] = fmt_local(end)
        elif "end_at" in data:
            raise Invalid("Send start_at together with end_at.")
        for key, allowed in (("kind", EVENT_KINDS), ("recurrence", RECURRENCES), ("calendar", CALENDARS)):
            if key in data or not partial:
                value = data.get(key) or allowed[0]
                if value not in allowed:
                    raise Invalid(f"{key} must be one of {allowed}")
                out[key] = value
        if "notes" in data or not partial:
            out["notes"] = str(data.get("notes") or "")[:4000]
        if "completed" in data:
            out["completed"] = 1 if data.get("completed") else 0
        if "participants" in data or not partial:
            parts = data.get("participants") or []
            if not isinstance(parts, list):
                raise Invalid("participants must be a list")
            out["participants_json"] = json.dumps([str(p)[:40] for p in parts][:8])
        return out

    def _event_out(self, row: Dict[str, Any]) -> Dict[str, Any]:
        row["participants"] = json.loads(row.pop("participants_json") or "[]")
        row["completed"] = bool(row["completed"])
        return row

    def create_event(self, user_id: str, workspace_id: str, data: Dict[str, Any], via: str = "manual") -> Dict[str, Any]:
        self.require_role(user_id, workspace_id, "editor")
        clean = self._clean_event(data)
        now = utc_now()
        row = {"id": _id("evt"), "workspace_id": workspace_id, "completed": 0, "created_by": user_id,
               "created_at": now, "updated_at": now, **clean}
        self.conn.execute(
            "INSERT INTO events (id, workspace_id, calendar, kind, title, start_at, end_at, recurrence, completed,"
            " notes, participants_json, created_by, created_at, updated_at) VALUES (:id, :workspace_id, :calendar,"
            " :kind, :title, :start_at, :end_at, :recurrence, :completed, :notes, :participants_json, :created_by,"
            " :created_at, :updated_at)",
            row,
        )
        self.audit(workspace_id, user_id, "event.create", "event", row["id"], {"via": via, "title": row["title"]})
        self.conn.commit()
        return self.get_event(user_id, row["id"])

    def get_event(self, user_id: str, event_id: str) -> Dict[str, Any]:
        row = self._one("SELECT * FROM events WHERE id = ?", (event_id,))
        if not row:
            raise NotFound("Event not found.")
        self.require_role(user_id, row["workspace_id"], "viewer")
        return self._event_out(row)

    def list_events(self, user_id: str, workspace_id: str, start: Optional[str] = None,
                    end: Optional[str] = None, calendar: Optional[str] = None) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        sql = "SELECT * FROM events WHERE workspace_id = ?"
        args: List[Any] = [workspace_id]
        if calendar:
            sql += " AND calendar = ?"
            args.append(calendar)
        rows = [self._event_out(r) for r in self._all(sql + " ORDER BY start_at", tuple(args))]
        if not start and not end:
            return rows
        lo = parse_local(start) if start else dt.datetime.min
        hi = parse_local(end) if end else dt.datetime.max
        return [occ for r in rows for occ in _expand(r, lo, hi)]

    def update_event(self, user_id: str, event_id: str, data: Dict[str, Any], via: str = "manual") -> Dict[str, Any]:
        current = self.get_event(user_id, event_id)
        self.require_role(user_id, current["workspace_id"], "editor")
        if "start_at" in data and "end_at" not in data and "duration_minutes" not in data:
            # Keep the original duration when only the start moves.
            dur = parse_local(current["end_at"]) - parse_local(current["start_at"])
            data = {**data, "duration_minutes": int(dur.total_seconds() // 60)}
        clean = self._clean_event(data, partial=True)
        if not clean:
            return current
        clean["updated_at"] = utc_now()
        sets = ", ".join(f"{k} = :{k}" for k in clean)
        self.conn.execute(f"UPDATE events SET {sets} WHERE id = :id", {**clean, "id": event_id})
        self.audit(current["workspace_id"], user_id, "event.update", "event", event_id,
                   {"via": via, "fields": sorted(k for k in clean if k != "updated_at")})
        self.conn.commit()
        return self.get_event(user_id, event_id)

    def delete_event(self, user_id: str, event_id: str, via: str = "manual") -> Dict[str, Any]:
        current = self.get_event(user_id, event_id)
        self.require_role(user_id, current["workspace_id"], "editor")
        self.conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        self.audit(current["workspace_id"], user_id, "event.delete", "event", event_id,
                   {"via": via, "title": current["title"]})
        self.conn.commit()
        return {"deleted": event_id, "title": current["title"]}

    # ----------------------------------------------------------- journal
    def _entry_out(self, row: Dict[str, Any]) -> Dict[str, Any]:
        row["tags"] = json.loads(row.pop("tags_json") or "[]")
        if row.get("event_id"):
            ev = self._one("SELECT id, title, start_at FROM events WHERE id = ?", (row["event_id"],))
            row["event"] = ev
        return row

    def _clean_entry(self, workspace_id: str, data: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        if "title" in data or not partial:
            title = str(data.get("title") or "").strip()
            if not title:
                raise Invalid("Journal entry title is required.")
            out["title"] = title[:200]
        if "body" in data or not partial:
            out["body"] = str(data.get("body") or "")[:20000]
        if "tags" in data or not partial:
            tags = data.get("tags") or []
            if isinstance(tags, str):
                tags = [t for t in (s.strip() for s in tags.split(",")) if t]
            out["tags_json"] = json.dumps(sorted({str(t)[:30].lower() for t in tags})[:12])
        if "event_id" in data or not partial:
            event_id = data.get("event_id") or None
            if event_id:
                ev = self._one("SELECT workspace_id FROM events WHERE id = ?", (event_id,))
                if not ev or ev["workspace_id"] != workspace_id:
                    raise Invalid("Linked event must belong to the same workspace.")
            out["event_id"] = event_id
        return out

    def create_entry(self, user_id: str, workspace_id: str, data: Dict[str, Any], via: str = "manual",
                     origin: str = "user") -> Dict[str, Any]:
        self.require_role(user_id, workspace_id, "editor")
        clean = self._clean_entry(workspace_id, data)
        now = utc_now()
        row = {"id": _id("jrn"), "workspace_id": workspace_id, "origin": origin, "created_at": now,
               "updated_at": now, **clean}
        self.conn.execute(
            "INSERT INTO journal_entries (id, workspace_id, event_id, title, body, tags_json, origin, created_at,"
            " updated_at) VALUES (:id, :workspace_id, :event_id, :title, :body, :tags_json, :origin, :created_at,"
            " :updated_at)",
            row,
        )
        self.audit(workspace_id, user_id, "journal.create", "journal_entry", row["id"], {"via": via})
        self.conn.commit()
        return self.get_entry(user_id, row["id"])

    def get_entry(self, user_id: str, entry_id: str) -> Dict[str, Any]:
        row = self._one("SELECT * FROM journal_entries WHERE id = ?", (entry_id,))
        if not row:
            raise NotFound("Journal entry not found.")
        self.require_role(user_id, row["workspace_id"], "viewer")
        return self._entry_out(row)

    def list_entries(self, user_id: str, workspace_id: str) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        return [self._entry_out(r) for r in
                self._all("SELECT * FROM journal_entries WHERE workspace_id = ? ORDER BY updated_at DESC",
                          (workspace_id,))]

    def update_entry(self, user_id: str, entry_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_entry(user_id, entry_id)
        self.require_role(user_id, current["workspace_id"], "editor")
        clean = self._clean_entry(current["workspace_id"], data, partial=True)
        if clean:
            clean["updated_at"] = utc_now()
            sets = ", ".join(f"{k} = :{k}" for k in clean)
            self.conn.execute(f"UPDATE journal_entries SET {sets} WHERE id = :id", {**clean, "id": entry_id})
            self.audit(current["workspace_id"], user_id, "journal.update", "journal_entry", entry_id)
            self.conn.commit()
        return self.get_entry(user_id, entry_id)

    def delete_entry(self, user_id: str, entry_id: str) -> Dict[str, Any]:
        current = self.get_entry(user_id, entry_id)
        self.require_role(user_id, current["workspace_id"], "editor")
        self.conn.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
        self.audit(current["workspace_id"], user_id, "journal.delete", "journal_entry", entry_id)
        self.conn.commit()
        return {"deleted": entry_id}

    # --------------------------------------------------------- companions
    def list_companions(self, user_id: str, workspace_id: str) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        rows = self._all(
            "SELECT c.* FROM companions c JOIN workspace_companions wc ON wc.companion_id = c.id"
            " WHERE wc.workspace_id = ? ORDER BY c.name",
            (workspace_id,),
        )
        for r in rows:
            r["chassis_spec"] = json.loads(r.pop("chassis_spec_json"))
            r["voice_constraints"] = json.loads(r.pop("voice_constraints_json"))
        return rows

    def _require_companion(self, user_id: str, workspace_id: str, companion_id: str, minimum: str) -> None:
        self.require_role(user_id, workspace_id, minimum)
        if not self._one("SELECT 1 FROM workspace_companions WHERE workspace_id = ? AND companion_id = ?",
                         (workspace_id, companion_id)):
            raise Forbidden("Companion is not part of this workspace.")

    def find_companion(self, workspace_id: str, name: str) -> Optional[Dict[str, Any]]:
        return self._one(
            "SELECT c.id, c.name FROM companions c JOIN workspace_companions wc ON wc.companion_id = c.id"
            " WHERE wc.workspace_id = ? AND upper(c.name) = upper(?)",
            (workspace_id, name),
        )

    # ----------------------------------------------------------- memories
    def propose_memory(self, user_id: str, workspace_id: str, companion_id: str, category: str, content: str,
                       journal_entry_id: Optional[str] = None, event_id: Optional[str] = None) -> Dict[str, Any]:
        self._require_companion(user_id, workspace_id, companion_id, "editor")
        if not self.companion_may(workspace_id, companion_id, "memory", "propose"):
            raise Forbidden("This companion is not permitted to propose memories.")
        if category not in MEMORY_CATEGORIES:
            raise Invalid(f"category must be one of {MEMORY_CATEGORIES}")
        content = (content or "").strip()
        if not content:
            raise Invalid("Memory content is required.")
        if journal_entry_id:
            self.get_entry(user_id, journal_entry_id)
        if event_id:
            self.get_event(user_id, event_id)
        mem_id = self.kernel.propose_memory(companion_id, category, content[:1000])
        self.conn.execute("INSERT INTO memory_links VALUES (?, ?, ?, ?, ?)",
                          (mem_id, workspace_id, companion_id, journal_entry_id, event_id))
        self.audit(workspace_id, user_id, "memory.propose", "memory", mem_id, {"companion_id": companion_id})
        self.conn.commit()
        return self.get_memory(user_id, mem_id)

    def get_memory(self, user_id: str, memory_id: str) -> Dict[str, Any]:
        row = self._one(
            "SELECT m.*, l.workspace_id, l.journal_entry_id, l.event_id, c.name AS companion_name"
            " FROM memory_records m JOIN memory_links l ON l.memory_id = m.id"
            " JOIN companions c ON c.id = m.companion_id WHERE m.id = ?",
            (memory_id,),
        )
        if not row:
            raise NotFound("Memory not found.")
        self.require_role(user_id, row["workspace_id"], "viewer")
        return row

    def list_memories(self, user_id: str, workspace_id: str, companion_id: Optional[str] = None,
                      status: Optional[str] = None) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        sql = ("SELECT m.*, l.workspace_id, l.journal_entry_id, l.event_id, c.name AS companion_name"
               " FROM memory_records m JOIN memory_links l ON l.memory_id = m.id"
               " JOIN companions c ON c.id = m.companion_id WHERE l.workspace_id = ?")
        args: List[Any] = [workspace_id]
        if companion_id:
            sql += " AND m.companion_id = ?"
            args.append(companion_id)
        if status:
            sql += " AND m.status = ?"
            args.append(status)
        else:
            sql += " AND m.status != 'DELETED'"
        return self._all(sql + " ORDER BY m.created_at DESC", tuple(args))

    def review_memory(self, user_id: str, memory_id: str, approve: bool,
                      updated_content: Optional[str] = None) -> Dict[str, Any]:
        mem = self.get_memory(user_id, memory_id)
        # Only the workspace owner decides what becomes a permanent memory.
        self.require_role(user_id, mem["workspace_id"], "owner")
        if mem["status"] != "PROPOSED":
            raise Invalid(f"Memory is already {mem['status']}.")
        content = updated_content.strip()[:1000] if updated_content and updated_content.strip() else None
        self.kernel.review_memory(memory_id, approve=approve, updated_content=content)
        self.audit(mem["workspace_id"], user_id, "memory.approve" if approve else "memory.reject", "memory",
                   memory_id, {"edited": content is not None})
        self.conn.commit()
        return self.get_memory(user_id, memory_id)

    def forget_memory(self, user_id: str, memory_id: str) -> Dict[str, Any]:
        mem = self.get_memory(user_id, memory_id)
        self.require_role(user_id, mem["workspace_id"], "owner")
        self.conn.execute("UPDATE memory_records SET status = 'DELETED' WHERE id = ?", (memory_id,))
        self.audit(mem["workspace_id"], user_id, "memory.forget", "memory", memory_id)
        self.conn.commit()
        return self.get_memory(user_id, memory_id)

    def export_companion(self, user_id: str, workspace_id: str, companion_id: str) -> Dict[str, Any]:
        self._require_companion(user_id, workspace_id, companion_id, "owner")
        bundle = self.kernel.export_portable_bundle(companion_id)
        bundle["synthetic_demo_data"] = False
        bundle["exported_by"] = user_id
        bundle["memory_links"] = self._all(
            "SELECT * FROM memory_links WHERE companion_id = ? AND memory_id IN"
            " (SELECT id FROM memory_records WHERE status = 'APPROVED')",
            (companion_id,),
        )
        self.audit(workspace_id, user_id, "memory.export", "companion", companion_id)
        self.conn.commit()
        return bundle

    # ----------------------------------------------------- audit/export
    def list_audit(self, user_id: str, workspace_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        rows = self._all("SELECT * FROM audit_log WHERE workspace_id = ? ORDER BY id DESC LIMIT ?",
                         (workspace_id, int(limit)))
        for r in rows:
            r["detail"] = json.loads(r.pop("detail_json") or "{}")
        return rows

    def export_planner(self, user_id: str, workspace_id: str) -> Dict[str, Any]:
        self.require_role(user_id, workspace_id, "viewer")
        return {
            "schema": "journal_os.planner_export.v1",
            "exported_at": utc_now(),
            "events": self.list_events(user_id, workspace_id),
            "journal_entries": self.list_entries(user_id, workspace_id),
        }

    def import_planner(self, user_id: str, workspace_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        self.require_role(user_id, workspace_id, "editor")
        if data.get("schema") != "journal_os.planner_export.v1":
            raise Invalid("Unrecognised export file (expected journal_os.planner_export.v1).")
        id_map: Dict[str, str] = {}
        n_events = n_entries = 0
        for ev in data.get("events") or []:
            fields = {k: ev.get(k) for k in ("title", "start_at", "end_at", "kind", "recurrence", "calendar",
                                               "notes", "participants", "completed") if k in ev}
            created = self.create_event(user_id, workspace_id, fields, via="import")
            id_map[str(ev.get("id"))] = created["id"]
            n_events += 1
        for en in data.get("journal_entries") or []:
            fields = {"title": en.get("title"), "body": en.get("body"), "tags": en.get("tags") or [],
                      "event_id": id_map.get(str(en.get("event_id"))) if en.get("event_id") else None}
            self.create_entry(user_id, workspace_id, fields, via="import")
            n_entries += 1
        return {"imported_events": n_events, "imported_entries": n_entries}


def _expand(row: Dict[str, Any], lo: dt.datetime, hi: dt.datetime) -> List[Dict[str, Any]]:
    """Expand recurring events into occurrences inside [lo, hi)."""
    start = parse_local(row["start_at"])
    end = parse_local(row["end_at"])
    if row["recurrence"] == "none":
        return [row] if start < hi and end > lo else []
    step = dt.timedelta(days=1 if row["recurrence"] == "daily" else 7)
    out = []
    if start < lo:
        skips = max(0, (lo - start) // step - 1)
        start += step * skips
        end += step * skips
    count = 0
    while start < hi and count < 400:
        if end > lo:
            occ = dict(row)
            occ["start_at"], occ["end_at"] = fmt_local(start), fmt_local(end)
            occ["occurrence_of"] = row["id"]
            out.append(occ)
        start += step
        end += step
        count += 1
    return out
