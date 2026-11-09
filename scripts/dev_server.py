#!/usr/bin/env python3
"""
Run the Vercel app locally: http://localhost:3000

  python3 scripts/dev_server.py                 # SQLite + local dev sign-in + offline creature
  DATABASE_URL=... SUPABASE_URL=... SUPABASE_ANON_KEY=... ANTHROPIC_API_KEY=... python3 scripts/dev_server.py

Then open http://localhost:3000/c/mk-demo-patch (dev mode seeds this demo creature).
"""

from __future__ import annotations

import mimetypes
import os
import pathlib
import sys
from http.server import HTTPServer

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from api.index import handler  # noqa: E402


class DevHandler(handler):
    def do_GET(self) -> None:
        # Vercel serves repo files (assets/, fonts) statically; mimic that.
        rel = self.path.split("?", 1)[0].lstrip("/")
        candidate = (REPO_ROOT / rel).resolve()
        if rel.startswith("assets/") and candidate.is_file() and REPO_ROOT in candidate.parents:
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(str(candidate))[0] or "application/octet-stream")
            self.end_headers()
            self.wfile.write(candidate.read_bytes())
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    print(f"Serving on http://localhost:{port}  (try /c/mk-demo-patch)")
    # Single-threaded on purpose: matches one-request-at-a-time Vercel functions and SQLite.
    HTTPServer(("127.0.0.1", port), DevHandler).serve_forever()
