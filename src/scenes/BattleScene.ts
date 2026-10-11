import Phaser from 'phaser';
import { COLS, DT, ROWS, Side } from '../sim/constants';
import { Entity, Unit, World } from '../sim/world';
import { TEST_UNITS, UnitStats } from '../data/units';
import { TILE, bakeTextures } from './textures';

export const ARENA_W = COLS * TILE;
export const ARENA_H = ROWS * TILE;
export const PANEL_H = 170;

const SIDE_COLOR: Record<Side, number> = { player: 0x3d8bfd, enemy: 0xe5484d };

interface UnitView {
  ring: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
}

export class BattleScene extends Phaser.Scene {
  private world!: World;
  private acc = 0;
  private unitViews = new Map<number, UnitView>();
  private towerViews = new Map<number, { sprite: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics }>();
  private projViews = new Map<number, Phaser.GameObjects.Image>();
  private ghost!: Phaser.GameObjects.Ellipse;
  private selected: UnitStats = TEST_UNITS.beetle;
  private aiTimer = 4;
  private aiCount = 0;
  private buttons: { stats: UnitStats; box: Phaser.GameObjects.Rectangle }[] = [];
  private ended = false;

  constructor() {
    super('battle');
  }

  create() {
    if (!this.textures.exists('beetle')) bakeTextures(this);
    this.world = new World();
    this.acc = 0;
    this.ended = false;
    this.unitViews.clear();
    this.towerViews.clear();
    this.projViews.clear();
    this.buttons = [];

    this.drawGround();
    this.drawPuddles();
    for (const t of this.world.towers) {
      const sprite = this.add.image(t.x * TILE, t.y * TILE, t.role).setDepth(t.y);
      const flag = this.add.rectangle(t.x * TILE, (t.y - t.radius) * TILE + 4, 14, 8, SIDE_COLOR[t.side]).setDepth(t.y + 0.1);
      flag.setStrokeStyle(1, 0x000000, 0.5);
      this.towerViews.set(t.id, { sprite, bar: this.add.graphics().setDepth(100) });
    }

    this.ghost = this.add.ellipse(0, 0, TILE, TILE, 0xffffff, 0.35).setVisible(false).setDepth(200);
    this.drawPanel();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateGhost(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));
  }

  private drawGround() {
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(0x7a5a3a, 1).fillRect(0, 0, ARENA_W, ARENA_H);
    const rng = new Phaser.Math.RandomDataGenerator(['bugwars']);
    // Soil speckle and pebbles.
    for (let i = 0; i < 900; i++) {
      const shade = rng.pick([0x6e5034, 0x86653f, 0x735437, 0x8f6d46]);
      g.fillStyle(shade, 0.7).fillCircle(rng.between(0, ARENA_W), rng.between(0, ARENA_H), rng.realInRange(1, 3.5));
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle(rng.pick([0x9b9488, 0xb0a99b, 0x8a8478]), 1)
        .fillEllipse(rng.between(0, ARENA_W), rng.between(0, ARENA_H), rng.between(4, 9), rng.between(3, 7));
    }
    // Grass tufts along the side edges.
    for (let y = 0; y < ARENA_H; y += 10) {
      for (const x of [rng.between(0, 10), ARENA_W - rng.between(0, 10)]) {
        g.fillStyle(rng.pick([0x4f8a35, 0x5f9f3f, 0x467a2f]), 1).fillTriangle(x - 4, y + 8, x, y - 6, x + 4, y + 8);
      }
    }
    // Faint line marking the middle of the field.
    g.lineStyle(2, 0x5a3f27, 0.4).lineBetween(0, ARENA_H / 2, ARENA_W, ARENA_H / 2);
  }

  private drawPuddles() {
    const g = this.add.graphics().setDepth(-5);
    const wet: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (this.world.arena.isWet(c, r)) wet.push([c, r]);
    // Overlapping circles per wet tile make an organic shoreline.
    const pass = (color: number, alpha: number, radius: number, dy = 0) => {
      g.fillStyle(color, alpha);
      for (const [c, r] of wet) g.fillCircle((c + 0.5) * TILE, (r + 0.5) * TILE + dy, radius);
    };
    pass(0x4a3524, 1, TILE * 0.78, 2); // wet mud rim
    pass(0x3f7fa8, 1, TILE * 0.68);
    pass(0x5a9cc4, 1, TILE * 0.5, -2);
    const rng = new Phaser.Math.RandomDataGenerator(['puddle']);
    for (let i = 0; i < 14; i++) {
      const [c, r] = rng.pick(wet);
      g.lineStyle(1.5, 0xcfe8f5, 0.55).strokeEllipse((c + 0.5) * TILE, (r + 0.5) * TILE, rng.between(10, 22), rng.between(4, 8));
    }
  }

  private drawPanel() {
    const y0 = ARENA_H;
    this.add.rectangle(ARENA_W / 2, y0 + PANEL_H / 2, ARENA_W, PANEL_H, 0x2a3b22).setDepth(300);
    this.add.text(16, y0 + 12, 'Arena prototype: tap your half to drop a test bug.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: '#f4ecd8',
    }).setDepth(301);
    this.add.text(16, y0 + 36, 'Ground bugs walk around puddles. Wasps fly over them.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#c9d8b8',
    }).setDepth(301);

    Object.values(TEST_UNITS).forEach((stats, i) => {
      const x = 90 + i * 150;
      const y = y0 + 110;
      const box = this.add.rectangle(x, y, 130, 80, 0x3f5632).setDepth(301).setInteractive({ useHandCursor: true });
      this.add.image(x, y - 10, stats.id).setScale(1.3).setDepth(302);
      this.add.text(x, y + 24, stats.name.replace('Test ', ''), {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(302);
      box.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.selected = stats;
        this.refreshButtons();
      });
      this.buttons.push({ stats, box });
    });
    this.refreshButtons();
  }

  private refreshButtons() {
    for (const b of this.buttons) b.box.setStrokeStyle(3, b.stats === this.selected ? 0xf2c12e : 0x2a3b22);
  }

  private updateGhost(p: Phaser.Input.Pointer) {
    if (p.y >= ARENA_H || this.ended) {
      this.ghost.setVisible(false);
      return;
    }
    const ok = this.world.canDeploy('player', p.x / TILE, p.y / TILE, this.selected.flying);
    this.ghost.setPosition(p.x, p.y).setFillStyle(ok ? 0xffffff : 0xe5484d, 0.35).setVisible(true);
  }

  private onTap(p: Phaser.Input.Pointer) {
    if (this.ended) return;
    if (p.y >= ARENA_H) return;
    const x = p.x / TILE;
    const y = p.y / TILE;
    if (this.world.canDeploy('player', x, y, this.selected.flying)) {
      this.world.spawnUnit('player', this.selected, x, y);
    }
  }

  // Stand-in opponent so towers have something to shoot. Step 3 replaces it.
  private stepDummyAi() {
    this.aiTimer -= DT;
    if (this.aiTimer > 0) return;
    this.aiTimer = 6;
    const stats = this.aiCount % 3 === 2 ? TEST_UNITS.wasp : TEST_UNITS.beetle;
    const x = this.aiCount % 2 === 0 ? 3.5 : COLS - 3.5;
    this.world.spawnUnit('enemy', stats, x, 10.5);
    this.aiCount++;
  }

  update(_time: number, deltaMs: number) {
    this.acc += Math.min(deltaMs / 1000, 0.25);
    while (this.acc >= DT) {
      this.acc -= DT;
      if (!this.ended) {
        this.stepDummyAi();
        this.world.step();
        this.playEvents();
      }
    }
    this.render(this.acc / DT);
    if (this.world.winner && !this.ended) this.showResult(this.world.winner);
  }

  private playEvents() {
    for (const ev of this.world.events) {
      if (ev.type === 'hit') {
        const flash = this.add.circle(ev.x * TILE, ev.y * TILE, 6, 0xfff2b0, 0.9).setDepth(150);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
      } else {
        const n = ev.isTower ? 14 : 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const puff = this.add.image(ev.x * TILE, ev.y * TILE, 'puff').setDepth(160).setAlpha(0.9);
          this.tweens.add({
            targets: puff,
            x: puff.x + Math.cos(a) * (ev.isTower ? 50 : 22),
            y: puff.y + Math.sin(a) * (ev.isTower ? 50 : 22),
            alpha: 0, scale: ev.isTower ? 2.2 : 1.2, duration: ev.isTower ? 700 : 400,
            onComplete: () => puff.destroy(),
          });
        }
      }
    }
  }

  private render(alpha: number) {
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const seen = new Set<number>();

    for (const t of this.world.towers) {
      const view = this.towerViews.get(t.id)!;
      view.bar.clear();
      if (!t.alive) {
        if (view.sprite.texture.key !== 'rubble') view.sprite.setTexture('rubble').setScale(t.stats.size / 3);
        continue;
      }
      this.drawBar(view.bar, t, t.x * TILE, (t.y - t.radius) * TILE - 6, t.stats.size * TILE * 0.8);
      if (t.role === 'nest' && !t.active) view.sprite.setTint(0xbbbbbb);
      else view.sprite.clearTint();
    }

    for (const u of this.world.units) {
      seen.add(u.id);
      const view = this.unitViews.get(u.id) ?? this.makeUnitView(u);
      const x = lerp(u.prevX, u.x) * TILE;
      const y = lerp(u.prevY, u.y) * TILE;
      const lift = u.flying ? 10 : 0;
      // Two-frame "walk": a small wobble while moving, a lunge while attacking.
      const phase = this.world.tick + u.id;
      const wobble = u.attacking ? 0 : Math.sin(phase * 0.8) * 0.12;
      const lunge = u.attacking && u.cooldown > u.stats.hitSpeed - 0.15 ? 4 : 0;
      view.ring.setPosition(x, y + (u.flying ? 6 : 2)).setDepth(y / TILE - 0.01);
      view.sprite
        .setPosition(x + Math.cos(u.facing) * lunge, y - lift + Math.sin(u.facing) * lunge)
        .setRotation(u.facing + wobble)
        .setDepth(u.flying ? 120 + y / TILE : y / TILE);
      view.bar.clear();
      this.drawBar(view.bar, u, x, y - lift - 22, 28);
    }
    for (const [id, view] of this.unitViews) {
      if (seen.has(id)) continue;
      view.ring.destroy();
      view.sprite.destroy();
      view.bar.destroy();
      this.unitViews.delete(id);
    }

    const live = new Set<number>();
    for (const p of this.world.projectiles) {
      live.add(p.id);
      let img = this.projViews.get(p.id);
      if (!img) {
        img = this.add.image(0, 0, 'seed').setDepth(140);
        this.projViews.set(p.id, img);
      }
      img.setPosition(lerp(p.prevX, p.x) * TILE, lerp(p.prevY, p.y) * TILE);
    }
    for (const [id, img] of this.projViews) {
      if (!live.has(id)) {
        img.destroy();
        this.projViews.delete(id);
      }
    }
  }

  private makeUnitView(u: Unit): UnitView {
    const ring = this.add.ellipse(0, 0, TILE * 0.95, TILE * 0.55, SIDE_COLOR[u.side], u.flying ? 0.25 : 0.55);
    const sprite = this.add.image(0, 0, u.stats.id).setScale(u.flying ? 1.05 : 1.1);
    const view = { ring, sprite, bar: this.add.graphics().setDepth(130) };
    this.unitViews.set(u.id, view);
    return view;
  }

  private drawBar(g: Phaser.GameObjects.Graphics, e: Entity, cx: number, y: number, w: number) {
    if (e.hp >= e.maxHp && e.kind === 'unit') return;
    const pct = Math.max(0, e.hp / e.maxHp);
    g.fillStyle(0x000000, 0.6).fillRect(cx - w / 2 - 1, y - 1, w + 2, 7);
    g.fillStyle(SIDE_COLOR[e.side], 1).fillRect(cx - w / 2, y, w * pct, 5);
  }

  private showResult(winner: Side) {
    this.ended = true;
    this.ghost.setVisible(false);
    const won = winner === 'player';
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, 180, 0x000000, 0.65).setDepth(400);
    this.add.text(ARENA_W / 2, ARENA_H / 2 - 30, won ? 'Victory!' : 'Defeat', {
      fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: won ? '#f2c12e' : '#e5484d', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(401);
    const again = this.add.text(ARENA_W / 2, ARENA_H / 2 + 40, 'Play again', {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#ffffff', backgroundColor: '#3f5632',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(401).setInteractive({ useHandCursor: true });
    again.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.scene.restart();
    });
  }
}
