# PATCH companion teardown: evidence record

**Intended use:** an interactive concept illustration in Journal OS's Companion Device view (`#device`), shown on screen at roughly 900–1400 px wide. The page offers SVG, PNG and PDF downloads of a landscape A3 sheet (420 × 297 mm), not to scale (NTS).

**Status:** concept. PATCH is a fictional product the user is designing. Nothing here is a manufacturing drawing, and every dimension is invented or estimated.

| Feature group | Evidence | How it is used |
|---|---|---|
| Overall size, about 198 × 120 × 90 mm | User's concept sheet "Patch AI Companion Robot" (Dimensions panel: ≈7.8 in tall, 4.7 in wide, 3.5 in deep) | Concept value. Body plus head is about 157 mm and the ears add the rest, so the height with ears up is taller than the sheet's figure |
| Head, ears, face (eyes, nose, smile, one pink cheek), chest light, grey side pods, rounded feet, grey soles, collar | The three user renders: PIP sheet, Patch sheet, front render | Reconstructed silhouettes and proportions, estimated |
| Lime ear LED panels, pink blush | Renders | Starting colors for those parts; you can change them in the color panel |
| Front and rear shell split for the head and chest | Exploded views on both concept sheets | Concept: one parting line at y = 0 per shell |
| Camera, speaker, mic pods, processor board (NPU), battery, servos | Callouts on the concept sheets | Illustrative placement and size only. Internals are hidden construction with no real reference |
| Battery 3,000–4,000 mAh | Patch sheet "Key Specs" | The parameter changes the pack's depth (14–22 mm). This is illustrative, not a cell spec |
| Charging dock with pogo pins and an LED ring | Patch sheet "Charging & Docking" | Reconstructed, estimated |
| Ear tilt and arm wave | Front render, which shows a relaxed, playful pose | Concept pose parameters. Ears hinge at their base, and the left arm pivots at the shoulder servo |

## Rebuild and proof

```sh
cd device
npm install                      # jspdf, svg2pdf.js, @fontsource-variable/inter
node ../tools/teardown/scripts/proof.cjs drawing.json proof/ --quick
node ../tools/teardown/scripts/proof.cjs drawing.json proof/          # every extreme + occlusion check
node ../tools/teardown/scripts/build-viewer.cjs drawing.json ../os/device/teardown.html
node ../tools/teardown/scripts/check-viewer.cjs ../os/device/teardown.html check/
```

The model is `device/model.js`; the drawing, parts, parameters and starting colors are in `device/drawing.json`. The tools in `tools/teardown/` are copied from the teardown skill (MIT, github.com/jakubkrehel/skills).
