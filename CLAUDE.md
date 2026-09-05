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

**Game screens** — a game renders no `<a href>` inside the play surface; a double-tap on a transition lands on it and leaves the round. The surface is `#stage` on a shell-rendered game, and the whole of `src/play/<id>/` on a play route — the directory **is** the boundary, because page chrome lives outside it: ADR-0014, retargeted by ADR-0041, re-scoped by ADR-0055. The one crawlable outbound link lives in static page chrome above the surface, and today it points at `/`. What is load-bearing is that the link is static and sits outside the play surface — not where it goes. Two instruments, two owners: `scripts/no-nav-in-stage-check.mjs` scans both regions for literal anchors, and player names reaching the DOM are a separate, attacker-owned channel guarded at the escape sink by `src/play/name-escaping.test.mjs` (ADR-0026). Neither substitutes for the other. ⚠ The gate fleet reaches `src/play` as of gh#170 — but `arm-gate-coverage-check` asks only whether a route calls `armAllButtons` **somewhere**, never whether every reveal path is covered, and one route shipped three bypasses hiding 23 ungated buttons behind its green. A route's own `arm-reveal-paths.test.mjs` is what closes that, and all 11 routes now have one (gh#170). ⚠ **Closing a modal is itself a reveal** — the control behind it is enabled and its arm window long expired, which is exactly why a second contact fires it; three routes shipped comments arguing the opposite ("nothing is rebuilt, so nothing to re-arm"). Which CLOCK that gate reads is ADR-0059 — the browser's input stamp, never handler time, and the rule binds every file with its own timer on that constant, not the one a ruling happens to name. The whole class IS gated: ADR-0057 (accepted 2026-09-01) — every close, cancel and confirm path arms its region, and each route's `arm-reveal-paths.test.mjs` carries a close-path case (gh#187).

⚠ Before running a build · **deleting or renaming a page** · driving two headless probes at once · or putting a choice to the site owner → read `docs/runbook.md` first · verifying anything the way CI does, or reading CI's own verdict → `docs/agents/ci-verification.md` (a local green predicts CI only via `scripts/run-workflow-gates.sh`, never a hand-picked subset of gates; it also carries the per-step endpoint) · **before writing any verification command** → `docs/agents/shell-traps.md`, the six ways a probe reports a number that is not true.

⚠ **A brief's Premise cites the ticket's LAST comment, never a handoff's summary of it.** Six briefs in one session (2026-09-05) carried a premise this tracker had already reversed: gh#104 was briefed as not owner-reserved while its label had been moved to `ready-for-human` for exactly that reason, and a twice-recorded owner exemption in `scripts/party-size-claim-check.mjs` was briefed as a "gate hole" to narrow — a worker's `REFUSED` was the only thing that stopped it. A gate green on an apparent violation is a carve-out until its own comment says otherwise; read that comment and the ticket's last word BEFORE the brief. Same session, the opposite error: the refusal then over-read the freeze onto files the same doc's next sentence explicitly unfroze, so read the sentence after the one that proves you wrong.

⚠ **A text grep cannot answer a question about a runtime value.** `grep -c playRoute src/games/manifest.ts` returns 0 while importing that module and filtering on `playRoute` returns all eleven route ids — the field is declared in each game module and composed at import time. Claims about a property, an export, or a resolved config get EXECUTED, never searched for by name; a zero from one file's text is not evidence a runtime property is absent. On 2026-09-05 that zero was published as a refutation of a correct design and written into a brief telling the worker to distrust it.

## Batch boundaries

Deploy once per work batch, never per feature: approved work stacks as local commits while agents
keep building; the batch's ONE src push to main still gets ONE ask, with the evidence line. Never
defer: gate re-records, REFUTE findings, verification — a red blocks everyone.

**The SH batch is PRE-AUTHORIZED (owner ruling 2026-08-29) — do it, don't ask.** At session save,
in one pass, no per-item questions: (1) docs commits stack locally, NO push at save — they ride the next src push (ADR-0049, amended 2026-09-04);
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

⚠ Before writing a BRIEF for an agent — never hand it a source path with a line number. A brief's
citations are content, not context: the agent copies them into the comments it writes and reds
`added-lineno-citation-check`. Name the durable symbol instead — full rule and the incident:
`docs/agents/src-edit-rules.md`

⚠ Before adding ANY binary — image, font, 3D model — **or generating an OG image** — read `docs/agents/assets.md` first: `public/` ships verbatim to the live site, so a file dropped there goes public with nothing referencing it, and Thai text rendered the wrong way shatters into dotted circles while the script exits 0.

⚠ Proving anything in a browser (320px · reduced-motion · refresh-and-resume) → `docs/agents/browser-verification.md` first — `--window-size` does not reflow the layout, and a screenshot of it will lie to you

Session saving (window · where each fact lives · what must never sit in this file): `.claude/commands/save-session.md`
