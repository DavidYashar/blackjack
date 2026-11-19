import {
  correctAction,
  readHand,
  type Action,
  type DealerUp,
  type Rank,
} from './strategy';

/**
 * One round of Duel Dudes blackjack: a fixed script of hands, played against the
 * clock, graded against the pinned table.
 *
 * Everything here is pure and deterministic. The same seed always deals the same
 * hands, which is what lets two players duel on identical conditions and lets the
 * server re-grade a round it never watched.
 */

export type DealtHand = {
  cards: readonly [Rank, Rank];
  dealerUp: DealerUp;
};

export type RoundConfig = {
  hands: number;
  /** Seconds allowed for each hand's decision, counted from the moment it is dealt. */
  secondsPerHand: number;
};

export const V0: RoundConfig = { hands: 6, secondsPerHand: 60 };

export type LoggedDecision = {
  /** Milliseconds from the round's start to this tap. */
  atMs: number;
  taken: Action;
};

export type GradedHand = {
  index: number;
  cards: readonly [Rank, Rank];
  dealerUp: DealerUp;
  taken: Action | null;
  correct: Action;
  /** Points earned for this hand: correctness, speed and difficulty bonus. */
  points: number;
  /** True when the decision matched the table, false when it did not, null when unanswered. */
  verdict: boolean | null;
};

export type RoundResult = {
  score: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number;
  medianMs: number;
  hands: GradedHand[];
};

/* ------------------------------------------------------------------ */
/* Seeded chance                                                       */

/** A small deterministic PRNG. Same string, same sequence, every run. */
function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/* ------------------------------------------------------------------ */
/* The hand curve                                                      */

/**
 * Twelve hands that climb: easy hard totals, then the 12 to 16 losing zone,
 * then soft hands, which is where most players are quietly wrong.
 */
export function handScript(seed: string, config: RoundConfig = V0): DealtHand[] {
  const random = seededRandom(seed);
  const hands: DealtHand[] = [];

  const easyDealer: DealerUp[] = ['2', '3', '4', '5', '6'];
  const hardDealer: DealerUp[] = ['7', '8', '9', '10'];

  // Hard two-card totals, no aces: the pairs of ranks that add up.
  const hardPairs = (total: number): Array<[Rank, Rank]> => {
    const out: Array<[Rank, Rank]> = [];
    const values: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
    for (const a of values) {
      for (const b of values) {
        if (Number(a) + Number(b) === total) out.push([a, b]);
      }
    }
    return out;
  };

  const easyTotals = [9, 10, 11];
  const zoneTotals = [12, 13, 14, 15, 16];
  const soft: Array<Rank> = ['2', '3', '4', '5', '6', '7'];

  const third = Math.max(1, Math.floor(config.hands / 3));
  for (let i = 0; i < config.hands; i += 1) {
    if (i < third) {
      const total = pick(random, easyTotals);
      hands.push({ cards: pick(random, hardPairs(total)), dealerUp: pick(random, easyDealer) });
    } else if (i < third * 2) {
      // One hand in three is a pair in the losing zone, where the split decision lives.
      const splitPairs: Array<[Rank, Rank]> = [
        ['6', '6'],
        ['7', '7'],
        ['8', '8'],
      ];
      const cards =
        random() < 0.34 ? pick(random, splitPairs) : pick(random, hardPairs(pick(random, zoneTotals)));
      hands.push({ cards, dealerUp: pick(random, hardDealer) });
    } else {
      // One soft hand in four is a natural, so the rule gets met and seen.
      const second: Rank = random() < 0.25 ? '10' : pick(random, soft);
      hands.push({ cards: ['A', second], dealerUp: pick(random, [...hardDealer, 'A'] as DealerUp[]) });
    }
  }

  return hands;
}

/* ------------------------------------------------------------------ */
/* Resolving a hand on screen                                          */

/**
 * Cards drawn while a hand plays out, fixed by the seed, the hand and a slot.
 *
 * The player's hits take slots 0, 1, 2 and so on. The dealer draws from slot 100
 * upward, so the two never collide. Because a card depends on the hand and the slot
 * rather than on the action, two players who make the same choices see the same table.
 */
function drawSlot(seed: string, index: number, slot: number): Rank {
  const random = seededRandom(`${seed}:draw:${index}:${slot}`);
  const deck: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  return pick(random, deck);
}

/** The card the player's nth hit takes, counting from zero, on a given hand after a split. */
export function drawPlayer(seed: string, index: number, hit: number, handSlot = 0): Rank {
  return drawSlot(seed, index, handSlot * 20 + hit);
}

/** The card the dealer takes: zero is the hole card. */
export function drawDealer(seed: string, index: number, draw: number): Rank {
  return drawSlot(seed, index, 100 + draw);
}

export type DealerHand = {
  cards: Rank[];
  total: number;
  bust: boolean;
};

/**
 * The dealer's side of the table: the hole card, then draws to seventeen, standing on
 * soft seventeen. A dealer whose player has already busted only turns over the hole,
 * as at a real table.
 */
