# A provably unreachable branch gets a structural test, not a notice

[ADR-0022](0022-a-refusal-is-reported-never-reconciled.md) decided that a refused write is reported at
`write()`'s chokepoint. Reading `requestClear` (`src/shell/PlayerSetup.astro:336`) against that decision
looked like a gap: `clear()` (`src/shell/session.ts:245`) can refuse a stale write the same way `write()`
can, but `requestClear` wires no `onWriteRefused` listener, and `saveGroup([])` plus `location.reload()`
run regardless of the outcome. That reads exactly like the gh#50 defect ADR-0022 closed.

We decided not to build the notice. The branch is provably unreachable today, and a test now pins the
structure that makes it so.

## Why it is unreachable

`requestClear` binds `const session = loadSession()` inside its own body (line 345), with zero `await`,
`.then(`, or `yield` before `session.clear()` (line 384). No re-entrant tap widens the gap either:
`clearConfirmBtn`'s click handler calls `requestClear(true)` again (line 393), so `loadSession()` runs
fresh on the confirm tap too. A closure that reads its own record synchronously and writes it
synchronously, in the same turn, cannot have gone stale in between.

## Why not build the notice (two independent reasons)

1. **The branch is dead.** A rendered notice would add a tap surface for a state that cannot occur —
   exactly the hazard [ADR-0020](0020-a-gate-fix-is-itself-a-new-surface.md) exists to name: fixing a
   gap by rendering something is itself new surface, and here there is no gap to fix yet.
2. **It was copy-blocked regardless.** All three `refusalCopy` strings
   (`src/shell/player-select.ts:145-149`) end in "ไม่ได้บันทึก" — *the write was not saved*. The loss
   from a refused **clear** is "ไม่ได้ล้าง" — *it was not cleared*. That string does not exist, and
   [#25](https://github.com/warischa/watduang/issues/25)'s owner-approved rule (cited in ADR-0022) is
   that the copy names every loss it actually causes. Shipping the existing copy against this branch
   would have named the wrong loss.

Reason 2 stands on its own: "just wire up `onWriteRefused` here" was not merely unnecessary, it was not
available without an owner decision on a fourth string.

## What the test does and does not do

`src/shell/player-setup.test.mjs` asserts, against `requestClear`'s source text, that the binding
`const session = loadSession()` sits inside that function and that no `await`, `.then(`, or `yield`
appears between it and `session.clear()`.

It does not catch a synchronous re-entrant session writer appearing in that span. That gap is named in
the test's own title rather than left implied — the set of future writers is owned by whoever edits this
file next, not by this repo, and per [ADR-0019](0019-a-tripwires-green-must-not-imply-coverage-it-has-not-earned.md)
a tripwire's green must not imply coverage it has not earned.

This is a corollary of [ADR-0018](0018-a-static-tripwire-may-stand-in-for-a-probe-that-never-runs.md)
rather than a distinct pattern: a static source-text scan standing in for a runtime property, ceiling
disclosed at the point a reader would look. It differs only in what the property protects — ADR-0018's
tripwires guard a shipped invariant; this one guards the precondition for *not shipping* a surface at
all.

## What this rests on

The first version of the test passed while the invariant was dead: it matched a bare `loadSession()`
token rather than the binding that feeds `session.clear()`, so hoisting `session` to module scope while
leaving any `loadSession()` call in the body stayed green. The tightened test was then calibrated against
four mutations — plain hoist, inserted `await`, hoist-with-a-residual-call-left-behind, and a
`Promise.resolve().then()` wrapper — each confirmed to fail, and the suite confirmed to restore to
164/164 passing. Without that calibration, a test that measures nothing and a test that measures the
right thing produce the identical green.

## The fact that would reopen this

Any edit making the clear path async, hoisting the `loadSession()` binding out of `requestClear`, or
adding a synchronous session writer between the binding and the wipe. At that point the branch becomes
reachable, the notice becomes mandatory, and the owner must approve a fourth `refusalCopy` string. The
test exists to make that moment loud instead of silent.
