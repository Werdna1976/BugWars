import { describe, expect, it } from 'vitest';
import { Arena } from '../src/sim/arena';
import { CROSSINGS, PUDDLE_ROWS } from '../src/sim/constants';
import { World } from '../src/sim/world';
import { TEST_UNITS } from '../src/data/units';

describe('arena', () => {
  it('routes ground paths through a dry crossing', () => {
    const arena = new Arena();
    const path = arena.findPath({ col: 9, row: 20 }, { col: 9, row: 11 })!;
    expect(path).not.toBeNull();
    for (const t of path) expect(arena.isWet(t.col, t.row)).toBe(false);
    const crossing = path.find((t) => t.row === PUDDLE_ROWS[0])!;
    expect(CROSSINGS.some((c) => crossing.col >= c.fromCol && crossing.col <= c.toCol)).toBe(true);
  });
});

describe('world', () => {
  it('starts with a Nest and two Outposts per side, Nests asleep', () => {
    const w = new World();
    expect(w.towers).toHaveLength(6);
    expect(w.towers.filter((t) => t.role === 'nest' && t.active)).toHaveLength(0);
  });

  it('a ground bug crosses the puddles and damages an enemy Outpost', () => {
    const w = new World();
    const bug = w.spawnUnit('player', { ...TEST_UNITS.beetle, hp: 100000 }, 9, 22);
    const outposts = w.towers.filter((t) => t.side === 'enemy' && t.role === 'outpost');
    for (let i = 0; i < 20 * 60 && outposts.every((t) => t.hp === t.maxHp); i++) {
      w.step();
      const col = Math.floor(bug.x);
      const row = Math.floor(bug.y);
      expect(w.arena.isWet(col, row)).toBe(false);
    }
    expect(outposts.some((t) => t.hp < t.maxHp)).toBe(true);
  });

  it('a flyer goes straight over the puddles', () => {
    const w = new World();
    const wasp = w.spawnUnit('player', { ...TEST_UNITS.wasp, hp: 100000 }, 9, 22);
    let overWater = false;
    for (let i = 0; i < 20 * 20; i++) {
      w.step();
      if (w.arena.isWet(Math.floor(wasp.x), Math.floor(wasp.y))) overWater = true;
    }
    expect(overWater).toBe(true);
  });

  it('Outposts shoot down an unprotected bug', () => {
    const w = new World();
    const bug = w.spawnUnit('enemy', TEST_UNITS.beetle, 3.5, 12);
    for (let i = 0; i < 20 * 60 && bug.alive; i++) w.step();
    expect(bug.alive).toBe(false);
  });

  it('destroying a Nest ends the match', () => {
    const w = new World();
    const nest = w.towers.find((t) => t.side === 'enemy' && t.role === 'nest')!;
    nest.hp = 1;
    w.spawnUnit('player', { ...TEST_UNITS.wasp, hp: 100000 }, 9, 7);
    for (let i = 0; i < 20 * 30 && !w.winner; i++) w.step();
    expect(w.winner).toBe('player');
  });
});
