import { Deck } from '../data/decks';

export const NECTAR = {
  cap: 16,
  start: 10,
  refillSeconds: 1.4,
} as const;

export const HAND_SIZE = 4;

// Seeded RNG so a match replays identically from its seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PlayerState {
  nectar: number = NECTAR.start;
  hand: string[];
  queue: string[]; // upcoming cards; queue[0] is "next"

  constructor(deck: Deck, rng: () => number) {
    const cards = [...deck.cards];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    this.hand = cards.slice(0, HAND_SIZE);
    this.queue = cards.slice(HAND_SIZE);
  }

  refill(dt: number, rateMultiplier = 1) {
    this.nectar = Math.min(NECTAR.cap, this.nectar + (dt / NECTAR.refillSeconds) * rateMultiplier);
  }

  // Swap the played card to the back of the line and draw the next one into its slot.
  cycle(handIndex: number) {
    const played = this.hand[handIndex];
    this.hand[handIndex] = this.queue.shift()!;
    this.queue.push(played);
  }
}
