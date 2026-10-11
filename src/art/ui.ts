import { Ctx, INK, blob, glint, rgba, rng, tone, valueNoise } from './paint';

// Interface art: card frames, the Nectar drop, panel backgrounds.

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A hand card: leafy green border, a soil window for the bug, and a name plate.
export function drawCardFrame(ctx: Ctx, w: number, h: number, glow: boolean) {
  const s = w / 106;
  roundRect(ctx, 2 * s, 2 * s, w - 4 * s, h - 4 * s, 10 * s);
  ctx.fillStyle = INK;
  ctx.fill();
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, glow ? '#a8d860' : '#6a9a3a');
  body.addColorStop(1, glow ? '#5a8a20' : '#3a5a22');
  roundRect(ctx, 4 * s, 4 * s, w - 8 * s, h - 8 * s, 8 * s);
  ctx.fillStyle = body;
  ctx.fill();
  // Leaf vein pattern on the border.
  ctx.strokeStyle = rgba('#ffffff', 0.12);
  ctx.lineWidth = 1.2 * s;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(4 * s, (12 + i * 16) * s);
    ctx.lineTo(14 * s, (6 + i * 16) * s);
    ctx.moveTo(w - 4 * s, (12 + i * 16) * s);
    ctx.lineTo(w - 14 * s, (6 + i * 16) * s);
    ctx.stroke();
  }
  // Art window.
  const wx = 10 * s;
  const wy = 10 * s;
  const ww = w - 20 * s;
  const wh = h - 54 * s;
  roundRect(ctx, wx, wy, ww, wh, 6 * s);
  const soil = ctx.createRadialGradient(w / 2, wy + wh * 0.45, 4 * s, w / 2, wy + wh * 0.5, ww * 0.75);
  soil.addColorStop(0, '#8a6a46');
  soil.addColorStop(1, '#4a3420');
  ctx.fillStyle = soil;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  const r = rng(12);
  ctx.save();
  roundRect(ctx, wx, wy, ww, wh, 6 * s);
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rgba(r() < 0.5 ? '#2a1c10' : '#b89060', 0.35);
    ctx.beginPath();
    ctx.arc(wx + r() * ww, wy + r() * wh, (0.6 + r() * 1.4) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Name plate.
  roundRect(ctx, 8 * s, h - 42 * s, w - 16 * s, 34 * s, 5 * s);
  ctx.fillStyle = rgba('#14200c', 0.75);
  ctx.fill();
  if (glow) {
    roundRect(ctx, 2 * s, 2 * s, w - 4 * s, h - 4 * s, 10 * s);
    ctx.strokeStyle = '#f6d23a';
    ctx.lineWidth = 4 * s;
    ctx.stroke();
  }
  // Top gloss.
  glint(ctx, w * 0.35, 10 * s, w * 0.3, 5 * s, 0.25);
}

// Nectar cost badge: an amber drop.
export function drawNectarDrop(ctx: Ctx, size: number) {
  const c = size / 2;
  const R = size * 0.36;
  ctx.beginPath();
  ctx.moveTo(c, c - R * 1.35);
  ctx.bezierCurveTo(c + R * 0.4, c - R * 0.7, c + R, c - R * 0.25, c + R, c + R * 0.2);
  ctx.arc(c, c + R * 0.2, R, 0, Math.PI);
  ctx.bezierCurveTo(c - R, c - R * 0.25, c - R * 0.4, c - R * 0.7, c, c - R * 1.35);
  ctx.closePath();
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = INK;
  ctx.stroke();
  const g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.2, R * 0.1, c, c + R * 0.2, R * 1.3);
  g.addColorStop(0, '#fff0a0');
  g.addColorStop(0.35, '#f6b828');
  g.addColorStop(1, '#a85a08');
  ctx.fillStyle = g;
  ctx.fill();
  glint(ctx, c - R * 0.4, c - R * 0.1, R * 0.25, R * 0.4, 0.7, 0.3);
}

