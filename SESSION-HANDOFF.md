# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-25#2

done: **gh#74 SHIPPED, committed `5ab6de6`, NOT pushed — 5 unpushed commits on main now** · `src/games/categories.ts` new (category manifest, Thai label/whenToUse/intro/accent/seo per หมวด) · `src/games/types.ts` exports `Category`, `GameModule.category` references it · `scripts/validate-games.mjs` +104/-16, two gates + empty-record guard, hardcoded `'party'|'fortune'` pair GONE (reads `Object.keys(categories)`, one runtime source not two) · `src/pages/c/[category].astro` new, one route both pages, zero JS · `tokens.css` +7/-0 (`--accent-gold` `--accent-punch` `--color-ground-warm` `--color-line-strong`) · `index.astro` +8 crawlable หมวด links · `game/[id].astro` +1 glob exclusion so categories.ts is not a dead client chunk · **REFUTE caught a defect all gates passed**: page interpolated the category SLUG not `meta.accent`, shipped `var(--accent-fortune)` which is defined NOWHERE, both pages fell back to currentColor — accent is a gh#74 acceptance criterion, and a comment 3 lines below asserted the opposite, written in the same edit · gh#85 filed for the gap · **orchestrate-qwen fleet run: 5 dispatches, 255 credits, 1 wasted** (Bash 2min default kills a ~4min dispatch) · feedback -> `~/.claude/skills/orchestrate-qwen/docs/FEEDBACK-2026-08-25.md`

dec: ADR-0032 — category manifest is `Record<Category, CategoryMeta>` keyed by the hand-written union, NOT `keyof typeof`; deriving makes types.ts a value import and node's ESM resolver breaks the prebuild gate · both new gates enumerate repo-owned sets so BOTH converge (unlike ADR-0031's hand-rolled half), conditional on reading the static artifacts and never a glob · owner: manifest is authoritative, a code/manifest mismatch goes RED, never silently reconciled · owner: hero raster stays parked, reason recorded in next: · gh#74's own AC 7 scoped to "existing content unchanged" — AC 9 adds home links so home cannot render byte-identical

next:
- [ ] agent: gh#75 neutral home page + gh#76 theme on the game shell — BOTH unblocked by gh#74 as of this save. gh#75 done when the home page presents groups not a games list and a third content type would need no rewrite
- [ ] owner: **review the accent colours before this goes live** — `#e8b317` (gold) and `#ff5349` (punch) in `src/styles/tokens.css` were picked by the fleet from the "pop-card" prose, NOT from the design canvas under `design/`. Done when the owner confirms or replaces the two hex values
- [ ] owner-run: gh#9 domain then gh#29 AdSense. `dig +short watduang.com NS` still EMPTY, re-measured at this save. Blocks the one remaining box on gh#15 gh#16 gh#17 gh#18 — those four tools are BUILT and shipping, do not re-scope them as unbuilt
- [ ] owner-run: gh#13 last box — the real-device script on one real iPhone. An agent cannot do this; the simulator tooling reaches simulators only. Runnable NOW on the Azure default hostname, no domain needed — get the hostname from `az staticwebapp list` or the portal
- [ ] owner: decide whether to push the 5 unpushed commits — pushing main deploys the live site
- [ ] agent: gh#85 dangling-CSS-var gate. Needs a built `dist/`, so it cannot be a prebuild step like validate-games.mjs — that sequencing is the real question, and a guard is a new surface (ADR-0020)
- [ ] owner: gh#12 keyword planner · gh#19 month-6 organic-clicks gate
- [ ] agent, PARKED by owner 2026-08-25, do not pick up without a new decision: re-run the hero as a true transparent cutout. Reason it is parked: the same save that queued it also REJECTED a generated raster hero on palette drift AND composition AND weight, and recorded that all six of its motifs already exist as hand-drawn SVG. Fixing the alpha channel answers only the weight objection. Unpark only if a raster hero is decided to be wanted at all

inflight: measured at save — 5 unpushed commits on main (`origin/main..HEAD`) · working tree clean apart from this save's own writes · open PRs 0 (checked) · bg tasks 0 (checked) · open issues 24 · quota token-plan 83.0% at save

spent: queue 6->8 (gh#74 drained, gh#85 filed, 2 owner items added) · dispatches 5 (fork SOLVE, 2 builder, REFUTE, 1 WASTED to a 2min timeout) · qwen credits 255 (93.2%->83.0%) · REFUTE rounds 1/2, re-forks 0/1 · ctx well under target at save
