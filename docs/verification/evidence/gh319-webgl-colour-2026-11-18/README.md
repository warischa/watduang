# gh#319 — the WebGL pixel lane's colour leg, REFUTE round 1 (2026-11-18)

The colour leg added to `scripts/webgl-pixels-probe.mjs` reds a reveal whose moving materials paint
nothing — PD-316-01, where the marble race drew before a transparent background so **0 marble pixels**
painted while the plates/band/figure kept the canvas **non-blank** and the blank classifier passed it.
Round 0 counted colour statically; a cross-lineage judge REFUTED it on three points. This records the
fixes and the measurement the rows were re-admitted from.

## The three findings and their fixes

1. **Mechanism (High): a static count is not the reveal.** 400 stationary pink chrome pixels at reveal
   age 0 with zero marbles would pass a static count; real builds red only because the scene happened to
   hold fewer static in-band pixels than the bound. **Fix — a differential count.** `changedHistogram`
   takes two RGBA readbacks of the same surface and counts only positions whose quantised colour CHANGED
   between them; stationary chrome/HUD is byte-identical and contributes nothing. Under the differential
   the marbles gold chrome contributes **0** (it never moves) while the pink race contributes ~2215.
2. **Spot-fix (Medium): a non-blank readback with no colour sample silently PASSed.** **Fix —** a live
   adapter is always colour-judged; `classifyColour` returns FAIL "no colour sample" when the sample is
   absent, and an adapter with neither a row nor a sample FAILs too. The integration test that expected
   PASS was flipped to FAIL.
3. **Spot-fix (Medium): the in-browser binning was untested** — removing the saturation filter left the
   suite green while 400 near-grey `RGB(200,199,200)` pixels (hue ~300) passed a pink band. **Fix —**
   `litHueBin` (the lit/saturation filter and hue binning), `changedHistogram`, `inBand` and `inBandCount`
   are exported pure functions, **stringified into `COLOUR_DIFF` so the page runs the same text the tests
   pin** (one source, asserted by a test). New tests feed raw RGBA: near-grey, low-saturation, dark, white,
   and hue-wrap.

## The motion rule as built

- **Differential pair:** two readbacks of the same canvas, each inside an animation frame (the drawing
  buffer is cleared once presented), spaced **Δt ≥ 200 ms** (`DIFF_GAP_MS`). A pixel counts only if its
  quantised RGBA changed between the pair AND it is lit (value ≥ 0.65) and chromatic (saturation ≥ 0.20)
  in either read; it is attributed to its lit hue bin.
- **Observed motion, not a clock:** a fixed age lands in a static phase — ladder/envelopes/flipcards hold
  a **1500 ms idle** before the first light, fireworks has lulls between bursts. `COLOUR_DIFF` skips pairs
  whose `changedTotal < MOTION_FLOOR` (1000 — substantial motion, not a lull; a weak fireworks fade changes
  ~200 px total, a real burst ~11000).
- **Strongest over a window:** a single pair can still catch a weak phase (substantial total motion but
  little in-band — a fireworks fade changed >1000 px total yet only ~700 gold). So the sampler collects
  **6 moving pairs** (`windowPairs`) and keeps the one with the highest **in-band** changed count, scored
  with the row's own band via the exported `inBandCount`. Both reads of every scored pair are mid-motion.
- **Sample ages:** a driven reveal ages from its press stamp (`window.__revealPressAt`, set by
  `clickWhenArmed`); a screen route has no press and is sampled in live post-handover play (ages null).
  The ages below are the strongest pair's, per run. The window waits through idle/lulls, so intermittent
  reveals (envelopes, flipcards, fireworks, prize-draw) are sampled later, at their strongest burst/lift.
- **Opt-outs: NONE.** Every row is a motion row (`motion` defaults true). Each bright family genuinely
  moves; the sampler waits until it does. No row needed `motion:false`. (The classifier supports an
  opt-out that judges the plain lit count, for a future family that never moves; none is used.)
- A blank canvas (the stub-control leg, or a real blank readback) sets `waitForMotion:false`: one pair,
  no cap-long wait, and the classifier FAILs it.

