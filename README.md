# Quick Hand Logger

A mobile-first PWA for logging live poker hands in ~15 seconds and copying them as compact
[Poker Bankroll Tracker](https://pokerbankrolltracker.net) session notes:

```
eff 300 (60bb)
hero utg r 15 QcJc btn c
40 flop Th Tc 2h. x b 15 r 75 c
190 turn 5d b 150 f
```

Plain Vite + TypeScript, no framework, no backend. Everything is stored in `localStorage`
on the phone. The format rules are written down in `BRIEF.md` and in `src/core/format.ts`.

## Run locally

```sh
npm install
npm run dev          # http://localhost:5173 (also printed with your LAN address)
npm test             # golden + engine + fuzz (3000 random hands) + UI and tap-budget tests
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ (service worker active) at http://localhost:4173
```

To try it on your phone on the same Wi-Fi, run `npx vite --host` and open the LAN URL.
Over plain `http://` the phone won't install the app or run it offline, and copying uses
a fallback. For the real thing, deploy it (below) and open the `https://` URL.

## Using it

1. **Setup** (once per session): stakes, 6-max / 9-max, your position for the first hand,
   your stack, and optional villain labels/stacks per seat. Seats are numbered clockwise
   from yours (seat 1). Labels follow the seat as the button moves.
2. **Hand**: pick hero cards, then tap through the action. The highlighted chip is next to
   act. Tap a later chip to skip players; skipped players are folded. Bet/raise opens a
   number pad with quick sizes. When a betting round closes, the next card picker opens
   by itself. Preflop, **Flop ▸** deals the flop and folds everyone still pending.
3. **Copy** saves the hand to history and puts the note on the clipboard. **Next hand ▸**
   saves it and starts a new one (with the button moved one seat if auto-rotate is on).
4. **History**: copy, edit or delete hands, **Copy all**, export `.txt` / `.csv`.

Tap the pot on any street, or the `eff` button, to correct the value by hand.

## Deploy (free)

The build uses relative paths, so `dist/` works from any URL or sub-path.

**Netlify / Vercel**: import the repo. Build command `npm run build`, output directory `dist`.

**GitHub Pages** (what this repo uses): `.github/workflows/pages.yml` runs the tests, builds,
and deploys on every push to `main`. Live at https://tungi97.github.io/poker-hand-logger/.
For a fork: **Settings → Pages → Source: GitHub Actions**.

**Install on iPhone**: open the site in Safari → Share → **Add to Home Screen**. After the first
load it works offline. New versions are picked up the next time you open the app online.

## Project layout

```
src/core/      pure logic (unit tested)
  cards.ts       card codes and suit symbols
  positions.ts   position orders, seat <-> position mapping
  engine.ts      replays a hand's event log: pots, turn order, implicit folds, sizing
  format.ts      PBT note formatter (compact + verbose)
src/ui/        vanilla DOM views: hand, history, setup, card picker / number pad
src/store.ts   app state + localStorage
vite.config.ts also generates the offline service worker (sw.js)
tests/         golden + engine tests, and a jsdom smoke test that taps through a hand
scripts/make-icons.py  regenerates the PNG app icons (stdlib only)
```

A hand is stored as a list of events (actions and board cards), and everything else is
computed from that list. So **Undo** just drops the last event, and editing an old hand
replays it from scratch.
