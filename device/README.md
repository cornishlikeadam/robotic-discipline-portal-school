# Companion Device: PATCH line drawing (source)

> The Companion Device tab now shows the pixel world in `os/device/teardown.html` and `os/device/patch-world.js` (see JOURNAL_OS.md). This folder builds the earlier technical line drawing, kept at `os/device/technical.html`.

The **Companion Device** card in Journal OS (`/os/#device`) shows an interactive technical illustration of PATCH, the physical companion robot. You can:
- switch between the exploded and assembled views;
- change the ear tilt, left-arm wave and battery capacity (3,000–4,000 mAh) under settings;
- pick a part to isolate it;
- recolor the whole drawing or any single part, with optional fills;
- turn on part labels;
- download SVG, PNG or PDF.

It is a concept drawing, not to scale, and the internals are illustrative (see `evidence.md`).

| File | What it is |
|---|---|
| `model.js` | The geometry: one model, 29 parts, every view derived from it |
| `drawing.json` | Title, parts, parameters and starting colors (lime ear panels, pink blush) |
| `evidence.md` | Where each feature comes from, plus the rebuild and proof commands |
| `../os/device/technical.html` | The built, self-contained viewer that the app loads in a frame (no network requests) |
| `../tools/teardown/` | Builder, renderer and proof scripts from the teardown skill (MIT, github.com/jakubkrehel/skills) |

After editing `model.js` or `drawing.json`, rebuild the viewer:

```sh
cd device && npm install
node ../tools/teardown/scripts/proof.cjs drawing.json proof/ --quick
node build.cjs   # builds the viewer and inlines the pixel-world controls
node ../tools/teardown/scripts/check-viewer.cjs ../os/device/technical.html check/
```
