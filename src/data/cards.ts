import { MELEE, SPEED, UnitStats } from './units';

// Keywords shown as chips on the card tooltip. Each has a one-line explanation.
export const KEYWORDS = {
  Tank: 'Lots of health. Soaks tower and troop fire for the bugs behind it.',
  Swarm: 'Several small bodies. Fragile alone, deadly in a group.',
  Melee: 'Has to walk right up to its target.',
  Ranged: 'Attacks from a distance.',
  Flying: 'Flies over puddles. Only bugs that hit air can fight it.',
  'Hits air': 'Can attack flying bugs as well as ground ones.',
  'Ground only': 'Can\'t attack flying bugs.',
  'Buildings only': 'Ignores bugs and marches straight for towers.',
  'Air first': 'Goes after flying bugs before anything else.',
  Ambush: 'Its first strike deals triple damage.',
} as const;

export type Keyword = keyof typeof KEYWORDS;

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  count: number; // bugs spawned per card
  unit: UnitStats;
  keywords: Keyword[];
  blurb: string;
  // Abilities from the design doc that arrive with status effects in step 4.
  comingLater?: string;
}

const RANGE = { melee: MELEE, short: 3, mid: 5 };

function unit(id: string, name: string, s: Omit<UnitStats, 'id' | 'name' | 'sight'> & { sight?: number }): UnitStats {
  return { id, name, sight: 5.5, ...s };
}

export const CARDS: Record<string, CardDef> = {
  pillbug: {
    id: 'pillbug', name: 'Pillbug', cost: 4, count: 1,
    unit: unit('pillbug', 'Pillbug', { hp: 1000, damage: 70, hitSpeed: 1.2, range: RANGE.melee, speed: SPEED.medium, radius: 0.45, flying: false, targets: 'ground' }),
    keywords: ['Tank', 'Melee', 'Ground only'],
    blurb: 'Small, cheap tank. Drop it in front of a push to soak tower shots.',
    comingLater: 'Shell armor and the curl-and-roll.',
  },
  rhino: {
    id: 'rhino', name: 'Rhinoceros Beetle', cost: 9, count: 1,
    unit: unit('rhino', 'Rhinoceros Beetle', { hp: 1900, damage: 230, hitSpeed: 1.4, range: RANGE.melee, speed: SPEED.fast, radius: 0.55, flying: false, targets: 'ground' }),
    keywords: ['Tank', 'Melee', 'Ground only'],
    blurb: 'Fast for its size and hits hard.',
    comingLater: 'Charge and horn flip.',
  },
  goliath: {
    id: 'goliath', name: 'Goliath Beetle', cost: 14, count: 1,
    unit: unit('goliath', 'Goliath Beetle', { hp: 4400, damage: 300, hitSpeed: 2.0, range: RANGE.melee, speed: SPEED.slow, radius: 0.75, flying: false, targets: 'ground' }),
    keywords: ['Tank', 'Melee', 'Ground only'],
    blurb: 'The heaviest bug in the garden. Huge health, slow crushing hits.',
    comingLater: 'Shell that cracks off at half health.',
  },
  fireants: {
    id: 'fireants', name: 'Fire Ant Squad', cost: 5, count: 6,
    unit: unit('fireant', 'Fire Ant', { hp: 85, damage: 32, hitSpeed: 0.8, range: RANGE.melee, speed: SPEED.fast, radius: 0.25, flying: false, targets: 'ground' }),
    keywords: ['Swarm', 'Melee', 'Ground only'],
    blurb: 'Six fast ants that swarm a single target.',
    comingLater: 'Stacking Venom.',
  },
  mantis: {
    id: 'mantis', name: 'Praying Mantis', cost: 7, count: 1,
    unit: unit('mantis', 'Praying Mantis', { hp: 1100, damage: 170, hitSpeed: 1.3, range: RANGE.melee, speed: SPEED.medium, radius: 0.5, flying: false, targets: 'both', firstStrikeMult: 3 }),
    keywords: ['Melee', 'Hits air', 'Ambush'],
    blurb: 'Snatches flyers out of the air. Opens with a triple-damage strike.',
    comingLater: 'Camouflage while waiting.',
  },
  spitter: {
    id: 'spitter', name: 'Spitting Spider', cost: 5, count: 1,
    unit: unit('spitter', 'Spitting Spider', { hp: 450, damage: 85, hitSpeed: 1.1, range: RANGE.short, speed: SPEED.medium, radius: 0.42, flying: false, targets: 'both' }),
    keywords: ['Ranged', 'Hits air'],
    blurb: 'Cheap short-range shooter that hits flyers.',
    comingLater: 'Spit roots the target for 1 second.',
  },
  assassin: {
    id: 'assassin', name: 'Assassin Bug', cost: 8, count: 1,
    unit: unit('assassin', 'Assassin Bug', { hp: 650, damage: 260, hitSpeed: 1.5, range: RANGE.short, speed: SPEED.medium, radius: 0.45, flying: false, targets: 'both' }),
    keywords: ['Ranged', 'Hits air'],
    blurb: 'Fragile, but its long beak stabs hard from range 3.',
    comingLater: 'Stacking Venom.',
  },
  hornet: {
    id: 'hornet', name: 'Hornet', cost: 8, count: 1,
    unit: unit('hornet', 'Hornet', { hp: 780, damage: 125, hitSpeed: 1.0, range: RANGE.melee, speed: SPEED.fast, radius: 0.45, flying: true, targets: 'both' }),
    keywords: ['Flying', 'Melee', 'Hits air'],
    blurb: 'Stings again and again. Ground-only bugs can\'t touch it.',
    comingLater: 'Venom stings.',
  },
  dragonfly: {
    id: 'dragonfly', name: 'Dragonfly', cost: 6, count: 1,
    unit: unit('dragonfly', 'Dragonfly', { hp: 760, damage: 120, hitSpeed: 1.0, range: RANGE.melee, speed: SPEED.veryFast, radius: 0.45, flying: true, targets: 'both', prefersAir: true }),
    keywords: ['Flying', 'Melee', 'Air first'],
    blurb: 'Fastest bug in the game. Hunts other flyers first.',
  },
  termites: {
    id: 'termites', name: 'Termite Wave', cost: 6, count: 5,
    unit: unit('termite', 'Termite', { hp: 200, damage: 60, hitSpeed: 1.0, range: RANGE.melee, speed: SPEED.medium, radius: 0.28, flying: false, targets: 'buildings' }),
    keywords: ['Swarm', 'Buildings only', 'Melee'],
    blurb: 'Five termites that ignore bugs and chew on towers.',
    comingLater: 'Damage grows the longer they stay latched on.',
  },
  bolas: {
    id: 'bolas', name: 'Bolas Spider', cost: 7, count: 1,
    unit: unit('bolas', 'Bolas Spider', { hp: 700, damage: 140, hitSpeed: 1.6, range: RANGE.mid, speed: SPEED.medium, radius: 0.45, flying: false, targets: 'both' }),
    keywords: ['Ranged', 'Hits air'],
    blurb: 'Mid-range thrower that covers your push from behind.',
    comingLater: 'Sticky bola that nets up to three bugs.',
  },
};

export const SPEED_LABEL = (speed: number): string =>
  speed <= SPEED.slow ? 'Slow' : speed <= SPEED.medium ? 'Medium' : speed <= SPEED.fast ? 'Fast' : 'Very fast';

export const RANGE_LABEL = (range: number): string =>
  range <= MELEE ? 'Melee' : range <= RANGE.short ? 'Short' : 'Mid';
