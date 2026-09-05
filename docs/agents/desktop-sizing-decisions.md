# Desktop sizing decisions for play routes

The tracer decisions from gh#180 (`wire-snip-panic`), written so gh#181 and gh#183 copy one set
instead of inventing ten. **Copy the RULE, compute the VALUE.** Three of the six tokens below are
derived per route from that route's own board; copying `726px` into a route with 4 buttons is the
failure this file exists to prevent.

Reference implementation: `src/play/wire-snip-panic/overrides.css`, the block headed
`DESKTOP LAYER - gh#180`. Read it beside this file; it carries the per-declaration reasoning.

## Where the rules go

**`src/play/<id>/overrides.css`, never `style.css`.** Every `style.css` under `src/play/` is
extractor output — `scripts/extract-mockup.mjs` rewrites it byte-for-byte from the mockup, so a
desktop rule written there disappears on the next extraction. `overrides.css` is imported after
`style.css` in each `play.astro`, so equal-specificity rules there win.

`markup.html` and `main.js` are extractor-owned for the same reason — this file used to be the only
place that said it, and only about `style.css`. The full rule, and the one attribute that now
survives an extraction, is in `docs/agents/src-edit-rules.md` under "Which files under
`src/play/<route>/` the extractor owns".

Do **not** restyle `src/shell/PlayExit.astro`. It is shared page chrome for all eleven routes; a
per-route desktop tweak to it is a change to the other ten.

## Breakpoint

`@media (min-width: 1100px)`. **One breakpoint, and it already exists** — this repo uses 639 and
1099 only, and 1100 is the open side of the upper one — the `@media (min-width: 1100px)` block that
`src/pages/tool/team.astro` and `src/pages/tool/draw.astro` already ship. Do not add a third. Nothing below 1100px changes: every rule in
this scheme lives inside that one media block, which is why 320px and 390px cannot regress from it.

## The tokens

Declared on the mockup root (`#app`, or `#app-container` on the routes that use that id) inside the
media block, so a route with no desktop layer yet inherits nothing. Prefix with the route's own
initials, as `--wsp-*` does — these are per-route locals, not site tokens, because three of the six
values differ per route.

| Token | wire-snip-panic value | Rule for your route |
|---|---|---|
| `--<r>-desktop-target-min` | `56px` | **Fixed. Copy it.** Desktop pointer-target floor. The 44px touch floor stays declared *outside* the media block so a touch laptop keeps it; this raises, never lowers. |
| `--<r>-desktop-gap` | `28px` | **Fixed. Copy it.** Column gap between board and rail. |
| `--<r>-desktop-rail-inline` | `420px` | Width of the HUD/turn rail. Rule: the narrowest width that holds the route's **longest shipped Thai control label on one line** at the desktop button size. Measure it; do not copy 420 blind. |
| `--<r>-desktop-board-max-inline` | `726px` | The play surface cap. Rule: `(interactive element count x target size) + the surface's own padding + border`. Here: `6 wires x 120px + 4px + 2px`. |
| `--<r>-desktop-track-inline` | `726px` | Centred measure for the single-column screens (menu, setup). Rule: **set equal to the board cap**, so the frame's content sits on the same axis before and after a round starts. |
| desktop element target size | `120px` | Not a token — the input to the board cap. Rule: the phone-width render of the same element, roughly doubled, floored at ~100px. These wires render ~77px wide in the 520px column; a desktop target under 100px shrinks *relative to the frame*, which reads as a stretched phone. |

## The three structural rules

**1. The frame fills the window.** On the mockup root, inside the media block:
`max-inline-size: none; max-block-size: none;`. The mockups pin themselves to a phone column
(`wire-snip-panic` used `max-width: 520px` = 36% of 1440px) and this is the whole of the "fill"
half. Nothing else is needed for it.

**2. The play screen becomes board + rail.** A wider column is a stretched phone; the width has to
buy a second column. Grid on the *active* screen:

```css
#screen-game.active {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--wsp-desktop-rail-inline);
  grid-template-rows: auto auto 1fr;
  column-gap: var(--wsp-desktop-gap);
  row-gap: 12px;
  padding: 24px 28px;
}
```

Board spans column 1 / all rows. Status and roster HUD stack at the top of column 2; the primary
action goes to the last row with `align-self: end`, keeping the relative position it holds at the
bottom of the phone layout.

⚠ **`.active` in that selector is load-bearing.** The mockups hide screens with a class rule at
specificity (0,1,0). An id-only selector is (1,0,0), outranks it, and renders the hidden play
screen on top of the menu. Every `display:` you set on a screen id must carry `.active`.

**3. The board is capped and centred inside the frame, not stretched to it.** The chassis/panel may
span its whole grid column — a wide machine reads as designed — but the *interactive surface* and
its readouts stay on `--<r>-desktop-board-max-inline` with `margin-inline: auto`. On
`wire-snip-panic` that is `.bomb-lcd, .timer-bar-wrap, .wires-bay`. This is the rule that stops the
stretch: `renderWiresBay()` in `src/play/wire-snip-panic/main.js` builds each wire SVG with
`preserveAspectRatio="none"`, so an uncapped bay thins each wire vertically and fattens it
horizontally at once. Check your route's canvas/SVG scaling mode before assuming it is immune.

## The shell controls: deliberately not moved

`PlayExit` renders the exit X and the edit-players pill `position: fixed` at the viewport top-left.
The fix for "stranded in the corner" is **the frame reaching them**, not moving them: once the root
is full-bleed, those same coordinates land on the game's own top-left chrome band.

That band already exists on every route as the clearance reserve at the top of `overrides.css`:

```css
padding-block-start: calc(max(6px, env(safe-area-inset-top)) + 94px);
```

`94px` is PlayExit's declared geometry (X at the inset, 44px tall; pill at inset + 50px, 44px tall),
and the expression is viewport-derived, so it is already correct at 1440px. **Reuse it. Add nothing
width-specific.**

## Proportions: the minimum set

Position alone is not the ticket. Type sized for a 520px column reads as a phone screenshot at
1440px. The four that were enough here — raise the equivalents, do not invent more:

- route logo / hero title: `34px` -> `48px`
- header brand title: `15px` -> `20px`, header buttons `13px` -> `15px`
- primary button: `padding: 16px` -> `20px`, `font-size: 16px` -> `18px`
- every control already carrying a `min-*: 44px` floor gets `min-block-size:
  var(--<r>-desktop-target-min)` (and `min-inline-size` where the mobile rule set one)

## What this scheme does NOT decide

- **Whether it reads as designed.** That is the site owner's call on a 1440x900 screenshot, per
  gh#180 and the ADR-0046 handling it names. No machine check substitutes.
- **Ad slots.** No play route carries one; ADR-0024's fixed heights are untouched by all of the above.
- **Any Thai string.** Every label here is manifest-held or already shipped. This scheme authors none.
- **Tall windows.** `max-block-size: none` is untested above 960px viewport height; 1440x900 is the
  only size measured.
