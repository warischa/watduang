# gh#272 lock-bound latency, BASE 45d4958 (2026-10-17)

Re-run (only DIST/PORT/CDP/TAG change; one Chrome at a time; refuses if another headless Chrome/gate lane runs):
    DIST=<worktree>/dist PORT=4411 CDP=9411 TAG=<name> ./run.sh both     # or: standin | reference
    knobs: N=5 runs/path, BURN=2 burners, W=1440 H=900, ROUTE=croc-bite, SCEN=P1,P2,C
Output: latency-<TAG>-{reference,standin}.json (raw runs + summary), pids-*.txt, run output ends with a teardown line.

Machine: Apple M4 Pro, 10 P + 4 E cores, 48 GB, macOS 26.4.1, Chrome 155.0.8059.82.
Chrome flags (both conditions): --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox
 --no-first-run --no-default-browser-check --remote-debugging-port=$CDP --user-data-dir=<fresh>; Emulation 1440x900 mobile:true.
Stand-in = same flags launched via `taskpolicy -b` (background QoS -> efficiency cores) + BURN=2 `taskpolicy -b` busy-loops.
 The 2026-10-16 launch recipe was not recorded; burner count is MY calibration: 8 -> 0.03 fps and P1 unreachable in 60 s,
 4 -> 0.06 fps, 2 -> ~0.5 fps (kept), 1 -> ~0.5 fps. Not guaranteed equal to the 10-16 stand-in.
Reference = same flags, no taskpolicy, no burners (WebGL still live software, so same code path).
Seed: P1 = ZERO_TRIGGER_DATA_V1 `{players:[4 typed names],penaltyMode}` (keep:'settings' legacy), empty roster, seeded on the
 home page. P2 = roster+group of 4 names; rename row 1 via native setter+input event, press start.
Metrics (in-page, performance.now from navigation): P1 pressable = first time the screen is open AND start is enabled+visible
 (includes ARM_DELAY_MS 400); pressableFrame = next rAF after that; pending = data-player-screen-pending set->clear;
 lock wait = navigator.locks.request -> callback grant. P2 commit = click -> Storage.setItem('watduang:roster') carrying the
 rename (read back from storage after); settle = click -> data-player-screen 'closed'.
VOID rule: no seed / screen not reached / migration not landed / no live WebGL / innerWidth != 1440 -> VOID, never averaged.
Control C: croc-bite on empty storage, 12 s observed: frames/s, rAF gaps, long tasks.

Findings (this run, 0 VOID): see JSON. Caveats: P1 includes croc-bite's 3D boot (screen opens only after first frame), so
 nav->pressable is dominated by boot, not by the lock; P2 is NOT reproduced as slow (click lands in an idle gap, grant immediate).

## FIX build run (TAG=fix, PORT=4412, CDP=9412, N=5, SCEN=P1,P2,C,H) 2026-10-17 19:00-19:07
Build: .claude/worktrees/gh272/dist (built 18:51 from the uncommitted fix tree, not rebuilt). Same BURN=2 stand-in, same flags.
Added scenario H (fix only): press start -> render3D 'live' and next rAF (first 3D frame). Requires zero WebGL contexts before the click.
GL-liveness rule changed after the first fix run: a deferred build makes no context before handover, so "live" = a page context
 request succeeded OR an in-page probe context can be created. First attempt (all 10 P1 runs VOID "no live WebGL context seen",
 numbers otherwise fine) is kept under fix-run1-void-glrule/. Base numbers were taken with the earlier rule; re-running base
 under the new rule can only differ by that check.
Machine load (not a headless Chrome / gate lane): start 19:00:11 load 6.27 6.21 5.93; end 19:07:02 load 9.75 8.00 6.74.
 Top CPU at both points: OneDrive File Provider ~89%, OneDrive ~70% (a full core each), fileproviderd ~11%; no node test process in
 the top 5. Heavier than during the base run (load ~2-5), and it shares the E cores the stand-in is pinned to -> fix stand-in
 numbers are pessimistic/noisy; see files load-fix-start.txt / load-fix-end.txt.
