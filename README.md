# Duel Dudes

Six blackjack hands, a minute each, scored on your calls. A phone game, one screen, no account, no server, no money.

## Play

```bash
npm install
npm run dev      # http://localhost:3000
```

`npm run dev` opens the game at `/`, which redirects to `/app`.

## The game

- **Six hands** per round, each with **one decision**: hit, stand, double, or split a pair.
- **60 seconds a hand.** The clock starts when the cards land, runs while you decide, stops when the hand is finished. The gauge under the header drains with it.
- **3 seconds between hands**, with the hand's verdict on the felt: `WIN`, `LOSE`, `PUSH`, `BLACKJACK`.
- The round is scored when the sixth hand ends, and the last six rounds stay under **Results**, on the device.

### Scoring

| Event | Points |
|---|---|
| Correct call, by the basic strategy table | 10 |
| Speed, a share of 5 falling off across the minute | 0 to 5 |
| Hard spot: any soft hand, hard 12 to 16 | 5 |
| Wrong call | 0 |
| Unanswered or timed out | 0 |

20 a hand, **120 a perfect round**. A hand can win on the felt and score zero, and lose and score 20: the score asks who called it better, not who the cards favoured.

Rules pinned in `src/lib/blackjack/strategy.ts`: 6 decks, dealer stands on soft 17, double after split, no surrender, dealer peeks, blackjack pays 3:2.

## Where things live

```
src/app/                  the shell, the one surface, globals
src/components/blackjack/ practice, cards, table, help, results
src/lib/blackjack/        rules, deck, scoring, review copy
src/lib/practice-history  the last six rounds, in localStorage
src/lib/client/           sound, haptics
public/cards, public/sound
```

## Gates

```bash
npm run typecheck && npm run lint && npm run build
npm test          # 114 tests: strategy, scoring, deck, dealer
```
