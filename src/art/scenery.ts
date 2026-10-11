import { Ctx, INK, Pt, at, blob, ellipsePath, glint, limb, mix, poly, rgba, rng, softShadow, taper, tone, valueNoise } from './paint';

// The garden: soil, worn lanes, grass and clutter, rain puddles, the flowerpot
// Outposts with their sunflower turrets, the straw-skep Nests, and small effects.

const TAU = Math.PI * 2;

export interface FieldInfo {
  cols: number;
  rows: number;
  tile: number;
  isWet(col: number, row: number): boolean;
  lanes: number[]; // x centers (in tiles) of the two walking lanes
  towers: { x: number; y: number; size: number }[]; // centers and sizes in tiles
}

// Smooth "how wet is it here" field built from the wet tiles, so puddle edges are
// organic instead of square. >= 0.5 is water.
function wetness(f: FieldInfo) {
  const centers: Pt[] = [];
  for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) if (f.isWet(c, r)) centers.push([(c + 0.5) * f.tile, (r + 0.5) * f.tile]);
  const n = valueNoise(77);
  const sigma = f.tile * 0.62;
  return (x: number, y: number) => {
    let v = 0;
    for (const [cx, cy] of centers) {
      const dx = x - cx;
      const dy = y - cy;
      if (Math.abs(dx) > sigma * 3 || Math.abs(dy) > sigma * 3) continue;
      v += Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
    return Math.min(1.6, v * 0.62) + (n(x / 26, y / 26, 3) - 0.5) * 0.28;
  };
}

// ---------- ground ----------

