# gh#253 evidence: the solo landings reserve their first screen until mount

Date 2026-10-04, base commit `def4563` (Mitr self-hosted), this machine (macOS, Chrome headless). Every browser
run: `npm run build` in the worktree, `npx serve <dist> -l 4361`, Chrome `--remote-debugging-port=9361` with a fresh
temp `--user-data-dir`, one Chrome per run, started and torn down by `run.mjs` here. Before = the unchanged build
copied aside; after = the fixed build copied aside; mutant = see below. Decision record: ADR-0070.

## Mechanism

Each solo game module declares `firstScreenReserve: { phone, wide }`; `GameLayout` writes it onto `#stage` as
`--stage-reserve-phone` / `--stage-reserve-wide` (an attribute, the stage stays empty); `#stage:not([data-stage])`
takes that `min-block-size` (phone below 640px, wide from 640px); the page script sets `data-stage="mounted"` right
after `mount()` returns and `data-stage="failed"` on every failed import or mount.

## Reserve values: how they were read

`stage-heights-probe.mjs`, the mounted `#stage` height on the unchanged build, every row with `document.fonts.status`
`loaded`, widths 320 360 375 390 414 480 560 639 640 700 768 900 1024 1280 1440 (`stage-heights-before.json`, n=1,
deterministic layout):

| game | 320 | 360-414 | 480-560 | 639-1440 | chosen phone / wide |
|---|---|---|---|---|---|
| siamsi | 597 | 576 | 534 | 534 | 576 / 534 |
| daily-fortune | 530.3 | 530.3 | 530.3 | 530.3 | 530 / 530 |
| love-match | 569.2 | 569.2 | 569.2 | 517.2 | 569 / 517 |

From 640 up every game is constant, so `wide` is exact. Below 640 the height changes inside the class where the
Thai copy wraps; `phone` is the 360-414 value. No media query in the game CSS produces these steps: they are
wrapping. Heights are never asserted, only the outcome below.

## CLS before / after (`cls-matrix.mjs`; JSON: `cls-before.json`, `cls-before-phone.json`, `cls-after.json`)

- **fast** = the ticket's instrument, `ui-audit-probe.mjs` (`W=<w>`, `PAGES=` the three), n=3 per cell. Viewport
  height is the probe's own: 640 below 640px wide, 900 above.
- **slow-4G** = `docs/verification/evidence/gh252/swap-probe.mjs THROTTLE=1 FONTS=normal` (the gh#252 method:
  150 ms, 1.6 Mbit/s, every request, cache disabled), n=2 per cell.
- **phone slow-4G** = `throttled-cls-probe.mjs`, the same profile at a real phone height, n=2 per cell. Needed
  because at a 640px-tall viewport everything below `#stage` is below the fold before and after mount, so the
  probes above cannot judge the phone value. At 390x844 and 360x780 the how-to section is inside the first screen.

Each cell lists every run. The fast 390x844 cells come from `stage-reserve-probe.mjs` (n=1, `stage-reserve-before.json` /
`stage-reserve-after.json`); the audit probe cannot set that height. "-" = not measured.

| page | width | fast before | fast after | slow-4G before | slow-4G after |
|---|---|---|---|---|---|
| siamsi | 320 | 0 / 0 / 0 | 0 / 0 / 0 | 0.6384 / 0.6384 | 0 / 0 |
| siamsi | 414 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 | 0 / 0 |
| siamsi | 768 | 0.452 x3 | 0 x3 | 0.4528 / 0.4528 | 0 / 0 |
| siamsi | 1440 | 0.2825 / 0 / 0.2825 | 0 x3 | 0.2838 / 0.2838 | 0 / 0 |
| siamsi | 390x844 | 0 (probe) | 0 (probe) | 0.5159 / 0.5159 | 0 / 0 |
| siamsi | 360x780 | - | - | 0 / 0.5463 | 0 / 0 |
| daily-fortune | 320 | 0 x3 | 0 x3 | 0.0008 / 0.0008 | 0.0008 / 0.0008 |
| daily-fortune | 414 | 0 x3 | 0 x3 | 0.0007 / 0.0007 | 0.0007 / 0.0007 |
| daily-fortune | 768 | 0.4492 x3 | 0.0003 x3 | 0.4497 / 0.4497 | 0.0003 / 0.0003 |
| daily-fortune | 1440 | 0.2807 / 0.2807 / 0.281 | 0.0002 x3 | 0.2814 / 0.2814 | 0.0002 / 0.0002 |
| daily-fortune | 390x844 | 0 (probe) | 0 (probe) | 0.0005 / 0.0005 | 0.0005 / 0.0005 |
| daily-fortune | 360x780 | - | - | 0.0006 / 0.0006 | 0.0006 / 0.0006 |
| love-match | 320 | 0 x3 | 0 x3 | 0.0052 / 0.0052 | 0.0052 / 0.0052 |
| love-match | 414 | 0 x3 | 0 x3 | 0.0050 / 0.0050 | 0.0050 / 0.0050 |
| love-match | 768 | 0.4504 x3 | 0.0073 x3 | 0.4506 / 0.4506 | 0.0066 / 0.0066 |
| love-match | 1440 | 0.2814 / 0.2817 / 0.2814 | 0.0045 / 0.0043 / 0.0043 | 0.2820 / 0.2820 | 0.0041 / 0.0041 |
| love-match | 390x844 | 0 (probe) | 0 (probe) | 0.0049 / 0.0049 | 0.0049 / 0.0049 |
| love-match | 360x780 | - | - | 0.0049 / 0.0049 | 0.0049 / 0.0049 |

Reading it:
- The ticket's box: siamsi under 0.1 at 320 and 1440 on the ticket's instrument, after: 0 at both, all runs.
  daily-fortune and love-match measured the same way and recorded above.
