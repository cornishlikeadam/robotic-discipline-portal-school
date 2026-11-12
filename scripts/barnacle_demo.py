#!/usr/bin/env python3
"""Drive Barnacle, the floating companion, end to end in headless Chromium.

  sign in -> intro peek -> "Show me" runs the demo -> pending card in the panel
  (nothing saved) -> approve -> bubble stays put while the page scrolls
  -> journal entry + selected text -> "Remember this" peek -> card with that
  context -> approve -> event context ("move this") -> reject -> the same
  conversation shows up as a DM in Channels -> phone-width bottom sheet.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/barnacle_demo.py --out demo-output/barnacle
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import Page, expect, sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent
WAITING = re.compile("waiting for approval", re.I)
SELECTED = "Neck joint still wobbles; try brass inserts"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(port: int, db: pathlib.Path) -> subprocess.Popen:
    proc = subprocess.Popen([sys.executable, "-m", "journal_os.server", "--port", str(port), "--db", str(db)],
                            cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={"JOURNAL_OS_QUIET": "1", "PATH": "/usr/bin:/bin"})
    for _ in range(100):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/os/health", timeout=0.5)
            return proc
        except Exception:
            time.sleep(0.05)
    raise RuntimeError("server did not start")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo-output/barnacle")
    ap.add_argument("--slow", type=int, default=200, help="ms between actions")
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    checks: list[tuple[str, bool]] = []
    shot = iter(range(1, 100))

    def check(name: str, ok: bool) -> None:
        checks.append((name, ok))
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    def snap(page: Page, name: str) -> None:
        page.screenshot(path=str(out / f"{next(shot):02d}-{name}.png"))

    def api(page: Page, method: str, path: str, body=None):
        token = json.loads(page.evaluate("localStorage.getItem('jos.token')"))
        req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read())

    server = start_server(port, out / "journal_os.db")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(slow_mo=args.slow)
        ctx = browser.new_context(viewport={"width": 1366, "height": 900}, record_video_dir=str(out / "video"),
                                  record_video_size={"width": 1366, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            # 1. First load: the bubble is there and introduces itself
            page.goto(f"{base}/os/")
            page.fill("#handle", "kj")
            page.click("text=Open Journal OS")
            expect(page.locator("#bn-bubble")).to_be_visible()
            expect(page.locator("#bn-peek")).to_contain_text("Barnacle")
            snap(page, "intro-peek")
            check("bubble and intro appear on first load", True)
            ws = api(page, "GET", "/api/os/me")["workspaces"][0]["id"]

            # 2. "Show me" runs the demo against the real approval system
            page.click("#bn-peek [data-bn=intro-demo]")
            card = page.locator("#bn-msgs .apv.pending").last
            expect(card).to_contain_text(WAITING, timeout=15000)
            expect(page.locator("#bn-badge")).to_have_text("1")
            snap(page, "demo-card")
            check("demo produces a real pending card in the panel", True)
            check("nothing saved before approval", api(page, "GET", f"/api/os/w/{ws}/events") == [])
            card.locator("[data-decide=approve]").click()
            expect(page.locator("#bn-msgs .apv.approved")).to_have_count(1)
            expect(page.locator("#bn-badge")).to_be_hidden()
            titles = [e["title"] for e in api(page, "GET", f"/api/os/w/{ws}/events")]
            check("approving in the panel saves the event", titles == ["Robotics build session"])

            # 3. Result link opens the planner; the panel stays with you
            page.locator("#bn-msgs .apv.approved a", has_text="Show in planner").click()
            expect(page.locator(".ev", has_text="Robotics build session").first).to_be_visible()
            check("panel stays open across views", page.locator("#bn-panel").is_visible())
            page.click("[data-bn=close]")
            expect(page.locator("#bn-panel")).to_be_hidden()

            # 4. The bubble stays put while the page scrolls
            before = page.locator("#bn-bubble").bounding_box()
            page.mouse.wheel(0, 800)
            page.wait_for_timeout(300)
            after = page.locator("#bn-bubble").bounding_box()
            fixed = abs(before["y"] - after["y"]) < 8 and after["y"] + after["height"] <= 900
            check("bubble stays on screen while scrolling", fixed)

            # 5. Event context: open the event, then ask to move "this"
            page.mouse.wheel(0, -2000)
            page.locator(".ev", has_text="Robotics build session").first.click()
            page.keyboard.press("Escape")
            page.click("#bn-bubble")
            expect(page.locator("#bn-ctx")).to_contain_text("Robotics build session")
            page.fill("#bn-input", "Move this to Friday at 3pm")
            page.press("#bn-input", "Enter")
            move = page.locator("#bn-msgs .apv.pending").last
            expect(move).to_contain_text("Reschedule")
            snap(page, "event-context")
            move.locator("[data-decide=reject]").click()
            expect(page.locator("#bn-msgs .apv.rejected")).to_have_count(1)
            start = api(page, "GET", f"/api/os/w/{ws}/events")[0]["start_at"]
            check("'move this' targets the open event, and reject leaves it unchanged", start.endswith("T11:00"))
            page.click("[data-bn=close]")

            # 6. Journal entry + selected text -> "Remember this"
            entry = api(page, "POST", f"/api/os/w/{ws}/journal",
                        {"title": "Shell v2 print", "body": f"Printed shell v2 at 2.4mm walls. {SELECTED}."})
            page.goto(f"{base}/os/#journal?e={entry['id']}")
            expect(page.locator("#je-body")).to_have_value(re.compile("brass inserts"))
            page.evaluate("""(text) => { const el = document.querySelector('#je-body');
                const i = el.value.indexOf(text); el.focus(); el.setSelectionRange(i, i + text.length); }""", SELECTED)
            expect(page.locator("#bn-peek")).to_contain_text("keep", timeout=5000)
            snap(page, "selection-peek")
            page.click("#bn-peek [data-bn=remember]")
            expect(page.locator("#bn-ctx")).to_contain_text("Shell v2 print")
            expect(page.locator("#bn-ctx")).to_contain_text("brass inserts")
            expect(page.locator("#bn-input")).to_have_value("Remember this")
            page.press("#bn-input", "Enter")
            mem = page.locator("#bn-msgs .apv.pending").last
            expect(mem).to_contain_text("Propose memory")
            expect(page.locator("#bn-msgs .hx-ctx").last).to_contain_text("selected text")
            snap(page, "selection-card")
            mem.locator("[data-decide=approve]").click()
            expect(page.locator("#bn-msgs .apv.approved").last).to_contain_text("Review in ledger")
            memories = api(page, "GET", f"/api/os/w/{ws}/memories?status=PROPOSED")
            linked = [m for m in memories if m["content"] == SELECTED and m["journal_entry_id"] == entry["id"]]
            check("selected text becomes a proposed memory linked to the entry", len(linked) == 1)

            # 7. Same conversation in Channels, bubble still present
            page.click("[data-bn=close]")
            page.click("#dock [data-app=channels]")
            expect(page.locator("#bn-bubble")).to_be_visible()
            page.locator(".hx-ch", has_text="PATCH").click()
            expect(page.locator("#hx-msgs")).to_contain_text("Remember this")
            check("Barnacle's conversation is the PATCH DM in Channels", True)

            # 8. Phone: bubble, then the bottom sheet
            page.set_viewport_size({"width": 390, "height": 844})
            page.goto(f"{base}/os/#planner")
            expect(page.locator("#bn-bubble")).to_be_visible()
            snap(page, "phone-bubble")
            page.click("#bn-bubble")
            expect(page.locator("#bn-panel")).to_be_visible()
            page.locator("#bn-panel").evaluate("el => Promise.all(el.getAnimations().map((a) => a.finished))")
            page.wait_for_timeout(3500)  # let the last toast clear before the screenshot
            box = page.locator("#bn-panel").bounding_box()
            check("phone panel is a full-width bottom sheet", box["width"] >= 388 and abs(box["y"] + box["height"] - 844) < 2)
            snap(page, "phone-panel")
            page.click("[data-bn=close]")
            wide = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("no sideways scrolling at phone width", not wide)
            check("no uncaught page errors", not errors)
        except Exception as exc:  # report and keep the video
            check(f"journey aborted: {exc}", False)
            snap(page, "failure")
        finally:
            ctx.close()
            browser.close()
            server.terminate()
    videos = sorted((out / "video").glob("*.webm"))
    if videos:
        videos[0].rename(out / "barnacle.webm")
    shutil.rmtree(out / "video", ignore_errors=True)
    failed = [n for n, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed. Output: {out}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
