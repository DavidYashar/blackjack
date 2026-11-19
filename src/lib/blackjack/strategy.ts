/**
 * Basic strategy for the pinned Duel Dudes table:
 *
 *   6 decks, dealer stands on soft 17, double after split allowed,
 *   no surrender, dealer peeks for blackjack, blackjack pays 3:2.
 *
 * Every paid decision is graded against exactly this table, and nothing else.
 * If the table rules ever change, this file changes with them, and the tests
 * catch every cell that moved.
 *
 * Rows are indexed by the dealer's up card in the order 2 3 4 5 6 7 8 9 10 A:
 *   H hit, S stand, D double (hit if doubling is not offered),
 *   P split (handled only from the pair table)
 */

export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Action = "hit" | "stand" | "double" | "split";

export type Letter = "H" | "S" | "D" | "P";

export type DealerUp = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "A";

export const DEALER_ORDER: readonly DealerUp[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

/** Hard totals. Below 5 never happens; 17 and above always stand. */
export const HARD: Readonly<Record<number, string>> = {
  5: "HHHHHHHHHH",
  6: "HHHHHHHHHH",
  7: "HHHHHHHHHH",
  8: "HHHHHHHHHH",
  9: "HDDDDHHHHH",
  10: "DDDDDDDDHH",
  11: "DDDDDDDDDD",
  12: "HHSSSHHHHH",
  13: "SSSSSHHHHH",
  14: "SSSSSHHHHH",
  15: "SSSSSHHHHH",
  16: "SSSSSHHHHH",
  17: "SSSSSSSSSS",
  18: "SSSSSSSSSS",
  19: "SSSSSSSSSS",
  20: "SSSSSSSSSS",
  21: "SSSSSSSSSS",
};

/** Soft totals, ace counted as eleven, keyed by the total. */
export const SOFT: Readonly<Record<number, string>> = {
  13: "HHHDDHHHHH",
  14: "HHHDDHHHHH",
  15: "HHDDDHHHHH",
  16: "HHDDDHHHHH",
  17: "HDDDDHHHHH",
  18: "SDDDDSSHHH",
  19: "SSSSSSSSSS",
  20: "SSSSSSSSSS",
};

/** Pairs, keyed by the card's value. 10 covers 10, J, Q and K. */
export const PAIRS: Readonly<Record<number, string>> = {
  11: "PPPPPPPPPP",
  10: "SSSSSSSSSS",
  9: "PPPPPSPPSS",
  8: "PPPPPPPPPP",
  7: "PPPPPPHHHH",
  6: "PPPPPHHHHH",
  5: "DDDDDDDDHH",
  4: "HHHPPHHHHH",
  3: "PPPPPPHHHH",
  2: "PPPPPPHHHH",
};

export function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return 10;
  return Number(rank);
}

export type Hand = {
  /** Best total, with aces counted as one wherever eleven would bust. */
  total: number;
  /** True when at least one ace is still counted as eleven. */
  soft: boolean;
  /** The shared value of the first two cards, or null when they differ. */
  pair: number | null;
};

export function readHand(cards: readonly Rank[]): Hand {
  const values = cards.map(cardValue);
  let softAces = values.filter((v) => v === 11).length;
  let total = values.reduce((sum, v) => sum + v, 0);
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }

  const pair =
    cards.length === 2 && cardValue(cards[0]!) === cardValue(cards[1]!)
      ? cardValue(cards[0]!)
      : null;

  return { total, soft: softAces > 0, pair };
}

export type DecisionContext = {
  /** False once the player has hit, or after a split, in real play. */
  canDouble: boolean;
  canSplit: boolean;
};

/**
 * The correct action for a hand against a dealer up card, under the pinned table.
 * Doubles and splits are downgraded when they are not on offer, exactly as a
 * player at the table would have to play them.
 */
export function correctAction(
  cards: readonly Rank[],
  dealerUp: DealerUp,
  context: DecisionContext = { canDouble: true, canSplit: true },
): Action {
  const hand = readHand(cards);
  const column = DEALER_ORDER.indexOf(dealerUp);
  if (column < 0) throw new Error(`unknown dealer up card: ${dealerUp}`);

  if (hand.pair !== null && context.canSplit) {
    const row = PAIRS[hand.pair] ?? PAIRS[10]!;
    if (row[column] === "P") return "split";
  }

  const row = hand.soft ? SOFT[hand.total] : HARD[hand.total];
  const letter = (row?.[column] ?? (hand.total >= 17 ? "S" : "H")) as Letter;

  if (letter === "D") {
    return context.canDouble ? "double" : hand.soft && hand.total === 18 ? "stand" : "hit";
  }
  return letter === "S" ? "stand" : "hit";
}

/** True when the decision is the one the table wants. */
export function isCorrect(
  cards: readonly Rank[],
  dealerUp: DealerUp,
  taken: Action,
  context: DecisionContext = { canDouble: true, canSplit: true },
): boolean {
  return correctAction(cards, dealerUp, context) === taken;
}

/** The pair of cards a total stands for, for tests and the review card. */
export function describeHand(cards: readonly Rank[], dealerUp: DealerUp): string {
  const hand = readHand(cards);
  if (hand.pair !== null) return `${cards[0]},${cards[1]} against a ${dealerUp}`;
  return `${hand.soft ? "soft " : ""}${hand.total} against a ${dealerUp}`;
}
