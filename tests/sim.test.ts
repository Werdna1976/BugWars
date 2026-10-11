import { describe, expect, it } from 'vitest';
import { Arena } from '../src/sim/arena';
import { CROSSINGS, PUDDLE_ROWS } from '../src/sim/constants';
import { World } from '../src/sim/world';
import { TEST_UNITS } from '../src/data/units';
import { AI_DECK, PLAYER_DECK, validateDeck } from '../src/data/decks';
import { CARDS } from '../src/data/cards';
import { NECTAR } from '../src/sim/player';

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

describe('decks and cards', () => {
  it('both preset decks follow the 10-card, max-3-duplicates rule', () => {
    expect(validateDeck(PLAYER_DECK)).toEqual([]);
    expect(validateDeck(AI_DECK)).toEqual([]);
    expect(validateDeck({ name: 'bad', cards: ['pillbug', 'pillbug', 'pillbug', 'rhino', 'goliath', 'hornet', 'bolas', 'spitter', 'mantis', 'dragonfly'] })).not.toEqual([]);
  });

  it('playing a card spends Nectar, spawns its bugs and cycles the hand', () => {
    const w = new World(42);
    const me = w.players.player;
    const i = me.hand.findIndex((id) => CARDS[id].cost <= NECTAR.start);
    const card = CARDS[me.hand[i]];
    const next = me.queue[0];
    expect(w.playCard('player', i, 9, 24)).toBe(true);
    expect(me.nectar).toBe(NECTAR.start - card.cost);
    expect(w.units.filter((u) => u.side === 'player')).toHaveLength(card.count);
    expect(me.hand[i]).toBe(next);
    expect(me.queue[me.queue.length - 1]).toBe(card.id);
  });

  it('refuses cards you cannot afford or drops on the enemy half', () => {
    const w = new World(7);
    w.players.player.nectar = 0;
    expect(w.playCard('player', 0, 9, 24)).toBe(false);
    w.players.player.nectar = 16;
    expect(w.playCard('player', 0, 9, 8)).toBe(false);
  });

  it('Nectar refills at 1 per 1.4s up to the cap', () => {
    const w = new World(3);
    w.players.player.nectar = 0;
    for (let i = 0; i < 28; i++) w.step();
    expect(w.players.player.nectar).toBeCloseTo(1, 5);
    for (let i = 0; i < 20 * 60; i++) w.step();
    expect(w.players.player.nectar).toBe(NECTAR.cap);
  });

  it('Dragonfly goes after a flyer before a closer ground bug', () => {
    const w = new World(5);
    const df = w.spawnUnit('player', CARDS.dragonfly.unit, 9, 22);
    w.spawnUnit('enemy', { ...CARDS.pillbug.unit, speed: 0 }, 9, 20.5);
    const hornet = w.spawnUnit('enemy', { ...CARDS.hornet.unit, speed: 0 }, 11.5, 24);
    for (let i = 0; i < 40; i++) w.step();
    expect(df.targetId).toBe(hornet.id);
  });
});
