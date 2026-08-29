# power-meter — build outcome and open defects

## CLOSED BY DELETION (gh#136) — read this before acting on anything below

The ported engine is gone. `src/games/power-meter.ts` (1056 lines), `src/games/power-meter.test.mjs`
(1060 lines) and `src/styles/games/power-meter.css` (422 lines) are deleted; the game now runs the
original mockup full screen at `/game/power-meter/play/`, and `src/games/power-meter.ts` is a landing
page only. Same move as cannon-flag (687e83d).

Every defect and mutant recorded below is closed by that deletion, because the code they describe no
longer exists — none was fixed:

- **MUST FIX 1** (bar paints 9.59 while the score records 10.00): the two-path scoring that caused it
  was this port's own. The mockup has one meter and scores off it, so paint and score agree by
  construction — which is exactly what the entry's "CORRECT FIX" asked for.
- **MUST FIX 2** (spark burst draws to a detached canvas after the first attempt) and **MUST FIX 3**
  (`cleanup` never drained, ~40 renders of accumulation): both live in the deleted mount/teardown
  lifecycle. The play route mounts once and never re-mounts.
- **All 7 surviving mutants + the vacuous assertion**: they were properties of `power-meter.test.mjs`
  and its fake DOM, both deleted. Mutant 1 (the `<a href>` inside an `innerHTML` constant that the
  ADR-0014 sweep could not see) is closed structurally instead: the built play route emits **0**
  `<a href>` of any kind, matching cannon-flag's play route, and the crawlable outbound link stays in
  page chrome above the stage.
- The three **"Conflicts to resolve"** are moot for the same reason — they were all about this
  stylesheet and this module's effect budget.

What survives as a finding: the **spec-first method** measurements at the end of this file. Those are
about how the port was produced, not about the artifact, and they are why games 3-10 read the mockup's
HTML and skip its `.md`.

Still open, and NOT closed by this change: power-meter has never been registered in
`src/games/manifest.ts`, so `/game/power-meter/` does not build yet. `public/og/power-meter.png` does
not exist either, while the module declares `og: 'power-meter.png'`.

---

## Historical record — the state before gh#136

State: 3 files written, UNWIRED and UNCOMMITTED.
`src/games/power-meter.ts` 1024 lines · `power-meter.test.mjs` 898 lines / 32 tests · `power-meter.css` 420 lines.
11 gates exit 0, and the gate agent verified none is a vacuous pass (each either flat-globs
`src/games/*.ts` or walks all of `src/` regardless of manifest registration).

## MUST FIX before this ships

### 1. The gauge and the score disagree — a visibly broken game
Verified by the orchestrator directly, not taken from a report:
```
t=1430ms  bar paints 9.59  score records 10.00
t=1490ms  bar paints 9.74  score records 10.00
```
Cause: `PERFECT_WINDOW_MS = 60` is applied in a new `lockedScoreAt()` that overrides the score AFTER
the fact, leaving `meterValueAt` (what the bar paints) untouched. Up to 0.41 of disagreement. Under
reduced motion the static target band is the only target channel, so it is worse there.
ROOT CAUSE IS THE BRIEF, NOT THE BUILDER: the orchestrator said "widen the window" and "derive the
constant from the spec's formula" and never said the painted bar and the recorded score must agree.
CORRECT FIX: widen by flattening the METER near its peak so the bar genuinely reads 10.00 for ~60 ms.
Then paint and score agree by construction and there is nothing to keep in sync. Do NOT keep a
second scoring path.

### 2. The spark burst paints once per mount, then draws to a detached canvas
`attachSparkCanvas` bails on `if (fxCtx || !host)`; only teardown clears `fxCtx`. The next
`stage.replaceChildren()` detaches the canvas but leaves `fxCtx/fxW/fxH` set. So: lock attempt 1 shows
the burst, every later lock draws into nothing. Untestable as written — `FakeElement.clientWidth = 0`
makes the whole spark path bail in the harness, so the fake DOM needs a width before a test can see it.

### 3. `cleanup` is never drained between renders (PLAUSIBLE, but it scales)
~4 closures plus a detached screen accumulate per render. A 10-player game does ~40 renders;
`pick-loser` does 2, which is why the house pattern never exposed this. Drain per render, or scope the
per-screen listeners separately from the per-mount ones.

## TESTS THAT CANNOT FAIL — 7 surviving mutants plus 1 vacuous assertion

