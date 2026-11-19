import { describe, expect, it } from 'vitest';

import { dealerLabel, explainHand } from '../review';

describe('the dealer label', () => {
  it('says an A, and a 4', () => {
    expect(dealerLabel('A')).toBe('an A');
    expect(dealerLabel('4')).toBe('a 4');
    expect(dealerLabel('10')).toBe('a 10');
  });
});

describe('the explanation', () => {
  it('names the right play and what the player chose', () => {
    const wrong = explainHand(['10', '6'], '10', 'stand');
    expect(wrong.title).toContain('16 against a 10');
    expect(wrong.title).toContain('You chose stand');
    expect(wrong.title).toContain('hit is right');
  });

  it('stays short enough for a phone card', () => {
    const explanation = explainHand(['A', '7'], 'A', 'stand');
    expect(explanation.title.length).toBeLessThan(90);
    expect(explanation.body.length).toBeLessThan(220);
  });

  it('reads naturally against an ace', () => {
    const explanation = explainHand(['10', '6'], 'A', 'stand');
    expect(explanation.title).toContain('against an A');
    expect(explanation.title).not.toContain('against a A');
  });

  it('gives a reason that mentions the dealer', () => {
    const explanation = explainHand(['2', '3'], '6', 'hit');
    expect(explanation.body.toLowerCase()).toContain('dealer');
  });
});
