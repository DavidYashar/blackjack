'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/button';
import { buzz } from '@/lib/client/haptics';
import { DEAL_TOTAL_MS, DEALER_DRAW_MS, DEALER_LAND_MS, play, playDealSequence } from '@/lib/client/sfx';
import { explainHand } from '@/lib/blackjack/review';
import {
  V0,
  dealerTurn,
  drawPlayer,
  gradeRound,
  handScript,
  outcomeOf,
  type DealtHand,
  type DealerHand,
  type LoggedDecision,
  type Outcome,
  type RoundResult,
} from '@/lib/blackjack/round';
import { readHand, type Action, type Rank } from '@/lib/blackjack/strategy';

import { CardHand } from './card-face';
import { cardArt, dealSuits } from '@/lib/blackjack/deck';
import { saveRound, type HandResult } from '@/lib/practice-history';
import { TableFelt } from './table';

/**
 * Free practice: twelve hands, thirty seconds each, played out the way a table would.
 * Hit as often as you like under twenty-one, split a pair once, double on two cards,
 * then stand. The dealer plays after you and the verdict waits for you.
 *
 * Each hand has its own clock, running from the deal to your opening decision. The
 * score is on that opening decision, which is what basic strategy describes; the cards
 * after it are the consequence.
 *
 * It renders fixed to the viewport so the playing surface reaches all four edges, and
 * pads its own HUD for the safe area.
 */

const SHELL =
  'fixed inset-0 z-40 flex flex-col bg-neutral-950 px-5 pb-[max(1.25rem,var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))] pt-[max(1.5rem,var(--safe-area-inset-top,env(safe-area-inset-top)))]';

/** The dealer's reveal: hole card first, then the verdict. */
const STAGE_DEALER_MS = 420;

const VERDICT: Record<Outcome, { word: string; tone: string; note: string }> = {
  blackjack: { word: 'BLACKJACK', tone: 'text-amber-300', note: 'Natural, best hand' },
  win: { word: 'WIN', tone: 'text-emerald-400', note: '' },
  lose: { word: 'LOSE', tone: 'text-red-500', note: '' },
  // A tie is not a loss: equal totals hand the stake back.
  push: { word: 'PUSH', tone: 'text-neutral-300', note: 'Tie, no one wins' },
};

type Hand = {
  cards: Rank[];
  total: number;
  soft: boolean;
  bust: boolean;
  closed: boolean;
  doubled: boolean;
  /** Cards this hand has taken, for its place in the seeded draw order. */
  hits: number;
};

type Table = {
  hands: Hand[];
  /** The hand acting now. */
  active: number;
  dealer: DealerHand | null;
  outcomes: Outcome[] | null;
  timedOut: boolean;
};

function newSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readHandState(cards: Rank[]): Hand {
  const read = readHand(cards);
  return {
    cards,
    total: read.total,
    soft: read.soft,
    bust: read.total > 21,
    closed: false,
    doubled: false,
    hits: 0,
  };
}

function isPair(cards: readonly Rank[]): boolean {
  return cards.length === 2 && readHand(cards).pair !== null;
}

function dealtTable(hand: DealtHand): Table {
  return { hands: [readHandState([...hand.cards])], active: 0, dealer: null, outcomes: null, timedOut: false };
}

