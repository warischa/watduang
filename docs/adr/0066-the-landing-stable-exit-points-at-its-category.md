# ADR-0066 — the landing page's stable exit points at its own category, not at the site root

Date: 2026-09-11 · Status: **accepted** — owner decision, taken during the
[gh#97](https://github.com/warischa/watduang/issues/97) เซียมซี rebuild · Supersedes the destination
recorded in [ADR-0041](0041-the-all-games-page-cannot-exist-after-adr-0040.md), not its reasoning

## Context

ADR-0014 requires one static crawlable link in page chrome above `#stage`, exempt from the
leave-confirm because it provably never moves under a finger. ADR-0041 retargeted that link to `/`
and, in doing so, wrote down the principle this ADR relies on:

> Every one of those properties is a property of *where the link sits*, not of *where it goes*.

So the destination was never load-bearing, and changing it does not reopen ADR-0014 or ADR-0015.

The เซียมซี canvas asks for `/c/fortune/`. The link read กลับหน้าแรก and went to `/`.

## Decision

**The stable exit on a landing page points at that game's own category — `/c/${game.category}/` —
and reads the category's own label from the manifest.**

The category comes from the game's manifest entry. There is deliberately no fallback for a missing
category: `Category` is a closed union, the validator cross-checks it, and the frontmatter accent
lookup dereferences the same key first, so a bad category fails the build. `/c/undefined/` cannot
render, and guarding against it would be code that can never run.

## What it costs, stated plainly

**The label changed too, and that is not cosmetic.** กลับหน้าแรก over a `/c/fortune/` href would be
false Thai — the link no longer goes to the front page. The new text is the category's own manifest
label, so the copy has one source rather than two. It is shorter than the string it replaces, so the
top bar's static-position property under ADR-0015 is unaffected.

`tool-copy-registry.json` records กลับหน้าแรก as agent-authored and never owner-reviewed, and
`GameLayout.astro` is not in that gate's pinned set — so nothing was pinning the old string.

**One crawl edge is traded for another, in the direction ADR-0043 wanted.** `/c/fortune/` gains two
inbound links. `/` is not orphaned from these pages: `Base.astro`'s footer still carries
`<a href="/">วัดดวง</a>`, so the root stays one hop from every landing. Measured, not assumed.

## Scope: this is two pages, not sixteen

`src/pages/game/[id].astro` filters out every game with a `playRoute`, so `GameLayout` renders only
for the non-play landings — today `siamsi` and `daily-fortune`, both in `fortune`. A first reading of
this change called it "all 16 game pages"; 16 is the manifest length, not the landing set. The number
is derived from the manifest at build time and is not written down anywhere as a constant, so a
seventeenth game changes nothing here.

## What this does NOT cover

- **The play routes' crawl link is a different link.** It lives in `PlayExit.astro`, was restored on
  the same day under a separate change after being measured absent from all 14 built play pages, and
  still points at `/`. This ADR says nothing about it.
- The leave-confirm exemption, `data-stable-exit` staying at exactly one element, and the link's
  position as the first thing in `<main>` are all unchanged and still gated by
  `stable-exit-markers-check`.

## The fact that would change this

A gate or test pinning the top bar's Thai literal or its `/` href. None exists — the copy registry's
pinned set, the stable-exit, page-chrome and crawl gates, and every `game-topbar` reference were
checked before the change.

## Related

ADR-0014 (the invariant) · ADR-0015 (the leave-confirm exemption) · ADR-0041 (the previous retarget,
whose reasoning this ADR applies rather than overturns) · ADR-0043 (crawl links to fortune) ·
ADR-0050 (the landings that were deleted, which is why only two remain)
