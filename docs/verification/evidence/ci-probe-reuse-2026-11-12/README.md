# CI probe reuse and local probe scope — 2026-11-12

Owner pick (chat, 2026-11-12): items 1 and 4 of the CI-time proposal. Branch `ci/probe-reuse`.

- **Item 1 (CI):** main skips the probe-gated steps only when another push run at the same SHA passed them on the same `dist/` digest, and no run at that SHA is red or still running. The rule lives in `scripts/probe-scope.mjs --verified`.
- **Item 4 (local):** `scripts/run-workflow-gates.sh` marks those steps NOT OWED only when every path that differs from merge-base(HEAD, origin/main), in HEAD, the index or the working tree, is inert.

## Measured before the change

Read with `gh api` on 2026-11-12:

- **Run length:** the last 15 CI runs took 15–17 min each.
- **Probe step:** 754s on main run 42378263557 and 786s on branch run 42376969725. That is the same SHA, 478288a.
- **Same SHA tested twice:** 5 of those 15 runs are branch+main pairs at one SHA.
- **Inside the probe step:** phase one 265s; phase two 478s from release until every lane joined. Phase two is play-screen-fit, 14 routes on 3 shards.
- **Backtest:** none of the 5 paired batches touched only one game's files.

## Files

| File | What it shows |
|---|---|
| `selftest.txt` | `--selftest` green: inert-path cases, reuse cases (including REFUTE r1/r2 shapes) and gate-spelling cases |
| `replay.mjs`, `replay-output.txt` | the reuse decision on real runs: the 478288a pair, run 33491962091 (attempt 1 red), a lone run |
| `wiring.sh`, `fake-gh-green/`, `fake-gh-fails/`, `wiring-output.txt` | ci.yml's probe-scope step body, extracted from the workflow and run under `bash -e` in 10 cases |
| `local-legs.sh`, `local-legs-output.txt` | the runner's answer in 7 tree states, plus the round-1 and round-2 runners failing where REFUTE said |
| `e2e-docs-only-output.txt` | full local suite on origin/main + one docs edit: exit 0, 50 pass, 2 NOT OWED, 62s wall |

## Digest reproducibility

Two builds of one tree on this Mac gave the same digest: 204 files, cold and warm cache. Changing one byte changed it.

## Review

- **REFUTE round 1:** FAIL. Four spot-fixes, fixed in f1154f0 (branch `ci/probe-reuse`: 67674d9).
- **REFUTE round 2 (last):** FAIL. The round-1 findings were all CLOSED; four new spot-fixes were found and fixed in a1b5f40 (branch `ci/probe-reuse`: d691121).
- **Unreviewed:** the round-2 fixes had no third round. The largest of them are the rewritten `gatedSteps` parser and the job-level red rule.

## Real CI (2026-11-12, branch rebased onto origin/main 478288a, SHA 9d81e2c)

Details in `real-ci-output.txt`.

- **Run 43150614193 (`ci/probe-reuse`, attempt 1):** green. The full probe lane passed (774s); `dist-digest-36f7…-a1` was published. Its report-only lookup ran with the workflow token and read this run's own in-flight job: "no other run at this SHA".
- **Run 43152430948 (`ci/probe-reuse-check`, same SHA, a second runner):** the same digest. Its lookup said `run=false`, naming run 43150614193, so a main push of this SHA would have skipped the probes. Cancelled after that step on purpose; a cancelled run is not a red.
- **Re-run of 43150614193 (attempt 2):** green. `-a2` was published. Afterwards `-a1` was listed neither on the run nor on the repo.
- **Digest across machines:** the runner's digest equals this Mac's digest of the 568ba85 tree. The two dist/ trees match because gh#300's modules reach no page; that equality is inferred, not compared file by file.

## Not proven

- A real main push taking the skip. The branch lookup runs the same function, but the main path's `emit` has only run in the local harness.
