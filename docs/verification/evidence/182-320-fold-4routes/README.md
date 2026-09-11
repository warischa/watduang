# gh#182 — primary-control fold position at 320x568 for the four unmeasured routes

Measurement only. No `src/**` file was touched, no per-route verdict is decided here, and nothing was
rebuilt — this run serves the existing `dist/`, unmodified. All four routes below have real readings;
none is a gap.

**The rule being checked** (gh#182 owner ruling, 2026-09-10): "on every play screen, the primary
control must be above the fold at 320px." **No primary-control designation exists in the repo for any
of these four routes.** Every designation below is this run's own judgement, justified against the
one established precedent in this repo (`freeze-tap`'s `button#playerReadyBtn`, `wire-snip-panic`'s
`button#btn-trigger-scan`, both in `docs/verification/evidence/182-320-fold/`) — not a discovery of
something the repo already names.

## Stamp

Measured 2026-09-11, `dist/` served as-is, no build run (per this task's constraint — sibling
sessions hold uncommitted `src/**` edits including `src/shell/PlayExit.astro`). Static server
`npx serve dist/ -l 4173`. Headless Chrome 153.0.8010.36: `--headless=new --no-sandbox
--remote-debugging-port=9333 --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
**Not `--disable-gpu`** — `pinocchio-luck`'s `main.js` opens a real WebGL context
(`canvas.getContext('webgl', ...)`) and falls back to a `.no-webgl` class with no context; verified
before this run that swiftshader gives it a live context (`app.classList.contains('no-webgl')` read
`false`). `docs/agents/browser-verification.md` names this exact route as one `--disable-gpu` breaks.

Viewport 320x568 via `session.setWidth` (real device-metrics emulation); `innerWidth`/`innerHeight`
re-asserted every load, every step.

Exact command:

```bash
CDP_PORT=9333 BASE=http://localhost:4173 LOADS=6 \
  node scripts/driver.mjs docs/verification/evidence/182-320-fold-4routes/fold-probe-4routes.mjs \
  > docs/verification/evidence/182-320-fold-4routes/fold-probe-4routes.json
```

`fold-probe-4routes.mjs` is committed beside this file. It seeds `watduang:roster`/`watduang:group`
(3 names) via `localStorage` before each reload — the same keys `src/shell/roster.ts` owns and the
existing `182-320-fold/fold-probe.mjs` already used — which drives each route's own `roster-bridge.ts`
to auto-complete setup through the route's OWN controls (never past them). From there this run clicks
each route's own named buttons explicitly (not a generic largest-button heuristic, which is unsafe on
these four routes' multi-screen setup wizards): each route's own control ids, read directly from its
`main.js`/markup (e.g. `#btn-big-action`, `#ready`, `#btnReadyForTurn` — no two routes share an id
prefix), waited past `ARM_DELAY_MS` (400ms, `src/games/_arm-gate.ts`, +300ms margin = 700ms) before
every click, matching the ghost-tap gate every one of these four routes' `main.js` imports.

**Provenance note.** This command was invoked twice in this session against the same Chrome instance
and the same output path before this final version was written (a foreground timeout auto-backgrounded
the first invocation; a second, redundant one was started before the first was confirmed finished).
The probe script did not change between the two invocations. The committed JSON is the last completed
write; validated after the fact (`require()` parses cleanly, all 4 routes carry 6/6 loads with every
step `ok: true` and byte-identical values load-to-load — checked explicitly below, not assumed from
one file size).

## Positive clean-screen confirmation

Every reading below reports, at the point of measurement: `allDialogIds` (every `<dialog>` actually in
the document, named — not just "selector came back null"), `openDialogIds` (the same set filtered to
`.open`), `ariaModalsVisible` (any `[role="dialog"]`/`[aria-modal="true"]`, for a non-`<dialog>` modal
pattern), `shellDialogsOpen` (the two shell-chrome dialogs by id, `#clear-choice`/`#leave-confirm`),
and `screenVisible`/`screenHidden` for the route's own screen element. On every load, on every route:
`openDialogIds: []`, `ariaModalsVisible: []`, `shellDialogsOpen: []`, `screenVisible: true`. Three of
the four routes had zero `<dialog>` mounted at all at the point measured (they mount lazily on open);
`short-stick` had four mounted and closed (`rules-dialog`, `short-reveal-dialog`, `leave-dialog`,
`reset-names-dialog`) — checked, not assumed absent.

## Results — n=6 loads per route/candidate, typical and worst

