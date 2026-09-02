# Landing redesign — foundation handoff

Foundation laid 2026-09-02. This file is the contract for the mechanical continuation; read it with
the repository only. `design/landing-playful-arcade.md` is the direction. The concept `.html` beside
it and the generated mockup are visual references only, never a copy, content or feature source.
Authority: `CLAUDE.md` + ADRs + gates → shipped source and manifests → this file → the direction doc.

## 1. Architecture locked

- `src/pages/index.astro` — the page. Its frontmatter is the ONLY adapter from manifests to view
  models (`gameCard`, `groups`, `intents`). Owns the hero, the four ad slots, how-to, FAQ, the
  `.card-grid` rule, the one focus rule, the one reduced-motion rule, and both media queries.
- `src/components/landing/Card.astro` — the one whole-card link. `kind` = `party | fortune | tool`
  (the repo's `Category` union plus tool; ADR-0040 keeps them apart). `panel` = intent-panel size
  with an h2; an item card is an h3. Build throws on a tool card with a pill or a game card without.
- `src/components/landing/Section.astro` — `<section aria-labelledby>` + h2 + optional body + hub
  link. Slot below. No copy of its own.
- `src/styles/tokens.css` — primitives plus the landing block at the end (surfaces, ink, container,
  rhythm, card, type scale, focus) and the closed breakpoint set in its comment.
- `src/components/PageChrome.astro` (header, footer, `SITE_LINKS`) and `src/layouts/Base.astro`
  (`lang="th"`, meta, canonical, OG) — shared, unchanged, not landing files.

Data flow: `src/games/manifest.ts` (`games`, `popularGames`, `popularGroup`), `src/games/categories.ts`
(`categories`), `src/tools/manifest.ts` (`tools`, `toolsGroup`) → frontmatter → props → components.
Components import no manifest. The page ships zero scripts (ADR-0005).

Do not add: a loader module, a card registry, a hero component, a third landing component.
`src/pages/index.test.mjs` pins the seam: the model reads `game.names.th`, `game.tagline`,
`tool.name`, `tool.desc`, `categories[…].label`, `popularGames`, `popularGroup.heading`; markup
interpolates `{card.title}`, `{card.desc}`, `{card.pill}`; and no manifest string — names, taglines,
tool copy, hub headings and bodies — is retyped in the page or in the two components (scanned
whole). Pass props explicitly, never `{...card}`. The test may only grow, never narrow.

## 2. Data ownership

| Section | Source | Order / filter |
|---|---|---|
| Popular row | `popularGames`, `popularGroup.heading` | manifest (ADR-0052); never `byId(` in the page |
| Intent panels | `categories[cat].hubHeading/.hubBody/.accent`; `toolsGroup.heading/.body/.href/.accentVar` | record order (fortune, party), then tools |
| Tools group | `tools` | manifest order |
| Category game lists | none — removed 2026-09-02 (§9 h); each category is reached via its panel and `/c/<slug>/` | — |
| Pill | `categories[game.category].label` | never a literal |
| Accent | `--accent-<categories[cat].accent>` or `toolsGroup.accentVar` | a token NAME; hex only in `tokens.css` |

New data reaches a section through a manifest field read in the frontmatter. Never hardcoded: any
game, tool or category string, id, accent hex, ordering, or count ("2–10 คน" is party copy only).

## 3. Patterns to copy

**Card section** — reference: the `groups.map` block in `index.astro`.
```astro
<Section id="unique-id" heading={m.heading} body={m.body} href={m.href} linkLabel="ดูทั้งหมด →">
  <div class="card-grid" data-cols={3}>   {/* 3 or 4 only */}
    {m.cards.map((card) => <Card kind={card.kind} href={card.href} title={card.title}
       desc={card.desc} pill={card.pill} accentVar={card.accentVar} bob={card.bob} />)}
  </div>
</Section>
```
Change only `id`, the model and `data-cols`. Keep the nesting and the prop list.

**Intent panel** — reference: `intents` and its `index === 0` render. `<Card kind panel href title
desc accentVar />` in a `.card-grid` with `data-cols={3}`. A panel is its own h2 region; never
inside a Section.

**View model** — reference: `gameCard`. Typed `CardProps` (`import type { Props as CardProps }`
from `Card.astro`); every field is a manifest expression.

**Plain section (how-to, facts, FAQ)** — reference: `<section class="howto">`: h2, items as h3 + p.

**Responsive** — `.card-grid` collapses through `--cols` (3/4 → 2 → 1) in the two queries at the
bottom of `index.astro`; `.hero-cta` stacks at phone. Add no query and no `grid-template-columns`.
Flex/grid children holding text get `min-width: 0` + `overflow-wrap: anywhere` (Card, Section and
the hero copy already do). No fixed height on any text container; no line-clamp.

**Tokens** — read `--surface-*`, `--ink*`, `--card-*`, `--text-*`, `--gutter`, `--container-max`,
`--section-gap`, `--grid-gap`, `--tap-min`. Nothing fits → stop (§8). Never a hex, never a new
`--accent-*`, never a token redefined in a component.

**Accessibility** — h1 hero → h2 Section or panel → h3 item. Navigation is `<a href>`; `<button>`
only for an in-page action (none exist). Decorative SVG: `aria-hidden="true"`; raster: `alt=""`.
Focus: write nothing — `main :global(:focus-visible)` covers every element; never `outline: none`.
Anchors ≥ 44px tall (`--tap-min`).

**Motion** — declare `animation`/`transition` where the element lives; the reduced-motion block
already stops everything under `main`. No JS motion.

## 4. Remaining mechanical work

1. **Category lists — DONE.** `groups` holds the popular row and the tools group; the remaining
   `Object.keys(categories)` spread is `intents` and must stay. Order: hero → popular → panels →
   ad → tools → how-to → FAQ. `scripts/landing-claims-check.mjs` needs a `/c/<slug>/` link per
   category on the home page; the panels supply it.
2. **Product-facts strip** (direction §6): h2 + four `li`, copy from §9 (b) once confirmed; until
   then skip.
3. **How-to / FAQ — do not touch.** Shipped strings there (`ใส่ชื่อคนในวง`, `ส่งมือถือวนกัน`, the last
   FAQ answer) state roster and phone-passing at site level, which `CLAUDE.md` forbids; the
   replacement is the owner's copy (§9 a). Never paste the direction doc's steps or question.
4. **Hero art** — keep the SVG wheel; a mascot raster is §9 (e).
5. Polish only within the token block: spacing, hover, `BOB_PHASES` on new rows. Run §7 each step.

## 5. Do not change

- Semantics: fortune is solo, tools are utilities, party is the only roster / phone-passing
  category (ADR-0040, ADR-0039). Nothing may say the site is 2–10 players. The popular row promotes
  games only.
- The mockup and concept HTML show a bottle card, play counts, favorites, a newsletter form, a
  `บทความ` nav item and games that do not exist — each forbidden or a stated non-goal. Render none.
- `PageChrome.astro` and its `SITE_LINKS` labels; `Base.astro`; the `<Base … chrome\n>` tag shape.
- Every Thai string is manifest-held or already shipped. Author none.
- The `--accent-*` block and values; the landing token names; breakpoints 639 and 1099 only.
- Component props, nesting and the build-time throws; static routes; no scripts.
- The four ad slots and their fixed heights (ADR-0024); never inside a card grid.

## 6. Common wrong moves

Adding a 480/820 query from the concept · writing `#f54867`/`#17213a`/`--coral` · typing a game
name, label or description into markup · a fortune card without its pill or a tool card with one
(the throw is correct) · `{...card}` · a panel inside a Section · `grid-template-columns` or a fixed
`height` on a section · a `:focus` rule or `outline: none` · a link inside a `<button>` · a
file-colon-line-number citation in any added line (`scripts/added-lineno-citation-check.mjs`) · Thai in a
code comment (`scripts/thai-comments.mjs`) · a PNG in `public/` with no referrer or over 60 KB
(`docs/agents/assets.md`).

## 7. Verification per section

```bash
npm run astro-check && npm test && npm run thai-comments && npm run accent-single-source-check && npm run party-size-claim-check
npm run build && npm run page-chrome-check && npm run landing-claims-check && npm run bundle-freeze-check && npm run dangling-css-var-check && npm run csp-inline-check && npm run smoke-dist
```
Browser, against the build (`docs/agents/browser-verification.md`), both runs all PASS:
```bash
npx serve dist/ -l 4321 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 --user-data-dir=/tmp/cdp-a &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox --remote-debugging-port=9223 --force-prefers-reduced-motion --user-data-dir=/tmp/cdp-b &
node scripts/driver.mjs scripts/home-direction-c-probe.mjs
CDP_PORT=9223 node scripts/driver.mjs scripts/home-direction-c-probe.mjs
```
Tear the three processes down by pid. Before a push only `bash scripts/run-workflow-gates.sh`
predicts CI (`docs/agents/ci-verification.md`). Extra per section: 360 and 768 widths
(`session.setWidth`; `scrollWidth === clientWidth`); a 120-character no-space string in a card
title (card `scrollWidth` ≤ `clientWidth`); keyboard focus proven with real Tab presses over CDP
(`Input.dispatchKeyEvent`) then `activeElement.matches(':focus-visible')` — a script `el.focus()`
is not keyboard focus in Chrome and reports every stop unfocused.

## 8. Escalation — stop and report

A token, breakpoint, prop or heading level not in §3 · a manifest lacking a field · any Thai string
to write · a gate failing for a cause not your edit (the build's CSS-minifier "Unexpected }" warning
is pre-existing on the untouched tree) · the repository contradicting this file · any change to
`PageChrome.astro`, `Base.astro`, token primitives, or `src/play/**`.

## 9. Open questions (owner decides)

- (a) Copy from the direction doc: hero lead, CTA labels, `อยากดูดวง →`, neutral how-to steps,
  fourth FAQ, an intents heading. Also the shipped site-level roster / phone-passing strings in
  how-to and FAQ, which `CLAUDE.md` forbids — the owner's to replace.
- (b) Product-facts strip (ใช้ฟรี / ไม่ต้องสมัคร / เปิดในเบราว์เซอร์ได้เลย / รองรับมือถือ): new copy.
- (c) Palette: concept coral/ink/sky/lavender/mint versus the owner-confirmed accents (ADR-0033,
  2026-08-25). If adopted, an edit to `tokens.css` alone.
- (d) Nav label `เกมปาร์ตี้` versus shipped `สุ่มคนโดน`; panel order party-first versus record order.
- (e) Hero mascot: `/gpt-image-2` was offered. Rules: transparent cutout, no bottles/cans/glasses,
  no Thai rendered in the raster, ≤ 60 KB, referenced from `index.astro`, `alt=""`, read
  `docs/agents/assets.md` first. Slot: `.hero-art`.
- (f) Site-wide focus ring on `PageChrome` links (today: UA outline); footer links measure 21px
  tall, under the 44px minimum — pre-existing, shared chrome.
- (g) Meta description still says "2-10 คน ส่งเครื่องวนกันในวง" site-wide (2026-08-25 decision kept it).
- (h) Category game lists removed 2026-09-02 on the owner's go. To restore: put the
  `Object.keys(categories)` spread back in `groups`; the pattern renders them unchanged.
- (i) Duplicate h2: the tools panel and the tools group both render `toolsGroup.heading`. Fix is
  either dropping the tools group list (`index.test.mjs` pins it as a gh#75 acceptance) or dropping
  the tools panel from `intents`.
