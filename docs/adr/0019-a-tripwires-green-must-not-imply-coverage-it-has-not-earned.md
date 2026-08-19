# ADR-0019 — A tripwire's green must not imply coverage it has not earned

## Context

ADR-0018 established that a static tripwire may stand in for a probe that never runs, provided it names
what it cannot prove. Closing gh#43 applied that rule to the eight remaining browser probes and produced
four tripwires. Two things happened that ADR-0018 did not anticipate, and both turn on the same thing:
what a green run *tells a reader*.

**First.** A cheap, convergent tripwire was available for `scripts/adslot-wheel-delay-probe.mjs` — fail if
`SPIN_MS` in `src/pages/tool/wheel.astro` is absent or drops below 500. The pattern set is one constant we
own, so it converges, and by ADR-0018's letter it qualified. It was rejected anyway. That guard fires only
if someone edits a constant nobody edits, while the regression that would actually reintroduce the hazard —
a `render()` that removes rows instead of appending the finished marker, pulling the ad slot up under a
finger — leaves it green. Shipping it would have added a step to `ci.yml` whose green meant almost nothing,
next to three steps whose green means a great deal.

**Second.** Three of the four tripwires, written independently, shipped the same bypass: a check asserting
"X must be present" matched against unstripped source. Commenting out the live call left the text in the
file, so the assertion stayed satisfied. Reproduced directly: commenting out `cleanup.push(armAllButtons(stage))`
in `src/games/pick-loser.ts` left `scripts/arm-gate-coverage-check.mjs` exiting 0, with every button in that
render function shipping ungated. Three authors, three files, one trap — that is a systemic hazard, not a slip.

## Decision

A tripwire is worth shipping only if its green is honest. Two rules follow.

**1. Reject a tripwire whose disclosed ceiling swallows the likely regression.** Naming the limit is
necessary but not sufficient — ADR-0018 stops one step short here. If the edit most likely to reintroduce
the hazard is on the wrong side of the ceiling, the gate is net-negative: it costs a CI step, and it buys a
green that a future reader will read as coverage. Prefer an honest manual note at the invariant's definition
site. `scripts/ad-slot-grid-probe.mjs` and `scripts/adslot-wheel-delay-probe.mjs` are recorded that way.

**2. Both directions strip comments first — a positive-presence check so commented-out text cannot
satisfy it, a negative-presence check so commented-out text cannot trip it.** The two
directions are opposites and both must hold at once. "This required thing must appear" has to ignore
commented-out text, or commenting out the live line satisfies it. "This forbidden pattern must not appear"
has to keep ignoring comments, or a comment that merely mentions the pattern trips it. Any tripwire making
both kinds of claim needs both behaviours, and a selftest proving each.

## What this rests on

**A gate is calibrated by the edit it is meant to catch, not by the pattern it happens to match.** Every one
of these bypasses passed a both-ways selftest built from the author's own fixtures — the fixture and the
checker shared an assumption, so they agreed. What caught them was planting the realistic careless edit
(comment out the call, widen the argument, delete the marker, invert the selector) into the *real* tree and
demanding red. That is the check worth running, and it is cheap.

**"At most one" is not "exactly one".** `scripts/stable-exit-markers-check.mjs` originally skipped the file
holding the only legitimate `data-stable-exit` marker, and asserted only that no *other* file carried one. A
refactor dropping the attribute would leave zero markers and a green gate — the inverted-guard pattern fails
open unless the guard also asserts its own set is non-empty. An inverted guard must count, not just exclude.

## Consequences

- Four tripwires are wired in `ci.yml` before Build: leave-confirm, arm-gate coverage, stable-exit markers,
  roster lock structure. Each names its ceiling in a `ponytail:` header, and none claims its probe's verdict.
- Two probes stay manual by decision, not by neglect, and say so at their invariant's definition site.
- Each tripwire's exception set stays closed and each entry cites an owner decision. That is unchanged from
  ADR-0016 and is what keeps these from becoming suppression ledgers.
