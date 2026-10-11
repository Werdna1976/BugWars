// First-pass tower stats. Ranges in tiles, hit speed in seconds per attack.

export interface TowerStats {
  name: string;
  size: number; // footprint in tiles (square)
  hp: number;
  damage: number;
  hitSpeed: number;
  range: number;
  projectileSpeed: number; // tiles per second
}

// Rows between the back wall and each Outpost. Larger = further from the puddles.
export const OUTPOST_ROW = 3;

// The Nest sleeps until it takes damage, one of its Outposts falls (the Clash
// Royale rule), or overtime starts.
export const NEST_WAKES_ON_OUTPOST_LOSS = true;

// Knocking down an Outpost lets the winner deploy on that side of the enemy
// half, down to this many rows from the enemy's back wall.
export const POCKET_DEPTH = OUTPOST_ROW + 1;

export const NEST: TowerStats = {
  name: 'Nest',
  size: 4,
  hp: 3200,
  damage: 90,
  hitSpeed: 1.0,
  range: 6.5,
  projectileSpeed: 14,
};

export const OUTPOST: TowerStats = {
  name: 'Outpost',
  size: 3,
  hp: 2000,
  damage: 100,
  hitSpeed: 1.0,
  range: 5.5,
  projectileSpeed: 16,
};
