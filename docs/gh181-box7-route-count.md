# gh#181 — which routes does the ticket govern? (answered: eight, and applied)

**Closed 2026-09-18.** The count is eight. The owner confirmed it the same day, and the ticket was
restated at every site that carried the old count — its title, the § What to build opening, the
§ Do not re-decide sentence, box 1 and box 7 — with the 2026-08-31 four-row table relabelled as the
original reading rather than as the ticket's scope. § "Route set" in
`docs/verification/evidence/181/README.md` was closed in the same pass.

This file stays for the two things the restatement does not carry: the two-instrument distinction that
a naive reading of the count gets wrong, and the ruling's rider about `dice-loser` and `timebomb`,
which is still outstanding work.

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

## Every site that carried the count, enumerated

The state **before** the 2026-09-18 restatement, by grep over the fetched title and body rather than
from memory: "four" appeared at the six sites below and **"eight" appeared zero times** in either. All
six now say eight; the list is kept as the record of what had to be changed.

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

## "Four" survived every body edit made after the ruling

**Confirmed** from the body's own edit history, which the REST comment API does not expose but the
GraphQL `userContentEdits` field does. Six edits, all by the `warischa` account:

| edited at | note |
|---|---|
| 2026-08-31T09:06:40Z | before the ruling |
| 2026-09-07T08:16:28Z | before the ruling |
| 2026-09-16T09:43:26Z | **after** the ruling — "four" kept |
| 2026-09-18T03:44:51Z | **after** the ruling — "four" kept |
| 2026-09-18T03:47:35Z | **after** the ruling — "four" kept |
| 2026-09-18T03:48:41Z | **after** the ruling — "four" kept |

So "four" is not stale text nobody revisited. The body was edited four times after 2026-09-05 and kept
it every time, and the 2026-09-18 pass recorded leaving it as a deliberate deferral rather than an
oversight. That is the objection the restatement had to answer, and the reason this went to the owner
rather than being treated as a typo fix — it was put to them with this history in front of it, and they
chose to restate.

**One date does not line up, and it is left unresolved rather than smoothed over.** The 2026-09-17
comment says box 1's numeric threshold was struck on 2026-09-10, but there is **no body edit on
2026-09-10** in the list above. Either that strike reached the body in the 2026-09-16 edit, or
"2026-09-10" names the ruling's date rather than the edit's. The edit history cannot tell the two apart,
so this file does not guess.

Edit history still cannot say **who** decided: every edit is the one account the agent also writes
through, which is the same ceiling the ruling itself carries.

## What the restatement cost, measured after the fact

**No new measurement was owed, and an earlier draft of this file said otherwise.** It priced the eight
branch as needing frame-screen artifacts for the six routes outside the title. That was wrong:
`docs/verification/evidence/181/frame-screen-readings.json` already carries all eight at 1440x900, and
all eight are already written up in `docs/verification/evidence/181/README.md` § "Readings". Left
uncorrected, that false cost would have gone in front of the owner and biased the decision toward the
branch the record does not support. Restating the count was a wording change with the evidence already
in the tree behind it.

The alternative, for the record: stating "four" would have reversed the 2026-09-05 ruling, which would
have needed saying explicitly rather than by leaving the wording alone, and would have left box 1 with
the defect above.

## What is still outstanding, and it is not the count

- **The ruling's rider.** `dice-loser` and `timebomb` were read over an open reset dialog and their
  spans are not trustworthy. They are in scope; re-measure on a clean screen before any redesign work
  starts on them. This survived the restatement untouched and is the live item from this file.
- **Box 8 stays the owner's own step.** The 2026-09-06 delegation covers the per-route agent verdict and
  does not stand in for it. It is already ticked.
