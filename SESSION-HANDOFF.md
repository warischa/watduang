# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state



### S2026-10-20#1
done: RH "all Execute Plan" via /orchestrate (ledger `~/.claude/projects/-Users-waris-c-claude-free-game/orchestrate-ledger-e48d9cbc.md`) · DEPLOYED `58930d8..8cd8d37` (`c992ce9` #280 · `056fd4b` docs · `758d5a7` #278 · `a92e624` #269 · `8067b12` #279 · `f9237d4` #277 · `35302a8` #268 · `2e59054` CI wiring · `8cd8d37` band-probe clientWidth fix); main run 39378691356 red (play-top-band, Linux classic scrollbar; deploy skipped) → run 39380819442 success, every probe step ran; live check PASS (17 pages + 32 assets byte-identical to local `8cd8d37` build, live != pre-batch build on 17/17) · CLOSED #268 #269 #277 #278 #279 #280 w/ evidence · filed #281 #282 #283 · REFUTE r1+r2 codex (cap spent), fork-return used · global: orchestrate 1.20.6 committed in claude-skills-index `8bdcde7` (fork verdict beats DoD wording) · `~/.claude/docs/shell-gotchas.md` +lsof line (uncommitted, by design) · ADR-0073 written · trash: `~/.claude/projects/-Users-waris-c-claude-free-game/batch-1020/dist-base` · removed stale `scripts/mount-failed-network-probe.mjs` (0 refs, its header said re-point or delete; revert = this save commit)
dec: ADR-0073 (CSS hold + arm-at-release) · owner popups 2026-10-20, each recorded on its ticket: #279 both ADR-0024 properties on both dialogs · #268 band variant B 56px, pill beside X, same height every viewport, `#14142b` · #269 (c) + one-bomb/croc-bite pre-open · #279/#277 DoD amendments · freeze-tap ships with band → #281 · fit baselines re-recorded except pinocchio → #282 | agent: #277 body must-red replaced by `.ps-dialog, .ps-dialog *` (premise dead; correction on #277) · hold floor strict only when WebGL live, missing roots reported otherwise · cannon-flag/power-meter 320 fit rows left warning (owner popup: reclass next batch)
next: [ ] #283 x pressed during a pending start save — crit: harness test red on current code (round players != saved roster), green after; render-hold + every arm-reveal-paths test green
next: [ ] #281 freeze-tap 320 layout under the band: paint on the board first (ADR-0033) · Blocked · ask: owner approves the painted layout (a) approve (b) revise — crit after code: `#playerReadyBtn` fully visible and centre-hit at 320x568 on every forced draw (n ≥ 9)
next: [ ] #282 pinocchio-luck fit growth before the band (136/14/17 → 214/114/118) — bisect on the 390 row; sideways reading flaky (64px vs 0px, n=2, addendum on #282) — crit: ticket DoD
next: [ ] reclass cannon-flag + power-meter 320 fit rows from "not a defect" to an owner ruling at all three viewports (320 now 20px / 100px from the band; 390/1440 px unchanged) — owner popup 2026-10-20 chose "next batch"; ruling recorded here, not on a ticket — crit: fit probe prints no warning for those rows and `play-screen-fit-probe.test.mjs` green
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account · Blocked · ask: unblocks when H: gh#9 lands
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — this batch adds two things a real phone must see: the 56px top band (pill beside the X) on every party route, and gameplay hidden until the player screen hands over
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — main = origin/main `8cd8d37` + this save commit (local, unpushed; rides the next src push); prod = `8cd8d37`; 0 open PRs; worktrees none; no bg tasks; codex 5h 70% until 14:25
spent: queue 11→5 · batches ~4 (est., ledger)
errors: **(1) a premise relayed unprobed** — fork's #277 amendment-3 premise (body reaches dialogs) went to an owner popup, and T11's gap path (undo at start) went into a brief; both false, caught only by the workers · **(2) skipped the branch-CI rule** in `docs/agents/ci-verification.md` § "A runner-only failure is seen only by a runner — run CI on the branch before the main push (2026-10-16)" → main went red once on a Linux-only scrollbar width
