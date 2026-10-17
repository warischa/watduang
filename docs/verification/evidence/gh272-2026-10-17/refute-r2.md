Result: FAIL

R1 syntax detection: closed—the gate checks project-owned declarations; runtime hooks catch expression-based getContext calls.
R1 30-frame window: removed, but recording is judged before measurement finishes; see F2.
R1 timeout acceptance: incompletely closed; see F1.
R1 throwing onStart: closed—acknowledgement follows return/promise resolution; real-screen tests RAN.

F1 [spot-fix] P2, Confirmed — scripts/webgl-pixels-probe.mjs:389, main/judgeHold: seenFreeAfterHeld remembers ANY earlier free. RAN synthetic main with held→free→held and no final free: PASS. The real screen can acknowledge handover while a removal remains pending. Require the latest held span to end.
base: not run — READ 45d4958 source; this hold detector is new.

F2 [spot-fix] P2, Confirmed — scripts/webgl-pixels-probe.mjs:398, main: the recorder snapshot precedes READBACK and is never refreshed. RAN synthetic main: a held draw during readback increments the live counter to 1, yet the reported counter remains 0 and verdict PASS. Re-read and judge after measurement.
base: not run — READ 45d4958 source; this hold detector is new.

F3 [mechanism] P1, high confidence, Inferred for native WebGL — scripts/webgl-pixels-probe.mjs:141, RECORDER: enumerating core prototype methods misses extension draws such as ANGLE_instanced_arrays.drawArraysInstancedANGLE. RAN the recorder over a synthetic extension: one draw, zero recorded; a no-op subscription passes the static gate. Browser-owned entrypoints cannot converge through method-list patches; enforce a project-owned render entrypoint.
base: not run — READ 45d4958 source; RECORDER is absent there.

Coverage: RAN 319/319 passing tests with `node --test /Users/waris.c/claude/free-game/.claude/worktrees/gh272/src/play/{_player-screen,croc-bite,one-bomb,pinocchio-luck}/*.test.mjs /Users/waris.c/claude/free-game/.claude/worktrees/gh272/scripts/{webgl-pixels-probe,player-screen-handover}.test.mjs`.
RAN gate selftest/audit and `node /private/tmp/gh272-adversary/counterexamples.mjs`. Workspace unchanged.
Not verified: live GPU pixels or ≤1s latency. Chrome aborted; headless Chromium fallback failed with OS permission denial.
would change if: these counterexamples reliably reject and the software-rendered browser lane verifies the complete hold lifecycle and pixels.
