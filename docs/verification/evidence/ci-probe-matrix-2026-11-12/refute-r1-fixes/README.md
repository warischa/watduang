# REFUTE round 1 on the probe-matrix switch: fixes and their proof (2026-11-12)

Round 1 ended FAIL with five spot findings and no path that deploys unmeasured bytes. Each fix and the check that reds without it:

| Finding | Fix | Proof |
|---|---|---|
| An inherited `PROBE_AGGREGATE` / `PROBE_LANES` turns the local probe step green with no packed run | `run-workflow-gates.sh` GUARD 4 refuses all five matrix variables, exit 97 | harness E1–E5: rc 0 unfixed, 97 fixed; E6 (empty value) stays 0 |
| GUARD 3 matched a mention, not an invocation (pre-existing) | anchored at the start of a body line, as GUARD 2 is | harness B, C, D, W2: rc 0 unfixed, 95 fixed; A, W1 and the real `ci.yml` unchanged |
| The `dist` job's Build ran before any install on a fresh checkout | the `dist` install spelled `npm ci --no-audit`, so the runner runs it | harness I: install index 6 > Build 3 unfixed, 2 < 3 fixed |
| A cancel made `probe-verdict` fail, barring the SHA from reuse forever | `probe-verdict` under `!cancelled()` | `probe-scope.mjs` selftest: new case "a cancelled attempt with no red does not block a later green attempt"; mutant counting `cancelled` as red fails exactly it |
| A cancel between a green verdict and deploy start could still deploy | `deploy` under `!cancelled()` | not runnable locally; GitHub's workflow-cancellation reference. Proved only by a cancel on GitHub, which is not owed |

Run: `bash harness.sh <repo-root>`. It builds throwaway git repos holding the candidate runner and a doctored `ci.yml` (`doctor.py`; variants A–C are the reviewer's own), and runs `CLASSIFY_ONLY=1`. Outputs: `harness-output-unfixed-9a33300.txt`, `harness-output-fixed.txt`.

Not covered here: the two `!cancelled()` conditions on GitHub, and the skipped-verdict arm of deploy (`run == 'false'`), which has not run yet under the job graph.
