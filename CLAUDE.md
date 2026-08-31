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

**Game screens** — a game renders no `<a href>` inside the play surface; a double-tap on a transition lands on it and leaves the round. The surface is `#stage` on a shell-rendered game, and the whole of `src/play/<id>/` on a play route — the directory **is** the boundary, because page chrome lives outside it: ADR-0014, retargeted by ADR-0041, re-scoped by ADR-0055. The one crawlable outbound link lives in static page chrome above the surface, and today it points at `/`. What is load-bearing is that the link is static and sits outside the play surface — not where it goes. Two instruments, two owners: `scripts/no-nav-in-stage-check.mjs` scans both regions for literal anchors, and player names reaching the DOM are a separate, attacker-owned channel guarded at the escape sink by `src/play/name-escaping.test.mjs` (ADR-0026). Neither substitutes for the other. ⚠ Most of the rest of the gate fleet still globs `src/games` only and is blind to `src/play` — do not read any other gate's green as covering a play route.

⚠ Before running a build · **deleting or renaming a page** · driving two headless probes at once · or putting a choice to the site owner → read `docs/runbook.md` first · verifying anything the way CI does, or reading CI's own verdict → `docs/agents/ci-verification.md` (a local green predicts CI only via `scripts/run-workflow-gates.sh`, never a hand-picked subset of gates; it also carries the per-step endpoint) · **before writing any verification command** → `docs/agents/shell-traps.md`, the six ways a probe reports a number that is not true.

## Batch boundaries

Deploy once per work batch, never per feature: approved work stacks as local commits while agents
keep building; the batch's ONE src push to main still gets ONE ask, with the evidence line. Never
defer: gate re-records, REFUTE findings, verification — a red blocks everyone.

**The SH batch is PRE-AUTHORIZED (owner ruling 2026-08-29) — do it, don't ask.** At session save,
in one pass, no per-item questions: (1) docs commits + one docs push to main (ADR-0049 b);
(2) tracker writes for work VERIFIED DONE this session — close with an evidence comment, add the
gh#141 row per shipped game, one read-back to confirm; (3) cleanup — integrated agent worktrees
removed, budget sweep, memory/handoff writes. Condition that keeps the grant valid: every gate
green and the evidence cited in the save report. Outside the grant (still ask): closing a ticket
whose work is NOT verified done, anything money/prod-config, and the batch's src deploy.

## Language

**Write English. Ship Thai.** Effective 2026-08-14 — everything an agent reads or writes is English;
everything a player reads is Thai. The two never swap.

| Surface | Language |
|---|---|
| Every `.md` in this repo — `CLAUDE.md`, `SESSION-HANDOFF.md`, `docs/**`, ADRs, runbook, `CONTEXT.md` | **English** |
| Code comments, identifiers, commit messages, PR bodies, GitHub issue bodies | **English, with no domain-term exception** — `scripts/thai-comments.mjs` fails ANY Thai character in a comment under `src/**` and `scripts/**`, and that gate is the rule, not an approximation of it (gh#123, owner ruling 2026-08-29). Name the หมวด in a comment as `fortune` / `party`, never in Thai |
| `src/**` user-facing strings, UI copy, game and tool content, `seo.*` fields, OG text | **Thai — never translate.** This is a Thai-first product; the copy IS the product |
| Domain terms that *are* Thai words (`วัดดวง`, `เซียมซี`, `วงล้อสุ่ม`) | keep the Thai term verbatim inside English prose — **in `.md` files only** |

Quote Thai UI copy verbatim when a doc needs to cite it — quoting is not translating.

Chat mirrors the reader: English in → English out, ไทย เข้า → ไทย ออก. Chat language never changes
what a file gets written in — a Thai conversation still produces English docs.

Existing Thai docs convert on touch unless a session is told otherwise; a file being edited gets
rewritten in English in that same edit, not left half-converted. `docs/sessions-archive.md` is the one
exception and is never converted — it holds verbatim past entries, and translating them would make the
record no longer what was written.

## Agent skills

**GitHub Issues are the single source of truth** — the map is [#1](https://github.com/warischa/watduang/issues/1) · how to work the tracker, and the ticket-number rule: `docs/agents/issue-tracker.md`

Before writing code: use the vocabulary in `CONTEXT.md` and respect `docs/adr/` · labels: `docs/agents/triage-labels.md` · domain: `docs/agents/domain.md` · src-edit rules: `docs/agents/src-edit-rules.md` · porting a game from a mockup: `docs/agents/porting-a-mockup-game.md`

⚠ Before adding ANY binary — image, font, 3D model — **or generating an OG image** — read `docs/agents/assets.md` first: `public/` ships verbatim to the live site, so a file dropped there goes public with nothing referencing it, and Thai text rendered the wrong way shatters into dotted circles while the script exits 0.

⚠ Proving anything in a browser (320px · reduced-motion · refresh-and-resume) → `docs/agents/browser-verification.md` first — `--window-size` does not reflow the layout, and a screenshot of it will lie to you

Session saving (window · where each fact lives · what must never sit in this file): `.claude/commands/save-session.md`
