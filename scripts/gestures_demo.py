#!/usr/bin/env python3
"""Phone gestures in Journal OS, with real touch events in headless Chromium (390 x 844).

  bottom nav (four 44px+ tabs) -> tap a tab -> swipe left/right on the content to change views, no wrap at
  the ends -> a swipe that starts in a text field does nothing -> the Barnacle bubble sits above the nav ->
  short drag on the sheet header springs back, a long one closes it -> planner buttons are 44px tall ->
  tapping a month cell opens that day -> no sideways scroll -> desktop has no bottom nav.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/gestures_demo.py --out demo-output/gestures
"""

from __future__ import annotations

import argparse
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo-output/gestures")
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    server = subprocess.Popen([sys.executable, "-m", "journal_os.server", "--port", str(port), "--db", str(out / "t.db"),
                               "--no-automations"], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              env={"JOURNAL_OS_QUIET": "1", "PATH": "/usr/bin:/bin"})
    for _ in range(100):
        try:
            urllib.request.urlopen(f"{base}/api/os/health", timeout=0.5)
            break
        except Exception:
            time.sleep(0.05)
    checks: list[tuple[str, bool]] = []
    shot = iter(range(1, 100))

    def check(name: str, ok: bool) -> None:
        checks.append((name, ok))
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    def snap(page: Page, name: str) -> None:
        page.wait_for_timeout(350)
        page.screenshot(path=str(out / f"{next(shot):02d}-{name}.png"))

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                                      device_scale_factor=2)
            page = ctx.new_page()
            cdp = ctx.new_cdp_session(page)
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))

            def swipe(x0: float, y0: float, x1: float, y1: float, steps: int = 8, hold_ms: int = 0) -> None:
                """A real one-finger drag from (x0, y0) to (x1, y1)."""
                cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
                for i in range(1, steps + 1):
                    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [
                        {"x": x0 + (x1 - x0) * i / steps, "y": y0 + (y1 - y0) * i / steps}]})
                    page.wait_for_timeout(12)
                if hold_ms:
                    page.wait_for_timeout(hold_ms)
                cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                page.wait_for_timeout(450)

            view = lambda: page.evaluate("location.hash")  # noqa: E731

            page.goto(f"{base}/os/")
            page.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")
            page.fill("#handle", "kj")
            page.tap("text=Open Journal OS")
            expect(page.locator("#tabbar")).to_be_visible()

            # 1. Bottom nav
            tabs = page.locator("#tabbar a")
            boxes = [tabs.nth(i).bounding_box() for i in range(tabs.count())]
            check(f"bottom nav shows {tabs.count()} tabs, each at least 44px",
                  tabs.count() == 4 and all(b["height"] >= 44 and b["width"] >= 44 for b in boxes))
            nav = page.locator("#tabbar").bounding_box()
            bub = page.locator("#bn-bubble").bounding_box()
            check("the Barnacle bubble sits above the bottom nav", bub["y"] + bub["height"] <= nav["y"])
            snap(page, "bottom-nav")
            page.tap("#tabbar [data-tab=journal]")
            expect(page.locator("#view h1")).to_have_text("Living Journal")
            check("tapping a tab changes the view and marks it current",
                  page.locator("#tabbar [aria-current=page]").get_attribute("data-tab") == "journal")

            # 2. Swipe between views
            swipe(320, 620, 60, 630)
            a = view()
            swipe(60, 620, 320, 630)
            b = view()
            check("swiping left goes to Companion, and swiping right comes back", (a, b) == ("#companion", "#journal"))
            swipe(60, 620, 320, 630)
            swipe(60, 620, 320, 630)
            check("at the first view a right swipe stops instead of wrapping", view() == "#planner")
            swipe(200, 500, 215, 760)
            check("a vertical swipe doesn't change the view", view() == "#planner")

            # 3. Swipes inside a text field are left alone
            page.tap("#tabbar [data-tab=journal]")
            page.tap("#new-entry")
            body = page.locator("#je-body")
            body.scroll_into_view_if_needed()
            page.locator("#je-body").blur()
            bb = body.bounding_box()
            swipe(bb["x"] + bb["width"] - 30, bb["y"] + 40, bb["x"] + 30, bb["y"] + 44)
            check("a swipe that starts in the entry text box doesn't change the view", view().startswith("#journal"))
            page.evaluate("document.activeElement && document.activeElement.blur()")

            # 4. Barnacle sheet: short drag springs back, long drag closes
            page.tap("#tabbar [data-tab=planner]")
            page.wait_for_timeout(400)
            page.tap("#bn-bubble")
            panel = page.locator("#bn-panel")
            expect(panel).to_be_visible()
            panel.evaluate("el => Promise.all(el.getAnimations().map((a) => a.finished))")
            pb = panel.bounding_box()
            check("the sheet reaches the bottom edge", abs(pb["y"] + pb["height"] - 844) < 2)
            hx, hy = pb["x"] + 195, pb["y"] + 12
            swipe(hx, hy, hx, hy + 50, steps=10, hold_ms=500)
            check("a short drag on the handle springs back", panel.is_visible() and abs(panel.bounding_box()["y"] - pb["y"]) < 2)
            snap(page, "sheet")
            swipe(hx, hy, hx, hy + 260, steps=10)
            page.wait_for_timeout(300)
            check("swiping the handle down closes the sheet", panel.is_hidden() and page.evaluate("B.mode") == "closed")
            check("the bottom nav and bubble are back after closing", page.locator("#tabbar").is_visible() and page.locator("#bn-bubble").is_visible())

            # 5. Touch targets and the month view
            heights = page.locator(".view-head .btn").evaluate_all("els => els.map((e) => e.getBoundingClientRect().height)")
            check(f"planner toolbar buttons are at least 44px tall (smallest {min(heights):.0f}px)", min(heights) >= 44)
            action = page.evaluate("getComputedStyle(document.querySelector('.view-head .btn')).touchAction")
            check("buttons use touch-action: manipulation (no tap delay)", action == "manipulation")
            page.tap("[data-view=month]")
            cell = page.locator(".mcell:not(.other)").nth(9)
            day = cell.get_attribute("data-day")
            cb = cell.bounding_box()
            snap(page, "month")
            cell.tap(position={"x": cb["width"] / 2, "y": cb["height"] - 10})
            page.wait_for_timeout(400)
            shown = page.evaluate("[S.view, dayKey(S.cursor)]")
            check(f"month cells are {cb['height']:.0f}px tall, and tapping one opens that day", cb["height"] >= 44 and shown == ["day", day])
            snap(page, "day")
            wide = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("no sideways scrolling on the phone", not wide)

            # 6. Desktop is unchanged: no bottom nav, month cells don't jump to the day view
            desk = browser.new_context(viewport={"width": 1366, "height": 900})
            dp = desk.new_page()
            dp.on("pageerror", lambda e: errors.append(str(e)))
            dp.goto(f"{base}/os/")
            dp.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")
            dp.fill("#handle", "kj")
            dp.click("text=Open Journal OS")
            dp.click("[data-view=month]")
            dp.locator(".mcell:not(.other)").nth(9).click()
            dp.wait_for_timeout(300)
            check("desktop: no bottom nav, and the month view behaves as before",
                  dp.locator("#tabbar").is_hidden() and dp.evaluate("S.view") == "month")
            check("no uncaught page errors", not errors)
            browser.close()
    except Exception as exc:
        check(f"aborted: {exc}", False)
    finally:
        server.terminate()
    failed = [n for n, ok in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed. Output: {out}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
