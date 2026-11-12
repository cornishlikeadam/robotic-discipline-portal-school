#!/usr/bin/env python3
"""Journal OS HTTP application + local server.

Run locally (durable SQLite file in ./data):
    python3 -m journal_os.server --port 8090
    open http://127.0.0.1:8090/os/

The local server also forwards every non-Journal-OS path to the existing
Portal School gateway (api/index.py), so /studio, /zine, /gamified keep working.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import pathlib
import re
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional, Tuple

from journal_os import harness
from journal_os.automations import AutomationService
from journal_os.actions import ActionService, run_sandbox_activity
from journal_os.registry import APP_REGISTRY
from journal_os.store import AuthError, Forbidden, Invalid, JournalStore, NotFound

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC_DIR = REPO_ROOT / "os"
JSON = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}
SSE = {"Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no"}
STREAM_PATH = re.compile(r"/api/os/w/([\w-]+)/stream")
STREAM_SECONDS = 25        # local server holds a stream open this long, then the client reconnects
STREAM_POLL_SECONDS = 0.5  # how often an open stream checks the change feed
AUTOMATION_TICK_SECONDS = 30  # local server: how often to look for due automations

Response = Tuple[int, Dict[str, str], str]


def _bearer(headers: Optional[Dict[str, str]]) -> Optional[str]:
    auth = (headers or {}).get("authorization") or (headers or {}).get("Authorization") or ""
    return auth[7:].strip() if auth.lower().startswith("bearer ") else None


def _after(value: Optional[str]) -> Optional[int]:
    return int(value) if value and str(value).isdigit() else None


def sse_frames(feed: Dict[str, Any], retry: Optional[int] = None) -> str:
    """Server-Sent Events text for one batch from JournalStore.list_changes.

    Every batch ends with a `cursor` event whose id is the feed cursor, so the
    client resumes from there even when every row was filtered out.
    """
    parts = [f"retry: {int(retry)}\n\n"] if retry else []
    for event in feed["events"]:
        parts.append(f"id: {event['id']}\nevent: change\ndata: {json.dumps(event)}\n\n")
    parts.append(f"id: {feed['cursor']}\nevent: cursor\ndata: {json.dumps({'cursor': feed['cursor']})}\n\n")
    return "".join(parts)


def default_db_path() -> Tuple[str, str]:
    """Returns (path, storage_mode). Serverless /tmp is flagged as ephemeral."""
    explicit = os.environ.get("JOURNAL_OS_DB")
    if explicit:
        return explicit, os.environ.get("JOURNAL_OS_STORAGE", "durable")
    if os.environ.get("VERCEL"):
        return "/tmp/journal_os_demo.db", "ephemeral"
    return str(REPO_ROOT / "data" / "journal_os.db"), "durable"


class JournalOSApp:
    def __init__(self, db_path: Optional[str] = None, storage_mode: Optional[str] = None) -> None:
        path, mode = default_db_path()
        self.db_path = db_path or path
        self.storage_mode = storage_mode or (mode if db_path is None else "durable")
        self.store = JournalStore(self.db_path)
        self.actions = ActionService(self.store)
        self.automations = AutomationService(self.store)
        # One shared SQLite connection: serverless runtimes may call handle()
        # from several threads at once, so requests take turns.
        self._lock = threading.Lock()

    def close(self) -> None:
        self.store.close()

    def tick_automations(self, now: Optional[str] = None) -> int:
        """Run every due automation on this machine's clock. The local server
        calls this from a background thread; it must never raise."""
        with self._lock:
            try:
                return len(self.automations.run_due(now))
            except Exception as exc:  # keep the ticker alive; the next tick retries
                self.store.conn.rollback()
                if not os.environ.get("JOURNAL_OS_QUIET"):
                    print(f"automations: {exc}", flush=True)
                return 0

    # ------------------------------------------------------------ routing
    def handle(self, method: str, raw_path: str, body: Optional[str] = None,
               headers: Optional[Dict[str, str]] = None) -> Response:
        parsed = urllib.parse.urlparse(raw_path)
        path = parsed.path.rstrip("/") or "/"
        query = {k: v[-1] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json(400, {"error": "Body must be JSON."})
        token = _bearer(headers)
        try:
            with self._lock:
                return self._route(method, path, query, data, token)
        except AuthError as exc:
            return self._json(401, {"error": str(exc)})
        except Forbidden as exc:
            return self._json(403, {"error": str(exc)})
        except NotFound as exc:
            return self._json(404, {"error": str(exc)})
        except (Invalid, ValueError, KeyError, TypeError) as exc:
            return self._json(400, {"error": str(exc)})

    def _json(self, status: int, payload: Any) -> Response:
        return status, dict(JSON), json.dumps(payload)

    # ------------------------------------------------------- live updates
    @staticmethod
    def stream_request(raw_path: str) -> Optional[Tuple[str, Optional[int]]]:
        """(workspace_id, after) when raw_path is the change stream, else None."""
        parsed = urllib.parse.urlparse(raw_path)
        m = STREAM_PATH.fullmatch(parsed.path.rstrip("/"))
        if not m:
            return None
        return m.group(1), _after(urllib.parse.parse_qs(parsed.query).get("after", [""])[-1])

    def poll_changes(self, headers: Optional[Dict[str, str]], workspace_id: str,
                     after: Optional[int]) -> Tuple[int, Dict[str, Any]]:
        """One authenticated read of the change feed, used by the streaming handler."""
        try:
            with self._lock:
                user = self.store.user_for_token(_bearer(headers))
                return 200, self.store.list_changes(user["id"], workspace_id, after)
        except AuthError as exc:
            return 401, {"error": str(exc)}
        except Forbidden as exc:
            return 403, {"error": str(exc)}
        except NotFound as exc:
            return 404, {"error": str(exc)}
        except (Invalid, ValueError) as exc:
            return 400, {"error": str(exc)}

    def _route(self, method: str, path: str, q: Dict[str, str], d: Dict[str, Any], token: Optional[str]) -> Response:
        s, a, ok = self.store, self.actions, self._json
        if path == "/api/os/health":
            return ok(200, {"ok": True, "storage": self.storage_mode, "interpreter": "deterministic-rules",
                            "llm_adapter": "not configured"})
        if path == "/api/os/registry":
            return ok(200, APP_REGISTRY)
        if path == "/api/os/session" and method == "POST":
            return ok(200, s.sign_in(d.get("handle", ""), d.get("display_name")))
        user = s.user_for_token(token)
        uid = user["id"]
        if path == "/api/os/session" and method == "DELETE":
            s.sign_out(token or "")
            return ok(200, {"signed_out": True})
        if path == "/api/os/me":
            return ok(200, {"user": user, "workspaces": s.list_workspaces(uid), "storage": self.storage_mode})

        m = re.fullmatch(r"/api/os/w/([\w-]+)/(\w+)(?:/([\w-]+)(?:/(\w+))?)?", path)
        if m:
            ws, coll, sub, leaf = m.groups()
            if coll == "events":
                if method == "GET":
                    return ok(200, s.list_events(uid, ws, q.get("start"), q.get("end"), q.get("calendar")))
                if method == "POST":
                    return ok(201, s.create_event(uid, ws, d))
            if coll == "journal":
                if method == "GET":
                    return ok(200, s.list_entries(uid, ws))
                if method == "POST":
                    return ok(201, s.create_entry(uid, ws, d))
            if coll == "companions" and method == "GET":
                if sub and leaf == "export":
                    return ok(200, s.export_companion(uid, ws, sub))
                return ok(200, s.list_companions(uid, ws))
            if coll == "memories":
                if method == "GET":
                    return ok(200, s.list_memories(uid, ws, q.get("companion_id"), q.get("status")))
                if method == "POST":
                    return ok(201, s.propose_memory(uid, ws, d.get("companion_id", ""), d.get("category", "observation"),
                                                    d.get("content", ""), d.get("journal_entry_id"), d.get("event_id")))
            if coll == "commands" and method == "POST":
                result = a.propose(uid, ws, d.get("text", ""), d.get("now"))
                return ok(200 if result.get("ok") else 422, result)
            if coll == "actions" and method == "GET":
                return ok(200, a.history(uid, ws))
            if coll == "audit" and method == "GET":
                return ok(200, s.list_audit(uid, ws))
            if coll == "grants" and method == "GET":
                return ok(200, s.list_grants(uid, ws))
            if coll == "members" and method == "POST":
                return ok(200, s.add_member(uid, ws, d.get("handle", ""), d.get("role", "viewer")))
            if coll == "export" and method == "GET":
                return ok(200, s.export_planner(uid, ws))
            if coll == "import" and method == "POST":
                return ok(200, s.import_planner(uid, ws, d))
            # ---- agent harness: channels, agents, approvals, live updates
            if coll == "channels":
                if method == "GET":
                    return ok(200, s.list_channels(uid, ws, q.get("archived") == "1"))
                if method == "POST":
                    agent_ids = d.get("agent_ids") or []
                    known = {x["id"] for x in s.list_agents(uid, ws)}
                    if not isinstance(agent_ids, list) or set(agent_ids) - known:
                        raise Invalid("agent_ids must be agents in this workspace.")
                    ch = s.create_channel(uid, ws, d.get("name", ""), d.get("type", "public"),
                                          d.get("description", ""), d.get("instructions", ""))
                    for agent_id in agent_ids:
                        s.add_channel_member(uid, ch["id"], agent_id, "agent")
                    return ok(201, s.get_channel(uid, ch["id"]))
            if coll == "dms" and method == "POST":
                return ok(200, s.open_dm(uid, ws, d.get("member_id", ""), d.get("member_type", "agent")))
            if coll == "agents":
                if method == "GET":
                    return ok(200, s.list_agents(uid, ws, q.get("archived") == "1"))
                if method == "POST":
                    return ok(201, s.create_agent(uid, ws, d))
            if coll == "approvals" and method == "GET":
                status = q.get("status", "pending")
                return ok(200, s.list_approvals(uid, ws, None if status == "all" else status))
            if coll == "harness" and sub == "bootstrap" and method == "POST":
                boot = s.bootstrap_harness(uid, ws)
                self.automations.ensure_defaults(uid, ws, boot["agent"]["id"], boot["channel"]["id"], d.get("now"))
                return ok(200, boot)
            if coll == "automations":
                if method == "GET" and not sub:
                    return ok(200, self.automations.list(uid, ws, q.get("now")))
                if method == "POST" and sub == "tick":
                    # The browser's clock says what time it is for this person.
                    # Only their own automations run, each at most once per period.
                    s.require_role(uid, ws, "viewer")
                    return ok(200, self.automations.run_due(d.get("now"), ws, owner_id=uid))
            if coll == "stream" and method == "GET":
                # One batch, then the response ends. Hosts that can't hold a
                # connection open (Vercel) degrade to polling via `retry`.
                return 200, dict(SSE), sse_frames(s.list_changes(uid, ws, _after(q.get("after"))), retry=3000)

        m = re.fullmatch(r"/api/os/(events|journal|memories|actions|channels|messages|approvals|agents|automations)/([\w-]+)"
                         r"(?:/([\w-]+))?", path)
        if m:
            kind, rid, verb = m.groups()
            if kind == "events":
                if method == "GET" and not verb:
                    return ok(200, s.get_event(uid, rid))
                if method == "POST" and not verb:
                    return ok(200, s.update_event(uid, rid, d))
                if method == "DELETE" and not verb:
                    return ok(200, s.delete_event(uid, rid))
                if method == "POST" and verb == "run-sandbox":
                    return ok(200, run_sandbox_activity(s, uid, rid))
            if kind == "journal":
                if method == "GET":
                    return ok(200, s.get_entry(uid, rid))
                if method == "POST":
                    return ok(200, s.update_entry(uid, rid, d))
                if method == "DELETE":
                    return ok(200, s.delete_entry(uid, rid))
            if kind == "memories" and method == "POST":
                if verb == "review":
                    return ok(200, s.review_memory(uid, rid, bool(d.get("approve")), d.get("content")))
                if verb == "forget":
                    return ok(200, s.forget_memory(uid, rid))
            if kind == "actions" and method == "POST":
                if verb == "approve":
                    return ok(200, a.approve(uid, rid, d.get("payload")))
                if verb == "reject":
                    return ok(200, a.reject(uid, rid))
            if kind == "channels":
                if method == "GET" and not verb:
                    return ok(200, s.get_channel(uid, rid))
                if verb == "messages" and method == "GET":
                    return ok(200, s.list_messages(uid, rid, q.get("thread") or None, int(q.get("limit") or 100)))
                if verb == "messages" and method == "POST":
                    msg = s.post_message(uid, rid, d.get("content", ""), d.get("thread_id"), d.get("context"))
                    replies = harness.respond_to(s, uid, msg, d.get("now"))
                    return ok(201, {"message": msg, "replies": replies})
                if verb == "members" and method == "POST":
                    return ok(200, s.add_channel_member(uid, rid, d.get("member_id", ""), d.get("member_type", "agent"),
                                                        d.get("role", "member")))
                if verb == "members" and method == "DELETE":
                    return ok(200, s.remove_channel_member(uid, rid, d.get("member_id", "")))
                if verb == "archive" and method == "POST":
                    return ok(200, s.archive_channel(uid, rid))
            if kind == "messages" and method == "GET" and not verb:
                return ok(200, s.get_message(uid, rid))
            if kind == "approvals":
                if method == "GET" and not verb:
                    return ok(200, s.get_approval(uid, rid))
                if method == "POST" and verb in ("approve", "reject"):
                    return ok(200, a.decide_tool_call(uid, rid, verb == "approve", d.get("input") or None))
            if kind == "agents":
                if method == "GET" and not verb:
                    return ok(200, s.get_agent(uid, rid))
                if method == "POST" and not verb:
                    return ok(200, s.update_agent(uid, rid, d))
                if method == "GET" and verb == "memory":
                    return ok(200, s.render_agent_memory(uid, rid))
            if kind == "automations" and method == "POST":
                if not verb:
                    return ok(200, self.automations.update(uid, rid, d, d.get("now")))
                if verb == "run":
                    return ok(200, self.automations.run_now(uid, rid, d.get("now")))
        return ok(404, {"error": f"No route for {method} {path}"})


# ------------------------------------------------------------- local server
def serve_static(path: str) -> Optional[Response]:
    rel = path[len("/os"):].lstrip("/") or "index.html"
    target = (STATIC_DIR / rel).resolve()
    if STATIC_DIR.resolve() not in target.parents and target != STATIC_DIR.resolve():
        return 404, {"Content-Type": "text/plain"}, "Not found"
    if not target.is_file():
        return None
    ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return 200, {"Content-Type": f"{ctype}; charset=utf-8", "Cache-Control": "no-cache"}, target.read_text("utf-8")


def make_handler(app: JournalOSApp):
    legacy = None
    # The server is threaded so a live stream can stay open. The older Portal
    # School apps keep SQLite connections that only work on the thread that
    # opened them, so every legacy request runs on this one worker thread.
    legacy_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="portal-legacy")

    def legacy_call(method: str, path: str, body: Optional[str]) -> Response:
        nonlocal legacy
        if legacy is None:
            from api import index as legacy_mod  # existing Portal School gateway
            legacy = legacy_mod
        return legacy.route_request(method, path, body)

    def legacy_route(method: str, path: str, body: Optional[str]) -> Response:
        return legacy_pool.submit(legacy_call, method, path, body).result()

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, headers: Dict[str, str], body: Any) -> None:
            data = body if isinstance(body, bytes) else str(body).encode("utf-8")
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _emit(self, text: str) -> None:
            self.wfile.write(text.encode("utf-8"))
            self.wfile.flush()

        def _stream(self, workspace_id: str, after: Optional[int]) -> None:
            """Hold a Server-Sent Events stream open for STREAM_SECONDS."""
            headers = dict(self.headers)
            status, feed = app.poll_changes(headers, workspace_id, after)
            if status != 200:
                return self._send(status, dict(JSON), json.dumps(feed))
            self.close_connection = True
            self.send_response(200)
            for key, value in SSE.items():
                self.send_header(key, value)
            self.end_headers()
            try:
                self._emit(sse_frames(feed, retry=1000))
                cursor, beat = feed["cursor"], time.monotonic()
                deadline = beat + STREAM_SECONDS
                while time.monotonic() < deadline:
                    time.sleep(STREAM_POLL_SECONDS)
                    status, feed = app.poll_changes(headers, workspace_id, cursor)
                    if status != 200:
                        return  # signed out or removed from the workspace: end the stream
                    if feed["events"] or feed["cursor"] != cursor:
                        self._emit(sse_frames(feed))
                        cursor, beat = feed["cursor"], time.monotonic()
                    elif time.monotonic() - beat > 15:
                        self._emit(": keepalive\n\n")
                        beat = time.monotonic()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                return  # the browser closed the tab or switched views

        def _dispatch(self, method: str) -> None:
            if method == "GET":
                target = app.stream_request(self.path)
                if target:
                    return self._stream(*target)
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length).decode("utf-8") if length else None
            path = urllib.parse.urlparse(self.path).path
            if path in ("/", "/os"):
                return self._send(302, {"Location": "/os/"}, "")
            if path.startswith("/api/os/"):
                return self._send(*app.handle(method, self.path, body, dict(self.headers)))
            if path.startswith("/os/") and method == "GET":
                res = serve_static(path)
                if res:
                    return self._send(*res)
            asset = REPO_ROOT / path.lstrip("/")
            if method == "GET" and path.startswith("/assets/") and asset.is_file():
                ctype = mimetypes.guess_type(str(asset))[0] or "application/octet-stream"
                return self._send(200, {"Content-Type": ctype}, asset.read_bytes())
            return self._send(*legacy_route(method, self.path, body))

        def do_GET(self) -> None:
            self._dispatch("GET")

        def do_POST(self) -> None:
            self._dispatch("POST")

        def do_DELETE(self) -> None:
            self._dispatch("DELETE")

        def log_message(self, fmt: str, *args: Any) -> None:
            if os.environ.get("JOURNAL_OS_QUIET"):
                return
            super().log_message(fmt, *args)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Journal OS local server")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--db", default=None, help="SQLite path (default: ./data/journal_os.db)")
    parser.add_argument("--no-automations", action="store_true",
                        help="don't run scheduled automations in the background (the browser still can)")
    args = parser.parse_args()
    app = JournalOSApp(db_path=args.db)
    if not args.no_automations:
        def ticker() -> None:
            while True:
                app.tick_automations()
                time.sleep(AUTOMATION_TICK_SECONDS)
        threading.Thread(target=ticker, name="automations", daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(app))  # daemon threads
    print(f"Journal OS on http://{args.host}:{args.port}/os/  (db: {app.db_path}, storage: {app.storage_mode})",
          flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.close()


if __name__ == "__main__":
    main()