export function drawGround(ctx: Ctx, f: FieldInfo) {
  const W = f.cols * f.tile;
  const H = f.rows * f.tile;
  const wet = wetness(f);
  const soil = valueNoise(11);
  const grain = rng(5);
  const lane = valueNoise(23);
  const img = ctx.createImageData(W, H);
  const dark = [62, 44, 30];
  const light = [128, 96, 64];
  const path = [150, 118, 82];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = soil(x / 90, y / 90, 5);
      let t = 0.25 + s * 0.6;
      // Worn lanes: smoother, paler dirt where bugs walk.
      let worn = 0;
      for (const lx of f.lanes) {
        const d = Math.abs(x - lx * f.tile) / (f.tile * 1.7);
        worn = Math.max(worn, Math.exp(-d * d * 1.6) * (0.7 + lane(x / 40, y / 40, 3) * 0.6));
      }
      const w = wet(x, y);
      const damp = Math.max(0, Math.min(1, (w - 0.12) / 0.38)); // soil darkens toward puddles
      let r = dark[0] + (light[0] - dark[0]) * t;
      let g = dark[1] + (light[1] - dark[1]) * t;
      let b = dark[2] + (light[2] - dark[2]) * t;
      const wk = worn * 0.55;
      r += (path[0] - r) * wk;
      g += (path[1] - g) * wk;
      b += (path[2] - b) * wk;
      const dk = 1 - damp * 0.45;
      const gr = (grain() - 0.5) * 18;
      const i = (y * W + x) * 4;
      img.data[i] = r * dk + gr;
      img.data[i + 1] = g * dk + gr;
      img.data[i + 2] = b * dk + gr * 0.8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const r = rng(99);
  const nearTower = (x: number, y: number, pad: number) =>
    f.towers.some((t) => Math.abs(x - t.x * f.tile) < (t.size / 2) * f.tile + pad && Math.abs(y - t.y * f.tile) < (t.size / 2) * f.tile + pad);
  const onLane = (x: number) => f.lanes.some((lx) => Math.abs(x - lx * f.tile) < f.tile * 1.3);
  const dry = (x: number, y: number) => wet(x, y) < 0.2;

  // Crumbs and clods for texture.
  for (let i = 0; i < 1400; i++) {
    const x = r() * W;
    const y = r() * H;
    const c = r() < 0.5 ? rgba('#2a1c10', 0.35) : rgba('#b08860', 0.3);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + r() * 1.6, 0, TAU);
    ctx.fill();
  }

  // Twigs.
  for (let i = 0; i < 9; i++) {
    const x = r() * W;
    const y = r() * H;
    if (!dry(x, y) || nearTower(x, y, 6) || onLane(x)) continue;
    twig(ctx, x, y, 20 + r() * 26, r() * TAU, r);
  }

  // Pebbles with shadows.
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() * H;
    if (!dry(x, y) || nearTower(x, y, 2)) continue;
    const s = 2 + r() * r() * 9;
    pebble(ctx, x, y, s, r);
  }

  // Fallen leaves.
  for (let i = 0; i < 12; i++) {
    const x = r() * W;
    const y = r() * H;
    if (!dry(x, y) || nearTower(x, y, 10) || onLane(x)) continue;
    leaf(ctx, x, y, 14 + r() * 12, r() * TAU, ['#c8742a', '#a8501e', '#d8a03a', '#8a6a2a', '#7a8a30'][Math.floor(r() * 5)], 0.95);
  }

  // Clover patches and grass along the sides and in the back corners.
  const grassy = (x: number, y: number) => x < 34 || x > W - 34 || ((y < 70 || y > H - 70) && !nearTower(x, y, 8));
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = r() * H;
    if (!dry(x, y) || nearTower(x, y, 10) || onLane(x) || (!grassy(x, y) && r() < 0.7)) continue;
    clover(ctx, x, y, 5 + r() * 3, r);
  }
  for (let i = 0; i < 520; i++) {
    const side = r() < 0.5;
    const x = side ? r() * 22 : W - r() * 22;
    const y = r() * H;
    if (wet(x, y) > 0.35) continue;
    grassTuft(ctx, x, y, 7 + r() * 9, r);
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * H;
    if (!dry(x, y) || nearTower(x, y, 6) || onLane(x)) continue;
    grassTuft(ctx, x, y, 5 + r() * 6, r);
  }
  // A few small flowers.
  for (let i = 0; i < 30; i++) {
    const side = r() < 0.5;
    const x = side ? 4 + r() * 22 : W - 4 - r() * 22;
    const y = r() * H;
    if (wet(x, y) > 0.3) continue;
    flower(ctx, x, y, 3 + r() * 2.5, r() < 0.6 ? '#f6f2e8' : r() < 0.5 ? '#8ab8f0' : '#f0c8e0', r);
  }

  // The midline: a faint row of scuffs where the halves meet.
  ctx.strokeStyle = rgba('#2a1a0e', 0.22);
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Vignette to frame the field.
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(10,6,2,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function pebble(ctx: Ctx, x: number, y: number, s: number, r: () => number) {
  const base = ['#9a948a', '#a8a090', '#7e786e', '#b4aa98', '#8a7e70'][Math.floor(r() * 5)];
  softShadow(ctx, x + s * 0.3, y + s * 0.45, s * 1.25, s * 0.8, 0.45);
  blob(ctx, x, y, s, s * (0.65 + r() * 0.3), base, { rot: r() * TAU, outline: s > 4 ? 1.2 : 0, gloss: 0.4, dark: 0.35 });
}

function twig(ctx: Ctx, x: number, y: number, len: number, ang: number, r: () => number) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push([x + Math.cos(ang) * len * t + (r() - 0.5) * 3, y + Math.sin(ang) * len * t + (r() - 0.5) * 3]);
  }
  ctx.save();
  ctx.translate(2, 3);
  limb(ctx, pts, 3.4, 'rgba(0,0,0,0.25)', 0);
  ctx.restore();
  taper(ctx, pts, 3.6, 1.6, '#6a4a2a', 0.8);
  const k = pts[2];
  limb(ctx, [k, [k[0] + Math.cos(ang + 0.7) * len * 0.3, k[1] + Math.sin(ang + 0.7) * len * 0.3]], 1.6, '#6a4a2a', 0.8);
}

