# gh#202 — calibration of the horizontal overflow gate in the play-screen fit probe

The horizontal axis in `scripts/play-screen-fit-probe.mjs` is **its own gate**, not a term in the
vertical one:

- gated number `overflowXPx`, picked per row by `worstXOf` — its own worst screen, ranked
  independently of the vertical `worstOf`;
- pin set `KNOWN_OVERFLOW_X`, separate from `KNOWN_OVERFLOW`, holding the **two** rows the first fully
  gated run found (section 6), each with its own recorded px and reason prefix;
- `overflowPx` back to `Math.max(scrollPx, clippedPx)` — vertical only;
- classification `countsAsHorizontalOverflow`, one exported expression, injected verbatim into the
  browser-side `MEASURE` and driven directly by the unit test;
- gate `sidewaysOffenders`, exported, so a saved run's rows replay through it with no browser.

The shape is inverted from `KNOWN_OVERFLOW`'s: **every row is gated by default**, exceptions are the
short list. There is no UNCLASSIFIED third state here — a new route or viewport is gated the moment it
appears.

**What is gated is presence versus absence within `OVERFLOW_TOLERANCE_PX` (8px), never a recorded
pixel** — forced by the probe's header: the CI runner measured six rows 4-28% above this Mac's with no
code change between runs. **Uncovered:** clip SIZE is never GATED, so an excepted row growing 43px ->
400px reds nothing, and a row clipping 9px here but 7px on the runner would flap; recording on both
machines was the alternative and was not done. Growth gets a WARNING instead — section 8, added once
the map stopped being empty, because an unwatched exemption is the whole risk of exempting anything.

A green with no matching red is not evidence, so every claim below is a RED and its byte-identical
restore, or two runs differing by one variable. Environment: this Mac, headless Chrome 152 on
`CDP_PORT=9333` (private), `npx serve dist/ -l 4592` over a real `npm run build`.

---

## 1. The unit test can fail — mutant RED, restore GREEN

The first attempt's test only asserted that a filter and its complement sum to the whole — deleting the
horizontal measurement left it green. It now carries two BEHAVIOUR tests driven by measurements replayed
from the runs below. The mutant: `countsAsHorizontalOverflow` neutered with `return false` as its first
statement, then `node --test scripts/play-screen-fit-probe.test.mjs`.

```
not ok 5 - the horizontal classifier counts unreachable spill and exempts designed scrollers
# pass 6 / # fail 1 / mutant unit rc=1
```

Restored from a `cp` copy, hash checked back (`6cce97e0…` before and after on the latest re-run):
`# pass 7 / # fail 0 / restored unit rc=0`. A classifier stubbed to `true` cannot survive either: the
case table asserts on its own composition, so both verdicts stay exercised. An earlier attempt at this
mutation silently did nothing — a heredoc nested in `bash -c` mangled the pattern and the next run
reported `# pass 7` on UNMUTATED bytes, so the mutation moved to `cp` plus `diff`.

---

## 2. Planted RED on a `KNOWN_OVERFLOW` row — a vertical exemption no longer excuses a sideways clip

`cursed-number 320x568` holds the one owner ruling in `KNOWN_OVERFLOW`, for 689px of VERTICAL scroll.
Under the rejected first attempt the horizontal number was folded into `overflowPx` and `rowKey` carries
no axis, so a plant there produced not even a warning. Planted temporarily in
`src/play/cursed-number/overrides.css` (`#app{overflow-x:hidden}` plus `#app > *{min-width:900px}`),
then `npm run build` and `ROUTES_ONLY=cursed-number` — `plant1 rc=1`:

```
::error::/game/cursed-number/play/ at 320x568 clips SIDEWAYS: 316px of content is unreachable horizontally (widest offender div#app.app-wrapper) at press 0 ...
::error::/game/cursed-number/play/ at 390x844 clips SIDEWAYS: 281px ... (div#app.app-wrapper) ...
```

`min-width` alone did NOT work: it widened the layout viewport and the probe's trap-1 guard voided both
rows — a clip needs a clipping ancestor. Specificity control, free: `1440x900` is NOT named, so a
detector reddening every row would have failed here. Restored from a `cp` copy, hash back to
`d1409670…` — `restore1 rc=0`, row reads `scrolls YES 689px / clipped 0px / sideways 0px`: the vertical
exemption stands, sideways is zero, the axes are separately answerable.

---

## 3. Planted RED in a box declaring only `overflow-y: auto`, plus the control that isolates it

Per CSS Overflow Module 3 a computed `overflow-x: visible` becomes `auto` as soon as the other axis is
not `visible` or `clip`. A box carrying nothing but `overflow-y: auto` therefore reports computed
`overflow-x: auto` and, under the first attempt, exempted itself. Planted temporarily in
`src/play/freeze-tap/overrides.css`: `main{max-height:200px;overflow-y:auto}` plus
`main > *{min-width:900px}`. `main#mainContent` is then 200px tall against a 568px viewport — UNDER the
`SCREEN_FRACTION` bound, so the bound cannot be what reds it — with a computed `overflow-x: auto` no
rule declares. `plant2 rc=1`:

```
::error::/game/freeze-tap/play/ at 320x568 clips SIDEWAYS: 612px of content is unreachable horizontally (widest offender main#mainContent) at press 0 ...
```

