import Phaser from 'phaser';
import { BUG_ART, STRIKE_FRAMES, WALK_FRAMES, drawBugFrame } from '../art/bugs';
import {
  FieldInfo, drawBee, drawBlast, drawFlag, drawGlob, drawGround, drawNest, drawOutpost, drawRing, drawRubble,
  drawSeed, drawShard, drawSoftDot, drawSpark, drawSunflower, drawWater, leaf,
} from '../art/scenery';
import { drawCardFrame, drawNectarDrop, drawPanelBg, drawPlanks } from '../art/ui';

// Bakes all the procedural art (src/art) into Phaser textures once at boot.
// Bugs get a sprite sheet `<id>_anim` (walk frames, then strike frames) and a
// still `<id>` for icons. Towers and effects are drawn at 2x and shown at half
// scale so they stay crisp.

export const TILE = 32;
export const HI = 2; // texture resolution multiplier for towers and effects
export const BUG_FRAMES = WALK_FRAMES + STRIKE_FRAMES;
export const SIDE_TINT = { player: '#3d8bfd', enemy: '#e5484d' } as const;

type Draw = (ctx: CanvasRenderingContext2D) => void;

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.getContext());
  tex.refresh();
  return tex;
}

// A horizontal strip of frames named '0', '1', ...
function stripTexture(scene: Phaser.Scene, key: string, w: number, h: number, frames: number, draw: (ctx: CanvasRenderingContext2D, i: number) => void) {
  const tex = scene.textures.createCanvas(key, w * frames, h)!;
  const ctx = tex.getContext();
  for (let i = 0; i < frames; i++) {
    ctx.save();
    ctx.translate(i * w, 0);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(ctx, i);
    ctx.restore();
    tex.add(String(i), 0, i * w, 0, w, h);
  }
  tex.refresh();
  return tex;
}

// Display scale for a bug sprite so its body roughly matches its collision size.
export function bugScale(id: string, radius: number): number {
  const art = BUG_ART[id] ?? BUG_ART.beetle;
  return (radius * 2 * TILE * 1.3) / art.body;
}

// Scale for showing a bug as an icon about `px` long.
export function iconScale(id: string, px: number): number {
  const art = BUG_ART[id] ?? BUG_ART.beetle;
  return px / (art.body * 1.25);
}