export function leaf(ctx: Ctx, x: number, y: number, len: number, ang: number, color: string, alpha = 1) {
  at(ctx, x, y, ang, () => {
    ctx.globalAlpha = alpha;
    softShadow(ctx, 3, 4, len * 0.6, len * 0.3, 0.3);
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.bezierCurveTo(-len * 0.2, -len * 0.42, len * 0.3, -len * 0.3, len / 2, 0);
    ctx.bezierCurveTo(len * 0.3, len * 0.3, -len * 0.2, len * 0.42, -len / 2, 0);
    const g = ctx.createLinearGradient(0, -len * 0.3, 0, len * 0.3);
    g.addColorStop(0, tone(color, 0.18));
    g.addColorStop(1, tone(color, -0.25));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(INK, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = rgba(tone(color, -0.45), 0.7);
    ctx.beginPath();
    ctx.moveTo(-len * 0.62, 0);
    ctx.lineTo(len * 0.45, 0);
    for (let i = -2; i <= 2; i++) {
      if (!i) continue;
      const bx = i * len * 0.12;
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + len * 0.1, -len * 0.18);
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + len * 0.1, len * 0.18);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function clover(ctx: Ctx, x: number, y: number, s: number, r: () => number) {
  const n = 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const cx = x + (r() - 0.5) * s * 5;
    const cy = y + (r() - 0.5) * s * 5;
    const rot = r() * TAU;
    softShadow(ctx, cx + 2, cy + 3, s * 1.6, s * 1.2, 0.3);
    for (let i = 0; i < 3; i++) {
      const a = rot + (i * TAU) / 3;
      const lx = cx + Math.cos(a) * s * 0.75;
      const ly = cy + Math.sin(a) * s * 0.75;
      blob(ctx, lx, ly, s * 0.75, s * 0.68, mix('#4f9a3a', '#6ab84a', r()), { outline: 0.8, rot: a, gloss: 0.3 });
      ctx.strokeStyle = rgba('#e8f8d8', 0.4);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(lx, ly, s * 0.35, a + 1.6, a + 4.6);
      ctx.stroke();
    }
  }
}

function grassTuft(ctx: Ctx, x: number, y: number, h: number, r: () => number) {
  const blades = 3 + Math.floor(r() * 4);
  for (let i = 0; i < blades; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    const len = h * (0.6 + r() * 0.5);
    const tip: Pt = [x + Math.cos(a) * len, y + Math.sin(a) * len * 0.55];
    const mid: Pt = [x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 2, y + Math.sin(a) * len * 0.3];
    taper(ctx, [[x + (r() - 0.5) * 3, y], mid, tip], 3, 0.4, mix('#3f7a28', '#7ab84a', r()), 0.5);
  }
}

function flower(ctx: Ctx, x: number, y: number, s: number, petal: string, r: () => number) {
  const rot = r() * TAU;
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * TAU) / 6;
    blob(ctx, x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.7, s * 0.42, petal, { rot: a, outline: 0.7, gloss: 0.3, dark: 0.2 });
  }
  blob(ctx, x, y, s * 0.55, s * 0.55, '#f2c12e', { outline: 0.7, gloss: 0.4 });
}

// ---------- water ----------

// Puddles on their own transparent layer: a muddy rim, depth-shaded water, sky
// reflections and a bright waterline. Ripples and sparkles are animated on top in the scene.
export function drawWater(ctx: Ctx, f: FieldInfo) {
  const W = f.cols * f.tile;
  const H = f.rows * f.tile;
  const wet = wetness(f);
  const sky = valueNoise(31);
  const img = ctx.createImageData(W, H);
  const mud = [48, 32, 20];
  const shallow = [96, 140, 150];
  const deep = [34, 70, 96];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const w = wet(x, y);
      if (w < 0.36) continue;
      const i = (y * W + x) * 4;
      if (w < 0.5) {
        // Mud bank, glossy and darker near the water.
        const t = (w - 0.36) / 0.14;
        img.data[i] = mud[0] + 18 * (1 - t);
        img.data[i + 1] = mud[1] + 12 * (1 - t);
        img.data[i + 2] = mud[2] + 8 * (1 - t);
        img.data[i + 3] = Math.round(255 * Math.min(1, t * 1.6 + 0.15));
        continue;
      }
      const depth = Math.min(1, (w - 0.5) / 0.55);
      let r = shallow[0] + (deep[0] - shallow[0]) * depth;
      let g = shallow[1] + (deep[1] - shallow[1]) * depth;
      let b = shallow[2] + (deep[2] - shallow[2]) * depth;
      // Soft sky reflection streaks.
      const s = sky(x / 60 + y / 160, y / 22, 3);
      const refl = Math.max(0, s - 0.55) * 2.2;
      r += (205 - r) * refl * 0.55;
      g += (230 - g) * refl * 0.55;
      b += (240 - b) * refl * 0.55;
      // Bright line at the waterline.
      if (w < 0.56) {
        const e = 1 - (w - 0.5) / 0.06;
        r += (220 - r) * e * 0.5;
        g += (236 - g) * e * 0.5;
        b += (236 - b) * e * 0.5;
      }
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 245;
    }
  }
  // Composite through a scratch canvas so this can also paint over an existing ground.
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);

  // Sunken pebbles and a submerged leaf for depth.
  const r = rng(404);
  for (let i = 0; i < 30; i++) {
    const x = r() * W;
    const y = r() * H;
    const w = wet(x, y);
    if (w < 0.62) continue;
    ctx.globalAlpha = 0.35;
    blob(ctx, x, y, 2 + r() * 4, 1.5 + r() * 3, '#3a3a30', { outline: 0, gloss: 0.2 });
    ctx.globalAlpha = 1;
  }
}

