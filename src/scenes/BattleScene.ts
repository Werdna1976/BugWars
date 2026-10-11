import Phaser from 'phaser';
import { COLS, DT, ROWS, Side } from '../sim/constants';
import { Entity, Result, Unit, World } from '../sim/world';
import { SimpleAi } from '../sim/ai';
import { HAND_SIZE, NECTAR } from '../sim/player';
import { CARDS, CardDef, KEYWORDS, RANGE_LABEL, SPEED_LABEL } from '../data/cards';
import { TILE, bakeTextures } from './textures';

export const ARENA_W = COLS * TILE;
export const ARENA_H = ROWS * TILE;
export const PANEL_H = 230;

const SIDE_COLOR: Record<Side, number> = { player: 0x3d8bfd, enemy: 0xe5484d };
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

const CARD_W = 106;
const CARD_H = 150;
const CARD_GAP = 8;
const CARD_Y = ARENA_H + 46;

interface UnitView {
  ring: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Graphics;
}

interface CardView {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  shade: Phaser.GameObjects.Rectangle;
  cardId: string;
}

// Display size for a bug: roughly its body diameter, a bit larger so detail reads.
function spriteScale(scene: Phaser.Scene, key: string, radius: number): number {
  const tex = scene.textures.get(key).getSourceImage();
  return (radius * 2 * TILE * 1.45) / Math.max(tex.width * 0.75, 1);
}

export class BattleScene extends Phaser.Scene {
  private world!: World;
  private acc = 0;
  private unitViews = new Map<number, UnitView>();
  private towerViews = new Map<number, { sprite: Phaser.GameObjects.Image; bar: Phaser.GameObjects.Graphics }>();
  private projViews = new Map<number, Phaser.GameObjects.Image>();
  private cards: CardView[] = [];
  private nextCard!: { icon: Phaser.GameObjects.Image; cost: Phaser.GameObjects.Text };
  private nectarBar!: Phaser.GameObjects.Graphics;
  private nectarText!: Phaser.GameObjects.Text;
  private tooltip!: Phaser.GameObjects.Container;
  private zoneShade!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private selected: number | null = null;
  private dragging = false;
  private hovered: number | null = null;
  private ai!: SimpleAi;
  private clockText!: Phaser.GameObjects.Text;
  private crownText!: Record<Side, Phaser.GameObjects.Text>;
  private announced = new Set<string>();
  private ended = false;

  constructor() {
    super('battle');
  }

