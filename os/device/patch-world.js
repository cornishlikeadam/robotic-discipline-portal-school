/* PATCH pixel world: a living, take-apart pixel-art model of the companion device.

   Painted in code with the pixel-worlds kit (pixel-kit.js): every part is painted on its own layer in
   its own colours, multiplied by the light for the time of day, then the frame is crushed to a fixed
   palette. One number drives each thing: `explode` spreads the parts, `ears` poses them, `battery`
   fills the cells and sets the status light, `tod` moves the light. Only blinking, breathing, the ear
   twitch and the LEDs run on the clock.

   Concept art: the outside follows the PATCH renders; the internals are illustrative. */
(() => {
  'use strict';
  const W = 256, H = 200, CX = 128, SCALE = 3;
  const $ = (id) => document.getElementById(id);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Material ramps: dark, mid, base, highlight.
  const TINTS = {
    cream: { name: 'Cream', d: '#6e6450', m: '#b0a488', b: '#e6dcc2', h: '#fbf6e4' },
    gold: { name: 'Gold', d: '#6a4a10', m: '#a87a1c', b: '#d8a830', h: '#f4d468' },
    clay: { name: 'Clay', d: '#5a2c1c', m: '#8e4a30', b: '#b86a48', h: '#dc9670' },
    moss: { name: 'Moss', d: '#24381c', m: '#3e5a2c', b: '#62803e', h: '#90a85c' },
    slate: { name: 'Slate', d: '#262c3a', m: '#3e4860', b: '#5e6c88', h: '#8c9ab4' },
    charcoal: { name: 'Charcoal', d: '#121116', m: '#23212a', b: '#38353f', h: '#575262' },
    lime: { name: 'Lime', d: '#3a4e08', m: '#6e9010', b: '#b4e020', h: '#e2ff78' },
    blush: { name: 'Blush', d: '#6e2c44', m: '#a84c6c', b: '#dc7c9c', h: '#f6b4c8' },
  };
  const INK = '#0b0a10', LIME = '#b4e020', LIME_HI = '#e2ff78', PINK = '#dc7c9c', RED = '#e0503a', WHITE = '#fbf6e4';
  const G = TINTS.gold, CH = TINTS.charcoal;
  const WALL = '#241c34', WALL_DOT = '#342c4c', SKIRT = '#140c1c', WOOD = '#6a4a2c', WOOD_HI = '#9a7444', WOOD_LO = '#4e3420';
  const KEYS = [[0, [96, 100, 150]], [5, [104, 104, 156]], [7, [190, 140, 124]], [10, [236, 230, 218]], [14, [250, 246, 238]],
    [17.5, [240, 176, 124]], [19.5, [120, 92, 128]], [21.5, [100, 102, 152]], [24, [96, 100, 150]]];
  const SKY = [[0, [20, 26, 58]], [5, [42, 44, 92]], [6.5, [216, 138, 106]], [9, [106, 168, 216]], [15, [106, 168, 216]],
    [18, [224, 122, 72]], [19.5, [106, 74, 120]], [21, [20, 26, 58]], [24, [20, 26, 58]]];
  // What each main surface becomes under each ambient light, so the crush lands on the lit colour instead of a neighbour.
  const hex2 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const LIT = KEYS.slice(0, -1).flatMap(([, a]) => [TINTS.cream.b, TINTS.cream.m, TINTS.cream.h, TINTS.slate.b, TINTS.slate.m, WALL, WALL_DOT, WOOD, WOOD_HI]
    .flatMap((h) => [0, 24].map((lift) => '#' + hex2(h).map((v, i) => Math.round(v * Math.min(255, a[i] + lift) / 255).toString(16).padStart(2, '0')).join(''))));
  const PAL = [INK, WHITE, RED, WALL, WALL_DOT, SKIRT, WOOD, WOOD_HI, WOOD_LO,
    ...Object.values(TINTS).flatMap((t) => [t.d, t.m, t.b, t.h]),
    // night and dusk versions of lit surfaces, so the crush has somewhere to land
    '#1a1830', '#2c3050', '#3c4268', '#565c86', '#8088ac', '#b0b4cc', '#3a2a22', '#7a5a48', '#c89a78', '#f0c8a0',
    // sky
    '#141a3a', '#2a2c5c', '#6a4a78', '#d88a6a', '#f0b878', '#6aa8d8', '#a8d0ec', '#e07a48', '#fff0b0', ...new Set(LIT)];
  const k = PixelKit({ w: W, h: H, palette: PAL, spread: 5 });
  const { rc, ell, clamp, mix } = k;

  /* ---------------------------------------------------------------- state */
  const DEFAULT_TINT = { dock: 'slate', frame: 'slate', battery: 'clay', ai: 'moss', speaker: 'gold', camera: 'slate',
    ear_l: 'cream', ear_r: 'cream', body: 'cream', head: 'cream', mics: 'slate' };
  const S = { e: 0, eT: 1, zoom: 1, zoomT: 1, battery: 72, ears: 85, tod: 14, sel: '', tint: { ...DEFAULT_TINT },
    t: 0, blink: 0, nextBlink: 2.5, twitch: 0, nextTwitch: 4, focus: [CX, 100] };

  /* ---------------------------------------------------------------- parts (drawn back to front) */
  function ear(side, T, st, glow) {
    const g = k.g;
    const a = side * ((1 - st.ears / 100) * 1.2 + (side > 0 ? st.twitch : st.twitch * 0.4));
    g.save(); g.translate(CX + side * 12, 68); g.rotate(a);
    if (glow) {
      rc(-1, -27, 3, 20, st.batteryColor);
      rc(0, -26, 1, 18, st.pulse > 0.5 ? LIME_HI : st.batteryColor);
    } else {
      ell(0.5, -29, 4.5, 5, T.b); rc(-4, -29, 9, 30, T.b); rc(3, -29, 2, 30, T.m); rc(-4, -29, 1, 28, T.h);
      rc(-2, -28, 5, 22, T.d);
    }
    g.restore();
  }
  const battColor = (b) => (b > 50 ? LIME : b > 20 ? G.b : RED);

  const PARTS = [
    { id: 'dock', name: 'Magnetic dock', about: 'Charging base with pogo pins and a light ring.', dx: 0, dy: 18,
      draw(T) {
        rc(92, 160, 72, 1, T.h); rc(90, 161, 76, 5, T.b); rc(90, 165, 76, 1, T.m); rc(92, 166, 72, 2, T.m);
        for (const x of [119, 123, 127, 131, 135]) rc(x, 159, 2, 1, G.h);
      },
      glow(st) { for (let x = 94; x < 162; x += 3) rc(x, 163, 2, 1, (Math.floor(st.t * 6) + x) % 9 < 3 && st.battery < 100 ? LIME_HI : LIME); } },
    { id: 'frame', name: 'Frame and servos', about: 'The skeleton: spine, shoulder and hip servos.', dx: 0, dy: 0,
      draw(T) {
        rc(125, 72, 6, 66, T.b); rc(125, 72, 1, 66, T.h); rc(130, 72, 1, 66, T.m);
        rc(112, 91, 32, 3, T.b); rc(108, 106, 40, 4, T.b); rc(114, 134, 28, 4, T.b);
        rc(104, 102, 8, 11, T.m); rc(144, 102, 8, 11, T.m); rc(106, 104, 2, 2, G.b); rc(148, 104, 2, 2, G.b);
        rc(117, 138, 3, 16, T.b); rc(136, 138, 3, 16, T.b); rc(113, 153, 11, 3, T.m); rc(132, 153, 11, 3, T.m);
        rc(122, 94, 1, 8, TINTS.clay.b); rc(133, 93, 1, 9, G.b);
      } },
    { id: 'battery', name: 'Battery pack', about: 'Rechargeable pack. The cells and status light follow the battery slider.', dx: 62, dy: 14,
      draw(T) {
        rc(116, 116, 24, 14, T.b); rc(116, 116, 24, 1, T.h); rc(116, 129, 24, 1, T.m); rc(139, 117, 1, 12, T.m);
        rc(140, 120, 2, 6, G.b); rc(119, 119, 18, 8, INK);
        for (let i = 0; i < 6; i++) rc(120 + i * 3, 120, 2, 6, CH.m);
      },
      glow(st) {
        const n = st.battery <= 0 ? 0 : Math.max(1, Math.round(st.battery / 100 * 6));
        const low = st.battery <= 20 && Math.floor(st.t * 3) % 2 === 0;
        for (let i = 0; i < n; i++) if (!low) rc(120 + i * 3, 120, 2, 6, st.batteryColor);
      } },
    { id: 'ai', name: 'On-device AI module', about: 'Processor board with a neural chip, for voice and vision on the device.', dx: 0, dy: -2,
      draw(T) {
        rc(113, 100, 30, 13, T.b); rc(113, 100, 30, 1, T.h); rc(113, 112, 30, 1, T.m);
        rc(115, 103, 5, 1, T.h); rc(137, 109, 4, 1, T.h); rc(116, 106, 3, 4, G.b); rc(138, 103, 3, 3, CH.b);
        for (let x = 123; x < 134; x += 2) { rc(x, 101, 1, 1, G.h); rc(x, 111, 1, 1, G.h); }
        rc(122, 102, 12, 9, CH.m); rc(123, 103, 10, 7, CH.b);
      },
      glow(st) {
        rc(126 + (Math.floor(st.t * 4) % 3), 106, 2, 1, LIME_HI);
        if (Math.floor(st.t * 2.2) % 2) rc(139, 108, 1, 1, LIME);
      } },
    { id: 'speaker', name: 'Speaker', about: 'Compact driver for voice and sound effects.', dx: 60, dy: -4,
      draw(T) { ell(136, 84, 7, 7, T.m); ell(136, 84, 5.5, 5.5, T.d); ell(136, 84, 3.2, 3.2, T.b); ell(136, 84, 1.3, 1.3, T.h); } },
    { id: 'camera', name: 'AI camera', about: 'Vision sensor behind the face.', dx: 0, dy: -6,
      draw(T) {
        rc(110, 75, 15, 13, T.b); rc(110, 75, 15, 1, T.h); rc(110, 87, 15, 1, T.m); rc(124, 76, 1, 11, T.m);
        ell(117.5, 81.5, 4.6, 4.6, INK); ell(117.5, 81.5, 3, 3, TINTS.slate.d); rc(116, 80, 1, 1, WHITE);
      },
      glow(st) { if (st.pulse > 0.3) rc(122, 77, 1, 1, RED); } },
    { id: 'ear_l', name: 'Left ear', about: 'Touch-sensitive ear with an LED panel. The Ears slider poses it.', dx: -10, dy: -24,
      draw(T, st) { ear(-1, T, st, false); }, glow(st) { ear(-1, null, st, true); } },
    { id: 'ear_r', name: 'Right ear', about: 'Touch-sensitive ear with an LED panel. It twitches now and then.', dx: 10, dy: -24,
      draw(T, st) { ear(1, T, st, false); }, glow(st) { ear(1, null, st, true); } },
    { id: 'body', name: 'Body shell', about: 'Torso, arms and feet, with the status light ring on the chest.', dx: -64, dy: 8,
      draw(T) {
        for (const x of [114, 134]) { rc(x, 134, 10, 17, T.b); rc(x + 8, 134, 2, 17, T.m); }
        for (const x of [110, 132]) { rc(x + 2, 149, 12, 1, T.b); rc(x, 150, 16, 6, T.b); rc(x + 14, 150, 2, 6, T.m); rc(x, 156, 16, 2, CH.b); }
        rc(111, 100, 34, 2, T.b); rc(109, 102, 38, 30, T.b); rc(111, 132, 34, 2, T.m);
        rc(143, 102, 4, 30, T.m); rc(110, 103, 1, 26, T.h); rc(109, 124, 38, 1, T.m);
        rc(101, 105, 7, 18, T.b); rc(101, 105, 1, 18, T.h); ell(104.5, 126, 4.5, 4.5, T.b); rc(102, 103, 5, 2, CH.b);
        rc(148, 105, 7, 18, T.b); rc(153, 105, 2, 18, T.m); ell(151.5, 126, 4.5, 4.5, T.b); rc(149, 103, 5, 2, CH.b);
        ell(128, 116, 6, 6, TINTS.slate.h); ell(128, 116, 4.2, 4.2, CH.m);
      },
      glow(st) {
        const c = st.batteryColor;
        const on = st.battery > 20 || Math.floor(st.t * 3) % 2;
        if (on) { rc(126, 113, 4, 1, c); rc(126, 119, 4, 1, c); rc(125, 114, 1, 5, c); rc(130, 114, 1, 5, c); }
        if (st.pulse > 0.6 && on) rc(127, 116, 2, 1, c);
      } },
    { id: 'head', name: 'Head shell', about: 'Front of the head with the face display: eyes, nose, smile and a blush LED.', dx: -64, dy: -12,
      draw(T, st) {
        rc(106, 63, 44, 3, T.b); rc(103, 66, 50, 30, T.b); rc(101, 70, 54, 22, T.b); rc(106, 96, 44, 3, T.b);
        rc(151, 70, 4, 22, T.m); rc(150, 67, 3, 3, T.m); rc(150, 92, 3, 4, T.m); rc(106, 97, 44, 2, T.m);
        rc(102, 71, 1, 18, T.h); rc(108, 64, 30, 1, T.h); rc(117, 99, 22, 3, CH.b);
        if (st.blink) { rc(116, 83, 5, 1, INK); rc(137, 83, 5, 1, INK); } else {
          rc(117, 80, 3, 6, INK); rc(138, 80, 3, 6, INK); rc(117, 80, 1, 2, WHITE); rc(138, 80, 1, 2, WHITE);
        }
        rc(127, 88, 2, 1, INK); rc(125, 91, 1, 1, INK); rc(126, 92, 4, 1, INK); rc(130, 91, 1, 1, INK);
        rc(144, 88, 4, 3, PINK);
      } },
    { id: 'mics', name: 'Microphone array', about: 'Two side pods that pick up voice from across a room.', dx: 62, dy: -34,
      draw(T) { for (const x of [97, 155]) { rc(x, 73, 4, 1, T.m); rc(x, 74, 4, 12, T.b); rc(x, 86, 4, 1, T.m); rc(x + 1, 76, 2, 8, T.d); } },
      glow(st) { for (const x of [97, 155]) rc(x + 1, 77 + (Math.floor(st.t * 5 + x) % 3) * 2, 2, 1, LIME); } },
  ];
  const BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]));

  /* ---------------------------------------------------------------- light and room */
  function keyed(table, h) {
    for (let i = 1; i < table.length; i++) {
      if (h <= table[i][0]) { const [h0, a] = table[i - 1], [h1, b] = table[i], f = (h - h0) / (h1 - h0); return a.map((v, j) => Math.round(mix(v, b[j], f))); }
    }
    return table[0][1];
  }
  const daylight = (h) => clamp(Math.sin((h - 6) / 12 * Math.PI), 0, 1);

  function room(st) {
    rc(0, 0, W, 168, WALL);
    for (let y = 10; y < 160; y += 16) for (let x = 8 + (y % 32 ? 8 : 0); x < W; x += 16) rc(x, y, 1, 1, WALL_DOT);
    rc(0, 164, W, 4, SKIRT); rc(0, 168, W, 32, WOOD); rc(0, 168, W, 1, WOOD_HI);
    for (let x = 30; x < W; x += 52) rc(x, 169, 1, 31, WOOD_LO);
    rc(12, 14, 44, 36, CH.b); rc(12, 14, 44, 1, CH.h); rc(10, 50, 48, 3, CH.h);
    rc(214, 0, 1, 20, CH.h); k.poly([[209, 20], [220, 20], [224, 29], [205, 29]], st.night > 0.4 ? G.b : G.d);
  }
  function sky(st) {
    const [r, g, b] = keyed(SKY, st.tod);
    rc(15, 17, 38, 30, `rgb(${r},${g},${b})`);
    const day = st.tod >= 6 && st.tod <= 18;
    const f = day ? (st.tod - 6) / 12 : ((st.tod + 6) % 24) / 12;
    const x = Math.round(17 + f * 32), y = Math.round(42 - Math.sin(f * Math.PI) * 22);
    if (day) { ell(x + 1, y + 1, 3, 3, '#fff0b0'); } else {
      ell(x + 1, y + 1, 2.6, 2.6, WHITE); ell(x + 2.2, y + 0.4, 2.2, 2.2, `rgb(${r},${g},${b})`);
      for (const [sx, sy, p] of [[20, 21, 0], [44, 24, 2], [30, 38, 4], [48, 40, 1], [24, 30, 3]]) if (Math.floor(st.t * 1.5 + p) % 5) rc(sx, sy, 1, 1, WHITE);
    }
    rc(33, 17, 2, 30, CH.b); rc(15, 31, 38, 2, CH.b);
    if (st.night > 0.4) { ell(214.5, 30, 3, 2, '#fff0b0'); }
  }

  /* ---------------------------------------------------------------- one frame */
  function offsetOf(p, i, st) {
    const bob = p.id === 'dock' || calm ? 0 : Math.round(Math.sin(st.t * 1.5 + i * st.e * 0.9));
    return [Math.round(p.dx * st.e), Math.round(p.dy * st.e) + bob];
  }
  function outline(L, color) {
    return k.layer(() => {
      const g = k.g;
      g.drawImage(L, 1, 0); g.drawImage(L, -1, 0); g.drawImage(L, 0, 1); g.drawImage(L, 0, -1);
      g.globalCompositeOperation = 'source-in'; rc(0, 0, W, H, color);
    });
  }

  function frame(dt) {
    const st = S;
    st.t += calm ? 0 : dt;
    st.e += clamp(st.eT - st.e, -dt * 1.6, dt * 1.6);
    st.zoom += (st.zoomT - st.zoom) * Math.min(1, dt * 10);
    if (!calm) {
      if (st.t > st.nextBlink) { st.blink = 0.13; st.nextBlink = st.t + 2.2 + k.hash(Math.floor(st.t), 3) * 3.5; }
      st.blink = Math.max(0, st.blink - dt);
      if (st.t > st.nextTwitch) { st.twitchT = 0.5; st.nextTwitch = st.t + 4 + k.hash(Math.floor(st.t), 9) * 5; }
      st.twitchT = Math.max(0, (st.twitchT || 0) - dt);
      st.twitch = st.twitchT ? Math.sin(st.twitchT * Math.PI * 6) * 0.14 * (st.twitchT / 0.5) : 0;
    }
    st.pulse = calm ? 1 : 0.5 + 0.5 * Math.sin(st.t * 2.4);
    st.batteryColor = battColor(st.battery);
    const day = daylight(st.tod);
    st.night = 1 - k.smooth(0, 0.3, day);
    const amb = keyed(KEYS, st.tod);
    const lights = [];
    if (day > 0.02) lights.push([24, 20, 330, st.tod > 16 ? '255,190,130' : '255,246,224', 0.35 * day]);
    if (st.night > 0.05) lights.push([214, 34, 170, '255,196,120', 0.85 * st.night]);
    const body = BY_ID.body;
    const [bx, by] = offsetOf(body, PARTS.indexOf(body), st);
    lights.push([128 + bx, 116 + by, 18, st.battery > 50 ? '190,255,80' : st.battery > 20 ? '255,200,90' : '255,90,60', 0.14 + 0.1 * st.pulse]);

    k.begin();
    const R = k.lit(k.layer(() => room(st)), { amb: `rgb(${amb.map((v) => Math.min(255, v + 24)).join(',')})`, lights });
    k.g.drawImage(R, 0, 0); k.release(R);
    sky(st);
    PARTS.forEach((p, i) => {
      const [ox, oy] = offsetOf(p, i, st);
      const T = TINTS[st.tint[p.id]] || TINTS.cream;
      const dim = st.sel && st.sel !== p.id;
      const L = k.layer(() => p.draw(T, st));
      const O = outline(L, st.sel === p.id ? LIME_HI : INK);
      k.lit(L, { amb: `rgb(${amb.join(',')})`, lights: lights.map(([x, y, ...rest]) => [x - ox, y - oy, ...rest]) });
      k.rim(L, 0, 1.2, 60 - ox, -40 - oy, 320, '255,250,232', 0.5 * day + 0.15);
      const g = k.g;
      g.save(); g.globalAlpha = dim ? 0.45 : 1; g.drawImage(O, ox, oy); g.drawImage(L, ox, oy);
      if (p.glow) { g.translate(ox, oy); p.glow(st); }
      g.restore();
      k.release(L, O);
    });
    const art = k.crush();
    k.on(k.actx, () => {
      const p = BY_ID[st.sel];
      const text = p ? p.name : `PATCH  ${Math.round(st.battery)}%`;
      k.ptext(text, 9, 187, INK, 1); k.ptext(text, 8, 186, p ? LIME_HI : WHITE, 1);
    });
    blit(art);
  }

  /* ---------------------------------------------------------------- view: zoom follows the selected part */
  const view = $('scene');
  view.width = W * SCALE; view.height = H * SCALE;
  let crop = [0, 0, W, H];
  function blit(art) {
    const st = S, p = BY_ID[st.sel];
    const target = p ? partCenter(p) : [CX, 104];
    st.focus = st.focus.map((v, i) => v + (target[i] - v) * 0.12);
    const sw = W / st.zoom, sh = H / st.zoom;
    const sx = clamp(st.focus[0] - sw / 2, 0, W - sw), sy = clamp(st.focus[1] - sh / 2, 0, H - sh);
    crop = [sx, sy, sw, sh];
    const v = view.getContext('2d');
    v.imageSmoothingEnabled = false;
    v.drawImage(art, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), 0, 0, view.width, view.height);
  }
  const CENTERS = { dock: [128, 163], frame: [128, 112], battery: [128, 123], ai: [128, 106], speaker: [136, 84], camera: [117, 81],
    ear_l: [116, 50], ear_r: [140, 50], body: [128, 128], head: [128, 81], mics: [128, 80] };
  function partCenter(p) { const [ox, oy] = offsetOf(p, 0, S); return [CENTERS[p.id][0] + ox, CENTERS[p.id][1] + oy]; }

  // Which part is under a point on the canvas? Checked front to back against each part's own pixels.
  function partAt(clientX, clientY) {
    const r = view.getBoundingClientRect();
    const ax = Math.floor(crop[0] + (clientX - r.left) / r.width * crop[2]);
    const ay = Math.floor(crop[1] + (clientY - r.top) / r.height * crop[3]);
    for (let i = PARTS.length - 1; i >= 0; i--) {
      const p = PARTS[i], [ox, oy] = offsetOf(p, i, S);
      const L = k.layer(() => p.draw(TINTS.cream, S));
      const x = ax - ox, y = ay - oy;
      let hit = false;
      if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1) {
        const d = L.getContext('2d').getImageData(x - 1, y - 1, 3, 3).data; // a 3 x 3 patch: small parts are easier to tap
        for (let j = 3; j < d.length; j += 4) if (d[j] > 0) hit = true;
      }
      k.release(L);
      if (hit) return p.id;
    }
    return '';
  }

  /* ---------------------------------------------------------------- controls */
  const fmtTime = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const SLIDERS = {
    explode: { set: (v) => { S.eT = v / 100; }, text: (v) => (v <= 0 ? 'Assembled' : v >= 100 ? 'Exploded' : `${v}%`) },
    zoom: { set: (v) => { S.zoomT = v / 100; }, text: (v) => `${v}%` },
    battery: { set: (v) => { S.battery = v; }, text: (v) => `${v}%${v <= 20 ? ' · low' : ''}` },
    ears: { set: (v) => { S.ears = v; }, text: (v) => (v >= 90 ? 'Perked' : v <= 10 ? 'Flopped' : `${v}%`) },
    tod: { set: (v) => { S.tod = v; }, text: (v) => fmtTime(v) },
  };
  function syncSlider(id) {
    const input = $(id), v = Number(input.value);
    SLIDERS[id].set(v);
    $(`${id}-out`).textContent = SLIDERS[id].text(v);
    input.setAttribute('aria-valuetext', SLIDERS[id].text(v));
  }
  for (const id of Object.keys(SLIDERS)) { $(id).addEventListener('input', () => syncSlider(id)); syncSlider(id); }

  const partSel = $('part');
  partSel.innerHTML = '<option value="">All parts</option>' + PARTS.slice().reverse().map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  function select(id) {
    S.sel = id;
    partSel.value = id;
    const p = BY_ID[id];
    $('part-about').textContent = p ? p.about : 'Tap a part in the scene, or pick one here, to isolate it. The rest dims.';
    $('swatch-label').textContent = p ? `Colour of the ${p.name.toLowerCase()}` : 'Colour of the shell';
    drawSwatches();
  }
  partSel.addEventListener('change', () => select(partSel.value));
  view.addEventListener('click', (e) => select(partAt(e.clientX, e.clientY)));
  view.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') view.style.cursor = partAt(e.clientX, e.clientY) ? 'pointer' : 'default'; });

  const SHELL = ['ear_l', 'ear_r', 'body', 'head'];
  function drawSwatches() {
    const current = S.tint[S.sel || 'head'];
    $('swatches').innerHTML = Object.entries(TINTS).map(([id, t]) => `<button type="button" class="swatch" data-tint="${id}" aria-pressed="${id === current}"
      style="--c:${t.b};--d:${t.d}" title="${t.name}"><span class="sr">${t.name}</span></button>`).join('');
  }
  $('swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tint]');
    if (!b) return;
    for (const id of (S.sel ? [S.sel] : SHELL)) S.tint[id] = b.dataset.tint;
    drawSwatches();
    const again = $('swatches').querySelector(`[data-tint="${b.dataset.tint}"]`);
    if (again) again.focus();
  });
  $('reset').addEventListener('click', () => {
    S.tint = { ...DEFAULT_TINT };
    for (const [id, v] of Object.entries({ explode: 100, zoom: 100, battery: 72, ears: 85, tod: 14 })) { $(id).value = v; syncSlider(id); }
    select('');
  });

  /* ---------------------------------------------------------------- downloads (the whole scene, pixel for pixel) */
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $('dl-note').textContent = `Saved ${name}`;
  }
  const pixels = () => k.actx.getImageData(0, 0, W, H).data;
  $('dl-png').addEventListener('click', () => {
    const c = document.createElement('canvas'); c.width = W * 4; c.height = H * 4;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(k.art, 0, 0, c.width, c.height);
    c.toBlob((b) => save(b, 'patch-pixel-world.png'), 'image/png');
  });
  $('dl-svg').addEventListener('click', () => {
    const d = pixels(), paths = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W;) {
        const i = (y * W + x) * 4, key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        let n = 1;
        while (x + n < W) { const j = i + n * 4; if (((d[j] << 16) | (d[j + 1] << 8) | d[j + 2]) !== key) break; n++; }
        paths.set(key, (paths.get(key) || '') + `M${x} ${y}h${n}v1h-${n}z`);
        x += n;
      }
    }
    const body = [...paths].map(([c, p]) => `<path fill="#${c.toString(16).padStart(6, '0')}" d="${p}"/>`).join('');
    save(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 4}" height="${H * 4}" shape-rendering="crispEdges"><title>PATCH pixel world (concept)</title>${body}</svg>`],
      { type: 'image/svg+xml' }), 'patch-pixel-world.svg');
  });
  $('dl-pdf').addEventListener('click', () => {
    const d = pixels(), rgb = new Uint8Array(W * H * 3);
    for (let i = 0, j = 0; i < d.length; i += 4) { rgb[j++] = d[i]; rgb[j++] = d[i + 1]; rgb[j++] = d[i + 2]; }
    const enc = new TextEncoder(), chunks = [], offsets = [];
    let size = 0;
    const put = (v) => { const b = typeof v === 'string' ? enc.encode(v) : v; chunks.push(b); size += b.length; };
    const obj = (n, head, stream) => {
      offsets[n] = size; put(`${n} 0 obj\n${head}\n`);
      if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
      put('endobj\n');
    };
    const pw = W * 3, ph = H * 3, content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    put('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    obj(4, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Length ${rgb.length} >>`, rgb);
    obj(5, `<< /Length ${content.length} >>`, content);
    const xref = size;
    put(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
    put(`trailer\n<< /Size 6 /Root 1 0 R /Info << /Title (PATCH pixel world - concept) >> >>\nstartxref\n${xref}\n%%EOF\n`);
    save(new Blob(chunks, { type: 'application/pdf' }), 'patch-pixel-world.pdf');
  });

  select('');
  window.PatchWorld = { state: S, parts: PARTS.map((p) => p.id), partAt, select };
  k.run(frame, 8);
})();