- The textual comment-stripper is itself a ceiling, and this was written down wrong the first time. The
  original text claimed no scanned file held a `//` inside a string literal. One does:
  `'https://schema.org'` in `src/layouts/GameLayout.astro`, a file `stable-exit-markers-check.mjs`
  scans. A blanket line-comment strip blanked from that `//` to end of line, so a stray
  `data-stable-exit` sharing the line was invisible and the gate passed — a measured fail-open, found
  by checking the claim instead of trusting it, after this ADR had already shipped.
  The rule is now narrow: `//` counts as a comment only at the start of a line. Tracking quote state
  was considered and rejected — an unpaired apostrophe in prose would open a string that never closes
  and swallow live markup, which trades this hole for a worse one. The residual is a false positive on
  a trailing `//` comment that mentions the attribute; it fails safe, and a selftest calibrated both
  ways now pins the behaviour. The TypeScript parser `scripts/thai-comments.mjs` depends on remains the
  upgrade path.
- A closing verdict is not a stopping point. Both of the above were found *after* gh#43 was closed, by
  running the ADR's own rule against the gates the ADR was written to justify.
- Rule 2's heading contradicted its own body and had to be corrected here. The heading read "a
  negative-presence check must not" strip comments; two sentences below, the body of the same rule says a
  forbidden-pattern check "has to keep ignoring comments, or a comment that merely mentions the pattern
  trips it" — and gives the reason. The body governs: both directions strip. gh#47's
  `scripts/csp-inline-check.mjs` is rule 2's first exercise — three negative-presence classes (`on*=`
  handler attributes, `javascript:` in `href`/`src`/`formaction`, an outright `srcdoc` ban) matched over
  blanked HTML comments, with both directions pinned by selftest: a hazard mentioned only inside a comment
  trips nothing, and a live hazard sharing its line with a comment still fails. This bullet supersedes the
  **Scored** line at the end of this file on both counts — that line restated the uncorrected heading and
  recorded rule 2 as never exercised.

## Outcome — S2026-08-19

The rule was pointed at the gates this ADR was *not* written to justify. It kept finding things, which
is the result worth recording.

- **gh#44** — `check-citations` printed "all citations resolve" while an entire citation form was
  invisible to it. Rule 1's shape exactly: a green implying coverage it had not earned. Closed by
  disclosing three ceilings rather than widening the match. Widening was rejected because the set it
  would enumerate — the ways prose can separate a path from a section sigil — is owned by whoever
  writes the next paragraph in this repo. That is ADR-0016's convergence test applied to the *decision
  procedure*, not only to the guard.
- **gh#45** — the `Unit tests` step exited 0 when its glob matched nothing. "An inverted guard must
  count, not just exclude" turned out to govern a step nobody had classified as a guard at all. Fixed
  and proven red at run level.
- **gh#46** — `no-nav-in-stage-check` and `arm-gate-coverage-check` hardcode a seven-entry
  `TARGET_FILES` list. A seventh game carrying both violations those gates exist to catch exits 0 on
  both, confirmed against a positive control.
- **gh#47** — both CSP gates are blind to the likeliest edit that would break ads.

Two refinements this ADR did not anticipate.

**The rule governs a gate's success message, not only its assertion.** Both gates in gh#46 print
`TARGET_FILES.length` modules "clean" — the size of their own hardcoded list, not a count of what was
checked. With a seventh game planted the number happens to read 7, so the line asserts precisely the
coverage that is missing. A green is a claim; so is the sentence next to it.

**A ceiling disclosure is itself an artifact that goes stale.** Naming a limit dates from the moment
it is written, and the edit that invalidates it is the same edit nobody remembers to re-read the
header for. The three ceilings in `check-citations.mjs` are each pinned by a selftest case for that
reason: widen the match without updating the header and the pin goes red first.

**Scored:** [the rule 2 clause in this paragraph is superseded — see Consequences] rule 1 confirmed
four times. Rule 2 (strip comments for a positive-presence check, never
for a negative-presence one) was not exercised — no new comment-sensitive check shipped this session,
so it remains as stated, untested since ADR-0019 was written.
