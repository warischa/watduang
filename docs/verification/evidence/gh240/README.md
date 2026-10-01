# gh#240 — dice-loser idle dice: dimmed random faces, measured

Measured 2026-10-01 on the worktree branch at commit `a0aa709` (the implementation; this evidence
directory was committed after it), against a real `npm run build` served by `npx serve@14 dist/ -l 4377`.
Chrome/154.0.8037.59, `--headless --disable-gpu --no-sandbox`, own CDP port 9377 and own profile;
the reduced lane adds `--force-prefers-reduced-motion`. Not a WebGL route, so `--disable-gpu` picks
no code path here. One Chrome at a time; no other probe was running (ports 4321, 9222, 4377 and
9377 were checked free before launch and after teardown).

## What changed

`renderTurn` in `src/play/dice-loser/main.ts` used to reset every die to face 0 (no pips). It now
draws each die a decorative face from `idleFace()` (a local helper, never `rollDice`, never the
`rolls` map) and passes `idle = true` to `renderPips`, which is the one place the `is-idle` class
is set or cleared. The roll timer's real result calls `renderPips` without the flag, so the dimming
lifts only when the actual roll lands; `roll()` tumbles the still-dimmed idle faces.

`src/play/dice-loser/play.css` dims `.dl-die.is-idle` with `filter: brightness(0.4)` (token
`--dl-die-idle-filter`). Not `opacity`: the reduced-motion tumble animates `opacity` from 1, and the
counterfactual below shows that override happening.

## Reproduce

```
npm run build
npx serve@14 dist/ -l 4377 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
  --remote-debugging-port=9377 --user-data-dir=<scratch>/prof-default &
CDP_PORT=9377 SITE=http://localhost:4377 LANE=default node scripts/driver.mjs docs/verification/evidence/gh240/idle-dim-probe.mjs > docs/verification/evidence/gh240/default-probe.json
node docs/verification/evidence/gh240/pixel-read.mjs docs/verification/evidence/gh240/default-probe.json
# relaunch Chrome with --force-prefers-reduced-motion and a fresh profile, then LANE=reduced;
# opacity-alternative-probe.mjs runs in that same reduced Chrome.
```

`idle-dim-probe.mjs` sets a real 320x640 viewport, wipes storage on the origin and reloads, taps
`#dl-begin` (more than 400ms after its reveal), reads the dice, screenshots, then taps `#dl-roll`
and samples die 1 on every animation frame through the tumble and the landing.

## Numbers

Viewport, both lanes: `innerWidth` 320, `clientWidth` 320, `scrollWidth` 320; storage keys after
the wipe 0; console errors 0. `reducedMotion` read in the page: default `false`, reduced `true`.

Computed style and screenshot pixels (`pixels.tsv`; the face pixel is inside the die padding, where
no pip can sit; `dieMeanGrey` is ImageMagick's grey mean over the die box):

| lane | state | class | `filter` | face pixel | die mean grey (die 1 / 2 / 3) |
|---|---|---|---|---|---|
| default | idle first turn | `dl-die is-idle` | `brightness(0.4)` | `srgb(99,100,101)` | 0.3169 / 0.2978 / 0.2990 |
| default | landed | `dl-die` | `none` | `srgb(248,250,252)` | 0.8770 / 0.7447 / 0.9215 |
| reduced | idle first turn | `dl-die is-idle` | `brightness(0.4)` | `srgb(99,100,101)` | 0.3518 / 0.3157 / 0.3518 |
| reduced | landed | `dl-die` | `none` | `srgb(248,250,252)` | 0.8346 / 0.7447 / 0.7899 |

Idle pips on (die 1/2/3): default 4/5/5, reduced 2/4/2. Landed pips on: default 2/5/1, matching the
announced `ทอยได้ 2 5 1`; reduced 3/5/4, matching `ทอยได้ 3 5 4`. Die 2 shows 5 pips in both default
readings, so its 0.2978 vs 0.7447 compares the same face idle and rolled.

Frame trace of die 1 (`trace` in each probe JSON):

| lane | phase | frames | `filter` seen | opacity min..max | frames rolling without `is-idle` |
|---|---|---|---|---|---|
| default | idle before roll | 11 | `brightness(0.4)` | 1..1 | 0 |
| default | rolling | 37 | `brightness(0.4)` | 1..1 (transform animated on all 37) | 0 |
| default | landed | 73 | `none` | 1..1 | 0 |
| reduced | idle before roll | 13 | `brightness(0.4)` | 1..1 | 0 |
| reduced | rolling | 7 | `brightness(0.4)` | 0.850015..1 (no transform: the reduced tumble ran) | 0 |
| reduced | landed | 102 | `none` | 1..1 | 0 |

While idle, both lanes: score text empty, the current pill reads the seat name only, the live region
reads exactly `ถึงตาของ แมวส้ม แล้ว` (the existing turn line), the roll control is on screen.

**Counterfactual** (`reduced-opacity-alternative.json`): the rejected rule
`.dl-die.is-idle { filter: none; opacity: 0.4 }` injected into the live page, reduced lane. Idle
frames read opacity 0.4 (12 frames); all 7 rolling frames, still `is-idle` and still showing the
decorative face, read 0.849968..1. An opacity dim would have shown the idle face undimmed through
the reduced tumble, which is why the shipped rule uses `filter`.

Screenshots: the probe writes four PNGs next to itself (`<lane>-idle-first-turn.png`,
`<lane>-landed.png`). They are **not committed** — `.gitignore` keeps CDP probe screenshots out of
the evidence tree because a CDP probe can always emit JSON — so `pixels.tsv` is the committed record
of what was read off them, and the reproduce block above regenerates them. All four were opened and
looked at on 2026-10-01: default idle showed three grey dice with black pips (4, 5, 5) above the
roll control, default landed three white dice (2, 5, 1) and the total line; reduced idle grey dice
(2, 4, 2), reduced landed white dice (3, 5, 4).

## Must-red

`src/play/dice-loser/idle-faces.test.mjs` executes the real `main.ts` module and drives the first
turn, a later turn and a tiebreak turn through the route's own click listeners. Two mutants of the
one reset line in `renderTurn`, each run against that test alone, then restored (`git diff` empty):

- back to the blank reset, `renderPips(el, 0)` — `must-red-blank-reset.txt`, rc 1, failing line:
  `first turn: #dl-die-1 shows 0 pips on before the roll -- an idle die must show a face (1..6 pips), not a blank`
- faces but no dimming, `renderPips(el, idleFace())` — `must-red-faces-undimmed.txt`, rc 1:
  `first turn: #dl-die-1 is not marked is-idle, so its idle face is not dimmed`

Restored tree: the four route test files, 14 tests, 14 pass, 0 fail.

## Not covered

iOS WebKit was not driven. The probe measured the first turn of round one only; the later-turn
and tiebreak paths are covered by the unit test's executed module, not by a browser.