// Points inside the water, for placing animated ripples, sparkles and floating leaves.
export function waterSpots(f: FieldInfo, count: number, seed: number, minWet = 0.65): Pt[] {
  const wet = wetness(f);
  const r = rng(seed);
  const W = f.cols * f.tile;
  const H = f.rows * f.tile;
  const out: Pt[] = [];
  for (let tries = 0; out.length < count && tries < count * 200; tries++) {
    const x = r() * W;
    const y = r() * H;
    if (wet(x, y) >= minWet) out.push([x, y]);
  }
  return out;
}

// ---------- towers ----------

// Terracotta flowerpot seen from above, with a team-colored ribbon on the rim.
export function drawOutpost(ctx: Ctx, size: number, team: string) {
  const c = size / 2;
  const R = size * 0.46;
  softShadow(ctx, c + R * 0.12, c + R * 0.18, R * 1.12, R * 1.0, 0.5);
  // Mulch ring on the ground.
  const rr = rng(size);
  for (let i = 0; i < 60; i++) {
    const a = rr() * TAU;
    const d = R * (0.98 + rr() * 0.1);
    ctx.fillStyle = rgba(rr() < 0.5 ? '#3a2614' : '#8a6a40', 0.7);
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + rr() * 3, 1 + rr() * 2, a, 0, TAU);
    ctx.fill();
  }
  // Outer rim.
  blob(ctx, c, c, R, R, '#c8643a', { gloss: 0.35, dark: 0.4, outline: 4 });
  // Rim lip ring.
  const lip = ctx.createRadialGradient(c - R * 0.3, c - R * 0.3, R * 0.2, c, c, R);
  lip.addColorStop(0, '#f0a070');
  lip.addColorStop(0.6, '#d0703f');
  lip.addColorStop(1, '#9a4420');
  ctx.beginPath();
  ctx.arc(c, c, R * 0.92, 0, TAU);
  ctx.fillStyle = lip;
  ctx.fill();
  // Inner wall in shadow.
  const wall = ctx.createRadialGradient(c + R * 0.2, c + R * 0.25, R * 0.3, c, c, R * 0.8);
  wall.addColorStop(0, '#8a3a1a');
  wall.addColorStop(1, '#5a2410');
  ctx.beginPath();
  ctx.arc(c, c, R * 0.78, 0, TAU);
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Soil.
  const soil = ctx.createRadialGradient(c - R * 0.1, c - R * 0.15, 0, c, c, R * 0.7);
  soil.addColorStop(0, '#5a3e28');
  soil.addColorStop(1, '#2e1e12');
  ctx.beginPath();
  ctx.arc(c + R * 0.04, c + R * 0.05, R * 0.68, 0, TAU);
  ctx.fillStyle = soil;
  ctx.fill();
  for (let i = 0; i < 70; i++) {
    const a = rr() * TAU;
    const d = Math.sqrt(rr()) * R * 0.62;
    ctx.fillStyle = rgba(rr() < 0.5 ? '#1e140a' : '#7a5a3a', 0.6);
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.8 + rr() * 2, 0, TAU);
    ctx.fill();
  }
  // Moss tufts on the soil.
  for (let i = 0; i < 5; i++) {
    const a = rr() * TAU;
    const d = R * (0.4 + rr() * 0.2);
    blob(ctx, c + Math.cos(a) * d, c + Math.sin(a) * d, 4 + rr() * 3, 3 + rr() * 2, '#5a8a30', { outline: 0, gloss: 0.4 });
  }
  // Rim highlight and chips.
  ctx.strokeStyle = rgba('#ffd0a8', 0.6);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.9, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  // Team ribbon wrapped around the rim with a bow at the front.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.86, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.strokeStyle = team;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.84, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  const bx = c;
  const by = c + R * 0.86;
  for (const s of [-1, 1]) {
    poly(ctx, [[bx, by], [bx + s * 12, by - 7], [bx + s * 13, by + 6]], team, 1.2);
    taper(ctx, [[bx, by], [bx + s * 5, by + 10], [bx + s * 8, by + 16]], 5, 3, tone(team, -0.15), 1);
  }
  blob(ctx, bx, by, 4, 3.5, tone(team, 0.1), { outline: 1.2 });
}

