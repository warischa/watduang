# gh#203 — play-route composition readings at 1440x900

Recorded from `scripts/play-screen-fit-probe.mjs` on a real `dist/` (built with `npm run build`),
served on `localhost:4322`, driven through `scripts/driver.mjs` on CDP port 9333. Every row below was
read at a viewport asserted to be `innerWidth === 1440` at the moment of the read, on this Mac.

**This file exists because the screenshots do not survive.** `.gitignore` excludes
`docs/verification/evidence/**/*.png`, so the eleven `<route>-1440x900-first-game-screen.png` images
this run wrote beside it are on disk and untracked. The numbers are the record; the images are a
convenience for whoever still has the working tree.

## What the numbers are, and what they are NOT

They are readings of the repo's own RESOLVED CSS and of the layout boxes it produced — a computed
frame cap, a grid track count, and the x-extents of the active screen's composition units. Nothing
here is derived from a glyph extent, which is the whole reason it exists beside `widthFillPct`: the
recorded machine-to-machine disagreement on the ink numbers (a KNOWN_OVERFLOW_X row reading 145px on
the CI runner against 43px here, and another moving between 0px and 75px) makes any threshold over
them unusable, and the site owner ruled on 2026-09-04 that this ticket family needs a different
number or a per-route verdict rather than a threshold.

So **no value below is gated.** The probe gates exactly one thing about them: that every route the
leg walked produced a row at all. Whether a route SHOULD be composed differently is an owner verdict,
not something this instrument decides.

## The readings

`ranges` = non-overlapping x-ranges among the active screen's composition units. `span` = their
merged x-extent over the frame's width. `tracks` = resolved `grid-template-columns` count, 0 when the
screen is not a grid.

| route | frame cap | screen the walk landed on | display | tracks | units | ranges | span | side-by-side |
|---|---|---|---|---|---|---|---|---|
| cannon-flag | none | `div.interstitial-card` | flex | 0 | 6 | 1 | 0.132 | no |
| cursed-number | none | `section#screenHandoff.screen.active` | flex | 0 | 2 | 1 | 0.978 | no |
| dice-loser | none | `div#app` (reset dialog open) | flex | 0 | 2 | 1 | 0.460 | no |
| freeze-tap | none | `div.rule-reveal-container` | flex | 0 | 4 | 1 | 0.518 | no |
| how-close-is-near | none | `div.card` | block | 0 | 5 | 1 | 0.949 | no |
| pinocchio-luck | none | `main#app` | grid | 1 | 2 | 1 | 0.542 | no |
| power-meter | none | `div.glass-card` | block | 0 | 6 | 1 | 0.465 | no |
| short-stick | none | `div.container.draw-layout` | block | 0 | 3 | 1 | 0.511 | no |
| timebomb | none | `main.tb-main` (reset dialog open) | flex | 0 | 2 | 1 | 0.389 | no |
| wire-snip-panic | none | `div#screen-game.screen.active` | grid | 2 | 4 | 2 | 0.942 | **YES** |
| zero-trigger | none | `section#screen-game.screen.active` | grid | 2 | 5 | 2 | 0.372 | **YES** |

**The frame cap column is uniform, and that is a finding rather than a dead field.** No route's mockup
root resolves to a pixel cap at 1100px and up: every phone column on this site is pinned one or two
levels BELOW the frame, on the screen containers. The worse-making leg below is what proves the field
can still move, because a column where every member agrees calibrates nothing.

## Calibration

**Positive control — `wire-snip-panic` must read as composed, and does.** It is the one route
carrying the full token set from `docs/agents/desktop-sizing-decisions.md` plus both structural rules
that release the phone column. Read: 2 tracks (`936px 420px`), 4 units in 2 x-ranges, span 0.942.
The screenshot shows the bomb chassis left and the HUD rail right, which is what the row claims.

**Must-red — `pinocchio-luck` must NOT read as composed, and does not.** Its theatre curtain fills
the window as a CSS background on pseudo-elements plus absolutely positioned layers, while the play
surface stays a centred column. Read: 1 track, 2 units in 1 x-range, span 0.542. A version of this
reading that counted backgrounds, or took a wrapper's bounding box where it should collapse to the
content, reports this route at span 1.0 — and an earlier iteration of this instrument did exactly
that on two other routes before the units were collapsed onto their own innermost multi-unit
descendant. The two calibration routes disagree on the same run from the same code, which is the only
thing that makes either verdict mean anything.

**Worse-making leg.** `wire-snip-panic`'s own desktop block was re-pinned from `max-inline-size: none`
to `520px`, rebuilt, and re-read. The reading moved in the predicted direction: frame cap `none` ->
`520px`, frame width 1440 -> 520, and the board track collapsed `936px` -> `16px` while the rail kept
its 420px and overflowed the pinned column. The file was then restored and the clean reading
reproduced byte-identically (`936px 420px`, span 0.942), so the mutant left nothing behind.

**Control leg.** `BREAK_WALK=1` produces a composition row for all eleven routes labelled `setup` and
deliberately writes no screenshot, so a control run cannot overwrite a walking run's named images.

## What these readings do not cover

* **The screen is the one the walk reached, not the round's main screen.** `cannon-flag` landed on a
  pass-the-device interstitial and `dice-loser` and `timebomb` on a setup screen with their reset
  confirmation dialog open. Those rows describe what was on screen, which is not the same claim as
  "this is how the game composes while a round is being played".
* **One machine, one run per recorded row.** The values are font-independent by construction, but
  they have not been read on the CI runner, so that is an inference from how they are computed and
  not a measurement of agreement.
* **A visible out-of-flow box carrying text counts as a unit.** A full-window toast or a labelled
  modal backdrop would widen the span, and the row would then describe the overlay rather than the
  screen beneath it.
* **Whether a one-range route is defective is not answered here.** Two of them cap a single-column
  markup deliberately, with committed arithmetic and a declared reason for having no rail; the
  reading cannot tell that apart from a route nobody has looked at.
