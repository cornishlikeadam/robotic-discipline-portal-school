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
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, Optional, Tuple

from journal_os.actions import ActionService, run_sandbox_activity
from journal_os.registry import APP_REGISTRY
from journal_os.store import AuthError, Forbidden, Invalid, JournalStore, NotFound

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC_DIR = REPO_ROOT / "os"
JSON = {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}

Response = Tuple[int, Dict[str, str], str]


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
        # One shared SQLite connection: serverless runtimes may call handle()
        # from several threads at once, so requests take turns.
        self._lock = threading.Lock()

    def close(self) -> None:
        self.store.close()

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
        auth = (headers or {}).get("authorization") or (headers or {}).get("Authorization") or ""
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else None
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

        m = re.fullmatch(r"/api/os/(events|journal|memories|actions)/([\w-]+)(?:/([\w-]+))?", path)
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

    def legacy_route(method: str, path: str, body: Optional[str]) -> Response:
        nonlocal legacy
        if legacy is None:
            from api import index as legacy_mod  # existing Portal School gateway
            legacy = legacy_mod
        return legacy.route_request(method, path, body)

    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, headers: Dict[str, str], body: Any) -> None:
            data = body if isinstance(body, bytes) else str(body).encode("utf-8")
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _dispatch(self, method: str) -> None:
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
    args = parser.parse_args()
    app = JournalOSApp(db_path=args.db)
    server = HTTPServer((args.host, args.port), make_handler(app))
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
