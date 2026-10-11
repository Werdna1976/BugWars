import { Arena, Tile } from './arena';
import { COLS, DT, ROWS, Side, otherSide } from './constants';
import { NEST, NEST_WAKES_ON_OUTPOST_LOSS, OUTPOST, OUTPOST_ROW, POCKET_DEPTH, TowerStats } from '../data/towers';
import { TargetRule, UnitStats } from '../data/units';
import { CARDS } from '../data/cards';
import { AI_DECK, Deck, PLAYER_DECK } from '../data/decks';
import { PlayerState, mulberry32 } from './player';

export const DEPLOY_SECONDS = 1;
// How far a locked target may drift past attack range before the attacker gives up on it.
const LOCK_SLACK = 0.5;
// Collision: relaxation passes per step, largest correction per pair per pass, and how
// much heavier a bug counts while it stands its ground to attack.
const SEPARATION_PASSES = 3;
const MAX_PUSH = 0.12;
const PLANTED_MASS = 2.5;
const SWARM_SQUEEZE = 0.6;

export const MATCH = {
  regulation: 180, // seconds
  doubleNectarAt: 60, // seconds left when refill doubles
  overtime: 60, // sudden death: first tower down wins
} as const;

export type Phase = 'regulation' | 'overtime' | 'over';
export type Result = Side | 'draw';

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
  kind: 'seed' | 'spit' | 'spray';
  splash?: { radius: number; rule: TargetRule }; // area damage around the impact
}

export type WorldEvent =
  | { type: 'hit'; x: number; y: number; targetId: number }
  | { type: 'death'; x: number; y: number; side: Side; isTower: boolean }
  | { type: 'deploy'; x: number; y: number; side: Side; cardId: string }
  | { type: 'blast'; x: number; y: number; radius: number };

export class World {
  readonly arena = new Arena();
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  events: WorldEvent[] = [];
  tick = 0;
  winner: Result | null = null;
  phase: Phase = 'regulation';
  timeLeft: number = MATCH.regulation;
  readonly rng: () => number;
  readonly players: Record<Side, PlayerState>;
  private nextId = 1;

