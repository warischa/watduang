# ADR-0029 — A convergence inherits the ceiling of what it converges onto

Date: 2026-08-24 · Status: accepted · Issues: [#70](https://github.com/warischa/watduang/issues/70) · refines [ADR-0020](0020-a-gate-fix-is-itself-a-new-surface.md) rule 3

## Context

ADR-0020 rule 3 says: prefer converging on the real path over disclosing another ceiling. Its worked
example was realpathing both sides of an entry-point compare — one line that closes the set
completely.

S2026-08-24#1 hit the case that rule does not cover, and hit it from the inside.

`stripComments()` in `scripts/no-nav-in-stage-check.mjs` walks string state to find comment openers. A
regex literal carrying an unbalanced quote desyncs that walk: it enters string mode at the quote,
resumes mid-string, and a `/*` sitting inside a string literal then opens a false block comment that
blanks live code out of the scan. Fail-open. The hazard was disclosed in prose, with an upgrade path:
"skip regex literals too, which needs the previous significant token to tell a literal from division."

That session then wrote exactly such a token test — `findRegexLiterals()` — for a different purpose:
pinning the precondition so the prose measurement could not rot. Which made the convergence look free.
The expensive part named in the upgrade path now existed. The commit shipped a header telling the next
person to wire it in.

Measured before anyone did: that detector reads the `</a></p>` in markup as a regex literal. Nine such
pseudo-literals across the fourteen `.astro` files in `src/`, and one of them is inside
`GameLayout.astro`'s ADR-0014-mandated `<a href="/games/">` chrome link. Wiring the detector into the
walk would have made the walk skip live markup in the exact file gh#68 widened this gate to reach.

The convergence would have opened the hole it was meant to close.

## Decision

**Before converging, check whether the converged-onto path's own ceiling intersects the set being
guarded. If it does, the convergence imports a new fail-open and the disclosure is both cheaper and
safer.**

ADR-0020 rule 3 stands where the path converged onto is **total** — realpath has no ceiling; it either
resolves or errors. It does not transfer to a path that is itself a **heuristic** with a disclosed
ceiling. "The hard part is already built" is not evidence the hard part is correct on this input set.

A disclosure chosen for this reason must say *why* convergence was refused, naming the measurement.
"Not converged" and "not converged yet" read identically six months later, and only one of them is a
decision.

## What this rests on

**The measurement, not the reasoning.** The pseudo-literal count came from running the detector over
every `.astro` file in `src/`, not from reading it. All nine are quote-free today — by luck, not by
design: any `class="x"` landing between two `</` sequences makes one quote-bearing. The luck is why a
reasoning-only pass would have called this safe.

**A refusal is falsifiable or it is a hunch.** The selftest asserts that markup still reads as a
pseudo-literal, so the day the detector learns to stop at markup, that assertion goes red and the
exclusion gets re-examined instead of outliving its reason.

## Consequences

- `findRegexLiterals()`'s pin covers the `.ts` game modules only, not `STAGE_FILE`, even though
  `findStageViolations()` feeds that file to the same walk.
- The layout is not left unguarded: `findStageViolations()` slices `inner` out of `rawText`, not out of
  the stripped text, so the empty-pin's content check cannot be fooled by a desync at all. Only the tag
  offsets come from stripped text, and a desync that moves them reads `found 0` and fails.
- The upgrade path in `stripComments()`'s header now says to teach the detector to stop at markup
  FIRST, and says what happens if you do not.

## What would change this

A markup-aware regex-literal detector — then the ceiling no longer intersects the guarded set, ADR-0020
rule 3 applies again, and the convergence becomes the right call.
