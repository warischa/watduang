# ADR-0058 — The home page reaches categories through intent panels, not per-category game lists

Status: accepted 2026-09-02 (owner's go for the direction doc's structure, given as the
continuation goal of the landing-foundation session; see `SESSION-HANDOFF.md` entry S2026-09-03#1).
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
