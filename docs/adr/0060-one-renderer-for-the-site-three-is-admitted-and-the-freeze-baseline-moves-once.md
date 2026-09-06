# ADR-0060 — One renderer for the site: `three` is admitted, and the freeze baseline moves once

Date: 2026-09-06 · Status: accepted · Owner decision · Supersedes one paragraph of
[ADR-0051](0051-canvas-2d-is-the-default-and-a-play-route-never-blanks-the-page.md) · Relates:
[ADR-0048](0048-a-ported-game-is-exempt-from-the-canvas-and-the-exemption-must-name-its-replacement.md),
gh#213, gh#206

## Context

เข้งับ is a port of a mockup that draws with `three`. Shipping it means vendoring the library — the
first runtime dependency this product has ever taken, next to `astro` and `@astrojs/sitemap`.

ADR-0051 had already opened that door. It permits "WebGL and a 3D library ... where a game genuinely
needs them to look right", and it had already demoted the dependency question to a cost weighed per
game. What ADR-0051 never mentions is the **bundle freeze** — `BASELINE_TOTAL_BYTES` in
`scripts/bundle-freeze-check.mjs`, which pins the total reachable JavaScript the built site ships and
reds outside a ±5% band. That is the constraint this decision actually moves.

The cost was measured on 2026-09-06 with rollup plus esbuild minification, with a positive control
that reproduced the mockup's own shipped bundle byte-identically. The ruling was given, the
measurement was then put back to the owner with a recommendation to reconsider, and the owner
confirmed it a second time. It is settled. The numbers are recorded here because a decision recorded
without its cost gets re-litigated by everyone who meets it later.

## Decision

**`three` is admitted, vendored, for เข้งับ. The bundle ceiling and the no-runtime-framework rule are
re-ratified to allow exactly this and nothing more.**

What it costs, all measured 2026-09-06:

- `three`, tree-shaken to exactly the 24 symbols this game uses: **498,672 bytes.**
- `BASELINE_TOTAL_BYTES` today: **464,658.** So one library is **107% of all the reachable JavaScript
  the freeze measures** — more than the entire rest of the site put together.
- The game's own code is **68,850 bytes**. The whole route takes the baseline to roughly
  **1,032,180 — a 122% increase.**
- Over the wire, gzipped, `three` is **126,423 bytes**.
- กับระเบิด, the 3D game already shipping, is **50,451 bytes for its entire page**. `three` alone is
  **9.9×** that.
- **68%** of `three`'s cost is its renderer stack. Without it the remainder is **159,333 bytes** — but
  `three`'s geometry cannot be used without its renderer, so that 159,333 is not an option, only an
  explanation of where the weight lives.

**The precedent rule, so this is not argued per game: one renderer for the site.** The first 3D
library admitted becomes the only one. A second 3D library requires its own ADR that names the game
it is for and beats the incumbent's measured tree-shaken size. **498,672 is the number the next
request must beat.** Admission also requires ADR-0051's never-blank fallback shipping in the same
change — a route that can leave a reader on a white screen is not admitted at any size.

## What this supersedes in ADR-0051

One paragraph of ADR-0051's Decision is dead:

> A 3D library would also be this product's first runtime dependency (`astro` and `@astrojs/sitemap`
> are the whole list today). That is a real cost to weigh per game, not a veto.

**The per-game weighing is what dies.** It is weighed once, here, and the answer is one renderer for
the site. ADR-0051's Context sentence "the stack rule is no runtime framework" is stale for the same
reason — the rule now reads with the carve-out this ADR names.

Everything else in ADR-0051 survives untouched: Canvas 2D is still the starting point, the never-blank
condition is still the one thing that does not move, the reduced-motion and assistive-technology
obligations still bind, and its "fact that would reopen this" still stands.

Note that the re-ratify is mostly a formality on the framework half. ADR-0051 had already softened the
no-runtime-framework rule from a veto to a cost. What is genuinely new here is (a) the bundle ceiling,
which ADR-0051 never addressed at all, and (b) the change from "weigh per game" to "one renderer".

## The rejected option

Rebuilding three of the mockup's nine modules on raw WebGL, measured at **41,499 bytes of source**.
That would have kept the site's weight profile intact — a fraction of a percent of the baseline
instead of a doubling. It was measured and offered to the owner alongside the numbers above. The owner
chose the library. Recorded so nobody re-derives it as a new idea.

## Consequences

- **`BASELINE_TOTAL_BYTES` is not re-pinned by this ADR.** The freeze file's own rule is that the
  baseline moves in the same change as the code, with the new numbers. This decision records the
  permission; the re-pin lands when the route lands.
- **Second-order, and the part most likely to be forgotten: the ±5% band widens from ±23,233 to
  ±51,609.** A 2D-route regression that reds today would pass afterwards. The freeze gets measurably
  weaker at catching everything else on the site, and this is accepted here with no mitigation
  proposed. Anyone who later finds the freeze missed a regression should read this paragraph before
  concluding the gate is broken.
- A second 3D library now has a written bar to clear rather than a fresh argument to have.

## The fact that would reopen this

A measurement showing a tree-shaken 3D library that renders เข้งับ correctly at materially less than
498,672 bytes — at which point the incumbent is the one that has to justify itself, per the precedent
rule above.
