# ADR-0020 — A gate fix is itself a new surface

Date: 2026-08-19 · Status: accepted · Issues: [#46](https://github.com/warischa/watduang/issues/46) · [#47](https://github.com/warischa/watduang/issues/47)

## Context

ADR-0019 established that a tripwire's green must not imply coverage it has not earned, and that a
gate is calibrated by the edit it is meant to catch. Closing gh#46 and gh#47 applied that rule and
produced something ADR-0019 did not anticipate: **every fix to a gate opened a new way for that gate to
report green while checking less than it claimed.** Not once — five times in a row, in one session, in
two independently-written scripts.

The chain, in the order it happened:

1. Two gates hardcoded a seven-entry `TARGET_FILES` list, so a seventh game shipped past both. Fixed by
   deriving the set from `src/games/`.
2. A derived set can be empty. A glob that stops matching would have reported everything clean, so the
   fix needed a non-empty assertion — gh#45's shape one level up.
3. Pinning that assertion needed a seam the selftest could drive, so the scripts gained
   `GAMES_DIR_OVERRIDE`. **That seam was a wider hole than the one it closed:** pointing it at a
   directory holding one clean file printed `1 game module(s) clean` and exited 0. The non-empty
   assertion cannot catch it, because 1 is not 0.
4. The seam was refused under CI. The same narrowing capability then turned out to exist on the **argv**
   axis in the sibling CSP gate, which accepted a positional root and printed a green indistinguishable
   from a real scan.
5. Both CSP scripts also ran `main()` at module scope, so an import ran a gate as a side effect. Guarding
   the entry point compared a canonical path against a cwd-joined one — which means **a symlinked
   checkout silenced both gates entirely.** Measured: exit 0 having scanned nothing.

Each link was real, each was caught, and each was introduced by the fix for the previous one.

## Decision

**Treat every edit to a gate as new attack surface on that gate, and calibrate the edit, not just the
original defect.** Three rules follow.

**1. A seam added to test a guard is part of the guard's threat model.** Test seams — env overrides,
argv parameters, injectable paths — exist to let a selftest drive the real code path, which is exactly
why they can also narrow what the real run checks. Any seam that can change *what* a gate scans must be
refused where the gate's verdict is load-bearing (here: under `CI`), and when active it must name what
it scanned, so a narrowed run cannot read as full coverage. Disclosure is not optional garnish; the
success sentence is a claim, per ADR-0019.

**2. A guard whose failure mode is "the gate does not run" must be proven by detection, never by
liveness.** An entry-point guard, a `--selftest &&` prefix, an early return: get any of them wrong and
the gate exits 0 having checked nothing, which is indistinguishable from a passing gate and is worse
than the defect it replaced. Such a change is proven only by planting the real hazard and requiring a
non-zero exit. "Still exits 0 on a clean tree" proves nothing about it.

**3. Prefer converging on the real path over disclosing another ceiling.** The symlink hole could have
been a `ponytail:` header line — a symlinked checkout is not the likely regression, so ADR-0019 rule 1
would have permitted it. It was fixed instead, because realpathing both sides is one line and closes the
set completely, whereas the ceiling would have been the sixth disclosure in a chain that was already
too long. When a fix converges and costs about as much as the paragraph explaining why it wasn't made,
fix it. **Refined by ADR-0029:** this holds where the path converged onto is TOTAL
(realpath). Where it is itself a heuristic carrying its own ceiling, converging can import a new
fail-open — check the ceiling against the guarded set first.

## What this rests on

**The chain does not self-terminate, so "patch until quiet" is not a stopping rule.** Four of the five
links were found by adversarial review or by probing the fix, not by the fix's own tests passing — every
intermediate state had green selftests. The chain stops when each remaining surface is either converged
(a set we own, enumerated) or disclosed and selftest-pinned. That is a property to check, not a feeling
of having done enough.

**A number printed next to a green is a claim and inherits this rule.** Both gh#46 gates printed
`TARGET_FILES.length` modules "clean" — their own list's size, not what was read — and an `existsSync`
skip in the loop meant the sentence could already assert seven after reading six. Fixing the assertion
without fixing the sentence would have left the misleading half shipped.

## Consequences

- The two game gates refuse their target-directory override under `CI` and name the scanned directory
  when it is active. The two CSP gates refuse a positional root under `CI`. All four print counts of
  work performed rather than of intent.
- Both CSP gates' entry-point guards realpath both sides, and a realpath failure falls toward *running*
  the gate rather than skipping it. Pinned by a selftest that invokes each script through a symlink and
  requires a real finding — written before the fix and shown red, then shown red again against a mutant
  with the normalization removed from one side only.
- Calibration is per gate step, not per ticket. Four steps meant four green/red pairs, because the four
  `ci.yml` wirings are the set the change covers — the per-member rule in `docs/agents/ci-verification.md`.
- This ADR is the stopping rule for the next person who hardens a gate here. If a fix adds a seam, a
  guard, or a printed number, that addition needs its own both-ways calibration before the ticket closes.

## What would change this

A gate mechanism with no test seam and no entry-point guard — for example a gate expressed entirely as a
declarative rule a runner evaluates, with no script to import or invoke. The chain above is a property of
gates that are executable scripts taking input; it is not a law about gates in general.
