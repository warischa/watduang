# ADR-0028 — An invariant is enforced at the layer that declares the element, not the layer that fills it

Date: 2026-08-23 · Status: accepted · Issues: [#68](https://github.com/warischa/watduang/issues/68) · [#67](https://github.com/warischa/watduang/issues/67)

## Context

ADR-0014 says a game renders no navigation target inside `#stage`. The gate enforcing it scanned
`src/games/*.ts` — the game modules that fill the stage at runtime.

`#stage` is not declared in any of them. It is declared in `src/layouts/GameLayout.astro`, and no gate
examined that file for navigation targets inside the stage. An `<a href>` typed between those tags
would have broken ADR-0014 with every gate green.

The gate's own scope comment claimed `src/pages/game/[id].astro` held the element and carried the
mandated chrome link. Both halves were false: that file has no `href` and `git log -S` shows it never
did. So the ceiling had been reasoned against a file that was never the constraint, while the file that
*is* the constraint was named nowhere.

This is the second time this shape has cost us. [#61](https://github.com/warischa/watduang/issues/61)
removed every link from the container a game owned, measured 0 of 75, and the harm relocated to page
chrome one layer out.

## Decision

**An invariant about an element is enforced at the layer that declares that element.** The layer that
fills it at runtime may also need a guard, but it is never the only one, because it cannot be reached
by anything typed directly into the declaration.

For ADR-0014 specifically: the layout's `#stage` is pinned to **empty** — no static children at all,
not merely no anchors. Anything typed into it fails, rather than only the shapes someone thought to
enumerate.

Two candidates were rejected on which set actually contains the hazard:

- **Scan the layout whole.** It would ban the `<a href="/games/">` that ADR-0014 *requires* in page
  chrome above the stage — a fix that breaks the thing it protects. The check reads only what sits
  between the stage's own tags.
- **Check built HTML in `dist/`.** Built markup is a pure function of the same source line, so it adds
  a build dependency and guards nothing extra. The runtime set is already covered twice: the game-module
  scan, and the probe's `stage.querySelectorAll('a[href]')` mid-round.

## Consequences

The guarded set is "static children of `#stage`" — ours, currently empty, and it converges. That is the
same ownership test [ADR-0026](0026-a-set-we-do-not-own-is-guarded-at-authorship.md) applies, and the
sibling case landed the same day: [#67](https://github.com/warischa/watduang/issues/67) made the CSP
gate reject any directive name it does not recognise, rather than only checking the seven it knows.
Checking only what you already know is coverage you have not earned — [ADR-0019](0019-a-tripwires-green-must-not-imply-coverage-it-has-not-earned.md).

Pin-to-empty will go red on innocent reformatting of that div. One line in one file, an accepted cost,
and recorded in the check's own comment so it does not surprise anyone.

## The fact that would change this

If `#stage` ever needs static skeleton markup — a placeholder reserving layout to avoid CLS — pin-to-empty
is the wrong shape and must become "no navigation target among static children", which reopens the
unbounded set this deliberately avoids.
