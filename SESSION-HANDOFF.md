# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-10-17#1
done: RH pick "all 4" via /orchestrate-claude-api (ledger `~/.claude/projects/-Users-waris-c-claude-free-game/orchestrate-ledger-f0fee4b2.md`) · NEW artifact on `gh264-integrate` above `be27bf3`, main NOT pushed: `8a43cce` · `6138d43` · `c74b9bb` · `c7ac65d` · `1f83a35` (merge of main docs, LOCAL only; origin branch = `c7ac65d`) · fork + REFUTE r1/r2 + re-fork on codex, cap spent · gh#267/268 triaged → ready-for-human · filed #269 #270 #271 #272 (needs-triage) · worktree `f0-t1` removed · trash: `.claude/worktrees/diag-f0-{d1,d2,d3,t1,t2}` (2.4GB scratch; scripts kept in `~/.claude/projects/-Users-waris-c-claude-free-game/gh264-ci-red-2026-10-16/diag-f0-keep/`)
dec: owner popup 2026-10-17 (recorded here, not on a ticket): push deferred · file the 4 follow-ups | agent: REFUTE r2 stylesheet-only-reveal finding = pre-existing (base RAN in the judge's replay) → #269, not fixed · no audit red for controls inside `data-shows-before-players` headers (modal reveals covered by each route's arm-reveal-paths test) · lock skip extended to "key present, no `players` list" · RH line "NEW artifact" read as owner go for a new cap
next: [ ] push: merge `main` (this save) into `gh264-integrate`, ff `main` to it, ONE ask with evidence ⚠confirm — lane @`c7ac65d` failed=0 not-executed=0 (log `gh264-ci-red-2026-10-16/lane-c7ac65d-gates.log`), branch CI 38935873894 success with probes + WebGL pixels RUN; docs-only on top since. Revert: `git revert a660ae4..<tip>` + push. crit: CI green on main + Deploy step success
next: [ ] after deploy: live check (runbook § "The live site's address, and two things that will send you to the wrong one"), then close gh#265/266/264 from `gh264-ci-red-2026-10-16/close-26{4,5,6}.md` — drafts pinned to `a1387c6`: fill run id + live result, update range + gate counts + gh#264 review history; gh#266 line "only later croc-bite change is `8623219`" is FALSE now (`2ed8dc8` `6138d43` `c7ac65d`) — re-measure or reword · file the PlayerSetup retire ticket · gh#141 comment for § "Shared player screen — every party play route (gh#264, shipped 2026-10-16)" (heading date needs the real ship date). crit: read-back of each
next: [ ] triage #269 #270 #271 (filed 2026-10-17); #270 = agent work (probe-scope must run probes when probe scripts change)
next: [ ] gh#272 · Blocked · ask: (a) multi-second wait on a real legacy migration / roster save on low-end 3D devices acceptable (b) bound it (render-scheduling change)
next: [ ] owner review · Blocked · ask: (a) zero-trigger `seo.steps[0]` agent copy `เลือกจำนวนคนเล่นในวง 2-10 คน ตั้งชื่อได้ หรือใช้ชื่อสัตว์ประจำตัวที่ให้มา` ok? (b) agent sentences on board frames 8-10 ok? (c) zero-trigger start text dark-on-cyan ok? (d) cursed-number white-on-purple 3.96:1 keep or fix?
next: [ ] record only: KNOWN_OVERFLOW rows freeze-tap/pinocchio measure 0 (fit-probe warnings); one-bomb 320 reason names removed `#startPlayBtn`; cannon-flag test modal close arms nothing (unreachable); `stripTypeScriptTypes` ExperimentalWarning noise in seat-cap
next: [ ] ask: cleanup — remote ref `gh264-ci-probes-c74b9bb` (throwaway CI branch; its commit `c74b9bb` is on `gh264-integrate`) · proposed: `git push origin --delete gh264-ci-probes-c74b9bb`
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account; gh#19 month-1 dates question raised 2026-10-13 · Blocked · ask: unblocks when H: gh#9 lands
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` incl. the gh#264 section
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — origin/main `a1387c6` CI RED (38853027159), prod = `a660ae4` content; local `main` = this save on `3aed6c0`; `gh264-integrate` local `1f83a35`, origin `c7ac65d`, worktree `.claude/worktrees/integrate` clean; remote throwaway ref `gh264-ci-probes-c74b9bb`; 0 open PRs; no bg tasks
spent: queue 6→8 · batches ~8 (ledger throughput line)
errors: **(1) fixed the named probe, not the class** — the sibling play-exit probe redded the next CI; the fork had named "any leg using findTransitionTrigger", the brief scoped one file · **(2) read "จบ task นี้ SH" as stop** and killed a running diagnosis (meant: finish, then SH) · **(3) local no-WebGL Chrome hid CI-only paths again** (croc 3D-boot lock starvation) — recurring class, memory `browser-flags-choose-which-code-path-you-test`

