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

**2. A positive-presence check strips comments first; a negative-presence check must not.** The two
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