// Sunflower turret, tilted to face +x so it can be rotated to aim.
export function drawSunflower(ctx: Ctx, size: number, recoil = 0) {
  const c = size / 2;
  const R = size * 0.3;
  const hx = c + R * 0.35 - recoil * R * 0.25; // head sits forward of the stem
  // Stem and two leaves.
  taper(ctx, [[c - R * 0.5, c], [c, c], [hx, c]], 7, 6, '#4a8a2a', 1.5);
  for (const s of [-1, 1]) leafShape(ctx, c - R * 0.2, c + s * 2, R * 0.9, s * 1.9, '#5aa036');
  softShadow(ctx, hx + 4, c + 6, R * 1.15, R * 1.05, 0.4);
  // Petals: two layers, foreshortened along x because the head tilts toward the target.
  const squash = 0.78;
  for (const [layer, color, len] of [[0, '#e8a010', 1.0], [1, '#f6c428', 0.86]] as const) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + layer * (TAU / 32);
      const px = hx + Math.cos(a) * R * 0.78 * squash;
      const py = c + Math.sin(a) * R * 0.78;
      at(ctx, px, py, Math.atan2(Math.sin(a), Math.cos(a) * squash), () => {
        ctx.beginPath();
        ctx.ellipse(R * 0.18 * len, 0, R * 0.36 * len, R * 0.12, 0, 0, TAU);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(R * 0.18 * len, 0, R * 0.33 * len, R * 0.095, 0, 0, TAU);
        const g = ctx.createLinearGradient(0, 0, R * 0.5, 0);
        g.addColorStop(0, tone(color, -0.2));
        g.addColorStop(1, tone(color, 0.15));
        ctx.fillStyle = g;
        ctx.fill();
      });
    }
  }
  // Seed head with a golden-angle spiral of seeds.
  blob(ctx, hx, c, R * 0.62 * squash, R * 0.62, '#4a2a12', { outline: 2, gloss: 0.2 });
  for (let i = 0; i < 90; i++) {
    const rr = Math.sqrt(i / 90) * R * 0.56;
    const a = i * 2.39996;
    ctx.fillStyle = i % 2 ? '#2a160a' : '#6a4420';
    ctx.beginPath();
    ctx.arc(hx + Math.cos(a) * rr * squash, c + Math.sin(a) * rr, 1.3 + (i / 90) * 0.9, 0, TAU);
    ctx.fill();
  }
  glint(ctx, hx - R * 0.2, c - R * 0.25, R * 0.25, R * 0.12, 0.25);
}

function leafShape(ctx: Ctx, x: number, y: number, len: number, ang: number, color: string) {
  at(ctx, x, y, ang, () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.3, -len * 0.35, len * 0.8, -len * 0.25, len, 0);
    ctx.bezierCurveTo(len * 0.8, len * 0.25, len * 0.3, len * 0.35, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = rgba('#2a5a14', 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len * 0.9, 0);
    ctx.stroke();
  });
}

