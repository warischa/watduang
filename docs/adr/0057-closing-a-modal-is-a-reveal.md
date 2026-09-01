# ADR-0057 — Closing a modal is a reveal

Date: 2026-09-01 · Status: accepted · Related: [ADR-0017](0017-two-sets-not-one-the-gate-covers-every-button.md), [ADR-0055](0055-the-play-route-directory-is-the-protected-region.md), gh#187, gh#170

## Context

[ADR-0017](0017-two-sets-not-one-the-gate-covers-every-button.md) requires that every button be armed
on every render, and grants exceptions only on the gate's own premise — a legitimate sub-400ms tap —
never on how bad the harm would be. Its Decision says "in all four games". It was written when there
were four; there are now eleven play routes.

Three routes shipped a comment arguing that a modal's close path needed no re-arm, "because nothing
is rebuilt". That reasoning was wrong on its own terms. The rebuild was never the hazard. **Closing
the modal is itself the reveal**: the control behind it is already enabled, its arm window expired
long ago, and the expiry is precisely why a second contact fires it. Those three routes —
`dice-loser`, `cannon-flag` and `how-close-is-near` — were corrected on 2026-08-31, each arming inside
a shared closer so that close, cancel and confirm all pass through one call.

The remaining eight were left alone at the time, because changing eleven routes' close behaviour with
no ADR would have been a silent design change. A read-only survey on 2026-09-01 measured what those
eight actually do, and corrected the assumption that had been carried forward:

- The **confirm** branch already re-arms on all eight, either directly or through a rebuild render
  that arms.
- What is bare is the **close and cancel** branch, plus the rules, help and avatar-picker closers.
- So the same dialog is guarded on one button and unguarded on the two sitting beside it. A
  double-tap on cancel lands its second contact on whatever the dialog was covering — a begin
  control, a row-remove control, a count pill, an avatar chip.

Nothing recorded this as an accepted ceiling. Each route's `arm-reveal-paths` test enumerates reveal
*receivers* — the places that write `innerHTML` or `style.display`. A closer that only hides a modal
writes neither, so it falls outside what those tests are able to see. The class was invisible to the
instrument built to find it.

## Decision

**Closing a modal is a reveal, and ADR-0017 gates it.** Every close, cancel and confirm path that
re-exposes a control arms that control, on all eleven routes.

Owner ruling, 2026-09-01, on gh#187. The alternative — recording the eight as an accepted ceiling —
was put to the owner with its cost and declined.

Two constraints on how it is implemented:

- **Each route keeps its own modal idiom.** A route arms in its own vocabulary; it does not import a
  sibling's markup or helper to make the eleven look uniform. Uniform *behaviour* is the requirement,
  not uniform code.
- **Every fix is pinned by a test that was observed red with the arming call removed.** A pin never
  seen to fail is not a pin — and the existing receiver-based tests cannot see this class, so the new
  pins must not be built on that mechanism.

## Consequences

- Eight routes change: `cursed-number`, `freeze-tap`, `pinocchio-luck`, `power-meter`, `short-stick`,
  `timebomb`, `wire-snip-panic`, `zero-trigger`.
- **A first tap is swallowed after every dismissal.** This is accepted, and it is the same cost
  ADR-0017 already accepts everywhere else. Consistency with rule 1 is what buys the anti-rot
  property; a per-route judgement about which dismissals "feel safe" is exactly the reasoning that
  produced the false comment above.
- Two closers on `cannon-flag` and `power-meter` are unreachable because `overrides.css` hides their
  test modals outright. They are out of scope, and the reason is CSS, not design — if that CSS ever
  changes, they come back into scope.
- ADR-0017's "all four games" wording is superseded here. The rule covers every play route, and the
  route set is derived, never hand-listed.