  create() {
    if (!this.textures.exists('beetle')) bakeTextures(this);
    this.world = new World(Math.floor(Math.random() * 1e9));
    this.ai = new SimpleAi(this.world, 'enemy');
    this.announced.clear();
    this.acc = 0;
    this.ended = false;
    this.selected = null;
    this.dragging = false;
    this.hovered = null;
    this.unitViews.clear();
    this.towerViews.clear();
    this.projViews.clear();
    this.cards = [];

    this.drawGround();
    this.drawPuddles();
    for (const t of this.world.towers) {
      const sprite = this.add.image(t.x * TILE, t.y * TILE, t.role).setDepth(t.y);
      const flag = this.add.rectangle(t.x * TILE, (t.y - t.radius) * TILE + 4, 14, 8, SIDE_COLOR[t.side]).setDepth(t.y + 0.1);
      flag.setStrokeStyle(1, 0x000000, 0.5);
      this.towerViews.set(t.id, { sprite, bar: this.add.graphics().setDepth(100) });
    }

    this.zoneShade = this.add.graphics().setDepth(90).setVisible(false);
    this.zoneShade.fillStyle(0xe5484d, 0.18).fillRect(0, 0, ARENA_W, (ROWS / 2 + 1) * TILE);
    this.ghost = this.add.image(0, 0, 'pillbug').setAlpha(0.6).setVisible(false).setDepth(200);

    this.tooltip = this.add.container(0, 0).setDepth(500).setVisible(false);
    this.drawPanel();
    this.drawHud();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateGhost(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onArenaDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
  }

  // ---------- Static scenery ----------

  private drawGround() {
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(0x7a5a3a, 1).fillRect(0, 0, ARENA_W, ARENA_H);
    const rng = new Phaser.Math.RandomDataGenerator(['bugwars']);
    for (let i = 0; i < 900; i++) {
      const shade = rng.pick([0x6e5034, 0x86653f, 0x735437, 0x8f6d46]);
      g.fillStyle(shade, 0.7).fillCircle(rng.between(0, ARENA_W), rng.between(0, ARENA_H), rng.realInRange(1, 3.5));
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle(rng.pick([0x9b9488, 0xb0a99b, 0x8a8478]), 1)
        .fillEllipse(rng.between(0, ARENA_W), rng.between(0, ARENA_H), rng.between(4, 9), rng.between(3, 7));
    }
    for (let y = 0; y < ARENA_H; y += 10) {
      for (const x of [rng.between(0, 10), ARENA_W - rng.between(0, 10)]) {
        g.fillStyle(rng.pick([0x4f8a35, 0x5f9f3f, 0x467a2f]), 1).fillTriangle(x - 4, y + 8, x, y - 6, x + 4, y + 8);
      }
    }
    g.lineStyle(2, 0x5a3f27, 0.4).lineBetween(0, ARENA_H / 2, ARENA_W, ARENA_H / 2);
  }

  private drawPuddles() {
    const g = this.add.graphics().setDepth(-5);
    const wet: [number, number][] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (this.world.arena.isWet(c, r)) wet.push([c, r]);
    const pass = (color: number, alpha: number, radius: number, dy = 0) => {
      g.fillStyle(color, alpha);
      for (const [c, r] of wet) g.fillCircle((c + 0.5) * TILE, (r + 0.5) * TILE + dy, radius);
    };
    pass(0x4a3524, 1, TILE * 0.78, 2);
    pass(0x3f7fa8, 1, TILE * 0.68);
    pass(0x5a9cc4, 1, TILE * 0.5, -2);
    const rng = new Phaser.Math.RandomDataGenerator(['puddle']);
    for (let i = 0; i < 14; i++) {
      const [c, r] = rng.pick(wet);
      g.lineStyle(1.5, 0xcfe8f5, 0.55).strokeEllipse((c + 0.5) * TILE, (r + 0.5) * TILE, rng.between(10, 22), rng.between(4, 8));
    }
  }

  // ---------- Card panel ----------

  private drawPanel() {
    const y0 = ARENA_H;
    this.add.rectangle(ARENA_W / 2, y0 + PANEL_H / 2, ARENA_W, PANEL_H, 0x2a3b22).setDepth(300);
    this.nectarBar = this.add.graphics().setDepth(301);
    this.nectarText = this.add.text(14, y0 + 10, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffe9a8', fontStyle: 'bold',
    }).setDepth(302);

    for (let i = 0; i < HAND_SIZE; i++) {
      const x = 10 + i * (CARD_W + CARD_GAP) + CARD_W / 2;
      const container = this.add.container(x, CARD_Y + CARD_H / 2).setDepth(310);
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x4a6a3a).setStrokeStyle(3, 0x1d2a17);
      const icon = this.add.image(0, -18, 'pillbug');
      const name = this.add.text(0, 40, '', {
        fontFamily: FONT, fontSize: '13px', color: '#ffffff', align: 'center', wordWrap: { width: CARD_W - 8 },
      }).setOrigin(0.5);
      const badge = this.add.circle(-CARD_W / 2 + 16, -CARD_H / 2 + 16, 14, 0x8a4fd8).setStrokeStyle(2, 0xffe9a8);
      const cost = this.add.text(-CARD_W / 2 + 16, -CARD_H / 2 + 16, '', {
        fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const shade = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x000000, 0.5).setOrigin(0.5, 1).setPosition(0, CARD_H / 2);
      container.add([bg, icon, name, shade, badge, cost]);
      container.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
      container.on('pointerover', () => this.setHover(i));
      container.on('pointerout', () => this.setHover(null));
      container.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        if (this.ended) return;
        this.selected = this.selected === i && !this.dragging ? null : i;
        this.dragging = this.selected !== null;
        this.refreshCards();
      });
      this.cards.push({ container, bg, icon, name, cost, shade, cardId: '' });
    }

    const nx = 10 + HAND_SIZE * (CARD_W + CARD_GAP) + 50;
    this.add.text(nx, CARD_Y + 4, 'Next', { fontFamily: FONT, fontSize: '13px', color: '#c9d8b8' }).setOrigin(0.5, 0).setDepth(310);
    this.add.rectangle(nx, CARD_Y + 66, 70, 90, 0x3a5230).setStrokeStyle(2, 0x1d2a17).setDepth(310);
    this.nextCard = {
      icon: this.add.image(nx, CARD_Y + 70, 'pillbug').setDepth(311),
      cost: this.add.text(nx, CARD_Y + 120, '', { fontFamily: FONT, fontSize: '13px', color: '#ffe9a8' }).setOrigin(0.5).setDepth(311),
    };
    this.refreshCards();
  }

  private refreshCards() {
    const me = this.world.players.player;
    this.cards.forEach((view, i) => {
      const card = CARDS[me.hand[i]];
      if (view.cardId !== card.id) {
        view.cardId = card.id;
        view.icon.setTexture(card.unit.id).setScale(Math.min(1.6, 64 / this.textures.get(card.unit.id).getSourceImage().width * 1.3));
        view.name.setText(card.name);
        view.cost.setText(String(card.cost));
      }
      const chosen = this.selected === i;
      view.bg.setStrokeStyle(3, chosen ? 0xf2c12e : 0x1d2a17);
      view.container.setY(CARD_Y + CARD_H / 2 - (chosen ? 8 : 0));
    });
    const next = CARDS[me.queue[0]];
    this.nextCard.icon.setTexture(next.unit.id).setScale(Math.min(1, 40 / this.textures.get(next.unit.id).getSourceImage().width * 1.3));
    this.nextCard.cost.setText(`${next.cost} Nectar`);
    if (this.hovered !== null || this.selected !== null) this.showTooltip(this.hovered ?? this.selected!);
    else this.tooltip.setVisible(false);
  }

  // Per-frame: Nectar bar and the "charging" shade on cards you can't afford yet.
  private updatePanel() {
    const me = this.world.players.player;
    const y = ARENA_H + 12;
    const x0 = 120;
    const w = ARENA_W - x0 - 14;
    const seg = w / NECTAR.cap;
    const g = this.nectarBar.clear();
    g.fillStyle(0x16210f, 1).fillRoundedRect(x0 - 2, y - 2, w + 4, 24, 6);
    const full = Math.floor(me.nectar);
    g.fillStyle(0xd9a521, 1).fillRect(x0, y, seg * full, 20);
    g.fillStyle(0xd9a521, 0.45).fillRect(x0 + seg * full, y, seg * (me.nectar - full), 20);
    g.lineStyle(1, 0x16210f, 0.9);
    for (let i = 1; i < NECTAR.cap; i++) g.lineBetween(x0 + i * seg, y, x0 + i * seg, y + 20);
    this.nectarText.setText(`Nectar ${full}/${NECTAR.cap}`);

    this.cards.forEach((view, i) => {
      const cost = CARDS[me.hand[i]].cost;
      const missing = Math.max(0, 1 - me.nectar / cost);
      view.shade.setVisible(missing > 0).setDisplaySize(CARD_W, CARD_H * missing);
    });
  }

  private setHover(i: number | null) {
    this.hovered = i;
    const show = i ?? this.selected;
    if (show === null) this.tooltip.setVisible(false);
    else this.showTooltip(show);
  }

  private showTooltip(i: number) {
    const card = CARDS[this.world.players.player.hand[i]];
    this.tooltip.removeAll(true);
    const w = 330;
    const pad = 12;
    const parts: Phaser.GameObjects.GameObject[] = [];
    let y = pad;

    const title = this.add.text(pad, y, card.name, { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' });
    const cost = this.add.text(w - pad, y + 2, `${card.cost} Nectar`, { fontFamily: FONT, fontSize: '15px', color: '#ffe9a8' }).setOrigin(1, 0);
    parts.push(title, cost);
    y += 28;

    // Keyword chips, wrapping across lines.
    let cx = pad;
    for (const kw of card.keywords) {
      const label = this.add.text(0, 0, kw, { fontFamily: FONT, fontSize: '13px', color: '#1d2a17', fontStyle: 'bold' });
      const cw = label.width + 14;
      if (cx + cw > w - pad) {
        cx = pad;
        y += 26;
      }
      const chip = this.add.rectangle(cx, y, cw, 22, kwColor(kw)).setOrigin(0, 0);
      label.setPosition(cx + 7, y + 3);
      parts.push(chip, label);
      cx += cw + 6;
    }
    y += 30;

    const u = card.unit;
    const statLine = [
      card.count > 1 ? `${card.count} bugs × ${u.hp} HP` : `${u.hp} HP`,
      `${u.damage} dmg every ${u.hitSpeed}s`,
      `${RANGE_LABEL(u.range)} range`,
      `${SPEED_LABEL(u.speed)}`,
    ].join('  ·  ');
    const stats = this.add.text(pad, y, statLine, { fontFamily: FONT, fontSize: '13px', color: '#c9d8b8', wordWrap: { width: w - pad * 2 } });
    parts.push(stats);
    y += stats.height + 8;

    const blurb = this.add.text(pad, y, card.blurb, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', wordWrap: { width: w - pad * 2 } });
    parts.push(blurb);
    y += blurb.height + 8;

    for (const kw of card.keywords) {
      const line = this.add.text(pad, y, `${kw}: ${KEYWORDS[kw]}`, {
        fontFamily: FONT, fontSize: '12px', color: '#d8d0bc', wordWrap: { width: w - pad * 2 },
      });
      parts.push(line);
      y += line.height + 3;
    }
    if (card.comingLater) {
      y += 4;
      const later = this.add.text(pad, y, `Coming later: ${card.comingLater}`, {
        fontFamily: FONT, fontSize: '12px', color: '#9fb08a', fontStyle: 'italic', wordWrap: { width: w - pad * 2 },
      });
      parts.push(later);
      y += later.height;
    }
    y += pad;

    const bg = this.add.rectangle(0, 0, w, y, 0x16210f, 0.95).setOrigin(0, 0).setStrokeStyle(2, 0xf2c12e);
    this.tooltip.add([bg, ...parts]);
    const cardX = 10 + i * (CARD_W + CARD_GAP) + CARD_W / 2;
    const tx = Phaser.Math.Clamp(cardX - w / 2, 6, ARENA_W - w - 6);
    this.tooltip.setPosition(tx, ARENA_H - y - 10).setVisible(true);
  }

  // ---------- Deploying ----------

  private selectedCard(): CardDef | null {
    return this.selected === null ? null : CARDS[this.world.players.player.hand[this.selected]];
  }

  private updateGhost(p: Phaser.Input.Pointer) {
    const card = this.selectedCard();
    this.zoneShade.setVisible(!!card && !this.ended);
    if (!card || p.y >= ARENA_H || this.ended) {
      this.ghost.setVisible(false);
      return;
    }
    const ok = this.world.canDeploy('player', p.x / TILE, p.y / TILE, card.unit.flying)
      && this.world.players.player.nectar >= card.cost;
    this.ghost
      .setTexture(card.unit.id)
      .setScale(spriteScale(this, card.unit.id, card.unit.radius))
      .setRotation(-Math.PI / 2)
      .setPosition(p.x, p.y)
      .setTint(ok ? 0xffffff : 0xff6666)
      .setVisible(true);
  }

  private tryDeploy(p: Phaser.Input.Pointer) {
    if (this.selected === null || p.y >= ARENA_H) return;
    if (this.world.playCard('player', this.selected, p.x / TILE, p.y / TILE)) {
      this.selected = null;
      this.ghost.setVisible(false);
      this.zoneShade.setVisible(false);
      this.refreshCards();
    }
  }

  private onArenaDown(p: Phaser.Input.Pointer) {
    if (this.ended || this.dragging) return;
    this.tryDeploy(p);
  }

  // Releasing a dragged card over the arena drops it there.
  private onPointerUp(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.dragging = false;
    if (p.y < ARENA_H) this.tryDeploy(p);
  }

  // ---------- Match HUD ----------

  private drawHud() {
    const style = { fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' };
    const cx = ARENA_W - 66;
    this.add.rectangle(cx, 50, 116, 84, 0x000000, 0.45).setDepth(250);
    this.clockText = this.add.text(cx, 24, '3:00', style).setOrigin(0.5).setDepth(251);
    const small = { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold' };
    this.crownText = {
      enemy: this.add.text(cx, 48, '', { ...small, color: '#ffb3b5' }).setOrigin(0.5).setDepth(251),
      player: this.add.text(cx, 66, '', { ...small, color: '#b3d1ff' }).setOrigin(0.5).setDepth(251),
    };
    this.add.text(cx, 84, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe9a8' })
      .setOrigin(0.5).setDepth(251).setName('phase');
  }

  private updateHud() {
    const w = this.world;
    const secs = Math.ceil(w.timeLeft);
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.clockText.setColor(w.timeLeft <= 10 && w.phase !== 'over' ? '#ff8a8a' : '#ffffff');
    const phase = this.children.getByName('phase') as Phaser.GameObjects.Text;
    phase.setText(w.phase === 'overtime' ? 'Overtime' : w.doubleNectar ? 'Nectar x2' : '');
    this.crownText.enemy.setText(`AI took ${w.crowns('enemy')}`);
    this.crownText.player.setText(`You took ${w.crowns('player')}`);

    if (w.doubleNectar && w.phase === 'regulation') this.announce('double', 'Double Nectar!');
    if (w.phase === 'overtime') this.announce('overtime', 'Overtime! Next tower wins');
  }

  private announce(key: string, text: string) {
    if (this.announced.has(key)) return;
    this.announced.add(key);
    const banner = this.add.text(ARENA_W / 2, ARENA_H / 2, text, {
      fontFamily: FONT, fontSize: '34px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#2a1a05', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(450).setScale(0.6).setAlpha(0);
    this.tweens.chain({
      targets: banner,
      tweens: [
        { scale: 1, alpha: 1, duration: 300, ease: 'Back.Out' },
        { alpha: 0, delay: 1600, duration: 400, onComplete: () => banner.destroy() },
      ],
    });
  }

  // ---------- Loop ----------

  update(_time: number, deltaMs: number) {
    this.acc += Math.min(deltaMs / 1000, 0.25);
    const handBefore = this.world.players.player.hand.join();
    while (this.acc >= DT) {
      this.acc -= DT;
      if (!this.ended) {
        this.ai.step();
        this.world.step();
      }
    }
    this.playEvents();
    if (handBefore !== this.world.players.player.hand.join()) this.refreshCards();
    this.updatePanel();
    this.updateHud();
    this.render(this.acc / DT);
    if (this.world.winner && !this.ended) this.showResult(this.world.winner);
  }

  private playEvents() {
    for (const ev of this.world.drainEvents()) {
      if (ev.type === 'hit') {
        const flash = this.add.circle(ev.x * TILE, ev.y * TILE, 6, 0xfff2b0, 0.9).setDepth(150);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
      } else if (ev.type === 'deploy') {
        const ring = this.add.circle(ev.x * TILE, ev.y * TILE, TILE * 0.9).setStrokeStyle(3, SIDE_COLOR[ev.side], 0.9).setDepth(150);
        this.tweens.add({ targets: ring, scale: 0.3, alpha: 0, duration: 900, onComplete: () => ring.destroy() });
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
      const lift = u.flying ? 10 + Math.sin((this.world.tick + u.id * 7) * 0.3) * 2 : 0;
      // Limited animation: a wobble while walking, a lunge on each attack.
      const phase = this.world.tick + u.id;
      const moving = !u.attacking && u.deploying <= 0;
      const wobble = moving ? Math.sin(phase * 0.8) * 0.12 : 0;
      const lunge = u.attacking && u.cooldown > u.stats.hitSpeed - 0.15 ? 4 : 0;
      view.ring.setPosition(x, y + (u.flying ? 6 : 2)).setDepth(y / TILE - 0.01);
      view.sprite
        .setPosition(x + Math.cos(u.facing) * lunge, y - lift + Math.sin(u.facing) * lunge)
        .setRotation(u.facing + wobble)
        .setAlpha(u.deploying > 0 ? 0.55 : 1)
        .setDepth(u.flying ? 120 + y / TILE : y / TILE);
      view.bar.clear();
      this.drawBar(view.bar, u, x, y - lift - u.radius * TILE - 10, Math.max(22, u.radius * TILE * 1.6));
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
        img = this.add.image(0, 0, p.kind).setDepth(140);
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
    const d = u.radius * 2 * TILE;
    const ring = this.add.ellipse(0, 0, d * 1.05, d * 0.6, SIDE_COLOR[u.side], u.flying ? 0.25 : 0.55);
    const sprite = this.add.image(0, 0, u.stats.id).setScale(spriteScale(this, u.stats.id, u.radius));
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

  private showResult(result: Result) {
    this.ended = true;
    this.ghost.setVisible(false);
    this.zoneShade.setVisible(false);
    this.selected = null;
    this.tooltip.setVisible(false);
    const won = result === 'player';
    const w = this.world;
    this.add.rectangle(ARENA_W / 2, ARENA_H / 2, ARENA_W, 180, 0x000000, 0.65).setDepth(400);
    this.add.text(ARENA_W / 2, ARENA_H / 2 - 44, result === 'draw' ? 'Draw' : won ? 'Victory!' : 'Defeat', {
      fontFamily: FONT, fontSize: '48px', color: result === 'draw' ? '#ffffff' : won ? '#f2c12e' : '#e5484d', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(401);
    const tied = w.crowns('player') === w.crowns('enemy');
    const detail = `Towers ${w.crowns('player')} : ${w.crowns('enemy')}` + (tied && result !== 'draw' ? '  (decided by tower health)' : '');
    this.add.text(ARENA_W / 2, ARENA_H / 2 + 2, detail, { fontFamily: FONT, fontSize: '16px', color: '#e8e0cc' })
      .setOrigin(0.5).setDepth(401);
    const again = this.add.text(ARENA_W / 2, ARENA_H / 2 + 50, 'Play again', {
      fontFamily: FONT, fontSize: '24px', color: '#ffffff', backgroundColor: '#3f5632', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(401).setInteractive({ useHandCursor: true });
    again.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.scene.restart();
    });
  }
}

function kwColor(kw: keyof typeof KEYWORDS): number {
  switch (kw) {
    case 'Tank': return 0xc9a46a;
    case 'Swarm': return 0xe08a5a;
    case 'Flying': return 0x8ec5ea;
    case 'Ranged': return 0xb7d98a;
    case 'Melee': return 0xd8cfb8;
    case 'Buildings only': return 0xe3b04b;
    case 'Air first': return 0x9fd6f0;
    case 'Ambush': return 0xd9a0e0;
    default: return 0xcfd8c0;
  }
}
