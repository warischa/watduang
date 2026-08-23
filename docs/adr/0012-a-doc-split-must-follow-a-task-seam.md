# ADR-0012 — A doc split must follow a task seam, not section size

Date: 2026-08-16 · Status: accepted · Supersedes nothing · Related: [ADR-0009](0009-a-dod-box-whose-proof-set-we-do-not-own-is-mis-scoped.md)

## Context

`docs/agents/browser-verification.md` was 15270B against the 12288B house doc budget and failing
`check-budgets.sh`. The queued fix, recorded in the prior session's handoff, was "split the traps
out" — chosen because `## Seven traps that produced wrong answers here` was the heaviest section at
6190B.

Heaviest-section-wins is the obvious rule and it is wrong.

## Decision

**Split where the reading tasks divide, not where the bytes are.** When a doc must shrink, identify
which sections a given routed task actually reads, and cut between two tasks — never through the
middle of one.

## Why

The byte budget is a **proxy**. The cost it exists to control is context-per-task-route: how many
bytes an agent ingests to complete one job it was routed here to do. Bytes-per-file and
bytes-per-route only coincide when a file serves one task.

`browser-verification.md` served two:

- The **seven traps** are the run-time payload (as of this decision — see the 2026-08-23 amendment
  below for how the payload was later split further). `CLAUDE.md` routes any browser-proving work
  here first, and the traps are what that agent must have in hand while driving. Moving them would mean
  every such reader follows a pointer and opens the second file too — total ingest *rises*, while
  `check-budgets.sh` reports green. The gate passes and the cost it proxies gets worse.
- The **capture-freshness rules** are consulted at a different moment, by a different question:
  does an existing committed capture still hold, at review or citation time. Nothing in the driving
  workflow routes into them (verified: the freshness vocabulary appears nowhere in the trimmed doc
  except the pointer line itself).

So the freshness section was the only cut that lowers real cost. Per-drive ingest went 15270B →
11579B, genuinely down, rather than 15270B → 11.5KB + a second file every reader also opens.

## The general form

This is [ADR-0009](0009-a-dod-box-whose-proof-set-we-do-not-own-is-mis-scoped.md)'s shape applied to
documents. ADR-0009 says a DoD box whose proof set we do not own is mis-scoped. Here: **a gate whose
measured set is a proxy for a set you do own can be satisfied without touching the real one.** The
repo owns both the pointer and the doc, so context-per-route is boundable — but only a cut along a
task seam bounds it. Ask what set the number enumerates before optimising the number.

## Consequences

- A doc-budget failure is not a formatting problem. It requires knowing who reads the doc and why.
- Splitting always-read content to green a gate is explicitly a wrong fix here, and should be named
  as such if proposed again.
- `check-budgets.sh` gates one doc per invocation; there is no repo-wide run. That is why this file
  sat over budget through several sweeps, and why two other docs were found failing the same day
  (`docs/site-owner-checklist.md`, `docs/adr/0004-*.md`). The absence of a sweep is the reason, not
  anyone's oversight.
- `browser-verification.md`'s headroom at the time of this decision was tight enough that the next
  trap recorded there would likely force this decision again — which it did (see the 2026-08-23
  amendment below). Current headroom is whatever `~/.claude/scripts/check-budgets.sh
  docs/agents/browser-verification.md` reports now, not a number fixed in this ADR.

## The fact that would change this

If a browser-driving agent does in practice consult freshness rules mid-walk — for example if the
workflow ever opens by checking whether an existing capture already covers the box — then the seam
is false, both files become always-read, and the honest answer becomes declaring a budget for this
file rather than splitting it at all.

## Amendment — 2026-08-23

`browser-verification.md` hit its ceiling again and was split a second time (commit `59c792b`),
along the same task-seam rule this ADR states, not by section size — the commit message names it
directly: "the traps split by task moment, keeping their original numbers so inbound citations still
resolve." The seven traps this ADR describes as one run-time payload are now two: traps that fire
while **driving** a probe stayed in `browser-verification.md`; traps that fire while **judging** a
capture moved to `docs/agents/interpreting-browser-captures.md`. The reduced-motion verification task
moved to its own file, `docs/agents/reduced-motion-verification.md`. Trap numbers were kept stable
across the split so existing citations into them still resolve.

The general form still holds — this second cut follows a task moment (drive vs judge), not a byte
count. Any byte or headroom figure recorded above should be read as a snapshot at the time of the
original decision, not a claim about the present tree.