// Straw beehive skep seen from above: coiled rope rings, a knob on top and the
// entrance facing `entrance` (radians; 0 = +x).
export function drawNest(ctx: Ctx, size: number, team: string, entrance: number) {
  const c = size / 2;
  const R = size * 0.44;
  softShadow(ctx, c + R * 0.12, c + R * 0.16, R * 1.15, R * 1.05, 0.55);
  const rr = rng(7);
  // Straw scattered at the base.
  for (let i = 0; i < 90; i++) {
    const a = rr() * TAU;
    const d = R * (0.95 + rr() * 0.16);
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    const sa = rr() * TAU;
    limb(ctx, [[x, y], [x + Math.cos(sa) * 7, y + Math.sin(sa) * 7]], 1.4, rr() < 0.5 ? '#d8b060' : '#b88a3a', 0.6);
  }
  blob(ctx, c, c, R, R, '#c8913a', { outline: 4, gloss: 0.1, dark: 0.3 });
  // Coils: each ring of rope drawn as many short slanted strands.
  const rings = 7;
  for (let k = 0; k < rings; k++) {
    const r0 = R * (1 - k / rings) * 0.98;
    const r1 = R * (1 - (k + 1) / rings) * 0.98;
    const mid = (r0 + r1) / 2;
    const thick = r0 - r1;
    // Ring body with a rounded, lit-from-upper-left look.
    for (let s = 0; s < 2; s++) {
      ctx.beginPath();
      ctx.arc(c, c, mid, 0, TAU);
      ctx.strokeStyle = s === 0 ? '#7a5218' : '#d8a548';
      ctx.lineWidth = s === 0 ? thick : thick * 0.72;
      ctx.stroke();
    }
    const strands = Math.max(10, Math.round((TAU * mid) / 4.5));
    for (let i = 0; i < strands; i++) {
      const a = (i / strands) * TAU + k * 0.3;
      const light = 0.5 + 0.5 * Math.cos(a - Math.PI * 1.25); // brighter toward the upper left
      const x0 = c + Math.cos(a) * (mid - thick * 0.35);
      const y0 = c + Math.sin(a) * (mid - thick * 0.35);
      const x1 = c + Math.cos(a + 0.12 * (12 / mid)) * (mid + thick * 0.35);
      const y1 = c + Math.sin(a + 0.12 * (12 / mid)) * (mid + thick * 0.35);
      ctx.strokeStyle = mix('#8a5a1c', '#f6d488', light * 0.85);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // Groove between rings.
    ctx.beginPath();
    ctx.arc(c, c, r1, 0, TAU);
    ctx.strokeStyle = rgba('#3a2208', 0.55);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  // Overall dome shading.
  const dome = ctx.createRadialGradient(c - R * 0.35, c - R * 0.35, R * 0.1, c, c, R * 1.05);
  dome.addColorStop(0, 'rgba(255,240,200,0.28)');
  dome.addColorStop(0.5, 'rgba(0,0,0,0)');
  dome.addColorStop(1, 'rgba(40,20,0,0.45)');
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.fillStyle = dome;
  ctx.fill();
  // Knob on top with a team-colored band.
  blob(ctx, c, c, R * 0.13, R * 0.13, '#e8b858', { outline: 2, gloss: 0.4 });
  ctx.beginPath();
  ctx.arc(c, c, R * 0.17, 0, TAU);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = team;
  ctx.lineWidth = 4;
  ctx.stroke();
  // Entrance arch on the rim, with a honey drip.
  const ex = c + Math.cos(entrance) * R * 0.88;
  const ey = c + Math.sin(entrance) * R * 0.88;
  blob(ctx, ex, ey, R * 0.2, R * 0.13, '#1a0e04', { rot: entrance + Math.PI / 2, outline: 2.5, gloss: 0, dark: 0.2 });
  blob(ctx, ex + Math.cos(entrance) * 4, ey + Math.sin(entrance) * 4, R * 0.08, R * 0.06, '#f0a818', { rot: entrance, outline: 1, gloss: 0.6 });
}

export function drawRubble(ctx: Ctx, size: number, kind: 'pot' | 'skep') {
  const c = size / 2;
  const R = size * 0.42;
  const rr = rng(kind === 'pot' ? 3 : 4);
  softShadow(ctx, c, c + 4, R * 1.1, R * 0.95, 0.4);
  // Spilled soil.
  blob(ctx, c, c, R * 0.8, R * 0.7, kind === 'pot' ? '#3e2a1a' : '#8a6a30', { outline: 0, gloss: 0.1, rot: 0.4 });
  for (let i = 0; i < 80; i++) {
    const a = rr() * TAU;
    const d = Math.sqrt(rr()) * R;
    ctx.fillStyle = rgba(kind === 'pot' ? (rr() < 0.5 ? '#24160c' : '#6a4a30') : (rr() < 0.5 ? '#d8b060' : '#7a5218'), 0.8);
    if (kind === 'skep') {
      const sa = rr() * TAU;
      limb(ctx, [[c + Math.cos(a) * d, c + Math.sin(a) * d], [c + Math.cos(a) * d + Math.cos(sa) * 9, c + Math.sin(a) * d + Math.sin(sa) * 9]], 1.8, rr() < 0.5 ? '#d8a548' : '#9a6a24', 0.6);
    } else {
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 1 + rr() * 2.5, 0, TAU);
      ctx.fill();
    }
  }
  if (kind === 'pot') {
    // Curved terracotta shards.
    for (let i = 0; i < 7; i++) {
      const a = rr() * TAU;
      const d = R * (0.4 + rr() * 0.6);
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      const s = 8 + rr() * 12;
      at(ctx, x, y, rr() * TAU, () => {
        poly(ctx, [[-s, -s * 0.3], [s * 0.2, -s * 0.6], [s, 0], [s * 0.3, s * 0.5], [-s * 0.6, s * 0.4]], '#c8643a', 1.5);
        ctx.strokeStyle = rgba('#f0a070', 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.8, -s * 0.25);
        ctx.lineTo(s * 0.2, -s * 0.5);
        ctx.stroke();
      });
    }
    // Wilted sunflower head.
    at(ctx, c + 6, c - 4, 0.6, () => {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        blob(ctx, Math.cos(a) * 11, Math.sin(a) * 9, 6, 2.5, '#9a7a2a', { rot: a, outline: 0.8, gloss: 0.1 });
      }
      blob(ctx, 0, 0, 8, 7, '#3a2210', { outline: 1.5, gloss: 0.1 });
    });
  } else {
    for (let k = 0; k < 4; k++) {
      const a = rr() * TAU;
      const d = R * rr() * 0.6;
      ctx.strokeStyle = '#b8862e';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, R * (0.2 + rr() * 0.3), rr() * TAU, rr() * TAU + 2);
      ctx.stroke();
    }
    // Spilled honey.
    blob(ctx, c - 6, c + 8, R * 0.3, R * 0.2, '#e89a10', { outline: 1.2, gloss: 0.6, rot: 0.3 });
  }
}