**Every one of the 24 loads (4 routes x 6, or 6 per reported candidate where two are reported) came
back byte-identical to the others for that candidate.** Checked per load: typical = worst everywhere
below — none of these four routes' first-reached screens carry `freeze-tap`'s two-state randomness.

### `zero-trigger` — primary: `#btn-big-action`

No ambiguity: no pass/ready gate screen exists on this route (checked `main.js` — setup confirms
straight into `#screen-game`, no interstitial), so the one round-action button is the only candidate.

The button's top (451.6) sits above the 568 line, but its own height (140px) carries its bottom
(591.6) past it — and past its own container's tighter scroll edge (548) too. Both are reported,
because they are not the same claim (`182-320-fold/`'s own method note: "the fold and the container
edge coincide here [on `freeze-tap`/`wire-snip-panic`], which is not something to assume on another
route" — `zero-trigger` is the case where they do not coincide).

| | value |
|---|---|
| top vs. 568 fold | top at 451.6, **116.4px above** the line (`topPastFold: -116.4`) |
| bottom vs. 568 fold | bottom at 591.6, **23.6px past** the line |
| visible px within the 320x568 viewport | **116.4** of the button's 140px height |
| container `overflow-y` | `section#screen-game`, **`auto`**, `clientHeight` 448 / `scrollHeight` 579 — its own scroll edge (`foldEdge`) sits at **548px**, tighter than the viewport's 568 |
| bottom vs. the container's own scroll edge (548) | **43.6px past it** |
| visible px within the container's own clipped region | **96.4** of the button's 140px height |
| largest block (n=6, typical=worst) | `div.action-button-area`, **168px** (excludes the screen wrapper itself, 448px, and the button, 140px, which sits inside it) |

The button's top clears the fold; its bottom does not, in both the viewport's and the container's own
terms. Whether that counts as "the primary control is above the fold" under the rule's wording is a
verdict call this run does not make — the numbers above are what a verdict would be checked against.

### `short-stick` — primary: `#stick-grid` region (ambiguity: N equivalent buttons, not one control)

Sticks are picked via N equivalent `.straw-btn` elements (`main.js` creates one per stick, each
aria-labelled "choose stick N"); no single stick is more primary than another, so the region holding
all of them is the designation, with the first pickable stick also recorded as a concrete single
element.

The region's top clears the fold, but a region is not one control — it holds N sticks stacked/wrapped
across `top: 412` to `bottom: 662` (height 250px), and **662 is 94px past the 568 line**. The first
pickable stick is above the fold; sticks further into the grid are not, purely from the region's own
extent (individual per-stick rects beyond the first were not read in this run).

| | value |
|---|---|
| region top vs. 568 fold | 412, **156px above** the line |
| region bottom vs. 568 fold | 662, **94px past** the line |
| visible px at 568 (region) | 156.0 of 250px height |
| first pickable `.straw-btn` | top 458 (110px above the line), **110px visible** |
| container `overflow-y: auto` | **none found** in the ancestor chain |
| page-level scroll | `document.scrollingElement` (`html`) — `overflow-y: visible`, `scrollHeight` 724 vs `clientHeight` 568 → **the whole page scrolls** (724 > 568), so the region's lower half is unseen-but-reachable, not stuck |
| largest block (n=6, typical=worst) | `div.bamboo-stage`, **393px** (excludes `#view-draw` 587px and `.draw-layout` 547px, both wrappers) |

The first stick is above the fold; the region as a whole is not fully above it.

### `pinocchio-luck` — TWO candidates, genuinely ambiguous, both reported

- **Candidate A — `#ready`** ("พร้อมแล้ว", `renderPass()`): a per-turn pass-the-device gate the
  incoming player presses before the question is revealed. Justification: directly analogous to
  `freeze-tap`'s established `button#playerReadyBtn` — this repo's only precedent for what "primary"
  means on this screen shape.
- **Candidate B — `.answer`** (first of 3, `renderQuestion()`): the actual gameplay decision — reading
  the question and choosing A/B/C. Justification: arguably more "primary" than the gate in the sense
  that it is the action that decides the turn's outcome, not just a pass-through tap.
  This run does not pick one; both are real candidates and both are reported.

`.answer` is one of THREE stacked buttons (A/B/C); only the first (topmost) was measured directly.
`div.answers` — the element that wraps all three, present in this load's `tallestBoxes` — reads
`top: 412.6, bottom: 649.7`, i.e. **the set's bottom is 81.7px past the 568 line**, so option C (the
last one) sits below the fold even though option A does not.

