'use client';

import { useEffect } from 'react';

import { Button } from '@/components/button';
import { buzz } from '@/lib/client/haptics';
import { playTap } from '@/lib/client/sfx';

/**
 * The help sheet behind the `?`.
 *
 * It slides up from the bottom edge and back down again, rather than appearing. The
 * sheet stays mounted and moves, so the same transition runs on open and on close
 * without any unmount timing to get wrong. One screen, no scrolling, and three ways
 * out: the button, the backdrop, and Escape.
 */

const CALLS = [
  { key: 'Hit', tone: 'key-cream', text: 'Take another card. Keep going while you are under 21.' },
  { key: 'Stand', tone: 'key-ink', text: 'Keep what you have. The dealer plays next.' },
  { key: 'Double', tone: 'key-gold', text: 'One more card, then stand. Only on your first two cards.' },
  { key: 'Split', tone: 'key-ghost', text: 'When both cards match, play them as two hands.' },
];

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 flex flex-col justify-end ${
        open ? '' : 'pointer-events-none'
      }`}
    >
      <button
        type="button"
        aria-label="Close help"
        tabIndex={open ? 0 : -1}
        onPointerDown={() => playTap()}
        onClick={() => {
          buzz('light');
          onClose();
        }}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        className={`relative max-h-[92dvh] overflow-hidden rounded-t-3xl border-t border-[#C9973F]/25 bg-[#0b2b1e] px-5 pb-[max(1.25rem,var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))] pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform motion-reduce:transition-none ${
          open ? '[transform:translateY(0)]' : '[transform:translateY(105%)]'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />

        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">How to play</h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Duel Dudes</span>
        </div>

        <p className="mt-2 text-[13px] leading-snug text-neutral-300">
          A round is <span className="text-neutral-100">six hands</span>, a minute each. You
          and your opponent are dealt the same six hands, so the cards are never the difference.
        </p>

        <div className="mt-4 space-y-2">
          {CALLS.map((call) => (
            <div key={call.key} className="flex items-center gap-3">
              <span
                className={`${call.tone} flex h-9 w-[76px] shrink-0 items-center justify-center rounded-[8px] text-[13px] font-semibold`}
              >
                {call.key}
              </span>
              <span className="text-[12px] leading-snug text-neutral-400">{call.text}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-[#C9973F]/20 bg-black/25 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/60">Scoring</p>
          <p className="mt-1 text-[12px] leading-snug text-neutral-300">
            <span className="text-neutral-100">10</span> for a call the table agrees with, up to{' '}
            <span className="text-neutral-100">5</span> more for speed, and{' '}
            <span className="text-neutral-100">5</span> on the hard hands. Twenty a hand, one
            hundred and twenty a round.
          </p>
        </div>

        <p className="mt-3 text-[12px] leading-snug text-neutral-400">
          Practice is <span className="text-neutral-100">free</span>, has no entry and no limit, and
          your last six rounds stay under Results. The dealer draws to 17 and stands on a soft 17.
        </p>


        <div className="mt-4">
          <Button onClick={onClose} className="key key-cream w-full">
            Got it
          </Button>
        </div>
      </section>
    </div>
  );
}

/** The `?` that opens it. */
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="How to play"
      onPointerDown={() => playTap()}
      onClick={() => {
        buzz('selection');
        onClick();
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#C9973F]/30 bg-black/20 text-sm font-semibold text-emerald-100/80"
    >
      ?
    </button>
  );
}
