# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#3

done: **[#16][#17][#18] tools 2-4 shipped `94505f6`** — `/tool/draw/` `/tool/team/` `/tool/number/` · `src/tools/{draw,team,number}.ts` + tests · 47 tests · `EXPECTED_TOOL_SLUGS`=`"wheel draw team number"`, **calibrated both ways** (fires on a removed page, passes on a restored one) · `/tools/` lists all 4, "กำลังทำ" section deleted · **CI green `31774307651`, every gate incl. the 3 added in #15** (Deploy still skipped — no secret) · pre-merge REFUTE caught 2 blockers, both fixed before commit · comments → English per § Language · filed [#21][#22] as sub-issues of #14 · PartyPick confirmed

dec: ADR-0006 (PartyPick confirmed — closed, not merely unexamined) · ADR-0004 §เพิ่มตอนทำ#16-#18 (a party-size guard belongs to the page, not the logic module — it was enforced against the *remaining* pool and stranded the last name · `pickNumber` range now capped) · `docs/runbook.md` § ตรวจงานให้เหมือน CI (agent shell is zsh, CI is bash — wrap verification in `bash -c`)

next:
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same pass: #20 siamsi mid-round → refresh → must restore · **and the 3 new tool pages — reduced-motion + 320px were asserted from markup, never seen in a browser**
- [ ] [#21][#22] `ready-for-agent`, sub-issues of #14 — `max`-side silent drop · discoverability of the "คนที่ 1, 2, 3…" mode · #21 carries the *rejected* fix (storing the clamped group) so nobody re-proposes it
- [ ] #9 register `watduang.com` (site owner) — `whois` free (checked 2026-08-14) · #19 blocked by it
- [ ] Azure SWA phase 2 — site owner sets `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer `skipped` in `gh run view` · **the only thing that can prove CSP/AdSense for real**

inflight: measured at save — working tree clean after this commit · open PRs: none (checked `gh pr list`) · no background tasks · `94505f6` pushed, this save commits on top
