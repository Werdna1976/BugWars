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

export const NEST: TowerStats = {
  name: 'Nest',
  size: 4,
  hp: 4000,
  damage: 110,
  hitSpeed: 1.0,
  range: 7,
  projectileSpeed: 14,
};

export const OUTPOST: TowerStats = {
  name: 'Outpost',
  size: 3,
  hp: 2500,
  damage: 100, // Archer Ant baseline from the design doc
  hitSpeed: 0.8,
  range: 7.5,
  projectileSpeed: 16,
};