## The set

Every `adapter` in `src/play/_render-suspension.json`, re-counted: **11** — croc-bite, one-bomb,
pinocchio-luck, prize-draw, prize-fireworks, prize-cards, prize-ladder, prize-zones, prize-marbles,
prize-envelopes, prize-flipcards. An adapter with no row FAILS by name; a live adapter with no sample
FAILS by name.

## Instrument

`scripts/webgl-pixels-lane.sh`, the CI `webgl` job's flags (`--use-angle=swiftshader
--enable-unsafe-swiftshader`). In-page renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
(LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`. Own port pair: server `4333`, CDP `9444`; lane output
and browser profile under the OS temp root (`<tmp>`), never `.scratch/`. Viewports (`viewportFor`): prize
reveal routes wide `1280x800` (the 3D path), screen routes phone `390x844`. **n = 3 healthy runs**, each
route's count the strongest in-band moving pair over its 6-pair window; `minPixels` ≈ ⅓ of the MIN peak.

## Seeding runs — differential peaks (healthy build, 3 runs)

Counts are in-band MOVING lit pixels (the differential), strongest pair per run. Ages are ms after the
reveal press (null = screen route, live play); retries = idle/lull pairs skipped; Δt = the pair's gap.

| route | band | run1 / run2 / run3 peak | MIN | minPixels | ages (ms) | retries | Δt (ms) |
|---|---|---|---|---|---|---|---|
| croc-bite | 150 ± 30 | 8300 / 8424 / 8334 | 8300 | 2700 | null (live play) | 0,0,0 | 212,213,210 |
| one-bomb | 40 ± 30 | 1367 / 1439 / 1307 | 1307 | 430 | null (live play) | 0,0,0 | 202,214,201 |
| pinocchio-luck | 40 ± 30 | 3655 / 3799 / 4198 | 3655 | 1200 | null (live play) | 0,0,0 | 227,223,225 |
| prize-cards | 40 ± 30 | 13570 / 13573 / 13856 | 13570 | 4500 | 587/803, 768/972, 1176/1386 | 0,0,0 | 216,204,210 |
| prize-draw | 40 ± 30 | 4802 / 4818 / 3268 | 3268 | 1000 | 973/1173, 1118/1335, 10000/10254 | 14,6,18 | 201,217,254 |
| prize-envelopes | 40 ± 30 | 6066 / 10106 / 4491 | 4491 | 1400 | 8553/8765, 8600/8801, 8751/8968 | 30,30,30 | 212,201,217 |
| prize-fireworks | 40 ± 30 | 4818 / 7675 / 4792 | 4792 | 1500 | 1332/1534, 10854/11091, 1036/1252 | 3,18,3 | 203,238,216 |
| prize-flipcards | 40 ± 30 | 3157 / 3123 / 3215 | 3123 | 1000 | 8878/9095, 8921/9121, 2042/2243 | 16,16,31 | 216,200,201 |
| prize-ladder | 40 ± 30 | 7254 / 7154 / 7359 | 7154 | 2300 | 2765/2966, 2776/2977, 2703/2919 | 3,3,3 | 201,200,216 |
| prize-marbles | 330 ± 30 | 2232 / 2218 / 2215 | 2215 | 700 | 863/1083, 883/1102, 855/1059 | 0,0,0 | 220,219,203 |
| prize-zones | 40 ± 30 | 33208 / 30655 / 30655 | 30655 | 10000 | 821/1035, 756/964, 777/984 | 0,0,0 | 214,208,207 |

Every route collected its full 6-pair window (`movingPairs=6`) in all 3 runs. The band choices: gold
(`COLOR.gold #ffcc00`, hue ~48) is the moving bright family for the prize reveals — for **prize-zones the
shader paints the moving sweep in gold** (the cool zone fills are static, so round 0's cool band was wrong
for a motion count); **prize-marbles uses the pink race** (`COLOR.punch #ff3d7f`, hue ~340), not the gold
chrome that survives PD-316-01; croc-bite the green body; one-bomb the orange-gold bomb segments.

