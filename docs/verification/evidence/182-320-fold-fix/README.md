# gh#182 — applying the fold rule at 320x568: what changed, what did not, and why

The rule (owner ruling 2026-09-10): on every play screen, the primary control must be above the fold
at 320px. `freeze-tap` is reserved to the owner and was not touched, measured or driven here.

**The reading this session applied, stated once and used on every route.** The ruling's own harm is
discoverability — "a player should not have to discover by scrolling the control the screen exists
for". So: a primary control with ZERO visible pixels violates the rule; a control whose visible part
is on screen is discoverable and does not. The alternative reading (the control must be *entirely*
above the fold) would additionally convict `zero-trigger`, whose button is clipped by 23.6px, and the
third answer option on `pinocchio-luck`. Those two numbers are recorded below so the owner can flip
the reading without a re-measurement.

## Stamp

Built from a clean tree with `npm run build` (never `npx astro build`), served `npx serve dist/ -l 4173`,
headless Chrome 153.0.8010.36 with `--headless=new --use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader` (NOT `--disable-gpu`: `pinocchio-luck` opens a real WebGL context and a
dead one measures a screen no player sees). Viewport by `Emulation.setDeviceMetricsOverride`, never a
resized window. `innerWidth`/`innerHeight` re-asserted on every load.

`fold-probe-fix.mjs` is the `182-320-fold-4routes` probe with three additions: `wire-snip-panic`
driven through its own controls, per-element rects for a SET of equivalent controls (the answer
options, the sticks), and a `bottomPastFold` reading beside the existing `topPastFold`.

- `before-320x568.json` — all five routes on the unchanged tree (n=2 per route; every load
  byte-identical, and identical to the committed n=6 in `182-320-fold-4routes/`).
- `after-320x568-how-close.json` — `how-close-is-near` after the change, n=6, every load identical.
- `wire-snip-floor.json` — the injected-CSS floor run for `wire-snip-panic`. Two runs were made and
  agreed to the pixel; this file holds the second, the first is in the session transcript only.
- `how-close-widest-content.json` — the same screen with a number actually typed, and at 390x844.

## Verdicts

| route | primary control | before (320x568) | verdict |
|---|---|---|---|
| `wire-snip-panic` | `button#btn-trigger-scan` | top 578 / bottom 654, **0 visible px** | **violates** — not fixed, see below |
| `how-close-is-near` | `#btnSubmitNumber` (number-entry screen) | top 617 / bottom 669, **0 visible px** | **violates** — fixed |
| `how-close-is-near` | `#btnReadyForTurn` (turn-intro screen) | fully visible | does not violate |
| `zero-trigger` | `#btn-big-action` | 116.4 of 140px visible; bottom 23.6px past the fold and 43.6px past its container's own 548 edge | does not violate on the reading above |
| `short-stick` | the `.straw-btn` set | all three sticks at top 458, 110px visible each | does not violate |
| `pinocchio-luck` | `#ready`, then the `.answer` set | `#ready` fully visible; options A and B fully visible; **option C at 579-650, 0 visible px** | does not violate on the reading above |

`short-stick`'s region reading (bottom 94px past the fold) is a region, not a control: the sticks are
N interchangeable buttons and this run read each one individually — at the seeded roster of three, all
three are above the fold and the rest of the region's extent is empty space. A larger roster draws
more sticks and could wrap a row below the fold; that was not measured.

## `how-close-is-near` — fixed

A `max-height: 600px` tier in the route's `overrides.css`, spacing and one display glyph only. No
control shrunk, no Thai copy cut or reworded, no screen restructured.

| | before | after (n=6, every load identical) |
|---|---|---|
| `#btnSubmitNumber` | top 617 / bottom 669 | top 497 / **bottom 549** |
| visible px | **0** of 52 | **52** of 52 |
| page scroll on that screen | 700 against 568 | **568 against 568** — it no longer scrolls |
| with a number typed in | not read before | unchanged: 497 / 549 |
| 390x844 | 691 / 743 | 691 / 743 — the tier does not bind |

19px of margin under the fold, which clears the ~27px flap this ticket records on *overflow totals*
across builds; the control's own rect read identically on all 6 loads here, so the flap class does not
apply to it.

Gates on the changed tree: the route's own tests 21/21 · `control-floor-probe` exit 0, 246 controls
across 16 game pages all clearing 44px · `thai-comments` exit 0 · `no-nav-in-stage-check` exit 0 ·
`play-screen-fit-probe` (`ROUTES_ONLY` both routes) exit 0.

## `wire-snip-panic` — violates, and spacing alone cannot fix it

A tier of the same shape was written, measured, and **removed**. It moved the button from bottom 654
to 576 — still past the fold — and did so by shrinking `.bomb-chassis`, which the bay does not follow:
`#wires-bay` is floored at its own min-content, so every pixel off the chassis pushes the wire columns
further out of it and over the control. Measured after that tier: bay bottom 524.9 against a button
top of 500.

The floor was then measured rather than calculated — the padding tier PLUS `min-block-size: 0` on the
bay, the columns and the cable art, injected into the built page and released again (reverted exactly,
both runs):

- chassis 240 -> 177, bay 172.8 -> 68, cable art 68.8 -> **0**, button bottom 654 -> **553**.
- `document.elementFromPoint` at the button's own top row returns `div.wire-column` on the shipped
  build and the button itself only in the floor state.

So spacing plus releasing every min-content floor clears the fold only with the cable art deleted and
the wire columns squeezed from 154.8px to 58px — shrinking the tap targets to buy space, which this
ticket forbids, and removing what the screen is about. What that floor run did NOT touch is the font
size of the LCD readout (75px) and of the six wire label tags (38px each, two lines) — the same
display-glyph lever this session pulled on the other route. Compressing those is what would buy back
the cable art, and it is a decision about what the screen shows, which is the `freeze-tap` shape and
the owner's call, not a worker's.

**The one lever big enough, named and not pulled.** 175px of this route's 568 is chrome above the play
content: a 94px in-flow reserve on `#app` for the shell's fixed exit and edit-players controls (which
occupy a 75px-wide column at the top LEFT only), plus the mockup's own 75px header. Insetting the
header instead of reserving the height would return most of it. It is not a worker's call: it makes
each route's header height a magic number the reserve's own comment exists to avoid, it collides with
`safe-area-inset` on real devices, and it overturns the "other routes: reuse the reserve" convention.

**A pre-existing defect found on the way, not introduced and not fixed here.** On the shipped build the
wire columns already overflow the chassis (bay bottom 578.8) and sit over the turn banner:
`elementFromPoint` in that band returns `div.wire-column.disabled`, not the banner under it.

## Not measured

390x844 for anything but `how-close-is-near`; 1440x900; rosters larger than three; `freeze-tap`
(reserved); screens past the first
round screen; `KNOWN_OVERFLOW` was not re-recorded, per the 2026-09-04 rule that a row moves only when
the growth is the fix.
