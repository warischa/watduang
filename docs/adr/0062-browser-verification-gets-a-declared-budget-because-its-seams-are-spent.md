# ADR-0062: browser-verification.md gets a declared budget, because every remaining section is drive-time

- Status: accepted — owner ruling 2026-09-08, session S2026-09-08#1 (repo-policy change; the ruling
  is recorded in that session's handoff entry, because the override line records policy and does not
  create it)
- Date: 2026-09-08
- Tickets: ADR-0012, ADR-0009

## Context

`docs/agents/browser-verification.md` is at 12155B against the 12288B default doc budget — 133B of
headroom. `CLAUDE.md` routes every browser-proving task into it, so it is opened by an agent that is
about to drive, or is already driving, a headless probe.

ADR-0012 governs how it may shrink: split where the reading tasks divide, not where the bytes are.
It has been split along that rule three times already — the reduced-motion task to
`reduced-motion-verification.md`, the judge-a-capture traps to `interpreting-browser-captures.md`,
and the capture-freshness rules to `capture-freshness.md`. Two of those three left a pointer stub
behind, so inbound citations and heading scans still resolve; the judge-a-capture split left none.

ADR-0012's own "The fact that would change this" names this outcome in advance: if no true seam is
left, "the honest answer becomes declaring a budget for this file rather than splitting it at all."
This ADR is that consequent, not a reversal of it.

## What was measured

Section weights, `LC_ALL=C awk` over `^## ` boundaries, code blocks included, heading lines excluded
(snapshot 2026-09-08 — re-measure before trusting any figure here, per ADR-0012's amendment):

| section | bytes |
|---|---|
| Traps that fire while setting up or driving a probe | 4468 |
| `driver.mjs` usage | 1487 |
| Driving the site in a headless browser | 1453 |
| `cdp.mjs` usage | 1268 |
| preamble above the first heading | 1130 |
| Setup | 884 |
| When a committed capture goes stale (pointer stub) | 485 |
| Seed through the trigger, never past it | 398 |
| Reduced motion (pointer stub) | 165 |
| Rule | 137 |

The first six are drive-time payload and ADR-0012 forbids moving them. The two stubs exist only to
keep citations resolving and cannot move again. That leaves two candidates, 535B between them.

**The seam test, run the way ADR-0012 ran it for the freshness split** — extract a candidate
section's distinctive vocabulary and grep it against the drive-time region:

- `Seed through the trigger, never past it` — `seed` appears 3 times in the drive region and
  `mid-round` twice: the `sessionStorage`-is-per-tab trap tells a driving agent to seed and observe
  in one tab, and the `driver.mjs` section describes seed-then-observe as two `nav()` calls. The
  vocabulary is threaded straight through the drive path. Not a seam.
- `Rule` — its `infer` and `markup` both appear in the preamble that states why this tooling exists.
  It is the closing instruction to a driving agent that could not run its check. Not a seam, and at
  137B it saves nothing.

**Independently, the arithmetic already rules a split out.** The drive-time region, from the top of
the file through the end of the traps, is 10837B. The two pointer stubs, with their heading lines and
the retained provenance comment, are 732B and cannot leave. A split that moved *both* remaining
candidates out whole would floor the file at 11569B — still above 11264B, and above it without the
pointer stubs those two moves would themselves require. No permitted cut reaches 11KB.

## The cost a split would add, beyond the bytes it saves

Trap numbers in this doc are cited from outside it. Every count below names the command that produced
it, because a count is only true in the scope its command defines — an earlier draft of this ADR
carried two figures from a differently-scoped grep, and both were wrong.

| what | count | command (run 2026-09-08, from the repo root) |
|---|---|---|
| tracked files naming the doc path | 68 | `git ls-files \| xargs grep -l 'browser-verification\.md'`, minus the doc itself |
| tracked files citing a trap number **on the same line as the doc name** | 13 | `git ls-files \| xargs grep -lE 'browser-verification[^ ]*[^A-Za-z]*[Tt]rap [0-9]'`, minus the doc itself |
| tracked files containing any `trap N` text | 19 | `git ls-files \| xargs grep -lE '[Tt]rap [0-9]'`, minus the doc itself |

The 13 are the citations a renumbering would break outright. The wider 19 is the blast radius if a
reader resolves a bare trap number against this file by habit.

**The file's own numbering already has a gap, and that is the argument in miniature.** Its traps run
1, 3, 4, 5, 6 — trap 2 left in the judge-a-capture split and now lives in
`interpreting-browser-captures.md`. The split kept the original numbers precisely so the outside
citations would keep resolving. Closing that gap today would silently repoint every citation of
traps 3 through 6. Renumbering to close a gap left by a moved trap breaks those
citations and reds `check-citations`, which runs inside `npm run ci`. That is the coupling that makes
a trap-level split more expensive than the ~500B it could recover — and it is why all three prior
splits kept their original numbers.

## Decision

Declare a budget for `docs/agents/browser-verification.md` of **14KB**, recorded as one
`budgets: file=14KB` override line in that file citing this ADR. Do not split it again along any
seam currently visible.

**Why 14KB.** With the override line's own bytes counted against the file it governs, the file sits at
12381B under a 14336B ceiling — **1955B of headroom**. The file holds **five** traps across 4468B, so
a trap costs about **894B**, and that headroom is about **two** more recorded traps (1955 / 894 =
2.19). Enough that the next trap does not immediately force this decision to be re-taken. 13KB was
the runner-up and was rejected for exactly that reason: it buys one trap and re-opens this question on
the next one. Anything larger than 14KB stops being a budget: the
number exists to force a routing decision eventually, and a ceiling nothing will reach never does.

## Consequences

- The budget gate on this file now reports against 14336B. A future failure is a real signal again,
  not a formatting problem 133B wide.
- The seam question is closed only against the file's present shape. It re-opens if a *new* task
  moment is written into the doc — a section whose vocabulary does not appear in the drive path is a
  seam, and the grep above is how to find it.
- ADR-0012 stands unamended. Its rule produced this outcome; its own falsifier predicted it.
- The override line records this decision; it is not self-authorising. `check-budgets.sh` documents
  the override as recording prior policy, which is what this ADR supplies.

## The fact that would change this

If the traps stop being drive-time — if a probe harness ever absorbs them as executable checks, so a
driving agent no longer needs them in hand — then 4468B of the file becomes reference material, a
real seam opens, and the budget should be withdrawn rather than raised again.
