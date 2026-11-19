# Duel Dudes

A standalone phone game: six blackjack hands, a minute each, scored on the calls.
No account, no server, no money.

- `npm run dev` serves it; `/` redirects to `/app`.
- The game is `src/components/blackjack/practice.tsx`; scoring is `src/lib/blackjack/round.ts`.
- Gates before shipping: `npm run typecheck && npm run lint && npm run build && npm test`.
