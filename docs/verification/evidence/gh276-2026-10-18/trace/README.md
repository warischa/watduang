# gh#276: what holds the first roster lock on the stand-in (2026-10-18)

**Verdict.** In both traced runs that were slow (lock wait ≥ 2 s), the renderer main thread was not what
held the lock. The **browser process's main thread** was. The lock request is a `blink.mojom.LockManager` mojo message, and
in both runs it was received on `CrBrowserMain` no more than 0.6 ms before the grant. Until then, that thread sat inside one long,
near-zero-CPU task, posted from `web_app_command_manager.cc:OnCommandComplete` or `native_widget_ns_window_bridge.mm:CloseWindow`.

**Section 5 (later the same day) sharpens this.** Inside that task, whichever site posted it, the browser main thread makes one
**synchronous** `FrameSinkManager::DestroyCompositorFrameSink` call to the GPU process. That call lasts about as long as the whole
task, and it does so in every one of the 13 traces checked. Meanwhile the GPU process is busy with `GPUTask` command-buffer flushes on swiftshader.

Without throttling, and untraced, the wait vanishes: 30–36 ms, n=3. With a reused profile it mostly drops under 1 s.
So this term belongs to the stand-in, not to page code. Moving page script evaluation earlier or later cannot touch it.

Build: tree `552c6d4`, whose `src/` is byte-equal to the deployed `5d852e5`. Built with `npm run build`. Chrome 155.0.8059.82, node v22.22.1.

## Stand-in and flags (all runs)

The stand-in is the one used by the gh#272 latency harness. Chrome runs under `taskpolicy -b` with `--headless=new --use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader --no-sandbox --no-first-run --no-default-browser-check`. Each sample gets a fresh `--user-data-dir`
and a fresh Chrome. BURN=2 `taskpolicy -b` busy loops run alongside. Viewport is 1440x900, mobile emulation. P1 seed: `ZERO_TRIGGER_DATA_V1` with
4 names and an empty roster, seeded on the home page. HTTP runs on 4421 and CDP on 9421, with one Chrome at a time. Every pid is killed by pid. Port checks
use `lsof -nP -ti tcp:<a>,<b>`. Machine load came from other agents' builds and edits, recorded per sample with `uptime`.

## 1. Phase 1 gate (n=1 per driver): did not reproduce

Lean `trace.mjs` plain: 288 ms, load 5.33 → 6.20. Harness `latency.mjs`: 1591 ms, load 5.31 → 9.44.
Files: `diag-repro.json`, `harness-repro-harness.json`, `load-repro*.txt`.

## 2. Matched-load interleave H,L × 8 (`interleave.sh`, `aggregate.mjs` → `hl-summary.json`, `load-hl.tsv`)

H = the gh#272 harness P1 (`latency-lt.mjs` = `latency.mjs` + its in-page long-task list written out, node side only).
L = lean `trace.mjs` plain. 0 VOID. Load-1 before each sample: median 8.79 (H), 8.73 (L), range 7.3 to 13.7.

| arm, n=8 | lock wait median (min to max) | ≥ 2 s | nav → lock request median | long tasks inside the wait, median (max) | nav → start pressable median (min to max) | ≤ 1 s |
|---|---|---|---|---|---|---|
| H | 4843 ms (1038 to 8646) | 7/8 | 1025 ms | 292 ms (1652) | 8592 ms (5761 to 18000) | 0/8 |
| L | 4329 ms (1467 to 11122) | 6/8 | 218 ms | 172 ms (521) | 9573 ms (2098 to 13912) | 0/8 |

Paired H minus L, n=8: median −900 ms, range −7201 to +4173, with H slower in 4 of 8 pairs. **The harness does not
inflate the wait** at this n. The two arms overlap across their whole spread. Long tasks fill a median of about 4–6 % of the wait in both arms.

## 3. Instrument check (`isolate.sh`, 3 arms × 3 rotated; per-sample `diag-iso-*.json`, `load-iso-*.txt`)

The first six traced runs (t1–t6, wait 265–591 ms) were all fast, so tracing or the `navigator.locks.query()` snapshot looked suspect.
Rotating the arms at load 8.5–11.3 gave these waits:

- plain: 252, 4045, 428 ms
- plain with `query()`: 3143, 4293, 4423 ms
- traced: 1018, 1255, 3851 ms

Neither instrument removes the slow mode, and tracing can still go slow (iso-T-3), so the traces below measure the same mode.
With 3 samples per arm, this rules out a cure, not a shift.

In-page `query()` snapshots, taken at the request and at the grant:

- At the request, nothing was held or pending on `watduang:roster`.
- At the grant, this page's own request was the only holder.
- The snapshot answer arrived when the grant did.

