# ADR-0047 — A canvas audit is element-scoped, or its PASS means nothing

Date: 2026-08-28 · Status: accepted · Related: [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md), [ADR-0036](0036-a-stylesheet-belongs-to-the-module-that-emits-its-class-names.md), [ADR-0019](0019-a-tripwires-green-must-not-imply-coverage-it-has-not-earned.md), gh#77, gh#78, gh#79, gh#80, gh#81

## Context

Five tickets share one acceptance box, worded identically: only the declared levers may differ from the
shell. Answering it means deciding, per declaration, whether a value is in that game's design canvas.

Two audits answered it at different rigor, and the difference changed the answer.

The first compared each CSS literal against the **whole canvas file**. It disclosed its own asymmetry
honestly: a literal can match a value the canvas uses on a *different element*, so a false PASS is
possible while a false DEPART is not. It returned three PASSes and one DEPART, and observed in passing
that a fifth sheet looked clean.

The second mapped every rule to **its own canvas node** and diffed declaration by declaration against
that node alone. It refuted the passing observation — the fifth sheet carries a canvas-absent
`font-weight` on an element the canvas does not contain at all — and re-running the three PASSes at that
rigor **overturned one of them**. That box had already been ticked on the weaker evidence and had to be
unticked on the ticket.

So the weaker method did not merely under-prove. It produced a tick that was wrong, in the direction it
had itself warned about.

## Decision

A canvas audit under ADR-0033 is **element-scoped**. A declaration is canvas-sourced only if the value
appears on the **same node** in that game's artboard, with tokens resolved. Whole-file literal matching
may be used to *find candidates*; it may never justify a PASS.

The reason is that ADR-0033's rule is about drift, and "in the canvas" means on that element. A
file-wide match answers a different question — whether the value exists anywhere in the design — and
that question does not bound drift.

A corollary, because it voids verdicts silently: **`design/canvas.json` holds more than one design set.**
The set grouped as the game pages is the live design for what ships today. The `Siamsi*`, `DuangToday*`
and `Soulmate*` artboards are the designs for the unbuilt redesigns on gh#97, gh#99 and gh#101. An audit
run against the wrong artboard is not weak evidence, it is no evidence.

## The guard, and what it does not prove

Element-scoping removes false PASS by value-reuse. It does not remove every false PASS, and an audit
that claims otherwise is making ADR-0019's mistake:

- Resolving tokens, specificity and computed-equivalence off the source rather than in a real browser
  can still clear a canvas-absent structural declaration as inert.
- Treating a shell-inherited declaration as satisfying a canvas declaration passes a shell override that
  was misattributed.
- `card density` remains one of the four levers and has **no agreed definition** — the 2026-08-27 rescope
  removed the display-type lever and deliberately left this one undefined, because the ruling was about
  font-size only. No verdict may rest on it, so the box is not fully decidable even for a clean sheet.

Deleting the display-type lever also has a consequence worth stating plainly: any per-game font-size now
needs a same-element canvas trace, and that alone is why three of the five sheets depart.

## The fact that would change this

An owner ruling that a value taken verbatim from the same game's artboard on **any** element satisfies
ADR-0033. That collapses the element distinction and reinstates whole-file matching, which would flip
the overturned verdict back and make the two audits agree.
