# REFUTE round 1 on the probe-matrix switch: fixes and their proof (2026-11-12)

Round 1 ended FAIL with five spot findings and no path that deploys unmeasured bytes. Each fix and the check that reds without it:

| Finding | Fix | Proof |
|---|---|---|
| An inherited `PROBE_AGGREGATE` / `PROBE_LANES` turns the local probe step green with no packed run | `run-workflow-gates.sh` GUARD 4 refuses all five matrix variables, exit 97 | harness E1–E5: rc 0 unfixed, 97 fixed; E6 (empty value) stays 0 |
| GUARD 3 matched a mention, not an invocation (pre-existing) | anchored at the start of a body line, as GUARD 2 is | harness B, C, D, W2: rc 0 unfixed, 95 fixed; A, W1 and the real `ci.yml` unchanged |
| The `dist` job's Build ran before any install on a fresh checkout | the `dist` install spelled `npm ci --no-audit`, so the runner runs it | harness I: install index 6 > Build 3 unfixed, 2 < 3 fixed |
| A cancel made `probe-verdict` fail, barring the SHA from reuse forever | `probe-verdict` under `!cancelled()` | `probe-scope.mjs` selftest: new case "a cancelled attempt with no red does not block a later green attempt"; mutant counting `cancelled` as red fails exactly it |
| A cancel between a green verdict and deploy start could still deploy | `deploy` under `!cancelled()` | not runnable locally; GitHub's workflow-cancellation reference. Proved only by a cancel on GitHub, which is not owed |

## Round 2 (the last round): FAIL, four LOW findings, fixed directly and not reviewed again

| Finding | Fix | Proof |
|---|---|---|
| GUARD 3 still took a line shell never reaches: heredoc, `if false`, an echo continuation, `\|\| true` (pre-existing) | the lane counts only as a step's whole body | harness H1–H4: rc 0 on 99db111, 95 fixed; X (`ci-probes-x`) 95 both |
| An inherited `PROBE_BASE` sends both canvas-ink legs to another server; `PROBE_WIDTH` moves the floor legs off 320px (pre-existing) | `ci-probes.sh` unsets both at the top | see the group runs below |
| The `dist` install comment said every later job skips its install; the `build` job's runs again | comment corrected (cost: two installs locally, about 4s) | read |
| The `--verified` header said "latest attempt" for the job layout's attempt-free digest | header corrected | read |

Group runs on the unfixed 99db111 (`group-runs-unfixed-99db111.txt`, lane mode, one at a time):
- `nav` with `PROBE_BASE=http://127.0.0.1:9`: canvas-ink and canvas-ink-control FAIL, because the player screen never opened. The legs went to that address; against a live server there they would have measured it with no red.
- `home` with `PROBE_WIDTH=1000`: all 7 legs PASS, and the control-floor and live-region-floor logs say `at 1000px`. This is the silent case.
- Fixed: the full local suite at the fix commit runs with both values exported (result in the session handoff).

Run: `bash harness.sh <repo-root>`. It builds throwaway git repos holding the candidate runner and a doctored `ci.yml` (`doctor.py`; variants A–C are the reviewer's own), and runs `CLASSIFY_ONLY=1`. Outputs: `harness-output-unfixed-9a33300.txt` (round 1 cases), `harness-output-unfixed-99db111.txt` (round 2 cases), `harness-output-fixed.txt`.

Not covered here: the two `!cancelled()` conditions on GitHub, and the skipped-verdict arm of deploy (`run == 'false'`), which has not run yet under the job graph.
