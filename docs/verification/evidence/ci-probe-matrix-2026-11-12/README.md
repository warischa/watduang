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

## Shadow result on GitHub (SHA e5677fb, `ci/probe-matrix`, n=1)

Files: `calibration-compare-output.txt` and `calibration-timings.txt`.

- **Rows:**
  - 32/32 leg verdicts are the same, and the play-exit and play-exit-guard summaries are the same (0 UNMEASURED both sides).
  - 41 of 42 fit rows are identical. The base has 14 routes, with no prize-draw.
  - The one differing row is cursed-number 390x844: 283px at press 6 packed, 231px at press 3 matrix. The packed arm flips between exactly these two values on its own: earlier packed CI runs read 231 twice and 283 twice. This is run-to-run variance in which screen is worst, not a matrix effect. The row is an owner-ruled exception and never reds on px.
- **Leg seconds:** per leg within ±10s of packed. Running alone on a runner neither sped up nor slowed down any leg, so the legs are timer-bound, not CPU-bound.
- **Wall time:**
  - packed `ci` run: 883s, of which the probe step was 721s;
  - shadow run: 601s (dist 22s, longest lane lane4 at 556s job wall, verdict 17s).
- **Estimate for a switch where the probe lanes run beside the static gates:** about 10–10.5 min per run against 14.7 (inferred). The long poles are lane4 556s, fit2 499s and lane2 462s.
- **Estimate if those are split:** about 6–7 min (inferred). That means more fit shards and lane2/lane4 each in two. It is an instrument change that needs its own shadow run.

## Split shadow and the switch (n=1 each)

- **Split shadow** (SHA de0c7bc, six groups + 5 fit shards): rows MATCH; 434s against the packed run's 918s on the same SHA. File: `calibration-split-timings.txt`.
- **First run of the job graph** (run 43172718544, SHA 862dfb3, ADR-0078): green in 458s. File: `graph-run-timings.txt`.
  - Long pole: `probes (fit0)` 380s; build 89s runs beside the lanes, off the critical path.
  - Tail after the lanes: probe-verdict 18s, deploy 29s (branch: the Azure steps skip, the three-digest check runs).

## Not yet decided

- The switch's own REFUTE pass. It covers the deploy condition, the digest re-check by every `dist/` consumer, and the reuse lookup re-keyed to jobs.
- The first push to main under the graph: deploy's main-only steps and a real main reuse are unproven until then.
