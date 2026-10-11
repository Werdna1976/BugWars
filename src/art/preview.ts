// Dev-only page (art.html): every bug's frames at full size and at game size.
import { BUG_ART, STRIKE_FRAMES, WALK_FRAMES, drawBugFrame } from './bugs';

const out = document.getElementById('out')!;
const frames = WALK_FRAMES + STRIKE_FRAMES;
const only = new URLSearchParams(location.search).get('only');
for (const [id, art] of Object.entries(BUG_ART)) {
  if (id === 'beetle' || id === 'wasp' || (only && !only.split(',').includes(id))) continue;
  const label = document.createElement('div');
  label.textContent = id;
  out.appendChild(label);
  const c = document.createElement('canvas');
  const cell = Number(new URLSearchParams(location.search).get('cell') ?? 96);
  const scale = cell / art.frame;
  c.width = frames * cell + 200;
  c.height = cell;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6b4e32';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < frames; i++) {
    ctx.save();
    ctx.translate(i * cell, 0);
    ctx.scale(scale, scale);
    drawBugFrame(ctx, art, i);
    ctx.restore();
  }
  // Game-size thumbnail (about 40px).
  const small = document.createElement('canvas');
  small.width = art.frame;
  small.height = art.frame;
  drawBugFrame(small.getContext('2d')!, art, 0);
  ctx.drawImage(small, frames * cell + 20, 28, 40, 40);
  ctx.drawImage(small, frames * cell + 80, 18, 60, 60);
  out.appendChild(c);
}

// ?scene=1: the field, puddles and towers.
import { Arena } from '../sim/arena';
import { COLS, ROWS } from '../sim/constants';
import { drawGround, drawWater, drawOutpost, drawNest, drawSunflower, drawRubble, drawFlag, drawSeed, drawGlob, drawSpark, drawBlast, drawBee } from './scenery';
if (new URLSearchParams(location.search).get('scene')) {
  out.innerHTML = '';
  const arena = new Arena();
  const T = 32;
  const field = {
    cols: COLS, rows: ROWS, tile: T, isWet: (c: number, r: number) => arena.isWet(c, r), lanes: [3.5, COLS - 3.5],
    towers: [{ x: 9, y: 3, size: 4 }, { x: 3.5, y: 4.5, size: 3 }, { x: 14.5, y: 4.5, size: 3 }, { x: 9, y: ROWS - 3, size: 4 }, { x: 3.5, y: ROWS - 4.5, size: 3 }, { x: 14.5, y: ROWS - 4.5, size: 3 }],
  };
  const c = document.createElement('canvas');
  c.width = COLS * T;
  c.height = ROWS * T;
  const ctx = c.getContext('2d')!;
  const t0 = performance.now();
  drawGround(ctx, field);
  drawWater(ctx, field);
  const pot = (x: number, y: number, team: string) => {
    const k = document.createElement('canvas'); k.width = k.height = 192;
    drawOutpost(k.getContext('2d')!, 192, team);
    ctx.drawImage(k, x * T - 48, y * T - 48, 96, 96);
    const s = document.createElement('canvas'); s.width = s.height = 128;
    drawSunflower(s.getContext('2d')!, 128);
    ctx.save(); ctx.translate(x * T, y * T); ctx.rotate(team === '#e5484d' ? Math.PI / 2 : -Math.PI / 2); ctx.drawImage(s, -32, -32, 64, 64); ctx.restore();
  };
  const nest = (x: number, y: number, team: string, ent: number) => {
    const k = document.createElement('canvas'); k.width = k.height = 256;
    drawNest(k.getContext('2d')!, 256, team, ent);
    ctx.drawImage(k, x * T - 64, y * T - 64, 128, 128);
  };
  pot(3.5, 4.5, '#e5484d'); pot(14.5, 4.5, '#e5484d'); nest(9, 3, '#e5484d', Math.PI / 2);
  pot(3.5, ROWS - 4.5, '#3d8bfd'); nest(9, ROWS - 3, '#3d8bfd', -Math.PI / 2);
  const rub = document.createElement('canvas'); rub.width = rub.height = 192; drawRubble(rub.getContext('2d')!, 192, 'pot');
  ctx.drawImage(rub, 14.5 * T - 48, (ROWS - 4.5) * T - 48, 96, 96);
  out.appendChild(c);
  const info = document.createElement('div'); info.textContent = `ground ${Math.round(performance.now() - t0)}ms`; out.appendChild(info);
  // Small parts.
  const strip = document.createElement('canvas'); strip.width = 600; strip.height = 80;
  const sc = strip.getContext('2d')!; sc.fillStyle = '#6b4e32'; sc.fillRect(0, 0, 600, 80);
  const part = (fn: (k: CanvasRenderingContext2D) => void, w: number, h: number, x: number) => { const k = document.createElement('canvas'); k.width = w; k.height = h; fn(k.getContext('2d')!); sc.drawImage(k, x, 10, w * 2, h * 2); };
  part((k) => drawSeed(k, 14, 9), 14, 9, 10);
  part((k) => drawGlob(k, 14, '#ffd060', '#c87a10'), 14, 14, 50);
  part((k) => drawGlob(k, 12, '#e8ffc0', '#6aa02a'), 12, 12, 90);
  part((k) => drawSpark(k, 20), 20, 20, 130);
  part((k) => drawBlast(k, 30), 30, 30, 190);
  part((k) => drawBee(k, 14, 1), 14, 14, 270);
  part((k) => drawFlag(k, 30, 36, 0.2), 30, 36, 320);
  out.appendChild(strip);
}
