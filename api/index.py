#!/usr/bin/env python3
"""
Vercel Serverless Backend & Gamified Portal Machine Story Maps Gateway
for `robotic-discipline-portal-school` (backs both Vercel and GitHub Pages `github.io`).
"""

from __future__ import annotations
import datetime
import json
import pathlib
import sqlite3
import tempfile
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler
from typing import Dict, Tuple, Optional, Any

from skeleton.workspace_server import WorkspaceApp
from apps.dataroom.server import DataRoomApp
from apps.vc_directory.server import VCDirectoryApp
from apps.studio.blueprint_studio import StudioBlueprintApp

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED_DIR = REPO_ROOT / "seed"
ZINE_HTML_PATH = REPO_ROOT / "skeleton" / "zine_demo_view.html"
INDEX_HTML_PATH = REPO_ROOT / "index.html"
STYLE_CSS_PATH = REPO_ROOT / "style.css"
APP_JS_PATH = REPO_ROOT / "app.js"
SEED_BUNDLE_PATH = REPO_ROOT / "seed-bundle.json"

TMP_DIR = pathlib.Path(tempfile.gettempdir())
WORKSPACE_DB = str(TMP_DIR / "portal_school_workspace.db")
DATAROOM_DB = str(TMP_DIR / "portal_school_dataroom.db")
STUDIO_DB = str(TMP_DIR / "portal_school_studio.db")
PORTAL_DB = str(TMP_DIR / "portal_school_leads.db")

_workspace_app: Optional[WorkspaceApp] = None
_dataroom_app: Optional[DataRoomApp] = None
_directory_app: Optional[VCDirectoryApp] = None
_studio_app: Optional[StudioBlueprintApp] = None


def get_apps() -> Tuple[WorkspaceApp, DataRoomApp, VCDirectoryApp, StudioBlueprintApp]:
    global _workspace_app, _dataroom_app, _directory_app, _studio_app
    if _workspace_app is None:
        _workspace_app = WorkspaceApp(db_path=WORKSPACE_DB)
    if _dataroom_app is None:
        _dataroom_app = DataRoomApp(db_path=DATAROOM_DB)
    if _directory_app is None:
        _directory_app = VCDirectoryApp()
    if _studio_app is None:
        _studio_app = StudioBlueprintApp(db_path=STUDIO_DB)
    return _workspace_app, _dataroom_app, _directory_app, _studio_app


