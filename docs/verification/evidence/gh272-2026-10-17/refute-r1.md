Result: FAIL

[mechanism] P1, Confirmed — scripts/render-suspension-check.mjs:109 (`readRouteFile`): RAN counter-example: `const kind='webgl'; canvas.getContext(kind)` plus a drawing loop passes as no-suspend alongside a recognized WebGL route. The gate enumerates selected JavaScript syntax, not rendering capabilities. Use a project-owned capability/adapter registry; adding syntax patterns will not converge.
base: not run — READ base 45d4958; this gate is absent.

[mechanism] P1, Confirmed — scripts/webgl-pixels-probe.mjs:288 (`OPEN_SCREEN_WINDOW`): RAN counter-examples: an earlier draw while open is subtracted away; drawing resumed on frame 31 is ignored. Both produce zero measured draws and PASS with nonblank pixels. Count across the complete pending/open/save hold lifecycle.
base: not run — READ base; this suspension detector is absent.

[spot-fix] P2, Confirmed — scripts/webgl-pixels-probe.mjs:302 (`openWindowFault`): RAN the actual window with its timeout firing after one frame; it accepts that as valid evidence despite promising 30 frames. Require completion or return UNMEASURED.
base: not run — READ base; this window validation is absent.

[spot-fix] P2, Confirmed — scripts/player-screen-handover.mjs:47 (`HANDED_OVER`): RAN the real shared screen with `onStart` throwing before accepting players. The walk reports success because `close()` already changed the attribute. A drawing background can then satisfy pixel readback without a successful handover; require acknowledgement after route startup succeeds.
base: not run — READ base tree; this helper is absent.

RAN `node --test 'src/play/_player-screen/*.test.mjs' 'src/play/croc-bite/*.test.mjs' 'src/play/one-bomb/*.test.mjs' 'src/play/pinocchio-luck/*.test.mjs' scripts/player-screen-handover.test.mjs scripts/webgl-pixels-probe.test.mjs`: 312 passed.
RAN `node scripts/render-suspension-check.mjs --selftest` and `node scripts/render-suspension-check.mjs`: both passed.
RAN scratch [counterexamples.mjs](/Users/waris.c/claude/claude-skills-index/skills/orchestrate/runtime/judge.fD6i/counterexamples.mjs); workspace files were unchanged.
Coverage: browser pixel lane, real context loss/visibility composition, and the required ≤1s software-rendered latency were not run.

would change if: these counter-examples are rejected while valid controls still pass.
