/* ============================================================
   Herbario procedural
   Genera ilustraciones de plantas/flores construidas a partir
   de piezas modulares (tallo, hojas, cabeza floral) combinadas
   aleatoriamente. Todo el trazo se simula "a lápiz": líneas
   temblorosas + tramas de rayado, con manchas de color sueltas
   por debajo que no respetan el contorno.
   ============================================================ */

// ---------- Config ----------
const COLS = 4;
const ROWS = 6;
const CELL = 250;              // resolución lógica de cada celda (cuadrada)
const SHEET_W = COLS * CELL;
const SHEET_H = ROWS * CELL;
const EXPORT_SCALE = 4.8;      // factor de escala al descargar una celda

const PAPER_BASE = { h: 42, s: 32, l: 90 }; // tono crema base del papel

// ---------- PRNG (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rand(rng, min, max) { return min + rng() * (max - min); }
function randInt(rng, min, max) { return Math.floor(rand(rng, min, max + 1)); }
function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function chance(rng, p) { return rng() < p; }
function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

// ---------- Color ----------
function hsla(h, s, l, a) { return `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`; }

// Genera una paleta cálida/variada distinta cada vez, compartida por la lámina.
function makePalette(rng) {
  const baseHue = rand(rng, 0, 360);
  const spread = rand(rng, 30, 70);
  const n = 5;
  const colors = [];
  for (let i = 0; i < n; i++) {
    const h = (baseHue + rand(rng, -spread, spread) + 360) % 360;
    const s = rand(rng, 35, 65);
    const l = rand(rng, 45, 68);
    colors.push({ h, s, l });
  }
  return colors;
}

// ---------- Geometría básica ----------
function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}
function bezierPoints(p0, p1, p2, p3, segments) {
  const pts = [];
  for (let i = 0; i <= segments; i++) pts.push(cubicBezierPoint(p0, p1, p2, p3, i / segments));
  return pts;
}
function transformPoints(points, tx, ty, rot, scale) {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  return points.map(p => {
    const sx = p.x * scale, sy = p.y * scale;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    return { x: rx + tx, y: ry + ty };
  });
}
function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// Forma de hoja/pétalo: óvalo apuntado, asimétrico, en coordenadas locales
// (base en 0,0, punta en -length sobre el eje y).
function leafOutline(rng, length, width, roundedTip) {
  const asymR = rand(rng, 0.82, 1.18);
  const asymL = rand(rng, 0.82, 1.18);
  const bulge1 = width * 0.56, bulge2 = width * 0.26;
  const jit = () => rand(rng, -length * 0.035, length * 0.035);
  const p0 = { x: 0, y: 0 };
  const tip = roundedTip
    ? { x: jit(), y: -length * 0.94 }
    : { x: jit() * 0.4, y: -length };

  const rc1 = { x: bulge1 * asymR, y: -length * 0.26 + jit() };
  const rc2 = { x: bulge2 * asymR, y: -length * 0.74 + jit() };
  const rightPts = bezierPoints(p0, rc1, rc2, tip, 10);

  const lc1 = { x: -bulge2 * asymL, y: -length * 0.74 + jit() };
  const lc2 = { x: -bulge1 * asymL, y: -length * 0.26 + jit() };
  const leftPts = bezierPoints(tip, lc1, lc2, p0, 10);

  return rightPts.concat(leftPts.slice(1));
}

