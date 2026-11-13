#!/usr/bin/env python3
"""The Companion Device pixel world, used the way a person would, in headless Chromium.

  open the device tab -> the scene paints and keeps moving -> drag the Explode slider with the mouse ->
  arrow keys on Battery (low battery turns the status red) -> Ears, Time of day and Zoom each change
  the picture -> tap a part to isolate it, the dropdown follows -> a swatch recolors that part ->
  Reset -> PNG, SVG and PDF downloads are real files -> phone width: stacked, 44px targets, a tap
  selects -> frames per second.

Requires: pip install playwright && python -m playwright install chromium
Usage:    python3 scripts/device_demo.py --out demo-output/device
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
# Where on the canvas (as a fraction) a part sits when fully exploded.
BATTERY = (190 / 256, 137 / 200)
HEAD_SHELL = (64 / 256, 70 / 200)
EMPTY = (236 / 256, 120 / 200)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo-output/device")
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

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"{base}/os/")
            page.evaluate("localStorage.setItem('jos.barnacle.intro', 'true')")
            page.fill("#handle", "kj")
            page.click("text=Open Journal OS")
            page.click("#dock [data-app=device]")
            page.locator(".dv-frame").evaluate("el => el.scrollIntoView({block: 'end'})")
            f = page.frame_locator(".dv-frame iframe")
            scene = f.locator("#scene")
            expect(scene).to_be_visible()
            page.wait_for_timeout(1500)  # the opening explode

            def snap(name: str) -> None:
                page.wait_for_timeout(300)
                page.screenshot(path=str(out / f"{next(shot):02d}-{name}.png"))

            def state(expr: str):
                return scene.evaluate(f"() => {{ const S = PatchWorld.state; return {expr}; }}")

            def digest() -> str:
                """A fingerprint of the picture, to tell whether a control changed it."""
                return scene.evaluate("""(c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                    let h = 0; for (let i = 0; i < d.length; i += 53) h = (h * 31 + d[i]) >>> 0; return String(h); }""")

            def click_at(frac) -> None:
                b = scene.bounding_box()
                page.mouse.click(b["x"] + b["width"] * frac[0], b["y"] + b["height"] * frac[1])

            colors = scene.evaluate("""(c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                const s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s.size; }""")
            check(f"the scene paints in the device tab ({colors} palette colours sampled)", colors > 12)
            a = digest()
            page.wait_for_timeout(1300)
            check("it keeps moving while idle", digest() != a)
            n = f.locator("pw-slider").count()
            check(f"all {n} sliders are pixel-world sliders with a value shown", n == 5 and f.locator("output").count() == 5)
            snap("exploded")

            # Explode: drag with the mouse
            ex = f.locator("pw-slider:has(#explode)")
            b = ex.bounding_box()
            page.mouse.move(b["x"] + b["width"] * 0.95, b["y"] + b["height"] / 2)
            page.mouse.down()
            page.mouse.move(b["x"] + b["width"] * 0.03, b["y"] + b["height"] / 2, steps=12)
            page.mouse.up()
            page.wait_for_timeout(1100)
            check("dragging Explode to the left assembles PATCH",
                  f.locator("#explode-out").inner_text() == "Assembled" and state("S.e") < 0.05)
            snap("assembled")

            # Battery: keyboard
            batt = f.locator("#battery")
            batt.focus()
            for _ in range(60):
                page.keyboard.press("ArrowLeft")
            page.wait_for_timeout(200)
            check("arrow keys drain the battery, and under 20% the status light turns red",
                  f.locator("#battery-out").inner_text() == "12% · low" and state("S.batteryColor") == "#e0503a")

            # Each remaining slider changes the picture
            changed = []
            for sid, value in (("ears", 10), ("tod", 22), ("zoom", 220)):
                before = digest()
                f.locator(f"#{sid}").evaluate("(el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); }", value)
                page.wait_for_timeout(700)
                changed.append(digest() != before)
            check("Ears, Time of day and Zoom each change the picture, and show their value",
                  all(changed) and f.locator("#tod-out").inner_text() == "22:00" and f.locator("#zoom-out").inner_text() == "220%")
            snap("night-zoomed")

            # Isolate by tapping, then recolor
            f.locator("#reset").click()
            page.wait_for_timeout(1300)
            click_at(BATTERY)
            page.wait_for_timeout(300)
            check("clicking the battery isolates it, and the dropdown follows",
                  state("S.sel") == "battery" and f.locator("#part").input_value() == "battery")
            f.locator("[data-tint=lime]").click()
            check("a swatch recolors only the selected part",
                  state("[S.tint.battery, S.tint.head]") == ["lime", "cream"]
                  and f.locator("[data-tint=lime]").get_attribute("aria-pressed") == "true")
            snap("isolated")
            f.locator("#part").select_option("")
            f.locator("[data-tint=blush]").click()
            check("with nothing isolated, a swatch recolors the whole shell",
                  state("[S.tint.head, S.tint.body, S.tint.ear_l, S.tint.battery]") == ["blush", "blush", "blush", "lime"])
            click_at(EMPTY)
            f.locator("#reset").click()
            check("Reset restores colours and sliders", state("[S.tint.head, S.tint.battery, S.sel, S.battery]") == ["cream", "clay", "", 72])

            # Downloads
            page.wait_for_timeout(1200)
            sizes = {}
            for kind, magic in (("png", b"\x89PNG"), ("svg", b"<svg"), ("pdf", b"%PDF-1.4")):
                with page.expect_download(timeout=15000) as d:
                    f.locator(f"#dl-{kind}").click()
                data = pathlib.Path(d.value.path()).read_bytes()
                sizes[kind] = (len(data), data.startswith(magic), d.value.suggested_filename)
                (out / d.value.suggested_filename).write_bytes(data)
            pdf = (out / "patch-pixel-world.pdf").read_bytes()
            ok_pdf = pdf.rstrip().endswith(b"%%EOF") and b"/Width 256" in pdf and len(pdf) > 256 * 200 * 3
            check(f"PNG, SVG and PDF download as real files ({', '.join(f'{k} {v[0] // 1024} KB' for k, v in sizes.items())})",
                  all(v[1] for v in sizes.values()) and ok_pdf)

            fps = scene.evaluate("""() => new Promise((done) => { let n = 0; const t0 = performance.now();
                (function loop(now) { n++; if (now - t0 < 2000) requestAnimationFrame(loop); else done(n / ((now - t0) / 1000)); })(t0); })""")
            check(f"runs at {fps:.0f} frames per second", fps >= 30)

            # Phone
            phone = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pp = phone.new_page()
            pp.on("pageerror", lambda e: errors.append(str(e)))
            pp.goto(f"{base}/os/device/teardown.html")
            expect(pp.locator("#scene")).to_be_visible()
            pp.wait_for_timeout(1500)
            sb = pp.locator("#scene").bounding_box()
            pp.touchscreen.tap(sb["x"] + sb["width"] * HEAD_SHELL[0], sb["y"] + sb["height"] * HEAD_SHELL[1])
            pp.wait_for_timeout(300)
            tapped = pp.evaluate("PatchWorld.state.sel")
            heights = pp.evaluate("[...document.querySelectorAll('.btn, .swatch, select')].map((e) => e.getBoundingClientRect().height)")
            wide = pp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            pp.screenshot(path=str(out / f"{next(shot):02d}-phone.png"))
            check(f"phone: controls stack with no sideways scroll, targets at least 44px (smallest {min(heights):.0f}px)",
                  not wide and min(heights) >= 44 and sb["width"] > 340)
            check("phone: tapping the head shell isolates it", tapped == "head")
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
