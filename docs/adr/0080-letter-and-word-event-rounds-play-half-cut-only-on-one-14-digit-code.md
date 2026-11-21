# ADR-0080 — Letter and word event rounds play half-cut only, on one 14-digit round code

Date: 2026-11-19 · Status: accepted (owner rulings 2026-11-19, recorded on gh#311) ·
Relates: [ADR-0079](0079-the-final-round-code-carries-the-prize-count.md) (the phase-1 code lengths), gh#300, gh#306 (cards half-cut ruling), gh#311, gh#322, gh#323

Evidence: [`gh322-word-round-2026-11-19/README.md`](../verification/evidence/gh322-word-round-2026-11-19/README.md) · [`gh323-scripted-cut-2026-11-19/README.md`](../verification/evidence/gh323-scripted-cut-2026-11-19/README.md)

## Context

gh#311's design comment asked for match polarity ("match = survive" or "match = out") drawn at random each round, switchable by the MC, with the composition engine holding exact cuts under both polarities. With one stored deal, the survivors under one condition are M or n − M, so the cut is exact under both polarities only when n = 2·keep (measured: 11 of 273 (n, keep) configurations, all n = 2·keep). On any other cut, some players know their fate from their dealt word before the draw — the exposure gh#306 already ruled out for cards on 2026-11-13.

## Decision

1. **Event rounds of the letter and word games play only half-cut rounds** (live = 2 × keep), as cards do. Polarity stays random and switchable until the rule draw. Games 2–4 (multi-step reveals) use two candidate scripts plus a rule tap, so no phone holds the ending before the reveal.
2. **Word rounds (games 1, 5, 7) and scripted rounds (games 2–4) share one 14-digit code:** seed 5 · cut 3 · deal revision 1 · kind 2 · pool 1 · format 1 · Damm check 1. 14 is the shortest length at least two digits away from every phase-1 length (7, 9, 12), so a single inserted or deleted digit cannot turn a phase-1 code into a word code. Measured: 0 of 6,408,296 single edits accepted across kinds.
3. **The code carries `DEAL_REVISION % 10`;** a phone on another deal revision refuses (`stale-bank`) and never deals. The deal revision names everything a phone rebuilds from a code: the composition of every word and scripted kind, and the bank it reads. It lives in an append-only registry (`src/prize-round/deal-revisions.json`, one fingerprint per revision); a test hashes what a phone derives from codes across every kind, pool and tap, on the fixture banks and the real banks (the latter through the hash registered for `BANK_REVISION`), and reds when that hash moves without a new entry. Bank content enters as a digest (the one `revisions.json` registers for `BANK_REVISION`), so a bank content change moves the fingerprint; the bank revision number alone does not. The sample is spread seeds plus the edge of every code field; a change touching only a small fraction of rounds the sample misses is owned by review, not the test. `BANK_REVISION` stays as the bank's own bookkeeping and is off the wire. Revisions 1–10 are format 0, 11–20 format 1, and so on; a test holds `CODE_FORMAT` to that rule, and the history gate refuses a rewritten or dropped registry entry.

   *Amended 2026-11-21:* the digit was `BANK_REVISION % 10`. A phone on an older composition then accepted a newer host's game-3 code and rebuilt different cards and draws (gh#328 comment 7035707715; owner ruling 2026-11-20: the mismatch must be refused before game 3 ships). The deal revision replaces it; how is an execution choice under that ruling.

## Consequences

- Word games compete with cards for the one or two half-cut rounds a schedule offers (200 names → rounds 1 and 2; 150 → rounds 3 and 4; 37 → round 2 only).
- Players type 14 digits per word round, up from 9 or 12.
- After a format bump, an older page reads a new code as mistyped, not as `stale-bank`.
- Bank content changes and composition changes share the ten deal revisions of one format digit: a dealable bank edit is also a deal bump, so the format digit moves sooner than bank edits alone would move it.
- A reverted composition appends revision n+1 with the old fingerprint; the revision never decrements, because a published number already names one deal on phones that loaded it.
- Editing the test fixture banks moves the fingerprint and costs a deal revision, though no player sees the change.
- Rejected: a polarity per candidate outcome (it doubles the word quadrants needed); a 2-digit revision field (15 digits for a gap of 10+ bank deploys between page loads).
