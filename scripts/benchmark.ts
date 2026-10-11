// Each card dropped alone at the near end of the left crossing against an
// undefended enemy side: how much Outpost health does it take before it dies?
// `npx vite-node scripts/benchmark.ts`
import { CARDS } from '../src/data/cards';
import { World } from '../src/sim/world';

const rows: string[] = [];
for (const card of Object.values(CARDS)) {
  const w = new World(1);
  w.players.player.hand[0] = card.id;
  w.players.player.nectar = 16;
  w.playCard('player', 0, 3.5, 19);
  const enemy = w.towers.filter((t) => t.side === 'enemy');
  const start = enemy.reduce((s, t) => s + t.hp, 0);
  let t = 0;
  while (w.units.some((u) => u.side === 'player') && t < 20 * 90) {
    w.step();
    t++;
  }
  const dealt = start - enemy.reduce((s, x) => s + Math.max(0, x.hp), 0);
  const outpost = enemy.find((x) => x.role === 'outpost' && x.x < 9)!;
  const hits = Math.round(dealt / card.unit.damage);
  rows.push(
    `${card.name.padEnd(18)} ${String(card.cost).padStart(2)}  dealt ${String(Math.round(dealt)).padStart(5)}` +
    `  (${Math.round((dealt / outpost.maxHp) * 100)}% of an Outpost, ~${hits} hits)` +
    `${w.units.length ? '  SURVIVED' : ''}`,
  );
}
console.log(rows.join('\n'));
