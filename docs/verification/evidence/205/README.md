# gh#205 box 6 evidence — bangkok-drift canvas paint, five legs

Captured 2026-09-08 against `dist/` built from route source pinned at commit `0a01a92`
(`src/play/bangkok-drift/main.js`, `markup.html`, `style.css` — no working-tree diff against that
SHA at capture time). **The probe itself is newer than the pinned route**: this session added a
fourth control, `BD_STOP_LOOP`, to `canvas-frames-probe.mjs` and it is still uncommitted at capture
time (`git diff --stat` showed it modified). If `canvas-frames-probe.mjs` is later committed at a
different SHA than the one this record was made against, re-run before trusting this table — this
is what "still valid" vs "re-run me" turns on here.

Browser: headless Chrome 152.0.7977.76, `npx serve dist -l 4592`, CDP on 9592, viewport 375x812
CSS / `deviceScaleFactor: 2` / `mobile: true` (set by the probe itself).

Command for every JSON here:

```
BASE=http://localhost:4592 [BD_REDUCED=1 | BD_STUB_PAINT=1 | BD_NULL_CTX=1 | BD_STOP_LOOP=1] \
  node src/play/bangkok-drift/canvas-frames-probe.mjs 9592 <shot.png>
```

## The five legs

| leg | file | exit | frames | paints | coverage | distinct colours | fps |
|---|---|---|---|---|---|---|---|
| baseline | `probe-baseline.json` | 0 | 120 | 240 | 1 | 149 | 60 |
| `BD_STOP_LOOP=1` | `probe-stop-loop.json` | 1 | 1 | 2 | 1 | 150 | 0.5 |
| `BD_STUB_PAINT=1` | `probe-stub-paint.json` | 1 | 111 | 222 | 0 | 0 | 55.5 |
| `BD_NULL_CTX=1` | `probe-null-ctx.json` | 0 | 120 | 0 | n/a (`context: null`) | n/a | 60 |
| `BD_REDUCED=1` | `probe-reduced.json` | 0 | 120 | 240 | 1 | 199 | 59.9 |

All five numbers above are from runs made this session on this machine, one leg at a time,
sequentially. They match the worker's premise numbers for baseline / `BD_STOP_LOOP` /
`BD_STUB_PAINT` / `BD_NULL_CTX` on `drawing`/exit and on frames-vs-floor. One disagreement, recorded
below under Calibration.

## Calibration is two-sided

- **`BD_STUB_PAINT` reds the ink term while frames stay healthy:** frames **111** (well above
  `FRAME_FLOOR` 30) and coverage **0** (below `COVERAGE_FLOOR` 0.2) — the loop keeps running, the ink
  never lands, `drawing:false`.
- **`BD_STOP_LOOP` reds the frame term while coverage stays above the ink floor:** frames **1** (below
  `FRAME_FLOOR` 30) and coverage **1** (well above 0.2) — the ink already on the canvas from the last
  real frame is still there, the loop is frozen, `drawing:false`.

These are opposite failure shapes on the same two-term check, and each leg reds only the term it is
built to red. Neither leg reds both terms.

## The finding this record exists to pin

**`frames > 0` would have passed the `BD_STOP_LOOP` leg.** That leg measured frames = **1**, which
is `> 0`. A frozen `requestAnimationFrame` loop still fires exactly once more after the freeze
statement runs (the in-flight callback from before the freeze completes), so a bare `frames > 0`
check reads a stopped loop as drawing. `FRAME_FLOOR = 30` is what actually catches it — 1 is far
below 30. This is measured fact from this session's own `BD_STOP_LOOP` run, not inherited from the
design-pass recommendation it refutes.

## BD_REDUCED outlier — re-run, not the record

The first `BD_REDUCED=1` run measured frames=81, fps=40.5, distinct colours=204 (coverage still 1,
still `drawing:true`) — comfortably above both floors, so it was not a defect, but it was a sharp
drop from every other leg's ~120 frames. Per the discipline of not trusting a single run that looks
like an outlier, that leg was re-run alone: frames=120, fps=59.9, distinct colours=199. The table
above uses the re-run. The discarded first run is kept at
`probe-reduced-discarded-outlier.json` for the record, not folded into the table — most likely
first-navigation JIT/GC jitter on this machine (both runs load the identical route fresh), not a
route defect; not isolated further, since isolating it would mean instrumenting the probe, which is
out of scope here.

## What this does NOT prove

- **n=1 per leg** (two for `BD_REDUCED`, see above) on **one machine**, hand-run this session, not a
  distribution. A different machine, a loaded machine, or a different Chrome build can read
  different frame counts.
- **No CI leg exists for this probe, by design** — matching four sibling routes' own probes
  (`short-stick`, `timebomb`, `wire-snip-panic`, `zero-trigger`), each documented "Manual tool, NOT a
  CI leg." This record does not add one, an npm script, or a `ci-probes.sh` entry.
- **`FRAME_FLOOR = 30` is a machine-speed number**, not a portable one — chosen to sit far below this
  machine's ~60fps and far above zero, so what it asserts is "the loop runs," never "this machine's
  speed." A slower CI runner or device could plausibly read fewer than 30 frames in 2000ms even with
  a healthy loop, which the floor as written would then misjudge as `BD_STOP_LOOP`-shaped.
- **The reduced-motion leg shares both floors on purpose** (this route scales the simulation, never
  the drawing, so a reduced run drawing fewer frames would be a defect) — but that leaves no floor
  that is itself scaled to `BD_REDUCED`'s own baseline. A machine-portable replacement, **not built
  here**, would be a same-run relative check: read baseline frames and `BD_REDUCED` frames in one
  run and assert the reduced count is not below some fraction of the baseline count, rather than a
  fixed absolute floor both legs share. This is a future-improvement note, not a change to
  `FRAME_FLOOR`/`COVERAGE_FLOOR`/`out.drawing` — none of the three were touched this session.
- This says nothing about a real phone. Box 6 rows 1-2 (real-device confirmation) are still open;
  this record is the canvas-paint sub-claim only, and the box is not ticked by this record.

## How to regenerate this

1. `npm run build`.
2. `npx serve dist -l 4592 &` — record the pid.
3. `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
   --no-sandbox --remote-debugging-port=9592 --user-data-dir=/tmp/<unique> about:blank &` — record
   the pid.
4. Run each leg from the Command block above, sequentially, never concurrently — they share the
   port and the browser tab lifecycle.
5. Kill only the two pids recorded in steps 2-3.

## Files

- `probe-baseline.json`, `probe-stop-loop.json`, `probe-stub-paint.json`, `probe-null-ctx.json`,
  `probe-reduced.json` — the five legs' tracked JSON, one per row of the table above.
- `probe-reduced-discarded-outlier.json` — the first `BD_REDUCED` run, kept for the record, not
  used in the table (see "BD_REDUCED outlier" above).
- Screenshots were captured alongside each JSON, but each JSON's `screenshot` field points into this
  session's scratch directory, never into `docs/verification/evidence/`
  (`.gitignore`'s `docs/verification/evidence/**/*.png` rule does not apply to them — they were never
  written under this path). Scratch is wiped, including mid-session; those paths are dead for any
  later reader and the screenshots are not retrievable. The JSONs and the table above are the
  evidence — regenerate screenshots with the command above if a fresh look is needed.
