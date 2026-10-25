# gh#289 — REFUTE round 2 (final) and the two fixes it led to (2026-10-25)

Round 2 of the push `cbb951b..HEAD` ran on the codex judge lane (`gpt-6.1-sol` at xhigh). It returned `FAIL` with two findings, and both reproduce at `cbb951b` and `8934bce`. The judge's verdict is `verdict.txt`, verbatim. Its harness files are kept with a `.txt` suffix so no test runner collects them.

## Finding 1 — the verdict accepted a reveal before the landing (spot-fix)

A page can pause the disc's transition, announce a name that matches the pointer, and then resume the turn in a microtask. The probe then reads `runningAtReveal=0`, and the disc lands later. A missing `revealMs` also passed.

- **Fix, in `scripts/ci-probes-verdict.mjs`:** a non-finite `revealMs` fails. A reveal earlier than the landing by more than `WHEEL_REVEAL_BEFORE_LANDING_SLACK_MS` (2ms, the two `Math.round` calls) also fails. The existing "trails the landing by more than 250ms" rule is unchanged.
- **Red, then green:** the judge's fake-DOM wrong page (`wrong-page-audit.mjs.txt`) passed before the fix and fails after it. See `wrong-page-audit-before-fix.log.txt` and `wrong-page-audit-after-fix.log.txt`; the after log ends in the audit's own assertion on the worktree leg. The unit tests in `scripts/ci-probes-verdict.test.mjs` went from 16/18 to 18/18.

## Finding 2 — the fallback announced while the disc still turned (mechanism, decided by a fork)

The fallback timer fires at 6000ms. If the browser starts the transition late enough, the timer fires before the disc lands. A fork review chose to have the timer settle the disc and then announce, because the page owns the landing angle but not the frame delay.

- **Fix, in `src/pages/tool/wheel.astro`, inside `revealOnLanding`:** `stopAwaitingLanding()`, then `setRotation(rotation, null)`, then `reveal(picked)`.
- **The lever:** `probe-rate025.mjs.txt` is a copy of the probe that slows the animation clock to 0.25, so the disc lands at about 8s, past the fallback. Headless Chrome ran with the ci-probes flags against a `dist/` built from each source, 3 spins per leg:

| build | rate | running at reveal | reveal ms | landing ms | name / pointer |
|---|---|---|---|---|---|
| unfixed (`rate025-unfixed.json`) | 0.25 | 1, 1, 1 | 6002–6003 | 8009–8011 | match ×3 |
| unfixed | 0.5 | 0, 0, 0 | 4014–4016 | 4013–4016 | match ×3 |
| fixed (`rate025-fixed.json`) | 0.25 | 0, 0, 0 | 6002–6003 | none (cancelled) | match ×3 |
| fixed | 0.5 | 0, 0, 0 | 4007–4017 | 4007–4016 | match ×3 |

The pointer matched even on the unfixed 0.25 leg, because the ease is close to its end angle by then. Only the running count and the gap between reveal and landing show the defect.

- **The real probe on the fixed build:** `scripts/wheel-pointer-name-probe.mjs`, run the way `scripts/ci-probes.sh` runs it, passed its verdict both times (`real-probe-fixed.json`, `real-probe-fixed-after-mutant.json`).
- **Landing-path mutant:** the `propertyName` filter was changed to never match. The verdict exits 1 with "a fallback timer, not the landing" (`landing-mutant-verdict.txt`, `landing-mutant-probe.json`). The file was restored byte for byte and checked by sha.

## Not covered

- The fallback path is not CI-gated. A settled reveal has no landing time, and the verdict correctly reds on that, so no CI leg drives the fallback on purpose. This page is its proof.
- A hidden tab, where timers tick but no frame paints, was not run. It is inferred to take the same settle path.
- Real phones were not tested; they are queued on gh#141.
