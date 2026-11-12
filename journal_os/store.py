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
import re
import secrets
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from journal_os import interpreter
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

# --------------------------------------------------------------- agent harness
CHANNEL_TYPES = ("public", "private", "dm", "agent-room")
OPEN_CHANNEL_TYPES = ("public", "agent-room")  # every workspace member can see and join these
MEMBER_TYPES = ("human", "agent", "companion")
CHANNEL_ROLES = ("owner", "member", "observer")  # observers read but never post
AGENT_STATUSES = ("active", "paused", "archived")
APPROVAL_STATUSES = ("pending", "approved", "rejected", "failed")
MAX_AGENT_HOP = 4      # agent replies to agent replies stop at this depth
MAX_TOOL_CALLS = 5     # per agent message
# Tool -> resource the agent needs a 'propose' grant on. A tool call only ever
# creates a pending approval; a person decides whether it runs.
AGENT_TOOLS = {
    "create_event": "planner",
    "update_event": "planner",
    "delete_event": "planner",
    "create_journal_entry": "journal",
    "propose_memory": "memory",
    "schedule_companion_activity": "companion_calendar",
    "post_message": "channels",
}
PROPOSAL_TOOLS = interpreter.ACTIONS  # these run through ActionService's existing executor
AGENT_RESOURCES = tuple(sorted(set(AGENT_TOOLS.values())))
DEFAULT_AGENT_RESOURCES = ("channels", "journal", "memory", "planner")
TOOL_VERBS = {
    "create_event": "add an event",
    "update_event": "change an event",
    "delete_event": "delete an event",
    "create_journal_entry": "write a journal entry",
    "propose_memory": "propose a memory",
    "schedule_companion_activity": "schedule a companion activity",
    "post_message": "post in another channel",
}
_SLUG_RE = re.compile(r"[^a-z0-9_-]+")
_MENTION_RE = re.compile(r"(?<![\w@])@([A-Za-z0-9_-]{1,32})")
_MODEL_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,80}$")


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


def _slug(value: Any, what: str = "Name", limit: int = 40) -> str:
    slug = _SLUG_RE.sub("-", str(value or "").strip().lower()).strip("-")[:limit]
    if not slug:
        raise Invalid(f"{what} needs at least one letter or digit.")
    return slug


def _clean_memory_path(value: Any, agent_id: str) -> str:
    """A relative .md path under the data folder. Never absolute, never '..'."""
    raw = str(value or f"agents/{agent_id}/MEMORY.md").strip().replace("\\", "/")
    path = pathlib.PurePosixPath(raw)
    if (path.is_absolute() or raw.startswith("~") or ".." in path.parts or path.suffix != ".md"
            or len(raw) > 200):
        raise Invalid("memory_path must be a relative .md path inside the data folder.")
    return str(path)


