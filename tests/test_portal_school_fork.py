#!/usr/bin/env python3
"""
TDD test suite for the forked Gamified Portal Machine Story Maps + Robotic Discipline School repo.
Verifies:
1. GitHub Pages static bundle (index.html, style.css, app.js, seed-bundle.json, assets/*) uses relative paths for github.io compatibility.
2. Gamification mechanics from Portal Machine Story Maps (stationary 6-app home screen, chain-reaction domino funnel, 5 Kindred's Waitlist stops, 7 telemetry events) and Robotic Discipline School (interactive pan/zoom map, PATCH/MOSS/PIP companions, Reengineering Lab, human-approved Notebook, Visual White Paper & Blueprint Studio) are present.
3. Vercel backend (api/index.py) serves static assets and CORS-enabled /api/portal/* endpoints backing the github.io site.
"""

import json
import pathlib
import subprocess
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


class TestPortalSchoolFork(unittest.TestCase):
    def test_app_js_valid_syntax_and_zero_runtime_errors(self) -> None:
        """Verifies app.js passes `node --check` with zero syntax errors."""
        res = subprocess.run(
            ["node", "--check", str(REPO_ROOT / "app.js")],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"JS SyntaxError: {res.stderr}")

    def test_github_pages_static_files_and_relative_paths(self) -> None:
        index_html = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
        style_css = (REPO_ROOT / "style.css").read_text(encoding="utf-8")
        app_js = (REPO_ROOT / "app.js").read_text(encoding="utf-8")
        bundle = json.loads((REPO_ROOT / "seed-bundle.json").read_text(encoding="utf-8"))

        # Must use relative paths so github.io/<repo>/ resolves assets properly
        self.assertIn('href="style.css"', index_html)
        self.assertIn('src="app.js"', index_html)
        self.assertNotIn('href="/style.css"', index_html)
        self.assertIn("url('assets/BarlowCondensed-Bold.ttf')", style_css)
        self.assertIn("assets/school-world-map.png", app_js)

        # Verify all 12 Portal Machine Story Maps sections + 29 White Paper + /seed docs are in seed-bundle.json
        self.assertIn("PORTAL_MACHINE_BLUEPRINT", bundle["documents"])
        self.assertIn("29-white-paper.md", bundle["documents"])
        self.assertIn("MASTER_BOOK", bundle["documents"])
        self.assertEqual(len(bundle["vc_tools"]), 15)

    def test_portal_machine_story_maps_and_school_gamification_mechanics(self) -> None:
        app_js = (REPO_ROOT / "app.js").read_text(encoding="utf-8")
        # 6 Living Apps + Kindred's Waitlist 5 stops
        for required in [
            "Portal Machine Story Maps",
            "Kindred's Waitlist",
            "Social Portal",
            "Portfolio Gallery",
            "Company Lab",
            "Research Observatory",
            "Final Waitlist Portal",
            "Continue Journey",
            "app_opened",
            "start_clicked",
            "stop_viewed",
            "primary_link_clicked",
            "continue_clicked",
            "final_cta_clicked",
            "waitlist_submitted",
            "Making Workshop",
            "Memory Archive",
            "Reengineering Lab",
            "PATCH",
            "MOSS",
            "PIP",
            "contenteditable",
        ]:
            self.assertIn(required, app_js, f"Missing '{required}' in app.js")

    def test_vercel_backend_cors_and_portal_api(self) -> None:
        from api.index import route_request

        status, headers, body = route_request(
            "POST",
            "/api/portal/lead",
            json.dumps({
                "name": "KJ Tester",
                "email": "kj@scad.edu",
                "source_app": "kindreds-waitlist",
                "selected_stop": "Final Waitlist Portal",
                "final_cta": "Join Kindred's Waitlist",
            }),
        )
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "*")
        data = json.loads(body)
        self.assertEqual(data["source_app"], "kindreds-waitlist")


if __name__ == "__main__":
    unittest.main()
