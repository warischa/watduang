# Why this directory is not issue-numbered

`docs/verification/README.md` says evidence lives in `evidence/<issue-number>/`. This walk has no
issue number: the question came from the session handoff's `next:` list, not from a ticket, and the
owner scoped this session's issue filings to three (#40, #41, #42) that cover the ghost-tap class.

The measurement closes that handoff item. If an ad-slot issue is ever filed, move these two files
under its number and delete this note.

**Result: no collision on any of the four tool pages, at 320px and 390px.** Worst real shrink is
208px (`team.astro`, `team-split`); the tap point stays clear of the post-tap ad rect. Read
`01-full-run.json`'s `scopeNotCovered` before citing this as a general clearance — in particular
`wheel.astro` under default motion is N/A rather than tested.

## Recorded here because no issue tracks it

`wheel.astro`'s list shrink fires ~1200ms after the tap under default motion. This walk calls that
N/A, and that is honest **for the double-tap question** — 1200ms is far outside any ghost-tap window.
It is not a clean bill of health: a 1200ms-delayed layout shift sitting above a live ad is a CLS
misclick risk for a *deliberate* tap, which is a different hazard and is unmeasured. Filing it was
not authorized this session.
