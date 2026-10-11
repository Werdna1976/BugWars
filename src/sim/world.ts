import { Arena, Tile } from './arena';
import { COLS, DT, ROWS, Side, otherSide } from './constants';
import { NEST, OUTPOST, TowerStats } from '../data/towers';
import { UnitStats } from '../data/units';
import { CARDS } from '../data/cards';
import { AI_DECK, Deck, PLAYER_DECK } from '../data/decks';
import { PlayerState, mulberry32 } from './player';

export const DEPLOY_SECONDS = 1;

interface Body {
  id: number;
  side: Side;
  x: number; // tile coordinates of the center
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  radius: number;
  flying: boolean;
  alive: boolean;
}

export interface Tower extends Body {
  kind: 'tower';
  role: 'nest' | 'outpost';
  stats: TowerStats;
  col: number; // top-left of footprint
  row: number;
  active: boolean; // the Nest sleeps until it's hit or loses an Outpost
  cooldown: number;
  targetId: number | null;
}

export interface Unit extends Body {
  kind: 'unit';
  stats: UnitStats;
  cooldown: number;
  targetId: number | null;
  path: Tile[];
  repathIn: number;
  facing: number; // radians, for rendering
  attacking: boolean;
  deploying: number; // seconds until it starts acting
  struck: boolean; // has landed its first attack
}

export type Entity = Tower | Unit;

export interface Projectile {
  id: number;
  side: Side;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetId: number;
  damage: number;
  speed: number;
  kind: 'seed' | 'spit';
}

export type WorldEvent =
  | { type: 'hit'; x: number; y: number; targetId: number }
  | { type: 'death'; x: number; y: number; side: Side; isTower: boolean }
  | { type: 'deploy'; x: number; y: number; side: Side; cardId: string };

export class World {
  readonly arena = new Arena();
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  events: WorldEvent[] = [];
  tick = 0;
  winner: Side | null = null;
  readonly players: Record<Side, PlayerState>;
  private nextId = 1;

  constructor(seed = 1, decks: Record<Side, Deck> = { player: PLAYER_DECK, enemy: AI_DECK }) {
    const rng = mulberry32(seed);
    this.players = { player: new PlayerState(decks.player, rng), enemy: new PlayerState(decks.enemy, rng) };
    for (const side of ['player', 'enemy'] as Side[]) {
      const top = side === 'enemy';
      this.addTower(side, 'nest', NEST, 7, top ? 1 : ROWS - 1 - NEST.size);
      this.addTower(side, 'outpost', OUTPOST, 2, top ? 5 : ROWS - 5 - OUTPOST.size);
      this.addTower(side, 'outpost', OUTPOST, COLS - 2 - OUTPOST.size, top ? 5 : ROWS - 5 - OUTPOST.size);
    }
  }

  // Hands the renderer everything that happened since the last call.
  drainEvents(): WorldEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get towers(): Tower[] {
    return this.entities.filter((e): e is Tower => e.kind === 'tower');
  }

  get units(): Unit[] {
    return this.entities.filter((e): e is Unit => e.kind === 'unit');
  }

  byId(id: number | null): Entity | undefined {
    return id === null ? undefined : this.entities.find((e) => e.id === id && e.alive);
  }

  private addTower(side: Side, role: Tower['role'], stats: TowerStats, col: number, row: number) {
    const id = this.nextId++;
    const x = col + stats.size / 2;
    const y = row + stats.size / 2;
    this.entities.push({
      kind: 'tower', id, side, role, stats, col, row, x, y, prevX: x, prevY: y,
      hp: stats.hp, maxHp: stats.hp, radius: stats.size / 2, flying: false, alive: true,
      active: role === 'outpost', cooldown: 0, targetId: null,
    });
    this.arena.setFootprint(id, col, row, stats.size, true);
  }

  // Deploy zone: your own half, on dry, unoccupied ground (flyers can hover over puddles).
  canDeploy(side: Side, x: number, y: number, flying: boolean): boolean {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (!this.arena.inBounds(col, row)) return false;
    const ownHalf = side === 'player' ? row >= ROWS / 2 + 1 : row <= ROWS / 2 - 2;
    if (!ownHalf) return false;
    if (this.arena.occupied[row][col] !== null) return false;
    return flying || !this.arena.isWet(col, row);
  }

