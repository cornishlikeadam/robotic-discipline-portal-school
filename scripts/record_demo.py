#!/usr/bin/env python3
"""Drive the real Journal OS UI end to end in headless Chromium and record it.

Covers the MVP journey, including a genuine server restart:
  manual event -> natural-language request -> preview -> approve -> planner
  -> linked journal entry -> companion memory proposal -> approval
  -> companion sandbox session -> discovery entry -> RESTART -> data still there.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/record_demo.py --out demo-output
Outputs:  <out>/journey.webm, <out>/NN-*.png, and a pass/fail line per check.
"""

from __future__ import annotations

import argparse
import datetime as dt
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
    ap.add_argument("--out", default="demo-output")
    ap.add_argument("--slow", type=int, default=350, help="ms between actions (for a watchable recording)")
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    db = out / "journal_os.db"
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    checks: list[tuple[str, bool]] = []
    shot = iter(range(1, 100))

    def check(name: str, ok: bool) -> None:
        checks.append((name, ok))
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    def snap(page: Page, name: str) -> None:
        page.screenshot(path=str(out / f"{next(shot):02d}-{name}.png"))

    server = start_server(port, db)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(slow_mo=args.slow)
        ctx = browser.new_context(viewport={"width": 1366, "height": 860}, record_video_dir=str(out / "video"),
                                  record_video_size={"width": 1366, "height": 860})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            # 1. Sign in
            page.goto(f"{base}/os/")
            page.fill("#handle", "kj")
            page.click("text=Open Journal OS")
            expect(page.locator("#dock .card")).to_have_count(12)
            snap(page, "planner-empty")

            # 2. Manual event
            page.click("#new-event")
            page.fill("#ef-title", "Studio critique prep")
            page.fill("#ef-date", tomorrow)
            page.fill("#ef-time", "09:00")
            page.fill("#ef-dur", "45")
            page.click("#event-form button[type=submit]")
            expect(page.locator(".ev", has_text="Studio critique prep").first).to_be_visible()
            check("manual event appears in planner", True)

            # 3. Natural-language request -> preview -> approve
            page.fill("#command-input", "Schedule a robotics build session tomorrow at 11 for 90 minutes")
            page.click("#command-form button[type=submit]")
            expect(page.locator("#preview")).to_contain_text("NOTHING SAVED YET")
            snap(page, "preview")
            check("preview shows 90 min at 11:00", page.input_value("#pv-time") == "11:00"
                  and page.input_value("#pv-dur") == "90")
            page.click("#pv-approve")
            expect(page.locator("#preview")).to_contain_text("Saved “Robotics build session”")
            ev = page.locator(".ev", has_text="Robotics build session").first
            expect(ev).to_be_visible()
            snap(page, "approved-in-planner")
            check("NL event lands in the same planner", True)

            # 4. Linked journal entry via request
            page.fill("#command-input", "Create a journal entry for my robotics build session")
            page.click("#command-form button[type=submit]")
            expect(page.locator("#pv-link")).to_be_visible()
            check("journal preview pre-links the event",
                  "Robotics build session" in page.locator("#pv-link option:checked").inner_text())
            page.click("#pv-approve")
            page.click("text=Open entry")
            expect(page.locator("#je-title")).to_have_value("Robotics build session")
            page.fill("#je-body", "Printed shell v2 at 2.4mm walls. Neck joint still wobbles; try brass inserts.")
            page.fill("#je-tags", "robotics, prototype")
            page.click("#je-save")
            expect(page.locator("#dirty")).to_have_text("Saved")
            snap(page, "journal-linked")

            # 5. Navigate away and back — content and link persist
            page.click("#dock [data-app=planner]")
            page.click("#dock [data-app=journal]")
            page.locator(".entry-list button", has_text="Robotics build session").click()
            check("journal body persists across navigation",
                  "Printed shell v2" in page.input_value("#je-body"))
            check("journal link persists across navigation",
                  "Robotics build session" in page.locator("#je-event option:checked").inner_text())

            # 6. Companion memory proposal -> approval
            page.click("#je-mem")
            page.click("#mf-go")
            page.click("text=Review it in the ledger →")
            expect(page.locator(".mem.proposed")).to_have_count(1)
            snap(page, "memory-proposed")
            page.click(".mem.proposed [data-act=approve]")
            expect(page.locator(".mem:not(.proposed)", has_text="Printed shell v2")).to_be_visible()
            snap(page, "memory-approved")
            check("memory approved in ledger", True)

            # 7. Companion sandbox session
            page.click("#dock [data-app=together]")
            page.click("#tg-plan")
            expect(page.locator("#preview")).to_contain_text("companion sandbox calendar")
            page.click("#pv-approve")
            page.click("#dock [data-app=together]")
            page.locator("[data-run]").first.click()
            expect(page.locator(".chip.fictional").first).to_be_visible()
            snap(page, "sandbox-discovery")
            check("sandbox discovery entry is marked fictional", True)

            # 8. Restart the server process and reload
            server.terminate()
            server.wait(5)
            server = start_server(port, db)
            page.goto(f"{base}/os/#planner")
            expect(page.locator(".ev", has_text="Robotics build session").first).to_be_visible()
            expect(page.locator(".ev", has_text="Studio critique prep").first).to_be_visible()
            snap(page, "after-restart-planner")
            page.click("#dock [data-app=companion]")
            expect(page.locator(".mem:not(.proposed)", has_text="Printed shell v2")).to_be_visible()
            snap(page, "after-restart-memory")
            check("events + approved memory survive restart", True)

            # 9. Planned modules are labelled honestly
            page.click("#dock [data-app=world]")
            expect(page.locator(".status-card")).to_contain_text("does not pretend to work")
            check("planned module labelled as planned", True)
            check("no uncaught page errors", not errors)
        except Exception as exc:  # report and keep the video
            check(f"journey aborted: {exc}", False)
            snap(page, "failure")
        finally:
            ctx.close()
            browser.close()
            server.terminate()
    videos = list((out / "video").glob("*.webm"))
    if videos:
        videos[0].rename(out / "journey.webm")
        shutil.rmtree(out / "video", ignore_errors=True)
    failed = [n for n, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed. Output: {out}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
