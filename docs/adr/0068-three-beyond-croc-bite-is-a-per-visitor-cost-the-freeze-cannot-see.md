# ADR-0068 — `three` beyond เข้งับ: the real cost is per visitor, and the freeze gate cannot see it

Date: 2026-09-26 · Status: **rejected — owner ruling 2026-09-26, croc-bite only** · Would have amended
[ADR-0060](0060-one-renderer-for-the-site-three-is-admitted-and-the-freeze-baseline-moves-once.md)'s
"exactly this and nothing more" · Relates: [ADR-0051](0051-canvas-2d-is-the-default-and-a-play-route-never-blanks-the-page.md),
ADR-0040, ADR-0057

## Context

ADR-0060 admitted `three` for เข้งับ only, and ruled "one renderer for the site". The owner asked in
chat on 2026-09-26 for a new ADR on letting five more entries use it: siamsi, dice-loser, timebomb,
short-stick, wheel. This reopens only the "croc-bite only" scope. `three` stays the one renderer, and
ADR-0060's bar for a *second library* is untouched.

The five are not one kind of thing (ADR-0040):

- **dice-loser, timebomb, short-stick** are เกม in the `party` หมวด, each a play route.
- **siamsi** is in the `fortune` หมวด, one player, a non-play landing rendered through the game shell.
- **wheel** is a randomizer tool at `/tool/wheel/`, not a เกม.

## What it costs — measured 2026-09-26

Method: a detached worktree at `57fe1f4`, outside the repo; `npm run build`, then
`node scripts/bundle-freeze-check.mjs`. Per-visitor weight was taken by following a page's
`<script src>` tags and each chunk's static import edges to closure. Gzip is node zlib level 9, which
is not the CDN's encoder.

**Positive control.** The unmodified tree builds green: 37 basenames and 39 page-entry pairs match
exactly, and the total is **1,081,373** against the pinned 1,049,872. That is +3.0%, so the tree was
already drifting before this experiment. Headroom to the +5% ceiling (1,102,366) is **20,993 bytes**.

**The experiment.** A minimal scene was added to dice-loser's play entry: renderer, scene, camera,
two lights, a box mesh with `MeshStandardMaterial`, rendered once. It was statically imported the
way croc-bite imports `three`.

| Variant | Freeze legs red | Total | Δ |
|---|---|---|---|
| baseline | none | 1,081,373 | — |
| dice-loser, static import | **SET only** (`three.module.js`) | 1,081,642 | +269 |
| + timebomb, static import | SET only | 1,082,117 | +475 more |
| dice-loser, dynamic import, destructured | SET (`three.module.js`, `preload-helper.js`) | 1,088,523 | +7,150 |
| dice-loser, dynamic import, namespace | SET **and BYTES** | 1,272,806 | +191,433 |

**The inference this was asked to test is wrong.** A second importer does not red all three legs.
Rollup moves `three` out of croc-bite's entry chunk (561,684 → 63,824) into one shared
`three.module` chunk (497,654). Two importers still ship one copy, not two: the chunk's hash was
identical across the one-route and two-route builds. The total barely moves, because the library was
already counted inside croc-bite's chunk. The pair leg cannot move, because every play route's entry
chunk has the same basename with the hash stripped.

**The cost that does move is per visitor.** dice-loser's page-load JavaScript, static import:

| | raw | gzip |
|---|---|---|
| before | 17,543 | 8,138 |
| after | **515,672** | **134,691** |

That is 29× raw and 16.5× gzip, for a party game that loads on a phone on mobile data. The freeze
total is a union over pages, so it is a CDN figure. The bundle-freeze-check header says so, and this
is the number it was never built to see.

**Loading pattern is part of the decision:**

