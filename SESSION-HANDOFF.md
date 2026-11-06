# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-11-06#2
done: RH + `/orchestrate all Execute Plan` · DEPLOYED `d2096b0` = gh#293 zero-test-file reporter on both unit steps (CI main 42171534607 success; its log reads "zero-test check: 127 files" / "2 files") · gh#293 closed with evidence · `e83b9d7` = ADR-0074 amended + `docs/verification/evidence/gh292-feedback/node24-2026-11-06.md` · PROD feedback Function App: 64-bit worker + `WEBSITE_NODE_DEFAULT_VERSION=~24` (runs node 24.22.1) · gh#294 filed (cold-start 500) · gh#290 comment (triggers re-checked) · gh#294 diagnosed: idle cold POST = SWA proxy 500 "Backend call failure" at 45.3s, no row; the cold boot outlasts the proxy · PROD `WEBSITE_RUN_FROM_PACKAGE=1` + config-zip of unchanged `786ee65` source → fresh-host starts 303 in 8.3s / 9.8s / 11.5s (app-setting change = the positive-control cold trigger) · ADR-0074 deploy command now sets the setting · gh#294 closed with evidence · evidence `docs/verification/evidence/gh294-cold-start/2026-11-06.md`
dec: owner popups 2026-11-06 (recorded here, not on tickets): Node 24 pre-auth (revert on red) · push 3 commits · close gh#293 after CI green, file gh#294, comment gh#290 · gh#294 experiments in order: 1 run-from-package, 2 single-file bundle | agent: gh#293 predicate = count of credited summaries equals ran files (fork-return after REFUTE round 2; a child's summary label is forgeable)
next: [ ] gh#290 · gh#291 residual tickets — record only (re-checked 2026-11-06, gh#290 comment); `/feedback/` has no overflow probe at all — record only, no open decision consumes it
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account · Blocked · ask: unblocks when H: gh#9 lands (`dig +short watduang.com A` empty 2026-11-06)
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — adds: send the /feedback/ form from a real phone with a Thai keyboard (lands on /feedback/sent/, one row) · the home h1 at a phone width · every add at S2026-10-26#2 (archive) and the device boxes of gh#204 (7, 9), gh#205 (1), gh#219 (1)
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — main = origin/main `e83b9d7` + this save, unpushed (docs only); prod site = `e83b9d7`; live function = `786ee65` source, run-from-package, 64-bit, `~24`; 0 open PRs; worktrees none; bg tasks none; feedback CSV 2026-11 holds tagged test rows "[gh#292 test]", "[gh#293-n24 test]", "[gh#294 test]" (age out at 180 days)
errors: one class, three instances — a probe's reading trusted before its precondition was proven: exit codes read from `$?` after a `$(...)` (all 0, re-measured), `az functionapp restart` assumed to cold-start (answers in 0.3s), two idle probes with no app shutdown event (not conclusive; an app-setting change was the trigger that proved it) · REFUTE rounds 1 and 2 each found a [mechanism] in the zero-test predicate; the cap forced the fork-return that chose the count