export function dealerTurn(
  seed: string,
  index: number,
  hand: DealtHand,
  playerBust: boolean,
): DealerHand {
  // The pinned table peeks, so a dealer natural ends the hand before the player
  // decides. Those hands never reach a player, and dealing one here would grade a
  // decision nobody could affect, so the hole card is redrawn past a natural.
  let holeSlot = 0;
  while (isNatural([hand.dealerUp, drawDealer(seed, index, holeSlot)]) && holeSlot < 20) {
    holeSlot += 1;
  }

  const cards: Rank[] = [hand.dealerUp, drawDealer(seed, index, holeSlot)];
  let read = readHand(cards);
  if (!playerBust) {
    let draw = holeSlot + 1;
    while (read.total < 17) {
      cards.push(drawDealer(seed, index, draw));
      draw += 1;
      read = readHand(cards);
    }
  }
  return { cards, total: read.total, bust: read.total > 21 };
}

/** An ace and a ten-value card: twenty-one in two cards. */
export function isNatural(cards: readonly Rank[]): boolean {
  return cards.length === 2 && readHand(cards).total === 21;
}

export type Outcome = 'blackjack' | 'win' | 'lose' | 'push';

/**
 * A natural beats any made twenty-one, pays 3:2 against a real stake, and ties only
 * another natural. The dealer's natural is handled by dealerTurn, which never deals one.
 */
export function outcomeOf(
  playerCards: readonly Rank[],
  playerTotal: number,
  playerBust: boolean,
  dealer: DealerHand,
): Outcome {
  const playerNatural = isNatural(playerCards);
  const dealerNatural = isNatural(dealer.cards);

  if (playerNatural && dealerNatural) return 'push';
  if (playerNatural) return 'blackjack';
  if (dealerNatural) return 'lose';
  if (playerBust) return 'lose';
  if (dealer.bust) return 'win';
  if (playerTotal > dealer.total) return 'win';
  if (playerTotal < dealer.total) return 'lose';
  return 'push';
}

/* ------------------------------------------------------------------ */
/* Playing and grading                                                 */

/** What the player sees for one hand. */
export type HandView = {
  index: number;
  total: number;
  soft: boolean;
  cards: readonly [Rank, Rank];
  dealerUp: DealerUp;
  canDouble: boolean;
  canSplit: boolean;
  endsAt: number;
};

export function viewOf(hand: DealtHand, index: number, endsAt: number): HandView {
  const read = readHand(hand.cards);
  return {
    index,
    total: read.total,
    soft: read.soft,
    cards: hand.cards,
    dealerUp: hand.dealerUp,
    canDouble: true,
    canSplit: false,
    endsAt,
  };
}

/** Points for a correct decision: base, a difficulty bonus, and speed. */
const BASE = 10;
const DIFFICULTY_BONUS = 5;
const MAX_SPEED = 5;

/** The spots where players actually differ: the 12 to 16 zone and every soft hand. */
export function isHardSpot(hand: DealtHand): boolean {
  const read = readHand(hand.cards);
  if (read.soft) return true;
  return read.total >= 12 && read.total <= 16;
}

function speedPoints(atMs: number, budgetMs: number): number {
  if (budgetMs <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, atMs / budgetMs));
  return Math.round(MAX_SPEED * (1 - ratio));
}

/**
 * Grade a played round. The script comes from the seed, never from the client, so a
 * score cannot be manufactured by sending better cards.
 */
export function gradeRound(
  script: readonly DealtHand[],
  decisions: ReadonlyArray<LoggedDecision | null>,
  config: RoundConfig = V0,
): RoundResult {
  const budgetMs = config.secondsPerHand * 1000;
  const hands: GradedHand[] = [];
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const times: number[] = [];

  script.forEach((hand, index) => {
    const decision = decisions[index] ?? null;
    const answer = correctAction(hand.cards, hand.dealerUp, { canDouble: true, canSplit: true });

    if (!decision) {
      unanswered += 1;
      hands.push({ index, cards: hand.cards, dealerUp: hand.dealerUp, taken: null, correct: answer, points: 0, verdict: null });
      return;
    }

    const right = decision.taken === answer;
    let points = 0;
    if (right) {
      correct += 1;
      points += BASE;
      points += speedPoints(decision.atMs, budgetMs);
      if (isHardSpot(hand)) points += DIFFICULTY_BONUS;
    } else {
      wrong += 1;
    }
    score += points;
    times.push(decision.atMs);
    hands.push({
      index,
      cards: hand.cards,
      dealerUp: hand.dealerUp,
      taken: decision.taken,
      correct: answer,
      points,
      verdict: right,
    });
  });

  times.sort((a, b) => a - b);
  const medianMs = times.length === 0 ? 0 : times[Math.floor(times.length / 2)]!;

  return {
    score,
    correct,
    wrong,
    unanswered,
    accuracy: script.length === 0 ? 0 : correct / script.length,
    medianMs,
    hands,
  };
}

/** Score comparison for a duel: points, then accuracy, then the faster median. */
export function compareResults(a: RoundResult, b: RoundResult): 'a' | 'b' | 'tie' {
  if (a.score !== b.score) return a.score > b.score ? 'a' : 'b';
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy ? 'a' : 'b';
  if (a.medianMs !== b.medianMs) return a.medianMs < b.medianMs ? 'a' : 'b';
  return 'tie';
}
