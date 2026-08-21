# gh#55 — does `#clear-choice` collapsing above `#stage` pull a live control under the finger?

**Verdict: REFUTED for the configuration tested.** 0 of 98 scanned points hit an interactive element
inside `#stage`. The concern is still filed as [#55](https://github.com/warischa/watduang/issues/55),
because what makes it safe is horizontal position, not an enforced invariant.

## What was run

`clear-cancel-collision-probe.mjs`, headless Chromium over CDP, against a local `npx serve dist/`.

- Real device-metrics viewport 320×568 — `innerWidth` asserted in the output, not a `--window-size`
  resize (see `docs/agents/browser-verification.md` for why that distinction decides the result)
- Game: **siamsi**, roster of 3 seeded on-origin, round started, `#ss-start` clicked so `#stage`
  carried a live control (`#ss-draw`)
- `#clear-choice` opened, then ยกเลิก tapped with a real touch tap
- 98 points grid-scanned across the whole pre-collapse `#clear-cancel` box at 4px steps in both axes,
  resolved with `document.elementFromPoint` after the collapse

Grid-scan rather than a centre-line sample on purpose: a centre-line probe on this repo has passed
before while colliding anchors sat a few px off axis.

## The numbers

| | |
|---|---|
| `#clear-cancel` before collapse | `x 124.1–176.3`, `y 246.9–270.9` (52×24) |
| `#ss-draw` after collapse | `x 8–59.4`, `y 267.9–291.9` |
| Points scanned | 98 |
| Points hitting a `#stage` control | **0** |

`#ss-draw` does overlap in the **vertical** axis — its top edge (267.9) sits above the scan box's
bottom edge (270.9). Only the horizontal gap prevents a hit.

## Why this is not a vacuous zero

A broken probe reports 0 collisions exactly like a real refutation. Three things in `result.json`
separate them:

- Every precondition is recorded, not assumed: `widthCheck.innerWidth`, `rosterCheck`,
  `mounted.rootHidden`, `mounted.ssStart`, `turnEntered`, `postState.clearChoiceHidden`
- `stageBefore` and `stageAfter` both list `#ss-draw` with its rect — so there *was* a control to hit
- `nonCollisionSample` records what `elementFromPoint` actually returned at each sampled point. Those
  points resolve to `P` and to `DIV#stage` with `inStage: true` — the scan landed **inside** the stage,
  it just did not land on the button. A probe returning nulls would look like a pass and is not what
  happened here.

## Screenshots are deliberately not committed

Three frames were captured and reviewed (`1-before-clear-tap.png`, `2-clear-choice-open.png`,
`3-after-cancel-tap.png`). `.gitignore` excludes `docs/verification/evidence/**/*.png` because the JSON
log is the evidence when an inspector produced one. Its carve-out is for runs with **no** inspector,
where the image is the only artifact — that is why gh#50's iOS WebKit frames are committed and these
are not. This run had CDP, so the rule applies as written.

## What this does NOT cover

- siamsi only, at 3 players, at 320px. `timebomb` was not driven.
- Other games' stage controls may sit at a different x-range; nothing enforces that they stay narrow
  and left-aligned.
- Rendered geometry at other viewport widths.
