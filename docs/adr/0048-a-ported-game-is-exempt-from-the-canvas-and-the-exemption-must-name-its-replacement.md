# ADR-0048 — a ported game is exempt from the design canvas, and the exemption names what replaces it

Date: 2026-08-28 · Status: accepted · Owner decision · Narrows: [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md)

## Context

ADR-0033 makes `design/` the source of truth for every design value and calls anything else drift.
That held while every page had an artboard. Porting games from the standalone mockups breaks the
premise: the mockups carry their own complete visual design — `power-meter` alone has 83 CSS rule
blocks and 42 named values — and no artboard exists for any of them.

Three prior tickets were already blocked on the same shape of question, and ADR-0047 records that
re-auditing them element-scoped overturned one of three prior passes. So this was not a new problem,
only a new instance of it, arriving faster than artboards could be commissioned.

Confirmed while deciding: **no gate reads `design/`** — grep across `scripts/*.mjs` returns zero files.
ADR-0033 has always been enforced at review, never by CI.

## Decision

**A game ported from a mockup is exempt from ADR-0033's artboard requirement.** Owner decision, taken
2026-08-28 as the first of the port questions.

The exemption is not a licence to invent. What replaces the artboard is a **graphic-direction section
in the port's design document**: one row per rendered element, giving its role in the game, what the
mockup did (including the mockup's own hex values, recorded as provenance), and the token the port will
use, referenced by name. Where no token fits, the row says so and the value becomes an owner question
rather than an implementer's choice.

That section is written to be something a designer could later draw from. If artboards are ever
commissioned for these games, it is the input.

## What the exemption does not touch

- **Tokens stay the single source.** Every colour is a token referenced by name; no hex literal is
  copied out of a mockup into a stylesheet.
- **The palette is not portable, and that is a measurement, not a preference.** The mockups are neon on
  a dark ground; this site is warm and light. Against white, `--accent-gold` measures 1.42:1 and
  `--color-accent` 1.75:1 — neither can carry text at any size. A mockup's multi-tier colour scale
  therefore cannot cross over, whatever the artboard question is.
- **ADR-0033's rule for everything else is unchanged.** The shell, the hub, the category pages and the
  tool pages keep the canvas as their source of truth.

## Consequences

Accepted knowingly: for the ported games, the design record lives in a document rather than in an
artboard, so the two cannot be diffed. Nothing enforces the graphic-direction section either — it is
reviewer-owned, exactly as ADR-0033 always was.

Also accepted: a port may resolve a design question in code when its document leaves one open. That
happened on the first two ports and both were caught only by an adversarial read of the diff against
the document. The mitigation is that the document names its open questions explicitly so they reach
the owner before the build, not after.

## The fact that would change this

If a ported game's look is judged wrong once it is seen in a browser — and neither game has been played
in one yet — then the document did not do the artboard's job, and the answer is to commission artboards
before the remaining ports rather than to widen this exemption.