export function bakeTextures(scene: Phaser.Scene, field: FieldInfo) {
  for (const [id, art] of Object.entries(BUG_ART)) {
    stripTexture(scene, `${id}_anim`, art.frame, art.frame, BUG_FRAMES, (ctx, i) => drawBugFrame(ctx, art, i));
    canvasTexture(scene, id, art.frame, art.frame, (ctx) => drawBugFrame(ctx, art, 0));
  }

  const W = field.cols * field.tile;
  const H = field.rows * field.tile;
  canvasTexture(scene, 'ground', W, H, (ctx) => drawGround(ctx, field));
  canvasTexture(scene, 'water', W, H, (ctx) => drawWater(ctx, field));

  const pot = 3 * TILE * HI;
  const skep = 4 * TILE * HI;
  for (const side of ['player', 'enemy'] as const) {
    canvasTexture(scene, `outpost_${side}`, pot, pot, (ctx) => drawOutpost(ctx, pot, SIDE_TINT[side]));
    // Nest entrances face the middle of the field.
    canvasTexture(scene, `nest_${side}`, skep, skep, (ctx) => drawNest(ctx, skep, SIDE_TINT[side], side === 'enemy' ? Math.PI / 2 : -Math.PI / 2));
  }
  stripTexture(scene, 'sunflower', 128, 128, 2, (ctx, i) => drawSunflower(ctx, 128, i));
  canvasTexture(scene, 'rubble_outpost', pot, pot, (ctx) => drawRubble(ctx, pot, 'pot'));
  canvasTexture(scene, 'rubble_nest', skep, skep, (ctx) => drawRubble(ctx, skep, 'skep'));
  stripTexture(scene, 'flag', 30 * HI, 36 * HI, 6, (ctx, i) => {
    ctx.scale(HI, HI);
    drawFlag(ctx, 30, 36, i / 6);
  });

  // Projectiles.
  canvasTexture(scene, 'seed', 14 * HI, 9 * HI, (ctx) => {
    ctx.scale(HI, HI);
    drawSeed(ctx, 14, 9);
  });
  canvasTexture(scene, 'honey', 16 * HI, 16 * HI, (ctx) => drawGlob(ctx, 16 * HI, '#ffd060', '#c87a10'));
  canvasTexture(scene, 'spit', 12 * HI, 12 * HI, (ctx) => drawGlob(ctx, 12 * HI, '#f0ffd0', '#7ab83a'));
  canvasTexture(scene, 'spray', 14 * HI, 14 * HI, (ctx) => drawGlob(ctx, 14 * HI, '#fff0a0', '#e8601a'));

  // Effects.
  canvasTexture(scene, 'spark', 24 * HI, 24 * HI, (ctx) => drawSpark(ctx, 24 * HI));
  canvasTexture(scene, 'puff', 32 * HI, 32 * HI, (ctx) => drawSoftDot(ctx, 32 * HI, '#e8dcc0', 0.9));
  canvasTexture(scene, 'shadow', 64, 64, (ctx) => drawSoftDot(ctx, 64, '#000000', 0.55));
  canvasTexture(scene, 'glow', 64, 64, (ctx) => drawSoftDot(ctx, 64, '#ffffff', 1));
  canvasTexture(scene, 'ring', 64 * HI, 64 * HI, (ctx) => drawRing(ctx, 64 * HI));
  canvasTexture(scene, 'blast', 64 * HI, 64 * HI, (ctx) => drawBlast(ctx, 64 * HI));
  canvasTexture(scene, 'shard', 12 * HI, 12 * HI, (ctx) => drawShard(ctx, 12 * HI, '#c8643a'));
  canvasTexture(scene, 'straw', 14 * HI, 4 * HI, (ctx) => {
    ctx.fillStyle = '#d8a548';
    ctx.fillRect(0, HI, 14 * HI, 2 * HI);
  });
  stripTexture(scene, 'bee', 14 * HI, 14 * HI, 2, (ctx, i) => {
    ctx.scale(HI, HI);
    drawBee(ctx, 14, i ? 1.5 : -0.5);
  });
  canvasTexture(scene, 'floatleaf', 30 * HI, 30 * HI, (ctx) => leaf(ctx, 15 * HI, 15 * HI, 22 * HI, 0.3, '#c8742a'));
  canvasTexture(scene, 'floatleaf2', 30 * HI, 30 * HI, (ctx) => leaf(ctx, 15 * HI, 15 * HI, 18 * HI, -0.2, '#7a9a30'));
}

// Interface textures, sized by the scene's layout.
export function bakeUi(scene: Phaser.Scene, size: { cardW: number; cardH: number; sideW: number; height: number; panelW: number; panelH: number }) {
  canvasTexture(scene, 'card', size.cardW * HI, size.cardH * HI, (ctx) => drawCardFrame(ctx, size.cardW * HI, size.cardH * HI, false));
  canvasTexture(scene, 'card_sel', size.cardW * HI, size.cardH * HI, (ctx) => drawCardFrame(ctx, size.cardW * HI, size.cardH * HI, true));
  canvasTexture(scene, 'drop', 40 * HI, 40 * HI, (ctx) => drawNectarDrop(ctx, 40 * HI));
  canvasTexture(scene, 'panel_left', size.sideW, size.height, (ctx) => drawPanelBg(ctx, size.sideW, size.height, '#1f2c19', 5));
  canvasTexture(scene, 'panel_right', size.sideW, size.height, (ctx) => drawPanelBg(ctx, size.sideW, size.height, '#2a1d1b', 6));
  canvasTexture(scene, 'planks', size.panelW, size.panelH, (ctx) => drawPlanks(ctx, size.panelW, size.panelH));
}
