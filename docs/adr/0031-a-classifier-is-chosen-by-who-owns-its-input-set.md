# ADR-0031 — A gate's classifier is chosen by who owns its input set

Date: 2026-08-25 · Status: accepted · Issues: [#72](https://github.com/warischa/watduang/issues/72) · extends [ADR-0030](0030-a-fixture-must-not-be-sourced-from-the-artifact-it-tests.md), [ADR-0026](0026-a-set-we-do-not-own-is-guarded-at-authorship.md)

## Context

Two gates carried a pin: a precondition check that reds when comment syntax appears inside a quoted
value, because the textual comment-stripper each one runs silently depends on that not happening. Both
pins decided "am I inside a template literal?" by counting backticks on a single line. That misses a
`//` on an interior line of a multi-line template, where the line itself carries no backtick at all.

The obvious repair — carry the count across lines — was available to both, and gh#72 had already
refused to merge the five strippers in this repo into one shared implementation, on the ground that
comment grammar is language-owned: one incomplete shared stripper would make a single ceiling
load-bearing in five gates with five different preconditions.

The question this ADR answers is narrower and was not settled by that refusal: given that the gates stay
separate, does each one get the same hand-rolled fix?

## Decision

**No. The mechanism follows the ownership of the input set, so the two gates now differ deliberately.**

The gate scanning `src/games/*.ts` routes classification through the TypeScript compiler. That scan set
is pure TypeScript, contributor-authored, and grows with every new game — a set we do not own and cannot
enumerate. The compiler owns it exactly, so the classification converges: interior template lines,
escaped backticks, interpolation nesting and regex literals all stop being open rungs at once, rather
than one at a time. `typescript` was already a declared devDependency, so this cost nothing to adopt.

The gate scanning the player-setup component keeps a hand-rolled walk, now carrying state across lines.
Its input is one file we author, in mixed HTML and TypeScript grammar that the TypeScript scanner
mislexes. Its residual is bounded the way ADR-0026 bounds this class: guarded at authorship, because the
set is one file, not a growing one.

## Consequences

The hand-rolled walk **does not converge, and its disclosure says so.** It retires "interior template
line" and creates a new rung above it — a lone backtick that is not a template delimiter, in a regex
literal or in HTML text, inverts the state for everything after it. That is acceptable only because the
scan set is a single authored file; it would not be acceptable for a set contributors extend.

Two gates that look like they should share code now deliberately do not, and a future reader will be
tempted to unify them. The reason they differ is not style — it is that one input set has an owner who
will keep it correct and the other does not.

**A convergence claim is only as strong as what it rests on.** The compiler route reads a property of
the parsed source that is not part of TypeScript's public API. That is disclosed in the gate, and the
guard around it fails closed, so the day the property disappears the gate stops rather than silently
classifying nothing. "Converged" therefore means converged against a dependency we do not control the
stability of — which is still strictly better than converged against a grammar we hand-rolled.

**The fix falsified three disclosures, one written earlier in the same session.** Correcting the
mechanism rewrote what was true about it, and a sentence claiming the precondition was pinned turned
out to cover only half of it — block-comment delimiters inside a quoted value were the same
blank-live-code hazard and were not classified by either gate. That was found by review, reproduced end
to end (a genuinely ungated control vanished from the stripped text while the scan printed a clean
verdict), and closed in both gates. The general form: when a fix changes what a mechanism covers, every
sentence describing that coverage is unverified until re-read against the new code, including sentences
written minutes earlier as part of the same fix.