// ---------- Dibujo "a lápiz" ----------
function strokeSketchy(ctx, points, opts) {
  const { color, width = 1.3, passes = 2, alpha = 0.7, closed = false } = opts;
  for (let p = 0; p < passes; p++) {
    ctx.save();
    ctx.globalAlpha = alpha * rand(opts.rng, 0.75, 1);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * rand(opts.rng, 0.8, 1.15);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const dx = rand(opts.rng, -0.6, 0.6);
    const dy = rand(opts.rng, -0.6, 0.6);
    points.forEach((pt, i) => {
      const jx = pt.x + dx + rand(opts.rng, -0.35, 0.35);
      const jy = pt.y + dy + rand(opts.rng, -0.35, 0.35);
      if (i === 0) ctx.moveTo(jx, jy); else ctx.lineTo(jx, jy);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  // pequeño "flick" de lápiz al final del trazo
  if (points.length > 2 && chance(opts.rng, 0.5)) {
    const a = points[points.length - 2], b = points[points.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = rand(opts.rng, 2, 5);
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 0.7;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(ang) * len, b.y + Math.sin(ang) * len);
    ctx.stroke();
    ctx.restore();
  }
}

function fillSolid(ctx, points, color, rng) {
  ctx.save();
  ctx.globalAlpha = rand(rng, 0.85, 0.97);
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Rellena una forma cerrada con rayado tipo lápiz (hachure).
function hatchFill(ctx, points, color, rng, opts = {}) {
  const bb = bboxOf(points);
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
  const diag = Math.sqrt(w * w + h * h) * 0.75;
  const spacing = opts.spacing || rand(rng, 2.6, 4.2);
  const angle = opts.angle !== undefined ? opts.angle : rand(rng, -0.5, 0.5);

  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();

  ctx.translate(bb.cx, bb.cy);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';

  for (let off = -diag; off <= diag; off += spacing) {
    if (chance(rng, 0.12)) continue; // huecos para que no sea denso y uniforme
    const x = off + rand(rng, -0.4, 0.4);
    ctx.globalAlpha = rand(rng, 0.25, 0.5);
    ctx.lineWidth = rand(rng, 0.5, 0.9);
    ctx.beginPath();
    // línea ligeramente quebrada, no perfectamente recta
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const y = -diag + (2 * diag) * (s / steps);
      const wob = rand(rng, -0.5, 0.5);
      if (s === 0) ctx.moveTo(x + wob, y); else ctx.lineTo(x + wob, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Mancha de color suelta "por detrás" de una forma, sin respetar su contorno.
function drawWash(ctx, cx, cy, radius, rng, colorObj) {
  const blobs = randInt(rng, 2, 3);
  for (let i = 0; i < blobs; i++) {
    const r = radius * rand(rng, 0.9, 1.6);
    const ox = rand(rng, -radius * 0.5, radius * 0.5);
    const oy = rand(rng, -radius * 0.5, radius * 0.5);
    const grad = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
    const a = rand(rng, 0.28, 0.48);
    grad.addColorStop(0, hsla(colorObj.h, colorObj.s, colorObj.l, a));
    grad.addColorStop(1, hsla(colorObj.h, colorObj.s, colorObj.l, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- Textura de papel ----------
// Dibuja el papel de una sola vez sobre una región (x,y,w,h) dada, sin
// preocuparse de encajar con celdas vecinas. Se usa tanto para la lámina
// completa (una sola pasada sobre todo el folio) como para la exportación
// aislada de una celda.
function drawPaper(ctx, x, y, w, h, rng) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = hsla(PAPER_BASE.h, PAPER_BASE.s, PAPER_BASE.l, 1);
  ctx.fillRect(x, y, w, h);

  // moteado suave a gran escala, repartido por todo el área
  const area = w * h;
  const blotches = Math.max(4, Math.round(area / 40000));
  for (let i = 0; i < blotches; i++) {
    const bx = rand(rng, x, x + w);
    const by = rand(rng, y, y + h);
    const r = rand(rng, Math.min(w, h) * 0.3, Math.min(w, h) * 0.65);
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    const shade = rand(rng, -3.5, 3.5);
    grad.addColorStop(0, hsla(PAPER_BASE.h, PAPER_BASE.s, PAPER_BASE.l + shade, 0.45));
    grad.addColorStop(1, hsla(PAPER_BASE.h, PAPER_BASE.s, PAPER_BASE.l, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  // grano fino
  const speckles = Math.floor(area * 0.01);
  for (let i = 0; i < speckles; i++) {
    const sx = rand(rng, x, x + w);
    const sy = rand(rng, y, y + h);
    const r = rand(rng, 0.2, 0.7);
    const dark = chance(rng, 0.65);
    ctx.fillStyle = dark
      ? hsla(35, 25, rand(rng, 30, 55), rand(rng, 0.03, 0.09))
      : hsla(PAPER_BASE.h, PAPER_BASE.s, rand(rng, 92, 99), rand(rng, 0.05, 0.1));
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ---------- Piezas de la planta ----------
const INK = 'hsla(30, 20%, 18%, 1)';

function buildStem(rng, w, h) {
  const base = { x: w * 0.5 + rand(rng, -w * 0.08, w * 0.08), y: h * 0.93 };
  const height = rand(rng, h * 0.5, h * 0.72);
  const drift = rand(rng, -w * 0.16, w * 0.16);
  const top = { x: base.x + drift, y: base.y - height };
  const bendDir = choice(rng, [-1, 1]);
  const c1 = {
    x: base.x + bendDir * rand(rng, w * 0.05, w * 0.14),
    y: base.y - height * 0.35
  };
  const c2 = {
    x: top.x - bendDir * rand(rng, w * 0.03, w * 0.1),
    y: base.y - height * 0.75
  };
  const points = bezierPoints(base, c1, c2, top, 24);
  return { points, base, top };
}

function pointOnStem(stemPoints, t) {
  const idx = Math.min(stemPoints.length - 2, Math.max(0, Math.floor(t * (stemPoints.length - 1))));
  const a = stemPoints[idx], b = stemPoints[idx + 1];
  const tangent = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2; // perpendicular hacia fuera
  return { point: a, tangent };
}

function buildLeafPart(rng, attach, tangent, side, scale) {
  const length = rand(rng, 20, 38) * scale;
  const width = length * rand(rng, 0.34, 0.52);
  const local = leafOutline(rng, length, width, false);
  const spread = rand(rng, 0.55, 1.05);
  const angle = tangent + side * spread + rand(rng, -0.15, 0.15);
  const points = transformPoints(local, attach.x, attach.y, angle, 1);
  const bb = bboxOf(points);
  return { points, cx: bb.cx, cy: bb.cy, r: Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.5 };
}

function buildPetal(rng, center, angle, len, wid, roundedTip) {
  const local = leafOutline(rng, len, wid, roundedTip);
  const points = transformPoints(local, center.x, center.y, angle, 1);
  const bb = bboxOf(points);
  return { points, cx: bb.cx, cy: bb.cy, r: Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.5 };
}

function buildFlower(rng, center, scale) {
  const type = choice(rng, ['radial', 'star', 'cluster', 'bell']);
  const parts = [];
  const baseAngle = rand(rng, 0, Math.PI * 2);

  if (type === 'radial') {
    const n = randInt(rng, 5, 9);
    const len = rand(rng, 16, 26) * scale;
    for (let i = 0; i < n; i++) {
      const a = baseAngle + (i / n) * Math.PI * 2 + rand(rng, -0.12, 0.12);
      const l = len * rand(rng, 0.85, 1.2);
      const wd = l * rand(rng, 0.5, 0.7);
      parts.push(buildPetal(rng, center, a, l, wd, true));
    }
  } else if (type === 'star') {
    const n = randInt(rng, 5, 7);
    const len = rand(rng, 22, 34) * scale;
    for (let i = 0; i < n; i++) {
      const a = baseAngle + (i / n) * Math.PI * 2 + rand(rng, -0.1, 0.1);
      const l = len * rand(rng, 0.8, 1.25);
      const wd = l * rand(rng, 0.22, 0.34);
      parts.push(buildPetal(rng, center, a, l, wd, false));
    }
  } else if (type === 'cluster') {
    const n = randInt(rng, 6, 11);
    for (let i = 0; i < n; i++) {
      const dist = rand(rng, 0, 16) * scale;
      const a = rand(rng, 0, Math.PI * 2);
      const c = { x: center.x + Math.cos(a) * dist, y: center.y + Math.sin(a) * dist - dist * 0.3 };
      const l = rand(rng, 6, 11) * scale;
      const wd = l * rand(rng, 0.55, 0.8);
      parts.push(buildPetal(rng, c, rand(rng, 0, Math.PI * 2), l, wd, true));
    }
  } else { // bell
    const l = rand(rng, 30, 42) * scale;
    const wd = l * rand(rng, 0.6, 0.8);
    parts.push(buildPetal(rng, center, baseAngle, l, wd, true));
  }

  return { type, parts, center };
}

// ---------- Render de una planta dentro de una celda (sin papel) ----------
function renderPlant(ctx, x, y, w, h, seed, palette) {
  const rng = mulberry32(seed);

  ctx.save();
  ctx.translate(x, y);

  const stem = buildStem(rng, w, h);
  const stemScale = rand(rng, 0.85, 1.15);

  const leafCount = randInt(rng, 0, 3);
  const leaves = [];
  for (let i = 0; i < leafCount; i++) {
    const t = rand(rng, 0.22, 0.82);
    const { point, tangent } = pointOnStem(stem.points, t);
    const side = chance(rng, 0.5) ? 1 : -1;
    leaves.push(buildLeafPart(rng, point, tangent, side, stemScale));
  }

  const flower = buildFlower(rng, stem.top, stemScale);

  const col1 = choice(rng, palette);
  const col2 = choice(rng, palette);

  // --- Fase A: manchas de color detrás de todo ---
  leaves.forEach(l => drawWash(ctx, l.cx, l.cy, l.r * 1.1, rng, col2));
  flower.parts.forEach(p => drawWash(ctx, p.cx, p.cy, p.r * 1.05, rng, col1));

  // --- Fase B: tallo ---
  strokeSketchy(ctx, stem.points, { color: INK, width: 1.6, passes: 2, alpha: 0.8, rng });

  // --- Fase C: hojas ---
  leaves.forEach(l => {
    const solid = chance(rng, 0.22);
    if (solid) {
      fillSolid(ctx, l.points, hsla(col2.h, col2.s, col2.l, 1), rng);
      strokeSketchy(ctx, l.points, { color: INK, width: 1, passes: 1, alpha: 0.55, closed: true, rng });
    } else {
      hatchFill(ctx, l.points, INK, rng, {});
      strokeSketchy(ctx, l.points, { color: INK, width: 1.1, passes: 2, alpha: 0.75, closed: true, rng });
    }
  });

  // --- Fase D: flor ---
  flower.parts.forEach(p => {
    const solid = chance(rng, 0.22);
    if (solid) {
      fillSolid(ctx, p.points, hsla(col1.h, col1.s, col1.l, 1), rng);
      strokeSketchy(ctx, p.points, { color: INK, width: 1, passes: 1, alpha: 0.55, closed: true, rng });
    } else {
      hatchFill(ctx, p.points, INK, rng, {});
      strokeSketchy(ctx, p.points, { color: INK, width: 1.1, passes: 2, alpha: 0.75, closed: true, rng });
    }
  });

  // centro de la flor (si aplica)
  if (flower.type === 'radial' || flower.type === 'star') {
    const r = rand(rng, 3, 5.5) * stemScale;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(stem.top.x, stem.top.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const dots = randInt(rng, 6, 12);
    for (let i = 0; i < dots; i++) {
      const a = rand(rng, 0, Math.PI * 2);
      const d = rand(rng, 0, r * 1.3);
      ctx.save();
      ctx.globalAlpha = rand(rng, 0.4, 0.8);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(stem.top.x + Math.cos(a) * d, stem.top.y + Math.sin(a) * d, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

// ---------- Estado de la lámina ----------
const state = { seeds: [], palette: [], paperSeed: 0 };

function generateSheetState() {
  const rng = mulberry32(randomSeed());
  state.palette = makePalette(rng);
  state.seeds = Array.from({ length: COLS * ROWS }, () => randomSeed());
  state.paperSeed = randomSeed();
}

function cellRect(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: col * CELL, y: row * CELL, w: CELL, h: CELL, col, row };
}

// ---------- Render principal (pantalla) ----------
const canvas = document.getElementById('sheet');
const ctx = canvas.getContext('2d');

function drawSheet() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = SHEET_W * dpr;
  canvas.height = SHEET_H * dpr;
  canvas.style.width = '100%';
  canvas.style.aspectRatio = `${SHEET_W} / ${SHEET_H}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SHEET_W, SHEET_H);

  // el papel se pinta UNA sola vez para todo el folio: sin costuras entre celdas
  drawPaper(ctx, 0, 0, SHEET_W, SHEET_H, mulberry32(state.paperSeed));

  for (let i = 0; i < state.seeds.length; i++) {
    const r = cellRect(i);
    renderPlant(ctx, r.x, r.y, r.w, r.h, state.seeds[i], state.palette);
  }
}

// ---------- Descarga de una celda en alta resolución ----------
function downloadCell(index) {
  const size = Math.round(CELL * EXPORT_SCALE);
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  octx.scale(EXPORT_SCALE, EXPORT_SCALE);
  // papel propio y aislado para esta exportación (una celda no necesita
  // encajar con sus vecinas fuera de la lámina)
  drawPaper(octx, 0, 0, CELL, CELL, mulberry32(state.seeds[index] ^ 0x9e3779b9));
  renderPlant(octx, 0, 0, CELL, CELL, state.seeds[index], state.palette);

  off.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planta-${state.seeds[index]}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const relX = (e.clientX - rect.left) / rect.width;
  const relY = (e.clientY - rect.top) / rect.height;
  const col = Math.min(COLS - 1, Math.floor(relX * COLS));
  const row = Math.min(ROWS - 1, Math.floor(relY * ROWS));
  const index = row * COLS + col;
  downloadCell(index);
});

document.getElementById('regen-btn').addEventListener('click', () => {
  generateSheetState();
  drawSheet();
});

window.addEventListener('resize', () => drawSheet());

// ---------- Arranque ----------
generateSheetState();
drawSheet();
