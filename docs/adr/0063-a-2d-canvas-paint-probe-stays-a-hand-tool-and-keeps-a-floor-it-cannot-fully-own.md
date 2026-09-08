# ADR-0063: a 2D canvas paint probe stays a hand tool, and keeps a floor it cannot fully own

- Status: accepted 2026-09-08, decided in-session (not an owner ruling; the class-scoping half is #224)
- Date: 2026-09-08
- Tickets: gh#205, #224, ADR-0051, ADR-0056

## Why this exists at all

A `deep-reasoner` design pass with a fresh context re-derived this decision from scratch on
2026-09-08 and recommended the opposite of what the code already reasoned, because the rationale
lived only in a probe's header comment and a commit message. The recommendation would have broken a
control in the same breath as adding it. That is the cost of leaving a decision uncited, and it is
the whole reason this ADR is written rather than left in a commit body.

## Decision 1 — the probe stays a hand tool. No CI leg.

`src/play/bangkok-drift/canvas-frames-probe.mjs` is not wired to an npm script, `ci-probes.sh`, or
`ci.yml`, and it stays that way. Grounds, strongest first:

1. **It is the fifth instance of an established class, not an oversight.** Four sibling routes ship a
   canvas probe and each declares itself a manual tool; none is wired.
2. **The WebGL comparison dies on asymmetry, not on cost.** The WebGL pixel lane exists because the
   ordinary browser lane disables the GPU, which makes a WebGL context null — so a WebGL assertion
   inside that lane would be *green by construction*. 2D canvas has no such hole, so the missing-
   instrument problem that justified a second browser does not arise here.
3. **The right unit is the class, not this route.** Ten play routes draw with 2D canvas, five carry a
   hand probe, and none has a lane. A route-specific lane would gate one of ten and add a fourth
   unaudited shell wrapper. The class-wide leg is filed as **#224** and is the owner's to scope.

Cost was NOT the deciding factor and should not be quoted as one: the wall-clock a lane would add
was never measured.

## Decision 2 — `FRAME_FLOOR` stays at 30 frames per 2000ms

A design pass proposed replacing it with `frames > 0`, reasoning that a frame rate is owned by the
browser's compositor, the host scheduler and machine load — so no stable threshold exists (ADR-0056).
**The premise is right and the fix is wrong.** Rejected on three grounds:

1. **The probe's own comment shows 30 was a reasoned trade-off, not an oversight** — it states the
   assertion is that the loop runs rather than how fast the machine is, and it names the very hazard
   of a machine-speed threshold before choosing one.
2. **The reduced-motion leg shares both floors deliberately.** This route scales the simulation and
   never the drawing, so a reduced run that drew fewer frames would be a defect rather than an
   accommodation. `frames > 0` would let a reduced run draw a single frame and pass, erasing the only
   thing that leg measures.
3. **Then it was measured.** The `BD_STOP_LOOP` leg added the same day reports **frames=1** for a
   frozen loop with ink still on the canvas. `frames > 0` would have judged that as drawing
   correctly — the proposed fix would have passed the exact input the proposal asked us to start
   catching. Lowering a threshold to satisfy an ownership argument is still weakening a check.

**The accurate criticism, kept on the record because it is true:** the comment claims an *intent* —
that the loop runs — and 30 frames in 2000ms does not express that intent exactly. It is a
machine-speed number standing in for an ownership-clean predicate.

## Decision 3 — the ownable replacement is named and not built

The predicate this repo genuinely owns is **relative, measured inside one run**: reduced-motion frames
compared against baseline frames from the same run. That removes the machine from the comparison while
keeping the reduced-motion finding intact. It is recorded here and deliberately not implemented,
because the probe is hand-run and no green depends on the current floor.

## What the added control buys, and what it does not

`BD_STOP_LOOP` freezes the animation loop after the countdown and leaves painted ink in place. Before
it, the frame terms of the probe's verdict had **never been observed going red by any control** — the
existing paint-stub blanks the drawing calls while frames keep ticking, so it only ever exercised the
ink terms. The new control does two things at once: it reds the frame terms, and it proves the
coverage term is blind to a frozen loop.

It does not make the probe a gate, and it does not make the floor portable.

## Consequences

- The probe's five legs are recorded with numbers under `docs/verification/evidence/205/`, pinned to
  the route source SHA so a later reader can tell "still valid" from "re-run me".
- The measurement is n=1 per leg on one machine. Anyone quoting it must say so.
- ADR-0056 is not weakened: the ink terms measure pixels this route writes into its own backing store
  and are repo-owned; the frame term is acknowledged as browser- and machine-owned, with its ownable
  replacement named above rather than pretended away.

## The fact that would change this

A 2D play route shipping visibly blank, or #224 landing a registry-driven class-wide ink leg. Either
one folds the ink half into that leg and retires every per-route hand tool — at which point this ADR's
first decision is withdrawn rather than amended.
