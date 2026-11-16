# Scroll-only admissions, 2026-11-16 — measured before admitted

Owner ruling (popup, 2026-11-16): extend `SCROLL_ONLY_ROWS` in `scripts/play-screen-fit-probe.mjs` to exactly
four more `KNOWN_OVERFLOW` rows — `freeze-tap 320x568`, `zero-trigger 320x568`, `wire-snip-panic 320x568`,
`short-stick 320x568` — and to no others. Gate (vii) reds any `clippedPx > 0` on a member row, on every
screen. Admission was conditional on measuring each row at 0px clipped and 0px sideways first; all four
measured that way and all four joined.

This directory also records the second half of the batch: a wiring-level test for the fit probe's
production measurement-acquisition path, which the REFUTE finding said no test reached.

## The build these numbers describe

`dist/` built at commit `1f57574`. **No rebuild was run** — `npm run build` is reserved, and a probe that
measures a freshly regenerated `dist/` is not measuring the bytes that get deployed. Provenance checked by
mtime, not assumed: the newest file anywhere under `dist/` is `dist/sitemap-index.xml` at
`2026-11-16T03:17:39Z`, which predates the working tree's only `src` edit at the time
(`src/play/prize-draw/stage.ts`, `2026-11-16T03:28:34Z`, another agent's work, therefore not in this build).
None of the four routes measured here is `prize-draw` in any case.

## The lane, and its flags

`scripts/ci-probes.sh` in narrowed mode, one route per run, three runs per route, **one run at a time**:

```bash
PROBE_PORT=4322 PROBE_CDP_PORT=9333 PROBE_OUT_DIR=<tmp>/run-<route>-<n> \
  PROBE_SCOPE=routes:<route> bash scripts/ci-probes.sh
```

- Chrome is the lane's own launch: `--headless --disable-gpu --no-sandbox`, profile under `<tmp>/`. On this
  Mac those flags grant no WebGL context, so a 3D route draws its fallback — none of these four routes is a
  WebGL route, and the flags are the ones CI's fit legs use, which is the point of taking them from the
  script rather than hand-launching a browser.
- `ROUTES_ONLY` was never set from outside; the script refuses it and sets it itself per leg in this mode.
- Viewports are the probe's own three (320x568, 390x844, 1440x900), emulated through CDP
  `Emulation.setDeviceMetricsOverride`, and the walk re-asserts `innerWidth` before trusting a read.
- Concurrency stayed at one run: these are self-timed screens, and a second Chrome competing for CPU is a
  known way to move a fit row's worst screen. Only one server port was assigned to this work.
- Every run exited 0. Legs passed: 14 per `freeze-tap` run, 16 per run of the other three (the narrow plan
  differs by route). Each run includes the `BREAK_WALK=1` control leg, and all 12 control legs reported
  `OK control: all 3 route/viewport row(s) stayed on the fresh screen` — the walk invariant can fail.
- Leg-time sums were 481–527s per run except `short-stick` run 1 at 935s, an outlier under machine
  contention. Its fit log is byte-identical to that route's other two runs, so the readings agree even
  though that run's wall clock did not.

## Per-row readings at 320x568 — every screen, n=3

`clipped` and `sideways` are the per-screen columns of the probe's own `fmtScreens` emission, not the
row summary's worst-of. Scroll px is reported because it is what the ruling grants; it is never gated.

| row | screens | per-screen scroll px (class) | max clipped | max sideways | admitted |
|---|---|---|---|---|---|
| `freeze-tap 320x568` | 4 | press 0: 37 (player) · press 1: 26 (round) · press 2: 0 (round) · press 3: 0 (round) | **0** | **0** | yes |
| `zero-trigger 320x568` | 4 | press 1: 68 (player) · press 2: 143 (round) · press 3: 143 (round) · press 4: 143 (round) | **0** | **0** | yes |
| `wire-snip-panic 320x568` | 4 | press 1: 67 (player) · press 2: 0 (round) · press 3: 19 (round) · press 4: 19 (round) | **0** | **0** | yes |
| `short-stick 320x568` | 3 | press 1: 54 (player) · press 2: 114 (round) · press 3: 156 (round) | **0** | **0** | yes |

`freeze-tap` walks 9 forced draws (`DRAW_COUNTS`), merged worst-per-press; the other three walk one.

**Agreement:** the three clean fit logs within each route are byte-identical (`diff -q`), so the three runs
agree on every screen, not only on the two numbers that gate.

**Against the recorded px:** `freeze-tap` 37px on press 0, `zero-trigger` 143px on press 2 and
`wire-snip-panic` 67px on press 1 reproduce their reasons exactly. `short-stick` read 156px on press 3
against the 191px on press 0 its reason records — a downward drift on one machine, which check (iv) reports
and never gates. The header was left as the ruling wrote it and no px was re-recorded; the drift is noted in
the row's appended clause.

**Screen class:** each row's worst screen carries the class `KNOWN_OVERFLOW_SCREEN` declares for it
(`freeze-tap` player, `zero-trigger` round, `wire-snip-panic` player, `short-stick` round), read off the
page's own `data-player-screen` attribute. Checked by executing the module: every `KNOWN_OVERFLOW` key has
a declared class, and all four rows were in `KNOWN_OVERFLOW`, in neither `FITS_ROWS` nor `KNOWN_OVERFLOW_X`,
before they joined.

## Instrument calibration — run before any number above was trusted

The extractor reads the `::notice::` row summary and the `::notice::  screen [press N]` lines that follow
it, and reports each screen's clipped and sideways px.

- **Positive control:** the committed log
  `docs/verification/evidence/gh305-gates-2026-11-14/fit-before-run1.txt`, row `prize-cards 320x568` →
  2 screens, scroll 3429px, clipped 0, sideways 0 — the numbers that row's reason records.
- **Must-red:** a fabricated log whose press-0 screen carries `clipped 7px by div#app [furthest below:
  div.hud 0,489,320,158 (+7px)]` and `sideways 5px by div#planted` → reported 7 and 5, with the following
  clean screen still 0 and 0. The suffix that a clipping line carries does not hide the sideways column.
- **Empty-set leg:** asking for a row the log does not contain prints `NO_ROW_MATCHED` and exits 2, so a
  failed extraction cannot be read as a zero.

## Gate (vii) must-red, calibrated per member

The pin test is `the scroll-only rows are exactly the nine scroll rulings, each a KNOWN_OVERFLOW row
recorded at 0px clipped` in `scripts/play-screen-fit-probe.test.mjs`. Its regex was not loosened.

- Stripping `0px clipped, 0px sideways` from each newly admitted row's reason, one at a time, reds that
  test naming the row: `freeze-tap 320x568`, `zero-trigger 320x568`, `wire-snip-panic 320x568`,
  `short-stick 320x568` — 4 of 4, each 90 pass / 1 fail.
- Adding a row nobody measured (`cursed-number 320x568`) to `SCROLL_ONLY_ROWS` reds the set-equality half
  of the same test.
- Restored byte-identical after every mutation; 91 pass / 0 fail afterwards.
- The behavioural must-red tests below the pin loop over the whole set, so a 3429px clip with 0px to scroll
  now reds on each of the nine members, and a 1px clip on a non-worst screen still reds.

## The production-acquisition wiring test (the REFUTE half)

Every earlier run of `main()` in that test file supplied rows through `PROBE_OUT_JSON` or an injected
`acquireMeasurements`; both return before the branch a CI leg takes. The new tests call `main()` with **no
acquire override**, so its default parameter binds the module's own `acquireMeasurements` symbol, and stub
only the child process: a `NODE_OPTIONS --require` preload writes the measurement JSON to the descriptor
`acquireMeasurements` opened and exits before `scripts/driver.mjs` loads. The build guard, the spawn, the
JSON file, the parse and the gates all run for real.

- Asserted: the child's argv is this repo's `scripts/driver.mjs` plus this probe module, its cwd is the repo
  root, its `BASE`/`CDP_PORT` are the ones the production failure message names, and the collected rows
  reach the sink once each in order with every screen — including a distinctive 689px value that only
  survives if the report is built from what the child wrote.
- Failure legs: a child exiting non-zero, unparseable child output, and a missing build each exit 1 with
  their own named reason, emit no measurement and never reach the `OK` verdict.
- **Must-red:** a `throw` injected into the production acquisition branch red exactly the two new tests
  (89 pass / 2 fail, error `MUTATION 2026-11-16: production acquisition broken`); every pre-existing test
  stayed green, which is the REFUTE finding measured rather than argued. Restored from a copy, sha256
  identical, 91 pass.
- **CI order:** the `build` job runs Unit tests before its own Build step, so `dist/index.html` does not
  exist there. The `existsSync` stub is scoped to that one path for this reason. Measured, not inferred:
  `src` and `scripts` were copied into a tree with no `dist/` and the test file run there — 91 pass, both
  new tests included.

## Files here

- `fit-<route>-run<n>.txt` — the clean fit leg's log, all three viewports, every screen line.
- `fit-control-<route>-run<n>.txt` — the `BREAK_WALK=1` control leg of the same run.
- `legs-<route>-run<n>.txt` — the narrowed run's leg verdicts and `LEG_SECONDS` lines.

Every absolute path was scrubbed to `<repo>/` or `<tmp>/` on the way in; the logs are otherwise verbatim.

## What this does not cover

- **One machine's lane.** These are this Mac's readings under `--disable-gpu`. The runner's font stack can
  read a clip where this Mac reads none — the probe's own licence says a recorded px is one machine's
  number. Admission follows the owner's prescribed n=3 procedure on this lane; the next full CI run is the
  runner's verdict on it, and a clip there reds gate (vii) by name.
- **Narrowed runs attest nothing.** The lane prints `iteration only, never the deploy verdict`, and no
  run-level check ran here. This is not a substitute for the full suite before a push.
- No layout was changed and no fix is measured here; the four rows keep the scroll their rulings grant.
