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

The set of causes is open. Closing #59 added one the original two had been covering for: a push that
only REMOVES lines adds no citation to police, yet was printing the force-push marker on every routine
deletion — the same dilution by a different route. The review round after it added another: a push
carrying only binary or mode changes never reaches a hunk at all, and this repo commits OG images
routinely. Each distinct cause earns its own sentence, and a new one gets a new sentence rather than
being folded into the nearest existing one. No running total is stated here on purpose — a count in the
ADR and a count in the script drift apart, which is how this gate's prose has failed before.

**Full history is required at checkout, not incidental.** A shallow clone has neither base revision, so
the gate would fail closed on every run.

**Rename detection is off — and the reason for it changed under review.** `scan` passes `--no-renames`.
It was added because a `git mv` out of the sessions archive laundered a citation and printed green. The
round that followed then replaced the diff parser with a state machine tracking the `---` and `+++`
paths separately, and that alone closed the cross-funding: a rename hunk is headed `--- a/<old>` /
`+++ b/<new>`, so removals file under the old path, where they belong. The flag stays for two narrower
reasons — it makes a cross-file move re-present its citations for review, which is what the header's
ceiling promises, and it suppresses copy detection when a user's git config turns that on. The first
version of this paragraph asserted the original mechanism after the parser had already superseded it.
That is recorded rather than quietly corrected, because it is the same drift the closing paragraph
names, committed by the reviewer who wrote that paragraph.

Both holes tracked in [#59](https://github.com/warischa/watduang/issues/59) are now closed — the owner
authorized reopening the artifact after its review budget had been spent at two rounds. Reopening cost a
third round, which confirmed four defects, and **three of them were a comment asserting something the
code did not do**: the ceiling claiming a cross-file move trips, `POLICE_INFLIGHT`'s "flip this line,
nothing else" (flipping it red the selftest CI runs first), and `filesInDiff`'s claim to hold every file
the range touched. That is this artifact's repeat failure mode across all three rounds. No gate in this
repo compares prose to behaviour, so the only defence is that every claim near this script is treated as
a finding until re-read against the code it describes.