**The isolation control.** Plant untouched, one line of the probe swapped back to the first attempt's
reading — `declaredX: declaresX(e)` became `declaredX: DECLARED_SCROLLER.includes(cs.overflowX)` — and
nothing else. Same `dist/`, browser, plant: `rc=0`, `freeze-tap 320x568 sideways 0px`. 612px of
unreachable content reported as zero, exit 0 — the defect on demand. Both files restored from `cp`
copies, hashes back, `git status --short src/play/` printed nothing.

---

## 4. Why `visible` spill stopped counting, measured

The first attempt's X block counted every non-scroller and reported `div.css-puppet` on pinocchio-luck
as 36 / 94 / 181px of unreachable content at the three viewports — decorative overhang nothing clips,
counted once in the ancestor instead. All three are gone from the section 6 run. Two baselines, no plant.

## 5. Why the `SCREEN_FRACTION` bound is measured on HEIGHT, not width

The bound catches a box that is really the SCREEN wearing a scroller's declaration; mirroring the axis
LETTER was tried and measured wrong. Read out of the browser under the walk's seeding:

| box (all computed `overflow-x: auto`, all with a real author rule declaring it) | w / vp | h / vp |
|---|---|---|
| wire-snip-panic `.hud-player-strip` at 320x568 / 390x844 | 0.91 / 0.93 | 0.08 / 0.05 |
| zero-trigger `.player-strip-container` at 320x568 / 390x844 | 0.88 / 0.90 | 0.10 / 0.07 |
| short-stick `.player-strip` at 320x568 | 0.90 | 0.08 |

A width bound reported all five as unreachable (54-142px) when every chip is reachable with a swipe. A
full-width, one-row-tall scroller is the normal shape of a roster strip; a full-HEIGHT one is a page
container, and that is the one the bound refuses to exempt.

## 6. The full 11-route baseline, the two rows it found, and why they were recorded

`npm run build`, then `BASE=http://localhost:4592 CDP_PORT=9333 node scripts/play-screen-fit-probe.mjs`.

`FULL BASELINE rc=1`. The first fully gated run over all 33 rows named **two** sideways offenders, on
two routes and viewports; the `scripts/run-workflow-gates.sh` run that followed returned `SUITE_EXIT=1`
with `play-screen-fit` its only failing leg, naming the same two:

```
::error::/game/wire-snip-panic/play/ at 320x568 clips SIDEWAYS: 43px ... (widest offender div#screen-game.screen.active) at press 0 ...
::error::/game/pinocchio-luck/play/ at 390x844 clips SIDEWAYS: 10px ... (widest offender section#stageFrame) ...
```

**Neither was exempted by the classifier, and that is deliberate.** Measured at 320x568,
`div#screen-game.screen.active` reads `clientWidth` 320 against `innerWidth` 320 (the full screen),
`clientHeight` 393 against `innerHeight` 568 (0.69 — above the bound), `scrollWidth` 363, and the author
rules matching it that declare `overflow-x` are **none**: its computed `auto` is purely the CSS Overflow
3 coercion. Two independent grounds, either one enough.

**Both rows were RECORDED, not fixed, and the tree ships them in `KNOWN_OVERFLOW_X`.** Changing either
route's layout is separate work with its own owner call; gh#202's scope is making sideways clipping
visible at all, and until this axis existed neither row was measured by anything. Each carries a
`gh#202 open:` prefix — recorded, nobody has ruled — with its px, its offending box, and why the
exemption is narrow. Neither is covered by that route's vertical exemption; that is why the map is
separate.

A recorded row is a licence to regress for as long as nobody can see it move, which is what section 8
closes. `pinocchio-luck 390x844` is recorded at 10px, 2px above tolerance, and its reason says a CI run
reading it under tolerance should delete the row rather than keep an exception nobody can trigger — an
instruction only section 8's cleared-row warning can deliver.

## 7. The walk's own control leg, undisturbed

`BREAK_WALK=1 ... node scripts/play-screen-fit-probe.mjs` — `rc=0`, all 33 rows stayed on the fresh
screen with seeding and presses disabled. It calibrates the WALK, not this axis; recorded to show the
new gate did not disturb it.

## 8-9. The spot-fix calibrations live in a sibling file

Two later fixes carry their own reds and are recorded in
`docs/verification/evidence/202/spot-fix-calibration.md`, split out only because every markdown file in
this repo is swept at a 12KB budget: the two reporting warnings that stop `KNOWN_OVERFLOW_X` from being
write-only, and the two ways the declared-scroller reader failed OPEN. Read that file with this one; the
claims in section 6 about what an exemption costs depend on it.

## What this calibration does NOT cover

- **No measured px is asserted**, and nothing was recorded on the CI runner. Presence versus absence
  within 8px is the whole claim; every number here is this Mac's, both recorded rows included.
- **Clipping INSIDE a genuinely declared, sub-screen-height scroller is not measured**, by construction
  — the five roster strips in section 5 are exempt, and content clipped within one greens silently.
  That declaration is mockup-author-owned.
- **The browser-side element scan is not unit-tested.** The unit test drives
  `countsAsHorizontalOverflow` and `sidewaysOffenders` over replayed measurements; whether the scan
  hands the classifier the right arguments is proved only by the planted reds in sections 2, 3 and 9.
- **`declaresX` reads same-origin stylesheets only.** A declaration in a skipped cross-origin sheet
  reads as undeclared — the safe direction, but a false red.
- **A container query's condition is evaluated through `CSS.supports`, which is not its grammar.** No
  route ships one, and every failure of that predicate is a refusal to recurse, so an unevaluable
  condition ends GATED — a loud red naming the box — never exempt.
