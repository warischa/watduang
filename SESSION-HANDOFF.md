# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state


### S2026-10-21#2
done: RH U round + pick "go all Execute Plan" then "Go 1-4" (in-session, no /orchestrate) · DEPLOYED `818f5ff..f787e39` (`4921145` manual probe `scripts/one-bomb-how-dialog-probe.mjs` + `session.cdp` passthrough in `scripts/driver.mjs` · `635da8f` `f787e39` gh#286 evidence); branch CI 39626654122 success (every probe step ran) → main 39629216560 success, Deploy success; local gates 51/51; live `bash scripts/live-site-bytes.sh dist <origin>` same=197 diff=0 miss=0, 1-byte mutant copy diff=1 (batch has 0 src paths, so the match proves prod intact, not that the deploy changed it) · gh#286 relabelled ready-for-agent; box 1 answered on runner via branch-only workflow `gh286-diag` (runs 39622359316, 39626259353): dialog IS the +79px box, last rules line +52px, no scroll — but runner has no Thai face, DejaVu tofu; same job with `fonts-noto-core`: FITS -63px; Mac Thonburi FITS -54px — comments 2026-10-21 (last 15:32Z) · FILED gh#287 (needs-triage, runner tofu = instrument finding) + data-point comment · remote branch `ci/batch-1021` deleted · local branch `ci/gh286-dialog` deleted (on origin at 20ad118) · trash: `~/.claude/projects/-Users-waris-c-claude-free-game/batch-1020c/` (5.5M CI logs + artifact of a deployed batch, 0 refs outside the archive)
dec: owner popup 2026-10-21 U: delete `ci/batch-1021` · gh#286 agent may run box 1 incl. `ci/*` push (taken) · owner chat: file gh#287 · owner popup: push batch to main (taken) | agent: diag in its own workflow file, never a `ci.yml` step (gate meta-check audits every ci.yml run step) · DoD boxes never ticked (`docs/agents/issue-tracker.md`) · evidence PNGs stay gitignored, screenshots live in run artifacts
next: [ ] gh#286 boxes 2-3 — no measured defect at 320x568 in any Thai face (Mac -54px, Noto -63px; tofu only +52px), box 3's runner number reads tofu — ruling home: gh#286 comment 2026-10-21T15:32Z · Blocked · ask: close gh#286 as no defect, instrument → gh#287 (a) / keep open for a canvas margin fix, e.g. dialog scrolls inside its overlay (b)
next: [ ] gh#287 runner has no Thai font — DoD box 1 (enumerate routes whose rendered Thai is not a self-hosted face, via `CSS.getPlatformFontsForNode`, not the declared stack) is agent work once triaged · Blocked · ask: triage gh#287 ready-for-agent for box 1 (a) / leave needs-triage (b)
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account · Blocked · ask: unblocks when H: gh#9 lands (`dig +short watduang.com A` empty 2026-10-21)
next: [ ] ask: cleanup — remote branches `ci/gh286-dialog` (head 20ad118: 3 branch-only diag commits not on main; runs keep artifacts ~90d) · `ci/batch-1021b` (head f787e39 = main); evidence `git ls-remote --heads origin 'ci/*'` · delete both (a) / keep `ci/gh286-dialog` until gh#287 is decided (b)
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — adds (S2026-10-20#2, still open): freeze-tap ready button fully on screen at 320 (variant A), shared player screen edits inert after the start press, undo bar returns after a refused start
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — main = origin/main `f787e39` + this save commit (local, unpushed; rides the next src push); prod = `f787e39`; 0 open PRs; worktrees none; remote `ci/gh286-dialog` 20ad118 + `ci/batch-1021b` f787e39; no bg tasks
spent: queue 3→4 (3 done, 1 carried, 2 new asks + 1 cleanup ask) · batches 2
errors: skipped an advised pre-push check (gate meta-check) → one red branch run wasted · a popup premise count written from memory (6 commits, real 5) — corrected in chat before the push