So the wait is not lock contention. It is the round trip itself (`diag-t1.json`).

## 4. Traces (`trace.mjs` MODE=trace, `analyze.mjs` → `trace-<tag>.summary.json`, `rollup.mjs` → `rollup.json`)

Categories: devtools.timeline (+disabled-by-default), v8, v8.execute, v8 cpu_profiler, v8.gc, blink.user_timing, loading,
toplevel, mojom, ipc. The trace is started on the browser target, so it covers every process. The window runs from the `gh276:lock-req` mark to the
`gh276:lock-grant` mark, and both are emitted by the page's own `navigator.locks.request` wrapper. Raw traces (25–62 MB) stay outside the repo.

Slow runs (both ≥ 2 s):

| run | wait | load-1 | renderer main | browser main (`CrBrowserMain`) | LockManager msg received on browser main |
|---|---|---|---|---|---|
| iso-T-3 | 3853 ms | 9.05 → 10.02 | busy 0.6 %, profiler `(idle)` 3787 ms | busy 99.1 %: `OnCommandComplete` 3669 ms wall / 5.8 ms CPU (95.2 %) | +3852.6 ms |
| t8 | 2795 ms | 43.4 → 45.7 | busy 30.4 % (Layout/PrePaint 758 ms) | busy 99.5 %: `CloseWindow` 2251 ms / 3.2 ms CPU (80.5 %) + `OnCommandComplete` 436 ms / 4.2 ms CPU (15.6 %) | +2795.1 ms |

**Attribution.** The named browser main thread tasks cover 95.2 % of the window in iso-T-3 and 96.1 % in t8.

**GPU main thread.** In the same windows, `CrGpuMain` is busy 100 % at under 1 % CPU (`scheduler.cc:RunNextTask`).

**Fast traced runs (n=9, 265–1255 ms).** They show the same shape, only shorter. The browser main thread is held mostly by one `CloseWindow` task, and the LockManager message lands just before the grant. In the shortest runs, the renderer's own Layout/PrePaint after `load` takes most of the remainder.

**Positive control.** In-page long tasks inside the window agree with trace tasks of 50 ms or more in 8 of 11 traces, to within 2.3 ms.
They disagree in t1 (232 vs 444 ms), t3 (0 vs 388 ms) and iso-T-1 (315 vs 474 ms). Both slow traces agree: 0 vs 0, and 825 vs 826.

**Where the request sits.** The 568 KB play chunk is compiled and evaluated first, then `DOMContentLoaded` dispatches, then
`mountPlayerScreen` runs `migrate` → `withLock` → `navigator.locks.request`. The request is issued inside the `DOMContentLoaded`
dispatch, 5–75 ms after it starts, and before `load`. Module evaluation is over by then.

## Verdict

- **Confirmed (2 of 2 slow traces):**
  - The renderer main thread is not the occupant. The request waits in the browser process's main-thread queue.
  - That queue is held by a browser task whose CPU time is about 0.15 % of its wall time.
  - Fix family (i) would defer the route's evaluation until after the grant, and (ii) would issue the request earlier. The request already goes out after evaluation and the renderer then idles, so neither has anything left to move.
- **Superseded by section 5.** This bullet first inferred that the occupant was fresh-profile first-run work. Section 5 shows two things:
  - The low-CPU task is **blocked**, not descheduled. It sits on a synchronous `DestroyCompositorFrameSink` call to the GPU process.
  - The same task is there with a warm profile.

  The family (iii) label stands. Its mechanism is in section 5.
- **Budget (the ≤ 1 s ruling: navigation to an interactive player screen, with a genuine legacy migration seeded):** not met on this
  stand-in at load-1 7–14. Nav → pressable: L 0/8 ≤ 1 s (median 9573 ms), H 0/8 (median 8592 ms). Across the 17 traced and isolate runs, 1 was ≤ 1 s (t6, 855 ms, load 10.8).

## 5. Fresh vs reused profile, and the unthrottled control (`warm.sh`, `warm-summary.mjs`, `chain.mjs`)

**Arms.**

- F is a fresh profile, as in every run above.
- R reuses the profile. It runs one full warm-up P1 in the same Chrome and profile (its own tab: seed on home, open the route, close
  the tab), waits 2 s, then runs the measured P1 in a **new tab**.

  A new tab is the cleaner control. It repeats the fresh arm's exact flow (new target, seed on home, navigate to the route), so
  the only thing that changes is how warm the browser and profile are. A reload would skip opening the target and the home → route
  navigation. That navigation is where the traced window close happens. A reload would also re-measure a document whose instruments
  are already live.
- U has no `taskpolicy` and no burners. Same flags otherwise, fresh profile.

Each sample's load is in `load-<w|p>-*.txt`. For R samples that file is read after the warm-up.

