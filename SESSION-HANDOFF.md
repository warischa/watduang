# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-15#7

done: **5 commits, CI green on each, deploy step `skipped` every time (0 secrets)** — `90b3364` game 3 จับไม้สั้น `short-stick` · `0e9271b` timebomb pulse guarded for reduced-motion + ADR-0011 + 2 doc fixes · `bba2b11` whois guard · `b06db57` game 4 วัดดวงวันนี้ `daily-fortune` (53 คำทำนาย) · `f7538e7` game 5 ดวงความรัก `love-match` (31 lines / 5 bands) + SARA AM unified in the shared `normalizeName`. **6 games live**; #5's v1 table complete except locked rows 4/5. Filed #30 #31 #32 #33 #34; closed #30 #31 #32. 122 tests. Browser evidence `docs/verification/evidence/{30,31,33,34}/`. `issue-tracker.md` state table **deleted** (wrong in both directions inside one session) → `gh` is the only state source. Session crossed Bangkok midnight; entry keeps the 08-15 stamp because 5 commits + 3 issue comments already cite `S2026-08-15#7`.

dec: **ADR-0011 (new)** = content library unlocks per game by risk class, not wholesale · rows 6+7 unlocked, row 5 dare-library locked (the one account-termination risk), **row 4 explicitly undecided — not swept in** · its advice-register rule was reworded mid-session: the first wording carried 2 clauses of different width and 3 items in row 6's own pool fell between them · determinism IS what separates `daily-fortune` from เซียมซี (ADR-0002), not styling — random-per-tap would be a re-skin · none of the 3 new games writes a checkpoint → ADR-0010 unfired, เซียมซี still sole writer · #12 **not closable** — ADR-0003:23 forbids it and the body disclaimer it demanded already exists · manual-review rule kept universal, not dare-library-only

next:
- [ ] **owner reads 53 items (#33) + 31 lines (#34)** — last box on each, gates ADR-0011, no agent may tick (ADR-0009). Done when the owner confirms both sets read, then both issues close
- [ ] row 4 locked until rows 6/7 show results · row 5 locked (ADR-0011)
- [ ] #29 AdSense account + pub-ID — owner-run (Google identity + payment; an agent must never enter them). Done when the owner confirms the account shows Ready and hands over the `ca-pub-` ID, then #29 closes
- [ ] deploy chain `bash scripts/site-owner-wizard.sh` §1/§2/§4 — owner-run. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:209`) — every push pre-auth void, re-gate it
- [ ] #13 #14 #15-#18 blocked on the ad-slot box alone — needs #29; no agent work closes them
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010)
- [ ] home page links `/games/` but names no game — 6 game keywords get no internal link from the highest-authority page, while the tools line names all 4. Owner copy call
- [ ] #12 relabel-only if ever touched

inflight: measured at save — tree: this save only · `f7538e7` pushed, 0 ahead · open PRs: checked, none · CI green on `f7538e7` (`31899402100`) · open issues: 14 · GitHub writes this session: 5 filed, 3 closed, #1 body annotated (1 line, round-trip verified)

spent: queue 10→8 — **7 of RH's 10 resolved · 3 carried · 5 new surfaced** (churn, not shrink) · batches 5 · ctx 41% at save · ended early: no — every agent-doable item Done, rest owner-blocked
