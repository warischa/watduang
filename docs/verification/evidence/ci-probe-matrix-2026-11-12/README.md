# Probe matrix — shadow calibration (2026-11-12)

Owner pick in chat, 2026-11-12: "Both, matrix first". The probe matrix comes first; per-game narrowing follows.
This directory holds the shadow step only. Nothing here gates a deploy.

## What the shadow adds

- **Lane mode in `scripts/ci-probes.sh`:** `PROBE_LANES=<lane1..lane4|fitK>` runs one lane on its own runner, with only that lane's browsers and no barrier.
- **Aggregate mode in `scripts/ci-probes.sh`:** `PROBE_AGGREGATE="<dir> ..."` applies the packed run's verdict to every lane's output together. That is three conditions, plus a new check that every lane reported.
- **The shadow workflow:** `.github/workflows/probe-matrix-shadow.yml` runs on `ci/*` branch pushes only. Its dist job builds `dist/` and digests it. One lane job per lane downloads that `dist/`, re-checks the digest and runs the lane. A verdict job runs aggregate mode.
- **The packed arm:** `ci.yml` uploads its packed probe output on a green run, on `ci/*` branches only.

## Measured before the shadow ran (run 43150614193, packed, one runner)

- **Probe start:** probes begin 145s into the job.
- **Lane lengths (seconds):**

  | lane1 | lane2 | lane3 | lane4 | fit0 | fit1 | fit2 |
  |---|---|---|---|---|---|---|
  | 241 | 446 | 264 | 505 | 342 | 347 | 500 |

- **Wall-time estimate:** a plain 7-lane matrix is bounded by its longest lane, about 11–12 min for the whole run (inferred). Getting to 6–8 min needs three more changes, two of which change the instrument:
  - more fit shards
  - splitting lane2 and lane4
  - starting the probes right after Build

## Local proofs (this Mac)

- **Aggregate mode, on a real green packed run's lane outputs split one lane per directory:**
  - all 7 lanes give exit 0, with "32 leg(s) passed" and all 15 routes walked;
  - a missing lane, a lane given twice, a failing leg and a dropped fit shard each red with their own message.
- **Lane mode:** `PROBE_LANES=lane3` green, 7 legs, 258s wall. With a 2s leg timeout it reds (exit 1). `fit3` with 3 shards, and setting both modes at once, are both refused.
- **`compare.mjs`:**
  - Packed against its own lanes split gives MATCH: 32 verdicts, 45 fit rows, 2 exit summaries.
  - One fit row's clipped px changed 0 to 7 reds; one UNMEASURED count changed 0 to 2 reds.

## To read a shadow run

1. Download `packed-probe-output-a<N>` from the `ci.yml` run, and every `shadow-lane-*-a<N>` from the shadow run on the same SHA.
2. Run `node compare.mjs <packed-dir> <lanes-root>`.
3. Read wall time from the jobs API, compared with the packed step.

## Not yet decided

- Whether the gate moves to the matrix. That waits on a MATCH, or on differences that are explained.
- The switch's own REFUTE pass. It covers the deploy condition, the digest re-check by every `dist/` consumer, and the reuse lookup re-keyed to jobs.