// Team pennant on a twig pole; `wave` 0..1 animates the cloth.
export function drawFlag(ctx: Ctx, w: number, h: number, wave: number) {
  const px = 6;
  limb(ctx, [[px, h - 2], [px, 4]], 3, '#7a5530', 1.5);
  blob(ctx, px, 4, 2.5, 2.5, '#d8b070', { outline: 1 });
  const fw = w - px - 4;
  const fh = h * 0.42;
  ctx.beginPath();
  const top = 6;
  ctx.moveTo(px + 1, top);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ctx.lineTo(px + 1 + fw * t, top + Math.sin(TAU * (wave + t * 0.8)) * 2.2 * t + fh * 0.5 * t * 0.2);
  }
  ctx.lineTo(px + 1 + fw * 0.85, top + fh * 0.5 + Math.sin(TAU * (wave + 0.7)) * 2);
  for (let i = 10; i >= 0; i--) {
    const t = i / 10;
    ctx.lineTo(px + 1 + fw * t, top + fh - fh * 0.1 * t + Math.sin(TAU * (wave + t * 0.8)) * 2.2 * t);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---------- small effects and projectiles ----------

export function drawSeed(ctx: Ctx, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, cy);
  ctx.quadraticCurveTo(cx, cy - h * 0.48, cx + w * 0.44, cy);
  ctx.quadraticCurveTo(cx, cy + h * 0.48, cx - w * 0.42, cy);
  ctx.fillStyle = '#2a2420';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = '#e8e0d0';
  ctx.lineWidth = 1.2;
  for (const dy of [-0.18, 0, 0.18]) {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.3, cy + dy * h * 0.6);
    ctx.quadraticCurveTo(cx, cy + dy * h, cx + w * 0.34, cy);
    ctx.stroke();
  }
}

