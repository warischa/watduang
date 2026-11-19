# ADR-0080 — Letter and word event rounds play half-cut only, on one 14-digit round code

Date: 2026-11-19 · Status: accepted (owner rulings 2026-11-19, recorded on gh#311) ·
Relates: [ADR-0079](0079-the-final-round-code-carries-the-prize-count.md) (the phase-1 code lengths), gh#300, gh#306 (cards half-cut ruling), gh#311, gh#322, gh#323

Evidence: [`gh322-word-round-2026-11-19/README.md`](../verification/evidence/gh322-word-round-2026-11-19/README.md) · [`gh323-scripted-cut-2026-11-19/README.md`](../verification/evidence/gh323-scripted-cut-2026-11-19/README.md)

## Context

gh#311's design comment asked for match polarity ("match = survive" or "match = out") drawn at random each round, switchable by the MC, with the composition engine holding exact cuts under both polarities. With one stored deal, the survivors under one condition are M or n − M, so the cut is exact under both polarities only when n = 2·keep (measured: 11 of 273 (n, keep) configurations, all n = 2·keep). On any other cut, some players know their fate from their dealt word before the draw — the exposure gh#306 already ruled out for cards on 2026-11-13.

## Decision

1. **Event rounds of the letter and word games play only half-cut rounds** (live = 2 × keep), as cards do. Polarity stays random and switchable until the rule draw. Games 2–4 (multi-step reveals) use two candidate scripts plus a rule tap, so no phone holds the ending before the reveal.
2. **Word rounds (games 1, 5, 7) and scripted rounds (games 2–4) share one 14-digit code:** seed 5 · cut 3 · bank revision 1 · kind 2 · pool 1 · format 1 · Damm check 1. 14 is the shortest length at least two digits away from every phase-1 length (7, 9, 12), so a single inserted or deleted digit cannot turn a phase-1 code into a word code. Measured: 0 of 6,408,296 single edits accepted across kinds.
3. **The code carries `BANK_REVISION % 10`;** a phone on another revision refuses (`stale-bank`) and never deals. A test caps `BANK_REVISION` at 10 under the current format digit; past it, the format digit is bumped.

## Consequences

- Word games compete with cards for the one or two half-cut rounds a schedule offers (200 names → rounds 1 and 2; 150 → rounds 3 and 4; 37 → round 2 only).
- Players type 14 digits per word round, up from 9 or 12.
- After a format bump, an older page reads a new code as mistyped, not as `stale-bank`.
- Rejected: a polarity per candidate outcome (it doubles the word quadrants needed); a 2-digit revision field (15 digits for a gap of 10+ bank deploys between page loads).
