import { CARDS, CardDef } from '../data/cards';
import { COLS, DT, ROWS, Side, otherSide } from './constants';
import { NECTAR } from './player';
import { Unit, World } from './world';

const LANE_X = [3.5, COLS - 3.5];
const THINK_SECONDS = 0.5;

// A rule-based opponent. Every half second it looks at the board and either
// answers a threat in its half, builds a push in the weaker enemy lane, or
// dumps a card to avoid wasting Nectar. Works for either side.
export class SimpleAi {
  private think = 1.5; // grace period at match start
  private push: { lane: number; until: number } | null = null;

  constructor(private world: World, readonly side: Side = 'enemy') {}

  step() {
    this.think -= DT;
    if (this.think > 0 || this.world.winner) return;
    this.think = THINK_SECONDS;
    if (this.defend()) return;
    if (this.attack()) return;
    this.avoidWaste();
  }

  // Distance from this side's back edge, converted to a world y.
  private y(depth: number): number {
    return this.side === 'enemy' ? depth : ROWS - depth;
  }

  // How far a body has come toward this side's back edge (0 = at our back wall).
  private depthOf(y: number): number {
    return this.side === 'enemy' ? y : ROWS - y;
  }

  private laneOf(x: number): number {
    return x < COLS / 2 ? 0 : 1;
  }

  private hand(): { i: number; card: CardDef }[] {
    const me = this.world.players[this.side];
    return me.hand.map((id, i) => ({ i, card: CARDS[id] }));
  }

  private affordable() {
    const nectar = this.world.players[this.side].nectar;
    return this.hand().filter((h) => h.card.cost <= nectar);
  }

  private play(i: number, x: number, y: number): boolean {
    // Nudge the drop point around until it lands on legal ground.
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1], [-1.5, 1], [0, 2], [0, -2]]) {
      if (this.world.playCard(this.side, i, x + dx, y + dy)) return true;
    }
    return false;
  }

  private defend(): boolean {
    const foes = this.world.units.filter(
      (u) => u.side !== this.side && u.deploying <= 0 && this.depthOf(u.y) < ROWS / 2,
    );
    if (!foes.length) return false;

    // Focus on the lane with the most incoming health.
    const pressure = [0, 0];
    for (const u of foes) pressure[this.laneOf(u.x)] += u.hp;
    const lane = pressure[0] >= pressure[1] ? 0 : 1;
    const threats = foes.filter((u) => this.laneOf(u.x) === lane);
    const threatHp = threats.reduce((s, u) => s + u.hp, 0);

    const defenders = this.world.units.filter(
      (u) => u.side === this.side && this.laneOf(u.x) === lane && u.stats.targets !== 'buildings'
        && Math.abs(this.depthOf(u.y) - this.depthOf(threats[0].y)) < 8,
    );
    const defenseHp = defenders.reduce((s, u) => s + u.hp, 0);
    const flyers = threats.some((u) => u.flying);
    const airCovered = defenders.some((u) => u.stats.targets === 'both' || u.stats.targets === 'air');
    if (defenseHp >= threatHp * 0.5 && (!flyers || airCovered)) return false;
    // Small stuff is the tower's job; save Nectar for a counter-push.
    if (threatHp < 450 && !defenders.length) return false;

    let options = this.affordable().filter((h) => h.card.unit.targets !== 'buildings');
    if (flyers && !airCovered) options = options.filter((h) => h.card.unit.targets !== 'ground');
    if (!options.length) return false;

    // Best damage per Nectar, with a nudge toward bigger cards against big threats.
    const score = (c: CardDef) => {
      const dps = (c.unit.damage / c.unit.hitSpeed) * c.count;
      const bulk = c.unit.hp * c.count;
      return dps / c.cost + (threatHp > 1500 ? bulk / 400 / c.cost : 0);
    };
    options.sort((a, b) => score(b.card) - score(a.card));
    const pick = options[0];

    // Drop it between the lead threat and our tower; shooters stand further back.
    const lead = threats.reduce((a, b) => (this.depthOf(a.y) < this.depthOf(b.y) ? a : b));
    const back = pick.card.unit.range > 1 ? 4 : 2;
    const depth = Math.max(2, Math.min(ROWS / 2 - 2, this.depthOf(lead.y) - back));
    return this.play(pick.i, lead.x, this.y(depth));
  }

  private attack(): boolean {
    const me = this.world.players[this.side];
    const now = this.world.tick * DT;
    if (this.push && now > this.push.until) this.push = null;

    // Follow up an active push with support behind the tank.
    if (this.push) {
      const support = this.affordable()
        .filter((h) => !h.card.keywords.includes('Tank'))
        .sort((a, b) => b.card.cost - a.card.cost)[0];
      if (support && me.nectar >= support.card.cost + 1) {
        const tank = this.leadAttacker(this.push.lane);
        const x = tank ? tank.x : LANE_X[this.push.lane];
        const depth = tank ? Math.max(3, this.depthOf(tank.y) - 2.5) : ROWS / 2 - 3;
        return this.play(support.i, x, this.y(Math.min(depth, ROWS / 2 - 2)));
      }
      return false;
    }

    if (me.nectar < 14) return false;
    const lane = this.weakerEnemyLane();
    const tank = this.affordable()
      .filter((h) => h.card.keywords.includes('Tank'))
      .sort((a, b) => b.card.cost - a.card.cost)[0];
    const pick = tank ?? this.affordable().sort((a, b) => b.card.cost - a.card.cost)[0];
    if (!pick) return false;
    // Tanks start a little back so support can catch up; others go near the crossing.
    // With an enemy Outpost down, drop straight into the pocket past the puddles.
    const pocketDepth = ROWS / 2 + 3;
    const pocket = this.world.inDeployZone(this.side, Math.floor(LANE_X[lane]), Math.floor(this.y(pocketDepth)));
    const depth = pocket ? pocketDepth : tank ? ROWS / 2 - 5 : ROWS / 2 - 3;
    if (!this.play(pick.i, LANE_X[lane] + (this.world.rng() - 0.5), this.y(depth))) return false;
    this.push = { lane, until: now + 10 };
    return true;
  }

  private leadAttacker(lane: number): Unit | undefined {
    return this.world.units
      .filter((u) => u.side === this.side && this.laneOf(u.x) === lane)
      .sort((a, b) => b.hp - a.hp)[0];
  }

  // Lane whose enemy Outpost is lower (a fallen Outpost opens that lane to the Nest).
  private weakerEnemyLane(): number {
    const outposts = this.world.towers.filter((t) => t.side === otherSide(this.side) && t.role === 'outpost');
    const hp = [0, 1].map((lane) => {
      const t = outposts.find((o) => this.laneOf(o.x) === lane);
      return t && t.alive ? t.hp : -1;
    });
    if (hp[0] === hp[1]) return this.world.rng() < 0.5 ? 0 : 1;
    return hp[0] < hp[1] ? 0 : 1;
  }

  private avoidWaste() {
    const me = this.world.players[this.side];
    if (me.nectar < NECTAR.cap - 0.5) return;
    const cheapest = this.affordable().sort((a, b) => a.card.cost - b.card.cost)[0];
    if (cheapest) this.play(cheapest.i, LANE_X[this.weakerEnemyLane()], this.y(6));
  }
}
