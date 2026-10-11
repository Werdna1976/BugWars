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
  hp: 2400,
  damage: 70,
  hitSpeed: 1.0,
  range: 7,
  projectileSpeed: 14,
};

export const OUTPOST: TowerStats = {
  name: 'Outpost',
  size: 3,
  hp: 1400,
  damage: 50,
  hitSpeed: 0.8,
  range: 7.5,
  projectileSpeed: 16,
};
