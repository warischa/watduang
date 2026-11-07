# Arm-gate marker leak: audit, REFUTE detectors and repros (2026-11-07)

The gh#295 closing comment recorded this residual: a control that the caller had disabled when the gate started was never handed back once the caller enabled it and a late in-window contact (ADR-0059) re-held it.

The audit found the defect live on two routes. On cursed-number the confirm button went dead from turn 2 on; on wire-snip-panic the scan button did. One-bomb's start button also kept a stale mark, but nothing reads that mark.

## What shipped (approach C, caller-side; the shared gate is unchanged)

- **cursed-number:** the ready handler runs `syncSelectionUI()` before `showScreen('screenSelection')`.
- **wire-snip-panic:** `setupTurn` enables scan before `showScreen('screen-game')`.

On both routes the control is enabled when the gate collects it, so the gate holds it and hands it back. The cursed-number change also closes a hole: confirm used to be live inside the window on every turn.

## Rejected

- **Fix A** (an owned set that only shrinks, inside the shared gate). REFUTE round 1 found that an older gate could then release a newer gate's hold.
- **Fix B.** It handed back a control that another live gate still held (`overlap.mjs.txt`).

## Files

Every script is saved as `.txt`, so the repo's tooling does not run it. Copy one to `.mjs` to run it. `harness.mjs.txt` names a machine-local scratch path; change it before you run anything.

- `route-cursed-number.mjs.txt`, `route-wire-snip.mjs.txt`, `ps-onebomb-shape.mjs.txt`, `harness.mjs.txt`: the audit's repros. They run on a fake DOM with a fake clock, and the env `GATE=<path>` selects the gate under test.
- `wire-variant.mjs.txt`: the fork's corrected wire-snip detector, with env `GATE`, `TURN`, `ORDER` and `CASE`. **Stale since ae7b73b:** that commit moved the scan enable ahead of `showScreen`, so this copy's `ORDER=head` leg measures nothing now. Use `wire-variant-post-ae7b73b.mjs.txt`. The verdicts below were recorded on the gate as it was before ae7b73b:
  - `TURN=1 ORDER=head CASE=overlap`: RED. This is the pre-existing overlap ghost, gh#297.
  - `TURN=2 ORDER=head CASE=dead`: RED, the dead scan.
  - `TURN=2 ORDER=c CASE=dead`: green.
- `overlap-generic.mjs.txt`, `gateE-worktree.ts.txt`: candidate E for gh#297. Not shipped.
- `wire-rehold.mjs.txt`, `overlap-after-rehold.mjs.txt`, `player-rehold.mjs.txt`: REFUTE round-1 detectors. `wire-rehold`'s `closeModal` armed nothing on `screen-harness`, which has no compound-class `matches()`; `wire-variant` corrects that.
- `round2.mjs.txt`: the REFUTE round-2 detector. Its verdict was RES=PASS: no introduced defect. It also reports that on wire-snip the gh#297 overlap and the mid-sequence scan now reach turns 1 to 3. On HEAD they reached turn 1 only, because the dead scan masked turns 2 and 3.
- `wire-variant-post-ae7b73b.mjs.txt`: `wire-variant` adapted for ae7b73b, where HEAD is order c. Run it with `ORDER=c` only.
- `gh297-fix-e.md`: gh#297 fix E as shipped. It holds the two readings, the enable-site enumeration with a verdict per site, and the measurements.
- `player-ghost.mjs.txt`: gh#298. At HEAD's gate a ghost on start, inside the renewed window, fires. With fix E (`e8fdab0`) it is refused. What gh#298 still had to fix was the visible state: start rendered live inside that window. The fix makes `syncControls` read `gateHolds`. The must-red is the shared case in `screen-harness.mjs`'s `revealPathCases`: 14 of 14 routes red before the fix, and red again with the read removed.

## Still open

- Nothing. gh#297 and gh#298 shipped in `478288a` (deployed 2026-11-07; the live site is byte-identical to the build) and are closed. REFUTE round 2 returned RES=PASS. The remaining ceilings are recorded in `gh297-fix-e.md` and in the gate's comments.
