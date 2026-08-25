# วัดดวง · watduang.com

Free Thai-first entertainment on one phone. Revenue from Google AdSense.
**เกม live in the สุ่มคนโดน หมวด only** — rounds, turn order, a shared roster, 2–10 players, phone passed around.
The ดูดวง หมวด and the randomizer เครื่องมือ are **not เกม**: one person, one answer, no roster. Confirmed: ADR-0040.
Never state 2–10 players or phone-passing as a fact about the whole site — it is true of one หมวด, and only where that หมวด is the subject.
English brand: **PartyPick** — lives at `/en/`, no second domain. Confirmed: ADR-0006.

**Live state, next queue, and inflight live in `SESSION-HANDOFF.md` at the root — that file is their home, not a supplement.**
Resume must read it as the primary state source. This file holds only the stable things you must know **before** acting, and never repeats state.

## Stack

Astro + TypeScript · **no runtime framework** (vanilla TS in islands) · plain CSS + custom properties · Azure Static Web Apps (Standard) · GitHub Actions · Cloudflare Web Analytics

**1 game = 1 file + 1 manifest line → 1 static URL** via `getStaticPaths()` · path routing only, **no hash routes** — SEO is this site's business model, not a feature.

Full detail: [#6](https://github.com/warischa/watduang/issues/6)

## Rules that must not be broken

**Content** — no images of bottles, cans, or branded glasses **anywhere, including OG images and thumbnails** (that alone triggers Thai Alcohol Act §32/1) · no dares that push players toward real physical harm (a genuine AdSense account-termination risk) · no brands, no shop links, no alcohol affiliates · keep profanity in check · no age gate needed.

**Portability** — the build must produce pure static `dist/`, and everything Azure-specific must live in exactly 2 files (`staticwebapp.config.json` + the deploy step) · CI proves it with `npx serve dist/` · no SWA auth · no Azure SDK in the build · all paths relative.

**CSP** — must let AdSense through, or ads silently fail to render (do not copy `admin-tools-dev`'s CSP verbatim — that site is deliberately strict because PDPA is its selling point) · page scripts must never inline: ADR-0005.

**Game screens** — a game renders no `<a href>` inside `#stage`; a double-tap on a transition lands on it and leaves the round. The crawlable `/games/` link lives in static page chrome above the stage: ADR-0014.

⚠ Before generating an OG image · running a build · driving two headless probes at once · or putting a choice to the site owner → read `docs/runbook.md` first · verifying anything the way CI does, or reading CI's own verdict → `docs/agents/ci-verification.md` (it carries the shell traps that make a probe lie, and the per-step endpoint).

## Language

**Write English. Ship Thai.** Effective 2026-08-14 — everything an agent reads or writes is English;
everything a player reads is Thai. The two never swap.

| Surface | Language |
|---|---|
| Every `.md` in this repo — `CLAUDE.md`, `SESSION-HANDOFF.md`, `docs/**`, ADRs, runbook, `CONTEXT.md` | **English** |
| Code comments, identifiers, commit messages, PR bodies, GitHub issue bodies | **English** |
| `src/**` user-facing strings, UI copy, game and tool content, `seo.*` fields, OG text | **Thai — never translate.** This is a Thai-first product; the copy IS the product |
| Domain terms that *are* Thai words (`วัดดวง`, `เซียมซี`, `วงล้อสุ่ม`) | keep the Thai term verbatim inside English prose |

Quote Thai UI copy verbatim when a doc needs to cite it — quoting is not translating.

Chat mirrors the reader: English in → English out, ไทย เข้า → ไทย ออก. Chat language never changes
what a file gets written in — a Thai conversation still produces English docs.

Existing Thai docs convert on touch unless a session is told otherwise; a file being edited gets
rewritten in English in that same edit, not left half-converted. `docs/sessions-archive.md` is the one
exception and is never converted — it holds verbatim past entries, and translating them would make the
record no longer what was written.

## Agent skills

**GitHub Issues are the single source of truth** — the map is [#1](https://github.com/warischa/watduang/issues/1) · how to work the tracker, and the ticket-number rule: `docs/agents/issue-tracker.md`

Before writing code: use the vocabulary in `CONTEXT.md` and respect `docs/adr/` · labels: `docs/agents/triage-labels.md` · domain: `docs/agents/domain.md` · src-edit rules: `docs/agents/src-edit-rules.md`

⚠ Before adding ANY binary — image, font, 3D model — read `docs/agents/assets.md` first: `public/` ships verbatim to the live site, so a file dropped there goes public with nothing referencing it.

⚠ Proving anything in a browser (320px · reduced-motion · refresh-and-resume) → `docs/agents/browser-verification.md` first — `--window-size` does not reflow the layout, and a screenshot of it will lie to you

Session saving (window · where each fact lives · what must never sit in this file): `.claude/commands/save-session.md`
