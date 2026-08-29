# ADR-0050 — party games go full screen, and the party-game landing pages are deleted

Date: 2026-08-29 · Status: accepted · Owner decision · Narrows: [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md), [ADR-0048](0048-a-ported-game-is-exempt-from-the-canvas-and-the-exemption-must-name-its-replacement.md) · Relates: [ADR-0014](0014-no-navigation-target-inside-the-stage.md), [ADR-0005](0005-page-js-must-never-inline.md), gh#143, gh#135, gh#136, gh#138, gh#141, gh#144, gh#145, gh#146, gh#147, gh#148, gh#149

## Context

Three ports (freeze-tap, power-meter, cannon-flag) landed as full-screen play routes rather than
retrofits of the old game landing page. gh#143 records seven rulings the owner made on 2026-08-29 to
turn that pattern, decided game-by-game so far, into policy for the remaining party games.

## Decision

1. **Party games render full screen on a play route.** The freeze-tap (มือลั่น) mockup's dark visual
   design is the design reference for every party game; existing games retrofit to it.
2. **The party-game pages under the game URL prefix are deleted.** Tapping a game card goes straight
   into the game. 301 redirects cover the deleted URLs. How-to-play moves inside each game behind a
   วิธีเล่น control, as the mockups already do.
3. **Every game gets an X control** that exits back to the home page, guarded against mid-round
   double-taps.
4. **The port recipe is run-as-is, then full assess.** A mockup is carried into the repo whole and
   must run before anything is adapted. Then one full assessment pass compares it to the shared
   concept — player baseline (the ADR-0049 ticket), viewport behavior, and other small alignments —
   and the fixes come off that checklist. No rewriting a mockup into a stage module; the assessment
   checklist is committed as evidence.
5. **Thai comments inside ported mockup code are exempt.** The thai-comments gate carries a carve-out
   scoped to the ported game folders. Code written by agents stays under the full gate everywhere,
   including inside those folders' new files where separable — the carve-out covers only what the
   mockup brought with it.
6. **Inline scripts never reach dist.** Mockups ship page-inline scripts, and ADR-0005 stands
   unchanged. The build (Vite/Astro) extracts them to external files at build time; the mockup source
   is not hand-edited for this.
7. **Scope: party category only.** ดูดวง pages and tools keep their current page shape.

## Accepted losses

Deleting the party-game landing pages (ruling 2) is a knowing trade, not an oversight:

- **Indexed URLs disappear.** Every `game/<id>/` page currently in the sitemap and in Search Console
  goes away; the 301 preserves the crawl path but the page itself, and its accumulated signal, does
  not carry forward.
- **Their JSON-LD goes with them.** Structured data lived on the landing page, not the play route.
- **Their ad slots go with them.** Ad surface for the party category then lives only on the home page,
  the category pages, and the tools — not on a per-game page. This is a real reduction in ad
  inventory, accepted because the landing page's job (how-to-play, the outbound link) moves inside the
  game instead of disappearing.

## How the X control satisfies ADR-0014

ADR-0014 makes `#stage` contain no navigation targets, because a second tap on a stale coordinate —
the ordinary reality of a phone passed around a table — must never leave the round. The X control
satisfies that by construction, not by exception: it is **chrome that sits outside `#stage`**, exactly
like the one outbound link ADR-0014 already carves out in page chrome above the stage. `#stage`
content is still replaced wholesale on every transition and still renders no `<a href>`; the X never
moves, never re-renders, and is guarded against a tap burst so a double-tap at round-start or
mid-transition cannot exit the round it didn't mean to. gh#144 tracks the shared implementation.

## Consequences

- The three already-ported games (freeze-tap, power-meter, cannon-flag) needed no landing-page rework
  to comply — they already render full screen on a play route. The remaining party games (gh#145
  ระเบิดเวลา, gh#146 จับไม้สั้น, gh#147 สุ่มคนโดน) retrofit to the same shape.
- gh#149 does the deletion: 301s, cards repointed at play routes, CI's page lists swept.
- ADR-0033 and ADR-0048 no longer govern party-game surfaces; they still govern the shell, home,
  category pages, and tools. Both carry a narrowed-by pointer to this ADR.
- ADR-0048's contrast measurements (`--accent-gold` 1.42:1, `--color-accent` 1.75:1 against white) do
  not transfer to the play routes' dark ground — restated on ADR-0048 itself; per-surface contrast
  measurement is each retrofit ticket's job (gh#145, gh#146, gh#147), not this ADR's.
- `docs/agents/porting-a-mockup-game.md` points ports at the play-route shape and the freeze-tap dark
  reference; the detailed recipe write-up stays gh#138's job.

## Calibration: the thai-comments carve-out (ruling 5)

`scripts/thai-comments.mjs` already carries the carve-out (`isVerbatimLift`), scoped to the exact
`markup.html` / `style.css` / `main.js` basenames the extractor writes under `src/play/<game-id>/` —
not to the directory, so agent-authored siblings in the same folder (`roster-bridge.ts`,
`overrides.css`) stay policed. That is a narrower scope than "the ported game folders" read literally,
and it is the correct narrowing: ruling 5 says the carve-out covers "what the mockup brought with it",
and a directory-wide exemption would also silence agent-authored files sitting beside it.

Both directions verified 2026-08-29:

- **Run A — Thai already inside a lifted mockup file, current tree.** `node scripts/thai-comments.mjs`
  exits 0 and prints the NOT SCANNED line naming the six lifted files by path (`markup.html` is not
  in this list — it is skipped earlier, as `.html` has no analyzer at all, not because of the
  carve-out):
  `... NOT SCANNED, verbatim third-party lifts (owner ruling 2026-08-29): src/play/cannon-flag/main.js, src/play/cannon-flag/style.css, src/play/freeze-tap/main.js, src/play/freeze-tap/style.css, src/play/power-meter/main.js, src/play/power-meter/style.css`
- **Run B — a planted Thai comment in a non-lifted file under `src/`.** One line
  `// ทดสอบ calibration` added to `src/games/_el.ts` (a shared helper, not `main.js`/`style.css`
  under `src/play/<game-id>/`, so `isVerbatimLift` returns false). `node scripts/thai-comments.mjs`
  printed `1` on stdout, `Thai comment lines: 1` on stderr, and exited 1 — gate fails as required. The
  planted line was then removed; the gate re-ran printed `0` / `Thai comment lines: 0` and exited 0.
  `git status --short src/games/_el.ts` after the revert shows no diff.

The gate's own `--selftest` also asserts this both-ways calibration as a permanent fixture (`exempt` /
`policed` arrays in `scripts/thai-comments.mjs`), so this is not a one-time check.

## The fact that would change this

If a retrofit finds the freeze-tap dark reference genuinely wrong for a specific game (not just
unfamiliar), the fix is an owner decision on that game's design document, not a reversion of ruling 1
back to the old landing-page shape — the landing pages are gone by ruling 2 regardless of how the
reference lands.
