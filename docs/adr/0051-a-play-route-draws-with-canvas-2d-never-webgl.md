# ADR-0051 — a play route draws with Canvas 2D, never WebGL

Date: 2026-08-30 · Status: accepted · Owner decision · Relates: [ADR-0050](0050-party-games-go-full-screen-landings-deleted.md), [ADR-0046](0046-reduced-motion-does-not-reach-js-driven-motion-and-the-answer-is-reduce-not-remove.md), gh#145, gh#146, gh#150

## Context

The owner asked on 2026-08-30 for ระเบิดเวลา to look like a game rather than a page — a canvas with
real depth — and pointed at the already-ported games as the reference.

Two candidate sources existed. The mockup `Bomb` ("One Bomb 3D") is genuine WebGL: it calls
`getContext('webgl')` with hand-written shaders. The four shipped play routes all use a `<canvas>`
with a 2D context, and only `cannon-flag` draws substantially on it.

The WebGL mockup carries a failure mode the shipped routes do not. When `getContext('webgl')` returns
null it replaces `document.body` with an error string. This site is Thai-first and mobile-first, and
low-end Android is a core audience rather than an edge case, so a play surface that can blank the page
on the reader's own device is a product risk, not a compatibility footnote.

The project also ships only `astro` and `@astrojs/sitemap`, and the stack rule is no runtime
framework. A 3D library would be the first runtime dependency this product has ever taken.

## Decision

A play route draws with `getContext('2d')`. Depth is drawn by hand — a perspective factor, a projected
ground shadow, gradients for volume, an offset specular highlight — not delegated to a 3D pipeline.

WebGL, and any 3D library, is out. This is not a preference between rendering technologies; it is the
refusal of a failure mode where the page can go blank on the device the reader actually owns.

Two obligations come with drawing on a canvas at all:

- **Reduced motion reduces, it does not remove.** A canvas may stop animating; it may not stop being
  drawn. A reader with reduced motion on must still see the round's state and finish the round.
  This narrows nothing in ADR-0046 — it applies its rule to a surface that did not exist when it was
  written.
- **A canvas is invisible to assistive technology.** The element carries `role="img"` and an
  `aria-label`, and the round's state is announced in a live region outside the canvas.

## Consequences

A canvas that renders nothing is indistinguishable from one that works, from every gate this repo
has: the build passes, the types pass, the tests pass, the layout probes pass. So a play route that
draws gets a pixel-readback check that reads the canvas back after a round starts and asserts non-zero
coverage, calibrated against a stubbed renderer first.

That check has already earned itself. In the จับไม้สั้น port it caught a board that stayed blank
permanently under reduced motion — `resize()` writes `canvas.width`, which wipes the bitmap, and the
reduced-motion repaint guard then returned before the next paint. Geometry was correct and all 28
gates were green.

The canvas does not own layout where layout carries a tap-target guarantee. In จับไม้สั้น the
`.stick-grid` flex-wrap is what keeps ten seats at 44px on a 320px screen; one true receding fan would
need 440px. Depth is therefore applied per wrapped row, and stick lean is capped so art can never
drift over a neighbour's hit area.

`Bomb` is not lost. It ships as its own game under gh#150 if the owner wants it, where its WebGL is a
question about that game rather than a dependency of this rule.

## The fact that would reopen this

A measurement showing the audience's real devices support WebGL well enough that the blank-page path
is not reachable in practice, together with a fallback that keeps the page usable when it is. Absent
both, drawing by hand in 2D stays the answer.
