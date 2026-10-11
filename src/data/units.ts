// Unit stat blocks. Speeds are tiles per second, ranges in tiles past the
// attacker's and target's edges, hit speed in seconds per attack.

export type TargetRule = 'ground' | 'air' | 'both' | 'buildings';

export interface UnitStats {
  id: string; // also the sprite key
  name: string;
  hp: number;
  damage: number;
  hitSpeed: number;
  range: number;
  speed: number;
  sight: number;
  radius: number;
  mass: number; // heavier bugs shove lighter ones aside
  flying: boolean;
  targets: TargetRule;
  prefersAir?: boolean; // picks flyers over closer ground targets
  firstStrikeMult?: number; // multiplier on the first attack
  splashRadius?: number; // area damage around the target, in tiles
}

export const SPEED = { slow: 0.75, medium: 1.0, fast: 1.33, veryFast: 1.67 } as const;
export const MELEE = 0.3;

// Stand-in units for the arena prototype.
export const TEST_UNITS: Record<string, UnitStats> = {
  beetle: {
    id: 'beetle', name: 'Test Beetle', hp: 700, damage: 90, hitSpeed: 1.2, range: MELEE,
    speed: SPEED.medium, sight: 5.5, radius: 0.45, mass: 4, flying: false, targets: 'ground',
  },
  wasp: {
    id: 'wasp', name: 'Test Wasp', hp: 320, damage: 60, hitSpeed: 1.0, range: MELEE,
    speed: SPEED.fast, sight: 5.5, radius: 0.4, mass: 3, flying: true, targets: 'both',
  },
};
