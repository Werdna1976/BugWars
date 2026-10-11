// Small Canvas 2D toolkit for the procedural art: shaded blobs, outlined
// limbs, color math and seeded noise. Everything here is plain canvas, so the
// art can be previewed outside Phaser (see art.html).

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

export const INK = '#1a1008'; // shared outline color, keeps every sprite readable on the dirt

// ---------- color ----------

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Positive amount lightens toward white, negative darkens toward black.
export function tone(hex: string, amount: number): string {
  const c = parse(hex);
  return toHex(c.map((v) => (amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
}

export function mix(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------- seeded randomness ----------

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise in [0, 1], for soil, water and shell texture.
export function valueNoise(seed: number) {
  const perm = new Uint8Array(512);
  const r = rng(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = Array.from({ length: 256 }, () => r());
  const lattice = (x: number, y: number) => vals[perm[(perm[x & 255] + y) & 511]];
  const fade = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  // Fractal sum of a few octaves.
  return (x: number, y: number, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

// ---------- shapes ----------

export function ellipsePath(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

// A shaded, outlined oval lit from the upper left: the basic building block for
// shells, heads and abdomens.
export function blob(
  ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string,
  opts: { rot?: number; gloss?: number; outline?: number; dark?: number } = {},
) {
  const { rot = 0, gloss = 0.35, outline = 3, dark = 0.45 } = opts;
  if (outline > 0) {
    ellipsePath(ctx, x, y, rx + outline * 0.5, ry + outline * 0.5, rot);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, tone(color, gloss));
  g.addColorStop(0.55, color);
  g.addColorStop(1, tone(color, -dark));
  ellipsePath(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = g;
  ctx.fill();
}

// Specular highlight streak.
export function glint(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.55, rot = 0) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ellipsePath(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = g;
  ctx.fill();
}

// A jointed limb: dark outline pass, then the color pass on top.
export function limb(ctx: Ctx, pts: Pt[], width: number, color: string, outline = 2.5) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (w: number, c: string) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  if (outline > 0) stroke(width + outline, INK);
  stroke(width, color);
}

// A limb that tapers from base to tip, drawn as a filled polygon.
export function taper(ctx: Ctx, pts: Pt[], w0: number, w1: number, color: string, outline = 2) {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [px, py] = pts[Math.max(0, i - 1)];
    const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
    let dx = nx - px;
    let dy = ny - py;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([x - dy * w, y + dx * w]);
    right.push([x + dy * w, y - dx * w]);
  }
  const poly = [...left, ...right.reverse()];
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (const [x, y] of poly.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  if (outline > 0) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = outline * 2;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fill();
}

export function poly(ctx: Ctx, pts: Pt[], fill: string, outline = 0) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  if (outline > 0) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = outline * 2;
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

// Soft drop shadow ellipse.
export function softShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.6})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.beginPath();
  ctx.arc(x, y, rx, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// Run a draw with the context translated/rotated, restoring after.
export function at(ctx: Ctx, x: number, y: number, rot: number, draw: () => void, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);
  draw();
  ctx.restore();
}
