// Headless AI-vs-AI matches: `npx vite-node scripts/simulate.ts [matches]`
import { SimpleAi } from '../src/sim/ai';
import { World } from '../src/sim/world';

const n = Number(process.argv[2] ?? 50);
const tally: Record<string, number> = { player: 0, enemy: 0, draw: 0 };
let crowns = 0;
let overtime = 0;
let seconds = 0;
for (let seed = 1; seed <= n; seed++) {
  const w = new World(seed);
  const a = new SimpleAi(w, 'player');
  const b = new SimpleAi(w, 'enemy');
  let wentOver = false;
  while (!w.winner) {
    a.step();
    b.step();
    w.step();
    if (w.phase === 'overtime') wentOver = true;
  }
  tally[w.winner]++;
  crowns += w.crowns('player') + w.crowns('enemy');
  overtime += wentOver ? 1 : 0;
  seconds += w.tick / 20;
}
console.log(`${n} matches  Beetle Rush ${tally.player}  Sky Sting ${tally.enemy}  draws ${tally.draw}`);
console.log(`avg crowns/match ${(crowns / n).toFixed(2)}  overtime ${overtime}  avg length ${(seconds / n).toFixed(0)}s`);