  spawnUnit(side: Side, stats: UnitStats, x: number, y: number): Unit {
    const unit: Unit = {
      kind: 'unit', id: this.nextId++, side, stats, x, y, prevX: x, prevY: y,
      hp: stats.hp, maxHp: stats.hp, radius: stats.radius, flying: stats.flying, alive: true,
      cooldown: 0, targetId: null, path: [], repathIn: 0,
      facing: side === 'player' ? -Math.PI / 2 : Math.PI / 2, attacking: false,
      deploying: DEPLOY_SECONDS, struck: false,
    };
    this.entities.push(unit);
    return unit;
  }

  // Returns false (and changes nothing) if the card can't be played there right now.
  playCard(side: Side, handIndex: number, x: number, y: number): boolean {
    const player = this.players[side];
    const card = CARDS[player.hand[handIndex]];
    if (!card || player.nectar < card.cost || !this.canDeploy(side, x, y, card.unit.flying)) return false;
    player.nectar -= card.cost;
    player.cycle(handIndex);
    // Swarms land in a small ring around the drop point.
    for (let i = 0; i < card.count; i++) {
      const a = (i / card.count) * Math.PI * 2;
      const r = card.count > 1 ? 0.8 : 0;
      let ux = x + Math.cos(a) * r;
      let uy = y + Math.sin(a) * r;
      if (!card.unit.flying && !this.arena.walkable(Math.floor(ux), Math.floor(uy))) {
        ux = x;
        uy = y;
      }
      this.spawnUnit(side, card.unit, ux, uy);
    }
    this.events.push({ type: 'deploy', x, y, side, cardId: card.id });
    return true;
  }

  step() {
    if (this.winner) return;
    this.players.player.refill(DT);
    this.players.enemy.refill(DT);
    this.tick++;
    for (const e of this.entities) {
      e.prevX = e.x;
      e.prevY = e.y;
    }
    for (const p of this.projectiles) {
      p.prevX = p.x;
      p.prevY = p.y;
    }
    for (const t of this.towers) if (t.alive) this.stepTower(t);
    for (const u of this.units) if (u.alive) this.stepUnit(u);
    this.separate();
    this.stepProjectiles();
    this.reap();
  }

  // Edge-to-edge distance between two bodies.
  gap(a: Body, b: Body): number {
    return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
  }

  private canHit(rule: UnitStats['targets'] | 'tower', target: Entity): boolean {
    if (rule === 'tower' || rule === 'both') return true;
    if (rule === 'buildings') return target.kind === 'tower';
    if (rule === 'air') return target.flying;
    return !target.flying;
  }

  private stepTower(t: Tower) {
    t.cooldown = Math.max(0, t.cooldown - DT);
    if (!t.active) return;
    let target = this.byId(t.targetId);
    if (!target || this.gap(t, target) > t.stats.range) {
      target = this.nearestEnemy(t, t.stats.range, (e) => e.kind === 'unit');
      t.targetId = target?.id ?? null;
    }
    if (target && t.cooldown === 0) {
      this.fire(t.side, t.x, t.y, target.id, t.stats.damage, t.stats.projectileSpeed, 'seed');
      t.cooldown = t.stats.hitSpeed;
    }
  }

  private nearestEnemy(from: Body, maxGap: number, filter: (e: Entity) => boolean): Entity | undefined {
    let best: Entity | undefined;
    let bestGap = maxGap;
    for (const e of this.entities) {
      if (!e.alive || e.side === from.side || !filter(e)) continue;
      const d = this.gap(from, e);
      if (d <= bestGap) {
        best = e;
        bestGap = d;
      }
    }
    return best;
  }

  private stepUnit(u: Unit) {
    if (u.deploying > 0) {
      u.deploying -= DT;
      return;
    }
    u.cooldown = Math.max(0, u.cooldown - DT);
    const s = u.stats;
    const hittable = (e: Entity) => this.canHit(s.targets, e);

    // Retarget: anything hittable in sight beats marching on a tower.
    let target = this.byId(u.targetId);
    const inSight =
      (s.prefersAir ? this.nearestEnemy(u, s.sight, (e) => e.kind === 'unit' && e.flying) : undefined) ??
      this.nearestEnemy(u, s.sight, (e) => hittable(e) && (s.targets === 'buildings' || e.kind === 'unit'));
    if (!target || (target.kind === 'tower' && inSight) || this.gap(u, target) > s.sight + 2) {
      target = inSight ?? this.nearestEnemyTower(u);
    }
    if (target?.id !== u.targetId) {
      u.targetId = target?.id ?? null;
      u.repathIn = 0;
    }
    if (!target) {
      u.attacking = false;
      return;
    }

    if (this.gap(u, target) <= s.range) {
      u.attacking = true;
      u.facing = Math.atan2(target.y - u.y, target.x - u.x);
      if (u.cooldown === 0) {
        const dmg = s.damage * (!u.struck && s.firstStrikeMult ? s.firstStrikeMult : 1);
        u.struck = true;
        if (s.range > 1) this.fire(u.side, u.x, u.y, target.id, dmg, 10, 'spit');
        else this.damage(target, dmg);
        u.cooldown = s.hitSpeed;
      }
      return;
    }
    u.attacking = false;
    this.moveToward(u, target);
  }

