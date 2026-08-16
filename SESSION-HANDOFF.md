# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-16#1

done: **5 commits, CI green on each, deploy `skipped` every time (0 secrets)** — `acbf966` home page links all 6 games + 4 tools, iterating `src/games/manifest.ts` (+ new `src/tools/manifest.ts`) + never-tick convention recorded in `issue-tracker.md` · `ae8d605` corrected a false blocker claim · `104dc15` `CDP_STAGE2` usable without experimenting · `8d84b19` site-wide brand footer in `Base.astro` — nothing linked home before · `4462686` trap 6. Closed #33 #34 (owner confirmed the 53+31 read → ADR-0011 owner gate discharged). Filed #35 crawl-sink, `bug`+`ready-for-agent`. 122 tests. 320px re-proven post-footer on `/` and `/game/timebomb/`, detector calibrated 908/320.

dec: home enumerates games by **iterating the manifest, never hardcoding** — the roster grows (ADR-0002, ADR-0011 row 4) · names+links only, **never per-game `seo.description`** on home — that is where duplication with `/games/` starts · `src/tools/manifest.ts` is display data only, **not** ADR-0004's anticipated tools manifest; CI baseline slugs stay in `ci.yml:130,:173`, frozen at 4 by #11 · site-wide link is a **footer not a header**: `GameLayout` wraps `Base`, so it reaches game pages, and a game page is a phone mid-round · link-free game pages ruled a **bug, not intent** (owner) → #35

next:
- [ ] **wizard §2 Azure token** — owner-run; unblocks #13's real-phone pass (checklist §3 runs on `azurestaticapps.net`, needs no domain). Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it
- [ ] #9 register `watduang.com` — owner-run, payment. whois free 2026-08-16. Independent of §2, either order
- [ ] #29 AdSense account + pub-ID — owner-run. Done when the `ca-pub-` ID is handed over, then #29 closes
- [ ] #35 game pages are crawl sinks — `ready-for-agent`, but carries an owner-owned box (ADR-0009)
- [ ] #15-#18 ad-slot box only — needs #29. #14 has no DoD boxes. #13 needs §2, not #29
- [ ] row 4 locked until rows 6/7 show results · row 5 locked (ADR-0011)
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010) · #12 relabel-only if ever touched

inflight: measured at save — tree clean, 0 ahead · open PRs: checked, none · CI green on `4462686` · open issues 13 · branch `worktree-agent-a3373c30e64ce69da` fully merged into main, deletable · GitHub writes: 1 filed, 2 closed

spent: queue 8→7 · batches 3 · ctx 26% at save · ended early: no — every agent-doable item Done, rest owner-gated
