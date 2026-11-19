import { correctAction, readHand, type Action, type DealerUp, type Rank } from './strategy';

/**
 * One short explanation per decision, for the review card. Two lines: what the
 * right play is, and why, in terms of what the dealer is likely to do.
 *
 * This is the teaching layer. It has to be brief enough that a racer can ignore
 * it and a learner can read it in three seconds.
 */

const ACTION_WORD: Record<Action, string> = {
  hit: 'hit',
  stand: 'stand',
  double: 'double',
  split: 'split',
};

/** How the dealer's up card tends to resolve. */
function dealerNote(dealerUp: DealerUp): string {
  const value = dealerUp === 'A' ? 11 : Number(dealerUp);
  if (value >= 2 && value <= 6) {
    return 'The dealer is showing a weak card, so they bust about four times in ten.';
  }
  if (value === 7) {
    return 'A seven up is the awkward one: the dealer usually ends on 17, which beats most standing hands.';
  }
  return 'The dealer is showing a strong card, so they make 17 or better most of the time.';
}

/** "a 4" or "an A": the label a dealer card is spoken with. */
export function dealerLabel(dealerUp: DealerUp): string {
  // "an eight", "an ace", but "a ten" and "a nine".
  return dealerUp === 'A' || dealerUp === '8' ? `an ${dealerUp}` : `a ${dealerUp}`;
}

export type Explanation = {
  /** One line, for the collapsed row. */
  title: string;
  /** The reason, for the open card. */
  body: string;
};

export function explainHand(
  cards: readonly [Rank, Rank],
  dealerUp: DealerUp,
  taken: Action,
): Explanation {
  const best = correctAction(cards, dealerUp, { canDouble: true, canSplit: false });
  const hand = readHand(cards);
  const shape = hand.soft ? `soft ${hand.total}` : `${hand.total}`;

  const label = dealerLabel(dealerUp);
  const title =
    taken === best
      ? `${shape} against ${label}: ${ACTION_WORD[best]} is right.`
      : `${shape} against ${label}. You chose ${ACTION_WORD[taken]}; ${ACTION_WORD[best]} is right.`;

  return { title, body: `${dealerNote(dealerUp)} ${reason(hand.total, hand.soft, best, dealerUp)}` };
}

/** The hand-specific half of the reason, kept separate from the dealer's half. */
function reason(total: number, soft: boolean, best: Action, dealerUp: DealerUp): string {
  if (best === 'double') {
    if (soft) return 'A soft hand cannot bust on one card, so doubling puts more money on a hand you cannot lose immediately.';
    return `With ${total} you improve more often than you bust, so the extra stake is worth it.`;
  }
  if (best === 'stand') {
    if (total >= 17) return `Standing on ${total} keeps a made hand; taking a card risks the total for no gain.`;
    return 'Standing lets a weak dealer card bust instead of you.';
  }
  if (soft) return 'A soft hand cannot bust, so there is nothing to lose by taking another card.';
  if (total >= 12) return 'The dealer is too strong to hope they bust, so you have to improve your own total.';
  return `Taking a card on ${total} cannot bust you, and ${dealerUp} is too strong to stand against.`;
}
