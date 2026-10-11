import { Ctx, INK, Pt, at, blob, ellipsePath, glint, limb, mix, poly, rgba, taper, tone } from './paint';

// Procedural bug sprites, drawn top-down facing right (+x) around the origin.
// Each bug has a walk cycle (legs in a tripod gait, wings flapping for flyers)
// and a strike animation, baked into frames at boot.

export interface Pose {
  walk: number; // 0..1 around the gait cycle (or wingbeat for flyers)
  strike: number; // 0 = at rest, 1 = full extension of the attack
}

export interface BugArt {
  frame: number; // square frame size in px
  body: number; // px length of the body, mapped to the bug's collision size in game
  draw(ctx: Ctx, pose: Pose): void;
}

export const WALK_FRAMES = 8;
export const STRIKE_FRAMES = 5;
// Attack extension for each strike frame: a wind-up (pulling back), then snap
// out, hold and recover. Frame 0 plays just before the blow lands.
export const STRIKE_CURVE = [-0.35, 0.55, 1, 0.7, 0.25];

const TAU = Math.PI * 2;

// ---------- shared parts ----------

interface LegOpts {
  xs: [number, number, number]; // attach x for front, middle and hind pair
  half: number; // body half-width at the attach points
  len: number;
  width: number;
  color: string;
  walk: number;
  swing?: number; // stride as a fraction of leg length
  spread?: [number, number, number]; // leg angles from straight ahead, radians
  claw?: string;
}

// Six legs in a tripod gait: front and hind on one side move with the middle on the other.
function sixLegs(ctx: Ctx, o: LegOpts) {
  const spread = o.spread ?? [0.85, 1.6, 2.35];
  const swing = o.swing ?? 0.32;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const phase = (i % 2 === 0) === (s === 1) ? 0 : 0.5;
      const sw = Math.sin(TAU * (o.walk + phase)) * swing * o.len;
      const lift = Math.cos(TAU * (o.walk + phase)) > 0 ? 0.92 : 1; // a lifted foot reads shorter from above
      const ax = o.xs[i];
      const ay = s * o.half;
      const ang = spread[i];
      const knee: Pt = [ax + Math.cos(ang) * o.len * 0.45 + sw * 0.35, ay + s * Math.sin(ang) * o.len * 0.72 * lift];
      const foot: Pt = [ax + Math.cos(ang) * o.len * 1.05 + sw, ay + s * Math.sin(ang) * o.len * 0.95 * lift];
      limb(ctx, [[ax, ay], knee, foot], o.width, o.color);
      if (o.claw) limb(ctx, [foot, [foot[0] + Math.cos(ang) * 3, foot[1] + s * 2.5]], o.width * 0.6, o.claw, 1.5);
    }
  }
}

function antennae(ctx: Ctx, x: number, y: number, len: number, color: string, walk: number, opts: { width?: number; elbow?: boolean; club?: string } = {}) {
  const wig = Math.sin(TAU * walk * 2) * 0.12;
  for (const s of [-1, 1]) {
    const a1 = s * (0.45 + wig * s);
    const p1: Pt = [x + Math.cos(a1) * len * 0.5, y + s * 2 + Math.sin(a1) * len * 0.5];
    const a2 = opts.elbow ? s * -0.25 : s * 0.25;
    const p2: Pt = [p1[0] + Math.cos(a2) * len * 0.55, p1[1] + Math.sin(a2) * len * 0.55 + (opts.elbow ? s * len * 0.25 : 0)];
    limb(ctx, [[x, y + s * 2], p1, p2], opts.width ?? 2, color, 1.5);
    if (opts.club) blob(ctx, p2[0], p2[1], 2.6, 2.2, opts.club, { outline: 1.5 });
  }
}

function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number, color = '#120c08') {
  for (const s of [-1, 1]) {
    blob(ctx, x, y + s * gap, r, r * 0.9, color, { outline: 1.2, gloss: 0.5 });
    glint(ctx, x - r * 0.25, y + s * gap - r * 0.35, r * 0.45, r * 0.3, 0.8);
  }
}

function mandibles(ctx: Ctx, x: number, y: number, len: number, open: number, color: string, width = 3) {
  for (const s of [-1, 1]) {
    const a = s * (0.35 + open * 0.55);
    const mid: Pt = [x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6];
    const tip: Pt = [x + len * 0.95, y + s * (len * 0.12 + open * len * 0.25)];
    taper(ctx, [[x, y + s * 2], mid, tip], width + 1.5, 1, color, 1.2);
  }
}

