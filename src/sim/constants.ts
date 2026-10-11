// Arena geometry and simulation timing. All distances are in tiles.

export const COLS = 18;
export const ROWS = 32;

export const TICK_RATE = 20; // simulation ticks per second
export const DT = 1 / TICK_RATE;

// Player owns the bottom half (rows 16-31), the AI owns the top half (rows 0-15).
export type Side = 'player' | 'enemy';

export const PUDDLE_ROWS = [15, 16];

// Dry gaps through the puddle line, lined up with each side's Outposts.
export const CROSSINGS: ReadonlyArray<{ fromCol: number; toCol: number }> = [
  { fromCol: 2, toCol: 4 },
  { fromCol: 13, toCol: 15 },
];

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}
