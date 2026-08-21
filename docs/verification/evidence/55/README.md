# gh#55 — does `#clear-choice` collapsing above `#stage` pull a live control under the finger?

**Verdict: REFUTED for both configurations tested.** 0 of 98 scanned points hit an interactive element
inside `#stage`, for siamsi/roster-3 and for timebomb/roster-3. The concern is still filed as
[#55](https://github.com/warischa/watduang/issues/55), because what makes it safe is horizontal
position, not an enforced invariant.

## What was run

`clear-cancel-collision-probe.mjs`, headless Chromium over CDP, against a local `npx serve dist/`.
`PROBE_GAME` / `PROBE_ROSTER_SIZE` env vars select the config; the scan/tap logic is identical across
every run below.

**2 genuinely distinct configurations**, both at a real device-metrics viewport 320×568
(`innerWidth` asserted in the output, not a `--window-size` resize — see
`docs/agents/browser-verification.md` for why that distinction decides the result):

| File | Game | Roster | Points scanned | Collisions |
|---|---|---|---|---|
| `result.json` | siamsi | 3 | 98 | 0 |
| `result-timebomb-3.json` | timebomb | 3 | 98 | 0 |

For each: roster seeded on-origin, round started, the per-game start button clicked so `#stage`
carried a live control (`#ss-draw` / `#tb-pass`), `#clear-choice` opened, then ยกเลิก tapped with a
real touch tap, then a 4px-step grid-scan across the whole pre-collapse `#clear-cancel` box resolved
with `document.elementFromPoint` after the collapse.

Grid-scan rather than a centre-line sample on purpose: a centre-line probe on this repo has passed
before while colliding anchors sat a few px off axis.

## The numbers

| | siamsi/3 | timebomb/3 |
|---|---|---|
| `#clear-cancel` before collapse | `x 124.1–176.3`, `y 246.9–270.9` (52×24) | `x 115.97–168.09`, `y 224.88–248.88` (52×24) |
| Stage control after collapse | `#ss-draw` `x 8–59.4`, `y 267.9–291.9` | `#tb-pass` `x 8–54.41`, `y 267.88–291.88` |
| Points scanned | 98 | 98 |
| Points hitting a `#stage` control | **0** | **0** |

siamsi's `#ss-draw` overlaps in the **vertical** axis — its top edge (267.9) sits above the scan box's
bottom edge (270.9), ~65px horizontal separation is what prevents a hit. timebomb does not overlap
vertically at all (19px gap, top of `#tb-pass` at 267.88 vs scan box bottom 248.88), with ~61.6px
horizontal separation on top of that — a wider margin than siamsi, not a narrower one.

## Roster size is a dead axis for this hazard

`result-roster-invariance.json` re-ran timebomb at roster 5. Its rects are byte-identical to
`result-timebomb-3.json` (only `rosterSize`/`rosterCheck` differ) because `#player-setup` is `hidden`
by the time the scan runs — roster size cannot move a rect it is no longer painting. **Roster size
does not affect this measurement, and this file is therefore not a second coverage data point** —
it is evidence that this axis is dead, kept so a future session does not re-drive it expecting a
different answer.

## Positive control

`result-positive-control.json`: the same scan re-aimed at the live `#stage` control's own
post-collapse rect (siamsi/3, `PROBE_POSITIVE_CONTROL=1`) instead of `#clear-cancel`'s box — proves
the scan/tap apparatus can report a hit at all. **78 of 91** scanned points landed on `#ss-draw`.
Verdict is `CONTROL_PASSED` — a distinct verdict string from `CONFIRMED`/`REFUTED` on purpose, so a
grep for either never conflates "the apparatus works" with "the bug is real". (In positive-control
mode the probe reports `CONTROL_FAILED` if the scan ran but found no hit — apparatus broken — and
`CONTROL_INCONCLUSIVE` if the stage control was missing before the scan could even start; the three
never share a verdict string.)

## Why this is not a vacuous zero

A broken probe reports 0 collisions exactly like a real refutation. Three things in `result.json`
and `result-timebomb-3.json` separate them:

- Every precondition is recorded, not assumed: `widthCheck.innerWidth`, `rosterCheck`,
  `mounted.rootHidden`, `mounted.ssStart`, `turnEntered`, `postState.clearChoiceHidden`
- `stageBefore` and `stageAfter` both list the live control with its rect — so there *was* a control
  to hit
- `nonCollisionSample` records what `elementFromPoint` actually returned at each sampled point. Those
  points resolve to stage-internal elements (`P`, `DIV#stage`) with `inStage: true` — the scan landed
  **inside** the stage, it just did not land on the button. A probe returning nulls would look like a
  pass and is not what happened here.
- The positive control above proves the same scan machinery reports a nonzero count when the target
  genuinely overlaps — the "0"s above are not a probe that can only ever say zero.

## Screenshots are deliberately not committed

Three frames were captured and reviewed for the siamsi run (`1-before-clear-tap.png`,
`2-clear-choice-open.png`, `3-after-cancel-tap.png`). `.gitignore` excludes
`docs/verification/evidence/**/*.png` because the JSON log is the evidence when an inspector produced
one. Its carve-out is for runs with **no** inspector, where the image is the only artifact — that is
why gh#50's iOS WebKit frames are committed and these are not. This run had CDP, so the rule applies
as written.

## What this does NOT cover

- Only siamsi and timebomb, only at roster 3 (roster 5 shown to be equivalent, see above), only at
  320px.
- Other games' stage controls may sit at a different x-range; nothing enforces that they stay narrow
  and left-aligned.
- Rendered geometry at other viewport widths.