  private nearestEnemyTower(u: Unit): Tower | undefined {
    let best: Tower | undefined;
    let bestD = Infinity;
    for (const t of this.towers) {
      if (!t.alive || t.side === u.side) continue;
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  private moveToward(u: Unit, target: Entity) {
    let gx = target.x;
    let gy = target.y;
    if (!u.flying) {
      u.repathIn -= DT;
      if (u.repathIn <= 0 || u.path.length === 0) {
        const goal = { col: Math.floor(target.x), row: Math.floor(target.y) };
        const occupant = target.kind === 'tower' ? target.id : null;
        u.path = this.arena.findPath({ col: Math.floor(u.x), row: Math.floor(u.y) }, goal, occupant) ?? [];
        u.path.shift(); // drop the tile we're standing on
        u.repathIn = 1;
      }
      while (u.path.length && Math.hypot(u.path[0].col + 0.5 - u.x, u.path[0].row + 0.5 - u.y) < 0.2) {
        u.path.shift();
      }
      if (u.path.length) {
        gx = u.path[0].col + 0.5;
        gy = u.path[0].row + 0.5;
      }
    }
    const dx = gx - u.x;
    const dy = gy - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;
    const stepLen = Math.min(dist, u.stats.speed * DT);
    u.x += (dx / dist) * stepLen;
    u.y += (dy / dist) * stepLen;
    u.facing = Math.atan2(dy, dx);
  }

  // Light push-apart so crowds don't stack on one point. Ground units never get
  // pushed into puddles or towers.
  private separate() {
    const units = this.units.filter((u) => u.alive);
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];
        if (a.flying !== b.flying) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = a.radius + b.radius - d;
        if (overlap <= 0) continue;
        const push = Math.min(overlap / 2, 0.05);
        this.nudge(a, (-dx / d) * push, (-dy / d) * push);
        this.nudge(b, (dx / d) * push, (dy / d) * push);
      }
    }
  }

  private nudge(u: Unit, dx: number, dy: number) {
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (u.flying || this.arena.walkable(Math.floor(nx), Math.floor(ny))) {
      u.x = Math.min(COLS - 0.01, Math.max(0.01, nx));
      u.y = Math.min(ROWS - 0.01, Math.max(0.01, ny));
    }
  }

  private fire(side: Side, x: number, y: number, targetId: number, damage: number, speed: number, kind: Projectile['kind']) {
    this.projectiles.push({ id: this.nextId++, side, x, y, prevX: x, prevY: y, targetId, damage, speed, kind });
  }

  private stepProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = this.byId(p.targetId);
      if (!target) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      const stepLen = p.speed * DT;
      if (d <= stepLen + target.radius * 0.5) {
        this.damage(target, p.damage);
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / d) * stepLen;
        p.y += (dy / d) * stepLen;
      }
    }
  }

  private damage(target: Entity, amount: number) {
    target.hp -= amount;
    this.events.push({ type: 'hit', x: target.x, y: target.y, targetId: target.id });
    if (target.kind === 'tower' && target.role === 'nest') target.active = true;
  }

  private reap() {
    for (const e of this.entities) {
      if (!e.alive || e.hp > 0) continue;
      e.alive = false;
      this.events.push({ type: 'death', x: e.x, y: e.y, side: e.side, isTower: e.kind === 'tower' });
      if (e.kind === 'tower') {
        this.arena.setFootprint(e.id, e.col, e.row, e.stats.size, false);
        if (e.role === 'nest') {
          this.winner = otherSide(e.side);
        } else {
          for (const t of this.towers) if (t.side === e.side && t.role === 'nest') t.active = true;
        }
      }
    }
    // Keep dead towers (for rubble), drop dead units.
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.alive && e.kind === 'unit') this.entities.splice(i, 1);
    }
  }
}
