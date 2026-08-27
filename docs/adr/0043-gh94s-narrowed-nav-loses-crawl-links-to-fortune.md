# ADR-0043 — gh#94's narrowed nav loses crawl links to ดูดวง, and that cost is accepted

Date: 2026-08-26 · Status: accepted · Owner decision · Records a trade-off already shipped by gh#94 ·
Related: [ADR-0040](0040-games-exist-in-one-category-only.md), gh#111 (box 3), gh#116

## Context

gh#94 changed `GameNav` from listing every game to filtering by category, driven by
`carriesGroup` in `src/games/categories.ts`. `fortune.carriesGroup = false`, `party.carriesGroup =
true`. `src/layouts/GameLayout.astro` reads that flag to decide what its nav passes:
`category={carriesGroup ? game.category : undefined}`. The four tool pages
(`src/pages/tool/wheel.astro`, `draw.astro`, `team.astro`, `number.astro`) hardcode
`category="party"` directly.

Net effect: party-category game pages and all four tool pages now link only to other party games.
Fortune pages still pass `category={undefined}`, which `GameNav`'s filter (`!category ||
g.category === category`) reads as "list everything" — so fortune pages still link to party games
too. The link graph is asymmetric: fortune is linked from everywhere party is, but party is no
longer linked from fortune's neighbours in the other direction they used to have both ways.

gh#116 asked to either record this trade-off or restore the links. No ADR covered it before this
one — the rationale existed only as comments in `GameNav.astro` and assertions in
`GameNav.test.mjs`, not as a decision a reader could find.

## Why the narrowing happened

`GameNav`'s `heading` prop is required with no default (gh#111 fixed that), because the heading is
a claim about what happens next: a category that carries the group onward can promise the same
group continues into the next game, and one that does not must not promise that. Listing ดูดวง
pages under any heading a player reads as "play on" repeats the same false claim
[ADR-0040](0040-games-exist-in-one-category-only.md) exists to forbid — ดูดวง pages are solo, no
roster, no turn order, not เกม. A crawlable link to those pages from a party page's "keep playing"
nav would be a correctness bug of exactly the kind ADR-0040 was written to close, not a styling
choice.

## Decision

**Accept the reduced internal linking.** The asymmetry — fortune pages still list everything,
party pages and tool pages list only party — stays as gh#94 shipped it. Restoring the links back
to symmetric would mean re-labelling ดูดวง pages as a continuation of a เกม session, which is the
exact proposition ADR-0040 denies. The boundary claim wins over the SEO link graph.

## The cost, stated plainly

`CLAUDE.md` states SEO is this site's business model, not a feature. Fewer internal links into the
ดูดวง pages means shallower crawl depth into that half of the site and less internal link equity
flowing to it — a real, revenue-relevant cost, not a free correctness win. This ADR does not claim
the cost is small or already measured; ADR-0003's Search Console gate is what would measure it.

### The link cost, counted in the built output (gh#116 box 3)

Measured 2026-08-27 by building both commits and counting `dist/` with identical commands. "Before"
is `9c52693`, the parent of the gh#94 commit `aec5f8e`; "after" is `883283b`. No tags exist, so the
commits are the anchors.

| | before (`9c52693`) | after (`883283b`) | change |
|---|---|---|---|
| internal `href="/…"` occurrences | 133 | 124 | −9 |
| `href="/game/…"` occurrences | 67 | 46 | **−21** |
| built HTML pages | 15 | 15 | 0 |

Commands, run in each build's own tree:

    grep -roh 'href="/[^"]*"' dist --include='*.html' | wc -l
    grep -roh 'href="/game/[^"]*"' dist --include='*.html' | wc -l
    find dist -name '*.html' | wc -l

The narrowing removed 21 `/game/` hrefs while total internal hrefs fell only 9, so roughly 12 links
were added on other targets (category and tool routes) as the nav's shape changed. The page set did
not change.

**What this measurement does NOT cover.** These are counts of `href` occurrences in the built HTML,
not unique targets, not per-page reachability, and not crawl or indexation outcomes. An occurrence
count cannot distinguish a lost path to an otherwise-reachable page from a page losing its only
inbound link — no gate walks the whole `dist/` link graph (confirmed 2026-08-27: the crawl gate proves
GameNav sibling links only). So this quantifies the *link* change and says nothing about the harm;
ADR-0003's Search Console gate remains the only thing that would measure the cost itself.

## The fact that would reverse this

Either of the following would justify restoring symmetric links or something like them:

- **A neutral class noun exists for the union of เกม and ดูดวง pages.** gh#111's box 3 names this
  exact gap: there is no agreed word for "the union of เกม and ดูดวง pages" that is not เกม and not
  เครื่องมือ, and inventing one is reserved for the owner. If that word lands, a nav heading built
  on it could list both without repeating the false claim, and the case for narrowing goes away.
- **Measured evidence that the fortune pages are under-crawled or under-linked relative to party.**
  Search Console data showing indexation or crawl-depth harm attributable to this narrowing would
  outweigh the correctness argument above; ADR-0003's gate is the mechanism that would surface it.

## Interaction with gh#111

gh#111 box 3 is open on the same seam this ADR records: it is the ticket where a class-noun answer
would land. If the owner answers it, that answer may supersede this ADR rather than merely
implement it — the two should be read together, and this ADR does not attempt to pre-empt that
decision.