- *Static namespace import* (croc-bite's pattern) puts the whole cost on the page load.
- *Dynamic import, destructured* keeps the page load at 19,790 raw. `three` is fetched when the 3D
  surface starts. The shared chunk grows to 503,550, so croc-bite visitors pay +5,948 bytes.
- *Dynamic import used as a namespace object* defeats tree-shaking. The chunk becomes 688,389, and
  croc-bite, which loads it statically, gets 190,735 bytes heavier. **This is the trap. Never ship it.**

## What moves in the freeze gate

- `three.module.js` joins `BASELINE_BASENAMES`, plus `preload-helper.js` if the loading is dynamic.
  The croc-bite note there saying "there is no `three` chunk here" goes stale and is rewritten in the
  same change.
- **Inferred, not measured:** a real route's own 3D code (croc-bite's entry is 63,824 after the split)
  exceeds the 20,993 headroom. The BYTES leg would then fire on the first real route, and the total is
  re-pinned in the same change under the file's existing rule, with attribution.
- **Second-order: after that re-pin, the gate goes blind to adoption.** A third, fourth or fifth
  importer adds only its own route code and trips no leg. Whoever adopts later has no red telling
  them what their visitors now download. Any ruling should carry a per-page closure check for pages
  that load `three.module`, or accept this blindness in writing, as ADR-0060 did with its band.

## Does each one genuinely need it (ADR-0051's bar)?

- **dice-loser — strongest case.** Tumbling dice are three-dimensional objects. Today they are DOM
  boxes with pips. Unmeasured native option: a CSS `preserve-3d` cube, which needs zero library bytes.
  That should be measured and shown before `three` is chosen.
- **timebomb — weak.** It already draws hand-made depth on Canvas 2D, which is exactly the answer
  ADR-0051 gave for this game. `one-bomb` already ships a WebGL bomb on hand-written shaders as a
  separate game, so "a 3D bomb" is already on the site.
- **short-stick — weak, and in tension with a guarantee.** ADR-0051 records that the `.stick-grid`
  flex-wrap is what keeps ten seats at 44px on a 320px screen, and that the canvas must not own
  layout. A 3D scene that owns the sticks would put that guarantee at risk.
- **siamsi — weak to moderate.** One-person fortune, DOM-rendered, driven by shake input. Its module
  loads lazily through the game shell's glob map, so that load path was not measured.
- **wheel — weakest.** A flat SVG disc under a button. A spinning wheel is a 2D object, and SVG
  already draws it exactly.

## Obligations every admitted route inherits

- **Never blank the page** (ADR-0051), shipped in the same change. Use croc-bite's shape: a playable
  no-3D round (`no-3d-round.test.mjs`) and context-loss handling (`webgl-context-loss.test.mjs`).
- **Reduced motion reduces, it does not remove.** The scene may stop animating but must still show
  the state (ADR-0046, ADR-0051).
- The canvas carries `role="img"` and an `aria-label`, and state changes are announced in a live
  region outside it.
- A play route keeps `arm-reveal-paths.test.mjs` covering every reveal, including the close paths
  (ADR-0057, ADR-0059).
- A pixel-readback check on the 3D surface, calibrated against a stubbed renderer (ADR-0051).

## Ruling — 2026-09-26

**Option 1, croc-bite only.** Given by the owner in chat on 2026-09-26, after seeing the measured
per-visitor cost. ADR-0060's scope stands unchanged. The other five stay on Canvas 2D, CSS or SVG,
and a WebGL look for them is built by hand without `three` (the route pinocchio-luck already takes).
The measurements above are kept, so the question is not re-asked without new numbers — see "The fact
that would reopen this".

## The options that were put to the owner

1. **Keep croc-bite only** (status quo). Rejected-by-default alternative: Canvas 2D stays the answer
   for the other four, and SVG for wheel.
2. **dice-loser only**, after the CSS-3D option is measured and loses.
3. **Per entry, each with a written "needs it" case**. This draft supports dice-loser only.
4. **All five.**

For any option except 1, the owner also rules on (a) the loading pattern (this draft recommends
dynamic destructured import) and (b) whether a per-page weight check is added or the blindness is
accepted.

## Not measured

Rendering was not tested (the probe never ran in a browser). Neither was a real route's 3D code, nor
the siamsi and wheel load paths, nor the CDN's actual compression.

## The fact that would reopen this

A measurement showing a 3D route's page-load weight stays within a small multiple of today's routes.
For example, a lazily loaded `three` that visitors fetch only after choosing to play. At that point the
per-visitor objection that drives this draft falls away.
