#!/usr/bin/env python3
"""Use the pixel-world controls the way a person would, in headless Chromium.

Switches (automation on/off, agent permissions, event "Completed"), the live indicator in Channels,
and the PATCH teardown's sliders: real mouse presses and drags, the keyboard, desktop and phone widths,
many controls on one page, and frames per second while they animate.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/pixel_controls_demo.py --out demo-output/pixel-controls
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

from playwright.sync_api import expect, sync_playwright

REPO = pathlib.Path(__file__).resolve().parent.parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo-output/pixel-controls")
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

    def check(name: str, ok: bool) -> None:
        checks.append((name, ok))
        print(("PASS " if ok else "FAIL ") + name, flush=True)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1366, "height": 900})
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/os/")
            page.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")
            page.fill("#handle", "kj")
            page.click("text=Open Journal OS")

            # Channels: live indicator, then an automation's on/off switch
            page.click("#dock [data-app=channels]")
            page.click("#hx-boot")
            expect(page.locator("pw-status + #hx-live")).to_have_count(1)
            check("live indicator gets its pixel antenna", True)
            page.locator("#hx-automations .hx-auto", has_text="Morning brief").click()
            sw = page.locator("#hx-dialog pw-switch")
            expect(sw).to_have_count(1)
            box = sw.bounding_box()
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.mouse.down()
            page.wait_for_timeout(120)
            page.screenshot(path=str(out / "01-switch-pressed.png"), clip={"x": box["x"] - 40, "y": box["y"] - 30, "width": 260, "height": 100})
            page.mouse.up()
            enabled = sw.locator("input").is_checked()
            check("a real mouse press turns the switch off", enabled is False)
            page.wait_for_timeout(500)
            page.screenshot(path=str(out / "02-automation-dialog.png"))
            sw.locator("input").focus()
            page.keyboard.press("Space")
            check("Space turns it back on", sw.locator("input").is_checked())
            focused = page.evaluate("document.activeElement.matches(':focus-visible')")
            check("keyboard focus is visible (drawn in the art)", focused)
            page.keyboard.press("Space")
            page.click("#hx-dialog button[type=submit]")
            expect(page.locator("#hx-automations .hx-auto.off")).to_have_count(1)
            check("the form still reads the wrapped checkbox (saved as off)", True)

            # Many switches at once: the new-agent dialog's permissions
            page.click("[data-new-agent]")
            n = page.locator("#hx-dialog pw-switch").count()
            fps = page.evaluate("""() => new Promise((done) => { let n = 0; const t0 = performance.now();
                (function f(now) { n++; if (now - t0 < 2000) requestAnimationFrame(f); else done(n / ((now - t0) / 1000)); })(t0); })""")
            check(f"{n} switches on one dialog, {fps:.0f} frames per second", n >= 4 and fps >= 45)
            page.screenshot(path=str(out / "03-agent-permissions.png"))
            page.keyboard.press("Escape")

            # Teardown sliders inside the device tab
            page.click("#dock [data-app=device]")
            frame = page.frame_locator(".dv-frame iframe")
            expect(frame.locator("#render-status")).to_have_text("Drawing updated", timeout=30000)
            page.locator(".dv-frame").evaluate("el => el.scrollIntoView({block: 'end'})")
            frame.locator("#settings-toggle").click()
            sliders = frame.locator("#settings-panel pw-slider")
            expect(sliders.first).to_be_visible()
            count = sliders.count()
            ear = frame.locator("#parameters pw-slider").first
            before = ear.locator("input").input_value()
            b = ear.bounding_box()
            page.mouse.move(b["x"] + b["width"] * 0.2, b["y"] + b["height"] / 2)
            page.mouse.down()
            page.mouse.move(b["x"] + b["width"] * 0.85, b["y"] + b["height"] / 2, steps=12)
            page.mouse.up()
            after = ear.locator("input").input_value()
            check(f"dragging the ear-tilt slider with the mouse moves it ({before} → {after}°; {count} sliders skinned)", int(after) > int(before) and count >= 4)
            expect(frame.locator("#render-status")).to_have_text("Drawing updated", timeout=30000)
            ear.locator("input").focus()
            page.keyboard.press("ArrowLeft")
            check("arrow keys still step the slider", int(ear.locator("input").input_value()) == int(after) - 1)
            page.wait_for_timeout(400)
            page.screenshot(path=str(out / "04-teardown-sliders.png"))
            frame.locator("#settings-toggle").click()
            frame.locator("#color-toggle").click()
            expect(frame.locator("#color-panel pw-slider")).to_have_count(1)
            check("the hue slider gets the colour rail", True)
            page.wait_for_timeout(300)
            page.screenshot(path=str(out / "05-hue-slider.png"))
            frame.locator("#color-toggle").click()

            # Phone width
            page.set_viewport_size({"width": 390, "height": 844})
            page.goto(f"{base}/os/#channels")
            page.locator("#hx-automations .hx-auto", has_text="Evening").click()
            page.wait_for_timeout(500)
            page.screenshot(path=str(out / "06-phone-dialog.png"))
            wide = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check("no sideways scrolling at 390 px", not wide)
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