// One translucent, veined wing hinged at (x, y), sweeping out at `angle`.
function wing(ctx: Ctx, x: number, y: number, len: number, wid: number, angle: number, tint: string, alpha = 0.45, veins = 4) {
  at(ctx, x, y, angle, () => {
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, rgba(tint, alpha + 0.15));
    g.addColorStop(1, rgba(tint, alpha * 0.6));
    ellipsePath(ctx, len / 2, 0, len / 2, wid / 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba('#1a2630', 0.55);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = rgba('#1a2630', 0.35);
    for (let i = 1; i <= veins; i++) {
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.quadraticCurveTo(len * 0.5, ((i / (veins + 1)) - 0.5) * wid * 0.9, len * 0.97, ((i / (veins + 1)) - 0.5) * wid * 0.5);
      ctx.stroke();
    }
    glint(ctx, len * 0.35, -wid * 0.18, len * 0.25, wid * 0.12, 0.35);
  });
}

// Segmented abdomen bands drawn across an oval.
function bands(ctx: Ctx, x: number, y: number, rx: number, ry: number, n: number, color: string, from = 0, to = 1, width = 2.5) {
  ctx.save();
  ellipsePath(ctx, x, y, rx, ry);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 1; i <= n; i++) {
    const t = from + (to - from) * (i / (n + 1));
    const bx = x - rx + t * rx * 2;
    ctx.beginPath();
    ctx.moveTo(bx + 3, y - ry);
    ctx.quadraticCurveTo(bx - 4, y, bx + 3, y + ry);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- the bugs ----------

// Pillbug: a slate-blue armored oval of overlapping plates, many tiny legs
// rippling underneath, and whip antennae.
const pillbug: BugArt = {
  frame: 112, body: 74,
  draw(ctx, { walk, strike }) {
    const base = '#6d7686';
    // Fourteen little legs in a wave.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const x = -24 + i * 8;
        const sw = Math.sin(TAU * (walk * 2 + i * 0.14)) * 3;
        limb(ctx, [[x, s * 20], [x + 3 + sw, s * 28]], 2.4, '#4a505c', 1.5);
      }
    }
    const lunge = strike * 6;
    antennae(ctx, 30 + lunge, 0, 20, '#4a505c', walk, { width: 2.2 });
    blob(ctx, 30 + lunge, 0, 8, 12, '#565e6c', { gloss: 0.3 });
    // Body: the rear plates first so each one overlaps the next.
    blob(ctx, 0, 0, 34, 26, base, { gloss: 0.15, outline: 3 });
    for (let i = 6; i >= 0; i--) {
      const x = -26 + i * 8.5;
      const w = 26 * Math.sqrt(1 - Math.pow((x) / 36, 2));
      const plate = tone(base, i % 2 ? 0.08 : 0);
      ctx.save();
      ellipsePath(ctx, 0, 0, 34, 26);
      ctx.clip();
      const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
      g.addColorStop(0, tone(plate, -0.35));
      g.addColorStop(0.35, tone(plate, 0.25));
      g.addColorStop(1, plate);
      ctx.beginPath();
      ctx.ellipse(x, 0, 7, w + 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x - 7, w);
      ctx.ellipse(x - 7, 0, 7, w + 2, 0, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgba(INK, 0.55);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
    // Pale rim on the plate edges.
    ellipsePath(ctx, 0, 0, 33, 25);
    ctx.strokeStyle = rgba('#c8d0de', 0.45);
    ctx.lineWidth = 2;
    ctx.stroke();
    glint(ctx, -6, -12, 20, 6, 0.4);
    ellipsePath(ctx, 0, 0, 34.5, 26.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  },
};

// Rhinoceros beetle: glossy mahogany, a huge curved horn that tosses on attack.
const rhino: BugArt = {
  frame: 128, body: 80,
  draw(ctx, { walk, strike }) {
    sixLegs(ctx, { xs: [14, 4, -6], half: 16, len: 24, width: 4, color: '#2a160c', walk, claw: '#2a160c', spread: [0.8, 1.55, 2.3] });
    const shell = '#6b2d14';
    // Elytra: two halves with a seam.
    blob(ctx, -10, 0, 30, 25, shell, { gloss: 0.45 });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    glint(ctx, -16, -12, 16, 5, 0.6);
    glint(ctx, -16, 11, 12, 3, 0.25);
    // Pronotum and head; the head tosses the horn on a strike.
    blob(ctx, 22, 0, 15, 20, tone(shell, 0.08), { gloss: 0.5 });
    glint(ctx, 20, -9, 6, 4, 0.6);
    at(ctx, 34, 0, Math.sin(strike * Math.PI) * -0.35, () => {
      blob(ctx, 4, 0, 8, 10, '#3a1a0c', { gloss: 0.3 });
      // The big horn curves forward and up.
      taper(ctx, [[6, 0], [18, -1], [28, -4], [36, -10], [40, -17]], 10, 2, '#2e140a', 1.6);
      ctx.strokeStyle = rgba('#d08a60', 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(10, -2.5);
      ctx.quadraticCurveTo(26, -5, 36, -14);
      ctx.stroke();
    });
    // Second, shorter horn on the thorax.
    taper(ctx, [[26, -3], [34, -6], [38, -7]], 6, 1.5, '#2e140a', 1.2);
  },
};

// Goliath beetle: giant, cream wing cases with black stripes and a black and
// white striped pronotum. Slams with its front legs.
const goliath: BugArt = {
  frame: 144, body: 96,
  draw(ctx, { walk, strike }) {
    const reach = strike * 6;
    sixLegs(ctx, { xs: [20 + reach, 4, -12], half: 20, len: 30, width: 5.5, color: '#141414', walk, swing: 0.25, claw: '#3a3a3a', spread: [0.75 - strike * 0.25, 1.5, 2.3] });
    antennae(ctx, 44 + reach, 0, 12, '#141414', walk, { width: 2.5, club: '#2a2a2a' });
    const cream = '#e9dfc4';
    blob(ctx, -14, 0, 38, 30, cream, { gloss: 0.3, dark: 0.35 });
    // Black stripe markings on the wing cases.
    ctx.save();
    ellipsePath(ctx, -14, 0, 38, 30);
    ctx.clip();
    ctx.fillStyle = '#1a1714';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-20, s * 15, 26, 4.5, s * 0.08, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-36, s * 7, 12, 3, s * 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillRect(-56, -2, 60, 4);
    ctx.restore();
    glint(ctx, -20, -18, 18, 5, 0.45);
    // Pronotum: black with bold white stripes.
    at(ctx, reach * 0.5, 0, 0, () => {
      blob(ctx, 24, 0, 18, 24, '#161616', { gloss: 0.4 });
      ctx.save();
      ellipsePath(ctx, 24, 0, 18, 24);
      ctx.clip();
      ctx.fillStyle = '#f2efe6';
      for (const y of [-14, -5, 5, 14]) {
        ctx.beginPath();
        ctx.ellipse(22, y, 15, 2.6, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      blob(ctx, 43, 0, 8, 12, '#1a1a1a', { gloss: 0.3 });
      // Short forked horn.
      for (const s of [-1, 1]) taper(ctx, [[48, s * 3], [54, s * 6], [57, s * 4]], 4, 1.2, '#1a1a1a', 1);
    });
  },
};

// Fire ant: glossy red, big head with snapping mandibles, elbowed antennae,
// a pinched waist and a dark-tipped gaster that curls in to sting.
const fireant: BugArt = {
  frame: 72, body: 58,
  draw(ctx, { walk, strike }) {
    const red = '#c8321a';
    sixLegs(ctx, { xs: [6, 2, -2], half: 3.5, len: 15, width: 2, color: '#7a1a0a', walk, swing: 0.4, spread: [0.7, 1.5, 2.4] });
    // Gaster.
    blob(ctx, -16, 0, 10, 8, tone(red, -0.2), { gloss: 0.5, outline: 2 });
    ellipsePath(ctx, -22, 0, 4, 5);
    ctx.fillStyle = rgba('#2a0805', 0.6);
    ctx.fill();
    glint(ctx, -18, -3.5, 5, 2, 0.7);
    // Waist nodes.
    blob(ctx, -5, 0, 2.6, 2.6, red, { outline: 1.5 });
    blob(ctx, -1, 0, 2.6, 2.6, red, { outline: 1.5 });
    blob(ctx, 5, 0, 5.5, 4, red, { gloss: 0.4, outline: 2 });
    const lunge = strike * 3;
    mandibles(ctx, 18 + lunge, 0, 8, 1 - strike, '#3a0a04', 2);
    antennae(ctx, 17 + lunge, 0, 13, '#5a1206', walk, { width: 1.5, elbow: true });
    blob(ctx, 14 + lunge, 0, 6.5, 6, red, { gloss: 0.5, outline: 2 });
    glint(ctx, 13 + lunge, -2.5, 3, 1.5, 0.7);
    eyes(ctx, 16 + lunge, 0, 4, 1.4);
  },
};

// Praying mantis: lime green, long neck, triangle head with big eyes, and
// spiked forelegs that shoot out to grab.
const mantis: BugArt = {
  frame: 128, body: 92,
  draw(ctx, { walk, strike }) {
    const green = '#7cc43c';
    // Four long walking legs.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const phase = (i === 0) === (s === 1) ? 0 : 0.5;
        const sw = Math.sin(TAU * (walk + phase)) * 7;
        const ax = i === 0 ? 2 : -6;
        const ang = i === 0 ? 1.35 : 2.2;
        limb(ctx, [[ax, s * 4], [ax + Math.cos(ang) * 14 + sw * 0.4, s * 20], [ax + Math.cos(ang) * 30 + sw, s * 30]], 2.4, '#4e8a26', 2);
      }
    }
    // Abdomen under folded wings.
    blob(ctx, -26, 0, 24, 9, '#5aa02a', { gloss: 0.3 });
    bands(ctx, -26, 0, 24, 9, 6, rgba('#2e5a12', 0.5), 0, 1, 1.5);
    ctx.save();
    ctx.globalAlpha = 0.85;
    poly(ctx, [[2, -5], [-44, -7], [-50, 0], [-44, 7], [2, 5]], '#a6dc62', 1.2);
    ctx.restore();
    ctx.strokeStyle = rgba('#3e7a1c', 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-46, 0);
    ctx.stroke();
    // Long prothorax.
    taper(ctx, [[0, 0], [16, 0], [34, 0]], 8, 5, green, 1.5);
    // Triangle head with big bulging eyes at the corners.
    const hx = 40 + strike * 4;
    poly(ctx, [[hx - 5, -10], [hx - 5, 10], [hx + 9, 0]], '#8fd24e', 1.5);
    for (const s of [-1, 1]) {
      blob(ctx, hx - 4, s * 9.5, 4.6, 4.6, '#6aa832', { gloss: 0.6, outline: 1.5 });
      ellipsePath(ctx, hx - 3.4, s * 9.5, 1.3, 1.6);
      ctx.fillStyle = '#1a2a08'; // the "pupil" a mantis seems to look at you with
      ctx.fill();
    }
    antennae(ctx, hx + 4, 0, 16, '#4e8a26', walk, { width: 1.2 });
    // Raptorial forelegs: folded beside the neck at rest, flung forward on a strike.
    for (const s of [-1, 1]) {
      const e = strike;
      const coxa: Pt = [24, s * 3];
      const knee: Pt = [34 + e * 12, s * (12 - e * 4)];
      const tip: Pt = [knee[0] - 14 + e * 28, s * (8 - e * 5)];
      taper(ctx, [coxa, knee], 6, 5, green, 1.5);
      taper(ctx, [knee, tip], 4.5, 2, '#a6e060', 1.4);
      for (let k = 0.25; k < 1; k += 0.25) {
        const px = coxa[0] + (knee[0] - coxa[0]) * k;
        const py = coxa[1] + (knee[1] - coxa[1]) * k;
        limb(ctx, [[px, py], [px + 1, py - s * 3.2]], 1.1, '#2e5a12', 0);
      }
    }
  },
};

// Spitting spider: domed tan carapace with leopard spots, banded legs.
// Rears up and gathers a glob of spit to fire.
function spiderLegs(ctx: Ctx, cx: number, half: number, len: number, width: number, color: string, band: string, walk: number) {
  const angles = [0.5, 1.1, 1.85, 2.5];
  const bend = [0.55, 0.3, -0.3, -0.55]; // front legs reach forward, back legs trail
  for (const s of [-1, 1]) {
    angles.forEach((ang, i) => {
      const phase = (i % 2 === 0) === (s === 1) ? 0 : 0.5;
      const sw = Math.sin(TAU * (walk + phase)) * 0.16;
      const a = ang - sw;
      const base: Pt = [cx + Math.cos(a) * half * 0.6, s * Math.sin(a) * half];
      const knee: Pt = [base[0] + Math.cos(a) * len * 0.5, base[1] + s * (Math.sin(a) * len * 0.5 + len * 0.18)];
      const fa = a - bend[i];
      const foot: Pt = [knee[0] + Math.cos(fa) * len * 0.62, knee[1] + s * Math.sin(fa) * len * 0.62];
      const mid: Pt = [(knee[0] + foot[0]) / 2, (knee[1] + foot[1]) / 2];
      limb(ctx, [base, knee, mid, foot], width, color, 2);
      limb(ctx, [knee, [knee[0] + (mid[0] - knee[0]) * 0.25, knee[1] + (mid[1] - knee[1]) * 0.25]], width * 0.9, band, 0);
      limb(ctx, [mid, [mid[0] + (foot[0] - mid[0]) * 0.2, mid[1] + (foot[1] - mid[1]) * 0.2]], width * 0.8, band, 0);
    });
  }
}

const spitter: BugArt = {
  frame: 112, body: 62,
  draw(ctx, { walk, strike }) {
    spiderLegs(ctx, 8, 10, 30, 2.4, '#5a3e22', '#a88458', walk);
    blob(ctx, -16, 0, 12, 10, '#a08050', { gloss: 0.3 });
    // Big domed carapace, larger than the abdomen (the giveaway for this spider).
    const rear = 1 + strike * 0.12;
    at(ctx, 8, 0, 0, () => {
      blob(ctx, 0, 0, 17, 15, '#d8b878', { gloss: 0.45 });
      ctx.fillStyle = '#3a2410';
      for (const [x, y, r] of [[-8, -6, 2.6], [-8, 6, 2.6], [-2, -10, 2], [-2, 10, 2], [3, -4, 2.2], [3, 4, 2.2], [-12, 0, 2.2], [8, -8, 1.6], [8, 8, 1.6], [-3, 0, 1.6]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      glint(ctx, -4, -6, 8, 4, 0.5);
    }, rear);
    const fx = 26 + strike * 2;
    for (const s of [-1, 1]) taper(ctx, [[fx - 4, s * 3], [fx + 2, s * 2.5]], 3.5, 1.5, '#3a2410', 1);
    eyes(ctx, fx - 6, 0, 2.5, 1.4);
    if (strike > 0.3) {
      blob(ctx, fx + 5, 0, 3 + strike * 2, 3 + strike * 2, '#d8f0a8', { outline: 1.2, gloss: 0.6 });
    }
  },
};

// Assassin bug: slender orange and black with a long curved beak that stabs.
const assassin: BugArt = {
  frame: 128, body: 78,
  draw(ctx, { walk, strike }) {
    sixLegs(ctx, { xs: [12, 2, -8], half: 5, len: 30, width: 2, color: '#1e1410', walk, swing: 0.25, spread: [0.7, 1.45, 2.4] });
    // Abdomen flares out past the wings: the orange "connexivum" edge.
    blob(ctx, -14, 0, 24, 13, '#e0761c', { gloss: 0.3 });
    ctx.save();
    ellipsePath(ctx, -14, 0, 24, 13);
    ctx.clip();
    ctx.fillStyle = '#1a1210';
    for (let x = -36; x < 10; x += 7) ctx.fillRect(x, -14, 3, 28);
    ctx.restore();
    // Dark folded wings.
    ctx.save();
    ctx.globalAlpha = 0.92;
    poly(ctx, [[8, -7], [-30, -9], [-38, 0], [-30, 9], [8, 7]], '#2a1e1a', 1.2);
    ctx.restore();
    glint(ctx, -12, -4, 14, 3, 0.35);
    blob(ctx, 14, 0, 9, 10, '#e0761c', { gloss: 0.4 });
    const lunge = strike * 8;
    at(ctx, lunge, 0, 0, () => {
      taper(ctx, [[20, 0], [26, 0]], 5, 4, '#1a1210', 1.2); // neck
      blob(ctx, 31, 0, 7, 4.5, '#1a1210', { gloss: 0.3, outline: 2 });
      eyes(ctx, 31, 0, 4, 1.8, '#c8401a');
      // The beak.
      taper(ctx, [[36, 0], [44, 1], [52, 0], [58, -1.5]], 3, 1, '#2a1a14', 1);
      antennae(ctx, 34, 0, 22, '#1a1210', walk, { width: 1.2 });
    });
  },
};

// Hornet: chestnut thorax, amber head, yellow and brown banded abdomen, blurred wings.
const hornet: BugArt = {
  frame: 112, body: 66,
  draw(ctx, { walk: flap, strike }) {
    // Legs tucked under in flight.
    for (const s of [-1, 1]) {
      for (const [ax, ang] of [[6, 1.1], [2, 1.7], [-2, 2.3]] as const) {
        limb(ctx, [[ax, s * 4], [ax + Math.cos(ang) * 8, s * 11], [ax + Math.cos(ang) * 14, s * 13]], 2, '#4a2a10', 1.5);
      }
    }
    const curl = strike * 5;
    blob(ctx, -16 + curl * 0.3, 0, 17, 12, '#e8a816', { gloss: 0.45 });
    bands(ctx, -16 + curl * 0.3, 0, 17, 12, 3, '#5a2a0c', 0.05, 0.85, 4.5);
    taper(ctx, [[-32 + curl, 0], [-38 + curl * 2, 0]], 3, 0.5, '#2a1406', 1);
    blob(ctx, 4, 0, 10, 9, '#7a3412', { gloss: 0.4 });
    blob(ctx, 17, 0, 7.5, 9, '#e8a816', { gloss: 0.4 });
    eyes(ctx, 18, 0, 6, 2.6, '#3a1a08');
    mandibles(ctx, 23, 0, 5, 0.3 + strike * 0.6, '#3a1a08', 1.6);
    antennae(ctx, 22, 0, 12, '#3a1a08', 0.2, { width: 1.5, elbow: true });
    // Wings: two pairs that beat; the fast blur reads as a pale smear.
    const beat = Math.sin(TAU * flap);
    for (const s of [-1, 1]) {
      wing(ctx, 6, s * 4, 30, 10, s * (1.85 - beat * 0.6), '#e8eef8', 0.42 + 0.1 * Math.abs(beat), 3);
      wing(ctx, 2, s * 4, 22, 8, s * (2.15 - beat * 0.5), '#e8eef8', 0.36, 2);
    }
  },
};

// Dragonfly: long metallic blue abdomen, huge green eyes, four veined wings.
const dragonfly: BugArt = {
  frame: 128, body: 92,
  draw(ctx, { walk: flap, strike }) {
    const beat = Math.sin(TAU * flap);
    const beat2 = Math.sin(TAU * flap + 1.2);
    for (const s of [-1, 1]) {
      wing(ctx, 4, s * 4, 46, 12, s * (1.75 - beat2 * 0.45), '#d8f0ff', 0.36, 6);
      wing(ctx, 12, s * 4, 48, 12, s * (1.35 - beat * 0.45), '#d8f0ff', 0.4, 6);
    }
    // Segmented abdomen.
    for (let i = 0; i < 8; i++) {
      const x = -6 - i * 6.5;
      const w = 4.4 - i * 0.2;
      blob(ctx, x, 0, 4.2, w, i % 2 ? '#1f8fc8' : '#2aa8e0', { gloss: 0.5, outline: 1.6 });
    }
    ctx.fillStyle = '#0d3a5a';
    for (let i = 0; i < 8; i++) ctx.fillRect(-9 - i * 6.5, -1, 2, 2);
    taper(ctx, [[-56, -2], [-62, -4]], 2, 1, '#0d3a5a', 1);
    taper(ctx, [[-56, 2], [-62, 4]], 2, 1, '#0d3a5a', 1);
    const lunge = strike * 5;
    blob(ctx, 6 + lunge * 0.3, 0, 10, 8, '#2a8a6a', { gloss: 0.5 });
    glint(ctx, 4, -3, 5, 2, 0.6);
    // Big wraparound eyes.
    for (const s of [-1, 1]) blob(ctx, 20 + lunge, s * 5, 7, 7, '#3ac860', { gloss: 0.55, outline: 2 });
    glint(ctx, 18 + lunge, -7, 3, 2, 0.8);
    glint(ctx, 18 + lunge, 3, 3, 2, 0.8);
    if (strike > 0.3) for (const s of [-1, 1]) limb(ctx, [[18, s * 3], [28 + lunge, s * 6], [32 + lunge, s * 3]], 1.5, '#1a1a1a', 1);
  },
};

// Termite: soft pale body and a hard amber head with big pincer jaws.
const termite: BugArt = {
  frame: 72, body: 56,
  draw(ctx, { walk, strike }) {
    sixLegs(ctx, { xs: [4, 0, -4], half: 4, len: 11, width: 1.8, color: '#b8a070', walk, swing: 0.4, spread: [0.8, 1.55, 2.3] });
    blob(ctx, -12, 0, 12, 8, '#f0e4c4', { gloss: 0.25, outline: 2, dark: 0.25 });
    bands(ctx, -12, 0, 12, 8, 5, rgba('#b89a68', 0.7), 0, 1, 1.2);
    ellipsePath(ctx, -14, 0, 6, 3.5);
    ctx.fillStyle = rgba('#8a6a3a', 0.35); // gut showing through
    ctx.fill();
    blob(ctx, 2, 0, 5.5, 5, '#ecdcb8', { gloss: 0.25, outline: 2 });
    blob(ctx, 13, 0, 7, 6.2, '#c87a2a', { gloss: 0.5, outline: 2 });
    glint(ctx, 12, -2.5, 3, 1.5, 0.6);
    mandibles(ctx, 18, 0, 9, 1 - strike, '#3a1a06', 2.2);
    antennae(ctx, 18, 0, 8, '#a07040', walk, { width: 1.2 });
  },
};

// Dung beetle: black with a green-blue sheen, shoving a big dung ball ahead.
// The ball rolls as it walks and slams forward on an attack.
const dung: BugArt = {
  frame: 144, body: 92,
  draw(ctx, { walk, strike }) {
    sixLegs(ctx, { xs: [6, -4, -14], half: 14, len: 22, width: 4, color: '#121212', walk, claw: '#2a2a2a', spread: [0.65, 1.55, 2.4] });
    blob(ctx, -14, 0, 24, 20, '#1c1e24', { gloss: 0.35 });
    // Iridescent sheen.
    const sheen = ctx.createLinearGradient(-36, -20, 6, 20);
    sheen.addColorStop(0, rgba('#3ad0a0', 0.0));
    sheen.addColorStop(0.45, rgba('#3ad0a0', 0.35));
    sheen.addColorStop(0.6, rgba('#4a7ae0', 0.3));
    sheen.addColorStop(1, rgba('#4a7ae0', 0.0));
    ellipsePath(ctx, -14, 0, 23, 19);
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.strokeStyle = rgba('#000000', 0.35);
      ctx.lineWidth = 1;
      for (const y of [6, 11, 15]) {
        ctx.beginPath();
        ctx.moveTo(-34, s * y);
        ctx.lineTo(0, s * y * 0.8);
        ctx.stroke();
      }
    }
    blob(ctx, 10, 0, 11, 15, '#22252c', { gloss: 0.4 });
    glint(ctx, -18, -10, 10, 3, 0.4);
    // Spiky shovel head.
    blob(ctx, 21, 0, 7, 11, '#1a1a1a', { gloss: 0.3 });
    for (let i = -2; i <= 2; i++) taper(ctx, [[25, i * 4], [29, i * 4.6]], 2.5, 0.8, '#1a1a1a', 0.8);
    // Front legs braced on the ball.
    for (const s of [-1, 1]) limb(ctx, [[18, s * 8], [28, s * 16], [38 + strike * 6, s * 14]], 3.5, '#121212', 2);
    // The ball: lumpy, with straw bits that roll with each step.
    const bx = 50 + strike * 12;
    const R = 20;
    blob(ctx, bx, 0, R, R, '#7a5530', { gloss: 0.25, dark: 0.5 });
    ctx.save();
    ellipsePath(ctx, bx, 0, R, R);
    ctx.clip();
    const roll = walk * TAU;
    for (let i = 0; i < 14; i++) {
      // Points on a sphere spun around the lateral axis.
      const lat = ((i * 37) % 100) / 100 * Math.PI - Math.PI / 2;
      const lon = (i * 2.399) + roll;
      const z = Math.cos(lat) * Math.cos(lon);
      if (z < 0) continue;
      const px = bx + Math.cos(lat) * Math.sin(lon) * R * 0.95;
      const py = Math.sin(lat) * R * 0.95;
      if (i % 3 === 0) {
        ctx.strokeStyle = rgba('#d8b860', 0.85 * z);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px - 3, py - 1.5);
        ctx.lineTo(px + 3, py + 1.5);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(i % 2 ? '#5a3a1c' : '#9a7444', 0.9 * z);
        ctx.beginPath();
        ctx.arc(px, py, 2.4 + (i % 4) * 0.5, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    glint(ctx, bx - 7, -8, 7, 4, 0.25);
  },
};

// Bombardier beetle: orange head and thorax, midnight-blue wing cases with
// orange spots. The rear glows white-hot when it fires.
const bombardier: BugArt = {
  frame: 112, body: 66,
  draw(ctx, { walk, strike }) {
    sixLegs(ctx, { xs: [10, 0, -8], half: 9, len: 20, width: 2.6, color: '#3a2010', walk, spread: [0.75, 1.55, 2.35] });
    if (strike > 0) {
      // Boiling spray venting from the tip of the abdomen.
      const r = 6 + strike * 10;
      const g = ctx.createRadialGradient(-30, 0, 0, -30, 0, r);
      g.addColorStop(0, rgba('#ffffff', 0.95));
      g.addColorStop(0.35, rgba('#ffe070', 0.9));
      g.addColorStop(0.7, rgba('#ff7a1a', 0.6));
      g.addColorStop(1, rgba('#ff7a1a', 0));
      ellipsePath(ctx, -30 - strike * 4, 0, r, r * 0.8);
      ctx.fillStyle = g;
      ctx.fill();
    }
    blob(ctx, -8, 0, 20, 15, '#1e2e5c', { gloss: 0.4 });
    for (const [x, y] of [[-18, -7], [-18, 7], [-6, -9], [-6, 9], [-26, 0]]) blob(ctx, x, y, 3.2, 2.6, '#f0a030', { outline: 1, gloss: 0.4 });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(10, 0);
    ctx.stroke();
    glint(ctx, -10, -8, 10, 3, 0.5);
    blob(ctx, 15, 0, 7, 9, '#e07a20', { gloss: 0.45 });
    blob(ctx, 24, 0, 6, 6.5, '#e8892a', { gloss: 0.45 });
    eyes(ctx, 26, 0, 4.5, 1.6);
    mandibles(ctx, 29, 0, 5, 0.4, '#3a1a08', 1.5);
    antennae(ctx, 28, 0, 15, '#2a1a10', walk, { width: 1.5 });
  },
};

// Bolas spider: plump cream abdomen with brown saddle and two humps; swings a
// sticky glob on a silk line and hurls it.
const bolas: BugArt = {
  frame: 128, body: 64,
  draw(ctx, { walk, strike }) {
    spiderLegs(ctx, 14, 8, 24, 2.6, '#6a4a30', '#c8a478', walk);
    blob(ctx, -10, 0, 22, 21, '#efe0b8', { gloss: 0.35, dark: 0.3 });
    ctx.save();
    ellipsePath(ctx, -10, 0, 22, 21);
    ctx.clip();
    blob(ctx, -12, 0, 13, 9, '#8a5a3a', { outline: 0, gloss: 0.15 });
    blob(ctx, -12, 0, 6, 4, '#c89a6a', { outline: 0, gloss: 0.2 });
    ctx.restore();
    for (const s of [-1, 1]) blob(ctx, 2, s * 9, 4.5, 4.5, '#d8c090', { gloss: 0.5, outline: 1.5 });
    glint(ctx, -16, -10, 10, 4, 0.45);
    blob(ctx, 16, 0, 9, 8.5, '#9a7454', { gloss: 0.4 });
    eyes(ctx, 22, 0, 2.5, 1.3);
    // Silk line and the swinging bola from a raised front leg.
    const hand: Pt = [28, -10];
    limb(ctx, [[18, -4], [24, -10], hand], 2.4, '#8a6a48', 1.5);
    const swingA = TAU * walk * 2;
    const len = 12 + strike * 20;
    const bx = hand[0] + Math.cos(swingA) * len * (strike > 0 ? 0.3 : 1) + strike * 18;
    const by = hand[1] + Math.sin(swingA) * len * 0.5 * (1 - strike) - strike * 6;
    ctx.strokeStyle = rgba('#ffffff', 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hand[0], hand[1]);
    ctx.lineTo(bx, by);
    ctx.stroke();
    blob(ctx, bx, by, 4, 4, '#fff2a0', { gloss: 0.7, outline: 1.2 });
  },
};

export const BUG_ART: Record<string, BugArt> = {
  pillbug, rhino, goliath, fireant, mantis, spitter, assassin, hornet, dragonfly, termite, dung, bombardier, bolas,
};

// Fallback for the stand-in test units.
BUG_ART.beetle = rhino;
BUG_ART.wasp = hornet;

export function drawBugFrame(ctx: Ctx, art: BugArt, frameIndex: number) {
  const pose: Pose = frameIndex < WALK_FRAMES
    ? { walk: frameIndex / WALK_FRAMES, strike: 0 }
    : { walk: 0, strike: STRIKE_CURVE[frameIndex - WALK_FRAMES] };
  ctx.save();
  ctx.translate(art.frame / 2, art.frame / 2);
  art.draw(ctx, pose);
  ctx.restore();
}

export { mix };