// Panel background: dark, slightly textured, tinted per side.
export function drawPanelBg(ctx: Ctx, w: number, h: number, base: string, seed: number) {
  const n = valueNoise(seed);
  const img = ctx.createImageData(w, h);
  const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 0.85 + n(x / 70, y / 70, 4) * 0.3;
      const i = (y * w + x) * 4;
      img.data[i] = r0 * v;
      img.data[i + 1] = g0 * v;
      img.data[i + 2] = b0 * v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Faint leaf silhouettes.
  const r = rng(seed + 1);
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 30 + r() * 50;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r() * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -len * 0.35, len / 2, 0);
    ctx.quadraticCurveTo(0, len * 0.35, -len / 2, 0);
    ctx.fillStyle = rgba(tone(base, 0.25), 0.18);
    ctx.fill();
    ctx.restore();
  }
}

// A wooden plank strip for the hand area.
export function drawPlanks(ctx: Ctx, w: number, h: number) {
  const n = valueNoise(51);
  const img = ctx.createImageData(w, h);
  const plank = 46;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const row = Math.floor(y / plank);
      const grain = n(x / 120 + row * 7, (y % plank) / 6 + row * 3, 3);
      const v = 0.75 + grain * 0.45 - ((y % plank) < 2 ? 0.45 : 0);
      const i = (y * w + x) * 4;
      img.data[i] = 92 * v;
      img.data[i + 1] = 62 * v;
      img.data[i + 2] = 36 * v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const sh = ctx.createLinearGradient(0, 0, 0, 14);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, 14);
}

export { blob };

// A crown for the result screen: gold when earned, a dull outline when not.
export function drawCrown(ctx: Ctx, s: number, earned: boolean) {
  const k = s / 40;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(6, 30);
  ctx.lineTo(4, 12);
  ctx.lineTo(13, 20);
  ctx.lineTo(20, 7);
  ctx.lineTo(27, 20);
  ctx.lineTo(36, 12);
  ctx.lineTo(34, 30);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (earned) {
    const g = ctx.createLinearGradient(0, 8, 0, 30);
    g.addColorStop(0, '#fff2a0');
    g.addColorStop(0.5, '#f2c12e');
    g.addColorStop(1, '#b07a10');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = 'rgba(80,70,60,0.6)';
  }
  ctx.fill();
  ctx.fillStyle = earned ? '#b07a10' : 'rgba(40,30,20,0.6)';
  ctx.fillRect(6, 30, 28, 5);
  if (earned) for (const [x, y] of [[4, 12], [20, 7], [36, 12]]) blob(ctx, x, y, 2.6, 2.6, '#e5484d', { outline: 1, gloss: 0.6 });
  ctx.restore();
}

// Result banner: a plank board with a leafy edge.
export function drawBanner(ctx: Ctx, w: number, h: number) {
  roundRect(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.fillStyle = INK;
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7a5434');
  g.addColorStop(1, '#4a3020');
  roundRect(ctx, 7, 7, w - 14, h - 14, 15);
  ctx.fillStyle = g;
  ctx.fill();
  const n = valueNoise(8);
  ctx.save();
  roundRect(ctx, 7, 7, w - 14, h - 14, 15);
  ctx.clip();
  for (let y = 7; y < h; y += 3) {
    ctx.strokeStyle = rgba('#2a1808', 0.12 + n(0, y / 20) * 0.15);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y) * 0.5);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = rgba('#ffd890', 0.35);
  ctx.lineWidth = 2;
  roundRect(ctx, 12, 12, w - 24, h - 24, 11);
  ctx.stroke();
  const r = rng(3);
  for (let i = 0; i < 18; i++) {
    const top = i < 9;
    const x = 20 + ((i % 9) / 8) * (w - 40) + (r() - 0.5) * 10;
    const y = top ? 6 : h - 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((r() - 0.5) * 1.2 + (top ? 0 : Math.PI));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7, -6, 0, -16);
    ctx.quadraticCurveTo(-7, -6, 0, 0);
    ctx.fillStyle = r() < 0.5 ? '#5a9a34' : '#7ab84a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}
