import { describe, expect, it } from 'vitest';

import { correctAction, readHand, type Rank } from '../strategy';
import {
  V0,
  compareResults,
  dealerTurn,
  drawDealer,
  drawPlayer,
  gradeRound,
  handScript,
  isHardSpot,
  isNatural,
  outcomeOf,
  viewOf,
  type LoggedDecision,
  type RoundConfig,
} from '../round';

const SEED = 'duel-dudes-round-1';

/** Play every hand of a script correctly, at a steady pace. */
function perfect(script: ReturnType<typeof handScript>, atMs = 1000): LoggedDecision[] {
  return script.map((hand) => ({
    atMs,
    taken: correctAction(hand.cards, hand.dealerUp, { canDouble: true, canSplit: false }),
  }));
}

describe('the script is deterministic', () => {
  it('deals the same hands for the same seed', () => {
    expect(handScript(SEED)).toEqual(handScript(SEED));
  });

  it('deals different hands for a different seed', () => {
    const a = handScript('seed-a');
    const b = handScript('seed-b');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('deals the requested number of hands', () => {
    expect(handScript(SEED)).toHaveLength(V0.hands);
    expect(handScript(SEED, { hands: 5, secondsPerHand: 30 })).toHaveLength(5);
  });
});

describe('the curve climbs', () => {
  it('opens with easy hard totals against low cards', () => {
    const script = handScript(SEED);
    const third = Math.floor(V0.hands / 3);
    for (const hand of script.slice(0, third)) {
      const read = readHand(hand.cards);
      expect(read.soft).toBe(false);
      expect(read.total).toBeGreaterThanOrEqual(9);
      expect(read.total).toBeLessThanOrEqual(11);
      expect(['2', '3', '4', '5', '6']).toContain(hand.dealerUp);
    }
  });

  it('then the 12 to 16 losing zone against high cards', () => {
    const script = handScript(SEED);
    const third = Math.floor(V0.hands / 3);
    for (const hand of script.slice(third, third * 2)) {
      const read = readHand(hand.cards);
      expect(read.soft).toBe(false);
      expect(read.total).toBeGreaterThanOrEqual(12);
      expect(read.total).toBeLessThanOrEqual(16);
      expect(['7', '8', '9', '10']).toContain(hand.dealerUp);
    }
  });

  it('ends on soft hands, where most players are wrong', () => {
    const script = handScript(SEED);
    const third = Math.floor(V0.hands / 3);
    for (const hand of script.slice(third * 2)) {
      expect(hand.cards).toContain('A');
      expect(readHand(hand.cards).soft).toBe(true);
    }
  });

  it('deals a natural often enough to meet the rule', () => {
    const naturals = [...Array(40).keys()].filter((i) => {
      const script = handScript(`natural-probe-${i}`);
      return script.some((hand) => isNatural(hand.cards));
    });
    expect(naturals.length).toBeGreaterThan(0);
  });

  it('deals split pairs in the losing zone often enough to matter', () => {
    const withPair = [...Array(30).keys()].filter((i) => {
      const script = handScript(`pair-probe-${i}`);
      const third = Math.floor(V0.hands / 3);
      return script.slice(third, third * 2).some((hand) => readHand(hand.cards).pair !== null);
    });
    expect(withPair.length).toBeGreaterThan(0);
  });

  it('never deals a pair as an easy hand', () => {
    const script = handScript(SEED);
    const third = Math.floor(V0.hands / 3);
    for (const hand of script.slice(0, third)) {
      expect(readHand(hand.cards).pair).toBeNull();
    }
  });
});

describe('view of a hand', () => {
  it('reports the total, the dealer card and no split', () => {
    const hand = { cards: ['10', '6'] as const, dealerUp: '9' as const };
    const view = viewOf(hand, 3, 1234);
    expect(view.index).toBe(3);
    expect(view.total).toBe(16);
    expect(view.soft).toBe(false);
    expect(view.dealerUp).toBe('9');
    expect(view.canSplit).toBe(false);
    expect(view.canDouble).toBe(true);
    expect(view.endsAt).toBe(1234);
  });
});

describe('grading', () => {
  it('scores a perfect round at ten or more per hand', () => {
    const script = handScript(SEED);
    const result = gradeRound(script, perfect(script), V0);
    expect(result.correct).toBe(script.length);
    expect(result.wrong).toBe(0);
    expect(result.unanswered).toBe(0);
    expect(result.accuracy).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(script.length * 10);
  });

  it('awards speed: the same answers, faster, score higher', () => {
    const script = handScript(SEED);
    // Both are inside the thirty second window, so the times have to be far apart.
    const slow = gradeRound(script, perfect(script, 29000), V0);
    const fast = gradeRound(script, perfect(script, 200), V0);
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('gives nothing for a wrong answer', () => {
    const script = handScript(SEED);
    const bad: LoggedDecision[] = script.map((hand) => {
      const right = correctAction(hand.cards, hand.dealerUp, { canDouble: true, canSplit: false });
      return { atMs: 100, taken: right === 'stand' ? 'hit' : 'stand' };
    });
    const result = gradeRound(script, bad, V0);
    expect(result.correct).toBe(0);
    expect(result.wrong).toBe(script.length);
    expect(result.score).toBe(0);
  });

  it('counts an unanswered hand separately from a wrong one', () => {
    const script = handScript(SEED, { hands: 3, secondsPerHand: 30 });
    const result = gradeRound(script, [perfect(script)[0]!, null, null], { hands: 3, secondsPerHand: 30 });
    expect(result.correct).toBe(1);
    expect(result.unanswered).toBe(2);
    expect(result.accuracy).toBeCloseTo(1 / 3);
  });

  it('pays a difficulty bonus on the losing zone and on soft hands', () => {
    const config: RoundConfig = { hands: 2, secondsPerHand: 30 };
    const easy = [{ cards: ['6', '5'] as const, dealerUp: '3' as const }];
    const hard = [{ cards: ['10', '6'] as const, dealerUp: '10' as const }];

    expect(isHardSpot(easy[0]!)).toBe(false);
    expect(isHardSpot(hard[0]!)).toBe(true);

    const easyResult = gradeRound(easy, perfect(easy, 100), config);
    const hardResult = gradeRound(hard, perfect(hard, 100), config);
    expect(hardResult.score).toBeGreaterThan(easyResult.score);
  });

  it('reports the median decision time', () => {
    const script = handScript(SEED, { hands: 3, secondsPerHand: 30 });
    const answers = perfect(script);
    answers[0]!.atMs = 100;
    answers[1]!.atMs = 200;
    answers[2]!.atMs = 300;
    const result = gradeRound(script, answers, { hands: 3, secondsPerHand: 30 });
    expect(result.medianMs).toBe(200);
  });
});

describe('comparing two results', () => {
  const script = handScript(SEED);
  const base = gradeRound(script, perfect(script, 200), V0);

  it('the higher score wins', () => {
    const worse = gradeRound(script, perfect(script, 3000), V0);
    expect(compareResults(base, worse)).toBe('a');
    expect(compareResults(worse, base)).toBe('b');
  });

  it('identical results tie', () => {
    expect(compareResults(base, { ...base })).toBe('tie');
  });

  it('breaks a score tie on accuracy, then on speed', () => {
    const slower = { ...base, medianMs: base.medianMs + 50 };
    expect(compareResults(base, slower)).toBe('a');

    const sloppier = { ...base, accuracy: base.accuracy - 0.1 };
    expect(compareResults(base, sloppier)).toBe('a');
  });
});

describe('drawing cards', () => {
  const seed = 'seed-resolve';

  it('is deterministic per seed, hand and slot', () => {
    expect(drawPlayer(seed, 3, 0)).toBe(drawPlayer(seed, 3, 0));
    expect(drawDealer(seed, 3, 0)).toBe(drawDealer(seed, 3, 0));
  });

  it('gives the player and the dealer different cards', () => {
    const playerCards = new Set([0, 1, 2, 3].map((hit) => drawPlayer(seed, 3, hit)));
    const dealerCards = new Set([0, 1, 2, 3].map((draw) => drawDealer(seed, 3, draw)));
    expect(playerCards.size).toBeGreaterThan(1);
    expect(dealerCards.size).toBeGreaterThan(1);
  });

  it('varies across hands', () => {
    const firsts = new Set([...Array(8).keys()].map((i) => drawPlayer(seed, i, 0)));
    expect(firsts.size).toBeGreaterThan(1);
  });
});

describe("the dealer's turn", () => {
  const seed = 'seed-dealer';
  const hand = { cards: ['10', '6'] as const, dealerUp: '9' as const };

  it('turns over at least the hole card', () => {
    const dealer = dealerTurn(seed, 0, hand, false);
    expect(dealer.cards.length).toBeGreaterThanOrEqual(2);
    expect(dealer.cards[0]).toBe('9');
  });

  it('draws to seventeen or more when the player is alive', () => {
    for (let index = 0; index < 40; index += 1) {
      expect(dealerTurn(seed, index, hand, false).total).toBeGreaterThanOrEqual(17);
    }
  });

  it('stands on soft seventeen', () => {
    // An ace up with a six in the hole is soft seventeen. A table that hits soft
    // seventeen would draw again; this one must stand.
    const aceUp = { cards: ['A', '2'] as const, dealerUp: 'A' as const };

    for (let index = 0; index < 4000; index += 1) {
      if (drawDealer(seed, index, 0) !== '6') continue;
      const dealer = dealerTurn(seed, index, aceUp, false);
      expect(dealer.cards).toHaveLength(2);
      expect(readHand(dealer.cards)).toMatchObject({ total: 17, soft: true });
      return;
    }
    throw new Error('no six in the hole in 4000 tries');
  });

  it('takes only the hole card when the player has busted', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(dealerTurn(seed, index, hand, true).cards).toHaveLength(2);
    }
  });
});

describe('the verdict', () => {
  const dealer = (cards: Rank[], total: number, bust = false) => ({ cards, total, bust });

  it('gives a natural the win over a made twenty-one', () => {
    expect(outcomeOf(['A', '10'], 21, false, dealer(['9', '8', '4'], 21))).toBe('blackjack');
  });

  it('ties another natural', () => {
    expect(outcomeOf(['A', 'K'], 21, false, dealer(['A', 'Q'], 21))).toBe('push');
  });

  it('loses a natural to nothing, since the dealer never deals one', () => {
    for (let index = 0; index < 60; index += 1) {
      const dealt = handScript('peek-seed')[index % handScript('peek-seed').length]!;
      const dealerHand = dealerTurn('peek-seed', index, dealt, false);
      expect(isNatural(dealerHand.cards)).toBe(false);
    }
  });

  it('still loses a bust whatever the dealer holds', () => {
    expect(outcomeOf(['10', '6', 'K'], 26, true, dealer(['9', '8'], 17))).toBe('lose');
  });

  it('wins when the dealer busts', () => {
    expect(outcomeOf(['10', '5'], 15, false, dealer(['9', '8', '7'], 24, true))).toBe('win');
  });

  it('compares totals otherwise', () => {
    expect(outcomeOf(['10', '9'], 19, false, dealer(['9', '8'], 17))).toBe('win');
    expect(outcomeOf(['10', '7'], 17, false, dealer(['9', '9'], 18))).toBe('lose');
    expect(outcomeOf(['10', '9'], 19, false, dealer(['9', '10'], 19))).toBe('push');
  });
});

describe('splitting', () => {
  const hand = { cards: ['8', '8'] as const, dealerUp: '7' as const };

  it('draws a different card for each half of a split', () => {
    expect(drawPlayer('split-seed', 0, 0, 0)).not.toBe(drawPlayer('split-seed', 0, 0, 1));
  });

  it('keeps one hand from stealing the other hand cards', () => {
    const first = [0, 1, 2].map((hit) => drawPlayer('split-seed', 3, hit, 0));
    const second = [0, 1, 2].map((hit) => drawPlayer('split-seed', 3, hit, 1));
    expect(first).not.toEqual(second);
  });

  it('names the right play for a pair of eights', () => {
    expect(correctAction(hand.cards, hand.dealerUp, { canDouble: true, canSplit: true })).toBe('split');
  });

  it('falls back to the total when the pair cannot be split', () => {
    expect(correctAction(hand.cards, hand.dealerUp, { canDouble: true, canSplit: false })).toBe('hit');
  });
});

describe('playing a hand out', () => {
  const seed = 'seed-play';
  const hand = { cards: ['2', '3'] as const, dealerUp: '7' as const };

  it('lets a player hit repeatedly until they stand', () => {
    // Draw until the total reaches at least seventeen, which a real player would do.
    let cards: Rank[] = [...hand.cards];
    let hits = 0;
    while (readHand(cards).total < 17 && hits < 10) {
      cards = [...cards, drawPlayer(seed, 0, hits)];
      hits += 1;
    }
    expect(hits).toBeGreaterThan(1);
    expect(cards.length).toBeGreaterThan(3);
  });

  it('stops the hand at twenty-one or a bust', () => {
    const playUntilDone = () => {
      let cards: Rank[] = [...hand.cards];
      let hit = 0;
      let read = readHand(cards);
      while (read.total < 21 && hit < 12) {
        cards = [...cards, drawPlayer(seed, 5, hit)];
        hit += 1;
        read = readHand(cards);
      }
      return read;
    };
    const final = playUntilDone();
    expect(final.total >= 21).toBe(true);
  });
});

describe('the clock', () => {
  it('gives six hands, a minute each', () => {
    expect(V0.hands).toBe(6);
    expect(V0.secondsPerHand).toBe(60);
  });

  it('pays speed against the per-hand budget, not the whole round', () => {
    const script = handScript(SEED, { hands: 1, secondsPerHand: 30 });
    // Two seconds on a single hand is fast, so it must earn most of the bonus.
    const quick = gradeRound(script, perfect(script, 2000), { hands: 1, secondsPerHand: 30 });
    const slow = gradeRound(script, perfect(script, 29000), { hands: 1, secondsPerHand: 30 });
    expect(quick.score).toBeGreaterThan(slow.score);
  });
});
