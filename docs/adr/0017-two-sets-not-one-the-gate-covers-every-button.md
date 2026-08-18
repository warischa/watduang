# ADR-0017 — Two sets, not one: the gate covers every button, not the consequential one

Date: 2026-08-18 · Status: accepted · Supersedes nothing · Related:
[ADR-0016](0016-a-gate-that-classifies-nothing-converges.md) (narrows how its gate is applied),
[ADR-0014](0014-no-navigation-target-inside-the-stage.md) · Issues: gh#37, gh#42

## Context

ADR-0016 established the arm gate for `short-stick` and `timebomb`, where the harm was sharp and
obvious. Extending it to the remaining four games raised a question ADR-0016 never had to answer:
**which controls get gated?**

Two rules were candidates:

1. Gate every button on every render.
2. Gate only where a ghost tap's harm is unrecoverable; document the rest as accepted.

Rule 2 had real support. gh#37's verdict had already walked all five double-tap pairs on the site
and found exactly one decisive-consumed pair; the other four recover by reproducibility or
triviality.

## Decision

Rule 1 — every button on every render, in all four games. Exceptions are granted **only** on the
gate's own premise, never on how bad the harm is.

## Why — the two rules enumerate different sets

- Rule 2's set is **"games whose harm is recoverable."** Owned by the evolving codebase, and it
  rots: the equivalent ledger went stale twice inside gh#37's own thread. It also rests on unpinned
  properties — love-match's re-pick is byte-identical only while its scoring stays a pure function
  of (a, b, today); pick-loser's redo is trivial only while nobody values the discarded name. One
  refactor flips either silently, and nothing re-derives the ledger.
- Rule 1's set is **"how long after a swap can a ghost contact arrive."** Owned by human double-tap
  physiology, as ADR-0016 argued. A ghost slower than the window degrades into the recoverable
  class rather than escaping the model.

A third set genuinely does need per-control judgement, and it is not harm: **"controls with a
legitimate sub-400ms tap."** That is the gate's own premise, and gating a control where it is false
ships a regression instead of a fix. Those exceptions are listed in ADR-0016 under "Known premise
exceptions"; this ADR does not restate them.

## Consequences

- A button added to any of these four games is gated automatically by `armAllButtons`, with no list
  to remember. That is the anti-rot property rule 2 could not have.
- The cost is a swallowed first tap on controls where nothing was ever at risk — bounded at 400ms,
  failing closed, and the player simply taps again.
- `short-stick` and `timebomb` still pass hand-picked arrays to `armAfterQuiet`, while these four
  gate uniformly. `_arm-gate.ts`'s own header says the module is shared "so the two cannot drift
  apart"; that drift now exists against its stated purpose, and is unresolved.
- Verified with real touch, never `.click()`: 32/32 green on the fix, 11 calibrated red **per game**
  on a pre-fix worktree. Evidence `docs/verification/evidence/42/`. `#lm-reset` is proven
  structurally rather than by touch collision — it is never visible inside an arm window — and that
  gap is disclosed in its evidence file rather than counted as a pass.
- The unit tests were one-sided as first written: they asserted disabled-at-paint and never advanced
  time, so a gate that never armed would have passed them. Rewritten onto `short-stick.test.mjs`'s
  harness, whose `click()` respects `disabled`, plus `t.mock.timers` for both sides of the window.
  Proven by substituting a never-arming stub: exactly four failures, one per game.

## The fact that would change this

A control in these four games acquiring a legitimate sub-400ms tap — a rapid-fire round, a
hold-and-repeat. That does not overturn rule 1; it adds an entry to the exceptions list. What would
overturn rule 1 is the swallowed-first-tap cost being observed to matter in real play.
