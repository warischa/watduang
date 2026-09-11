# gh#181 — clean-screen 1440x900 readings for dice-loser and timebomb

Measurement only. No `src/**` file was touched, no per-route verdict is decided here, and nothing
was rebuilt — this run serves the existing `dist/`, unmodified.

**Why this run exists.** gh#181's last comment (2026-09-10) records: "`dice-loser` and `timebomb`
were measured over a screen with a reset dialog open, so their readings should be re-measured on a
clean screen before any redesign starts on them." This run replaces those two readings. It decides
nothing about the per-route verdict against `docs/agents/desktop-sizing-decisions.md` — that stays
the owner/agent judgement call the ticket already delegates elsewhere.

## Stamp

Measured 2026-09-11, repo at commit `9643462` (`git log -1 --format=%H -- src public` = `133e413`,
i.e. `dist/` was last built from that commit and nothing in `src` or `public` has changed since —
`git status --short` at measurement time showed only one unrelated change from a sibling session:
`src/games/daily-fortune.test.mjs`, a test file for a route not in scope here). `dist/` was served
as-is; **no build was run**, per this task's own constraint (three sibling sessions hold uncommitted
`src/games/*.ts` / `src/play/one-bomb/` edits).

Static server: `npx serve dist/ -l 4173` (port assigned for this task).
Headless Chrome `153.0.8010.36`: `--headless --disable-gpu --no-sandbox --remote-debugging-port=9333
--user-data-dir=/tmp/cdp-prof-181c`. `--disable-gpu` is safe here — `timebomb`'s own
`bomb-canvas.ts` states in its header comment that the route is Canvas 2D only, never WebGL
(owner direction 2026-08-30), and `grep -l canvas src/play/dice-loser/*` finds no canvas/WebGL
surface on `dice-loser` at all — neither route falls under the WebGL flag warning in
`docs/agents/browser-verification.md`.

Driver: `scripts/driver.mjs` (per that same doc — `--window-size` does not reflow layout; this uses
real device-metrics emulation via `session.setWidth`, and `innerWidth`/`innerHeight` are re-asserted
as 1440/900 on every one of the 12 loads below, never assumed).

Exact command that produced the committed `clean-screen-readings.json` (run verbatim, output
captured directly — not copied from a scratch run):

```bash
CDP_PORT=9333 BASE=http://localhost:4173 LOADS=6 \
  node scripts/driver.mjs docs/verification/evidence/181-clean-screen/clean-screen-probe.mjs \
  > docs/verification/evidence/181-clean-screen/clean-screen-readings.json
```

`clean-screen-probe.mjs` is committed beside this file — it is the whole of what was run, not a
paraphrase.

## Method: reached through the player's own controls, never past them

