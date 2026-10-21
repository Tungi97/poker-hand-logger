# Quick Hand Logger (for Poker Bankroll Tracker notes)

## Goal
A super fast hand logger I use **on my phone at a live table** (mid-session). I tap through a hand in ~15-20 seconds and get a compact text I copy-paste into a Poker Bankroll Tracker (PBT) session hand note. PBT has no write API, so clipboard text is the integration.

## Output format (match my existing PBT notes exactly in style)
One line per street, lowercase, pot at start of each postflop street:
```
hero utg r 15 QcJc btn c
40 flop Th Tc 2h. x b 15 r 75 c
190 turn 5d b 150 f
```
```
utg r 15 hero hj AsKd r 55 chris btn c utg c
170 flop Ad7d6s. x x b 60 f c
290 turn 3s. x b 200 c
690 river Qs x x
chris shows 7h6h
```
(Example 2 as the app now writes it — see "Format rules (revised)" below:)
```
utg r 15 hero hj AsKd r 55 chris btn c utg c
170 flop Ad7d6s. x x chris b 60 f c
290 turn 3s. x chris b 200 c
690 river Qs x chris x
chris shows 7h6h
```
Rules: positions lowercase (utg, utg1, mp, lj, hj, co, btn, sb, bb); actions r/b/c/x/f/allin; cards as rank+suit letter (As Kd Tc). Optional villain name/label before position (e.g. "chris btn"). Optional showdown line "<villain> shows XxYy". Optional one-line tag/comment at end. Also offer a "verbose" toggle that writes full words (raises to, bets, calls) and suit symbols ♠♥♦♣.

### Format rules (revised after first use)
- First line states the effective stack in play, e.g. `eff 300 (60bb)`: hero's stack capped by the deepest villain who plays (unknown villain stacks count as covering hero). Editable per hand; omitted when no stack is known.
- Villain labels are written only for players who do more than fold. A labelled player who only folds preflop is written by position (`btn f sb f bb f`, not `jan sb f`).
- Players who continue keep their label on every street: `chris btn` on first mention preflop, `chris` after that, and postflop actions are prefixed with the label (`x x chris b 60 f c`). Hero and unlabelled players stay bare postflop.
- Skipped preflop players are folded and not written; skipped postflop players are written as `f`.
- Hero's cards follow hero's action when hero acts first in the hand (`hero utg r 15 QcJc`), otherwise they follow the position (`hero hj AsKd r 55`).
- The board is followed by `.` on every street except the last one dealt.
- Flop spacing is a setting: `Th Tc 2h` (default) or `Ad7d6s`.
- Example 1 is played at 5/5 (pot 40 = 15 + 15 + 10 blinds); example 2 at 2/3 (pot 170 = 3 x 55 + 5).

## Must-haves
- Mobile-first PWA, works offline, installable to home screen, big tap targets, dark mode, one-handed.
- Look: neutral, classy palette (charcoal/graphite, off-white text, muted gold accent), clean typography, no green.
- Setup once per session: stakes (e.g. 5/5 CHF), table size (6-max / 9-max full ring), my default position rotation, optional villain labels saved per seat.
- Card picker: 4x13 grid, tap rank+suit quickly, used cards greyed out.
- Action flow: per street, tap position chips in order + action + amount (number pad with quick buttons). Preflop primary buttons: open 2.5x / 3x / 4x the big blind, or 3x / 3.5x / 4x the raise when facing one (3-bets), plus pot. Postflop: 1/4, 1/3, 1/2, 2/3, 3/4, pot. Auto-track pot so the street-start pot is computed automatically (editable).
- Skip folded preflop players automatically, no need to log every fold.
- Big "Copy" button -> clipboard; history list of hands this session (local storage), edit/delete, "copy all".
- Undo last action.
- Optional: export session hands as .txt/CSV.

## Nice to have
- Leak tags quick-select (sizing, bluff, hero call, thin value, tilt).
- Auto stack-depth/effective bb display.

## Tech
Keep it simple: plain static web app (Vite + TypeScript or vanilla) with no backend, deployable free (GitHub Pages/Vercel/Netlify) so I can open it on my iPhone. Write tests for the text formatter (use the two examples above as golden tests). Include a README with run + deploy steps.