export function Practice({ onExit }: { onExit: () => void }) {
  const [seed, setSeed] = useState(newSeed);
  const script = useMemo(() => handScript(seed, V0), [seed]);
  const [index, setIndex] = useState(0);
  const [table, setTable] = useState<Table>(() => dealtTable(script[0]!));
  const [result, setResult] = useState<RoundResult | null>(null);
  const [outcomes, setOutcomes] = useState<HandResult[]>([]);
  const [remaining, setRemaining] = useState(V0.secondsPerHand);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  /** How many of the dealer's cards are on the felt. */
  const [dealerShown, setDealerShown] = useState(2);
  /** How many of them have finished landing, which is what the total counts. */
  const [dealerCounted, setDealerCounted] = useState(1);

  const decisions = useRef<Array<LoggedDecision | null>>(new Array(script.length).fill(null));
  const handResults = useRef<Array<HandResult | null>>(new Array(script.length).fill(null));
  /** The clock runs only until the opening decision, and never again for this hand. */
  const [deciding, setDeciding] = useState(true);
  const handShownAt = useRef(0);
  const finished = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();
    const graded = gradeRound(script, decisions.current, V0);
    const results = handResults.current.map((r) => r ?? 'unplayed');
    setOutcomes(results);
    saveRound({
      id: `${Date.now()}`,
      at: Date.now(),
      score: graded.score,
      correct: graded.correct,
      total: script.length,
      hands: results,
    });
    setResult(graded);
    buzz(graded.accuracy >= 0.7 ? 'success' : 'warning');
  }, [script]);

  /** The dealer plays once, and every hand on the table gets its verdict. */
  const settle = useCallback(
    (hands: Hand[], timedOut: boolean) => {
      const dealt = script[index]!;
      const allBust = hands.every((hand) => hand.bust);
      const dealer = dealerTurn(seed, index, dealt, allBust);
      const outcomes = hands.map((hand) => outcomeOf(hand.cards, hand.total, hand.bust, dealer));

      handResults.current[index] = timedOut
        ? 'unplayed'
        : outcomes.includes('blackjack')
          ? 'blackjack'
          : outcomes.includes('win')
            ? 'win'
            : outcomes.every((o) => o === 'push')
              ? 'push'
              : outcomes.includes('push')
                ? 'push'
                : 'lose';

      setTable((prev) => ({ ...prev, hands, dealer, outcomes, timedOut }));
      setDeciding(false);
      setStage(0);
      buzz(timedOut ? 'warning' : hands.some((hand) => hand.bust) ? 'heavy' : 'selection');

      // The hole card turns first, then one drawn card every half second. Each card
      // is counted a beat after it lands, never before, so the total on screen is
      // always the total of the cards already face up.
      const draws = Math.max(0, dealer.cards.length - 2);
      const land = DEALER_LAND_MS;
      timers.current.push(
        window.setTimeout(() => {
          setDealerShown(2);
          setStage(1);
        }, STAGE_DEALER_MS),
        window.setTimeout(() => setDealerCounted(2), STAGE_DEALER_MS + land),
      );
      for (let i = 1; i <= draws; i += 1) {
        const at = STAGE_DEALER_MS + DEALER_DRAW_MS * i;
        timers.current.push(
          window.setTimeout(() => setDealerShown(2 + i), at),
          window.setTimeout(() => setDealerCounted(2 + i), at + land),
        );
      }
      timers.current.push(
        window.setTimeout(
          () => setStage(2),
          STAGE_DEALER_MS + DEALER_DRAW_MS * draws + land + 200,
        ),
      );
    },
    [index, script, seed],
  );

  /** Close the acting hand and move on, or settle when the last one is done. */
  const advance = useCallback(
    (hands: Hand[], active: number) => {
      const nextActive = hands.findIndex((hand, i) => i > active && !hand.closed);
      if (nextActive === -1) {
        settle(hands, false);
      } else {
        setTable((prev) => ({ ...prev, hands, active: nextActive }));
      }
    },
    [settle],
  );

  // Two cards to the dealer, then two to the player: one slide each.
  useEffect(() => {
    playDealSequence();
  }, [index]);

  // One clock per hand, running from the deal to the opening decision.
  useEffect(() => {
    if (!deciding || finished.current) return;
    const tick = window.setInterval(() => {
      const left = V0.secondsPerHand - (performance.now() - handShownAt.current) / 1000;
      if (left <= 0) {
        window.clearInterval(tick);
        setRemaining(0);
        setDeciding(false);
        settle(
          table.hands.map((hand) => ({ ...hand, closed: true })),
          true,
        );
      } else {
        setRemaining(Math.min(V0.secondsPerHand, left));
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [deciding, settle, table.hands]);

  useEffect(() => {
    // The clock begins once the four cards are on the felt.
    handShownAt.current = performance.now() + DEAL_TOTAL_MS;
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, [seed]);

  // Every card that arrives after the opening deal gets the same sound, and so does
  // the dealer turning the hole card face up.
  const seen = useRef({ hand: -1, player: 0, dealer: 0, hole: false });

  useEffect(() => {
    const player = table.hands.reduce((count, hand) => count + hand.cards.length, 0);
    const holeOpen = Boolean(table.dealer) && stage >= 1;
    const dealer = stage >= 1 && table.dealer ? table.dealer.cards.length : 1;
    const previous = seen.current;

    if (previous.hand !== index) {
      // A new hand is dealt; the opening sequence already covers those cards.
      seen.current = { hand: index, player, dealer, hole: holeOpen };
      return;
    }

    const flipped = holeOpen && !previous.hole;
    const turned = flipped ? 1 : 0;
    const playerAdded = Math.max(0, player - previous.player);
    const dealerAdded = Math.max(0, dealer - previous.dealer - turned);

    // The hole card turning over has its own sound, and only ever that.
    if (flipped) play('place', { gain: 0.9 });

    // The player's cards land at once, one after another.
    for (let i = 0; i < Math.min(playerAdded, 4); i += 1) {
      play('deal', { delayMs: 140 * i, gain: 0.85, seconds: 0.26 });
    }

    // The dealer turns first, then draws: nothing overlaps the turn.
    for (let i = 0; i < Math.min(dealerAdded, 4); i += 1) {
      play('deal', {
        delayMs: (flipped ? DEALER_DRAW_MS : 0) + DEALER_DRAW_MS * i,
        gain: 0.85,
        seconds: 0.26,
      });
    }

    seen.current = { hand: index, player, dealer, hole: holeOpen };
  }, [index, stage, table]);

  const answer = (taken: Action) => {
    // `deciding` only gates the clock. Play continues after the opening decision,
    // which is what makes hits and split hands usable.
    if (finished.current || table.outcomes !== null) return;
    const hand = table.hands[table.active];
    if (!hand || hand.closed) return;

    // The graded call is the opening decision of the dealt hand. The clock keeps
    // running through hits, though: it measures the hand, not the first tap.
    if (decisions.current[index] === null) {
      decisions.current[index] = { atMs: performance.now() - handShownAt.current, taken };
    }

    if (taken === 'stand') {
      const hands = table.hands.map((h, i) => (i === table.active ? { ...h, closed: true } : h));
      advance(hands, table.active);
      return;
    }

    if (taken === 'split') {
      const [first, second] = hand.cards as [Rank, Rank];
      const split: Hand[] = [
        readHandState([first, drawPlayer(seed, index, 0, 0)]),
        readHandState([second, drawPlayer(seed, index, 0, 1)]),
      ];

      // Split aces take one card each and stand, as at every table.
      if (first === 'A') {
        split.forEach((h) => {
          h.closed = true;
        });
        settle(split, false);
        return;
      }

      buzz('light');
      setTable((prev) => ({ ...prev, hands: split, active: 0 }));
      return;
    }

    // Hit or double: one card on the acting hand.
    const drawn = drawPlayer(seed, index, hand.hits, table.active);
    const cards = [...hand.cards, drawn];
    const updated = readHandState(cards);
    const closed = taken === 'double' || updated.bust || updated.total === 21;
    const next: Hand = {
      ...updated,
      hits: hand.hits + 1,
      doubled: taken === 'double',
      closed,
    };

    buzz(updated.bust ? 'heavy' : 'light');
    const hands = table.hands.map((h, i) => (i === table.active ? next : h));

    if (closed) advance(hands, table.active);
    else setTable((prev) => ({ ...prev, hands }));
  };

  /** Take the next hand: everything resets, including its own clock. */
  const next = () => {
    if (!table.outcomes || stage < 2) return;
    clearTimers();
    setDeciding(true);
    buzz('light');

    if (index + 1 >= script.length) {
      finish();
      return;
    }

    handShownAt.current = performance.now();
    setRemaining(V0.secondsPerHand);
    setStage(0);
    setIndex(index + 1);
    setTable(dealtTable(script[index + 1]!));
  };

  const restart = () => {
    clearTimers();
    finished.current = false;
    setDeciding(true);
    decisions.current = new Array(script.length).fill(null);
    setIndex(0);
    setResult(null);
    setRemaining(V0.secondsPerHand);
    setStage(0);
    setSeed(newSeed());
    setTable(dealtTable(script[0]!));
    buzz('light');
  };

  if (result) {
    return (
      <ResultView
        result={result}
        seed={seed}
        outcomes={outcomes}
        onRestart={restart}
        onExit={onExit}
      />
    );
  }

  const dealt: DealtHand | undefined = script[index];
  if (!dealt) return null;

  const settled = table.outcomes !== null;
  const fraction = Math.max(0, Math.min(1, remaining / V0.secondsPerHand));
  const holeKnown = Boolean(table.dealer) && stage >= 1;
  const dealerRanks = table.dealer && stage >= 1 ? table.dealer.cards : [dealt.dealerUp];
  const dealerCards = dealSuits(seed, index, dealerRanks, 100);
  const shownDealer = holeKnown
    ? dealerCards.slice(0, Math.max(2, dealerShown))
    : [dealerCards[0]!, { rank: dealerCards[0]!.rank, suit: dealerCards[0]!.suit }];
  const counted = stage >= 1 ? dealerCards.slice(0, dealerCounted) : [];
  const dealerTotal = counted.length && dealerCounted > 1 ? readHand(counted.map((c) => c.rank)).total : null;
  const dealerComplete = Boolean(table.dealer) && dealerCounted >= dealerCards.length;
  // The mark answers one question: did the round go your way. It is not the grade;
  // that belongs to the result page.
  const mark: Outcome | null = !table.outcomes || stage < 2
    ? null
    : table.outcomes.includes('blackjack')
      ? 'blackjack'
      : table.outcomes.every((o) => o === 'push')
        ? 'push'
        : table.outcomes.includes('win')
          ? 'win'
          : 'lose';
  const active = table.hands[table.active];
  const canHit = !settled && Boolean(active) && !active!.closed && active!.total < 21;
  // Double after split is allowed: the pinned table says so.
  const canDouble = !settled && Boolean(active) && !active!.closed && active!.cards.length === 2;
  const canSplit = !settled && table.hands.length === 1 && isPair(table.hands[0]!.cards);
  const split = table.hands.length > 1;

  return (
    <div className={SHELL}>
      <TableFelt rail={false} />
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-emerald-100/50">
        <button
          type="button"
          onClick={() => {
            buzz('light');
            onExit();
          }}
          className="-ml-1 flex items-center gap-1 px-1 py-1 text-neutral-500"
        >
          <span aria-hidden="true">←</span> End
        </button>
        <span>
          Hand {index + 1} of {script.length}
        </span>
        <span className={settled ? 'text-neutral-600' : remaining <= 10 ? 'text-amber-400' : ''}>
          {settled || !deciding ? 'held' : `${Math.ceil(remaining)}s`}
        </span>
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${remaining <= 10 ? 'bg-amber-400' : 'bg-neutral-300'}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center py-3">
        {mark ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[57%] z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <ResultMark outcome={mark} />
          </div>
        ) : null}
        <div className="flex w-full max-h-[470px] flex-1 flex-col items-center justify-between">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/60">
            Dealer
            {dealerTotal !== null ? (
              <>
                {' · '}
                <span className="text-base font-semibold tracking-normal text-emerald-50">
                  {dealerTotal}
                </span>
              </>
            ) : null}
          </span>
          <CardHand
            key={`dealer-${index}`}
            addedStepMs={0}
            addedStartMs={0}
            cards={shownDealer}
            size={split ? 'sm' : 'md'}
            holeIndex={1}
            holeRevealed={holeKnown}
          />
        </div>

        {/* A fixed box, so the hand's top stays put and extra rows grow downward
            into the felt below it rather than lifting the whole hand. */}
        <div className="flex h-[158px] w-full flex-col items-center justify-start gap-1">
        {table.hands.map((hand, i) => {
          const verdict = table.outcomes && stage >= 2 ? VERDICT[table.outcomes[i]!] : null;
          const isActive = !settled && i === table.active;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span
                className={`text-[10px] uppercase tracking-[0.2em] ${
                  isActive ? 'text-amber-300' : 'text-neutral-500'
                }`}
              >
                {split ? `Hand ${i + 1} · ` : 'Your hand · '}
                <span className="text-base font-semibold tracking-normal text-emerald-50">{hand.total}</span>
                {hand.doubled ? ' · doubled' : ''}
              </span>
              <CardHand
                key={`hand-${index}-${i}`}
                dealOffsetMs={split ? 0 : 560}
                cards={dealSuits(seed, index, hand.cards, i * 10)}
                size={split ? 'sm' : 'md'}
              />

              <div className="flex h-7 items-center">
                {verdict && table.timedOut ? (
                  <span className="text-[10px] uppercase tracking-[0.16em] text-amber-400">
                    Out of time
                  </span>
                ) : settled && table.dealer && stage >= 1 && dealerComplete ? (
                  <span className="text-xs text-neutral-400">
                    {table.dealer.bust ? 'Dealer busts' : `Dealer stands on ${dealerTotal}`}
                  </span>
                ) : hand.bust ? (
                  <span className="text-xs text-red-500">Bust</span>
                ) : hand.closed ? (
                  <span className="text-xs text-neutral-500">Stand</span>
                ) : isActive ? (
                  <span className="text-xs text-neutral-500">Your move</span>
                ) : null}
              </div>
            </div>
          );
        })}
        </div>

        </div>
      </div>

      {/* The action area keeps the height of two key rows, so swapping the four keys
          for one cannot move the table above it. */}
      <div className="flex min-h-[132px] flex-col justify-end">
        {settled ? (
          <Button
            onClick={next}
            disabled={stage < 2}
            className="key key-cream key-in w-full"
          >
            Next hand
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-x-2 gap-y-4">
            <Button onClick={() => answer('hit')} disabled={!canHit} className="key key-cream">
              Hit
            </Button>
            <Button onClick={() => answer('stand')} className="key key-ink">
              Stand
            </Button>
            <Button onClick={() => answer('double')} disabled={!canDouble} className="key key-gold">
              Double
            </Button>
            <Button onClick={() => answer('split')} disabled={!canSplit} className="key key-ghost">
              Split
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The round's result, as a mark rather than a word.
 *
 * Shape carries the meaning and colour reinforces it, so it still reads for a
 * colour-blind player. Whether the call was right is a different question, and it
 * belongs to the result page.
 */
const MARK_TONE: Record<Outcome, string> = {
  blackjack: 'text-amber-300',
  win: 'text-emerald-400',
  push: 'text-neutral-300',
  lose: 'text-red-500',
};

function ResultMark({ outcome }: { outcome: Outcome }) {
  const word = outcome === 'blackjack' ? 'BLACKJACK' : outcome === 'push' ? 'PUSH' : outcome === 'win' ? 'WIN' : 'LOSE';

  return (
    <span
      className={`mark-in font-black uppercase leading-none tracking-[0.22em] ${MARK_TONE[outcome]} ${
        outcome === 'blackjack' ? 'text-[26px]' : 'text-[30px]'
      }`}
      style={{
        textShadow: '0 2px 10px rgba(0,0,0,0.55), 0 1px 1px rgba(0,0,0,0.45)',
      }}
    >
      {word}
    </span>
  );
}

const OUTCOME_DISC: Record<HandResult, { bg: string; ink: string }> = {
  blackjack: { bg: 'bg-amber-300', ink: 'text-amber-950' },
  win: { bg: 'bg-emerald-400', ink: 'text-emerald-950' },
  push: { bg: 'bg-neutral-300', ink: 'text-neutral-900' },
  lose: { bg: 'bg-red-500', ink: 'text-red-50' },
  unplayed: { bg: 'bg-neutral-600', ink: 'text-neutral-200' },
};


function ScoreDial({ score, max }: { score: number; max: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const target = score;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 700);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const size = 128;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0.02, Math.min(1, shown / max));

  return (
    <div className="relative flex h-[128px] w-[128px] items-center justify-center">
      <svg viewBox="0 0 128 128" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="#C9973F"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-4xl font-black tabular-nums leading-none text-neutral-50">{shown}</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
          of {max}
        </span>
      </div>
    </div>
  );
}

function HandThumb({ seed, hand }: { seed: string; hand: RoundResult['hands'][number] }) {
  const player = dealSuits(seed, hand.index, hand.cards, 0);
  const dealer = dealSuits(seed, hand.index, [hand.dealerUp], 100)[0]!;

  return (
    <div className="flex items-center gap-[3px]">
      {player.map((c, i) => (
        <img
          key={`p${i}`}
          src={cardArt(c)}
          alt=""
          draggable={false}
          className="h-11 w-auto rounded-[4px] ring-1 ring-black/40"
        />
      ))}
      <span className="px-0.5 text-[9px] uppercase tracking-[0.1em] text-neutral-600">vs</span>
      <img
        src={cardArt(dealer)}
        alt=""
        draggable={false}
        className="h-12 w-auto rounded-[4px] ring-1 ring-black/40"
      />
    </div>
  );
}

function ResultView({
  result,
  seed,
  outcomes,
  onRestart,
  onExit,
}: {
  result: RoundResult;
  seed: string;
  outcomes: readonly HandResult[];
  onRestart: () => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className={SHELL}>
      <TableFelt rail={false} />

      <div className="flex flex-col items-center">
        <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-100/60">Practice round</p>
        <div className="mt-2">
          <ScoreDial score={result.score} max={result.hands.length * 20} />
        </div>
      </div>

      <div data-scroll="" className="mt-3 flex-1 space-y-2 overflow-y-auto pb-4">
        {result.hands.map((hand, i) => {
          const outcome = outcomes[i] ?? 'unplayed';
          const disc = OUTCOME_DISC[outcome] ?? OUTCOME_DISC.unplayed;
          const explanation = explainHand(hand.cards, hand.dealerUp, hand.taken ?? 'stand');
          const isOpen = open === hand.index;
          const timedOut = hand.taken === null;

          return (
            <div
              key={hand.index}
              className="card-deal relative overflow-hidden rounded-[14px] border border-[#C9973F]/15 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              style={{ animationDelay: `${60 + i * 60}ms` }}
            >
              <button
                type="button"
                onClick={() => {
                  buzz('selection');
                  setOpen(isOpen ? null : hand.index);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${disc.bg} ${disc.ink}`}
                >
                  {hand.index + 1}
                </span>

                <HandThumb seed={seed} hand={hand} />

                <span
                  className={`min-w-0 flex-1 text-xs leading-tight ${
                    timedOut
                      ? 'text-amber-300/90'
                      : hand.verdict
                        ? 'text-emerald-300/90'
                        : 'text-red-300/90'
                  }`}
                >
                  {timedOut ? 'no call' : hand.verdict ? 'right call' : 'wrong call'}
                </span>

                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  {hand.points > 0 ? `+${hand.points}` : '0'}
                </span>

                <svg
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform duration-200 ${
                    isOpen ? 'rotate-90' : ''
                  }`}
                >
                  <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
              >
                <div className="overflow-hidden">
                  <p className="px-3 pb-3 text-[11px] leading-snug text-neutral-400 line-clamp-3">
                    {timedOut
                      ? `Out of time. ${hand.correct} was the play. `
                      : hand.verdict
                        ? `${hand.taken} was right. `
                        : `${hand.correct} was the play. `}
                    {explanation.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={onRestart} className="key key-cream">
          Again
        </Button>
        <Button onClick={onExit} className="key key-ghost">
          Done
        </Button>
      </div>
    </div>
  );
}
