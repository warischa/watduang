# 320x568 overflow block budget — six play routes

Measured this session, headless Chrome 152, CDP device-metrics emulation (`session.setWidth(320,568)`,
`innerWidth` re-asserted 320 on every read — browser-verification.md trap 1), against a real
`npm run build` (HEAD `7be2360`) served on port 4711, Chrome CDP on port 9711. Roster/group seeded via
`localStorage['watduang:roster'/'watduang:group']` with the fit probe's own names `QQAAX, QQBBY, QQCCZ`
(`scripts/play-screen-fit-probe.mjs`'s `NAMES`), and the same largest-visible-non-header-button press
heuristic that script uses, so press counts line up with its recorded reasons. All measurements are
this session's; where a number matches the recorded `KNOWN_OVERFLOW` reason it is marked **reproduced**.

## Calibration (proves the instrument, not just the feature)

On `freeze-tap`'s overflowing container (`main#mainContent` → `div.pass-container`), forced the first
child's `min-height` to `9999px !important`: container `scrollHeight` moved from **659px → 10031px**
(+9372), then removing the override restored it to **659px** exactly. The harness reflects a real DOM
change and un-does it cleanly. Confirmed, not inferred.

## Method note: `freeze-tap` is not self-timed like `pinocchio-luck`, but it is non-deterministic

Three separate page loads of the same press-1 screen gave `main#mainContent` overflow **187px, 160px,
160px** (scrollHeight 686/659/659). The `pass-player-card` block's own height moved between loads
(438px vs 411px) — its content depends on which round/player the mockup's own randomiser lands on, not
on a clock. `KNOWN_OVERFLOW`'s `freeze-tap 320x568` reason cites 187px; this session reproduces 160px on
2 of 3 loads. Both numbers are real; the row is variable across loads, the same class of finding as
`pinocchio-luck`'s recorded band, just not documented as one. The block table below uses the 160px/659px
run (children measured in the same page load as the container, so it reconciles internally).

---

## freeze-tap — press 1, `main#mainContent`

Measured overflow: **160px** (recorded: `gh#182 open: 187px` — differs by 27px; see variance note above,
not assumed stale). `overflowPx = scrollPx` (`clippedPx = 0`).

`main#mainContent`: clientHeight 499, scrollHeight 659 → its one direct child is `div.pass-container`
(height 627, top offset 16, i.e. 16 + 627 + 16(bottom pad) = 659 — reconciles exactly). Drilling one
level further into `div.pass-container` (the actual screen content):

| Block (document order) | Height px | Gap before | Control? | Height as control |
|---|---|---|---|---|
| `div.badge.badge-primary` | 31 | 0 | no | — |
| `div.pass-player-card` | 411 | 22 | no | — |
| `div` (helper text) | 20 | 22 | no | — |
| `button#playerReadyBtn.btn-primary` | 99 | 22 | **yes** | 99px |

Sum incl. gaps + 22 trailing gap to container bottom = 31+22+411+22+20+22+99 = 627px = container height,
exactly. Reconciles.

Largest block: `div.pass-player-card` at **411px = 72% of the 568px viewport.**

**The 44px-floor question is moot here for the wrong reason**: `button#playerReadyBtn` is 99px, well
above the floor, but at 499px client height (minus the 16px top pad) the visible cutoff line sits at
container-coordinate 483 — the button (528–627) is **entirely below the fold**. The primary CTA of this
screen is not present on screen at all at 320x568, not merely short.

Transient: none identified as conditionally absent — all four blocks render every load.

---

## how-close-is-near — press 4, `documentElement`/`body`/`#appRoot`

Measured overflow: **194px**, reproduced exactly (recorded: `gh#182 open: 194px`).

`documentElement`/`body` scrollHeight 762 = clientHeight (body itself doesn't clip; `#appRoot` is the
one non-fixed child). `#appRoot` direct children:

| Block | Height px | Gap before |
|---|---|---|
| `header.app-header` | 68 | 100 (top padding) |
| `p#hc-live` (sr-only, `absolute`, 1px) | out of flow | — |
| `main#screenContainer.screen-container` | 582 | 0 |
| (bottom padding) | — | 12 |

100+68+582+12 = 762 = `#appRoot` scrollHeight. Reconciles. `main#screenContainer` alone (582px) already
exceeds the 568px viewport before the header is even added — it is a single block, not several, at this
level, so drilled one further level into its one child `div.card` (580px, 2px border difference from
582 explains the gap):

| Block | Height px | Gap before | Control? |
|---|---|---|---|
| `div.turn-status-bar` | 36 | 19 | no |
| `div#rejectionBanner.rejection-banner` | 48 | 14 | no |
| `div.number-display-box` | 132 | 14 | no |
| `div.numpad-grid` (12 number buttons) | 216 | 16 | **yes**, 12 buttons at 46-48px each |
| `button#btnSubmitNumber.btn-primary` | 52 | 16 | **yes** |
| (bottom padding) | — | 17 | — |

19+36+14+48+14+132+16+216+16+52+17 = 580 = `div.card` scrollHeight. Reconciles.

Controls near the 44px floor: all 12 `.num-btn` buttons render at **46-48px** — 2-4px above floor, no
room to shrink without breaching the gate. `btnSubmitNumber` at 52px has slightly more room.

Largest content block: `div.numpad-grid` at **216px = 38% of viewport**. (The wrapper `#screenContainer`
itself, 582px, is bigger but is a container, not a single content block.)

Transient: `div#rejectionBanner` renders at 48px on this reached screen (a fresh round, no rejection
yet). Its class name and the fact this walk never triggers a wrong-guess path suggest it may be
conditionally hidden/shown by content rather than always reserving 48px — **not verified this session**
whether it collapses to 0px in the no-rejection state; flagged as inferred, not measured.

---

## short-stick — press 0, `documentElement`/`body`

Measured overflow: **156px** (recorded: `gh#182 open: 191px` — differs by 35px, reproduced identically
on 2 independent loads this session, so not a one-off misread; stated plainly per the brief, not
assumed the recording is wrong).

`body` scrollHeight 724 = clientHeight (`header#topnav` is `sticky`, still occupies flow height; canvas
and the two corner buttons are `fixed`, zero flow contribution):

| Block | Height px | Gap before |
|---|---|---|
| `header#topnav.topnav` | 57 | 0 |
| `main#app` | 643 | 0 |
| (bottom padding) | — | 24 |

57+643+24 = 724. Reconciles. `main#app`'s one child `section#view-draw` (587, 20px top padding inside
`main#app`) → its one child `div.container.draw-layout` (547):

