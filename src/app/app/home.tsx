'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { TabbedScreen } from '@/components/tabbed-screen';
import { HelpButton, HelpSheet } from '@/components/blackjack/help-sheet';
import dynamic from 'next/dynamic';

// The round is clocks, timers and audio; there is nothing to render on a server.
const Practice = dynamic(() => import('@/components/blackjack/practice').then((m) => m.Practice), {
  ssr: false,
});
import { ResultsList } from '@/components/blackjack/results-list';
import { TableFelt } from '@/components/blackjack/table';
import { buzz } from '@/lib/client/haptics';
import { playTap, unlockSfx } from '@/lib/client/sfx';

/**
 * The app's surface. `?play=practice` opens the game full-bleed; everything else is
 * the home tab. Gameplay and results render outside TabbedScreen, as the anatomy
 * asks, so they get the whole frame.
 *
 * The felt and the gold frame are fixed behind the whole surface, header and tabs
 * included, so the app is one table rather than a page with a green panel in it.
 */

export function Home() {
  const router = useRouter();
  const params = useSearchParams();
  const playing = params.get('play') === 'practice';
  const helpOpen = params.get('help') === '1';

  const openHelp = () => router.push('/app?help=1');
  const closeHelp = () => {
    if (window.history.length > 1) router.back();
    else router.replace('/app');
  };

  if (playing) {
    return <Practice onExit={() => router.replace('/app')} />;
  }

  const startPractice = () => {
    // The tap that starts a round is also the gesture that lets audio run.
    unlockSfx();
    buzz('light');
    router.push('/app?play=practice');
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* the table, behind everything, header and tabs included */}
      <div className="pointer-events-none fixed inset-0 isolate z-0">
        <TableFelt rail={false} />
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(0,16,10,0.42)]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_44%,rgba(0,0,0,0.46)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-2 rounded-[24px] border border-[#C9973F]/25"
        />
      </div>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <TabbedScreen
          header={
            <header className="flex items-center justify-between">
              <HelpButton onClick={openHelp} />
              <span className="text-[10px] uppercase tracking-[0.24em] text-emerald-100/40">
                Duel Dudes
              </span>
            </header>
          }
          tabs={[
            {
              id: 'play',
              label: 'Play',
              content: (
                <div className="flex h-full flex-col items-center pt-2">
                  <div className="flex flex-col items-center">
                    <span className="text-xl leading-none text-[#C9973F]">♠</span>
                    <p className="mt-2 text-[14px] text-emerald-100/75">
                      Same six hands. Best calls win.
                    </p>
                  </div>

                  {/* the two sides of a duel, rendered as a scene and lit from above */}
                  <div className="relative flex flex-1 items-center justify-center">
                    {/* Light behind the cards: a cone from above, and the pool it makes
                        where the cards meet the felt. Two ellipses do the work. */}
                    <div
                      aria-hidden="true"
                      className="hero-light pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(58,190,110,0.78),rgba(22,120,68,0.24)_42%,transparent_72%)] blur-[26px]"
                    />
                    <div
                      aria-hidden="true"
                      className="hero-light pointer-events-none absolute left-1/2 top-[62%] h-[110px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(112,232,150,0.78),rgba(44,150,82,0.20)_48%,transparent_78%)] blur-[18px]"
                    />

                    {/* Two cards, one from each side of the table, meeting in the
                        middle before the light comes up on them. */}
                    <div className="relative aspect-[720/852] w-[182px] max-w-full select-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/cards/KH.webp"
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        width={444}
                        height={666}
                        className="hero-right absolute left-[35%] top-[2%] w-[66%] drop-shadow-[0_16px_22px_rgba(0,0,0,0.45)]"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/cards/AS.webp"
                        alt="An ace of spades in front of a king of hearts"
                        draggable={false}
                        width={444}
                        height={666}
                        className="hero-left absolute left-[5%] top-[13%] w-[69%] drop-shadow-[0_18px_26px_rgba(0,0,0,0.5)]"
                      />
                    </div>
                  </div>

                  <div className="w-full space-y-2 pb-1">
                    <button
                      type="button"
                      onPointerDown={() => {
                        unlockSfx();
                        playTap();
                      }}
                      onClick={startPractice}
                      className="key key-gold w-full gap-2 text-[17px]"
                    >
                      ▶ Play
                    </button>
                    <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-emerald-100/40">
                      Six hands · a minute each
                    </p>
                  </div>
                </div>
              ),
            },
            {
              id: 'results',
              label: 'Results',
              scroll: true,
              content: <ResultsList />,
            },
          ]}
        />
      </div>

      <HelpSheet open={helpOpen} onClose={closeHelp} />
    </div>
  );
}