**Untraced rotation P=p** (`warm-summary-p.json`). F,R × 6 pairs, then U × 3. 0 VOID. Load-1 before: median 10.0 (F), 12.7 (R), 11.7 (U).

| arm | lock wait median (min to max) | < 1 s | nav → start pressable median (min to max) | ≤ 1 s |
|---|---|---|---|---|
| F, n=6 | 1575 ms (231 to 5503) | 3/6 | 9134 ms (6674 to 24001) | 0/6 |
| R, n=6 | 316 ms (141 to 1610) | 4/6 | 1966 ms (686 to 3293) | 2/6 |
| U, n=3 | 34 ms (30 to 36) | 3/3 | 536 ms (509 to 682) | 3/3 |

The warm-up runs inside R behaved like fresh runs: n=6 waits 367 to 5368 ms, and nav → pressable 5286 to 15894 ms.

**Traced rotation P=w** (`warm-summary-w.json`, `trace-w-*.summary.json`, `chain.json`). F,R × 7, U × 3, every measured run traced.
- Waits: F median 590 ms (293 to 4320), R median 523 ms (206 to 3680), U 857 / 1759 / 1664 ms.
- **Tracing perturbs the magnitude.** Untraced U waits about 34 ms, while traced U waits 0.86–1.76 s. Traced fresh runs here (median 590 ms) were also faster than the untraced lean arm in section 2 (median 4329 ms). So traced numbers show structure, and only untraced numbers carry magnitude.

**Occupant (`chain.json`, 13 traces).** In every trace checked, the browser main thread's busiest task inside the wait contains one synchronous
`FrameSinkManager::DestroyCompositorFrameSink` call lasting 93–100 % of that task's wall time. That holds for all 7 R, all 3 U, w-F-2, iso-T-3 and t8.

- In the R traces the task is posted from `CloseWindow` and starts 82–133 ms before the lock request. Its wall times are 236–3762 ms, at 2.0–3.5 ms CPU.
- At the same time, the GPU process's `CrGpuMain` runs `GPUTask`/`CommandBuffer::Flush` at about 1 % CPU. The rasterising happens on
  swiftshader worker threads, which emit no trace events.
- The page makes no WebGL context in that window: no `getContext` in `diag-w-U-2.json`.

So **the occupant is present when the page is warm.** It is triggered at the home → route navigation, and it is not first-run work.
`OnCommandComplete` was only a posting site of the same blocked call.

**Verdict 5.**
- **Confirmed (untraced):**
  - Without throttling, the wait vanishes: 30–36 ms, n=3. The owner budget is met 3/3 (509–682 ms).
  - With a reused profile under throttling, the wait is under 1 s in 4/6 (median 316 ms), but the budget is met only 2/6 (median 1966 ms).
  - A fresh profile under throttling stays slow (budget met 0/6). Its nav → lock request is itself long (median 7.3 s, range 0.4 to 22.8 s; R median 0.12 s), so that arm misses the budget even when the lock wait is small.
- **Confirmed in traces, magnitude inflated by tracing:** the browser main thread is held by a synchronous compositor-frame-sink teardown that waits on a
  saturated software-GL GPU process. The page's renderer is not the occupant.
- **Inferred:**
  - This chain belongs to this stand-in. It needs macOS `remote_cocoa` window teardown plus a swiftshader GPU process, both starved of CPU.
  - The site's own share is the paint and raster work it hands that GPU process at navigation. That work is not measured here.
- **What would change it:** the same wait on a stand-in with hardware GL (`--use-angle=metal`) or on a non-mac host, untraced. If it persists there, the page's raster cost at navigation becomes the term to bound.

## Re-run

```bash
# from this directory; RAWDIR must be outside the repo
DIST=<worktree>/dist RAWDIR=<scratch> K=6 N=3 MODE=plain P=p ./warm.sh && node warm-summary.mjs p
DIST=<worktree>/dist RAWDIR=<scratch> K=7 N=3 MODE=trace P=w ./warm.sh     # then analyze.mjs per tag, node warm-summary.mjs w
node chain.mjs <scratch> w-R-1 w-U-1 ...                                    # needs the raw traces in <scratch>
DIST=<worktree>/dist RAWDIR=<scratch> TAG=hl K=8 ./interleave.sh && node aggregate.mjs hl
DIST=<worktree>/dist RAWDIR=<scratch> K=3 ./isolate.sh
DIST=<worktree>/dist TAG=t8 MODE=trace QUERY=0 RAWDIR=<scratch> ./run.sh       # traced; MODE=plain | harness also
node analyze.mjs <scratch>/trace-t8.json diag-t8.json trace-t8.summary.json && node rollup.mjs
```
