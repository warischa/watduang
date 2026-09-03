# gh#182 same-day BEFORE baseline — 2026-09-03

Recorded on the live checkout, tree HEAD `aae8a5f` (still unfixed — the six worktrees for gh#182,
gh#194, gh#180, gh#181, gh#183 have not merged), so the after-run later this session diffs against
THIS run, not a stale one. `npm run build` once, `npx serve dist/ -l 5063` + headless Chrome
`--remote-debugging-port=9231`, both legs against the same build, no server restart between legs.

Invocation (matches `scripts/ci-probes.sh:264-265`):
```
env BASE="http://localhost:5063" CDP_PORT="9231" node scripts/play-screen-fit-probe.mjs
env BASE="http://localhost:5063" CDP_PORT="9231" BREAK_WALK=1 node scripts/play-screen-fit-probe.mjs
```
Run at 2026-09-03T04:2x-04:3xZ.

## Exit codes

| Leg | rc |
|---|---|
| Baseline (clean walk) | **0** |
| Control (`BREAK_WALK=1`) | **0** |

**Finding on the control leg's expected outcome — the brief's premise does not hold for this
script.** `BREAK_WALK` is NOT a fail-shaped mutant like `play-exit-probe.mjs`'s `PROBE_STALL_MS`.
Reading `scripts/play-screen-fit-probe.mjs:107-119,514-528`: it disables both seeding and presses,
and the assertion is INVERTED — every one of the 33 rows must report "never left the fresh
screen" (0 screens). The script only calls `process.exit(1)` if some row's screen count is
NONzero (i.e. the walk moved without a seed, meaning the "it left setup" signal is unreliable).
`scripts/ci-probes.sh:176-196` (`standalone()`) also judges this leg PASS on exit 0, same as the
clean leg — confirmed by reading the harness, not inferred. This run's control printed:
```
OK control: all 33 route/viewport row(s) stayed on the fresh screen with both the seeding and the
presses disabled — so the walk invariant CAN fail, and the screen signature is stable across the
6 press intervals the clean leg spends walking (a signature that drifted on its own would report
"it left setup" about a walk that never moved).
```
Zero `::error::`/`::warning::` lines in either log (confirmed via `grep`). **This IS the calibration
succeeding** — rc=0 with "all 33 stayed stuck" is the must-red case proven false (i.e. proven that a
mis-seeded walk WOULD be caught), not a dead harness. Treat exit 0/0 as PASS for this pair; do not
gate on "control must be nonzero" — that predicate belongs to a different probe family
(`play-exit-probe.mjs`), not this one.

## Baseline: 33 rows (11 routes x 3 viewports)

```
OK 33 route/viewport row(s) left the fresh screen; 123 distinct play screen(s) measured across 11
route(s) x 3 viewport(s). 13 row(s) asserted to fit within 8px and 20 row(s) held as recorded
exceptions in KNOWN_OVERFLOW — every produced row is in exactly one of the two sets.
  cannon-flag        320x568   scrolls no      0px  clipped     2px  width-fill   100%
  cannon-flag        390x844   scrolls no      0px  clipped     2px  width-fill   100%
  cannon-flag        1440x900  scrolls no      0px  clipped     2px  width-fill  62.6%
  cursed-number      320x568   scrolls YES   689px  clipped     0px  width-fill  75.6%
  cursed-number      390x844   scrolls YES   317px  clipped     0px  width-fill  77.9%
  cursed-number      1440x900  scrolls YES   157px  clipped     0px  width-fill  31.5%
  dice-loser         320x568   scrolls no      0px  clipped     0px  width-fill    95%  [pinned fits]
  dice-loser         390x844   scrolls no      0px  clipped     0px  width-fill  95.9% [pinned fits]
  dice-loser         1440x900  scrolls no      0px  clipped     0px  width-fill  64.6% [pinned fits]
  freeze-tap         320x568   scrolls YES   187px  clipped     0px  width-fill   100%
  freeze-tap         390x844   scrolls no      0px  clipped     0px  width-fill   100% [pinned fits]
  freeze-tap         1440x900  scrolls no      0px  clipped     0px  width-fill   100% [pinned fits]
  how-close-is-near  320x568   scrolls YES   194px  clipped     0px  width-fill  89.1%
  how-close-is-near  390x844   scrolls no      0px  clipped     0px  width-fill    81%  [pinned fits]
  how-close-is-near  1440x900  scrolls no      0px  clipped     0px  width-fill  28.2% [pinned fits]
  pinocchio-luck     320x568   scrolls YES   107px  clipped     4px  width-fill  95.6%
  pinocchio-luck     390x844   scrolls YES    14px  clipped     4px  width-fill  96.4%
  pinocchio-luck     1440x900  scrolls no      0px  clipped     4px  width-fill  54.2%
  power-meter        320x568   scrolls YES    81px  clipped    76px  width-fill   100%
  power-meter        390x844   scrolls no      0px  clipped    76px  width-fill   100%
  power-meter        1440x900  scrolls no      0px  clipped    76px  width-fill   100%
  short-stick        320x568   scrolls YES   156px  clipped     0px  width-fill  89.6%
  short-stick        390x844   scrolls YES    73px  clipped     0px  width-fill  90.8%
  short-stick        1440x900  scrolls YES    81px  clipped     0px  width-fill  50.8%
  timebomb           320x568   scrolls YES   119px  clipped     0px  width-fill  90.3%
  timebomb           390x844   scrolls no      0px  clipped     0px  width-fill  91.8% [pinned fits]
  timebomb           1440x900  scrolls no      0px  clipped     0px  width-fill  29.2% [pinned fits]
  wire-snip-panic    320x568   scrolls YES   111px  clipped     0px  width-fill   100%
  wire-snip-panic    390x844   scrolls no      0px  clipped     0px  width-fill   100% [pinned fits]
  wire-snip-panic    1440x900  scrolls no      0px  clipped     0px  width-fill  36.2% [pinned fits]
  zero-trigger       320x568   scrolls YES    96px  clipped     0px  width-fill    87%
  zero-trigger       390x844   scrolls no      0px  clipped     0px  width-fill  80.3% [pinned fits]
  zero-trigger       1440x900  scrolls no      0px  clipped     0px  width-fill  30.2% [pinned fits]
```
(Rows above with no `[pinned fits]` tag and not `dice-loser` are the 20 `KNOWN_OVERFLOW` rows;
`overflowPx` per row = `max(scrolls px, clipped px)`, the field the script itself gates on.)

## Drift vs `KNOWN_OVERFLOW` (`scripts/play-screen-fit-probe.mjs:178-203`), tolerance 8px

Computed as `measured overflowPx - recordedPx(reason)` via the script's own exported
`recordedPx()`, for all 20 pinned rows. All matched exactly (diff 0) except:

| Row | measured | recorded | diff | note |
|---|---|---|---|---|
| `pinocchio-luck 320x568` | 107px | 136px | -29 | inside the documented 107-136px band (15-run history, same file); NOT new drift |
| `pinocchio-luck 1440x900` | 4px | 17px | **-13** | **drift >8px, not pre-documented as a band** |
| `short-stick 320x568` | 156px | 191px | **-35** | **drift >8px, not pre-documented as a band** |
| `power-meter 320x568` | 81px | 76px | +5 | under tolerance |

No `::error::`/`::warning::` lines fired on the clean leg either (script's own growth/fixed checks
use `overflowPx > recorded+8` and `overflowPx <= 1px`; neither of the two flagged rows crossed
those thresholds, so the script stayed silent — the >8px call-out above is this task's own check,
not the script's).

## Not measured / caveats

- No src file touched; `dist/` built once from `aae8a5f`, both legs against it.
- Teardown: `serve` (pid 14086) and headless Chrome (pid 14150) killed after both legs; ports
  5063/9231 confirmed free again.