| candidate | px past fold | visible px | container | largest block (n=6) |
|---|---|---|---|---|
| `#ready` | not past — 81.2px above | 54.0 (fully visible; height 54px matches) | none found; page (`html`) scrolls: `scrollHeight` 575 vs 568 | `div.view.pass-card`, **252.9px** (excludes `.panel-wrap` 304.9 and `#panel` 288.9, both wrappers) |
| `.answer` A (first, measured) | not past — 155.4px above | 70.6 (fully visible) | none found; page scrolls: `scrollHeight` 675 vs 568 | `div.view`, **346.4px** (excludes `.panel-wrap` 405.4 and `#panel` 389.4, both wrappers) |
| `.answer` set (`div.answers`, all 3) | bottom **81.7px past** the line | n/a (a set, not one rect) | same as above | same as above |

`#ready` is fully above the fold. For `.answer`, option A is fully visible; the set's own bottom shows
option C is not — options B/C were not individually measured, `div.answers`'s bottom is what stands in
for them here.

### `how-close-is-near` — TWO candidates, genuinely ambiguous, both reported

- **Candidate A — `#btnReadyForTurn`** (`GameState.TURN_INTRO`): same shape as `pinocchio-luck`'s
  `#ready` and `freeze-tap`'s `#playerReadyBtn` — the per-turn pass/ready gate. Same precedent-based
  justification.
- **Candidate B — `#btnSubmitNumber`** (`GameState.NUMBER_ENTRY`, "ล็อกคำตอบนี้ 🔒"): the decision that
  commits the player's picked number — the turn's actual consequential action, same reasoning as
  `pinocchio-luck`'s `.answer`.

(Two more screens sit between setup and these — `#btnStartGame` and `#btnAckSecrecy` — driven through
as real player taps to reach the round, but not reported as candidates: they are one-time gates before
the first turn, not a recurring per-turn control, so neither fits the "primary" shape being judged.)

| candidate | px past fold | visible px | container | largest block (n=6) |
|---|---|---|---|---|
| `#btnReadyForTurn` | not past — 135.5px above | 52.0 (fully visible) | none found; page (`html`) does **not** scroll here (`scrollHeight` 568 = `clientHeight` 568) | `div.card`, **283.0px** (excludes `main#screenContainer` 388px, the wrapper) |
| `#btnSubmitNumber` | **PAST IT — 49.0px past the fold** | **0** — fully unseen | none found; page (`html`) **does** scroll here (`scrollHeight` 700 vs 568) | `div.card`, **520px** (fills `main#screenContainer`, also 520px — a genuine content card, not a decorative overlay) |

**`#btnSubmitNumber` reproduces the established defect shape exactly**: below the fold, 0 visible px,
same as `freeze-tap button#playerReadyBtn` (45px past, 0 visible) and `wire-snip-panic
button#btn-trigger-scan` (10px past, 0 visible) in `182-320-fold/`. Unlike those two, the page itself
(not a nested container) is what would need to scroll to reach it — confirmed scrollable
(`scrollHeight` 700 > `clientHeight` 568), so this is "unseen, not unreachable," the same distinction
the rule exists to draw.

## Calibration

Every reported candidate's own largest visible box (per its `tallestBoxes[0]`, which may be a wrapper
rather than the "largest block" named above — the wrapper is what the instrument forces, since it is
guaranteed to be an ancestor of or sibling to the primary) was forced to `min-height: 2000px` and
released, confirming the primary control's own top moves under a real DOM change and returns after.
`zero-trigger`, `short-stick`, and both `pinocchio-luck` candidates returned to baseline exactly.
**Both `how-close-is-near` calibrations did not run at all** — the raw log records
`{"error": "calibration selectors missing"}` for both, meaning the replay (re-driving the click path
up to that step on a fresh load, then querying the block/primary selectors) failed to find one of the
two selectors, not that a forced/released read came back mismatched. Not diagnosed further in this
run — an earlier draft of this section incorrectly described this as a numeric "returned: false"
mismatch with a guessed cause; that was wrong and is corrected here. The calibration step is simply
unconfirmed for this route's two candidates; every other number reported for them (fold position,
visible px, dialogs) comes from the main measurement loop, not from calibration, and stands on its
own. Full detail in `fold-probe-4routes.json`'s `calibrations` field.

## Not measured, and why

- No screenshot was taken (evidence PNGs are `.gitignore`d in this tree, and a CDP probe can always
  emit JSON per `181/README.md`'s stated policy).
- No per-route verdict against `docs/agents/desktop-sizing-decisions.md` or the gh#182 rule is stated
  here — out of scope for this task.
- No screen past the first round screen reached (mid-round states, results/summary screens) was
  measured.
- 1440x900 was not measured here; only 320x568.