| Block | Height px | Gap before | Control? |
|---|---|---|---|
| `div.live-odds-banner` | 72.5 | 0 | no |
| `div#draw-player-strip.player-strip` | 45.5 | 16 | no (roster chip strip) |
| `div.bamboo-stage` | 393 | 20 | contains controls (not drilled) |

72.5+45.5+393+16+20 = 547 = `div.container.draw-layout` height. Reconciles.

Largest block: `div.bamboo-stage` at **393px = 69% of viewport** — the game's canvas + stick-selection
grid. Not drilled past this level (time-boxed); it contains `canvas#stick-canvas` (389px, decorative) and
a `div#stick-grid` (250px per the DOM-shape probe) holding the actual tappable sticks — a real redesign
target, not a removable block.

Transient: none identified.

---

## wire-snip-panic — press 0, `div#screen-game.screen.active`

Measured overflow: **111px**, reproduced exactly (recorded: `gh#182 open: 111px`). `clippedPx = 0`,
`overflowPx = scrollPx`.

`div#screen-game.screen.active`: clientHeight 393, scrollHeight 504.

| Block | Height px | Gap before | Control? |
|---|---|---|---|
| `div#hud-player-strip.hud-player-strip` | 46 | 12 | no (roster chip strip) |
| `div.hud-status-bar` | 36 | 10 | no |
| `div#bomb-chassis.bomb-chassis` | 240 | 10 | contains tap targets (div, not `<button>`) |
| `div#turn-action-banner.turn-action-banner` | 128 | 10 | **yes**, holds `button#btn-trigger-scan` (76px) |
| (bottom padding) | — | 12 | — |

12+46+10+36+10+240+10+128+12 = 504. Reconciles exactly.

