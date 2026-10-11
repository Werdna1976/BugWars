import { CARDS } from './cards';

export const DECK_SIZE = 10;
export const MAX_DUPLICATED_CARDS = 3; // up to 3 cards may appear twice, so at least 7 unique

export interface Deck {
  name: string;
  cards: string[]; // card ids, duplicates listed twice
}

export const PLAYER_DECK: Deck = {
  name: 'Beetle Rush',
  cards: ['pillbug', 'pillbug', 'rhino', 'goliath', 'fireants', 'fireants', 'spitter', 'spitter', 'hornet', 'bolas'],
};

export const AI_DECK: Deck = {
  name: 'Sky Sting',
  cards: ['dragonfly', 'dragonfly', 'hornet', 'mantis', 'assassin', 'assassin', 'termites', 'termites', 'pillbug', 'spitter'],
};

// Returns a list of rule violations (empty when the deck is legal).
export function validateDeck(deck: Deck): string[] {
  const errors: string[] = [];
  if (deck.cards.length !== DECK_SIZE) errors.push(`needs ${DECK_SIZE} cards, has ${deck.cards.length}`);
  const counts = new Map<string, number>();
  for (const id of deck.cards) {
    if (!CARDS[id]) errors.push(`unknown card ${id}`);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, n] of counts) if (n > 2) errors.push(`${id} appears ${n} times (max 2)`);
  const dupes = [...counts.values()].filter((n) => n === 2).length;
  if (dupes > MAX_DUPLICATED_CARDS) errors.push(`${dupes} duplicated cards (max ${MAX_DUPLICATED_CARDS})`);
  return errors;
}
