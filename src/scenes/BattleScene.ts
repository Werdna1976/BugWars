import Phaser from 'phaser';
import { COLS, DT, ROWS, Side } from '../sim/constants';
import { Entity, Result, Unit, World } from '../sim/world';
import { SimpleAi } from '../sim/ai';
import { HAND_SIZE, NECTAR } from '../sim/player';
import { CARDS, CardDef } from '../data/cards';
import { AI_DECK } from '../data/decks';
import { TILE, bakeTextures } from './textures';
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
    this.theirRows = [];
    this.countdown = COUNTDOWN_SECONDS;

    // World x = 0 is the left edge of the field; the side panels sit at negative x and past ARENA_W.
    this.cameras.main.setScroll(-SIDE_W, 0);

    this.drawGround();
    this.drawPuddles();
    for (const t of this.world.towers) {
      const sprite = this.add.image(t.x * TILE, t.y * TILE, t.role).setDepth(t.y);
      const flag = this.add.rectangle(t.x * TILE, (t.y - t.radius) * TILE + 4, 14, 8, SIDE_COLOR[t.side]).setDepth(t.y + 0.1);
      flag.setStrokeStyle(1, 0x000000, 0.5);
      this.towerViews.set(t.id, { sprite, bar: this.add.graphics().setDepth(100) });
    }

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
    this.input.once('pointerdown', () => music.start());
    music.reset();

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
        this.drawZone();
        this.zoneShade.setVisible(this.selected !== null);
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
      const tex = this.textures.get(card.unit.id).getSourceImage();
      this.add.image(rx + pad + 22, y + rowH / 2 - 2, card.unit.id)
        .setScale(Math.min(1, 34 / Math.max(tex.width, tex.height))).setRotation(-Math.PI / 2).setDepth(302);
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
      .setScale(spriteScale(this, card.unit.id, card.unit.radius))
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
      this.countdown = Math.max(0, this.countdown - deltaMs / 1000);
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

  private playEvents() {
    for (const ev of this.world.drainEvents()) {
      if (ev.type === 'hit') {
        const flash = this.add.circle(ev.x * TILE, ev.y * TILE, 6, 0xfff2b0, 0.9).setDepth(150);
        this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
      } else if (ev.type === 'blast') {
        // Area damage: a burst sized to the real blast radius, a shock ring, and flying droplets.
        const x = ev.x * TILE;
        const y = ev.y * TILE;
        const r = ev.radius * TILE;
        const burst = this.add.image(x, y, 'blast').setDepth(155).setScale(0.3).setAlpha(1);
        this.tweens.add({ targets: burst, scale: (r * 2) / 64, duration: 220, ease: 'Cubic.Out' });
        this.tweens.add({ targets: burst, alpha: 0, delay: 220, duration: 380, onComplete: () => burst.destroy() });
        const ring = this.add.circle(x, y, r).setStrokeStyle(4, 0xffd27a, 1).setDepth(156).setScale(0.4);
        this.tweens.add({ targets: ring, scale: 1.05, duration: 260, ease: 'Cubic.Out' });
        this.tweens.add({ targets: ring, alpha: 0, delay: 260, duration: 300, onComplete: () => ring.destroy() });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
          const drop = this.add.circle(x, y, 3, 0xff9a2a).setDepth(157);
          this.tweens.add({
            targets: drop, x: x + Math.cos(a) * r * 1.1, y: y + Math.sin(a) * r * 1.1, alpha: 0, duration: 450,
            onComplete: () => drop.destroy(),
          });
        }
        this.cameras.main.shake(90, 0.002);
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
    music.setIntense(false);
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

function onField(p: Phaser.Input.Pointer): boolean {
  return p.worldX >= 0 && p.worldX < ARENA_W && p.worldY >= 0 && p.worldY < ARENA_H;
}
