# gh#181 box 7 — 1440x900 readings and per-route verdicts

Captured 2026-09-07 at commit `7f654f7`. `git rev-list --count d2e2dcc..HEAD -- src public` is 0, so
`src` and `public` at that commit are what is deployed — these are readings of the live site.

**The numbers in this file are the record. The PNGs beside it are not.** `.gitignore` ignores
`docs/verification/evidence/**/*.png` and its own comment states the reason: probe screenshots
regenerate on every evidence run, the JSON logs are the evidence, and a CDP probe never qualifies for
the single carve-out (gh#50's iOS WebKit frames) precisely because it can always emit JSON. The PNGs
here are working artifacts for the owner's own look under box 8.

**How these numbers were produced, stated plainly.** A driven CDP session, transcribed by hand into
this file. **No script emitted them**, and this directory carries no JSON log, unlike siblings such as
`77-81`. `scripts/play-screen-fit-probe.mjs` did not produce them and does not measure what box 7
asks for. So the regeneration path is another driven pass at the same viewport, not a command — if you
need these PNGs back, they have to be re-driven. That is a weaker artifact than the convention wants,
and it is named here rather than implied.

## Route set

The eight routes commit `d2e2dcc` touched, enumerated by
`git show --stat --format= d2e2dcc | grep -oE 'src/play/[a-z-]+' | sort -u`, per the owner ruling of
2026-09-05 that this ticket covers all eight routes the instrument measures.

Note the wording gap: the restated box 7 still says "all four routes", carried over from the ticket's
title. The 2026-09-05 ruling says eight. Eight were measured. The owner is asked to state "eight" once.

## Method

`npm run build`, then `npx serve dist/` and headless Chrome over CDP. Before **every** measurement,
`window.innerWidth === 1440 && window.innerHeight === 900` was asserted **in the page**, because a
`--window-size` flag sets the window without reflowing the layout and a screenshot of that lies.
Every screen was reached through the route's own player controls, never by calling past the trigger.

**Frame selector, corrected.** `docs/agents/desktop-sizing-decisions.md` says the root is "`#app`, or
`#app-container` on the routes that use that id", and `scripts/play-screen-fit-probe.mjs` carries
`ROOT_SEL` as `'#app, #app-container, #appRoot'`. Read from each route's `markup.html`, the split is:
`#app-container` on `cannon-flag`, `power-meter` and `zero-trigger`; `#app` on `dice-loser`,
`freeze-tap`, `pinocchio-luck`, `short-stick` and `timebomb`. An earlier version of this file claimed
`#app-container` on all eight. That was wrong, and the correction matters: **the capture return named
only `#app-container`, so for the five `#app` routes this record does not pin which element the frame
number came from.** Those five rows are therefore reported below as viewport-width readings with the
element unpinned, not as sourced root measurements. Tightening that needs another driven pass.

`widthFillPct` from `scripts/play-screen-fit-probe.mjs` is **not** an input to any verdict here. The
probe's own header declares it deliberately unpinned: it moved 89.2 to 100 across two consecutive runs
on `cannon-flag`, because these games advance on their own clock.

## Readings

| route | screen read | frame | board | rail | verdict |
|---|---|---|---|---|---|
| `cannon-flag` | play surface, not named by the return | 1440 (`#app-container`) | canvas 1440, full-bleed | none, reason in file | reads-as-designed |
| `dice-loser` | play surface, not named by the return | 1440, element unpinned | `.dl-play` 662, cap match | none, `NO RAIL TOKEN` in file | reads-as-designed |
| `freeze-tap` | round screen | 1440, element unpinned | surface 1440, full-bleed | none, reason in file | reads-as-designed — **see the readouts observation below** |
| `pinocchio-luck` | question screen, 3D stage | 1440, element unpinned | `#stageFrame` 780, cap match | none, reason in file | reads-as-designed |
| `power-meter` | play surface, not named by the return | 1440 (`#app-container`) | `#view-root` 744, cap match | none, reason in file | reads-as-designed |
| `short-stick` | play surface, not named by the return | 1440, element unpinned | `.draw-layout` 800, cap match | none, reason in file | reads-as-designed |
| `timebomb` | play surface, not named by the return | 1440, element unpinned | `.tb-canvas` 560, margins 440/440 | none, reason in file | reads-as-designed |
| `zero-trigger` | board-and-rail play grid | 1408 (`#app-container`) | 320 + gap 28 + rail 380 | 380, token match | reads-as-designed — **see the template departure below** |

All seven no-rail reasons were checked as genuinely written in that route's own file — `overrides.css`
on five, the `NO RAIL TOKEN` paragraphs in `play.css` for `dice-loser` and `timebomb`. None is an
inference presented as the file's words.

## Disclosures — each was a wrong or missing claim in an earlier pass

**`zero-trigger`'s frame reads 1408, not 1440, and that is real geometry.** Its `body` sets
`padding-left` and `padding-right` to `max(16px, env(safe-area-inset-*))` at top level with no
enclosing media query, and its `overrides.css` never touches `body`, so the value is never zeroed for
desktop — unlike `cannon-flag`, which resets padding to 0. 1440 − 32 = 1408. A first reading was taken
with the result modal open and was suspected to be `.modal-backdrop`'s content box; re-measured with
`#modal-result` at `display: none` and the backdrop's rect at 0, the root still reads 1408. **The
suspicion was wrong** and is recorded so it is not re-raised.

**`zero-trigger` departs from the standard's rule-2 template, and the verdict names why that is
allowed.** `#screen-game.active` uses
`grid-template-columns: minmax(0, var(--zt-board-max-inline)) var(--zt-rail-inline)` with
`justify-content: center`, not the standard's `minmax(0, 1fr)`. The declared tokens match their
values, but a token match is a consistency check, not a rule. With `--zt-desktop-gap` at 28px the grid
spans 320 + 28 + 380 = **728px**, centred in 1408, leaving about **340px** each side.

The basis for the verdict is **rule 3**, which the 2026-09-06 delegation is the ruling that assigns to
an agent: the layout is uniform, centred and consistent across the screen, with no non-uniform
stretch. Rule 2 is departed from deliberately. That is not new on this ticket — the 2026-09-06 table
already recorded `timebomb` as "Rule 2 declined as a layout choice, not a sizing one" and `short-stick`
as "Rules 1 and 2 unmet and it still reads as designed". This row follows that precedent rather than
inventing an allowance, and the departure is disclosed rather than absorbed, because the owner's box-8
look is what decides whether it reads as designed.

**`zero-trigger`'s result modal: the row does not wrap, the label does.** `#btn-next-round` measures
179.5x126.1px and `#btn-result-menu` 165.4x126.1px, identical top and bottom, so the pair sits on one
row at 1440 — the handoff's wrap hypothesis is measured **false for the row**. But `#btn-next-round`'s
Thai label runs **three lines** inside it, beside a one-line label in its neighbour. Instrument note:
`span.getClientRects().length` read 1 for that label; a `Range` over the trailing text node read 3.
The rect count is the wrong instrument for a line count.

**`pinocchio-luck` needs software WebGL to render truthfully.** Default headless Chrome has no WebGL,
and the first capture was the fallback: a notice reading
`อุปกรณ์นี้ไม่รองรับ WebGL — เกมยังเล่นได้ด้วยภาพหุ่นแบบเรียบง่าย` over a flat puppet, overlapping
`#panel`. Recaptured with `--use-gl=swiftshader --enable-unsafe-swiftshader --use-angle=swiftshader`,
confirmed in-page (`webgl2` and `webgl1` both present, the route's own canvas holding a live context
with a 780x468 backing store), the real 3D render appears and the notice's overlap of `#panel`
disappears with it. **So that overlap is a fallback-only artifact, not a layout defect** — and any
future capture of this route without those flags judges a render players never see.

**`freeze-tap`: the 2026-09-06 verdict is re-examined and upheld, and a separate observation is new.**
That comment adjudicated this route's uncapped sixth container as reads-as-designed — "the tap target
**is** that full-bleed surface", the 260px circle carrying `pointer-events: none` as a colour readout.
Re-examined here on the post-`d2e2dcc` capture at `7f654f7`, that reasoning still holds. Stating it
that way matters, because the ticket's own last comment records that prior visual verdicts are stale
as statements about the present; this is a fresh look reaching the same conclusion, not a carryover.

For the record, `d2e2dcc` did **not** land only type raises on this route: it also raised
`.btn-primary`'s block padding from 16px to 20px. An earlier version of this file said otherwise.

An earlier pass here proposed flipping the verdict to needs-edit, citing the route's "all five screen
containers take one measure" comment. That was the wrong reason: the file **enumerates** its five
containers — setup, rule-reveal, pass, result, leaderboard — so the round screen is deliberately
outside that list, not omitted by oversight.

The observation that is genuinely new, and which the 2026-09-06 comment did not consider: at 1440 the
two top readouts sit pinned to opposite frame edges, roughly 1200px apart, around a centred 260px
circle. The mechanism is `.game-hud-top` at `width: 100%` with `justify-content: space-between`. The
same Thai string is echoed in a centred bar at the bottom, so the information is available near
centre. Whether this reads as designed is what `docs/agents/desktop-sizing-decisions.md` reserves for
the owner in its "what this scheme does NOT decide" section, and the screenshot is the artifact for
that judgment. The block a change would edit is headed **gh#183**, not this ticket.

**`cannon-flag`'s cap wording, corrected.** An earlier version said "no cap declared". A cap **is**
declared — `style.css` caps `#app-container` at 900px — and the desktop override removes it with
`max-width: none`, with the full-bleed reason written in that override's own block header. The verdict
is unchanged; the description was wrong.

## Residuals a future pass should tighten

1. The frame element is unpinned on the five `#app` routes (see Method). Their 1440 is a
   viewport-width reading.
2. The screen read is named for only three of eight rows, because the capture return did not name it
   per row.
3. There is no JSON log and no scripted regeneration path (see the top of this file).

## What this did not cover

Box 2's 320px width fill: not measured. The 2026-09-04 ruling records that box as answered, the
2026-09-06 comment re-lists it as unverified, and `cursed-number` — one of its two subjects — is
outside these eight routes. That conflict is the owner's to settle in one place, and a 320px reading
would close nothing until they do.

Box 1: unevaluable as written, awaiting an owner restatement, so "fills the window" was not available
as a criterion. Only `zero-trigger`'s frame reading touches that question, and its departure is
disclosed above rather than scored.

Box 8: the owner's own look. These PNGs exist for it; they are not committed, per the reason at the
top of this file.

No route's source was edited. No fix was applied. Nothing was measured at any viewport other than
1440x900.