def _init_portal_db() -> sqlite3.Connection:
    conn = sqlite3.connect(PORTAL_DB)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS portal_leads (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            source_app TEXT NOT NULL,
            selected_stop TEXT NOT NULL,
            final_cta TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    return conn


def with_cors(headers: Dict[str, str]) -> Dict[str, str]:
    out = dict(headers)
    out["Access-Control-Allow-Origin"] = "*"
    out["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    out["Access-Control-Allow-Headers"] = "Content-Type"
    return out


GLOBAL_NAV_BAR = """
<div style="background:#141413;color:#EFE6D4;padding:0.65rem 1.25rem;font-family:'Courier New',monospace;font-size:0.82rem;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0.5rem;border-bottom:2px solid #D8FF3E;">
  <div><strong>ROBOTIC DISCIPLINE</strong> // PORTAL MACHINE &times; SCHOOL &times; ANIMAL SCRYPT</div>
  <div style="display:flex;flex-wrap:wrap;gap:0.85rem;">
    <a href="/gamified" style="color:#141413;background:#ffd400;padding:0.15rem 0.5rem;text-decoration:none;font-weight:bold;">[★ Gamified Portal &amp; School Map]</a>
    <a href="/studio" style="color:#141413;background:#D8FF3E;padding:0.15rem 0.5rem;text-decoration:none;font-weight:bold;">[★ Visual Studio &amp; White Paper]</a>
    <a href="/portfolio" style="color:#EFE6D4;text-decoration:none;">[Portfolio]</a>
    <a href="/workspace" style="color:#EFE6D4;text-decoration:none;">[Workspace]</a>
    <a href="/dataroom" style="color:#EFE6D4;text-decoration:none;">[Data Room]</a>
    <a href="/directory" style="color:#EFE6D4;text-decoration:none;">[VC Tools]</a>
    <a href="/zine" style="color:#EFE6D4;text-decoration:none;">[Zine]</a>
  </div>
</div>
"""


def inject_nav(page_html: str) -> str:
    if "<body>" in page_html:
        return page_html.replace("<body>", "<body>\n" + GLOBAL_NAV_BAR, 1)
    return GLOBAL_NAV_BAR + page_html


def route_request(
    method: str, path: str, body: Optional[str] = None, ip_address: str = "127.0.0.1"
) -> Tuple[int, Dict[str, str], str]:
    if method == "OPTIONS":
        return 200, with_cors({"Content-Type": "text/plain"}), "OK"

    workspace_app, dataroom_app, directory_app, studio_app = get_apps()
    parsed = urllib.parse.urlparse(path)
    clean_path = parsed.path

    # Static assets for the Gamified Portal Machine & School SPA
    if method == "GET" and clean_path == "/style.css":
        return 200, with_cors({"Content-Type": "text/css; charset=utf-8"}), STYLE_CSS_PATH.read_text(encoding="utf-8")
    if method == "GET" and clean_path == "/app.js":
        return 200, with_cors({"Content-Type": "application/javascript; charset=utf-8"}), APP_JS_PATH.read_text(encoding="utf-8")
    if method == "GET" and clean_path == "/seed-bundle.json":
        return 200, with_cors({"Content-Type": "application/json; charset=utf-8"}), SEED_BUNDLE_PATH.read_text(encoding="utf-8")
    if method == "GET" and clean_path == "/gamified":
        return 200, with_cors({"Content-Type": "text/html; charset=utf-8"}), INDEX_HTML_PATH.read_text(encoding="utf-8")

    # Portal Machine Lead Capture API (backs github.io and Vercel)
    if clean_path == "/api/portal/lead":
        conn = _init_portal_db()
        if method == "POST":
            payload = json.loads(body or "{}")
            lead_id = f"lead-{uuid.uuid4().hex[:8]}"
            now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
            record = {
                "id": lead_id,
                "name": (payload.get("name") or "Anonymous").strip(),
                "email": (payload.get("email") or "").strip(),
                "source_app": (payload.get("source_app") or "kindreds-waitlist").strip(),
                "selected_stop": (payload.get("selected_stop") or "Final Waitlist Portal").strip(),
                "final_cta": (payload.get("final_cta") or "Join Kindred's Waitlist").strip(),
                "created_at": now,
            }
            conn.execute(
                """
                INSERT INTO portal_leads (id, name, email, source_app, selected_stop, final_cta, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["name"],
                    record["email"],
                    record["source_app"],
                    record["selected_stop"],
                    record["final_cta"],
                    record["created_at"],
                ),
            )
            conn.commit()
            conn.close()
            return 200, with_cors({"Content-Type": "application/json"}), json.dumps(record)
        else:
            rows = [dict(r) for r in conn.execute("SELECT * FROM portal_leads ORDER BY created_at DESC").fetchall()]
            conn.close()
            return 200, with_cors({"Content-Type": "application/json"}), json.dumps(rows)

    # 0. Visual Design Studio, Blueprint & White Paper Reader/Editor routes
    if clean_path in ("/studio", "/blueprint", "/seed") or clean_path.startswith("/api/studio/"):
        status, headers, resp_body = studio_app.handle_request(method, path, body)
        if "text/html" in headers.get("Content-Type", ""):
            resp_body = inject_nav(resp_body)
        return status, with_cors(headers), resp_body

    # 1. Portfolio & Creature Workspace routes
    if (
        clean_path in ("/", "/portfolio", "/workspace")
        or clean_path.startswith("/api/memory/")
        or clean_path.startswith("/api/royalty/")
        or clean_path in ("/api/state", "/api/export")
    ):
        target_path = "/" if clean_path == "/portfolio" else clean_path
        status, headers, resp_body = workspace_app.handle_request(method, target_path, body)
        if "text/html" in headers.get("Content-Type", ""):
            resp_body = inject_nav(resp_body)
        return status, with_cors(headers), resp_body

    # 2. Self-Hosted Investor Data Room routes
    if clean_path == "/dataroom":
        sub_query = f"?{parsed.query}" if parsed.query else ""
        status, headers, resp_body = dataroom_app.handle_request("GET", f"/{sub_query}", ip_address=ip_address)
        resp_body = resp_body.replace('href="/?lang=', 'href="/dataroom?lang=')
        return status, with_cors(headers), inject_nav(resp_body)

    if (
        clean_path.startswith("/api/rooms/")
        or clean_path.startswith("/api/nda/")
        or clean_path.startswith("/api/admin/")
        or clean_path == "/api/chat"
        or clean_path.startswith("/api/me")
    ):
        status, headers, resp_body = dataroom_app.handle_request(method, path, body, ip_address=ip_address)
        return status, with_cors(headers), resp_body

    # 3. Open-Source VC & Startup Tools Directory routes
    if clean_path == "/directory":
        sub_query = f"?{parsed.query}" if parsed.query else ""
        status, headers, resp_body = directory_app.handle_request("GET", f"/{sub_query}")
        resp_body = resp_body.replace("href='/?", "href='/directory?").replace('action="/"', 'action="/directory"').replace('href="/"', 'href="/directory"')
        return status, with_cors(headers), inject_nav(resp_body)

    if clean_path == "/api/tools":
        status, headers, resp_body = directory_app.handle_request(method, path)
        return status, with_cors(headers), resp_body

    # 4. Stage-1 Zine Terminal View
    if clean_path == "/zine":
        zine_html = ZINE_HTML_PATH.read_text(encoding="utf-8")
        return 200, with_cors({"Content-Type": "text/html; charset=utf-8"}), inject_nav(zine_html)

    return 404, with_cors({"Content-Type": "application/json"}), json.dumps({"error": f"Route {clean_path} not found"})


class handler(BaseHTTPRequestHandler):
    """Vercel Python Serverless Function entrypoint."""

    def do_OPTIONS(self) -> None:
        status, headers, resp_body = route_request("OPTIONS", self.path)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(resp_body.encode("utf-8"))

    def do_GET(self) -> None:
        ip = self.headers.get("x-forwarded-for", self.client_address[0] if self.client_address else "127.0.0.1")
        status, headers, resp_body = route_request("GET", self.path, ip_address=ip)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(resp_body.encode("utf-8"))

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        ip = self.headers.get("x-forwarded-for", self.client_address[0] if self.client_address else "127.0.0.1")
        status, headers, resp_body = route_request("POST", self.path, raw, ip_address=ip)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(resp_body.encode("utf-8"))

    def do_DELETE(self) -> None:
        ip = self.headers.get("x-forwarded-for", self.client_address[0] if self.client_address else "127.0.0.1")
        status, headers, resp_body = route_request("DELETE", self.path, ip_address=ip)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(resp_body.encode("utf-8"))

    def log_message(self, format: str, *args: Any) -> None:
        return