Cutoff line at clientHeight 393: `turn-action-banner` spans 364-492, so only its top 29px is visible —
**`button#btn-trigger-scan` (76px), the primary action, is almost entirely below the fold**, plus the
12px bottom pad and the banner's own 99px below-fold remainder account for the full 111px overflow.

Largest block: `div#bomb-chassis` at **240px = 42% of viewport** — the wire-cutting apparatus itself
(6 `div.wire-column` at 174px each, arranged side by side; the tap targets are `<div>`s with click
handlers, not `<button>` elements, so a tag-based "is this a control" check misses them — flagged, not
measured further this session).

Transient: none identified as conditionally absent in this screen.

---

## zero-trigger — press 0, `section#screen-game.screen.active`

Measured overflow: **131px**, reproduced exactly (recorded: `gh#182 open: 131px`).

`section#screen-game.screen.active`: clientHeight 448, scrollHeight 579.

| Block | Height px | Gap before | Control? |
|---|---|---|---|
| `div.tier-banner.glass-card` | 62 | 4 | no |
| `div#active-player-card.active-player-card.glass-card` | 84 | 10 | no |
| `div#stopwatch-stage-box.stopwatch-stage.glass-card` | 133.59 | 10 | no |
| `div.action-button-area` | 168 | 20 | **yes**, holds `button#btn-big-action` (140px) |
| `div#game-player-strip.player-strip-container` | 55 | 20 | no (roster chip strip) |
| (bottom padding) | — | 12.41 | — |

4+62+10+84+10+133.59+20+168+20+55+12.41 = 579. Reconciles exactly.

Cutoff line at clientHeight 448: `action-button-area` (323.59-491.59) is 124.41px visible / 43.59px
cut; `game-player-strip` (511.59-566.59, 55px) is entirely below the fold; plus the 20px gap and 12.41px
bottom pad. 43.59+20+55+12.41 = 131 = the measured overflow, exactly.

Largest block: `div.action-button-area` at **168px = 30% of viewport**, holding the 140px primary
trigger button (`button#btn-big-action`) — itself 25% of the viewport alone.

Transient: `div#toast-banner.show` was observed as a direct child of `body` (outside `#app-container`,
75px tall, carrying the `.show` toggle class) at this screen — a live parked toast, matching the same
mechanism the `KNOWN_OVERFLOW` map already documents for `power-meter` ("a parked toast resting below a
containing block"). Confirmed present at press 0 with a state-toggle class name; not confirmed absent at
other presses this session.

---

## pinocchio-luck — press 1, `documentElement`/`body`

Measured overflow: **107px**, reproduced at the low end of the recorded 107-136px self-timed band
(`gh#182 open: 136px on press 1 ... measured 107-136px across 15 runs`; this session's 107 is inside
that band and consistent across all 3 loads taken this session — no new variance found).

`body` scrollHeight 675 = clientHeight (`main.no-webgl` is the one non-fixed child):

| Block | Height px | Gap before | Control? |
|---|---|---|---|
| `div.curtain-top` | 24 | `absolute`, out of flow | no |
| `header.topbar` | 66 | 0 | **yes**, holds `button#soundBtn` (44px, at floor) |
| `section#stageFrame` | 230 | 0 | no (puppet canvas/CSS puppet display) |
| `div.panel-wrap` | 405.44 | 3.83 | **yes**, holds the answer buttons |
| `div#announcer.sr-only` | 1 | `absolute`, out of flow | no |

66+230+3.83+405.44 = 705.27 vs container height 675.27 — **does not reconcile to the container total**;
`section#stageFrame` and `div.panel-wrap` overlap by ~30px (stageFrame bottom at 296, panel-wrap top at
269.83), consistent with `div.css-mouth`'s recorded 4px clip and the puppet stage visually overlapping
the panel. Reported as found, not forced to reconcile — the recorded reason itself only pins a 4px clip
from `div.css-mouth`, not a full block accounting, so an overlap here is plausible rather than a
measurement error.

Largest block: `div.panel-wrap` at **405px = 71% of viewport** (holds the question panel: `.view` with
`.question-count`, `h2.question`, and `.answers` at 242px — the answer buttons, not individually drilled
this session).

Transient: none identified as conditionally absent at this screen.