Each load: `session.nav()` to the route, `session.wipe()` (clears `localStorage`/`sessionStorage` on
that origin, not on `about:blank`), `session.nav()` again for a fresh setup screen, `setWidth(1440,
900)`, then click `#dl-begin` (`dice-loser`) or `#tb-begin` (`timebomb`) — the same control a player
presses to leave setup. **Neither route's reset button (`#dl-reset-names` /
`#tb-reset-names`) was ever clicked in this run.** That reset button is exactly what a prior pass's
largest-button-first heuristic hit by default (recorded in `docs/verification/evidence/181/
frame-screen-readings.json`'s own `notes.dice-loser` entry) — opening the confirm `<dialog>` over the
setup screen. This run avoids that heuristic entirely and drives the named `#…-begin` id directly.

`timebomb` needs one further real control: `#tb-begin` only reaches a
pass-the-device interstitial holding `#tb-start`, disabled for `ARM_DELAY_MS` (400ms —
`src/games/_arm-gate.ts`, the same shared reveal-arm window every route's own
`arm-reveal-paths.test.mjs` covers). The bomb canvas (`.tb-canvas`) stays `hidden` until `#tb-start`
is pressed, so this run waits 700ms (past the 400ms arm window) and clicks it — a real player's next
tap, not a skip past the trigger. `dice-loser` needed no such second step; `#dl-play` is both the
screen and the board.

## Positive clean-screen confirmation, per load

An absent-dialog check is not proof of a clean screen (a `null` selector reads the same as "never
existed"). Each load instead asserts, ON the page, in this order:

1. `dialog.open === false` — the named reset `<dialog>`'s own `open` boolean, read off the real DOM
   node (`#dl-reset-dialog` / `#tb-reset-dialog`), confirming it exists and is *closed*, not merely
   that a selector came back empty.
2. **Every `<dialog>` in the document, named, not just counted**: the read records
   `allDialogIds` (`document.querySelectorAll('dialog')`, every id) alongside `openDialogIds`
   (the same set filtered to `.open`). On every one of the 12 loads, `allDialogIds` was exactly
   `["dl-reset-dialog"]` (`dice-loser`) / `["tb-reset-dialog"]` (`timebomb`) — the route's own reset
   dialog is the *only* `<dialog>` in the document at this state — and `openDialogIds` was `[]`. This
   also checked for the two shell-level dialogs (`src/shell/PlayerSetup.astro`'s `#clear-choice`,
   `src/shell/LeaveConfirm.astro`'s `#leave-confirm`) by id: **neither was present in the DOM** on
   this screen for either route (an absent selector, not a closed one — `shellDialogsOpen` reading
   `[]` for a dialog that never mounted proves nothing by itself; `allDialogIds` is what proves the
   document held no such dialog to begin with, which is the actual claim being made). Whether
   `PlayerSetup` ever mounts on `timebomb` at all is a separate question this run does not answer
   (ADR-0053 names it the shared-roster exception); what this run confirms is that at the moment
   measured, on both routes, the reset dialog was the one and only `<dialog>` in the document, and it
   was closed.
3. Any `[role="dialog"]`/`[aria-modal="true"]` element, visible — expected `[]` — in case either
   route used a non-`<dialog>` overlay pattern instead. Neither does; both stayed `[]`.
4. The route's own play-screen signature is present, visible, and not `hidden`: `#dl-play` /
   `#tb-stage` each read `screenPresent: true`, `screenVisible: true` (non-zero
   `getBoundingClientRect`, `visibility !== 'hidden'`, `display !== 'none'`), `screenHidden: false`.
5. The setup screen's own begin button is no longer visible (`beginStillVisible: false`) — confirming
   the walk actually left setup rather than the click being a no-op that left the dialog test looking
   clean by accident.

All five checks passed on all 12 loads (6 per route). Full detail per load is in
`clean-screen-readings.json`.

## Readings — n=6 loads per route, typical and worst

Both routes' 1440x900 post-begin (post-`#tb-start` on `timebomb`) screen is deterministic in this
run: **all 6 loads produced byte-identical readings on every route** — there is no "worst" distinct
from "typical" here, unlike `freeze-tap`'s two-state screen recorded in `182-320-fold/`. Checked per
load, not inferred from load 1.

| route | loads identical | `innerWidth`/`innerHeight` (every load) | `#app` frame width (every load) | screen element (present/visible/not hidden) | board element | board width x height | board margins (left / right) | dialogs in document (every load) |
|---|---|---|---|---|---|---|---|---|
| `dice-loser` | 6/6 | 1440 / 900 | 1440 | `#dl-play`, 662 x 443 | `#dl-play` (same element) | 662 x 443 | 389 / 389 | `["dl-reset-dialog"]`, closed |
| `timebomb` | 6/6 | 1440 / 900 | 1440 | `#tb-stage`, 560 x 312.1875 | `.tb-canvas` | 560 x 414 | 440 / 440 | `["tb-reset-dialog"]`, closed |

`timebomb`'s board reading (560 x 414) matches the falsifiable claim in that route's own
`src/play/timebomb/play.css` comment ("FALSIFIABLE AT 1440x900: `.tb-canvas` measures 560 x 414") —
this run reproduces both dimensions, not only the width.

Typical = worst = the single value shown, for both routes, at this viewport and this reached state.

## Comparison with prior readings

**Prior dialog-contaminated readings, located:** `docs/verification/evidence/203/
composition-readings.md`, in its per-route readings table. `dice-loser`'s row reads `div#app (reset
dialog open)`, span `0.460`. `timebomb`'s row reads `main.tb-main (reset dialog open)`, span `0.389`.
That file's own "What these readings do
not cover" section states plainly: "`dice-loser` and `timebomb` [landed] on a setup screen with their
reset confirmation dialog open. Those rows describe what was on screen, which is not the same claim
as 'this is how the game composes while a round is being played'." This run's numbers **differ** from
those: this run reads the actual post-setup play screen with the dialog closed throughout, board
widths 662 (`dice-loser`) and 560 (`timebomb`) against `#app`'s full 1440, not the setup screen's span
ratio with an open dialog laid over it. The two are not the same measurement (span-ratio-with-overlay
vs. board-width-on-the-real-screen), so no single before/after delta applies — the point is that the
prior numbers describe an overlay state and these do not.

Separately, `docs/verification/evidence/181/frame-screen-readings.json` (2026-09-08 pass) already
recorded a clean `dice-loser` frame/screen pair — `#app` 1440, `section#dl-play` 662 x 443 — because
that pass's own `notes.dice-loser` field says it overrode the shared largest-button heuristic for
this one route to avoid the reset dialog. **This run reproduces that exactly** (662 x 443). For
`timebomb`, that same JSON recorded a different screen element (`main.tb-main`, 1440 x 827) rather
than `.tb-canvas` specifically. That JSON records `pressesToReachScreen: 1` for `timebomb` — inferred
here (not stated by the JSON itself) to mean its pass stopped at the pass-the-device interstitial,
before `#tb-start`, since this run's own first-press read (before its second `#tb-start` step) landed
on the same 560-wide `#tb-stage` container. Either way, `main.tb-main` and `.tb-canvas` are not the
same element, so the two numbers are not directly comparable; no contradiction, just a different
point in the flow.

What this run cannot say: whether the *earlier* 2026-09-07 hand-transcribed board/rail/verdict pass
behind `181/README.md`'s "reads-as-designed" call for these two routes was itself taken with the
dialog open — that pass predates every JSON log here and left no machine-readable trace to re-check.
This run supplies a fresh, positively-confirmed-clean set of numbers for the per-route verdict to
rest on; it does not audit the 2026-09-07 session's own screenshots.

## Not measured, and why

- No screenshot was taken. Committed evidence PNGs are `.gitignore`d for this tree regardless (per
  `181/README.md`'s own stated policy — a CDP probe can always emit JSON), and this task is
  measurement-only with no owner "look" (box 8) requested.
- No verdict against `docs/agents/desktop-sizing-decisions.md` is stated here. Out of scope for this
  task by its own brief.
- No route state past `#dl-play`'s first render / `.tb-canvas`'s first visible frame (e.g. mid-roll,
  mid-fuse, summary/tiebreak screens) was measured. Only the first reachable play screen with the
  board visible was in scope.
- 320px/390px were not measured; only 1440x900.