Found by the conformance agent on scratchpad copies, repo files untouched. 32/32 stayed green for each:
1. `<a href="/party">` appended to `EMPTY_GAUGE_SVG` survives — the fake DOM keeps `innerHTML` as a
   STRING with no children, so the nine-phase anchor sweep is blind to every `innerHTML` constant.
   This is an ADR-0014 hole hiding behind a green test. Highest priority of the seven.
2. Drop `cleanup.push(armAllButtons(stage))` from `renderLocked` — `armedClick` reads `disabled` only
   after the wait, which an ungated render also passes. Only `renderResult` is actually pinned.
3. Remove `token !== runToken` — the phase reset alone covers the one test's input.
4. Remove `if (prefersReducedMotion) return;` from `fxFrame` only — under reduce nothing schedules
   `fxFrame`, so only the flip-mid-decay path uses it and no test reaches it.
5. Gut `onReducedMotionChange` — the fake `matchMedia`'s `addEventListener` is a no-op stub, so the
   `change` listener registers into a black hole and nothing notices.
6. Delete the `0.00` tick — test 29 greps SOURCE TEXT and `0.00` also occurs in comments.
7. Retune any effect constant freely (`PEAK_GLOW_MIN` 980→500, `TRAUMA_PERFECT` 0.9→0.05,
   `SHAKE_MAX_PX` 16→1, `STOP_GUARD_MS` 250→200) — no assertion pins a single effect constant.
Plus: test 14 asserts through `lockedScoreAt`, which returns MAX before `meterValueAt` is ever called,
so gutting the entire fall branch near the peak stays green. Its comment also states a false premise
(it claims the spec's 1461.28 row is 999; measured 1000).

## Conflicts to resolve, not defects

- ~~§7 (ship all 16 effects, owner's decision) vs §10 (the graphic direction, which forbids the pulse
  animation and the motif animation).~~ **RESOLVED 2026-08-29, owner ruling: §7 governs whether an
  effect EXISTS, §10 governs how it LOOKS.** Both loops are gone and both effects are kept —
  `.pm-tap--running` holds the pulse's end position as a static shadow, and `.pm-loser-motif` wobbles
  once on entry and settles upright. Every animation in the stylesheet is now one-shot.
  **Count corrected while acting on it: the entry said "three infinite CSS animations" but named only
  two, and the stylesheet had two — `pm-pulse` and `pm-wobble`. `pm-pop` and `pm-rise` are one-shot
  `both` fills and were never in question.** The reduce block already covered all of them, so the cost
  had always been paint and battery, not accessibility.
- `.pm-score` ships one colour where §10 prescribed three tiers. That follows from the orchestrator's
  no-new-tokens decision (gold 1.42:1, amber 1.75:1 on white — unusable as text). Consequence to check:
  with the tier colour gone AND the window widened, `10.00` now carries no visual distinction at all.
  The badge must carry it, or nothing does.
- Size 1024 lines vs a 600 target. 816 code / 140 comment. The 9-phase machine with 8 screens is ~300
  and all 16 effects are ~210. Cutting to 600 means dropping effects the owner mandated.

## What the SPEC-FIRST METHOD actually bought — measured

| | freeze-tap (ported, builder saw the mockup) | power-meter (spec only) |
|---|---|---|
| Thai strings | ~15 invented or reworded, needed 2 fix rounds | **55/55 byte-exact, zero paraphrases**, plus 60 must-not-appear all absent |
| Tuning values | not systematically checked | **41 of 42 exact; the 1 mismatch is the SPEC's own arithmetic** |
| Design-stage cost | 13.2 min / 190k tokens | 22.3 min / 211k tokens |
| Build-stage cost | 9.3 min / 198k | 27.9 min / 303k |
| Surviving mutants at first check | 3 (found by REFUTE) | **7 + 1 vacuous** |

Read honestly: the method is clearly better at FIDELITY (copy and constants, which is where freeze-tap
bled two rework rounds) and clearly worse or no better at COST and at TEST QUALITY. The design doc
being sufficient on its own is real — the builder never saw the mockup and still matched 55/55 strings.
The spec also contained its own arithmetic errors (two checkpoint rows), so a spec is not automatically
truer than the .md; it is only truer because it was derived from the code.

Also settled: reading the mockup's `.md` is NOT worth it. The power-meter `.md` disagreed with its HTML
in 11 places, worst being a scoring model off by a factor of ten across all 7 of its test vectors. Two
games in a row had a `.md` falsely claiming prefers-reduced-motion support. Games 3-10 should skip the
`.md` entirely and read the HTML.
