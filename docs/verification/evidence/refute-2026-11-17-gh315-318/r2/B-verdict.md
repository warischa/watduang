Result: FAIL
F1 closed — RAN both planners with `[null]`, `Array(1)` and `[7]`; all refused.
F2 still open — original mutants are refused, but deleting a beat leaves an accepted sparse plan.
F3 closed — RAN identity picks/order, one prize, card 1 at 1800–1811 ms; its camera-facing side remains visible.
[spot-fix] medium · `src/play/prize-flipcards/renderer/plan.ts:169` · `same` / `assertPlan`: `delete plan.beats[plan.beats.length - 1]` passes validation, while `beatsIn(plan, -1, plan.total)` contains no completion. **Confirmed:** `a.every` skips holes. Compare every indexed slot, including its presence.
base: new — RAN candidate counterexample; `git ls-tree HEAD` confirms this file is absent, so no base implementation ran.
PD-316-01 closed — RAN mounted scene: all eight meshes are transparent and follow the intended layer order; GPU pixels remain unverified.
Envelopes’ missing assertion alone is not a demonstrated hole: mount creates its plan locally through the validating `planFor`; it accepts no external plan.
Coverage: supplied lens tests pass; RAN `node --test <scratch>` — 4 pass, 1 fail. Workspace unchanged; no browser/WebGL run.
would change if: `assertPlan` rejects sparse beat arrays, including deletion of the completion beat.