## Green run — final table, healthy build

Clean leg **PASS**, all 11 adapters colour PASS, stub-control FAIL. Lane exit **0**, 2/2 legs. Counts:
croc-bite 8252, one-bomb 1270, pinocchio-luck 3629, prize-cards 13661, prize-draw 4657, prize-envelopes
6051, prize-fireworks 4791, prize-flipcards 3125, prize-ladder 7359, prize-marbles 2232, prize-zones 33208
— every one above its `minPixels`.

## MUST-RED 1 — the outcome, PD-316-01 under the NEW count

Removed `transparent: true` from the three race materials in
`src/play/prize-marbles/renderer/index.ts` (the marble `ShaderMaterial`, the glow and streak
`MeshBasicMaterial`s) — the opaque race drawn before the transparent background. Rebuilt (`npm run build`),
re-ran the lane.

- **prize-marbles**: `nonBlank = true`, `distinctColours = 114` (the chrome paints — the blank classifier
  PASSES), differential colour count **0** in band 330 ± 30, needs 700 → **FAIL by name**:
  `prize-marbles: only 0 moving lit pixel(s) in its hue band (330 deg +/- 30 deg), needs 700 -- the
  reveal's moving bright family painted nothing (PD-316-01 shape)` (sample age 4916/5132 ms, Δt 216 ms).
- All other 10 adapters PASS. Clean leg FAIL, lane exit **1**; stub-control FAIL. 1/2 legs matched.

The static gold chrome moved a little during the race but is outside the pink band, so it could not mask
the bug — exactly what finding 1 demanded.

## MUST-RED 2 — synthetic static-pink fixture (unit)

`changedHistogram` over two IDENTICAL buffers of 400 in-band pink pixels (`COLOR.punch`): `changedTotal
= 0`, `changedHist` all zero (the plain `histA` still sees 400 pink — it is the differential that must
not). `classifyColour` against the marbles row → **FAIL**, count 0. A moving control (the same 400 pink
pixels shifted between the reads) → `changedHist[33] ≥ 400` → PASS. A near-grey control (400
`RGB(200,199,200)` → `RGB(210,199,210)`, changed but saturation < 0.20) → `changedHist` all zero → FAIL,
which reds if the saturation filter is removed. These are the `gh#319 r1` tests in
`scripts/webgl-pixels-probe.test.mjs`.

## Restore

Restored `index.ts` from a `cp` copy (sha256
`9b76cad0750c68b136c8c36a4461504c7670139e2a980bf7625e5ec9315b1db2` before and after, `git diff` on the
file empty), rebuilt, re-ran the lane: clean PASS, stub-control FAIL, exit **0**, 2/2 legs. `dist/` is
left built from the restored tree.

## Unit calibration — red before, green after

`node --test scripts/webgl-pixels-probe.test.mjs`: **70 tests, 70 pass**. Test-first reds: the new
exports absent (`SyntaxError: ... does not provide an export named 'COLOUR_ROWS'`); the coverage gate red
naming all 11 adapters with no row; the flipped no-sample integration test red against the round-0
skip-and-PASS behaviour. Each rejection branch carries its own must-red — outside band, below minPixels,
missing row, **no sample**, out-of-domain row, malformed sample, Δt < 200 ms, stationary pink, changed
near-grey. The static-pink fixture FAILs under the differential where the round-0 static count PASSed it.

## Not covered

- n = 3 healthy runs on one machine (Mac, SwiftShader). CI runner peaks may differ; `minPixels` ≈ ⅓ of the
  observed min carries ~3× margin. Re-measure and re-admit on a runner change.
- The window keeps the strongest moving pair, so intermittent reveals are sampled at their peak burst/lift
  (ages up to ~10 s), not a fixed phase. A reveal whose bright family never reaches `minPixels` moving
  pixels within the 20 s cap FAILs (or returns no sample) — that is the contract, not a lull artefact.
- The leg detects the bright family painting too little MOVING colour, not a recolour within the band, and
  not a partial dimming that stays above `minPixels`. Screen routes are sampled in live post-handover play,
  not a driven reveal action.
