# ADR-0026 — A set we do not own is guarded at authorship, not by a scanner

Date: 2026-08-21 · Status: accepted · Issues: [#53](https://github.com/warischa/watduang/issues/53) · [#29](https://github.com/warischa/watduang/issues/29)

## Context

ADR-0025 gave this repo a citation gate that converges: it polices what a push adds to tracked files,
and that set is ours. It is blind to GitHub issue bodies, and #53 proved the rot class survives there —
an acceptance criterion cited a line range that had moved twice, so it became a criterion nobody could
evaluate, and a criterion nobody can evaluate quietly becomes a criterion nobody ticks. A scan of every
open issue body found 12 citations, 9 of them rotted.

The obvious repair is to point a scanner at issue bodies. It does not converge. GitHub owns that set and
mutates it off-push: `gh issue edit` fires no CI, so a body can rot between two green builds and nothing
ever runs again. Extending the gate buys a check that is green whenever it happens to run and silent the
rest of the time — the shape ADR-0016 and ADR-0019 already refused.

## Decision

Guard the bounded set we do own: **authorship**. `docs/agents/issue-tracker.md` bans line-number citations
in issue bodies, issue comments, and acceptance criteria. Every agent routes through that file before
touching the tracker, so the ban binds when a body is written rather than after.

One exception, conditional: narrative prose — in a body or in a comment — may cite lines if it names the
commit they were pinned to. A record of where a bug was is not a pointer into the current tree. An
acceptance criterion gets no exception, because it has to stay evaluable after the tree moves.

The exception covers comments deliberately. Reporting rot means quoting the rotted citation, so a
comment-wide ban would have made this session's own diagnostic comment illegal — a rule that voids the
work of applying it.

## Consequences

The gate is not extended, so nothing new can fail CI and nothing new can go quietly green. The guard is a
rule an agent reads rather than a check that runs, and its coverage is exactly the set of authors who read
`docs/agents/issue-tracker.md`.

A second rot class sits beside this one and neither gate can see it: #53's criterion 5 said "fails on the
current one", which meant the pre-fix tree when written and inverted the moment the fix landed. No line
number is involved, so pattern-matching cannot catch it. Anchor a criterion to a commit, never to "current".

**What would change this:** an issue body authored by a path that does not read `docs/agents/issue-tracker.md`
— the owner typing one by hand, or a skill carrying its own tracker instructions. That makes the ban
non-binding and the set unowned after all, and the question reopens.

Declined this session, owner's call: extending `added-lineno-citation-check.mjs` to scan issue bodies.

## Outcome — 2026-08-22: the reopening fact is CONFIRMED

Probed rather than recalled. The ban lives under this heading in `docs/agents/issue-tracker.md`:
"Citations in issue bodies: symbols, never path:line". Its imperative names **no addressee** — it binds
whoever reads the file, not agents specifically.

**Nothing enforces it on issue bodies.** The only workflow triggers on `push` and `pull_request`; there
are no non-sample git hooks; no scheduled job reads the tracker; and `added-lineno-citation-check.mjs`
draws its entire input from `git diff` and `git ls-files`, so an issue body is structurally unreachable
to it.

Two corrections to how this ADR was being cited:

1. The binding is conditional on **reading**, not on being an agent. An agent that never opens the
   tracker doc is exactly as unbound as the owner typing an issue by hand. The prediction above was
   right about the mechanism but understated the set.
2. It does not converge. Rule-text patches converge over readers; readership is unowned and growing.
   That is the same non-convergence ADR-0016 refuses and ADR-0025 sidesteps by scoping to a diff we own.

The same session produced independent evidence that the underlying rot is real rather than theoretical:
a pre-existing citation in `docs/agents/capture-freshness.md` was found already pointing at the wrong
lines, because gh#50 inserted an assignment that pushed the described calls down. The prose still read
as correct. The diff-scoped gate could never have caught it, because the line was never an added line.

**Still open, and now an owner decision rather than a prediction:** whether to build an enforcement path
or accept the ban as a convention with its coverage stated honestly. Carried in `SESSION-HANDOFF.md`.

## Outcome — 2026-08-23: the owner ruled, and the question is no longer open

The paragraph above marked the convention-vs-enforcement choice as still open and reserved for the site
owner. The owner ruled on 2026-08-23: **accept the ban as a convention, with its coverage stated
honestly.** No enforcement path will be built for issue bodies.

The reason survives the ruling and is the one this ADR already gives: the guarded set is "whoever writes
an issue body", which this repo does not own. `added-lineno-citation-check.mjs` takes its whole input
from a `git diff`, and an issue body is never in one — so no gate reachable from this repo could see the
rule broken even if one were written.

Recorded in `docs/agents/issue-tracker.md`, where an author will actually meet it.