def _tool_summary(agent_name: Optional[str], tool: str, tool_input: Dict[str, Any]) -> str:
    detail = str(tool_input.get("title") or tool_input.get("content") or tool_input.get("event_id") or "")
    detail = " ".join(detail.split())
    text = f"{agent_name or 'An agent'} wants to {TOOL_VERBS.get(tool, tool)}"
    return text + (f": “{detail[:80]}”" if detail else "")


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

    def _insert_proposal(self, proposal: Dict[str, Any]) -> None:
        """Shared by typed requests (ActionService.propose) and agent tool calls."""
        self.conn.execute(
            "INSERT INTO action_proposals (id, workspace_id, user_id, source, input_text, action, payload_json,"
            " summary, status, created_at) VALUES (:id, :workspace_id, :user_id, :source, :input_text, :action,"
            " :payload_json, :summary, :status, :created_at)",
            proposal,
        )

    # ======================================================= agent harness
    # Slack-style channels for people, agents and companions. Every method
    # checks workspace role and channel visibility. Agents can post text, but
    # each tool call they make is stored as a pending approval and does
    # nothing until a person decides it (ActionService.decide_tool_call).

    # ----------------------------------------------------------- channels
    def _membership(self, channel_id: str, member_id: str) -> Optional[Dict[str, Any]]:
        return self._one("SELECT * FROM channel_members WHERE channel_id = ? AND member_id = ?",
                         (channel_id, member_id))

    def _require_channel(self, user_id: str, channel_id: str, minimum: str = "viewer") -> Dict[str, Any]:
        ch = self._one("SELECT * FROM channels WHERE id = ?", (channel_id,))
        if not ch:
            raise NotFound("Channel not found.")
        self.require_role(user_id, ch["workspace_id"], minimum)
        if ch["type"] not in OPEN_CHANNEL_TYPES and not self._membership(channel_id, user_id):
            # Private channels and DMs stay invisible to non-members.
            raise NotFound("Channel not found.")
        return ch

    def _require_channel_admin(self, user_id: str, ch: Dict[str, Any]) -> None:
        role = self.require_role(user_id, ch["workspace_id"], "editor")
        member = self._membership(ch["id"], user_id)
        if role != "owner" and not (member and member["role"] == "owner"):
            raise Forbidden("Only the channel owner or the workspace owner can do that.")

    def _add_member_row(self, channel_id: str, member_id: str, member_type: str, role: str) -> None:
        self.conn.execute(
            "INSERT INTO channel_members VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT(channel_id, member_id) DO UPDATE SET role = excluded.role",
            (channel_id, member_id, member_type, role, utc_now()),
        )

    def _member_name(self, member_id: str, member_type: str) -> str:
        if member_type == "system":
            return "Journal OS"
        table, column = {"human": ("users", "display_name"), "agent": ("agents", "name"),
                         "companion": ("companions", "name")}[member_type]
        row = self._one(f"SELECT {column} AS name FROM {table} WHERE id = ?", (member_id,))
        return row["name"] if row else member_id

    def _member_in_workspace(self, workspace_id: str, member_id: str, member_type: str) -> str:
        """Return the member's display name, or raise if they aren't in this workspace."""
        if member_type == "human":
            row = self._one("SELECT u.display_name AS name FROM users u JOIN workspace_memberships m"
                            " ON m.user_id = u.id WHERE m.workspace_id = ? AND u.id = ?", (workspace_id, member_id))
        elif member_type == "agent":
            row = self._one("SELECT name FROM agents WHERE workspace_id = ? AND id = ? AND status != 'archived'",
                            (workspace_id, member_id))
        elif member_type == "companion":
            row = self._one("SELECT c.name FROM companions c JOIN workspace_companions wc ON wc.companion_id = c.id"
                            " WHERE wc.workspace_id = ? AND c.id = ?", (workspace_id, member_id))
        else:
            raise Invalid(f"member_type must be one of {MEMBER_TYPES}")
        if not row:
            raise NotFound("That member is not part of this workspace.")
        return row["name"]

    def _channel_out(self, ch: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        out = dict(ch)
        out["member_count"] = self._one("SELECT COUNT(*) AS n FROM channel_members WHERE channel_id = ?",
                                        (ch["id"],))["n"]
        out["is_member"] = bool(self._membership(ch["id"], user_id))
        return out

    def _insert_channel(self, user_id: str, workspace_id: str, name: str, ctype: str, description: str,
                        instructions: str) -> str:
        channel_id = _id("chn")
        self.conn.execute(
            "INSERT INTO channels (id, workspace_id, name, description, type, instructions, created_by, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (channel_id, workspace_id, name, str(description or "").strip()[:300], ctype,
             str(instructions or "").strip()[:4000], user_id, utc_now()),
        )
        self._add_member_row(channel_id, user_id, "human", "owner")
        self.audit(workspace_id, user_id, "channel.create", "channel", channel_id, {"name": name, "type": ctype})
        return channel_id

    def create_channel(self, user_id: str, workspace_id: str, name: str, type: str = "public",
                       description: str = "", instructions: str = "") -> Dict[str, Any]:
        self.require_role(user_id, workspace_id, "editor")
        if type not in CHANNEL_TYPES:
            raise Invalid(f"type must be one of {CHANNEL_TYPES}")
        if type == "dm":
            raise Invalid("Use open_dm to start a direct message.")
        slug = _slug(name, "Channel name")
        if slug.startswith("dm-"):
            raise Invalid("Channel names starting with 'dm-' are reserved for direct messages.")
        if self._one("SELECT 1 FROM channels WHERE workspace_id = ? AND name = ?", (workspace_id, slug)):
            raise Invalid(f"#{slug} already exists.")
        channel_id = self._insert_channel(user_id, workspace_id, slug, type, description, instructions)
        self.conn.commit()
        return self.get_channel(user_id, channel_id)

    def open_dm(self, user_id: str, workspace_id: str, member_id: str, member_type: str) -> Dict[str, Any]:
        """Direct message between the caller and one person, agent or companion. Reuses an existing DM."""
        self.require_role(user_id, workspace_id, "editor")
        if member_id == user_id:
            raise Invalid("Pick someone other than yourself.")
        self._member_in_workspace(workspace_id, member_id, member_type)
        name = "dm-" + hashlib.sha256("|".join(sorted([user_id, member_id])).encode("utf-8")).hexdigest()[:12]
        existing = self._one("SELECT id FROM channels WHERE workspace_id = ? AND name = ?", (workspace_id, name))
        if existing:
            return self.get_channel(user_id, existing["id"])
        channel_id = self._insert_channel(user_id, workspace_id, name, "dm", "", "")
        self._add_member_row(channel_id, member_id, member_type, "member")
        self.conn.commit()
        return self.get_channel(user_id, channel_id)

    def get_channel(self, user_id: str, channel_id: str) -> Dict[str, Any]:
        out = self._channel_out(self._require_channel(user_id, channel_id), user_id)
        out["members"] = self.list_channel_members(user_id, channel_id)
        return out

    def list_channels(self, user_id: str, workspace_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        sql = ("SELECT c.* FROM channels c WHERE c.workspace_id = ? AND (c.type IN ('public', 'agent-room')"
               " OR EXISTS (SELECT 1 FROM channel_members m WHERE m.channel_id = c.id AND m.member_id = ?))")
        if not include_archived:
            sql += " AND c.archived_at IS NULL"
        rows = self._all(sql + " ORDER BY c.type = 'dm', c.name", (workspace_id, user_id))
        return [self._channel_out(r, user_id) for r in rows]

    def archive_channel(self, user_id: str, channel_id: str) -> Dict[str, Any]:
        ch = self._require_channel(user_id, channel_id, "editor")
        self._require_channel_admin(user_id, ch)
        if not ch["archived_at"]:
            self.conn.execute("UPDATE channels SET archived_at = ? WHERE id = ?", (utc_now(), channel_id))
            self.audit(ch["workspace_id"], user_id, "channel.archive", "channel", channel_id)
            self.conn.commit()
        return self.get_channel(user_id, channel_id)

    def add_channel_member(self, user_id: str, channel_id: str, member_id: str, member_type: str,
                           role: str = "member") -> Dict[str, Any]:
        ch = self._require_channel(user_id, channel_id, "editor")
        if ch["archived_at"]:
            raise Invalid("Channel is archived.")
        if ch["type"] == "dm":
            raise Invalid("Direct messages have exactly two members.")
        if role not in CHANNEL_ROLES:
            raise Invalid(f"role must be one of {CHANNEL_ROLES}")
        name = self._member_in_workspace(ch["workspace_id"], member_id, member_type)
        existing = self._membership(channel_id, member_id)
        if existing and existing["member_type"] != member_type:
            raise Invalid("member_type does not match the existing membership.")
        if role == "owner":
            if member_type != "human":
                raise Invalid("Only people can own a channel.")
            self._require_channel_admin(user_id, ch)
        elif existing and existing["role"] == "owner":
            self._require_channel_admin(user_id, ch)
        self._add_member_row(channel_id, member_id, member_type, role)
        self.audit(ch["workspace_id"], user_id, "channel.member_add", "channel", channel_id,
                   {"member_id": member_id, "member_type": member_type, "role": role})
        self.conn.commit()
        return {"channel_id": channel_id, "member_id": member_id, "member_type": member_type, "role": role,
                "name": name}

    def remove_channel_member(self, user_id: str, channel_id: str, member_id: str) -> Dict[str, Any]:
        ch = self._require_channel(user_id, channel_id, "editor")
        target = self._membership(channel_id, member_id)
        if not target:
            raise NotFound("Not a member of this channel.")
        if member_id != user_id:
            self._require_channel_admin(user_id, ch)
        if target["role"] == "owner":
            owners = self._one("SELECT COUNT(*) AS n FROM channel_members WHERE channel_id = ? AND role = 'owner'",
                               (channel_id,))["n"]
            if owners <= 1:
                raise Invalid("A channel needs at least one owner.")
        self.conn.execute("DELETE FROM channel_members WHERE channel_id = ? AND member_id = ?", (channel_id, member_id))
        self.audit(ch["workspace_id"], user_id, "channel.member_remove", "channel", channel_id, {"member_id": member_id})
        self.conn.commit()
        return {"channel_id": channel_id, "removed": member_id}

    def list_channel_members(self, user_id: str, channel_id: str) -> List[Dict[str, Any]]:
        self._require_channel(user_id, channel_id)
        rows = self._all("SELECT * FROM channel_members WHERE channel_id = ? ORDER BY joined_at, member_id",
                         (channel_id,))
        for r in rows:
            r["name"] = self._member_name(r["member_id"], r["member_type"])
        return rows

    # ------------------------------------------------------------- agents
    @staticmethod
    def _check_resources(resources: Any) -> List[str]:
        if isinstance(resources, str) or not isinstance(resources, (list, tuple)):
            raise Invalid("resources must be a list.")
        bad = set(resources) - set(AGENT_RESOURCES)
        if bad:
            raise Invalid(f"Unknown resources {sorted(bad)}; choose from {AGENT_RESOURCES}.")
        return sorted(set(resources))

    def _clean_agent(self, workspace_id: str, data: Dict[str, Any], agent_id: str,
                     partial: bool = False) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        if "name" in data or not partial:
            name = str(data.get("name") or "").strip()
            if not name:
                raise Invalid("Agent name is required.")
            out["name"] = name[:40]
        if "handle" in data or not partial:
            handle = _slug(data.get("handle") or out.get("name"), "Handle", limit=32)
            clash = self._one("SELECT id FROM agents WHERE workspace_id = ? AND handle = ?", (workspace_id, handle))
            if clash and clash["id"] != agent_id:
                raise Invalid(f"@{handle} is already taken in this workspace.")
            out["handle"] = handle
        for key, limit in (("role", 120), ("system_prompt", 8000)):
            if key in data or not partial:
                out[key] = str(data.get(key) or "").strip()[:limit]
        if "model" in data or not partial:
            model = str(data.get("model") or "none").strip()
            if not _MODEL_RE.match(model):
                raise Invalid("model must be a provider/model id such as 'claude-sonnet-5-5', or 'none'.")
            out["model"] = model
        if "status" in data or not partial:
            status = data.get("status") or "active"
            if status not in AGENT_STATUSES:
                raise Invalid(f"status must be one of {AGENT_STATUSES}")
            out["status"] = status
        if "monthly_budget_usd" in data or not partial:
            try:
                budget = round(float(data.get("monthly_budget_usd") or 0), 2)
            except (TypeError, ValueError):
                raise Invalid("monthly_budget_usd must be a number.")
            if not 0 <= budget <= 10000:  # also rejects NaN and infinity
                raise Invalid("monthly_budget_usd must be between 0 and 10000.")
            out["monthly_budget_usd"] = budget
        if "companion_id" in data or not partial:
            companion_id = data.get("companion_id") or None
            if companion_id and not self._one("SELECT 1 FROM workspace_companions WHERE workspace_id = ?"
                                              " AND companion_id = ?", (workspace_id, companion_id)):
                raise Invalid("Linked companion must belong to this workspace.")
            out["companion_id"] = companion_id
        if "memory_path" in data or not partial:
            out["memory_path"] = _clean_memory_path(data.get("memory_path"), agent_id)
        return out

    def _agent_resources(self, workspace_id: str, agent_id: str) -> List[str]:
        rows = self._all("SELECT resource FROM access_grants WHERE workspace_id = ? AND grantee = ?"
                         " AND permission = 'propose' AND revoked_at IS NULL", (workspace_id, f"agent:{agent_id}"))
        return sorted({r["resource"] for r in rows})

    def _set_agent_resources(self, user_id: str, workspace_id: str, agent_id: str, wanted: List[str]) -> None:
        # Agents only ever get 'propose'. There is no code path that grants them 'write'.
        current = set(self._agent_resources(workspace_id, agent_id))
        now = utc_now()
        for resource in current - set(wanted):
            self.conn.execute("UPDATE access_grants SET revoked_at = ? WHERE workspace_id = ? AND grantee = ?"
                              " AND resource = ? AND revoked_at IS NULL",
                              (now, workspace_id, f"agent:{agent_id}", resource))
        for resource in set(wanted) - current:
            self.conn.execute("INSERT INTO access_grants VALUES (?, ?, ?, ?, 'propose', ?, ?, NULL)",
                              (_id("grant"), workspace_id, f"agent:{agent_id}", resource, user_id, now))

    def agent_may(self, workspace_id: str, agent_id: str, resource: str) -> bool:
        return bool(self._one(
            "SELECT 1 FROM access_grants WHERE workspace_id = ? AND grantee = ? AND resource = ?"
            " AND permission = 'propose' AND revoked_at IS NULL",
            (workspace_id, f"agent:{agent_id}", resource),
        ))

    def _agent_out(self, row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        out["resources"] = self._agent_resources(row["workspace_id"], row["id"])
        comp = self._one("SELECT name FROM companions WHERE id = ?", (row["companion_id"],)) if row["companion_id"] else None
        out["companion_name"] = comp["name"] if comp else None
        return out

    def create_agent(self, user_id: str, workspace_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        # Agents can ask to change workspace data, so only the owner creates them.
        self.require_role(user_id, workspace_id, "owner")
        agent_id = _id("agt")
        clean = self._clean_agent(workspace_id, data, agent_id)
        resources = self._check_resources(data.get("resources", DEFAULT_AGENT_RESOURCES))
        now = utc_now()
        row = {"id": agent_id, "workspace_id": workspace_id, "owner_id": user_id, "created_at": now,
               "updated_at": now, **clean}
        self.conn.execute(
            "INSERT INTO agents (id, workspace_id, name, handle, role, system_prompt, model, owner_id, companion_id,"
            " status, memory_path, monthly_budget_usd, created_at, updated_at) VALUES (:id, :workspace_id, :name,"
            " :handle, :role, :system_prompt, :model, :owner_id, :companion_id, :status, :memory_path,"
            " :monthly_budget_usd, :created_at, :updated_at)",
            row,
        )
        self._set_agent_resources(user_id, workspace_id, agent_id, resources)
        self.audit(workspace_id, user_id, "agent.create", "agent", agent_id,
                   {"name": row["name"], "model": row["model"], "resources": resources})
        self.conn.commit()
        return self.get_agent(user_id, agent_id)

    def get_agent(self, user_id: str, agent_id: str) -> Dict[str, Any]:
        row = self._one("SELECT * FROM agents WHERE id = ?", (agent_id,))
        if not row:
            raise NotFound("Agent not found.")
        self.require_role(user_id, row["workspace_id"], "viewer")
        return self._agent_out(row)

    def list_agents(self, user_id: str, workspace_id: str, include_archived: bool = False) -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        sql = "SELECT * FROM agents WHERE workspace_id = ?"
        if not include_archived:
            sql += " AND status != 'archived'"
        return [self._agent_out(r) for r in self._all(sql + " ORDER BY name", (workspace_id,))]

    def update_agent(self, user_id: str, agent_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_agent(user_id, agent_id)
        ws = current["workspace_id"]
        self.require_role(user_id, ws, "owner")
        resources = self._check_resources(data["resources"]) if "resources" in data else None
        clean = self._clean_agent(ws, {k: v for k, v in data.items() if k != "resources"}, agent_id, partial=True)
        if clean:
            clean["updated_at"] = utc_now()
            sets = ", ".join(f"{k} = :{k}" for k in clean)
            self.conn.execute(f"UPDATE agents SET {sets} WHERE id = :id", {**clean, "id": agent_id})
        if resources is not None:
            self._set_agent_resources(user_id, ws, agent_id, resources)
        if clean or resources is not None:
            fields = sorted(k for k in clean if k != "updated_at") + (["resources"] if resources is not None else [])
            self.audit(ws, user_id, "agent.update", "agent", agent_id, {"fields": fields})
            self.conn.commit()
        return self.get_agent(user_id, agent_id)

    def render_agent_memory(self, user_id: str, agent_id: str) -> Dict[str, Any]:
        """Readable MEMORY.md for an agent, rebuilt from the approved memory ledger.

        A runtime may write it to `memory_path` and load it into the agent's
        context. It is an export only: nothing reads the file back, so editing
        it cannot change what the agent remembers.
        """
        agent = self.get_agent(user_id, agent_id)
        lines = [f"# {agent['name']} — memory", "",
                 "Generated from the Journal OS memory ledger. Edits to this file are not read back.", "",
                 f"Role: {agent['role'] or '(none set)'}"]
        if agent["companion_id"]:
            memories = self.list_memories(user_id, agent["workspace_id"], companion_id=agent["companion_id"],
                                          status="APPROVED")
            lines += ["", f"## Approved memories (ledger: {agent['companion_name']})", ""]
            lines += [f"- [{m['category']}] {m['content']}" for m in memories] or ["- (none yet)"]
        else:
            lines += ["", "No companion ledger is linked, so this agent keeps no memories."]
        return {"agent_id": agent_id, "path": agent["memory_path"], "markdown": "\n".join(lines) + "\n"}

    def bootstrap_harness(self, user_id: str, workspace_id: str) -> Dict[str, Any]:
        """Idempotently create #general and a PATCH agent tied to the PATCH companion's ledger."""
        self.require_role(user_id, workspace_id, "owner")
        ch = self._one("SELECT id FROM channels WHERE workspace_id = ? AND name = 'general'", (workspace_id,))
        channel_id = ch["id"] if ch else self.create_channel(
            user_id, workspace_id, "general", "public", "Everyone in this workspace: people and agents.")["id"]
        agent = self._one("SELECT id FROM agents WHERE workspace_id = ? AND handle = 'patch'", (workspace_id,))
        if agent:
            agent_id = agent["id"]
        else:
            comp = self.find_companion(workspace_id, "PATCH")
            lore = dict(DEFAULT_COMPANIONS)["PATCH"]
            agent_id = self.create_agent(user_id, workspace_id, {
                "name": "PATCH", "handle": "patch", "role": "Maker companion: plans build sessions, keeps the build log.",
                "system_prompt": lore + " You can propose planner, journal and memory changes; a person approves each one.",
                "companion_id": comp["id"] if comp else None,
            })["id"]
        if not self._membership(channel_id, agent_id):
            self.add_channel_member(user_id, channel_id, agent_id, "agent")
        return {"channel": self.get_channel(user_id, channel_id), "agent": self.get_agent(user_id, agent_id)}

    # ----------------------------------------------------------- messages
    def _message_out(self, row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        out["mentions"] = json.loads(out.pop("mentions_json") or "[]")
        out["tool_calls"] = json.loads(out.pop("tool_calls_json") or "[]")
        out["author_name"] = self._member_name(out["author_id"], out["author_type"])
        if out["thread_id"] is None:
            out["reply_count"] = self._one("SELECT COUNT(*) AS n FROM messages WHERE thread_id = ?", (out["id"],))["n"]
        return out

    def _thread_root(self, channel_id: str, thread_id: Optional[str]) -> Optional[str]:
        if not thread_id:
            return None
        root = self._one("SELECT id, channel_id, thread_id FROM messages WHERE id = ?", (thread_id,))
        if not root or root["channel_id"] != channel_id:
            raise Invalid("thread_id must be a message in the same channel.")
        return root["thread_id"] or root["id"]  # replying to a reply joins the same thread

    def _mentions(self, channel_id: str, content: str) -> List[str]:
        """Ids of active agents in this channel that the text @mentions, in order of appearance."""
        order: List[str] = []
        for handle in _MENTION_RE.findall(content):
            if handle.lower() not in order:
                order.append(handle.lower())
        if not order:
            return []
        rows = self._all("SELECT a.id, a.handle FROM agents a JOIN channel_members m ON m.member_id = a.id"
                         " WHERE m.channel_id = ? AND a.status = 'active'", (channel_id,))
        by_handle = {r["handle"]: r["id"] for r in rows}
        return [by_handle[h] for h in order if h in by_handle]

    def _insert_message(self, row: Dict[str, Any]) -> None:
        self.conn.execute(
            "INSERT INTO messages (id, workspace_id, channel_id, thread_id, author_id, author_type, content,"
            " mentions_json, tool_calls_json, approval_status, hop, created_at) VALUES (:id, :workspace_id,"
            " :channel_id, :thread_id, :author_id, :author_type, :content, :mentions_json, :tool_calls_json,"
            " :approval_status, :hop, :created_at)",
            row,
        )

    def post_message(self, user_id: str, channel_id: str, content: str,
                     thread_id: Optional[str] = None) -> Dict[str, Any]:
        """A person posts. Posting in a public or agent-room channel joins it."""
        ch = self._require_channel(user_id, channel_id, "editor")
        if ch["archived_at"]:
            raise Invalid("Channel is archived.")
        content = str(content or "").strip()
        if not content:
            raise Invalid("Message is empty.")
        root = self._thread_root(channel_id, thread_id)
        member = self._membership(channel_id, user_id)
        if member and member["role"] == "observer":
            raise Forbidden("Observers can read this channel but not post.")
        if not member:
            self._add_member_row(channel_id, user_id, "human", "member")
        row = {"id": _id("msg"), "workspace_id": ch["workspace_id"], "channel_id": channel_id, "thread_id": root,
               "author_id": user_id, "author_type": "human", "content": content[:8000],
               "mentions_json": json.dumps(self._mentions(channel_id, content)), "tool_calls_json": "[]",
               "approval_status": "none", "hop": 0, "created_at": utc_now()}
        self._insert_message(row)
        self.audit(ch["workspace_id"], user_id, "message.post", "message", row["id"],
                   {"channel_id": channel_id, "author_type": "human"})
        self.conn.commit()
        return self.get_message(user_id, row["id"])

    def _check_post_tool(self, user_id: str, agent: Dict[str, Any], tool_input: Dict[str, Any]) -> Dict[str, Any]:
        extra = set(tool_input) - {"channel_id", "content", "thread_id"}
        if extra:
            raise Invalid(f"Unexpected fields for post_message: {sorted(extra)}")
        target = self._require_channel(user_id, str(tool_input.get("channel_id") or ""), "editor")
        if target["workspace_id"] != agent["workspace_id"] or target["archived_at"]:
            raise Invalid("Target channel is not available.")
        member = self._membership(target["id"], agent["id"])
        if not member or member["role"] == "observer":
            raise Forbidden(f"{agent['name']} is not a posting member of #{target['name']}.")
        content = str(tool_input.get("content") or "").strip()
        if not content:
            raise Invalid("post_message needs content.")
        out = {"channel_id": target["id"], "content": content[:8000]}
        root = self._thread_root(target["id"], tool_input.get("thread_id"))
        if root:
            out["thread_id"] = root
        return out

    def _check_tool_calls(self, user_id: str, agent: Dict[str, Any], tool_calls: Any) -> List[Dict[str, Any]]:
        """Whitelist, permission and shape checks. Runs before anything is written."""
        if not isinstance(tool_calls, list):
            raise Invalid("tool_calls must be a list.")
        if len(tool_calls) > MAX_TOOL_CALLS:
            raise Invalid(f"At most {MAX_TOOL_CALLS} tool calls per message.")
        ws = agent["workspace_id"]
        checked = []
        for call in tool_calls:
            if not isinstance(call, dict) or not isinstance(call.get("input", {}), dict):
                raise Invalid("Each tool call needs a 'tool' name and an 'input' object.")
            tool, tool_input = call.get("tool"), dict(call.get("input") or {})
            if tool not in AGENT_TOOLS:
                raise Invalid(f"Tool '{tool}' is not available to agents.")
            if not self.agent_may(ws, agent["id"], AGENT_TOOLS[tool]):
                raise Forbidden(f"{agent['name']} is not allowed to propose {AGENT_TOOLS[tool]} changes.")
            if tool == "post_message":
                checked.append({"tool": tool, "input": self._check_post_tool(user_id, agent, tool_input)})
                continue
            if tool == "propose_memory":
                if not agent["companion_id"]:
                    raise Forbidden(f"{agent['name']} has no companion memory ledger to propose to.")
                if tool_input.get("companion_id") not in (None, agent["companion_id"]):
                    raise Forbidden("Agents can only propose memories to their own companion's ledger.")
                tool_input["companion_id"] = agent["companion_id"]
            try:
                interpreter.validate_action(tool, tool_input)
            except ValueError as exc:
                raise Invalid(str(exc)) from exc
            if tool_input.get("event_id"):
                ev = self._one("SELECT workspace_id FROM events WHERE id = ?", (tool_input["event_id"],))
                if not ev or ev["workspace_id"] != ws:
                    raise Invalid("event_id is not an event in this workspace.")
            checked.append({"tool": tool, "input": tool_input})
        return checked

    def post_agent_message(self, user_id: str, agent_id: str, channel_id: str, content: str = "",
                           tool_calls: Optional[List[Dict[str, Any]]] = None, thread_id: Optional[str] = None,
                           trigger_message_id: Optional[str] = None) -> Dict[str, Any]:
        """An agent posts, acting for the signed-in person whose message woke it.

        The text is stored as written. Each tool call becomes a pending
        approval (plus a PENDING action_proposals row for planner, journal and
        memory tools); none of them runs here.
        """
        ch = self._require_channel(user_id, channel_id, "editor")
        if ch["archived_at"]:
            raise Invalid("Channel is archived.")
        agent = self.get_agent(user_id, agent_id)
        ws = ch["workspace_id"]
        if agent["workspace_id"] != ws:
            raise Forbidden("Agent belongs to another workspace.")
        if agent["status"] != "active":
            raise Forbidden(f"{agent['name']} is {agent['status']}.")
        member = self._membership(channel_id, agent_id)
        if not member or member["role"] == "observer":
            raise Forbidden(f"{agent['name']} is not a posting member of #{ch['name']}.")
        hop = 1
        if trigger_message_id:
            trigger = self._one("SELECT workspace_id, hop FROM messages WHERE id = ?", (trigger_message_id,))
            if not trigger or trigger["workspace_id"] != ws:
                raise NotFound("Trigger message not found.")
            hop = trigger["hop"] + 1
        if hop > MAX_AGENT_HOP:
            raise Invalid(f"Agent reply chain stopped after {MAX_AGENT_HOP} hops.")
        content = str(content or "").strip()[:8000]
        calls = self._check_tool_calls(user_id, agent, tool_calls or [])
        if not content and not calls:
            raise Invalid("An agent message needs text or a tool call.")
        root = self._thread_root(channel_id, thread_id)

        # Everything is validated; now write message, proposals and approvals together.
        now = utc_now()
        msg_id = _id("msg")
        recorded, rows_to_write = [], []
        for call in calls:
            summary = _tool_summary(agent["name"], call["tool"], call["input"])
            proposal_id = None
            if call["tool"] in PROPOSAL_TOOLS:
                proposal_id = _id("act")
                rows_to_write.append(("proposal", {
                    "id": proposal_id, "workspace_id": ws, "user_id": user_id, "source": f"agent:{agent_id}",
                    "input_text": (content or summary)[:500], "action": call["tool"],
                    "payload_json": json.dumps(call["input"]), "summary": summary, "status": "PENDING",
                    "created_at": now}))
            approval_id = _id("apv")
            rows_to_write.append(("approval", (approval_id, ws, msg_id, agent_id, call["tool"],
                                               json.dumps(call["input"]), proposal_id, now)))
            recorded.append({"tool": call["tool"], "input": call["input"], "approval_id": approval_id,
                             "summary": summary})
        self._insert_message({
            "id": msg_id, "workspace_id": ws, "channel_id": channel_id, "thread_id": root, "author_id": agent_id,
            "author_type": "agent", "content": content, "mentions_json": json.dumps(self._mentions(channel_id, content)),
            "tool_calls_json": json.dumps(recorded), "approval_status": "pending" if recorded else "none",
            "hop": hop, "created_at": now,
        })
        for kind, values in rows_to_write:
            if kind == "proposal":
                self._insert_proposal(values)
            else:
                self.conn.execute(
                    "INSERT INTO approvals (id, workspace_id, message_id, agent_id, tool_name, tool_input_json,"
                    " proposal_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)", values)
        self.audit(ws, user_id, "message.post", "message", msg_id,
                   {"channel_id": channel_id, "author_type": "agent", "agent_id": agent_id, "tool_calls": len(recorded)})
        for call in recorded:
            self.audit(ws, user_id, "approval.request", "approval", call["approval_id"],
                       {"agent_id": agent_id, "tool": call["tool"]})
        self.conn.commit()
        return self.get_message(user_id, msg_id)

    def get_message(self, user_id: str, message_id: str) -> Dict[str, Any]:
        row = self._one("SELECT * FROM messages WHERE id = ?", (message_id,))
        if not row:
            raise NotFound("Message not found.")
        self._require_channel(user_id, row["channel_id"])
        return self._message_out(row)

    def list_messages(self, user_id: str, channel_id: str, thread_id: Optional[str] = None,
                      limit: int = 100) -> List[Dict[str, Any]]:
        """Top-level messages (oldest first, newest `limit`), or one thread: root + replies."""
        self._require_channel(user_id, channel_id)
        limit = max(1, min(int(limit), 500))
        if thread_id:
            root = self._thread_root(channel_id, thread_id)
            rows = self._all("SELECT * FROM messages WHERE id = ? OR thread_id = ? ORDER BY created_at, rowid",
                             (root, root))
        else:
            rows = self._all("SELECT * FROM (SELECT *, rowid AS rid FROM messages WHERE channel_id = ? AND thread_id"
                             " IS NULL ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at, rid",
                             (channel_id, limit))
            for r in rows:
                r.pop("rid", None)
        return [self._message_out(r) for r in rows]

    # ---------------------------------------------------------- approvals
    def _approval_out(self, row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        out["tool_input"] = json.loads(out.pop("tool_input_json"))
        out["result"] = json.loads(out.pop("result_json")) if out.get("result_json") else None
        agent = self._one("SELECT name FROM agents WHERE id = ?", (row["agent_id"],))
        out["agent_name"] = agent["name"] if agent else None
        msg = self._one("SELECT channel_id FROM messages WHERE id = ?", (row["message_id"],))
        out["channel_id"] = msg["channel_id"] if msg else None
        out["summary"] = _tool_summary(out["agent_name"], out["tool_name"], out["tool_input"])
        return out

    def get_approval(self, user_id: str, approval_id: str) -> Dict[str, Any]:
        row = self._one("SELECT * FROM approvals WHERE id = ?", (approval_id,))
        if not row:
            raise NotFound("Approval not found.")
        msg = self._one("SELECT channel_id FROM messages WHERE id = ?", (row["message_id"],))
        self._require_channel(user_id, msg["channel_id"])
        return self._approval_out(row)

    def list_approvals(self, user_id: str, workspace_id: str, status: Optional[str] = "pending") -> List[Dict[str, Any]]:
        self.require_role(user_id, workspace_id, "viewer")
        sql = ("SELECT a.* FROM approvals a JOIN messages m ON m.id = a.message_id JOIN channels c ON c.id = m.channel_id"
               " WHERE a.workspace_id = ? AND (c.type IN ('public', 'agent-room') OR EXISTS (SELECT 1 FROM"
               " channel_members cm WHERE cm.channel_id = c.id AND cm.member_id = ?))")
        args: List[Any] = [workspace_id, user_id]
        if status:
            if status not in APPROVAL_STATUSES:
                raise Invalid(f"status must be one of {APPROVAL_STATUSES}")
            sql += " AND a.status = ?"
            args.append(status)
        return [self._approval_out(r) for r in self._all(sql + " ORDER BY a.created_at, a.rowid", tuple(args))]

    def require_approver(self, user_id: str, approval: Dict[str, Any]) -> None:
        """Only the workspace owner or the agent's owner decides an agent's tool call."""
        role = self.require_role(user_id, approval["workspace_id"], "editor")
        agent = self._one("SELECT owner_id FROM agents WHERE id = ?", (approval["agent_id"],))
        if role != "owner" and (not agent or agent["owner_id"] != user_id):
            raise Forbidden("Only the workspace owner or this agent's owner can decide its requests.")

    def finish_approval(self, approval_id: str, status: str, decided_by: str,
                        result: Optional[Dict[str, Any]] = None,
                        final_input: Optional[Dict[str, Any]] = None) -> None:
        """Record a decision. Call through ActionService.decide_tool_call, which runs the tool first."""
        if status not in ("approved", "rejected", "failed"):
            raise Invalid("status must be approved, rejected or failed")
        row = self._one("SELECT workspace_id, message_id, tool_input_json FROM approvals WHERE id = ?"
                        " AND status = 'pending'", (approval_id,))
        if not row:
            raise Invalid("Approval is no longer pending.")
        self.conn.execute(
            "UPDATE approvals SET status = ?, result_json = ?, decided_by = ?, decided_at = ?, tool_input_json = ?"
            " WHERE id = ?",
            (status, json.dumps(result) if result is not None else None, decided_by, utc_now(),
             json.dumps(final_input) if final_input is not None else row["tool_input_json"], approval_id),
        )
        statuses = [r["status"] for r in self._all("SELECT status FROM approvals WHERE message_id = ?",
                                                   (row["message_id"],))]
        if "pending" in statuses:
            summary = "pending"
        elif all(s == "approved" for s in statuses):
            summary = "approved"
        elif all(s == "rejected" for s in statuses):
            summary = "rejected"
        else:
            summary = "mixed"
        self.conn.execute("UPDATE messages SET approval_status = ? WHERE id = ?", (summary, row["message_id"]))
        self.audit(row["workspace_id"], decided_by, f"approval.{status}", "approval", approval_id)
        self.conn.commit()


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
