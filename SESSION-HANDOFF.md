# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-26#1

done: **9 issues closed, 3 deploys, 11 commits, all pushed and live** · gh#82+83+84 carry-over (dirty through 3 sessions) committed and CI-green · gh#86 opt-in page chrome · gh#90 seven tool artboards · gh#96 solo page class, approach A per ADR-0040, two validator rules hand-calibrated · gh#105 chrome gate widened to a recursive walk over every built page, three legs, opt-in leg inverted · gh#87 home = direction C สนามวัดดวง, four manifest fields removed with a tripwire test · gh#91 tools off the shared roster, own keys, canary-proven · gh#92 real wheel, picker drives the angle and never the reverse, an 8px ad reflow found and fixed · gh#88 category pop-cards, accent from the manifest name with zero per-page colour · gh#93 จับฉลาก+แบ่งทีม UX, a per-draw ad walk found and fixed · **`/games/` DELETED** (ADR-0041) with a 301, ADR-0014 retargeted, 5 stale Thai claims deleted, no Thai invented · 3 detector defects fixed: a commented marker counting as a rendered one, a probe selector that could never match again, and a mid-spin stale reveal
dec: ADR-0041 · owner 2026-08-26: ship gh#96 accepting `/game/love-match/` broken until gh#101 · content tickets wait for owner Thai · delete wrong copy rather than reword it · gh#106 gh#107 rulings parked · batch 3 = gh#92 gh#88 gh#93
next:
- [ ] **FOCUS gh#94** — narrow the continue-into-a-game path to the party หมวด. Unblocked by gh#91. Likely dissolves half of gh#111. Done when it closes
- [ ] owner: Thai copy for gh#101 (fixes the live dead end), gh#97, gh#99, and the two labels on gh#112. Blocks every content ticket
- [ ] owner: does a category page get the top bar? gh#88 shipped without it because the chrome opt-in set is home-only by your own ruling, so widening it is yours. Done when the allowlist is decided
- [ ] owner: gh#89 rule — five instances deleted, the home grid heading and its link still disagree. Done when the rule names permitted surfaces, not banned strings
- [ ] agent: gh#110 gh#113 — both mechanical, no owner input. Done when they close
- [ ] agent: gh#108 azure/login on a deprecated Node 20 runtime. Prove on a throwaway branch; the deploy path cannot be verified any other way
- [ ] agent: `docs/runbook.md` is 12018 of 12288 bytes. Route a section out before the next append
- [ ] owner: judge the 7 new tool artboards and the new wheel by eye — nobody has looked, only machine checks
- [ ] owner-run: gh#9 domain then gh#29 AdSense, still blocking the last box on gh#15 gh#16 gh#17 gh#18 · gh#13 real-device script · gh#12 · gh#19
- [ ] agent, PARKED by owner 2026-08-25, needs a new decision: re-run the hero as a true transparent cutout
inflight: measured at save — 2 dirty paths, both this save's own writes · 0 unpushed · 0 open PRs (checked) · 1 worktree, the main checkout (batch worktrees removed, branches deleted) · 0 background tasks (checked) · 38 open issues (checked)
spent: queue 12→10 · batches 4 · ctx 581k at save · 9 tickets filed gh#105 gh#106 gh#107 gh#108 gh#109 gh#110 gh#111 gh#112 gh#113, of which gh#107 closed by ADR-0041
