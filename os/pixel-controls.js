// pixel-controls.js: Journal OS sliders, switches and the live indicator as pixel worlds.
// Each control is a real <input> (or the existing .live-dot) with a scene painted in code underneath it.
// Made with the pixel-worlds workflow (github.com/finktheartist/pixel-worlds, MIT): paint smooth, light, crush.
// The painter below (PixelKit) is that project's kit.js, inlined so this stays one file with no globals.
(() => {
  'use strict';
  const root = {};
function PixelKit(opts) {
  const W = opts.w, H = opts.h, PAL = opts.palette, SPREAD = opts.spread ?? 10;
  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const soft = mk(W, H), sctx = soft.getContext('2d', { willReadFrequently: true });
  let g = sctx;

  // ───────── noise and small maths ─────────
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), l = (a, b, t) => a + (b - a) * t; return l(l(hash(xi, yi), hash(xi + 1, yi), sx), l(hash(xi, yi + 1), hash(xi + 1, yi + 1), sx), sy); }
  const fbm = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1, y * 2.1 + 7) + 0.15 * vnoise(x * 4.3, y * 4.3 + 19);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), mix = (a, b, t) => a + (b - a) * t, smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ───────── drawing, on whichever canvas is current ─────────
  const POOL = [];
  function scratch() { const c = POOL.pop() || mk(W, H), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H); return c; }
  const release = (...cs) => { for (const c of cs) if (c) POOL.push(c); };
  // paint onto a spare canvas and get it back; give it to release() when you have drawn it
  function layer(draw) { const L = scratch(), prev = g; g = L.getContext('2d'); g.save(); draw(); g.restore(); g = prev; return L; }
  // draw with these helpers on a canvas of your own
  function on(ctx, draw) { const prev = g; g = ctx; g.save(); draw(); g.restore(); g = prev; }
  function begin() { g = sctx; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); }
  const rc = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  function glow(x, y, r, rgb, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const lin = (x0, y0, x1, y1, ...st) => { const gr = g.createLinearGradient(x0, y0, x1, y1); st.forEach((c, i) => gr.addColorStop(i / (st.length - 1), c)); return gr; };
  const rad = (x, y, r, ...st) => { const gr = g.createRadialGradient(x, y, 0.5, x, y, r); st.forEach((c, i) => gr.addColorStop(i / (st.length - 1), c)); return gr; };
  const ell = (x, y, rx, ry, c, a0 = 0, a1 = 7, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, a0, a1); g.fill(); };
  const fillP = (c, fn) => { g.fillStyle = c; g.beginPath(); fn(g); g.fill(); };
  const strokeP = (c, w, fn) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); fn(g); g.stroke(); };
  const poly = (pts, c) => fillP(c, (k) => pts.forEach(([x, y], i) => (i ? k.lineTo(x, y) : k.moveTo(x, y))));
  function limb(ax, ay, ra, bx, by, rb, col) {   // a tapered capsule: thick at one joint, thinner at the next
    const a = Math.atan2(by - ay, bx - ax), nx = -Math.sin(a), ny = Math.cos(a), q = Math.PI / 2;
    fillP(col, (k) => { k.moveTo(ax + nx * ra, ay + ny * ra); k.lineTo(bx + nx * rb, by + ny * rb); k.arc(bx, by, rb, a + q, a - q, true); k.lineTo(ax - nx * ra, ay - ny * ra); k.arc(ax, ay, ra, a - q, a + q, true); });
  }
  // An arm or a leg: two bones of fixed length from S toward T, so however far it reaches it stays a limb.
  // Returns [elbow, hand]. The hand stops short if T is out of reach. bend is +1 or -1 for which way the joint folds.
  function reach(S, T, U, F, bend = 1) {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1; const m = U + F - 0.4, lo = Math.abs(U - F) + 0.4, k = d > m ? m / d : d < lo ? lo / d : 1; dx *= k; dy *= k; d *= k;
    const e = Math.atan2(dy, dx) + bend * Math.acos(clamp((U * U + d * d - F * F) / (2 * U * d), -1, 1));
    return [[S[0] + U * Math.cos(e), S[1] + U * Math.sin(e)], [S[0] + dx, S[1] + dy]];
  }

  // ───────── light ─────────
  // Paint each thing in its own colours on its own layer, then multiply it by the light:
  // S = { amb: 'rgb(...)', lights: [[x, y, radius, 'r,g,b', strength], ...] }. Things that glow are drawn after, straight onto k.g.
  function lit(L, S) {
    const k = L.getContext('2d'), M = scratch(), m = M.getContext('2d');
    m.fillStyle = S.amb; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'lighter';
    for (const [x, y, r, rgb, a] of S.lights) {
      const s = Math.min(1, a), gr = m.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, `rgba(${rgb},${s})`); gr.addColorStop(0.42, `rgba(${rgb},${s * 0.5})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      m.fillStyle = gr; m.fillRect(0, 0, W, H);
    }
    m.globalCompositeOperation = 'destination-in'; m.drawImage(L, 0, 0);
    k.globalCompositeOperation = 'multiply'; k.drawImage(M, 0, 0); k.globalCompositeOperation = 'source-over'; release(M);
    return L;
  }
  // A strip of light along one side of everything on a layer. dx, dy say how far to shave off the far side, so the strip is left on the side
  // facing (-dx, -dy): rim(L, -1.2, 0, ...) lights right-hand edges, rim(L, 0, 1.2, ...) lights top edges. x, y, r place a falloff, so the rim
  // fades away from the lamp; rgb is 'r,g,b' and a is its strength from 0 to 1. Pass another layer as occ to leave out edges that sit on top of it.
  // Call it after lit(), and use a colour brighter than the surface or you will not see it.
  function rim(L, dx, dy, x, y, r, rgb, a, occ) {
    if (a <= 0) return;
    const k = L.getContext('2d'), R = scratch(), q = R.getContext('2d');
    q.drawImage(L, 0, 0); q.globalCompositeOperation = 'source-in';
    const gr = q.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.6})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, W, H); q.globalCompositeOperation = 'destination-out'; q.drawImage(L, dx, dy); if (occ) q.drawImage(occ, 0, 0);
    k.globalCompositeOperation = 'source-atop'; k.drawImage(R, 0, 0); k.globalCompositeOperation = 'source-over'; release(R);
  }
  // the soft dark shape a layer throws on whatever is behind it; draw it before the layer
  function shadow(L, dx, dy, blur, a) {
    const Sd = scratch(), s = Sd.getContext('2d'); s.filter = `blur(${blur}px)`; s.drawImage(L, dx, dy); s.filter = 'none'; s.globalCompositeOperation = 'source-in'; s.fillStyle = '#03030a'; s.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = a; g.drawImage(Sd, 0, 0); g.restore(); release(Sd);
  }

  // ───────── crush ─────────
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const RGB = PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const PAL32 = new Uint32Array(RGB.map((c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0])), LUT = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let gg = 0; gg < 32; gg++) for (let b = 0; b < 32; b++) {
    let best = 0, bd = 1e9; const R = r * 8 + 4, G = gg * 8 + 4, Bv = b * 8 + 4;
    for (let q = 0; q < RGB.length; q++) { const c = RGB[q], e = 2 * (R - c[0]) ** 2 + 4 * (G - c[1]) ** 2 + 3 * (Bv - c[2]) ** 2; if (e < bd) { bd = e; best = q; } }
    LUT[(r << 10) | (gg << 5) | b] = best;
  }
  const art = mk(W, H), actx = art.getContext('2d'), artImg = actx.createImageData(W, H), art32 = new Uint32Array(artImg.data.buffer);
  // The smooth canvas, snapped to the palette. Returns the art canvas. Anything drawn after this with rc() and ptext() stays exact.
  function crush() {
    const d = sctx.getImageData(0, 0, W, H).data;
    for (let y = 0, i = 0, j = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4, j++) {
      const nz = ((B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * SPREAD;
      let r = d[i] + nz, gg = d[i + 1] + nz, b = d[i + 2] + nz;
      r = r < 0 ? 0 : r > 255 ? 255 : r; gg = gg < 0 ? 0 : gg > 255 ? 255 : gg; b = b < 0 ? 0 : b > 255 ? 255 : b;
      art32[j] = PAL32[LUT[((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)]];
    }
    actx.putImageData(artImg, 0, 0);
    return art;
  }
  // a 4 x 4 threshold for hand-placed dither: bayer(x, y) < t is true for a fraction t of pixels, in a fixed pattern
  const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

  // ───────── lettering, in the same pixels as the art ─────────
  const FONT = {   // 5 x 7, caps only
    A: '.###. #...# #...# ##### #...# #...# #...#', B: '####. #...# #...# ####. #...# #...# ####.', C: '.###. #...# #.... #.... #.... #...# .###.', D: '####. #...# #...# #...# #...# #...# ####.',
    E: '##### #.... #.... ####. #.... #.... #####', F: '##### #.... #.... ####. #.... #.... #....', G: '.###. #...# #.... #.### #...# #...# .###.', H: '#...# #...# #...# ##### #...# #...# #...#',
    I: '### .#. .#. .#. .#. .#. ###', J: '..### ...#. ...#. ...#. ...#. #..#. .##..', K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#', L: '#.... #.... #.... #.... #.... #.... #####',
    M: '#...# ##.## #.#.# #.#.# #...# #...# #...#', N: '#...# ##..# #.#.# #..## #...# #...# #...#', O: '.###. #...# #...# #...# #...# #...# .###.', P: '####. #...# #...# ####. #.... #.... #....',
    Q: '.###. #...# #...# #...# #.#.# #..#. .##.#', R: '####. #...# #...# ####. #.#.. #..#. #...#', S: '.#### #.... #.... .###. ....# ....# ####.', T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    U: '#...# #...# #...# #...# #...# #...# .###.', V: '#...# #...# #...# #...# #...# .#.#. ..#..', W: '#...# #...# #...# #.#.# #.#.# ##.## #...#', X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', Z: '##### ....# ...#. ..#.. .#... #.... #####', 0: '.###. #...# #..## #.#.# ##..# #...# .###.', 1: '.#. ##. .#. .#. .#. .#. ###',
    2: '.###. #...# ....# ...#. ..#.. .#... #####', 3: '####. ....# ....# .###. ....# ....# ####.', 4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.', 5: '##### #.... ####. ....# ....# #...# .###.',
    6: '.###. #.... #.... ####. #...# #...# .###.', 7: '##### ....# ...#. ..#.. ..#.. ..#.. ..#..', 8: '.###. #...# #...# .###. #...# #...# .###.', 9: '.###. #...# #...# .#### ....# ....# .###.',
    '.': '. . . . . . #', "'": '# # . . . . .', '"': '#.# #.# ... ... ... ... ...', '-': '.... .... .... #### .... .... ....',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..', '!': '# # # # # . #', ' ': '... ... ... ... ... ... ...',
  };
  for (const k in FONT) FONT[k] = FONT[k].split(' ');
  const glyphs = (str) => [...str.toUpperCase().replace(/[“”]/g, '"').replace(/’/g, "'")].map((ch) => FONT[ch] || FONT[' ']);
  function ptext(str, x, y, c, bold) { for (const gl of glyphs(str)) { for (let r = 0; r < 7; r++) for (let q = 0; q < gl[r].length; q++) if (gl[r][q] === '#') rc(x + q, y + r, bold ? 2 : 1, 1, c); x += gl[0].length + (bold ? 2 : 1); } }
  const ptextW = (str, bold) => glyphs(str).reduce((a, gl) => a + gl[0].length + (bold ? 2 : 1), -1);
  function ptext2(str, x, y, splitX, cA, cB, w, h) {
    g.save(); g.beginPath(); g.rect(0, 0, splitX, h); g.clip(); ptext(str, x, y, cA, 1); g.restore();
    g.save(); g.beginPath(); g.rect(splitX, 0, w, h); g.clip(); ptext(str, x, y, cB, 1); g.restore();
  }
  Object.assign(FONT, { ':': '. . # . # . .'.split(' '), '/': '..# ..# .#. .#. .#. #.. #..'.split(' '), '_': '.... .... .... .... .... .... ####'.split(' '), ',': '.. .. .. .. .. .# #.'.split(' '), '%': '#..# ...# ..#. ..#. .#.. #... #..#'.split(' ') });

  // ───────── a clock you can stop ─────────
  // run(frame) calls frame(dt) every animation frame. With ?film=1 in the address it does not: it exposes window.__film
  // so a script can step the same frames one at a time, which is how you look at an animation properly.
  function run(frame, duration = 10) {
    const q = new URLSearchParams(location.search);
    if (q.get('film') === '1') {
      let t = 0; const step = (fps = 60) => { t += 1 / fps; frame(1 / fps); };
      root.__film = { duration, step, seek(to, fps = 60) { while (t < to) step(fps); } };
      root.__film.seek(parseFloat(q.get('seek')) || 1 / 60);
    } else { let last = performance.now(); const loop = (now) => { frame(Math.min(0.05, (now - last) / 1000)); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  }
  // put the art on a visible canvas at a whole number of screen pixels per art pixel
  function show(canvas, src = art, scale = 3) { if (canvas.width !== src.width * scale) { canvas.width = src.width * scale; canvas.height = src.height * scale; } const v = canvas.getContext('2d'); v.imageSmoothingEnabled = false; v.clearRect(0, 0, canvas.width, canvas.height); v.drawImage(src, 0, 0, canvas.width, canvas.height); }

  return {
    w: W, h: H, get g() { return g; }, soft, art, actx,
    mulberry, hash, vnoise, fbm, clamp, mix, smooth,
    begin, layer, on, release, rc, glow, lin, rad, ell, fillP, strokeP, poly, limb, reach,
    lit, rim, shadow, crush, bayer, ptext, ptextW, ptext2, run, show,
  };
}

  // ───────────────────────── Journal OS pixel controls ─────────────────────────
  // Three controls, each a real input with a painted scene that its value drives:
  //   <pw-switch>  wraps a checkbox. PATCH's head slides across: asleep when off, ear panels lit when on.
  //   <pw-slider>  wraps a range input. A small PATCH stands at the value on a rail whose LEDs light up behind it.
  //                The hue slider (0–360) gets a rail of stepped colours and PATCH's ears take the chosen hue.
  //   <pw-status>  sits before a `.live-dot` and shows its state as a little antenna: lime arcs when live,
  //                amber when reconnecting, grey while connecting.
  // The input stays in the page (light DOM), transparent on top of the art, so clicks, keys, forms and screen
  // readers work exactly as before. enhance() wraps every eligible input already on the page and any added later.
  const SCALE = 2;
  const PAL = ['#0b0a10', '#141219', '#1e1b26', '#2a2634', '#3c3748', '#575168', '#7d7790', '#a6a1b4', '#d3d0dc', '#f4f3f7',
    '#2e3a06', '#556e0c', '#8db814', '#c6ee2a', '#eaff8a', '#dff0b8', '#b9cf86', '#8ea35c', '#5d6b3c',
    '#e0729c', '#f7b3cb', '#b4561c', '#f09a3a', '#ffd38a', '#6a6a8e', '#9b9bc0', '#140c1c', '#241c34', '#342c4c', '#736f8b', '#9792a9', '#aaa7bf', '#dddde8'];
  const INK = '#0b0a10', WHITE = '#f4f3f7', GREY = '#a6a1b4', STONE = '#3c3748', PINK = '#e0729c';
  const LIME = ['#556e0c', '#8db814', '#c6ee2a', '#eaff8a'];
  const kits = new Map();
  const kitFor = (w, h) => { const key = w + 'x' + h; if (!kits.has(key)) kits.set(key, PixelKit({ w, h, palette: PAL, spread: 3 })); return kits.get(key); };
  const film = new URLSearchParams(location.search).get('film') === '1';

  // A pressable frame: stepped ink outline with a hard shadow; pressed, it sits down onto the shadow.
  function frame(k, w, h, pressed, focused, disabled) {
    const o = pressed ? 1 : 0, W = w - 1, H = h - 1;
    k.on(k.actx, () => {
      if (!pressed) { k.rc(2, H, W - 1, 1, INK); k.rc(W, 2, 1, H - 1, INK); }
      k.rc(o + 1, o, W - 2, 1, INK); k.rc(o + 1, o + H - 1, W - 2, 1, INK); k.rc(o, o + 1, 1, H - 2, INK); k.rc(o + W - 1, o + 1, 1, H - 2, INK);
      if (focused) { k.rc(o + 2, o + 1, W - 4, 1, LIME[2]); k.rc(o + 2, o + H - 2, W - 4, 1, LIME[2]); k.rc(o + 1, o + 2, 1, H - 4, LIME[2]); k.rc(o + W - 2, o + 2, 1, H - 4, LIME[2]); }
      if (disabled) for (let y = o + 1; y < o + H - 1; y++) for (let x = o + 1; x < o + W - 1; x++) if (k.bayer(x, y) < 0.5) k.rc(x, y, 1, 1, '#141219');
    });
  }
  // The art is painted one pixel up-left of its frame so a press can drop it onto the shadow.
  function shiftForPress(k, pressed) { if (!pressed) return; const c = k.actx, img = c.getImageData(0, 0, k.w - 1, k.h - 1); c.clearRect(0, 0, k.w, k.h); c.putImageData(img, 1, 1); }

  // PATCH's head: ears, face, side pods. x, y is the centre of the face. glow 0..1 lights the ear panels.
  function patchHead(k, x, y, awake, glow, ledRGB) {
    const ears = k.layer(() => {
      for (const ex of [x - 4, x + 2]) { k.rc(ex, y - 7, 3, 5, WHITE); k.rc(ex + 1, y - 8, 1, 1, WHITE); }
    });
    const head = k.layer(() => { k.ell(x, y, 6.2, 4.6, WHITE); k.rc(x - 7, y - 1, 1, 3, GREY); k.rc(x + 6, y - 1, 1, 3, GREY); });
    return { ears, head, draw(S) {
      k.lit(ears, S); k.lit(head, S); k.rim(head, 0, 1.2, x, y - 10, 16, '230,255,170', 0.6 * glow);
      k.g.drawImage(ears, 0, 0); k.g.drawImage(head, 0, 0); k.release(ears, head);
      const led = glow > 0.05 ? `rgb(${ledRGB.map((c) => Math.round(70 + (c - 70) * glow)).join(',')})` : '#575168';
      k.rc(x - 3, y - 7, 1, 4, led); k.rc(x + 3, y - 7, 1, 4, led);
    } };
  }
  function patchFace(k, x, y, awake) {
    if (awake) { k.rc(x - 3, y - 1, 1, 2, INK); k.rc(x + 2, y - 1, 1, 2, INK); k.rc(x - 1, y + 2, 2, 1, INK); k.rc(x + 4, y + 1, 1, 1, PINK); }
    else { k.rc(x - 4, y, 2, 1, INK); k.rc(x + 2, y, 2, 1, INK); k.rc(x, y + 2, 1, 1, INK); }
  }

  const LIVE = new Set();
  const STYLE = `
pw-switch, pw-slider, pw-status { position: relative; display: inline-block; vertical-align: middle; flex: none; }
pw-switch { width: ${44 * SCALE}px; height: ${18 * SCALE}px; }
pw-slider { display: block; width: 100%; min-width: 120px; height: ${20 * SCALE}px; }
pw-status { width: ${14 * SCALE}px; height: ${12 * SCALE}px; margin-right: 6px; }
pw-switch > canvas, pw-slider > canvas, pw-status > canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; pointer-events: none; }
pw-switch > input, pw-slider > input { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; opacity: 0 !important; cursor: pointer; }
pw-switch > input:disabled, pw-slider > input:disabled { cursor: not-allowed; }
pw-slider > input { -webkit-appearance: none; appearance: none; background: transparent; }
pw-slider > input::-webkit-slider-thumb { -webkit-appearance: none; width: ${14 * SCALE}px; height: ${20 * SCALE}px; }
pw-slider > input::-moz-range-thumb { width: ${14 * SCALE}px; height: ${20 * SCALE}px; border: 0; }
pw-status + .live-dot::before { display: none; }
@media (prefers-reduced-motion: reduce) { pw-status { --pw-calm: 1; } }`;

  class PixelControl extends HTMLElement {
    connectedCallback() {
      if (!this.canvasEl) { this.canvasEl = document.createElement('canvas'); this.canvasEl.setAttribute('aria-hidden', 'true'); this.prepend(this.canvasEl); }
      this.time = 0; this.pressed = false; this.v = undefined;
      LIVE.add(this);
    }
    // The input is moved in after the element connects, so find it (and listen to it) on first use.
    get input() {
      const i = this.querySelector(':scope > input');
      if (i && i !== this.bound) {
        this.bound = i;
        i.addEventListener('pointerdown', () => { this.pressed = true; });
        for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) i.addEventListener(t, () => { this.pressed = false; });
      }
      return i;
    }
    settle(k, want, dt, up, down) { if (this.v === undefined) this.v = want; else this.v += k.clamp(want - this.v, -dt / down, dt / up); return this.v; }
    disconnectedCallback() { LIVE.delete(this); }
    get focused() { return Boolean(this.input && this.input.matches(':focus-visible')); }
    get disabled() { return Boolean(this.input && this.input.disabled); }
  }

  class PwSwitch extends PixelControl {
    target() { return this.input && this.input.checked ? 1 : 0; }
    advance(dt) {
      const W = 44, H = 18, k = kitFor(W, H), want = this.target();
      this.time += dt; this.settle(k, want, dt, 0.32, 0.22);
      const v = this.v, x = Math.round(k.mix(12, 30, v)), y = 10, pulse = 0.85 + 0.15 * Math.sin(this.time * 3);
      const S = { amb: 'rgb(150,146,178)', lights: v > 0.02 ? [[x, 4, 8 + 16 * v, '190,255,80', 0.7 * v * pulse]] : [] };
      const P = { amb: v > 0.5 ? 'rgb(232,232,240)' : 'rgb(178,176,198)', lights: S.lights };
      k.begin();
      const room = k.lit(k.layer(() => {
        k.rc(1, 1, W - 3, H - 3, '#241c34'); k.rc(1, 1, W - 3, 1, '#342c4c');
        k.rc(5, 14, W - 11, 1, '#342c4c'); k.rc(5, 15, W - 11, 1, '#140c1c');
      }), { amb: '#ffffff', lights: [] });
      k.g.drawImage(room, 0, 0); k.release(room);
      if (v > 0.02) for (let i = 5; i < 5 + Math.round((W - 11) * v); i += 3) k.rc(i, 14, 2, 1, `rgba(198,238,42,${0.4 + 0.6 * v})`);
      const head = patchHead(k, x, y, v > 0.5, v * pulse, [198, 238, 42]); head.draw(P);
      k.crush(); k.on(k.actx, () => patchFace(k, x, y, v > 0.5));
      shiftForPress(k, this.pressed); frame(k, W, H, this.pressed, this.focused, this.disabled);
      k.show(this.canvasEl, k.art, SCALE);
    }
  }

  class PwSlider extends PixelControl {
    target() { const i = this.input; if (!i) return 0; const lo = +i.min || 0, hi = i.max === '' ? 100 : +i.max; return hi > lo ? (+i.value - lo) / (hi - lo) : 0; }
    get hue() { const i = this.input; return Boolean(i && +i.min === 0 && +i.max === 360); }
    advance(dt) {
      const W = Math.max(60, Math.round((this.clientWidth || 240) / SCALE)), H = 20, k = kitFor(W, H), want = this.target();
      this.time += dt;
      const before = this.v ?? want; this.settle(k, want, dt, 1 / 3, 1 / 3);
      const pad = 7, span = W - 2 * pad, x = Math.round(pad + this.v * span);
      this.dist = (this.dist || 0) + Math.abs(this.v - before) * span; this.moving = Math.abs(this.v - want) > 0.002;
      const hop = this.moving ? -(Math.floor(this.dist / 3) % 2) : 0, y = 10 + hop;
      const hueDeg = this.hue ? Math.round(+this.input.value) : null;
      const rgb = hueDeg === null ? [198, 238, 42] : hslRGB(hueDeg, 0.85, 0.6);
      const S = { amb: 'rgb(150,146,178)', lights: [[x, 4, 22, rgb.join(','), 0.6]] }, P = { amb: 'rgb(232,232,240)', lights: S.lights };
      k.begin();
      const room = k.lit(k.layer(() => {
        k.rc(1, 1, W - 3, H - 3, '#241c34'); k.rc(1, 1, W - 3, 1, '#342c4c');
        k.rc(1, 16, W - 3, 3, '#342c4c'); k.rc(1, 16, W - 3, 1, '#575168');
        for (let i = pad; i <= W - pad; i += 3) k.rc(i, 16, 2, 1, '#140c1c');
      }), { amb: '#ffffff', lights: [] });
      k.g.drawImage(room, 0, 0); k.release(room);
      const body = k.lit(k.layer(() => { k.ell(x, y + 4, 3.4, 2.2, WHITE); k.rc(x - 3, 15 + 0, 2, 1, GREY); k.rc(x + 1, 15, 2, 1, GREY); }), P);
      k.g.drawImage(body, 0, 0); k.release(body);
      const head = patchHead(k, x, y - 1, true, 0.9, rgb); head.draw(P);
      const art = k.crush();
      k.on(art.getContext('2d'), () => {
        for (let i = pad; i <= W - pad; i += 3) {
          const f = (i - pad) / span;
          if (hueDeg !== null) k.rc(i, 16, 2, 1, `rgb(${hslRGB(Math.round(f * 360), 0.85, 0.6).join(',')})`);
          else if (i <= x) k.rc(i, 16, 2, 1, i > x - 4 ? LIME[3] : LIME[2]);
        }
        k.rc(x - 3, y - 2, 1, 2, INK); k.rc(x + 2, y - 2, 1, 2, INK); k.rc(x - 1, y + 1, 2, 1, INK);
      });
      shiftForPress(k, this.pressed); frame(k, W, H, this.pressed, this.focused, this.disabled);
      k.show(this.canvasEl, k.art, SCALE);
    }
  }
  function hslRGB(h, s, l) {
    const a = s * Math.min(l, 1 - l), f = (n) => { const q = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(q - 3, 9 - q, 1)); };
    return [f(0), f(8), f(4)].map((c) => Math.round(c * 255));
  }

  class PwStatus extends HTMLElement {
    connectedCallback() {
      if (!this.canvasEl) { this.canvasEl = document.createElement('canvas'); this.canvasEl.setAttribute('aria-hidden', 'true'); this.append(this.canvasEl); }
      this.time = 0; LIVE.add(this);
    }
    disconnectedCallback() { LIVE.delete(this); }
    advance(dt) {
      const W = 14, H = 12, k = kitFor(W, H), dot = this.nextElementSibling;
      this.time += dt;
      const state = dot && dot.classList.contains('on') ? 'on' : dot && dot.classList.contains('retry') ? 'retry' : 'off';
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, t = calm ? 0.5 : this.time;
      const col = state === 'on' ? [198, 238, 42] : state === 'retry' ? [240, 154, 58] : [125, 119, 144];
      k.begin();
      const mast = k.lit(k.layer(() => { k.rc(6, 5, 2, 5, GREY); k.rc(4, 9, 6, 2, '#575168'); k.rc(4, 9, 6, 1, GREY); }),
        { amb: 'rgb(120,116,140)', lights: [[7, 4, 9, col.join(','), state === 'off' ? 0.2 : 0.8]] });
      k.g.drawImage(mast, 0, 0); k.release(mast);
      const art = k.crush(), c = `rgb(${col.join(',')})`;
      k.on(art.getContext('2d'), () => {
        const blinkOn = state !== 'retry' || Math.floor(t * 2.5) % 2 === 0;
        if (blinkOn) { k.rc(6, 3, 2, 2, c); }
        const wave = state === 'on' ? Math.floor(t * 3) % 3 : state === 'off' ? Math.floor(t * 1.5) % 3 : (blinkOn ? 2 : -1);
        if (wave >= 1) { k.rc(4, 2, 1, 4, c); k.rc(9, 2, 1, 4, c); }
        if (wave >= 2) { k.rc(2, 1, 1, 6, c); k.rc(11, 1, 1, 6, c); k.rc(3, 0, 1, 1, c); k.rc(10, 0, 1, 1, c); k.rc(3, 7, 1, 1, c); k.rc(10, 7, 1, 1, c); }
      });
      k.show(this.canvasEl, art, SCALE);
    }
  }

  customElements.define('pw-switch', PwSwitch);
  customElements.define('pw-slider', PwSlider);
  customElements.define('pw-status', PwStatus);

  // ───────── wrap the page's controls ─────────
  const SKIP = '.sr, .sr-only, [data-pw="off"], pw-switch > input, pw-slider > input';
  function wrap(input, tag) {
    if (input.closest('pw-switch, pw-slider') || input.matches(SKIP)) return;
    const el = document.createElement(tag);
    input.parentNode.insertBefore(el, input); el.appendChild(input);
  }
  function enhance(root = document) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('input[type=checkbox]').forEach((i) => wrap(i, 'pw-switch'));
    root.querySelectorAll('input[type=range]').forEach((i) => wrap(i, 'pw-slider'));
    root.querySelectorAll('.live-dot').forEach((d) => {
      if (!(d.previousElementSibling && d.previousElementSibling.tagName === 'PW-STATUS')) d.parentNode.insertBefore(document.createElement('pw-status'), d);
    });
  }
  function start() {
    const style = document.createElement('style'); style.id = 'pw-style'; style.textContent = STYLE; document.head.appendChild(style);
    enhance();
    new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { enhance(n.parentNode || n); } })
      .observe(document.body, { childList: true, subtree: true });
    // A checkbox's state can change without an event (form reset, code); every frame re-reads it, so nothing drifts.
    if (film) {
      let t = 0; const step = (fps = 60) => { t += 1 / fps; for (const el of LIVE) el.advance(1 / fps); };
      window.__film = { step, seek(to, fps = 60) { while (t < to) step(fps); } };
      return;
    }
    let last = performance.now();
    requestAnimationFrame(function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (const el of LIVE) if (el.offsetParent !== null || el.getClientRects().length) { try { el.advance(dt); } catch (err) { console.error(err); LIVE.delete(el); } }
      requestAnimationFrame(loop);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
