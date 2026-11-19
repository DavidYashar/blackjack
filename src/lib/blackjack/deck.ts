import { type Rank } from './strategy';

/**
 * Suits and the card artwork.
 *
 * The deal itself is decided by rank, because basic strategy only cares about
 * ranks and totals. A suit is what the picture needs, so each dealt card is given
 * one from a per-rank queue: every rank has four suits, shuffled from the round
 * seed and handed out in order. That keeps the deck legal, so a hand never holds
 * the same card twice, and repeating the round repeats the same faces.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';

export type Card = { rank: Rank; suit: Suit };

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

/** Red suits get a red index and red pips. */
export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

/** The shipped artwork for a card, or undefined when the deck has no picture. */
export function cardArt(card: Card): string | undefined {
  return `/cards/${card.rank}${card.suit}.webp`;
}

/** The shipped artwork for the back. */
export const BACK_ART = '/cards/back.webp';

function hash(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Deterministic shuffle of the four suits, one queue per rank. */
function freshQueues(seed: string, salt: string): Record<Rank, Suit[]> {
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const out = {} as Record<Rank, Suit[]>;
  for (const rank of ranks) {
    const suits = [...SUITS];
    let h = hash(`${seed}:${salt}:${rank}`);
    for (let i = suits.length - 1; i > 0; i -= 1) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      const j = h % (i + 1);
      [suits[i], suits[j]] = [suits[j]!, suits[i]!];
    }
    out[rank] = suits;
  }
  return out;
}

export type SuitDealer = {
  /** Takes the next suit for a rank. Refills when a rank runs out of suits. */
  next: (rank: Rank) => Suit;
  reset: () => void;
};

export function makeSuitDealer(seed: string): SuitDealer {
  let queues = freshQueues(seed, 'round');
  return {
    next(rank) {
      const queue = queues[rank];
      if (!queue || queue.length === 0) {
        queues = freshQueues(`${seed}:${Math.random()}`, 'refill');
      }
      return (queues[rank] ?? SUITS).shift() ?? SUITS[hash(`${seed}:${rank}`) % 4]!;
    },
    reset() {
      queues = freshQueues(seed, 'round');
    },
  };
}

/** The suit for one card, avoiding a suit this hand already holds for that rank. */
export function suitFor(
  seed: string,
  index: number,
  position: number,
  rank: Rank,
  used: ReadonlySet<Suit>,
): Suit {
  const h = hash(`${seed}:${index}:${position}:${rank}`);
  for (let k = 0; k < SUITS.length; k += 1) {
    const suit = SUITS[(h + k) % SUITS.length]!;
    if (!used.has(suit)) return suit;
  }
  return SUITS[h % SUITS.length]!;
}

/**
 * A list of ranks turned into cards, with suits that never repeat a card inside the
 * same hand. Stable for a given seed, hand and position, so a re-render or a replay
 * shows the same faces.
 */
export function dealSuits(
  seed: string,
  index: number,
  ranks: readonly Rank[],
  offset = 0,
): Card[] {
  const used = new Map<Rank, Set<Suit>>();
  return ranks.map((rank, i) => {
    const taken = used.get(rank) ?? new Set<Suit>();
    const suit = suitFor(seed, index, offset + i, rank, taken);
    taken.add(suit);
    used.set(rank, taken);
    return { rank, suit };
  });
}
