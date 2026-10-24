# gh#289 — the wheel announced its pick before the disc landed when a frame was late

Measured 2026-10-24 on this Mac. Every browser reading uses headless Chrome with the ci-probes lane flags (`--headless --disable-gpu --no-sandbox`), against `/tool/wheel/` seeded the way `scripts/wheel-pointer-name-probe.mjs` seeds it: names A to E, eliminate on, 3 spins.

## The red that started it

One full local `scripts/run-workflow-gates.sh` run (2026-10-24, tree 667851a, load average about 35) went red on `wheel-pointer-name`:

> width 390 spin 2: announced "C" but the painted wedge under the pointer is "B"

Run alone, the same probe on the same dist passed 10 of 10. A rerun of the suite was green.

## Cause

`spin()` started a `transform` transition of `SPIN_MS` (2000ms) and scheduled `reveal()` with `setTimeout(SPIN_MS + 60)`. The press-mode stop handler did the same with `STOP_MS + 60`. The timer counts from the tap. A transition's start time resolves at the first frame after the style change. So when a frame is late, the disc lands late but the name is announced on time.

## What reproduced it, and what did not

Readings are taken at 2300ms after the click (the old probe's read time) and again once settled. Raw output is in `raw/`; the driver is `wheel-freeze-diag.mjs`, run by `wheel-freeze-loop.sh`.

| lever (unfixed page) | transition start | reveal | transitionend | at 2300ms | settled |
|---|---|---|---|---|---|
| none | ~0 | ~2062 | ~2010 | match | match |
| GPU process SIGSTOPped 800ms after the click | ~800 | ~2062 | ~2815 | match, disc still turning | match |
| GPU process SIGSTOPped 1200ms after the click | ~1200 | ~2062 | ~3215 | **mismatch, 6 of 6 spins** | match |
| CDP `Animation.setPlaybackRate` 0.5 | n/a | ~2062 | ~4010 | **mismatch, 3 of 3** | match |

Did not reproduce, 0 mismatches:
- a 600ms main-thread busy-wait right after the click: the transition still ended ~2010ms, because the frame time is back-dated;
- CDP CPU throttling ×6;
- 20 busy-loop processes on 14 cores;
- `npm run ci-probes` running alongside 120 spins (`raw/under-ci-probes-load-120-spins.txt`). The load average stayed 3 to 5 there, and `dist/` was rebuilt mid-run, so that run's own ci-probes reds are not findings.

A landing angle off the wedge was ruled out from the code: `landingRotation` always lands at a wedge's centre.

## The fix

`reveal()` now follows the disc's own `transitionend` on `transform` (`revealOnLanding()` in `src/pages/tool/wheel.astro`), on both the spin path and the press-mode stop path. A fallback timer at 3× the duration covers a transition that never ends; it outlasts the probe's half-speed landing at 2×. The reduced-motion path still reveals at once. `cancelPendingSpin()` and `reveal()` both detach the listener, so a cancelled landing never reveals.

## The probe now judges the disc at the reveal

`wheel-pointer-name` reads the disc in the microtask in which the result text appears. No transition may be running, and the announced name must be under the pointer. A third run slows the animation clock (`Animation.setPlaybackRate` 0.5). The verdict checks that this lever took effect: the slow landings must take at least 0.8 × the normal landing ÷ the rate.

| build | probe verdict |
|---|---|
| unfixed `dist/` | **FAIL** 2 of 2: rate 0.5 spin 1 announced at ~2062ms while turning, landed ~4015ms; both normal runs green |
| fixed (scratch build) | PASS 3 of 3; reveal within 1ms of the landing, ~4010ms at rate 0.5 |
| unfixed, GPU-freeze side loop | FAIL 3 of 3 |
| fixed, GPU-freeze side loop | PASS 3 of 3 |
| mutant: `drawWheel(remaining())` re-added after the announcement (the original defect) | **FAIL**: 9 of 9 spins announced one name with another under the pointer, 0 running |

Fixed page under the deterministic 1200ms GPU freeze (`raw/fixed-freeze1200-run*.json`): nothing is announced at 2300ms while the disc turns. The reveal lands at 3207 to 3221ms, within 1ms of each `transitionend`, on all 6 spins.

## Paths the probe does not cover, checked by hand once

Driver: `wheel-lifecycle-diag.mjs` (output in `raw/lifecycle-both-builds.txt`), width 390, run on both builds at both clock rates.

| check | unfixed rate 1 | unfixed rate 0.5 | fixed rate 1 | fixed rate 0.5 |
|---|---|---|---|---|
| press mode: reveal after the stop press | 964ms, landed 918ms | **962ms, disc still turning** | 904ms, landed 903ms | 1825ms, landed 1824ms |
| reset 800ms into a spin: reveals in the next 7s | 0 | 0 | 0 | 0 |
| next spin after that reset | reveal 2061ms | reveal 2061ms, turning | reveal 2019ms | reveal 4009ms |
| reduced motion: reveal after the tap | 1ms | 1ms | 1ms | 1ms |

The 7s window outlasts the 6s fallback, so the reset rows also show the fallback timer is cleared. A mode switch mid-spin is not reachable from the page, because the mode radios are disabled while spinning; both builds behave the same there.

## Not measured

- A real phone.
- The press-mode stop path is not in the CI probe; only the hand check above covers it.
- On the CI runner, `Animation.setPlaybackRate` is untested until a branch run reads the slow run's landing times.

## REFUTE round 1, and what changed

The review found no blocker. Three items were taken:

- **The verdict proved "not early", not "on landing".** A page whose landing listener never matched would reveal through its fallback timer, over a resting disc with the right wedge, and pass. The verdict now also fails a reveal that trails the landing by more than 250ms.
  - Must-red on a mutant whose listener filter can never match: FAIL, "announced 3987ms after the disc landed"; the reveal came at ~6003ms against a landing at ~2014ms.
- **The stop path's fallback was 3 × `STOP_MS` = 2700ms.** A frame stall just under a second could still announce mid-turn there. The fallback is now floored at the spin's 6000ms on both paths.
- **The slow run's rate is pinned to 0.4–0.6.** The lever floor only discriminates well under 0.8, and much below about 0.33 an honest landing outruns the fallback.

Re-run on the revised build (scratch outDir, private snapshots only):

| build | result |
|---|---|
| probe on the revised fix | PASS, 3 of 3 runs |
| probe on the unfixed snapshot | FAIL, slow run |
| probe on the listener-filter mutant | FAIL, reveal trails landing |
| lifecycle on the revised fix | press mode reveals at its landing: 934/934ms at rate 1, 1807/1807ms at rate 0.5; reset never reveals; reduced motion 1ms |

Also fixed: a stale line-number citation in the stop handler's comment, which now names the press branch of `spin()` instead.
