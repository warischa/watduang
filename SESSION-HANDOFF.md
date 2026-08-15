# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-15#5

done: **`e0c4479` pushed · #20 CLOSED · capture-staleness bounded · AdSense gap filed** — `c5461e7` (+150/−1) + `a5806df` (+9/−2) pushed, CI green on both. New § in `docs/agents/browser-verification.md` bounding when a committed capture goes stale; REFUTE round 1 ruled draft 1 **unsafe** (seam list missed the two `.astro` files the unit suite cites by line but never executes; over-generalised to visual checks) — both fixed, `a5806df` pinned visual verdicts. `pick-loser` proved at `e0c4479` → `docs/verification/evidence/pick-loser/01`: 320px PROVEN · reduced-motion N/A (`getAnimations()`=0 both runs) · refresh-clean PROVEN · collision-guard PROVEN (siamsi checkpoint byte-identical through a full pick-loser round + refresh, still resumed). #10 · #24 · #28(+amend) · #29 · `site-owner-checklist.md` §5 + `:47` · ADR-0009 § Outcome scored. 96/96 · tree clean.

dec: **capture staleness = point-in-time + decidable re-trigger** — rule in `docs/agents/browser-verification.md`, reasoning scored in ADR-0009 § Outcome; reason is that a per-commit seam test **terminates**, NOT that future commits are "unowned" (that misreads ADR-0009 — do not re-derive it) · seam list is illustrative, not exhaustive · **visual captures sit outside the rule** — pinned to their commit, re-triggered by ANY shared CSS/layout/script-loading change · #20 needed no third capture; "fresh at HEAD" would have made the box permanently unclosable · **deploy chain alone does NOT unblock the 4 ad-slot boxes** — prior state claim wrong: no AdSense account, no pub-ID, no `ca-pub` in `src/` → #29 · aged-record silence is by design → #28, no code · agent claim REFUTED: CI's sitemap gate already loops all 4 tools (`ci.yml:130`)

next:
- [ ] #29 AdSense account + pub-ID — owner-run (Google identity + payment details; an agent must never enter them). Done when #29 boxes 1-2 tick
- [ ] deploy chain `bash scripts/site-owner-wizard.sh` §1/§2/§4 — owner-run. Done when `gh secret list` lists `AZURE_STATIC_WEB_APPS_API_TOKEN`. ⚠ **consequence: from that moment `git push` to `main` IS a production deploy** (`ci.yml:208` flips) — every push pre-auth void, re-gate it
- [ ] #28 aged-record 6h bound — owner accepts or changes it; no code. If changed, `MAX_AGE_MS` (`session.ts:5`) + `session.test.mjs:413`'s 7h fixture move together
- [ ] #12 keyword measurement — owner-run (Google Ads login)
- [ ] `docs/verification/tools-15-18/15.md:135-137` calls #15-14 UNPROVABLE against the **old** box text — **annotate, never rewrite**: it records a walk
- [ ] CI actions on deprecated Node 20 (`checkout@v4`, `setup-node@v4` forced onto 24) — informational, not failing. Done when both bumped and CI green
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010)

inflight: measured at save — tree clean · `a5806df` pushed, no ahead-count · open PRs: checked, none · CI green on `c5461e7` + `a5806df` · GitHub writes: #10 · #24 · #28(+amend) · #20 closed · #29 (body repaired after a shell-quoting truncation — re-verified full) · 4 subagents returned, 1 claim refuted, 0 verify failures

spent: queue 6→7 · batches 1 · ended early: no — every Required/High item Done or owner-Blocked