- Worst residual anywhere after: 0.0073 (love-match, 768, fast). Every cell is under the 0.05 tolerance.
- The intermediate width is 768 (how-to inside the first screen, worst before-value of all: 0.45). The width where
  the copy wraps differently is below 640 (siamsi 576 vs 534), and at the audit's 640px height it is below the fold
  before and after; it is judged at 390x844 / 360x780 instead, under slow-4G, where siamsi went 0.52 / 0.55 to 0.
- The siamsi 1440 fast "0" in one before-run and the 360x780 "0" in one before-run are mounts that beat first
  paint in that run; the other runs of the same cell show the shift. That is why n>1.
- daily-fortune and love-match below 640px were already near 0 throttled before the fix: their mount lands before
  the first paint there (the residuals are unchanged by the fix, so they are not the reserve's).

## Regression probe: `scripts/stage-reserve-probe.mjs`

    node docs/verification/evidence/gh253/run.mjs <dist> scripts/driver.mjs scripts/stage-reserve-probe.mjs

Set from the manifest (games with no `playRoute`); viewports 1440x900, 768x900, 390x844; asserts CLS <= 0.05,
`data-stage="mounted"`, computed `min-block-size` after mount `auto` or `0px`, the two properties declared; then a
failure leg (siamsi's chunk aborted through `session.failRequests`): `data-stage="failed"`, `min-block-size` released.
Verdict is the `pass` field (driver.mjs exits 0 regardless).

| build | pass | what red | file |
|---|---|---|---|
| after | true, 0 failures | - | `stage-reserve-after.json` |
| before (unfixed) | false, 25 failures | e.g. `siamsi 1440x900: CLS 0.2825 > 0.05`, `data-stage is null, expected mounted` | `stage-reserve-before.json` |
| mutant: `settleStage` body made a no-op | false, 20 failures | `siamsi 1440x900: min-block-size after mount is 534px, expected auto or 0px`; fail leg `534px` | `stage-reserve-mutant-no-release.json` |

The mutant's CLS rows stay green (a reserve that is never released does not shift anything on first load), which is
why the release check exists beside the CLS check. The mutant was built from a `cp` of the page source, and the
source was restored from that copy (sha1 `981e32fa...` before and after).

Failure leg after the fix: the chunk aborted (1 request), stage `failed`, `min-block-size` `auto`, CLS 0.28 (the
below-stage content moves up once when the reserve goes: chosen over an empty hole, ADR-0070).

Cost: 18 s wall locally for the whole probe including Chrome start (one Chrome, nine page loads plus the failure
leg). Not wired into `scripts/ci-probes.sh`; ADR-0070 gives the reasoning and the fact that would change it.

## Fast lane

`SMOKE_PORT=4361 SKIP_EXPENSIVE=1 bash scripts/run-workflow-gates.sh` on the final tree (this README included):
`declared=48 executed=44 failed=0 not-executed=2 not-runnable-here=2`, exit 2 by design. The two not-executed
steps are the browser-probe lane (gh#122) and the WebGL pixel readback (ADR-0051), both skipped by `SKIP_EXPENSIVE=1`;
the two not-runnable-here steps are the CI-expression step and the SWA token fetch.

## Files here

`run.mjs` (serve + fresh Chrome + teardown), `cls-matrix.mjs` (the before/after matrix), `stage-heights-probe.mjs`,
`throttled-cls-probe.mjs`, `cls-*.json` and `cls-*.txt` (raw and per-cell lists), `stage-heights-before.json`,
`stage-reserve-*.json`.

## Addendum: gh#251 phone body text moves two reserves (base `64d4483`)

The owner's gh#251 ruling put `p.df-joke`, `p.df-foot` and `p.lm-note` at 16px below 640px (evidence:
`docs/verification/evidence/gh251/README.md`, addendum). Re-measured with `stage-heights-probe.mjs`, Mitr `loaded`
on every row: `stage-heights-base-64d4483.json` (before, identical to the def4563 sweep) and
`stage-heights-gh251-font.json` (after):

| game | phone before | phone after | wide | reserve phone / wide, old -> new |
|---|---|---|---|---|
| siamsi | 597 / 576 / 534 | unchanged | 534 | 576 / 534, unchanged |
| daily-fortune | 530.3 | 538.5 at 320-639 | 530.3 | 530 / 530 -> 539 / 530 |
| love-match | 569.2 to 560, 517.2 from 600 | 578.8 to 560, 526.8 at 600-639 | 517.2 | 569 / 517 -> 579 / 517 |

After the change, on the font+reserve build:
- `stage-reserve-probe.mjs`: pass, 0 failures (`stage-reserve-after-gh251.json`); worst 0.0073 (love-match 768).
- slow-4G (`cls-after-gh251.json`, `.txt`, n=2): worst 0.0066 (love-match 768); phone heights 390x844 and 360x780
  all <= 0.005. Ceiling: daily-fortune and love-match below 640 were already near 0 throttled before any reserve
  (their mount beats first paint there), so these runs do not discriminate those two phone values. The heights do.

New-landing guard: `scripts/validate-games.mjs` requires `firstScreenReserve` (phone and wide, positive finite
numbers) on every game with no `playRoute`. Selftest: 3 known-bad cases (missing, wide missing, phone 0) plus a
known-good playRoute game with no reserve. Must-red: siamsi's field deleted on a scratch copy -> exit 1 with
`src/games/siamsi.ts: firstScreenReserve is required on a game with no playRoute`; the rule disabled -> the
selftest exits 1 at `firstScreenReserve (missing, no playRoute): known-bad fixture must report at least one
violation`. Both files were restored from `cp` copies, and the hashes matched.
