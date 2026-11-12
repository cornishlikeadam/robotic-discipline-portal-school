#!/usr/bin/env python3
"""Barnacle on a phone, end to end in headless Chromium (390 x 844, touch).

  bubble is a 56px target in the bottom-right -> drag it to the top-left (snaps, and stays there after a
  reload) -> the "Move Barnacle" button moves it back without dragging -> set up PATCH from the empty sheet
  -> empty state -> send (a slow server shows the message at once and "thinking") -> pending pill and
  44px card buttons -> change views: the sheet shrinks to the mini player, which stays on every view ->
  tap it, approve -> a failed send keeps the text and offers Try again -> a model failure shows the
  stand-in notice -> typing elsewhere hides Barnacle -> scrolling down tucks it -> reduced motion stops
  the float -> desktop: side panel stays open across views.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/barnacle_phone_demo.py --out demo-output/barnacle-phone
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

from playwright.sync_api import Page, Route, expect, sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent
ASK = "Schedule a robotics build session tomorrow at 11 for 90 minutes"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo-output/barnacle-phone")
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

    def center(page: Page, sel: str):
        b = page.locator(sel).bounding_box()
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, b

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                                      device_scale_factor=2)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/os/")
            page.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")
            page.fill("#handle", "kj")
            page.click("text=Open Journal OS")
            expect(page.locator("#bn-bubble")).to_be_visible()

            # 1. Target size and corner
            x, y, b = center(page, "#bn-bubble")
            check(f"bubble is a {b['width']:.0f}px target in the bottom-right",
                  b["width"] >= 48 and b["height"] >= 48 and x > 300 and y > 740)

            # 2. Drag to the top-left; it snaps there and stays after a reload
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(120, 300, steps=10)
            page.mouse.move(60, 200, steps=6)
            page.mouse.up()
            page.wait_for_timeout(450)
            corner = page.locator("#bn-dock").get_attribute("data-corner")
            panel_opened = page.locator("#bn-panel").is_visible()
            page.reload()
            expect(page.locator("#bn-bubble")).to_be_visible()
            x2, y2, _ = center(page, "#bn-bubble")
            check("dragging snaps it to the nearest corner and it stays there after a reload (without opening it)",
                  corner == "tl" and not panel_opened and x2 < 100 and y2 < 200)
            snap(page, "top-left")

            # 3. Empty sheet -> set up PATCH -> empty state
            page.click("#bn-bubble")
            panel = page.locator("#bn-panel")
            expect(panel).to_be_visible()
            page.locator("#bn-panel").evaluate("el => Promise.all(el.getAnimations().map((a) => a.finished))")
            pb = panel.bounding_box()
            check("the chat opens as a full-width bottom sheet", pb["width"] >= 388 and abs(pb["y"] + pb["height"] - 844) < 2)
            page.click("[data-bn=setup]")
            expect(page.locator("#bn-msgs .bn-empty")).to_contain_text("No messages yet")
            heads = [page.locator(f"#bn-panel [data-bn={a}]").bounding_box() for a in ("minimize", "close")]
            check("header has Minimize and Close as 44px targets", all(h["width"] >= 44 and h["height"] >= 44 for h in heads))
            snap(page, "empty-state")
            page.click("[data-bn=flip-side]")
            page.wait_for_timeout(400)
            check("“Move Barnacle to the right” moves it without dragging",
                  page.locator("#bn-dock").get_attribute("data-corner") == "tr")

            # 4. Slow server: the message shows at once with "thinking"
            def slow(route: Route) -> None:
                time.sleep(2.5)
                route.continue_()
            page.route(re.compile(r".*/api/os/channels/[\w-]+/messages$"), lambda r: slow(r) if r.request.method == "POST" else r.continue_())
            page.fill("#bn-input", ASK)
            page.press("#bn-input", "Enter")
            expect(page.locator("#bn-msgs .bn-sending")).to_contain_text("robotics build session")
            expect(page.locator("#bn-msgs .bn-typing")).to_be_visible()
            snap(page, "thinking")
            check("your message shows at once and the agent shows it is thinking", True)
            page.unroute(re.compile(r".*/api/os/channels/[\w-]+/messages$"))
            card = page.locator("#bn-msgs .apv.pending").last
            expect(card).to_be_visible(timeout=10000)
            expect(page.locator("#bn-wait")).to_have_text("1 waiting")
            bb = card.locator("[data-decide=approve]").bounding_box()
            check("a pending card raises a “1 waiting” pill, and its buttons are 44px tall", bb["height"] >= 44)
            snap(page, "pending")

            # 5. Change views: the sheet becomes the mini player, on every view
            page.goto(f"{base}/os/#journal")
            mini = page.locator("#bn-mini")
            expect(mini).to_be_visible()
            expect(page.locator("#bn-mini-line")).to_contain_text("waiting for you")
            snap(page, "mini-journal")
            page.goto(f"{base}/os/#companion")
            expect(mini).to_be_visible()
            check("changing views shrinks the chat to a mini player that stays on every view", page.locator("#bn-panel").is_hidden())
            page.click("#bn-mini .bn-mini-open")
            expect(panel).to_be_visible()
            page.locator("#bn-msgs .apv.pending [data-decide=approve]").last.click()
            expect(page.locator("#bn-msgs .apv.approved")).to_have_count(1)
            expect(page.locator("#bn-wait")).to_be_hidden()
            check("tapping the mini player reopens the chat, and approving clears the pill", True)

            # 6. A failed send keeps the text and offers Try again
            page.route(re.compile(r".*/api/os/channels/[\w-]+/messages$"), lambda r: r.abort() if r.request.method == "POST" else r.continue_())
            page.fill("#bn-input", "Create a journal entry for my robotics build session")
            page.press("#bn-input", "Enter")
            expect(page.locator("#bn-msgs .bn-error")).to_contain_text("didn’t send")
            kept = page.locator("#bn-input").input_value()
            snap(page, "error")
            page.unroute(re.compile(r".*/api/os/channels/[\w-]+/messages$"))
            page.click("[data-bn=retry]")
            expect(page.locator("#bn-msgs .apv.pending")).to_have_count(1, timeout=10000)
            check("a failed send keeps your text, and Try again sends it", "robotics build session" in kept)

            # 7. Model failure -> the stand-in notice
            def fallback(route: Route) -> None:
                try:
                    resp = route.fetch()
                except Exception:
                    return
                data = resp.json()
                for m in data:
                    if m["author_type"] == "agent":
                        m["content"] = "(The model didn't answer in time. The rule-based stand-in answered instead.)\n\n" + m["content"]
                try:
                    route.fulfill(response=resp, body=json.dumps(data))
                except Exception:
                    pass
            page.route(re.compile(r".*/api/os/channels/[\w-]+/messages\?limit=40$"), fallback)
            page.click("[data-bn=minimize]")
            page.click("#bn-mini .bn-mini-open")
            expect(page.locator("#bn-msgs .bn-fallback").first).to_contain_text("stand-in replied")
            text = page.locator("#bn-msgs .hx-msg.agent .hx-text").first.inner_text()
            check("when the model fails, the reply shows a quiet stand-in notice", not text.startswith("("))
            page.unroute_all(behavior="ignoreErrors")
            page.click("#bn-panel [data-bn=close]")

            # 8. Typing elsewhere hides Barnacle; scrolling down tucks it
            page.goto(f"{base}/os/#journal")
            page.click("text=+ New entry")
            page.locator("#je-body").focus()
            page.wait_for_timeout(300)
            hidden = page.locator("#bn-dock").evaluate("el => getComputedStyle(el).visibility") == "hidden"
            page.locator("#je-body").blur()
            page.wait_for_timeout(300)
            back = page.locator("#bn-dock").evaluate("el => getComputedStyle(el).visibility") == "visible"
            check("Barnacle hides while you type in the journal, and comes back after", hidden and back)
            page.goto(f"{base}/os/#planner")
            page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(1800)  # let any earlier tuck clear
            # A real touch swipe up the page (the mouse wheel doesn't scroll a touch-emulated page).
            ctx.new_cdp_session(page).send("Input.synthesizeScrollGesture", {"x": 195, "y": 600, "yDistance": -420, "speed": 1200})
            dock = page.locator("#bn-dock")
            try:
                expect(dock).to_have_class(re.compile(r"\bbn-tucked\b"), timeout=3000)
                tucked = True
            except AssertionError:
                tucked = False
            snap(page, "tucked")
            try:
                expect(dock).not_to_have_class(re.compile(r"\bbn-tucked\b"), timeout=4000)
                untucked = True
            except AssertionError:
                untucked = False
            check("scrolling down tucks it to the edge, and it comes back when you stop", tucked and untucked)

            # 9. Reduced motion: no float
            page.emulate_media(reduced_motion="reduce")
            page.reload()
            expect(page.locator("#bn-bubble")).to_be_visible()
            anim = page.locator("#bn-bubble .bn-orb").evaluate("el => getComputedStyle(el).animationName")
            check("with reduced motion the bubble doesn't float", anim in ("none", ""))
            wide = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("no sideways scrolling on the phone", not wide)

            # 10. Desktop: a side panel that stays open across views
            desk = browser.new_context(viewport={"width": 1366, "height": 900})
            dp = desk.new_page()
            dp.on("pageerror", lambda e: errors.append(str(e)))
            dp.goto(f"{base}/os/")
            dp.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")
            dp.fill("#handle", "kj")
            dp.click("text=Open Journal OS")
            dp.click("#bn-bubble")
            expect(dp.locator("#bn-panel")).to_be_visible()
            box = dp.locator("#bn-panel").bounding_box()
            dp.click("#dock [data-app=journal]")
            dp.wait_for_timeout(400)
            check("desktop: a tall side panel that stays open when you change views",
                  dp.locator("#bn-panel").is_visible() and box["height"] > 600 and box["width"] <= 420)
            snap(dp, "desktop")
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
