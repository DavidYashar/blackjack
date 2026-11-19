import { describe, expect, it } from 'vitest';

import { dealerTurn, handScript } from '../round';
import { readHand } from '../strategy';

/**
 * The dealer's draw is an invariant, not a preference: it never draws on a total of
 * seventeen or more, and never stops short of it while a hand is still live.
 */
describe('the dealer draws to seventeen and stops', () => {
  it('never draws past seventeen and never stops short', () => {
    const offenders: string[] = [];

    for (let s = 0; s < 400; s += 1) {
      const seed = `audit-${s}`;
      handScript(seed).forEach((hand, index) => {
        const cards = dealerTurn(seed, index, hand, false).cards;

        for (let n = 2; n < cards.length; n += 1) {
          const partial = readHand(cards.slice(0, n)).total;
          if (partial >= 17) offenders.push(`${seed}/${index} drew on ${partial}`);
        }

        if (readHand(cards).total < 17) offenders.push(`${seed}/${index} stopped short`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
