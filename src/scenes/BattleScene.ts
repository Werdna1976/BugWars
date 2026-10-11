import Phaser from 'phaser';
import { COLS, DT, ROWS, Side } from '../sim/constants';
import { Entity, Result, Tower, Unit, World } from '../sim/world';
import { SimpleAi } from '../sim/ai';
import { HAND_SIZE, NECTAR } from '../sim/player';
import { CARDS, CardDef } from '../data/cards';
import { AI_DECK } from '../data/decks';
import { BUG_FRAMES, HI, TILE, bakeTextures, bugScale, iconScale } from './textures';
import { WALK_FRAMES } from '../art/bugs';
import { FieldInfo, waterSpots } from '../art/scenery';
import { sfx } from '../audio/sfx';
import { FONT, drawCardDetails } from './details';
import { music } from '../audio/music';

export const ARENA_W = COLS * TILE;
export const ARENA_H = ROWS * TILE;
export const PANEL_H = 230;
export const SIDE_W = 320; // info panels left and right of the field
export const GAME_W = ARENA_W + SIDE_W * 2;
const COUNTDOWN_SECONDS = 8;

const SIDE_COLOR: Record<Side, number> = { player: 0x3d8bfd, enemy: 0xe5484d };

const CARD_W = 106;
const CARD_H = 150;
const CARD_GAP = 8;
const CARD_Y = ARENA_H + 46;

interface UnitView {
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  sprite: Phaser.GameObjects.Sprite;
  bar: Phaser.GameObjects.Graphics;
  walk: number; // gait phase, advanced by distance walked
  lastCooldown: number;
  strikeT: number; // seconds since the last attack started, Infinity when idle
  flash: number; // seconds of white hit-flash left
  lastX: number;
  lastY: number;
}

interface TowerView {
  sprite: Phaser.GameObjects.Image;
  turret?: Phaser.GameObjects.Sprite;
  flag: Phaser.GameObjects.Sprite;
  bar: Phaser.GameObjects.Graphics;
  bees: Phaser.GameObjects.Sprite[];
  aim: number;
  recoil: number;
  flash: number;
  zzz: number;
}

const STRIKE_SECONDS = 0.28;
const LANES = [3.5, COLS - 3.5];

interface CardView {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  shade: Phaser.GameObjects.Rectangle;
  cardId: string;
}


export class BattleScene extends Phaser.Scene {
  private world!: World;
  private acc = 0;
  private unitViews = new Map<number, UnitView>();
  private towerViews = new Map<number, TowerView>();
  private projViews = new Map<number, Phaser.GameObjects.Image>();
  private cards: CardView[] = [];
  private nextCard!: { icon: Phaser.GameObjects.Image; cost: Phaser.GameObjects.Text };
  private nectarBar!: Phaser.GameObjects.Graphics;
  private nectarText!: Phaser.GameObjects.Text;
  private yourDetails!: Phaser.GameObjects.Container;
  private yourHint!: Phaser.GameObjects.Text;
  private theirDetails!: Phaser.GameObjects.Container;
  private theirRows: Phaser.GameObjects.Rectangle[] = [];
  private countdown = COUNTDOWN_SECONDS;
  private countdownText!: Phaser.GameObjects.Text;
  private zoneShade!: Phaser.GameObjects.Graphics;
  private zoneKey = '';
  private ghost!: Phaser.GameObjects.Image;
  private selected: number | null = null;
  private dragging = false;
  private hovered: number | null = null;
  private ai!: SimpleAi;
  private clockText!: Phaser.GameObjects.Text;
  private crownText!: Record<Side, Phaser.GameObjects.Text>;
  private announced = new Set<string>();
  private ended = false;
  private lastTick = -1;

  constructor() {
    super('battle');
  }

  create() {
    this.world = new World(Math.floor(Math.random() * 1e9));
    if (!this.textures.exists('ground')) bakeTextures(this, this.fieldInfo());
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
    this.theirRows = [];
    this.countdown = COUNTDOWN_SECONDS;

    // World x = 0 is the left edge of the field; the side panels sit at negative x and past ARENA_W.
    this.cameras.main.setScroll(-SIDE_W, 0);

    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-10);
    this.add.image(0, 0, 'water').setOrigin(0, 0).setDepth(-5);
    this.animateWater();
    this.lastTick = -1;
    if (!this.anims.exists('flag-wave')) {
      this.anims.create({ key: 'flag-wave', frames: this.anims.generateFrameNames('flag', { start: 0, end: 5 }), frameRate: 9, repeat: -1 });
      this.anims.create({ key: 'bee-buzz', frames: this.anims.generateFrameNames('bee', { start: 0, end: 1 }), frameRate: 24, repeat: -1 });
    }
    for (const t of this.world.towers) this.makeTowerView(t);