  constructor(seed = 1, decks: Record<Side, Deck> = { player: PLAYER_DECK, enemy: AI_DECK }) {
    const rng = mulberry32(seed);
    this.rng = rng;
    this.players = { player: new PlayerState(decks.player, rng), enemy: new PlayerState(decks.enemy, rng) };
    for (const side of ['player', 'enemy'] as Side[]) {
      const top = side === 'enemy';
      this.addTower(side, 'nest', NEST, 7, top ? 1 : ROWS - 1 - NEST.size);
      this.addTower(side, 'outpost', OUTPOST, 2, top ? OUTPOST_ROW : ROWS - OUTPOST_ROW - OUTPOST.size);
      this.addTower(side, 'outpost', OUTPOST, COLS - 2 - OUTPOST.size, top ? OUTPOST_ROW : ROWS - OUTPOST_ROW - OUTPOST.size);
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

  // The tiles a side may deploy on, ignoring what's standing there: its own half,
  // plus a pocket on the enemy half behind each enemy Outpost it has knocked down.
  inDeployZone(side: Side, col: number, row: number): boolean {
    if (!this.arena.inBounds(col, row)) return false;
    const ownHalf = side === 'player' ? row >= ROWS / 2 + 1 : row <= ROWS / 2 - 2;
    if (ownHalf) return true;
    const depth = side === 'player' ? row : ROWS - 1 - row; // rows from the enemy's back wall
    if (depth < POCKET_DEPTH) return false;
    return this.towers.some(
      (t) => t.side !== side && t.role === 'outpost' && !t.alive && (t.x < COLS / 2) === (col < COLS / 2),
    );
  }

  // Deploy zone, on dry, unoccupied ground (flyers can hover over puddles).
  canDeploy(side: Side, x: number, y: number, flying: boolean): boolean {
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (!this.inDeployZone(side, col, row)) return false;
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
      // A squad packs tightly so it covers about as much ground as one bug.
      const r = card.count > 1 ? card.unit.radius * 2.2 : 0;
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
    const rate = this.doubleNectar ? 2 : 1;
    this.players.player.refill(DT, rate);
    this.players.enemy.refill(DT, rate);
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
    this.stepClock();
  }

  get doubleNectar(): boolean {
    return this.phase === 'overtime' || this.timeLeft <= MATCH.doubleNectarAt;
  }

  // Towers knocked down by each side (a Nest counts as all three).
  crowns(side: Side): number {
    const theirs = this.towers.filter((t) => t.side !== side);
    if (theirs.some((t) => t.role === 'nest' && !t.alive)) return 3;
    return theirs.filter((t) => !t.alive).length;
  }

  private stepClock() {
    if (this.winner) return;
    const lead = this.crowns('player') - this.crowns('enemy');
    if (this.phase === 'overtime' && lead !== 0) {
      this.finish(lead > 0 ? 'player' : 'enemy');
      return;
    }
    this.timeLeft = Math.max(0, this.timeLeft - DT);
    if (this.timeLeft > 0) return;
    if (lead !== 0) {
      this.finish(lead > 0 ? 'player' : 'enemy');
    } else if (this.phase === 'regulation') {
      this.phase = 'overtime';
      this.timeLeft = MATCH.overtime;
      for (const t of this.towers) if (t.role === 'nest') t.active = true;
    } else {
      // Still level after overtime: the side whose weakest tower is healthier wins.
      const weakest = (side: Side) => Math.min(...this.towers.filter((t) => t.side === side && t.alive).map((t) => t.hp / t.maxHp));
      const p = weakest('player');
      const e = weakest('enemy');
      this.finish(p === e ? 'draw' : p > e ? 'player' : 'enemy');
    }
  }

  private finish(result: Result) {
    this.winner = result;
    this.phase = 'over';
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

    // Target lock: once a bug is hitting something it sticks with it until the
    // target dies or moves out of reach. While still walking, anything hittable
    // in sight beats marching on a tower.
    let target = this.byId(u.targetId);
    const locked = !!target && u.attacking && this.gap(u, target) <= s.range + LOCK_SLACK;
    if (!locked) {
      const inSight =
        (s.prefersAir ? this.nearestEnemy(u, s.sight, (e) => e.kind === 'unit' && e.flying) : undefined) ??
        this.nearestEnemy(u, s.sight, (e) => hittable(e) && (s.targets === 'buildings' || e.kind === 'unit'));
      if (!target || (target.kind === 'tower' && inSight) || this.gap(u, target) > s.sight + 2) {
        target = inSight ?? this.nearestEnemyTower(u);
      }
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
        const splash = s.splashRadius ? { radius: s.splashRadius, rule: s.targets } : undefined;
        if (s.range > 1) this.fire(u.side, u.x, u.y, target.id, dmg, 10, splash ? 'spray' : 'spit', splash);
        else if (splash) this.blast(u.side, target.x, target.y, dmg, splash);
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
    let dx = gx - u.x;
    let dy = gy - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;
    dx /= dist;
    dy /= dist;
    [dx, dy] = this.steer(u, dx, dy, target);
    const stepLen = Math.min(dist, u.stats.speed * DT);
    this.nudge(u, dx * stepLen, dy * stepLen);
    u.facing = Math.atan2(dy, dx);
  }

  // Veer around a bug standing in the way, toward whichever side is already
  // clearer. Big bugs barely veer: they'd rather shove.
  private steer(u: Unit, dx: number, dy: number, target: Entity): [number, number] {
    let worst: Unit | undefined;
    let worstAhead = Infinity;
    let side = 0;
    for (const o of this.units) {
      if (o === u || !o.alive || o.flying !== u.flying || o.id === target.id) continue;
      if (o.stats.id === u.stats.id && u.stats.mass < 2) continue; // squadmates just squeeze past
      const ox = o.x - u.x;
      const oy = o.y - u.y;
      const ahead = ox * dx + oy * dy;
      const lateral = ox * -dy + oy * dx;
      const reach = u.radius + o.radius;
      if (ahead <= 0 || ahead > reach + 0.35 || Math.abs(lateral) >= reach) continue;
      if (ahead < worstAhead) {
        worst = o;
        worstAhead = ahead;
        side = Math.abs(lateral) < 0.02 ? (u.id % 2 ? 1 : -1) : -Math.sign(lateral);
      }
    }
    if (!worst) return [dx, dy];
    const yielding = worst.stats.mass / (worst.stats.mass + u.stats.mass); // 0..1, high when the blocker is heavy
    const angle = side * (0.35 + 0.75 * yielding);
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    return [dx * c - dy * sn, dx * sn + dy * c];
  }

  // Bodies can't overlap. Each step, overlapping pairs on the same layer (ground
  // or air, either side) are pushed apart, the lighter bug giving way more. A
  // bug that has planted its feet to attack counts as heavier, so a crowd piles
  // up behind a big bug instead of walking through it. Ground bugs slide along
  // puddle edges and towers rather than being pushed into them.
  private separate() {
    const units = this.units.filter((u) => u.alive);
    for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
      for (let i = 0; i < units.length; i++) {
        for (let j = i + 1; j < units.length; j++) {
          const a = units[i];
          const b = units[j];
          if (a.flying !== b.flying) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          // Swarm bugs of one kind can squeeze together a bit, so a squad moves as a pack.
          const squeeze = a.stats.id === b.stats.id && a.stats.mass < 2 ? SWARM_SQUEEZE : 1;
          const overlap = (a.radius + b.radius) * squeeze - d;
          if (overlap <= 0) continue;
          if (d < 1e-4) {
            // Exactly on top of each other: split along a fixed per-pair direction.
            const ang = (a.id * 7 + b.id * 13) % 360 * (Math.PI / 180);
            dx = Math.cos(ang);
            dy = Math.sin(ang);
            d = 1;
          }
          const ma = this.inertia(a);
          const mb = this.inertia(b);
          // Head-on shoves deflect a little sideways so nobody gets pinned in a line.
          const skew = ((a.id + b.id) % 2 ? 1 : -1) * 0.25;
          const rx = dx * Math.cos(skew) - dy * Math.sin(skew);
          const ry = dx * Math.sin(skew) + dy * Math.cos(skew);
          dx = rx;
          dy = ry;
          const push = Math.min(overlap, MAX_PUSH);
          const shareA = mb / (ma + mb);
          this.nudge(a, (-dx / d) * push * shareA, (-dy / d) * push * shareA);
          this.nudge(b, (dx / d) * push * (1 - shareA), (dy / d) * push * (1 - shareA));
        }
      }
    }
  }

  private inertia(u: Unit): number {
    const planted = u.attacking || u.deploying > 0;
    return u.stats.mass * (planted ? PLANTED_MASS : 1);
  }

  // Move a bug, sliding along walls on whichever axis is still free.
  private nudge(u: Unit, dx: number, dy: number) {
    const clampX = (x: number) => Math.min(COLS - 0.01, Math.max(0.01, x));
    const clampY = (y: number) => Math.min(ROWS - 0.01, Math.max(0.01, y));
    const ok = (x: number, y: number) => u.flying || this.arena.walkable(Math.floor(x), Math.floor(y));
    const nx = clampX(u.x + dx);
    const ny = clampY(u.y + dy);
    if (ok(nx, ny)) {
      u.x = nx;
      u.y = ny;
    } else if (ok(nx, u.y)) {
      u.x = nx;
    } else if (ok(u.x, ny)) {
      u.y = ny;
    }
  }

  private fire(
    side: Side, x: number, y: number, targetId: number, damage: number, speed: number,
    kind: Projectile['kind'], splash?: Projectile['splash'],
  ) {
    this.projectiles.push({ id: this.nextId++, side, x, y, prevX: x, prevY: y, targetId, damage, speed, kind, splash });
  }

  // Area damage: everything the attacker can hit within the radius takes full damage.
  private blast(side: Side, x: number, y: number, damage: number, splash: NonNullable<Projectile['splash']>) {
    this.events.push({ type: 'blast', x, y, radius: splash.radius });
    for (const e of this.entities) {
      if (!e.alive || e.side === side || !this.canHit(splash.rule, e)) continue;
      if (Math.hypot(e.x - x, e.y - y) - e.radius <= splash.radius) this.damage(e, damage);
    }
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
        if (p.splash) this.blast(p.side, target.x, target.y, p.damage, p.splash);
        else this.damage(target, p.damage);
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
          this.finish(otherSide(e.side));
        } else {
          if (NEST_WAKES_ON_OUTPOST_LOSS) for (const t of this.towers) if (t.side === e.side && t.role === 'nest') t.active = true;
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
