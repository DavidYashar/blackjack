'use client';

import { useSyncExternalStore } from 'react';

import {
  roundsServerSnapshot,
  roundsSnapshot,
  subscribeRounds,
  type HandResult,
} from '@/lib/practice-history';

/**
 * Practice history in the Results tab: the last few rounds, at a glance.
 *
 * A round is one row: the score, when it happened, how many calls were right, and a
 * strip of six segments, one per hand, in its result colour. Six rows fit without
 * scrolling, which keeps the tab inside the platform's rule that only history may
 * scroll and stops the list from becoming a chore.
 */

const MAX_ROWS = 6;

const BAR: Record<HandResult, string> = {
  blackjack: 'bg-amber-300',
  win: 'bg-emerald-400',
  push: 'bg-neutral-300',
  lose: 'bg-red-500',
  unplayed: 'bg-neutral-700',
};

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ResultsList() {
  const rounds = useSyncExternalStore(subscribeRounds, roundsSnapshot, roundsServerSnapshot);

  if (rounds.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-neutral-400">No rounds yet.</p>
        <p className="text-xs text-neutral-600">Play a practice round and it lands here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-end px-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">
          last {Math.min(rounds.length, MAX_ROWS)}
        </span>
      </div>

      {rounds.slice(0, MAX_ROWS).map((round) => (
        <div
          key={round.id}
          className="rounded-[14px] border border-[#C9973F]/15 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums leading-none text-neutral-50">
              {round.score}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-600">points</span>
            <span className="ml-auto text-[11px] uppercase tracking-[0.14em] text-neutral-500">
              {when(round.at)}
            </span>
          </div>

          <p className="mt-1 text-[11px] text-neutral-400">
            {round.correct} of {round.total} calls right
          </p>

          <div className="mt-2 flex gap-1" aria-hidden="true">
            {round.hands.map((result, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${BAR[result] ?? BAR.unplayed}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
