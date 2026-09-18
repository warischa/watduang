# gh#181 — which routes does the ticket govern? (answered: eight)

This file was drafted when the count looked like an open owner question. It is not. The ruling exists
and has now been read back from the ticket itself. What is left is a wording repair the owner has to
license, and the evidence for it is a table that does not fit in a `next:` line.

## The ruling, read back

**Confirmed** — comment `5553308361` on gh#181, created 2026-09-05T16:49:49Z, opens with:

> Owner ruling 2026-09-05: this ticket covers all eight routes the instrument measured, not the four
> its title names.

It then enumerates the eight and names the three it excludes. The earlier comment `5551876585`
(2026-09-05T12:39:02Z) raised the conflict and explicitly did not resolve it; the 16:49 comment is the
resolution.

**⚠ Authorship cannot discriminate here, and this is the ceiling on the read-back.** All 23 comments on
gh#181 are authored by the `warischa` account — the same account the agent writes through — so author
is no evidence of who decided. The 16:49 text is written in the third person ("The owner took all
eight"), which makes it an agent's *record* of a ruling, not the owner's own words. So: **confirmed**
that the ticket carries this record, one hop closer to source than the agent-written
`docs/verification/evidence/181/README.md` that the question previously rested on; **inferred** that it
records a real owner decision. Quote it by id. Do not write "you ruled".

## Two instruments, not one — this is what the old draft got wrong

The previous version of this file said `how-close-is-near` and `cursed-number` were "never measured at
1440×900" and framed that as a coverage gap. That is true only of one instrument, and the gap is not a
gap — it is the ruling's own exclusion.

| artifact | routes | what it is |
|---|---|---|
| `docs/verification/evidence/203/composition-readings.md` | 11 | gh#203's composition instrument, the one the ruling cites |
| `docs/verification/evidence/181/frame-screen-readings.json` | 8 | `meta` + `results`, all at 1440x900 |

The eight `route` keys in the JSON are **the same eight** the ruling names — verified by reading both
sets, not by counting. The composition table measured all 11, including the two the old draft called
unmeasured:

- `cursed-number` span **0.978**
- `how-close-is-near` span **0.949**
- `wire-snip-panic` span **0.942**

The ruling excludes exactly these three, in its own words, as the routes that **fill the frame**. They
were measured and ruled out of scope, not missed. The 2026-09-17 comment already made this same
correction for `cursed-number` in isolation ("that is true only of the eight-route 1440x900 capture
set"); the old draft repeated the uncorrected claim.

## The strongest evidence for restating, stronger than the overlap arithmetic

Under "four", box 1 — *All four fill the window at 1440×900* — is **half-satisfied by routes that were
never narrow**. Two of the title's four are `how-close-is-near` at 0.949 and `cursed-number` at 0.978.
They already fill. A four-route scope therefore does not measure the problem the ticket exists to fix;
it spends two of its four slots on routes that pass by construction.

The overlap between the two sets is two, not four — `cannon-flag` and `zero-trigger` — but the overlap
count is the weaker argument. The mis-scoped criterion is the argument.

## The rider the ruling attaches, which no `next:` line has carried

The ruling took all eight **and** said their numbers are not all trustworthy:

> those two readings should be re-measured on a clean screen before any redesign work starts on them —
> the ruling is that they are in scope, not that their current numbers are trustworthy.

`dice-loser` (0.460) and `timebomb` (0.389) were read on a screen the composition table itself
annotates as having a reset dialog open. In scope; re-measure before redesign. This survives whichever
way the count question is answered.

## Every site that carries the count, enumerated

By grep over the fetched title and body, not from memory. **"eight" appears zero times** in either.

In the ticket:

1. the title
2. § What to build — the opening sentence
3. § What to build — a four-row measured table, which is the count as data rather than as a word
4. § Do not re-decide what #180 decided — "Four routes each with their own desktop layout"
5. § Acceptance criteria, box 1 — "All four fill the window"
6. § Acceptance criteria, box 7 — "Each of the four routes"

Outside the ticket:

7. `docs/verification/evidence/181/README.md` § "Route set" — already states eight, and carries the
   standing request to settle the wording

Two of these are acceptance criteria, so this is not only prose drift. **Box numbering has shifted
since 2026-09-05**: the "Box 7" that comment reserves for the owner is today's box 8, which is ticked.
Today's box 7 is the per-route agent verdict under the 2026-09-06 delegation.

## "Four" survived two touches after the ruling

Both **inferred** from the agent comments; the API exposes no body-edit history to confirm them.

- **2026-09-10** — box 1's numeric threshold was struck, five days after the ruling, and "All four"
  stayed in the same box.
- **2026-09-18** — box 7 was reworded for its images clause and the count was left "exactly as
  written", recorded as a deliberate deferral rather than an oversight.

So "four" is not simply stale text nobody revisited. It has been read past twice since the ruling. That
is the objection any restatement has to answer, and the reason this is the owner's call rather than a
typo fix.

## What each answer costs

- **Eight** (what the record says) — sites 1–6 are restated, the table is either extended to the eight
  or relabelled as the 2026-08-31 reading it was, and § "Route set" in
  `docs/verification/evidence/181/README.md` closes. Box 7's verdicts then need frame-screen artifacts
  for the six routes outside the title.
- **Four** — the 2026-09-05 ruling is reversed on the record, which needs saying explicitly rather than
  by leaving the wording alone. Box 1 keeps the defect above, and box 7 cannot close until
  `how-close-is-near` and `cursed-number` have frame-screen readings, which no instrument has produced.

## What is the owner's

The wording. Restating an acceptance criterion against a ruling the ticket never states is not licensed
by the read-back — the read-back only removes the uncertainty about what the ruling said. Box 8's tick
stays the owner's own step either way; the 2026-09-06 delegation covers the agent verdict and does not
stand in for it.
