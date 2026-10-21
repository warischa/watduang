# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-10-21#1
done: RH pick "do all plan go" (A rows 1-3, in-session, no /orchestrate) · DEPLOYED `69988d7..818f5ff` (`7055c49` gh#285 fix · `2748c48` `scripts/live-site-bytes.sh` + runbook pointer · `d466541` fit probe names clip box + furthest-below descendant · `818f5ff` one-bomb evidence); branch CI 39536646395 success (every probe step ran) → main 39538135084 success, Deploy success; live `bash scripts/live-site-bytes.sh dist <origin>` same=197 diff=0 miss=0 on a fresh 818f5ff build, which differs from the dc41c1a build in 45 entries (so the match is discriminating) · local gates 51/51 · CLOSED gh#285 w/ evidence + decision comment · FILED gh#286 (needs-triage) · one-bomb 320 runner clip named: `div.glassPanel.modalBox` 294x571 +79px (inferred `#howModal`, open state unmeasured) — evidence `docs/verification/evidence/one-bomb-320-clip-2026-10-21/` (runner section = local `6c36e20`) · remote branch `ci/batch-1021` left in place · trash: `~/.claude/projects/-Users-waris-c-claude-free-game/batch-1020c/live-check.sh` + `live-mustred.txt` `live-post.txt` `live-pre.txt` (superseded by the committed script)
dec: owner popup 2026-10-21: push branch first, then main if every step green (taken) · owner chat 2026-10-21: file gh#286 · gh#285 semantics (close during start save = abandon; landed save stands; refused save writes its folded x) recorded on the gh#285 close comment | agent: close counter, not isOpen (close-then-reopen case; the isOpen mutant reds it) · probe clip line printed only when clipped > 0, so 0px lines are byte-unchanged
next: [ ] gh#286 one-bomb how-to-play dialog clipped at 320x568 on the CI runner — needs-triage; crit: ticket DoD box 1 (dialog OPEN on the runner, its box + last rules line's box vs `#app`), then the owner picks the fix on the canvas (ADR-0033)
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account · Blocked · ask: unblocks when H: gh#9 lands (`dig +short watduang.com A` empty 2026-10-21)
next: [ ] ask: cleanup — remote branch `ci/batch-1021` (head 818f5ff, which is on main; evidence `git ls-remote --heads origin ci/batch-1021`) · delete (a) / keep (b)
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — adds (S2026-10-20#2, still open): freeze-tap ready button fully on screen at 320 (variant A), shared player screen edits inert after the start press, undo bar returns after a refused start
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — main = origin/main `818f5ff` + `6c36e20` + this save commit (local, unpushed; ride the next src push); prod = `818f5ff`; 0 open PRs; worktrees none; no bg tasks
spent: queue 4→3 (3 done, 1 carried, 2 new) · batches 1
errors: a commit-message claim written from memory, not the test output ("onStart ran twice"; it ran once in each of two cases) — caught on reread, amended before push

