#!/usr/bin/env python3
"""Drive the Channels view end to end in headless Chromium, with two tabs.

  sign in -> Channels -> create #general with PATCH -> @mention with autocomplete
  -> approval card (nothing saved) -> second tab sees it live -> approve in tab 2
  -> tab 1 updates live -> event is in the planner -> thread reply -> reject
  -> members dialog -> RESTART the server -> messages and decisions still there.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/harness_demo.py --out demo-output/harness
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
    ap.add_argument("--out", default="demo-output/harness")
    ap.add_argument("--slow", type=int, default=250, help="ms between actions")
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    db = out / "journal_os.db"
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    checks: list[tuple[str, bool]] = []
    shot = iter(range(1, 100))

    def check(name: str, ok: bool) -> None:
        checks.append((name, ok))
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    def snap(page: Page, name: str) -> None:
        page.screenshot(path=str(out / f"{next(shot):02d}-{name}.png"))

    def api(page: Page, path: str):
        token = json.loads(page.evaluate("localStorage.getItem('jos.token')"))
        req = urllib.request.Request(base + path, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read())

    server = start_server(port, db)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(slow_mo=args.slow)
        ctx = browser.new_context(viewport={"width": 1366, "height": 900}, record_video_dir=str(out / "video"),
                                  record_video_size={"width": 1366, "height": 900})
        a = ctx.new_page()
        errors: list[str] = []
        a.on("pageerror", lambda e: errors.append(str(e)))
        try:
            # 1. Sign in and set up #general with PATCH
            a.goto(f"{base}/os/")
            a.fill("#handle", "kj")
            a.click("text=Open Journal OS")
            a.click("#dock [data-app=channels]")
            a.click("#hx-boot")
            expect(a.locator(".hx-head h2")).to_have_text("#general")
            expect(a.locator("#hx-live")).to_have_class(re.compile(r"\bon\b"))
            check("channel view opens with a live connection", True)
            ws = api(a, "/api/os/me")["workspaces"][0]["id"]

            # 2. Second tab on the same channel
            b = ctx.new_page()
            b.on("pageerror", lambda e: errors.append(str(e)))
            b.goto(f"{base}/os/#channels")
            expect(b.locator(".hx-head h2")).to_have_text("#general")
            expect(b.locator("#hx-live")).to_have_class(re.compile(r"\bon\b"))

            # 3. @mention with autocomplete, then send
            a.bring_to_front()
            a.click("#hx-input")
            a.keyboard.type("@pa")
            expect(a.locator("#hx-mentions li")).to_have_count(1)
            check("typing @pa suggests PATCH", "PATCH" in a.locator("#hx-mentions li").inner_text())
            a.keyboard.press("Enter")
            a.keyboard.type("schedule a robotics build session tomorrow at 11 for 90 minutes")
            snap(a, "composer-mention")
            a.keyboard.press("Enter")
            card_a = a.locator("#hx-msgs .apv").first
            expect(card_a).to_contain_text(WAITING)
            expect(a.locator("#hx-banner")).to_be_visible()
            snap(a, "pending-card")
            check("agent reply arrives with a pending approval card", True)
            check("nothing is saved before approval", api(a, f"/api/os/w/{ws}/events") == [])
            check("sidebar shows 1 waiting", a.locator(".hx-ch .hx-count").first.inner_text().startswith("1"))

            # 4. The other tab sees it without reloading, and approves it there
            b.bring_to_front()
            card_b = b.locator("#hx-msgs .apv").first
            expect(card_b).to_contain_text(WAITING, timeout=8000)
            check("second tab receives the message and card live", True)
            card_b.locator("[data-decide=approve]").click()
            expect(b.locator("#hx-msgs .apv.approved")).to_have_count(1)
            a.bring_to_front()
            expect(a.locator("#hx-msgs .apv.approved")).to_have_count(1, timeout=8000)
            expect(a.locator("#hx-banner")).to_be_hidden()
            snap(a, "approved-card")
            check("first tab shows the approval live", True)
            titles = [e["title"] for e in api(a, f"/api/os/w/{ws}/events")]
            check("approved event saved to the planner", titles == ["Robotics build session"])

            # 5. Result link opens the planner on that day
            a.locator("#hx-msgs .apv.approved a", has_text="Show in planner").click()
            expect(a.locator(".ev", has_text="Robotics build session").first).to_be_visible()
            snap(a, "planner-after-approval")
            check("result link opens the event in the planner", True)

            # 6. Thread reply, then reject the card in the thread
            a.click("#dock [data-app=channels]")
            a.locator("#hx-msgs .hx-msg.human .hx-reply").first.click()
            expect(a.locator("#hx-thread")).to_be_visible()
            a.fill("#hxt-input", "@patch create a journal entry for my robotics build session")
            a.press("#hxt-input", "Enter")
            thread_card = a.locator("#hx-thread-msgs .apv").first
            expect(thread_card).to_contain_text(WAITING)
            snap(a, "thread-card")
            thread_card.locator("[data-decide=reject]").click()
            expect(a.locator("#hx-thread-msgs .apv.rejected")).to_have_count(1)
            check("thread card rejected and nothing written", api(a, f"/api/os/w/{ws}/journal") == [])
            expect(a.locator("#hx-msgs .hx-replies").first).to_contain_text("2 replies")

            # 7. Members dialog lists the agent
            a.click("[data-close-thread]")
            a.click("#hx-members-btn")
            expect(a.locator("#hx-dialog")).to_contain_text("PATCH")
            snap(a, "members")
            a.click("#hx-dialog [data-cancel]")
            check("members dialog shows PATCH as an agent", True)

            # 8. Restart the server; everything is still there
            b.close()
            server.terminate()
            server.wait(5)
            server = start_server(port, db)
            a.goto(f"{base}/os/#channels")
            expect(a.locator("#hx-msgs .apv.approved")).to_have_count(1)
            expect(a.locator("#hx-msgs .hx-replies").first).to_contain_text("2 replies")
            check("messages and decisions survive a restart", True)

            # 9. Phone width
            a.set_viewport_size({"width": 390, "height": 844})
            a.goto(f"{base}/os/#channels")
            expect(a.locator(".hx-head h2")).to_have_text("#general")
            a.locator("#hx-msgs .apv").first.scroll_into_view_if_needed()
            snap(a, "phone")
            wide = a.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("no sideways scrolling at phone width", not wide)
            check("no uncaught page errors", not errors)
        except Exception as exc:  # report and keep the video
            check(f"journey aborted: {exc}", False)
            snap(a, "failure")
        finally:
            ctx.close()
            browser.close()
            server.terminate()
    videos = sorted((out / "video").glob("*.webm"))
    if videos:
        videos[0].rename(out / "channels.webm")
    shutil.rmtree(out / "video", ignore_errors=True)
    failed = [n for n, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed. Output: {out}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