    this.zoneShade = this.add.graphics().setDepth(90).setVisible(false);
    this.zoneKey = '';
    this.ghost = this.add.image(0, 0, 'pillbug').setAlpha(0.6).setVisible(false).setDepth(200);

    this.drawSidePanels();
    this.drawPanel();
    this.drawHud();
    this.countdownText = this.add.text(ARENA_W / 2, ARENA_H / 2 - 10, '', {
      fontFamily: FONT, fontSize: '30px', color: '#ffe9a8', fontStyle: 'bold', align: 'center',
      stroke: '#2a1a05', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(450);
    this.input.once('pointerdown', () => {
      music.start();
      sfx.unlock();
    });
    music.reset();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateGhost(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onArenaDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
  }

  // ---------- Static scenery ----------

  private fieldInfo(): FieldInfo {
    return {
      cols: COLS, rows: ROWS, tile: TILE, lanes: LANES,
      isWet: (c, r) => this.world.arena.isWet(c, r),
      towers: this.world.towers.map((t) => ({ x: t.x, y: t.y, size: t.stats.size })),
    };
  }

  // Puddle life: ripples, sun glints and a couple of drifting leaves.
  private animateWater() {
    const field = this.fieldInfo();
    const spots = waterSpots(field, 40, 3);
    const deep = waterSpots(field, 6, 9, 0.85);
    this.time.addEvent({
      delay: 450, loop: true, callback: () => {
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        const ring = this.add.image(x, y, 'ring').setDepth(-4).setScale(0.05, 0.03).setAlpha(0.55);
        this.tweens.add({ targets: ring, scaleX: 0.42, scaleY: 0.24, alpha: 0, duration: 1600, ease: 'Sine.Out', onComplete: () => ring.destroy() });
      },
    });
    this.time.addEvent({
      delay: 260, loop: true, callback: () => {
        const [x, y] = spots[Math.floor(Math.random() * spots.length)];
        const g = this.add.image(x, y, 'spark').setDepth(-4).setScale(0).setAlpha(0.85);
        this.tweens.add({ targets: g, scale: 0.28, duration: 380, yoyo: true, ease: 'Sine.InOut', onComplete: () => g.destroy() });
      },
    });
    deep.slice(0, 2).forEach(([x, y], i) => {
      const leaf = this.add.image(x, y, i ? 'floatleaf2' : 'floatleaf').setDepth(-4).setScale(1 / HI).setRotation(Math.random() * 6);
      this.tweens.add({ targets: leaf, x: x + (i ? -14 : 16), y: y + (i ? 5 : -4), rotation: leaf.rotation + (i ? -0.8 : 0.9), duration: 9000 + i * 2500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    });
  }

  private makeTowerView(t: Tower) {
    const x = t.x * TILE;
    const y = t.y * TILE;
    const sprite = this.add.image(x, y, `${t.role}_${t.side}`).setScale(1 / HI).setDepth(t.y - t.radius + 0.2);
    let turret: Phaser.GameObjects.Sprite | undefined;
    const aim = t.side === 'enemy' ? Math.PI / 2 : -Math.PI / 2;
    if (t.role === 'outpost') {
      turret = this.add.sprite(x, y, 'sunflower', '0').setScale(0.62).setRotation(aim).setDepth(t.y + 0.3);
    }
    const flag = this.add.sprite(x - t.radius * TILE * 0.7, y - t.radius * TILE * 0.95, 'flag')
      .setOrigin(0.15, 0.95).setScale(1 / HI).setTint(SIDE_COLOR[t.side]).setDepth(t.y + 0.4);
    flag.play({ key: 'flag-wave', startFrame: Math.floor(Math.random() * 6) });
    const bees: Phaser.GameObjects.Sprite[] = [];
    if (t.role === 'nest') {
      for (let i = 0; i < 5; i++) {
        const bee = this.add.sprite(x, y, 'bee').setScale(0.6).setDepth(130).setVisible(false);
        bee.play({ key: 'bee-buzz', startFrame: i % 2 });
        bees.push(bee);
      }
    }
    this.towerViews.set(t.id, { sprite, turret, flag, bees, bar: this.add.graphics().setDepth(100), aim, recoil: 0, flash: 0, zzz: 1 });
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
        this.drawZone();
        this.zoneShade.setVisible(this.selected !== null);
        sfx.unlock();
        sfx.play('click');
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
        view.icon.setTexture(card.unit.id).setScale(iconScale(card.unit.id, 70)).setRotation(-Math.PI / 2);
        view.name.setText(card.name);
        view.cost.setText(String(card.cost));
      }
      const chosen = this.selected === i;
      view.bg.setStrokeStyle(3, chosen ? 0xf2c12e : 0x1d2a17);
      view.container.setY(CARD_Y + CARD_H / 2 - (chosen ? 8 : 0));
    });
    const next = CARDS[me.queue[0]];
    this.nextCard.icon.setTexture(next.unit.id).setScale(iconScale(next.unit.id, 46)).setRotation(-Math.PI / 2);
    this.nextCard.cost.setText(`${next.cost} Nectar`);
    const show = this.hovered ?? this.selected;
    if (show !== null) this.showYourCard(show);
  }

  // Per-frame: Nectar bar and the "charging" shade on cards you can't afford yet.
  private updatePanel() {
    const me = this.world.players.player;
    const y = ARENA_H + 12;
    const x0 = 140;
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
    if (show !== null) this.showYourCard(show);
  }

  // ---------- Side panels ----------

  private drawSidePanels() {
    const pad = 18;
    const inner = SIDE_W - pad * 2;
    const h = ARENA_H + PANEL_H;
    const header = (x: number, text: string, color: string) =>
      this.add.text(x, 16, text, { fontFamily: FONT, fontSize: '15px', color, fontStyle: 'bold' }).setDepth(301);

    // Left: the card you're hovering or holding, shown large.
    const lx = -SIDE_W;
    this.add.rectangle(lx, 0, SIDE_W, h, 0x1f2c19).setOrigin(0, 0).setDepth(300);
    this.add.rectangle(-1, 0, 2, h, 0x0f160c).setOrigin(0, 0).setDepth(301);
    header(lx + pad, 'YOUR CARD', '#b3d1ff');
    this.yourHint = this.add.text(lx + pad, 50, 'Hover over a card in your hand (or tap it) to see what it does.', {
      fontFamily: FONT, fontSize: '17px', color: '#c9d8b8', wordWrap: { width: inner },
    }).setDepth(301);
    this.yourDetails = this.add.container(lx + pad, 50).setDepth(301);

    const mute = this.add.text(lx + pad, h - 40, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ffe9a8', backgroundColor: '#2f4226', padding: { x: 10, y: 6 },
    }).setDepth(302).setInteractive({ useHandCursor: true });
    const label = () => mute.setText(music.muted ? 'Music: off' : 'Music: on');
    label();
    mute.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      music.start();
      music.toggleMute();
      label();
    });
    const fx = this.add.text(lx + pad + 140, h - 40, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ffe9a8', backgroundColor: '#2f4226', padding: { x: 10, y: 6 },
    }).setDepth(302).setInteractive({ useHandCursor: true });
    const fxLabel = () => fx.setText(sfx.muted ? 'Effects: off' : 'Effects: on');
    fxLabel();
    fx.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      fxLabel();
    });

    // Right: the AI's deck. Hover a row to read about that bug.
    const rx = ARENA_W;
    this.add.rectangle(rx, 0, SIDE_W, h, 0x2a1d1b).setOrigin(0, 0).setDepth(300);
    this.add.rectangle(rx - 1, 0, 2, h, 0x160d0c).setOrigin(0, 0).setDepth(301);
    header(rx + pad, `AI DECK: ${AI_DECK.name.toUpperCase()}`, '#ffb3b5');
    const counts = new Map<string, number>();
    for (const id of AI_DECK.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
    let y = 44;
    const rowH = 44;
    for (const [id, n] of counts) {
      const card = CARDS[id];
      const row = this.add.rectangle(rx + pad, y, inner, rowH - 4, 0x3a2724).setOrigin(0, 0).setDepth(301)
        .setInteractive({ useHandCursor: true });
      this.add.image(rx + pad + 22, y + rowH / 2 - 2, card.unit.id)
        .setScale(iconScale(card.unit.id, 34)).setRotation(-Math.PI / 2).setDepth(302);
      this.add.text(rx + pad + 48, y + 9, card.name + (n > 1 ? ` ×${n}` : ''), {
        fontFamily: FONT, fontSize: '16px', color: '#ffffff',
      }).setDepth(302);
      this.add.text(rx + SIDE_W - pad - 8, y + 9, String(card.cost), {
        fontFamily: FONT, fontSize: '16px', color: '#ffe9a8', fontStyle: 'bold',
      }).setOrigin(1, 0).setDepth(302);
      row.on('pointerover', () => this.showTheirCard(card, row));
      row.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.showTheirCard(card, row);
      });
      this.theirRows.push(row);
      y += rowH;
    }
    this.theirDetails = this.add.container(rx + pad, y + 16).setDepth(301);
    this.showTheirCard(CARDS[AI_DECK.cards[0]], this.theirRows[0]);
  }

  private showYourCard(i: number) {
    const card = CARDS[this.world.players.player.hand[i]];
    this.yourHint.setVisible(false);
    drawCardDetails(this, this.yourDetails, card, SIDE_W - 36);
  }

  private showTheirCard(card: CardDef, row: Phaser.GameObjects.Rectangle) {
    for (const r of this.theirRows) r.setFillStyle(r === row ? 0x5a3a34 : 0x3a2724);
    drawCardDetails(this, this.theirDetails, card, SIDE_W - 36);
  }

  // ---------- Deploying ----------

  private selectedCard(): CardDef | null {
    return this.selected === null ? null : CARDS[this.world.players.player.hand[this.selected]];
  }

  // Shade the tiles you can't deploy on. Redrawn only when the zone changes (a tower falls).
  private drawZone() {
    const key = this.world.towers.map((t) => (t.alive ? 1 : 0)).join('');
    if (key === this.zoneKey) return;
    this.zoneKey = key;
    const g = this.zoneShade.clear().fillStyle(0xe5484d, 0.2);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (!this.world.inDeployZone('player', c, r)) g.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
    g.lineStyle(2, 0xffffff, 0.35);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const inside = this.world.inDeployZone('player', c, r);
        if (inside && !this.world.inDeployZone('player', c, r - 1)) g.lineBetween(c * TILE, r * TILE, (c + 1) * TILE, r * TILE);
        if (inside && c > 0 && !this.world.inDeployZone('player', c - 1, r)) g.lineBetween(c * TILE, r * TILE, c * TILE, (r + 1) * TILE);
        if (inside && c < COLS - 1 && !this.world.inDeployZone('player', c + 1, r)) g.lineBetween((c + 1) * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE);
      }
    }
  }

  private updateGhost(p: Phaser.Input.Pointer) {
    const card = this.selectedCard();
    if (card) this.drawZone();
    this.zoneShade.setVisible(!!card && !this.ended);
    if (!card || !onField(p) || this.ended) {
      this.ghost.setVisible(false);
      return;
    }
    const ok = this.world.canDeploy('player', p.worldX / TILE, p.worldY / TILE, card.unit.flying)
      && this.world.players.player.nectar >= card.cost;
    this.ghost
      .setTexture(card.unit.id)
      .setScale(bugScale(card.unit.id, card.unit.radius))
      .setRotation(-Math.PI / 2)
      .setPosition(p.worldX, p.worldY)
      .setTint(ok ? 0xffffff : 0xff6666)
      .setVisible(true);
  }

  private tryDeploy(p: Phaser.Input.Pointer) {
    if (this.selected === null || !onField(p) || this.countdown > 0) return;
    if (this.world.playCard('player', this.selected, p.worldX / TILE, p.worldY / TILE)) {
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
    if (onField(p)) this.tryDeploy(p);
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
    if (w.phase === 'overtime') {
      this.announce('overtime', 'Overtime! Next tower wins');
      music.setIntense(true);
    }
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

  update() {
    // Real elapsed time (capped), so the match clock stays honest on slow machines
    // instead of Phaser's smoothed delta turning into slow motion.
    const deltaMs = Math.min(this.game.loop.rawDelta, 250);
    if (this.countdown > 0) {
      // Pre-match: the field is frozen so you can read your cards.
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - deltaMs / 1000);
      if (Math.ceil(this.countdown) !== before && this.countdown <= 3) sfx.play(this.countdown === 0 ? 'go' : 'tick');
      this.countdownText.setText(this.countdown > 0
        ? `Match starts in ${Math.ceil(this.countdown)}\nHover your cards to read about them`
        : '');
      if (this.countdown === 0) this.announce('go', 'Go!');
      this.updatePanel();
      this.updateHud();
      return;
    }
    this.acc += deltaMs / 1000;
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

  // Pan a sound toward where it happened on the field.
  private pan(x: number): number {
    return (x / COLS) * 2 - 1;
  }

  private playEvents() {
    const w = this.world;
    for (const ev of w.drainEvents()) {
      switch (ev.type) {
        case 'hit': {
          const target = w.entities.find((e) => e.id === ev.targetId);
          const spark = this.add.image(ev.x * TILE + (Math.random() - 0.5) * 8, ev.y * TILE + (Math.random() - 0.5) * 8, 'spark')
            .setDepth(150).setScale(0.25).setRotation(Math.random() * 3);
          this.tweens.add({ targets: spark, scale: 0.5, alpha: 0, duration: 200, onComplete: () => spark.destroy() });
          if (target?.kind === 'tower') {
            const tv = this.towerViews.get(target.id);
            if (tv) tv.flash = 0.08;
            this.chips(ev.x * TILE, ev.y * TILE, target.role === 'nest' ? 'straw' : 'shard', 2, 14);
            sfx.play('hitTower', { pan: this.pan(ev.x) });
          } else {
            const uv = this.unitViews.get(ev.targetId);
            if (uv) uv.flash = 0.07;
          }
          break;
        }
        case 'blast': this.showBlast(ev.x, ev.y, ev.radius); break;
        case 'deploy': {
          const x = ev.x * TILE;
          const y = ev.y * TILE;
          const ring = this.add.image(x, y, 'ring').setTint(SIDE_COLOR[ev.side]).setDepth(5).setScale(0.6).setAlpha(0.9);
          this.tweens.add({ targets: ring, scale: 0.15, alpha: 0, duration: 700, ease: 'Cubic.In', onComplete: () => ring.destroy() });
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const puff = this.add.image(x, y + 4, 'puff').setDepth(6).setScale(0.25).setAlpha(0.7);
            this.tweens.add({
              targets: puff, x: x + Math.cos(a) * 26, y: y + 4 + Math.sin(a) * 14, scale: 0.5, alpha: 0, duration: 520, ease: 'Cubic.Out',
              onComplete: () => puff.destroy(),
            });
          }
          sfx.play('deploy', { pan: this.pan(ev.x) });
          break;
        }
        case 'fire': {
          const src = w.entities.find((e) => e.id === ev.sourceId);
          if (src?.kind === 'tower') {
            const tv = this.towerViews.get(src.id);
            if (tv) tv.recoil = 1;
          }
          sfx.play(ev.kind, { pan: src ? this.pan(src.x) : 0 });
          break;
        }
        case 'strike': {
          const src = w.entities.find((e) => e.id === ev.sourceId);
          sfx.play('bite', { pan: src ? this.pan(src.x) : 0 });
          break;
        }
        case 'wake': {
          const t = w.entities.find((e) => e.id === ev.towerId);
          if (t) {
            const ring = this.add.image(t.x * TILE, t.y * TILE, 'ring').setTint(0xffd060).setDepth(140).setScale(0.6);
            this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
          }
          sfx.play('nestWake');
          break;
        }
        case 'death': {
          if (ev.isTower) this.towerFall(ev.x, ev.y, ev.side);
          else this.bugDeath(ev.id, ev.x, ev.y);
          break;
        }
      }
    }
  }

  private chips(x: number, y: number, key: string, n: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.5 + Math.random());
      const chip = this.add.image(x, y, key).setDepth(152).setScale(0.35 + Math.random() * 0.25).setRotation(Math.random() * 6);
      this.tweens.add({
        targets: chip, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6 + 6, rotation: chip.rotation + 3, alpha: 0,
        duration: 420 + Math.random() * 200, ease: 'Quad.Out', onComplete: () => chip.destroy(),
      });
    }
  }

  // Area damage: a lumpy fireball sized to the real blast radius, a shock ring,
  // flying droplets and a scorch mark left on the ground.
  private showBlast(tx: number, ty: number, radius: number) {
    const x = tx * TILE;
    const y = ty * TILE;
    const r = radius * TILE;
    const full = (r * 2) / (64 * HI);
    const scorch = this.add.image(x, y, 'shadow').setDepth(-3).setScale((r * 1.6) / 64, (r * 1.2) / 64).setAlpha(0.45);
    this.tweens.add({ targets: scorch, alpha: 0, delay: 1500, duration: 1500, onComplete: () => scorch.destroy() });
    const burst = this.add.image(x, y, 'blast').setDepth(155).setScale(full * 0.25).setRotation(Math.random() * 6);
    this.tweens.add({ targets: burst, scale: full, duration: 200, ease: 'Cubic.Out' });
    this.tweens.add({ targets: burst, alpha: 0, scale: full * 1.15, delay: 200, duration: 380, onComplete: () => burst.destroy() });
    const flash = this.add.image(x, y, 'glow').setDepth(156).setScale((r * 1.4) / 32).setAlpha(0.9).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    const ring = this.add.image(x, y, 'ring').setTint(0xffd27a).setDepth(156).setScale(full * 0.4);
    this.tweens.add({ targets: ring, scale: full * 1.1, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const drop = this.add.image(x, y, 'spray').setDepth(157).setScale(0.3);
      this.tweens.add({
        targets: drop, x: x + Math.cos(a) * r * 1.15, y: y + Math.sin(a) * r * 1.15, scale: 0.12, alpha: 0, duration: 480, ease: 'Cubic.Out',
        onComplete: () => drop.destroy(),
      });
    }
    for (let i = 0; i < 4; i++) {
      const smoke = this.add.image(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, 'puff').setDepth(154).setScale(0.4).setAlpha(0.5).setTint(0x9a8a7a);
      this.tweens.add({ targets: smoke, y: smoke.y - 18, scale: 0.9, alpha: 0, delay: 150, duration: 900, onComplete: () => smoke.destroy() });
    }
    this.cameras.main.shake(110, 0.0025);
    sfx.play('blast', { pan: this.pan(tx) });
  }

  // A squashed bug: the sprite flips on its back, darkens and fades, with a splat.
  private bugDeath(id: number, tx: number, ty: number) {
    const x = tx * TILE;
    const y = ty * TILE;
    const view = this.unitViews.get(id);
    if (view) {
      const body = this.add.sprite(view.sprite.x, view.sprite.y, view.sprite.texture.key, view.sprite.frame.name)
        .setScale(view.sprite.scaleX, -view.sprite.scaleY).setRotation(view.sprite.rotation).setDepth(1).setTint(0x8a7a6a);
      this.tweens.add({ targets: body, alpha: 0, scaleX: body.scaleX * 0.8, scaleY: body.scaleY * 0.8, rotation: body.rotation + 0.6, delay: 250, duration: 700, onComplete: () => body.destroy() });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const puff = this.add.image(x, y, 'puff').setDepth(160).setScale(0.22).setAlpha(0.85);
      this.tweens.add({
        targets: puff, x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 12, alpha: 0, scale: 0.45, duration: 380,
        onComplete: () => puff.destroy(),
      });
    }
    sfx.play('squish', { pan: this.pan(tx) });
  }

  private towerFall(tx: number, ty: number, side: Side) {
    const x = tx * TILE;
    const y = ty * TILE;
    const t = this.world.towers.find((o) => !o.alive && o.x === tx && o.y === ty);
    const nest = t?.role === 'nest';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const puff = this.add.image(x, y, 'puff').setDepth(160).setAlpha(0.95).setScale(0.6).setTint(nest ? 0xe8d098 : 0xd8b8a0);
      this.tweens.add({
        targets: puff, x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 50, alpha: 0, scale: 1.6, duration: 900, ease: 'Cubic.Out',
        onComplete: () => puff.destroy(),
      });
    }
    this.chips(x, y, nest ? 'straw' : 'shard', 18, 70);
    const ring = this.add.image(x, y, 'ring').setTint(SIDE_COLOR[side]).setDepth(158).setScale(0.8);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    this.cameras.main.shake(320, 0.007);
    sfx.play('towerFall', { pan: this.pan(tx) });
  }

  private render(alpha: number) {
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const dt = Math.min(this.game.loop.rawDelta, 100) / 1000;
    const seen = new Set<number>();
    const now = this.time.now / 1000;

    for (const t of this.world.towers) {
      const view = this.towerViews.get(t.id)!;
      view.bar.clear();
      if (!t.alive) {
        const key = `rubble_${t.role}`;
        if (view.sprite.texture.key !== key) {
          view.sprite.setTexture(key).setDepth(-2);
          view.turret?.destroy();
          view.turret = undefined;
          view.flag.setVisible(false);
          for (const b of view.bees) b.setVisible(false);
        }
        continue;
      }
      this.drawBar(view.bar, t, t.x * TILE, (t.y - t.radius) * TILE - 6, t.stats.size * TILE * 0.8);
      view.flash = Math.max(0, view.flash - dt);
      const asleep = t.role === 'nest' && !t.active;
      if (view.flash > 0) view.sprite.setTintFill(0xffffff);
      else if (asleep) view.sprite.setTint(0xb8b0a0);
      else view.sprite.clearTint();
      // Sunflower turret swings toward its target and kicks back when it fires.
      if (view.turret) {
        const target = this.world.byId(t.targetId);
        if (target) {
          const want = Math.atan2(target.y - t.y, target.x - t.x);
          const diff = Phaser.Math.Angle.Wrap(want - view.aim);
          view.aim += diff * Math.min(1, dt * 10);
        }
        view.recoil = Math.max(0, view.recoil - dt * 5);
        view.turret.setRotation(view.aim).setFrame(view.recoil > 0.5 ? '1' : '0')
          .setScale(0.62 * (1 - view.recoil * 0.06))
          .setPosition(t.x * TILE - Math.cos(view.aim) * view.recoil * 3, t.y * TILE - Math.sin(view.aim) * view.recoil * 3);
        if (view.flash > 0) view.turret.setTintFill(0xffffff);
        else view.turret.clearTint();
      }
      // Bees circle an awake Nest; a sleeping one snores.
      view.bees.forEach((bee, i) => {
        bee.setVisible(!asleep);
        if (asleep) return;
        const a = now * (1.2 + i * 0.17) + i * 1.3;
        const rx = TILE * (1.6 + (i % 3) * 0.35);
        const bx = t.x * TILE + Math.cos(a) * rx;
        const by = t.y * TILE + Math.sin(a) * rx * 0.75;
        bee.setPosition(bx, by).setRotation(a + Math.PI / 2);
      });
      if (asleep) {
        view.zzz -= dt;
        if (view.zzz <= 0) {
          view.zzz = 1.3;
          const z = this.add.text(t.x * TILE + 18, t.y * TILE - 20, 'z', {
            fontFamily: FONT, fontSize: '18px', color: '#fff6d8', fontStyle: 'bold', stroke: '#3a2a10', strokeThickness: 3,
          }).setDepth(135);
          this.tweens.add({ targets: z, x: z.x + 16, y: z.y - 30, alpha: 0, scale: 1.5, duration: 1600, onComplete: () => z.destroy() });
        }
      }
    }

    for (const u of this.world.units) {
      seen.add(u.id);
      const view = this.unitViews.get(u.id) ?? this.makeUnitView(u);
      const x = lerp(u.prevX, u.x) * TILE;
      const y = lerp(u.prevY, u.y) * TILE;
      const lift = u.flying ? 12 + Math.sin(now * 3 + u.id) * 2.5 : 0;
      // Walk frames advance with distance covered, so legs never skate; flyers beat their wings constantly.
      const moved = Math.hypot(x - view.lastX, y - view.lastY) / TILE;
      view.lastX = x;
      view.lastY = y;
      if (u.flying) view.walk = (view.walk + dt * 7) % 1;
      else view.walk = (view.walk + moved / (u.radius * 2.4)) % 1;
      // A fresh attack restarts the strike animation.
      if (u.cooldown > view.lastCooldown + 0.01 && u.attacking) view.strikeT = 0;
      view.lastCooldown = u.cooldown;
      view.strikeT += dt;
      let frame = Math.floor(view.walk * WALK_FRAMES) % WALK_FRAMES;
      if (!u.flying && moved < 0.001) frame = 0;
      if (view.strikeT < STRIKE_SECONDS) frame = WALK_FRAMES + Math.min(BUG_FRAMES - WALK_FRAMES - 1, Math.floor((view.strikeT / STRIKE_SECONDS) * (BUG_FRAMES - WALK_FRAMES)));
      const lunge = view.strikeT < STRIKE_SECONDS ? Math.sin((view.strikeT / STRIKE_SECONDS) * Math.PI) * 3 : 0;
      const scale = bugScale(u.stats.id, u.radius);
      // Freshly deployed bugs drop in from above.
      const drop = u.deploying > 0 ? u.deploying : 0;
      const depth = u.flying ? 120 + y / TILE : y / TILE;
      view.shadow.setPosition(x + (u.flying ? 6 : 1.5), y + (u.flying ? 9 : 2.5))
        .setScale((u.radius * 2.4 * TILE) / 64 * (u.flying ? 0.8 : 1), (u.radius * 1.7 * TILE) / 64 * (u.flying ? 0.8 : 1))
        .setAlpha(u.flying ? 0.35 : 0.5).setDepth(u.flying ? 60 : depth - 0.02);
      view.ring.setPosition(x, y + (u.flying ? 0 : 1)).setDepth(u.flying ? 61 : depth - 0.01).setAlpha(u.deploying > 0 ? 0.3 : 0.75);
      view.flash = Math.max(0, view.flash - dt);
      view.sprite
        .setFrame(String(frame))
        .setPosition(x + Math.cos(u.facing) * lunge, y - lift - drop * 26 + Math.sin(u.facing) * lunge)
        .setRotation(u.facing)
        .setScale(scale * (1 + drop * 0.35))
        .setAlpha(u.deploying > 0 ? 1 - drop * 0.6 : 1)
        .setDepth(depth);
      if (view.flash > 0) view.sprite.setTintFill(0xffffff);
      else view.sprite.clearTint();
      view.bar.clear();
      this.drawBar(view.bar, u, x, y - lift - u.radius * TILE * 1.3 - 8, Math.max(22, u.radius * TILE * 1.6));
    }
    for (const [id, view] of this.unitViews) {
      if (seen.has(id)) continue;
      view.ring.destroy();
      view.shadow.destroy();
      view.sprite.destroy();
      view.bar.destroy();
      this.unitViews.delete(id);
    }

    const live = new Set<number>();
    const tick = this.world.tick;
    for (const p of this.world.projectiles) {
      live.add(p.id);
      let img = this.projViews.get(p.id);
      if (!img) {
        img = this.add.image(0, 0, p.kind).setDepth(140).setScale(p.kind === 'seed' ? 0.75 : 0.6);
        this.projViews.set(p.id, img);
      }
      const px = lerp(p.prevX, p.x) * TILE;
      const py = lerp(p.prevY, p.y) * TILE;
      img.setPosition(px, py).setRotation(Math.atan2(p.y - p.prevY, p.x - p.prevX));
      if (p.kind !== 'seed' && tick !== this.lastTick) {
        const trail = this.add.image(px, py, p.kind).setDepth(139).setScale(0.35).setAlpha(0.5);
        this.tweens.add({ targets: trail, scale: 0.1, alpha: 0, duration: 220, onComplete: () => trail.destroy() });
      }
    }
    this.lastTick = tick;
    for (const [id, img] of this.projViews) {
      if (!live.has(id)) {
        img.destroy();
        this.projViews.delete(id);
      }
    }
  }

  private makeUnitView(u: Unit): UnitView {
    const shadow = this.add.image(0, 0, 'shadow');
    const ring = this.add.image(0, 0, 'ring').setTint(SIDE_COLOR[u.side])
      .setScale((u.radius * 2.5 * TILE) / (64 * HI), (u.radius * 1.75 * TILE) / (64 * HI));
    const sprite = this.add.sprite(0, 0, `${u.stats.id}_anim`, '0');
    const view: UnitView = {
      shadow, ring, sprite, bar: this.add.graphics().setDepth(130),
      walk: Math.random(), lastCooldown: 0, strikeT: Infinity, flash: 0, lastX: u.x * TILE, lastY: u.y * TILE,
    };
    this.unitViews.set(u.id, view);
    return view;
  }

  private drawBar(g: Phaser.GameObjects.Graphics, e: Entity, cx: number, y: number, w: number) {
    if (e.hp >= e.maxHp && e.kind === 'unit') return;
    const pct = Math.max(0, e.hp / e.maxHp);
    const h = e.kind === 'tower' ? 7 : 5;
    g.fillStyle(0x000000, 0.65).fillRoundedRect(cx - w / 2 - 2, y - 2, w + 4, h + 4, 3);
    g.fillStyle(SIDE_COLOR[e.side], 1).fillRoundedRect(cx - w / 2, y, Math.max(2, w * pct), h, 2);
    g.fillStyle(0xffffff, 0.25).fillRect(cx - w / 2 + 1, y + 1, Math.max(0, w * pct - 2), 1.5);
  }

  private showResult(result: Result) {
    this.ended = true;
    this.ghost.setVisible(false);
    this.zoneShade.setVisible(false);
    this.selected = null;
    music.setIntense(false);
    const won = result === 'player';
    sfx.play(won ? 'victory' : 'defeat');
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

function onField(p: Phaser.Input.Pointer): boolean {
  return p.worldX >= 0 && p.worldX < ARENA_W && p.worldY >= 0 && p.worldY < ARENA_H;
}
