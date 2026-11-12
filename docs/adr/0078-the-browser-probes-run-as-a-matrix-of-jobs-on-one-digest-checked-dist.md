# ADR-0078 — the browser probes run as a matrix of jobs on one digest-checked dist/

Date: 2026-11-12 · Status: accepted · Owner picks in chat 2026-11-12: "Both, matrix first", then
"Switch + split lanes" (recorded here and in SESSION-HANDOFF; no ticket) ·
Reverses: the `ci.yml` rule "deliberately inside this same job" (gh#122) ·
Narrows: the 2026-09-06 owner ruling "reduce probe concurrency" (scripts/ci-probes.sh, "the barrier") ·
Relates: [ADR-0051](0051-canvas-2d-is-the-default-and-a-play-route-never-blanks-the-page.md), gh#122, gh#270

## Context

Every CI run built `dist/`, ran the static gates and then ran the browser probes in ONE job. On
branch run 43150614193 the probe step was 774s of a ~16-minute run, and on run 43165835621 it was
721s of 883s. The probe step was already parallel inside that job: four packed lanes, then three fit
shards behind a barrier, all sharing one runner's CPU.

Two recorded positions kept it in one job:
- **`ci.yml`:** "a separate job would have to rebuild dist/ or ship it as an artifact, and a probe that
  measures a regenerated dist/ is not measuring the bytes Deploy uploads."
- **The 2026-09-06 ruling:** the twelfth play route pushed lane1's arm windows into UNMEASURED reads
  under CPU contention, so the phases were serialised and FIT_SHARDS held at 3.

## Decision

**The job graph.** Six jobs replace the one:
- `dist` builds dist/ once, decides `run` (the probe-scope step, unchanged in substance), and ships
  dist/ as the artifact `dist-<digest>`.
- `build` runs every static and dist-artifact gate beside it, and outputs the digest of its own build.
- `probes` is a matrix. Each group runs on its own runner (`PROBE_LANES`, `scripts/ci-probes.sh`):
  - the groups exit · overflow · topband · nav · home · firstscreen;
  - fit0..fit4, from `PROBE_FIT_SHARDS=5`.
- `webgl` runs the pixel readback (ADR-0051) on the same artifact.
- `probe-verdict` applies the packed run's run-level checks to every lane's output together
  (`PROBE_AGGREGATE`): no failing leg, every lane reported, the pinned leg count, and every play route
  walked by the fit shards. It then publishes the artifact `dist-digest-<digest>`.
- `deploy` runs only when its own conditions hold (see the bytes rule below).

**The bytes are identified by their digest, never by a name or an attempt.**
- Every consumer of the artifact recomputes the digest and reds on any difference: each lane, webgl
  and deploy.
- Deploy uploads only when three digests are equal: the artifact's, the `dist` job's, and the `build`
  job's own build. Only then do the gates speak for the uploaded bytes, and that is proved per run.
- Deploy counts a skipped verdict only beside an explicit `run=false`. An unset output never deploys.
- `probe-verdict` and `deploy` run under `!cancelled()`, never `always()` (REFUTE 2026-11-12): a cancel
  stops a deploy that has not started, and leaves the verdict skipped rather than failed, so it does
  not bar the SHA from reuse. A lane red still bars it on its own.
- Artifact names carry no run attempt. A partial re-run (run 43165835700, verdict job only, observed
  2026-11-12) keeps the earlier attempt's artifacts and copies the jobs it did not re-run into the new
  attempt. An attempt-bound name would orphan a verdict that was never re-run.

**Every leg sits in exactly one group.** A group takes its legs from the packed lanes by label. A leg
in no group, or in two, moves the count that the verdict's pinned `EXPECTED_LEGS` and its
duplicate-label check red on. The play-top-band pair shares one browser in the `topband` group.

**The packed run stays the local run.** On a laptop `scripts/run-workflow-gates.sh` runs the probe
step with none of the matrix environment, which is the packed run of every lane, with its barrier;
its GUARD 4 (exit 97) refuses a matrix variable inherited from the calling shell. Its GUARD 3 aborts
(exit 95) when no runnable step invokes the packed probe run or the WebGL lane at the start of a body
line, so a `${{ matrix.* }}` written into a probe step's body cannot drop the local probes silently. Its
expensive class and NOT OWED now also key on the job output `needs.dist.outputs.run == 'true'`.

**Main's reuse lookup reads the layout from `ci.yml` at the SHA** (`probe-scope.mjs --verified`).
A `probe-verdict` job means the job rules:
- the candidate's latest attempt has `probe-verdict`, `webgl` and every `probes (…)` job green, and a
  live `dist-digest-<digest>`;
- no probe job is red in any attempt of any run at that SHA.

Otherwise the one-job step rules apply unchanged.

## Consequences

- **Measured on the same SHA** (`docs/verification/evidence/ci-probe-matrix-2026-11-12/`): lanes
  alone on runners read the packed run's 32/32 verdicts and its play-exit summaries, and 41 of 42 fit
  rows exactly. The 42nd row flips between the same two values across packed runs too. Every leg's
  seconds came within 10s of packed, so the legs are timer-bound and the barrier buys a matrix
  nothing.
- **Wall time:** 883s packed against 601s for the 7-lane shadow. The split layout's wall time is
  recorded in that evidence directory when measured.
- **The 2026-09-06 ruling now binds the packed run only.** No runner in the matrix shares its CPU.
  Raising FIT_SHARDS for the packed run is still an instrument change.
- **Each lane job repeats its setup** (checkout, `npm ci`, the Thai face), about 40–50s per job.
- **Unproven until the first push to main under this graph:** that the deploy job's main-only steps
  run green.
  - Its OIDC login is pinned to the main ref subject, so no branch run can exercise it.
  - A branch run does prove the deploy job's artifact download and its three-digest check.

## Flip facts

- **A lane's fit rows or arm-window reads diverge from the packed run** beyond known flips → the
  timer-bound premise is wrong; split lanes back up or restore the barrier.
- **A deterministic build stops being deterministic** (deploy's three digests disagree) → the gates
  no longer speak for the uploaded bytes; fold the gates back into the dist job.
