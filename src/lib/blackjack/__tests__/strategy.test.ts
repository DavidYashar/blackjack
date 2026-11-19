import { describe, expect, it } from 'vitest';

import {
  DEALER_ORDER,
  HARD,
  PAIRS,
  SOFT,
  correctAction,
  isCorrect,
  readHand,
  type Action,
  type DealerUp,
  type Rank,
} from '../strategy';

/**
 * A second, independent transcription of the same table: explicit hands rather
 * than letter strings. A typo in either representation fails here, which is the
 * point of writing the check twice.
 */
const CANONICAL: ReadonlyArray<[readonly Rank[], DealerUp, Action]> = [
  // Hard totals
  [['5', '3'], '10', 'hit'],
  [['5', '4'], '2', 'hit'],
  [['5', '4'], '3', 'double'],
  [['5', '4'], '7', 'hit'],
  [['6', '4'], '9', 'double'],
  [['6', '4'], '10', 'hit'],
  [['6', '4'], 'A', 'hit'],
  [['6', '5'], '6', 'double'],
  [['6', '5'], 'A', 'double'],
  [['10', '2'], '3', 'hit'],
  [['10', '2'], '4', 'stand'],
  [['10', '2'], '6', 'stand'],
  [['10', '2'], '7', 'hit'],
  [['10', '6'], '9', 'hit'],
  [['10', '6'], '6', 'stand'],
  [['10', '7'], 'A', 'stand'],
  [['10', '10'], '6', 'stand'],

  // Soft totals
  [['A', '2'], '3', 'hit'],
  [['A', '2'], '5', 'double'],
  [['A', '4'], '3', 'hit'],
  [['A', '4'], '4', 'double'],
  [['A', '6'], '2', 'hit'],
  [['A', '6'], '3', 'double'],
  [['A', '6'], '7', 'hit'],
  [['A', '7'], '2', 'stand'],
  [['A', '7'], '3', 'double'],
  [['A', '7'], '7', 'stand'],
  [['A', '7'], '9', 'hit'],
  [['A', '7'], 'A', 'hit'],
  [['A', '8'], '6', 'stand'],

  // Pairs
  [['A', 'A'], 'A', 'split'],
  [['8', '8'], 'A', 'split'],
  [['9', '9'], '7', 'stand'],
  [['9', '9'], '8', 'split'],
  [['9', '9'], '9', 'split'],
  [['9', '9'], '10', 'stand'],
  [['7', '7'], '7', 'split'],
  [['7', '7'], '8', 'hit'],
  [['6', '6'], '6', 'split'],
  [['6', '6'], '7', 'hit'],
  [['5', '5'], '8', 'double'],
  [['5', '5'], '10', 'hit'],
  [['4', '4'], '5', 'split'],
  [['4', '4'], '4', 'hit'],
  [['3', '3'], '7', 'split'],
  [['3', '3'], '8', 'hit'],
  [['2', '2'], '2', 'split'],
  [['2', '2'], '3', 'split'],
  [['2', '2'], '8', 'hit'],
  [['10', 'J'], '6', 'stand'],
];

describe('the table is complete', () => {
  it('every row covers all ten dealer cards with a legal letter', () => {
    for (const table of [HARD, SOFT, PAIRS]) {
      for (const [key, row] of Object.entries(table)) {
        expect(row, `row ${key}`).toHaveLength(DEALER_ORDER.length);
        expect(row, `row ${key}`).toMatch(/^[HSDP]{10}$/);
      }
    }
  });

  it('hard totals run from 5 to 21 with no gaps', () => {
    const totals = Object.keys(HARD).map(Number).sort((a, b) => a - b);
    expect(totals).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });

  it('soft totals run from 13 to 20, and 21 is a stand', () => {
    const totals = Object.keys(SOFT).map(Number).sort((a, b) => a - b);
    expect(totals).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    expect(readHand(['A', 'K']).total).toBe(21);
    expect(correctAction(['A', 'K'], '6')).toBe('stand');
  });
});

describe('cells match a second transcription', () => {
  it.each(CANONICAL)('%j against %s is %s', (cards, dealerUp, expected) => {
    expect(correctAction(cards, dealerUp)).toBe(expected);
  });
});

describe('hand reading', () => {
  it('counts an ace as eleven while that does not bust', () => {
    expect(readHand(['A', '6'])).toEqual({ total: 17, soft: true, pair: null });
    expect(readHand(['A', '6', '10']).total).toBe(17);
    expect(readHand(['A', '6', '10']).soft).toBe(false);
  });

  it('counts two aces as soft twelve', () => {
    expect(readHand(['A', 'A'])).toEqual({ total: 12, soft: true, pair: 11 });
  });

  it('treats every ten-value card as the same pair value', () => {
    expect(readHand(['K', '10']).pair).toBe(10);
    expect(readHand(['Q', 'J']).pair).toBe(10);
  });

  it('detects no pair on three cards', () => {
    expect(readHand(['8', '8', '2']).pair).toBeNull();
  });
});

describe('the table never asks for the impossible', () => {
  it('always stands on a hard seventeen or better', () => {
    for (let total = 17; total <= 21; total += 1) {
      for (const dealerUp of DEALER_ORDER) {
        expect(correctAction(['10', String(total - 10) as Rank], dealerUp)).toBe('stand');
      }
    }
  });

  it('always doubles eleven', () => {
    for (const dealerUp of DEALER_ORDER) {
      expect(correctAction(['6', '5'], dealerUp)).toBe('double');
    }
  });

  it('always splits aces and eights', () => {
    for (const dealerUp of DEALER_ORDER) {
      expect(correctAction(['A', 'A'], dealerUp)).toBe('split');
      expect(correctAction(['8', '8'], dealerUp)).toBe('split');
    }
  });

  it('never splits tens or fives', () => {
    for (const dealerUp of DEALER_ORDER) {
      expect(correctAction(['10', 'K'], dealerUp)).not.toBe('split');
    }
  });
});

describe('fallbacks when an action is not on offer', () => {
  it('hits instead of doubling on a hard hand', () => {
    expect(correctAction(['6', '5'], '6', { canDouble: false, canSplit: true })).toBe('hit');
  });

  it('stands instead of doubling on soft eighteen', () => {
    expect(correctAction(['A', '7'], '3', { canDouble: false, canSplit: true })).toBe('stand');
  });

  it('hits instead of doubling on soft seventeen', () => {
    expect(correctAction(['A', '6'], '3', { canDouble: false, canSplit: true })).toBe('hit');
  });

  it('plays the total when a pair cannot be split', () => {
    expect(correctAction(['8', '8'], '8', { canDouble: true, canSplit: false })).toBe('hit');
    expect(correctAction(['10', '10'], '6', { canDouble: true, canSplit: false })).toBe('stand');
  });

  it('still double-falls-back correctly when neither is offered', () => {
    expect(correctAction(['5', '5'], '6', { canDouble: false, canSplit: false })).toBe('hit');
  });
});

describe('grading', () => {
  it('accepts the table action and rejects anything else', () => {
    expect(isCorrect(['10', '6'], '10', 'hit')).toBe(true);
    expect(isCorrect(['10', '6'], '10', 'stand')).toBe(false);
  });

  it('rejects an unknown dealer card rather than guessing', () => {
    expect(() => correctAction(['10', '6'], '1' as DealerUp)).toThrow(/unknown dealer up card/);
  });
});
