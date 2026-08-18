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

## Measured 2026-08-18 — no collision, and it is a grow, not a shrink

This was carried here as an unmeasured CLS misclick risk: a ~1200ms-delayed layout shift above a
live ad, outside any ghost-tap window and therefore a hazard to a *deliberate* tap. It has now been
measured, and the premise was wrong in direction.

- Delay: **1202.8ms** mean (n=5, 320px, default motion), matching `SPIN_MS=1200`. Under
  `prefers-reduced-motion` it is **~0.8ms** — `reveal()` runs synchronously in the tap handler, so
  the deferred window does not exist there at all.
- Shift: **-24px, away from the ad rather than into it.** `render()` never removes a row; it appends
  "(ออกแล้ว)" to the spun name, which sometimes wraps to a second line and *grows* the list.
- Collision: **0/10 runs** across both motion conditions, grid-scanned rather than centre-sampled.

No issue filed: measured, and no misclick collision exists for the targets tested. Earlier wording
in this file called the change a "shrink" — that was wrong in direction, and is corrected here.
Evidence: `03-wheel-delayed-shrink-default-motion.json`, `04-wheel-delayed-shrink-reduced-motion.json`,
probe `scripts/adslot-wheel-delay-probe.mjs`.