export function drawGlob(ctx: Ctx, s: number, core: string, rim: string) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c - s * 0.12, c - s * 0.12, 0, c, c, s * 0.48);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, core);
  g.addColorStop(1, rim);
  ctx.beginPath();
  ctx.arc(c, c, s * 0.42, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(INK, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawSoftDot(ctx: Ctx, s: number, color: string, alpha = 1) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.5, rgba(color, alpha * 0.6));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

export function drawSpark(ctx: Ctx, s: number) {
  const c = s / 2;
  drawSoftDot(ctx, s, '#fff6c0', 0.6);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    at(ctx, c, c, (i * Math.PI) / 4, () => {
      ctx.beginPath();
      ctx.moveTo(-c * (i % 2 ? 0.55 : 0.95), 0);
      ctx.lineTo(0, -1.4);
      ctx.lineTo(c * (i % 2 ? 0.55 : 0.95), 0);
      ctx.lineTo(0, 1.4);
      ctx.closePath();
      ctx.fill();
    });
  }
}

export function drawRing(ctx: Ctx, s: number) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

export function drawBlast(ctx: Ctx, s: number) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,230,1)');
  g.addColorStop(0.25, 'rgba(255,220,110,0.95)');
  g.addColorStop(0.55, 'rgba(255,130,30,0.75)');
  g.addColorStop(0.85, 'rgba(200,60,10,0.35)');
  g.addColorStop(1, 'rgba(160,40,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  // Lumpy edge so it reads as a burst, not a disc.
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const r = c * (0.86 + (i % 2 ? 0.14 : 0) * (0.6 + 0.4 * Math.sin(i * 3.1)));
    if (i === 0) ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    else ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  ctx.fill();
}

export function drawShard(ctx: Ctx, s: number, color: string) {
  poly(ctx, [[s * 0.1, s * 0.3], [s * 0.6, s * 0.1], [s * 0.9, s * 0.5], [s * 0.4, s * 0.9]], color, 1);
}

export function drawBee(ctx: Ctx, s: number, wing: number) {
  const c = s / 2;
  at(ctx, c, c, 0, () => {
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-1, sgn * (3 + wing), 4, 2.5, sgn * 0.4, 0, TAU);
      ctx.fillStyle = 'rgba(235,245,255,0.7)';
      ctx.fill();
    }
    blob(ctx, -1.5, 0, 4.2, 3, '#f0b820', { outline: 1, gloss: 0.4 });
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(-3, -3, 1.4, 6);
    ctx.fillRect(-0.5, -3, 1.4, 6);
    blob(ctx, 3.5, 0, 2, 2, '#2a1a08', { outline: 0.8 });
  });
}

export { ellipsePath };

// Butterfly seen from above; `flap` 0..1 closes the wings toward the body.
export function drawButterfly(ctx: Ctx, s: number, flap: number, color: string) {
  const c = s / 2;
  const open = 1 - flap * 0.75;
  for (const side of [-1, 1]) {
    at(ctx, c, c, 0, () => {
      ctx.scale(1, side * open);
      for (const [x, y, rx, ry, col] of [[-4, 10, 8, 10, color], [5, 8, 6, 8, tone(color, -0.1)]] as const) {
        ellipsePath(ctx, x, y, rx, ry, x < 0 ? -0.4 : 0.4);
        ctx.fillStyle = INK;
        ctx.fill();
        ellipsePath(ctx, x, y, rx - 1.2, ry - 1.2, x < 0 ? -0.4 : 0.4);
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-6, 14, 2, 0, TAU);
      ctx.fill();
    });
  }
  blob(ctx, c, c, 6, 1.8, '#2a1a10', { outline: 0.8 });
  limb(ctx, [[c + 5, c], [c + 10, c - 4]], 0.8, '#2a1a10', 0);
  limb(ctx, [[c + 5, c], [c + 10, c + 4]], 0.8, '#2a1a10', 0);
}
