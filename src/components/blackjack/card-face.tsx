import { useEffect, useState } from 'react';

import { BACK_ART, cardArt, isRed, type Card, type Suit } from '@/lib/blackjack/deck';
import type { Rank } from '@/lib/blackjack/strategy';

/**
 * A playing card. It shows the shipped artwork when the deck has a picture for that
 * rank and suit, and falls back to a drawn face otherwise, so the game still works
 * with an incomplete deck.
 */

const WIDTH = { lg: 'w-[96px]', md: 'w-[74px]', sm: 'w-[54px]' } as const;

const GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

const WIDTH_CLASS = { lg: 'w-[96px]', md: 'w-[74px]', sm: 'w-[54px]' } as const;

/** A card that arrives from the shoe. The wrapper animates so the card keeps its own rotation. */
export function DealtCard({ children, delayMs = 0 }: { children: React.ReactNode; delayMs?: number }) {
  return (
    <div className="card-deal" style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}

/** The dealer's second card: face down until the hand is settled, then it turns over. */
export function HoleCard({
  card,
  revealed,
  size = 'md',
  stacked = false,
}: {
  card: Card;
  revealed: boolean;
  size?: keyof typeof WIDTH_CLASS;
  stacked?: boolean;
}) {
  const [turned, setTurned] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const id = requestAnimationFrame(() => setTurned(true));
    return () => cancelAnimationFrame(id);
  }, [revealed]);

  const face = cardArt(card);
  const shell = `relative ${WIDTH_CLASS[size]} aspect-[2/3] shrink-0 [perspective:700px] ${
    stacked ? '-rotate-3' : ''
  }`;

  return (
    <div className="card-deal" style={{ animationDelay: '120ms' }}>
      <div className={shell}>
        <div
          className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${
            turned ? '[transform:rotateY(180deg)]' : ''
          }`}
        >
          <img
            src={BACK_ART}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full rounded-lg object-cover ring-1 ring-black/30 [backface-visibility:hidden]"
          />
          {face ? (
            <img
              src={face}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full rounded-lg object-cover ring-1 ring-black/20 [backface-visibility:hidden] [transform:rotateY(180deg)]"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CardFace({
  card,
  stacked = false,
  size = 'md',
}: {
  card: Card;
  /** Slight rotation, so two cards read as a hand rather than a table. */
  stacked?: boolean;
  /** sm for a hand that may grow past three cards. */
  size?: keyof typeof WIDTH;
}) {
  const art = cardArt(card);
  const red = isRed(card.suit);

  if (art) {
    return (
      <img
        src={art}
        alt=""
        draggable={false}
        className={`block ${WIDTH[size]} aspect-[2/3] shrink-0 select-none rounded-lg bg-neutral-50 object-cover shadow-[0_2px_0_rgba(0,0,0,0.35)] ring-1 ring-black/20 ${
          stacked ? '-rotate-3' : ''
        }`}
      />
    );
  }

  return (
    <div
      className={`relative flex aspect-[2/3] ${WIDTH[size]} shrink-0 flex-col items-center justify-center rounded-lg bg-neutral-50 shadow-[0_2px_0_rgba(0,0,0,0.35)] ring-1 ring-black/20 ${
        stacked ? '-rotate-3' : ''
      }`}
    >
      <span
        className={`absolute left-1.5 top-1 text-lg font-bold leading-none ${
          red ? 'text-red-600' : 'text-neutral-900'
        }`}
      >
        {card.rank}
      </span>
      <span className={`text-3xl leading-none ${red ? 'text-red-600' : 'text-neutral-900'}`}>
        {GLYPH[card.suit]}
      </span>
    </div>
  );
}

/**
 * A hand of cards. The first three sit in a row; a fourth onward tucks into a row
 * below, overlapping the one above so the hand reads as one stack rather than a
 * strip that runs off the phone.
 */
export function CardHand({
  cards,
  size = 'md',
  holeIndex,
  holeRevealed = false,
  dealOffsetMs = 0,
  openingCount = 2,
  addedStepMs = 140,
  addedStartMs = 0,
}: {
  cards: readonly Card[];
  size?: keyof typeof WIDTH;
  /** Position of the dealer's face-down card, if this hand has one. */
  holeIndex?: number;
  holeRevealed?: boolean;
  /** Where this hand starts in the deal, so two hands do not land together. */
  dealOffsetMs?: number;
  /** Cards this hand was dealt with. Later cards are not part of that sequence. */
  openingCount?: number;
  /** Gap between cards drawn after the opening deal. */
  addedStepMs?: number;
  /** When the first drawn card arrives, after whatever happens first. */
  addedStartMs?: number;
}) {
  // Three to a row, the next row tucked under the one above. No shrinking: a hand
  // grows downward instead of sideways.
  const perRow = 3;
  const rows: Card[][] = [];
  for (let i = 0; i < cards.length; i += perRow) rows.push(cards.slice(i, i + perRow));

  // The opening cards follow the deal sequence; a card drawn later does not wait
  // behind it, it lands at once and then steps by 140 ms.
  const delayFor = (position: number) =>
    position < openingCount
      ? dealOffsetMs + position * 280
      : addedStartMs + (position - openingCount) * addedStepMs;

  return (
    <div className="flex flex-col items-start">
      {rows.map((row, r) => (
        <div
          key={r}
          className={`flex gap-1 ${r > 0 ? '-mt-[26px] ml-1 drop-shadow-[0_-2px_3px_rgba(0,0,0,0.6)]' : ''}`}
        >
          {row.map((card, i) => {
            const position = r * 3 + i;
            if (holeIndex === position) {
              return (
                <HoleCard
                  key={`${r}-${i}`}
                  card={card}
                  revealed={holeRevealed}
                  size={size}
                  stacked={r === 0 && i === 0}
                />
              );
            }
            return (
              <DealtCard key={`${r}-${i}`} delayMs={delayFor(position)}>
                <CardFace card={card} stacked={r === 0 && i === 0} size={size} />
              </DealtCard>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Convenience for a single card built from a rank and suit. */
export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}
