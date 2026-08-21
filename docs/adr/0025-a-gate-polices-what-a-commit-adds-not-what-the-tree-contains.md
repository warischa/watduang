# ADR-0025 — A gate polices what a commit adds, not what the tree contains

Date: 2026-08-21 · Status: accepted · Issues: [#57](https://github.com/warischa/watduang/issues/57) · [#59](https://github.com/warischa/watduang/issues/59)

## Context

`check-citations.mjs` validates only Markdown targets, so a citation pointing into a source file was
checked by nobody. Two rotted silently in one session: ADR-0023 pointed at what had been the `clear()`
signature and became a comment inside `write()`, and a unit test pointed at a call that had moved. Both
were found by adversarial review. A later commit re-anchored roughly 47 citations to durable symbols,
which fixes the instances but not the regression.

The obvious guard is a tree-wide ban on the fragile form. It was measured before it was built, and the
measurement killed it: **182 genuine citations already exist** — 69 in the sessions archive, 25 under
the verification evidence tree, 88 across 29 other files.

Two of those cannot be converted at all, and this is the part that decides the ADR:

- `gh13-real-device-script.md` states the citation form as its own contract, in its own text: every
  claim it makes is anchored to a file and a line for whoever verifies it later. Converting it rewrites
  a verification record's stated method.
- `adr-0010-findings.md` has a Supersession section that explicitly freezes a paragraph's numbers and
  says not to reuse them, because they calibrate a mechanism that has since been removed. Re-anchoring
  that paragraph to a durable symbol would make a frozen record describe today's code instead of the
  superseded state it exists to preserve. That is falsifying the record, not fixing a pointer.

A gate firing on 88 pre-existing lines gets switched off, and a grandfather list that size decays into
noise. Both failure modes have the same root: the set being policed is "every citation that already
exists", which we do not own and cannot shrink.

## Decision

**The gate scans only the lines a push adds.**

The hazardous form is still what it detects — this keeps ADR-0016's inversion, where the safe shape is
marked and the hazardous one is negated. What changes is the *scope*: the set becomes "what this commit
adds", which is finite, owned by the commit under review, and needs no allowlist. It converges on the
first run, where the tree-wide version converges never.

Frozen records then need no exemption at all, because nobody is editing them.

## Consequences

**Green means "this push added none", never "the repo has none".** That is stated as a ceiling in the
script header rather than implied, per ADR-0019.

**A red is a decision point, not a speed bump.** CI runs on push, so a red blocks that push's deploy
only; the next push diffs itself alone, the offending line is by then part of the base, and deploy
resumes with it in the tree. Diff-scoping buys convergence at this price.

**An empty scan is never a bare zero.** A genuinely empty range says the run proved nothing — that is
the tag-push and force-push signal. A push touching only excluded records says nothing policed was
scanned. Conflating the two would print "proved nothing" on every session-save commit and train readers
to skim past the one marker the force-push case depends on.

**Full history is required at checkout, not incidental.** A shallow clone has neither base revision, so
the gate would fail closed on every run.

Two known holes are tracked in [#59](https://github.com/warischa/watduang/issues/59) and were left
unfixed deliberately: that artifact's adversarial review budget was spent at two rounds, and the
exemption logic is exactly the part both rounds found bugs in.
