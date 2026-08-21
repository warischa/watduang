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
