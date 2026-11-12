// PATCH companion: exploded technical illustration (concept).
// One model feeds every view. Units are millimetres, z is up, the robot faces -y,
// so its left (+x) appears on the right of the page. Built with the teardown
// skill's helpers (TechnicalGeometry / TechnicalProjection), loaded by the worker.
self.DrawingModels ??= {};
self.DrawingModels['patch-companion'] = (parameters, options) => {
  const G = TechnicalGeometry;
  const {earTilt, armWave, batteryMah} = parameters;
  const check = (value, lo, hi, label) => {
    if (!Number.isFinite(value) || value < lo || value > hi) throw Error(`${label} must be ${lo}–${hi}`);
  };
  check(earTilt, 0, 35, 'Ear tilt');
  check(armWave, 0, 70, 'Arm wave');
  check(batteryMah, 3000, 4000, 'Battery capacity');

  const deg = Math.PI / 180;
  const SE = 3; // superellipse exponent: a softly squared, toy-like section

  // ---------- section rings -------------------------------------------------
  const sc = (u) => Math.sign(u) * Math.abs(u) ** (2 / SE);
  // Half of a superellipse section (front: y < 0, back: y > 0), closed by a straight
  // seam at y = gap. Every ring has the same point count, so rings loft cleanly.
  const CURVE = 84, SEAM = 14;
  function halfRing(w, d, z, side, gap = 0.2) {
    const a = w / 2, b = d / 2, pts = [];
    const t0 = side === 'front' ? Math.PI : 0;
    for (let i = 0; i <= CURVE; i++) {
      const t = t0 + Math.PI * i / CURVE;
      const y = b * sc(Math.sin(t));
      pts.push([a * sc(Math.cos(t)), side === 'front' ? Math.min(y, -gap) : Math.max(y, gap), z]);
    }
    const start = pts[pts.length - 1][0], end = pts[0][0], ys = side === 'front' ? -gap : gap;
    for (let k = 1; k < SEAM; k++) pts.push([start + (end - start) * k / SEAM, ys, z]);
    return pts;
  }
  function fullRing(w, d, z, [cx, cy] = [0, 0], n = 96) {
    return Array.from({length: n}, (_, i) => {
      const t = 2 * Math.PI * i / n;
      return [cx + w / 2 * sc(Math.cos(t)), cy + d / 2 * sc(Math.sin(t)), z];
    });
  }
  // A shell half lofted through [z, width, depth] stations, with its parting line inked.
  function shellHalf(id, name, stations, side) {
    const p = G.part(id, name);
    const rings = stations.map(([z, w, d]) => halfRing(w, d, z, side));
    G.loft(p, rings, {lines: 'none'});
    const y = side === 'front' ? -0.2 : 0.2;
    const right = stations.map(([z, w]) => [w / 2 * 0.999, y, z]);
    const left = stations.map(([z, w]) => [-w / 2 * 0.999, y, z]).reverse();
    G.polyline(p, [...right, ...left], {closed: true, role: 'edge'});
    return p;
  }
  // Inked panel line around the front or back of a station (drawn just proud of the skin).
  function panelLine(p, [z, w, d], side) {
    const ring = halfRing(w * 1.004, d * 1.004, z, side).slice(1, CURVE);
    G.polyline(p, ring, {role: 'detail'});
  }

  // ---------- head --------------------------------------------------------------
  // Stations [z, width, depth] of a body that is itself a superellipse in elevation,
  // spaced more tightly toward the ends so domes stay smooth.
  function stations(zc, H, W, D, p, z0, z1, n) {
    return Array.from({length: n}, (_, i) => {
      const s = -Math.cos(Math.PI * i / (n - 1));
      const z = zc + (z0 - zc) * (s < 0 ? -s : 0) + (z1 - zc) * (s > 0 ? s : 0);
      const f = Math.max(0.08, (1 - Math.min(1, Math.abs(2 * (z - zc) / H)) ** p)) ** (1 / p);
      return [z, W * f, D * f];
    });
  }
  const HEAD = stations(121, 72, 110, 86, 3.2, 85.4, 156.6, 26);
  const TORSO = stations(57, 60, 78, 58, 3, 30, 83, 20);
  const station = (list, z) => list.reduce((best, s) => Math.abs(s[0] - z) < Math.abs(best[0] - z) ? s : best);

  // Front skin of a station list, sampled analytically (matches the loft closely).
  function skin(stations, x, z) {
    let i = 0;
    while (i < stations.length - 2 && stations[i + 1][0] < z) i++;
    const [z0, w0, d0] = stations[i], [z1, w1, d1] = stations[i + 1];
    const f = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
    const a = (w0 + (w1 - w0) * f) / 2, b = (d0 + (d1 - d0) * f) / 2;
    const u = Math.min(0.999, Math.abs(x / a) ** SE);
    return -b * (1 - u) ** (1 / SE);
  }
  // A raised oval "button" (eye, nose, cheek) seated on the curved front skin.
  function button(p, stations, x, z, rx, rz, proud = 1.1, sink = 1.4) {
    const h = 0.5;
    const yc = skin(stations, x, z);
    const tx = G.unit([2 * h, skin(stations, x + h, z) - skin(stations, x - h, z), 0]);
    const tz0 = G.unit([0, skin(stations, x, z + h) - skin(stations, x, z - h), 2 * h]);
    let n = G.unit(G.cross(tz0, tx));
    if (n[1] > 0) n = n.map((v) => -v);
    const tz = G.unit(G.cross(tx, n)).map((v) => -v);
    const ring = (off) => Array.from({length: 64}, (_, i) => {
      const t = 2 * Math.PI * i / 64;
      return [0, 1, 2].map((k) => [x, yc, z][k] + n[k] * off + tx[k] * rx * Math.cos(t) + tz[k] * rz * Math.sin(t));
    });
    G.loft(p, [ring(-sink), ring(proud * 0.75), ring(proud)], {lines: 'none'});
    G.polyline(p, ring(proud * 0.75 + 0.02), {closed: true, role: 'edge'});
  }

  const headFront = shellHalf('head_front', 'Head front shell', HEAD, 'front');
  panelLine(headFront, station(HEAD, 95), 'front');
  const headBack = shellHalf('head_back', 'Head rear shell', HEAD, 'back');
  panelLine(headBack, station(HEAD, 95), 'back');

  const face = G.part('face', 'Face display');
  for (const sx of [-1, 1]) button(face, HEAD, sx * 19, 125, 5.2, 7.8, 1.6, 1.6);
  button(face, HEAD, 0, 115, 3, 2.1, 1.2, 1.4);
  const smile = Array.from({length: 25}, (_, i) => {
    const x = -6.5 + 13 * i / 24, z = 108 + x * x / 17;
    return [x, skin(HEAD, x, z) - 0.35, z];
  });
  G.polyline(face, smile, {role: 'edge'});

  const blush = G.part('blush', 'Blush LED');
  button(blush, HEAD, 33, 113, 5.8, 5.8, 0.9, 1.6);

  // Ears: an oval plate with a lit inner panel, hinged at its base so it can tilt outward.
  const earProfile = (rx, rz, cz, n = 96) => Array.from({length: n}, (_, i) => {
    const t = 2 * Math.PI * i / n;
    return [rx * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.8, cz + rz * Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 0.8];
  });
  function hinge(side, angle, origin) {
    const th = -side * angle * deg; // left ear (+x) tips toward +x
    return {origin, xAxis: [Math.cos(th), 0, Math.sin(th)], yAxis: [0, 1, 0], zAxis: [-Math.sin(th), 0, Math.cos(th)]};
  }
  const ears = [];
  for (const [side, tag, label] of [[1, 'l', 'Left'], [-1, 'r', 'Right']]) {
    const frame = hinge(side, earTilt, [side * 22, 0, 150]);
    const shell = G.piece();
    G.extrude(shell, earProfile(15, 37, 28), {depth: 12, creaseAngle: 35});
    G.transform(shell, {origin: [0, 6, 0], ...G.plane('xz')});
    G.transform(shell, frame);
    const ear = G.merge(G.part(`ear_${tag}`, `${label} ear`), shell);
    ear.explosion = [side * 30, 0, 72];
    const lit = G.piece();
    G.extrude(lit, earProfile(8.6, 26, 31), {depth: 1.2, creaseAngle: 35});
    G.transform(lit, {origin: [0, -6.1, 0], ...G.plane('xz')});
    G.transform(lit, frame);
    const led = G.merge(G.part(`earled_${tag}`, `${label} ear LED panel`), lit);
    led.explosion = [side * 30, -34, 72];
    ears.push(ear, led);
  }

  // Microphone pods on the sides of the head (the grey discs).
  const mics = [1, -1].map((side) => {
    const p = G.part(side > 0 ? 'mic_l' : 'mic_r', side > 0 ? 'Left microphone pod' : 'Right microphone pod',
      [side * 140, 0, 40]);
    const prof = [[-3, 0], [-3, 12.5], [3.6, 12.5], [5, 11], [5.5, 8], [5.5, 0]];
    G.lathe(p, side > 0 ? prof : prof.map(([x, r]) => [-x, r]).reverse(), {axis: 'x', at: [side * 53.5, 0, 121], creaseAngle: 25});
    G.circle(p, [side * 59.05, 0, 121], 4.5, [side, 0, 0], {role: 'detail'});
    return p;
  });

  // Head internals: camera and speaker behind the face.
  const camera = G.part('camera', 'AI camera module', [0, -12, 40]);
  G.box(camera, [-27, -27, 120], [-3, -19, 138], {radius: 2});
  G.lathe(camera, [[0, 0], [0, 7], [-4, 7], [-5, 5.5], [-5, 0]], {axis: 'y', at: [-15, -27, 129], creaseAngle: 20});
  G.circle(camera, [-15, -32.05, 129], 3, [0, -1, 0], {role: 'detail'});

  const speaker = G.part('speaker', 'Speaker', [0, -12, 40]);
  G.lathe(speaker, [[0, 0], [0, 13], [2.5, 13], [3, 11], [9, 5.5], [11, 5.5], [11, 0]], {axis: 'y', at: [17, -26, 106], creaseAngle: 20});
  G.circle(speaker, [17, -26.05, 106], 4.2, [0, -1, 0], {role: 'detail'});

  const collar = G.part('collar', 'Neck collar', [0, 0, 20]);
  G.lathe(collar, [[79, 0], [79, 20], [80.5, 22.5], [87.5, 23], [89.5, 21.5], [91, 19], [91, 0]], {axis: 'z', creaseAngle: 30});

  // ---------- torso ---------------------------------------------------------------
  const chestFront = shellHalf('chest_front', 'Chest front shell', TORSO, 'front');
  panelLine(chestFront, station(TORSO, 42), 'front');
  const chestBack = shellHalf('chest_back', 'Chest rear shell', TORSO, 'back');
  panelLine(chestBack, station(TORSO, 42), 'back');
  chestFront.explosion = [-112, -10, 0];
  chestBack.explosion = [112, 22, 0];
  headFront.explosion = [-120, -10, 40];
  headBack.explosion = [120, 22, 40];
  face.explosion = [...headFront.explosion];
  blush.explosion = [...headFront.explosion];

  const ring = G.part('status_ring', 'Status light ring', [...chestFront.explosion]);
  G.lathe(ring, [[-1.7, 0], [-1.7, 10], [-1.2, 11.5], [1.6, 11.5], [1.6, 0]], {axis: 'y', at: [0, -29, 59], creaseAngle: 20});
  G.circle(ring, [0, -30.75, 59], 6.2, [0, -1, 0], {role: 'detail'});

  const board = G.part('board', 'AI processor board (NPU)', [0, -8, 4]);
  G.box(board, [-25, -16, 56], [25, -13, 80]);
  G.box(board, [-8, -19, 60], [8, -16, 76], {radius: 1});
  G.polyline(board, [[-5, -19.05, 63], [5, -19.05, 63], [5, -19.05, 73], [-5, -19.05, 73]], {closed: true, role: 'detail'});
  for (const [x0, z0] of [[-21, 58], [-21, 64], [12, 58], [17, 58], [12, 72]]) G.box(board, [x0, -18, z0], [x0 + 4, -16, z0 + 4]);
  G.box(board, [-21, -19, 71], [-12, -16, 77]);

  const depth = 14 + (batteryMah - 3000) / 1000 * 8;
  const battery = G.part('battery', `Battery pack (${batteryMah} mAh)`, [0, 0, -4]);
  G.box(battery, [-22, 2 - depth / 2, 36], [22, 2 + depth / 2, 54], {radius: 2.5});
  const by = 2 - depth / 2 - 0.05;
  G.polyline(battery, [[-14, by, 40], [14, by, 40], [14, by, 50], [-14, by, 50]], {closed: true, role: 'detail'});

  // ---------- limbs ---------------------------------------------------------------
  const servos = [1, -1].map((side) => {
    const p = G.part(side > 0 ? 'servo_l' : 'servo_r', side > 0 ? 'Left shoulder servo' : 'Right shoulder servo',
      [side * 6, 0, 0]);
    const x0 = side > 0 ? 32 : -42;
    G.box(p, [x0, -7, 58], [x0 + 10, 7, 69], {radius: 2});
    G.circle(p, [side * 42.05, 0, 63.5], 4, [side, 0, 0], {role: 'detail'});
    return p;
  });

  // Arm profile along its own axis (pivot at 0): round hand, narrow wrist, rounded upper arm.
  const arc = (cx, r, a0, a1, n) => Array.from({length: n + 1}, (_, i) => {
    const a = a0 + (a1 - a0) * i / n;
    return [cx + r * Math.sin(a), Math.max(0, r * Math.cos(a))];
  });
  const ARM = [...arc(-36, 10.5, -Math.PI / 2, Math.PI / 3, 20), [-25.6, 7.4], [-24, 9.3], [-22, 10],
    ...arc(-5, 10, 0, Math.PI / 2, 12)];
  const arms = [1, -1].map((side) => {
    const piece = G.piece();
    G.lathe(piece, ARM, {axis: 'z', creaseAngle: 28});
    G.transform(piece, hinge(-side, side > 0 ? armWave : 0, [side * 48, 0, 64]));
    const p = G.merge(G.part(side > 0 ? 'arm_l' : 'arm_r', side > 0 ? 'Left arm' : 'Right arm'), piece);
    p.explosion = [side * 135, 0, 0];
    return p;
  });

  const legs = [], feet = [], soles = [];
  for (const [side, tag, label] of [[1, 'l', 'Left'], [-1, 'r', 'Right']]) {
    const cx = side * 17;
    const leg = G.part(`leg_${tag}`, `${label} hip servo & leg`, [0, 0, -14]);
    G.lathe(leg, [[16, 0], [16, 10], [37, 10], [37, 0]], {axis: 'z', at: [cx, -2, 0], creaseAngle: 20});
    legs.push(leg);
    const foot = G.part(`foot_${tag}`, `${label} foot`, [0, 0, -30]);
    const footStations = Array.from({length: 14}, (_, i) => {
      const t = Math.sin(Math.PI / 2 * i / 13), z = 3.2 + 17 * t;
      const f = Math.max(0.3, 1 - t ** 2.6) ** (1 / 2.6);
      return [z, 34 * f, 45 * f];
    });
    G.loft(foot, footStations.map(([z, w, d]) => fullRing(w, d, z, [cx, -6])), {lines: 'none'});
    feet.push(foot);
    const sole = G.part(`sole_${tag}`, `${label} sole`, [0, 0, -48]);
    G.loft(sole, [[0, 31, 42], [3, 33, 44]].map(([z, w, d]) => fullRing(w, d, z, [cx, -6])), {lines: 'ends'});
    soles.push(sole);
  }

  const dock = G.part('dock', 'Charging dock', [0, 0, -84]);
  G.lathe(dock, [[-16, 0], [-16, 58], [-14.5, 62], [-3, 63], [-0.9, 61.5], [-0.4, 59], [-0.4, 0]],
    {axis: 'z', at: [0, -6, 0], creaseAngle: 25});
  G.circle(dock, [0, -6, -9.5], 62.66, [0, 0, 1], {role: 'detail'});
  for (const cx of [-17, 17]) {
    for (const dx of [-4, 0, 4]) G.lathe(dock, [[-0.6, 0], [-0.6, 1.1], [0.8, 1.1], [0.8, 0]], {axis: 'z', at: [cx + dx, -6, 0], segments: 36});
  }

  const parts = [headFront, face, blush, headBack, ...ears, ...mics, camera, speaker, collar, chestFront, ring,
    chestBack, board, battery, ...servos, ...arms, ...legs, ...feet, ...soles, dock];
  const trails = [
    {a: [48, 0, 64], b: [42, 0, 63.5], from: 'arm_l', to: 'servo_l'},
    {a: [-48, 0, 64], b: [-42, 0, 63.5], from: 'arm_r', to: 'servo_r'},
    {a: [17, -6, 3], b: [17, -6, 0], from: 'foot_l', to: 'sole_l'},
    {a: [-17, -6, 3], b: [-17, -6, 0], from: 'foot_r', to: 'sole_r'},
  ];
  return TechnicalProjection.render(parts, {...options, trails, camera: {azimuth: -112, elevation: 14, roll: 0}});
};
