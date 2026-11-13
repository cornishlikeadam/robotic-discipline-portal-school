#!/usr/bin/env node
// Build the PATCH teardown viewer and give its sliders and switches the Journal OS pixel-world skin.
//   node device/build.cjs            (from the repo root, or anywhere)
// It runs the teardown skill's builder, then inlines os/pixel-controls.js into the page so it stays one
// self-contained file with no network requests.
const path = require('node:path'), fs = require('node:fs');
const build = require('../tools/teardown/scripts/build-viewer.cjs');
const here = __dirname, out = path.join(here, '../os/device/technical.html');
build(path.join(here, 'drawing.json'), out);
const controls = fs.readFileSync(path.join(here, '../os/pixel-controls.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(out, 'utf8');
const at = html.lastIndexOf('</body>');
if (at < 0) throw Error('No </body> in the built viewer');
fs.writeFileSync(out, html.slice(0, at) + `<script id="pixel-controls">\n${controls}\n</script>\n` + html.slice(at));
console.log(out);
