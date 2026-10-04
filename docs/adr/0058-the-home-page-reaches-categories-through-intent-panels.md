# ADR-0058 — The home page reaches categories through intent panels, not per-category game lists

Status: accepted 2026-09-02 (owner's go for the direction doc's structure, given as the
continuation goal of the landing-foundation session; see `SESSION-HANDOFF.md` entry S2026-09-03#1).
**Amended 2026-10-04 for gh#244: the structure below is replaced — read the last section first.**
Supersedes the grouped-list structure gh#75 shipped and ADR-0041 left in place.

## Context

gh#75 made the home page a set of groups: a popular row, one section per category listing every
game in it, and the tools group. `design/landing-playful-arcade.md` reframes the page around three
intents — party games, solo fortune, randomizer tools — each as one whole-panel link to its hub,
with the popular row as the only list of individual games. Both structures rely on the same
manifest copy: a category's `hubHeading` and `hubBody` (ADR-0034), the tools group's heading and
body, `popularGames` (ADR-0052).

## Decision

**The home page links each category through an intent panel and its `/c/<slug>/` hub. It no longer
lists every game of every category.** The popular row stays the only per-game list, and it promotes
games only (ADR-0040). The tools group list stays for now: `src/pages/index.test.mjs` pins it as a
gh#75 acceptance, and dropping it is the owner's call recorded as handoff item (i).

Consequences the next agent must preserve:

- An intent panel renders the category's own hub pair; no panel may carry copy that describes a
  roster, player count or phone-passing unless the party category's manifest copy does.
- `scripts/landing-claims-check.mjs` still requires a resolvable `/c/<slug>/` link per category on
  the home page. The panels are what supply it; removing a panel reds the build.
- Restoring the lists is one edit — the `Object.keys(categories)` spread back into `groups` in
  `src/pages/index.astro` — because Section and Card render them with no other change.

## Alternatives rejected

- Keep both panels and lists: the page repeats every category twice, and the tools heading already
  duplicates once (handoff item (i)); the direction doc's whole point is fast intent recognition.
- Panels under a section heading: needs a new Thai heading, which no agent may author; a panel as
  its own h2 region needs none.

## What would flip this

Measured evidence that visitors reached games from the home lists rather than the hubs — the
analytics gh#160 reconciles — or an owner ruling that every game must be one tap from the home
page. Either restores the spread; nothing else moves.

## Outcome recorded 2026-09-03: item (i) is decided

This ADR left the tools group list in place "for now" and named dropping it as the owner's call,
carried as handoff item (i). **The owner ruled on 2026-09-03: drop the tools group list, keep the
tools panel.** The duplicate `toolsGroup.heading` this ADR's own "Alternatives rejected" section
flagged is the reason.

Two consequences that ride with the change, both already stated above and now load-bearing:
`src/pages/index.test.mjs` pins the list as a gh#75 acceptance, so that pin moves WITH the code and
gh#75's closure moves with it — a test left asserting the list must be updated, never satisfied by
leaving the list; and `scripts/landing-claims-check.mjs` still needs a resolvable `/c/<slug>/` per
category, which the panels supply, so removing the list must not remove a panel.

The rationale for the ruling lives on gh#192; this section records only that the open item closed
and which way.

## Amended 2026-10-04 for gh#244: canvas D lists the catalogue again

The owner picked direction D, Toy Shelf, on gh#243 (close comment 2026-10-04). The 2026-10-01 ruling
on the same ticket required at least one direction to break this ADR's structure, because "reads like
an ad landing page, not a game portal" is a structural complaint. D is that direction, and picking it
is this amendment. The canvas is `design/HomeShelfDesktop.dc.html` + `design/HomeShelf320.dc.html`.

**The home page now reaches each category through a full row, not an intent panel.** In order:

1. A hero with one featured game, read from the manifest's `featuredGroup`. It is the same bargain as
   the popular row (ADR-0052): the page names no game.
2. One ad slot.
3. The popular row.
4. The party art shelf: every party game, filtered from the registry, in manifest order.
5. The fortune row.
6. The tools row: every tool, per-tool tiles.
7. The FAQ.

The intent panels are gone. So are the how-to section and the hero's secondary call to action,
because the canvas draws neither.

Consequences the next agent must preserve:

- **`landing-claims-check` still needs a resolvable `/c/<slug>/` per category.** Each row's see-all
  link ("ดูทั้งหมด →") now supplies it, and the hero's call to action adds a second party link. The
  page throws at build if a category has no row, so a new category cannot go missing from home quietly.
- **The tools hub heading renders once.** This is the gh#192 (i) invariant. Per-tool tiles return
  under that one heading, so the reason (i) dropped the list no longer applies.
- **No tile carries a category pill.** The pill existed because the popular row mixed categories. On D
  every game sits under its own hub heading, and the popular row is party-only. `index.test.mjs` pins
  that, so a fortune id added to the row reds instead of shipping an unlabelled non-game.
- **No row may carry roster, player-count or phone-passing copy unless the party manifest copy does**
  (ADR-0040). Row heads render the hub pair alone, and the hero copy is the live page's, unchanged.

Pins moved in `src/pages/index.test.mjs`:

- The tools test flips. The per-tool model must exist again, and the once-only heading count stays.
- The pill assertions give way to the popular-row-is-party pin.
- A new test pins the party shelf and the featured card to the manifest.
- The component literal scan covers the five landing components, and a new test reds when the page
  imports a landing component the scan does not list.

Rulings taken in the same session, recorded where they live:

- The site-wide palette: gh#246, ADR-0069.
- One ad slot, as the canvas draws it: the gh#244 close comment.
- Canvas D's top bar and footer: gh#247. The home page keeps the shared chrome until that ticket lands.

**What would flip this** is unchanged in kind: measured evidence that visitors reach games better
through hub-first panels, from the analytics gh#160 reconciles, or an owner ruling.
