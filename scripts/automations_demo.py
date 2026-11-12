#!/usr/bin/env python3
"""Drive the three automations end to end in headless Chromium.

The browser's clock is moved by hand (07:30 -> 08:05 -> 20:05 today), and the
local server's own ticker is switched off, so every run here comes from the
browser asking the server what is due, the same path Vercel relies on.

  set up #general + PATCH -> three automations in the sidebar -> 08:05: the
  morning brief appears in #general -> 20:05: the evening prompt lands in the
  PATCH DM, Barnacle shows a badge -> approve the draft in Barnacle -> a
  reflection entry linked to today's event -> weekly review via Run now ->
  turn the morning brief off -> phone width.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/automations_demo.py --out demo-output/automations
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import Page, expect, sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(port: int, db: pathlib.Path) -> subprocess.Popen:
    proc = subprocess.Popen([sys.executable, "-m", "journal_os.server", "--port", str(port), "--db", str(db),
                             "--no-automations"], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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
    ap.add_argument("--out", default="demo-output/automations")
    ap.add_argument("--slow", type=int, default=150, help="ms between actions")
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    today = dt.date.today()
    at = lambda hh, mm: dt.datetime.combine(today, dt.time(hh, mm))  # noqa: E731
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

    def clock(page: Page, when: dt.datetime) -> None:
        page.clock.set_fixed_time(when)
        page.evaluate("AutoTick.run()")  # what the 5-minute interval does

    server = start_server(port, out / "journal_os.db")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(slow_mo=args.slow)
        ctx = browser.new_context(viewport={"width": 1366, "height": 900}, record_video_dir=str(out / "video"),
                                  record_video_size={"width": 1366, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.clock.set_fixed_time(at(7, 30))
            page.goto(f"{base}/os/")
            page.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")  # skip Barnacle's intro peek
            page.fill("#handle", "kj")
            page.click("text=Open Journal OS")
            expect(page.locator("#bn-bubble")).to_be_visible()
            ws = api(page, "GET", "/api/os/me")["workspaces"][0]["id"]
            event = api(page, "POST", f"/api/os/w/{ws}/events",
                        {"title": "Robotics build session", "start_at": f"{today}T11:00", "duration_minutes": 90})

            # 1. Setting up Channels turns on three automations
            page.click("#dock [data-app=channels]")
            page.click("#hx-boot")
            autos = page.locator("#hx-automations .hx-auto")
            expect(autos).to_have_count(3)
            expect(autos.first).to_contain_text("next today")
            snap(page, "sidebar")
            check("setup lists three automations with their next run", True)

            # 2. 08:05: the morning brief appears in #general
            clock(page, at(8, 5))
            brief = page.locator("#hx-msgs .hx-msg", has_text="Morning brief")
            expect(brief).to_have_count(1, timeout=8000)
            expect(brief).to_contain_text("Robotics build session")
            snap(page, "morning-brief")
            check("the morning brief posts in #general at 8", True)
            clock(page, at(8, 30))
            page.wait_for_timeout(800)
            check("it doesn't post twice the same morning", page.locator("#hx-msgs .hx-msg", has_text="Morning brief").count() == 1)

            # 3. 20:05: the evening prompt lands in the PATCH DM, which is Barnacle's conversation
            page.click("#dock [data-app=planner]")
            clock(page, at(20, 5))
            expect(page.locator("#bn-badge")).to_have_text("1", timeout=8000)
            check("Barnacle shows the evening prompt's draft as waiting", True)
            check("nothing is in the journal yet", api(page, "GET", f"/api/os/w/{ws}/journal") == [])
            page.click("#bn-bubble")
            card = page.locator("#bn-msgs .apv.pending").last
            expect(card).to_contain_text("Evening reflection")
            expect(page.locator("#bn-msgs")).to_contain_text("How did today go?")
            page.locator("#bn-panel").evaluate("el => Promise.all(el.getAnimations().map((a) => a.finished))")
            snap(page, "evening-prompt")
            card.locator("[data-decide=approve]").click()
            expect(page.locator("#bn-msgs .apv.approved")).to_have_count(1)
            entries = api(page, "GET", f"/api/os/w/{ws}/journal")
            check("approving saves a reflection linked to today's event",
                  len(entries) == 1 and entries[0]["event_id"] == event["id"] and entries[0]["tags"] == ["reflection"])
            page.click("[data-bn=close]")

            # 4. Weekly review on demand, then turn the morning brief off
            page.click("#dock [data-app=channels]")
            page.locator("#hx-automations .hx-auto", has_text="Weekly review").click()
            expect(page.locator("#hx-dialog")).to_be_visible()
            snap(page, "automation-dialog")
            page.click("#hx-dialog [data-run-automation]")
            expect(page.locator("#hx-msgs .hx-msg", has_text="Weekly review")).to_have_count(1, timeout=8000)
            snap(page, "weekly-review")
            check("Run now posts the weekly review", True)
            page.locator("#hx-automations .hx-auto", has_text="Morning brief").click()
            page.locator("#hx-dialog input[name=enabled]").uncheck()
            page.click("#hx-dialog button[type=submit]")
            expect(page.locator("#hx-automations .hx-auto.off")).to_have_count(1)
            brief_row = [a for a in api(page, "GET", f"/api/os/w/{ws}/automations") if a["kind"] == "morning_brief"][0]
            check("turning the morning brief off is saved", brief_row["enabled"] is False)

            # 5. Phone width
            page.set_viewport_size({"width": 390, "height": 844})
            page.reload()
            expect(page.locator("#hx-automations .hx-auto")).to_have_count(3)
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
        videos[0].rename(out / "automations.webm")
    shutil.rmtree(out / "video", ignore_errors=True)
    failed = [n for n, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed. Output: {out}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
