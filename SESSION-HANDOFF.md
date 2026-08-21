# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-21#4

done: **4 commits `2e93e9e`→`f3c8f9a`, all pushed · CI green incl. `Deploy to Azure Static Web Apps` on every one · open issues 16→12** · **gh#59 CLOSED** — exemption compares occurrence COUNTS not set membership; `preImageText()` and its per-file `git show` DELETED (post minus pre equals added minus removed, so the diff already carried it); `SESSION-HANDOFF.md` exemption is now PER LINE — `next:` policed · `done:`/`dec:` exempt · unrecognised label policed (fails safe) · `inflight:` exempt behind `POLICE_INFLIGHT` · reopening that artifact cost 3 REFUTE rounds and found 6 more defects, all fixed: no `--no-renames` (a `git mv` out of the archive laundered a citation and printed green), a `-- `→`++ ` parser swallow (now a `diff --git`→header→`@@`→body state machine), `POLICE_INFLIGHT`'s "flip this line, nothing else" killing the selftest CI runs FIRST, `filesInDiff` built from added lines only (a `git rm` printed the force-push marker), a hunkless binary/mode block never recorded (this repo commits OG images), a 0-byte untracked file counting as 1 added line · **gh#58 CLOSED not-planned** — the anchoring was BUILT, verified, then REVERTED · **gh#56 CLOSED** — `StoredSession.cpOwner`, mints when `'same-round'` meets a foreign-owned blob, hands over so it settles instead of minting on every later resume · **gh#54 CLOSED** — owner's Thai string into `#setup-error` over a new `watduang:mount-failed` event, dispatched inside the EXISTING `queueMicrotask` after the un-hide · `scripts/mount-failed-network-probe.mjs` + `session.failRequests()` on `driver.mjs` (CDP Fetch) rejects a real chunk; pre-fix worktree FAILs with the notice absent, current build PASSes · tests 173→179 · `astro check` 0 · 14 pages · 13 gates

dec: **ADR-0025 amended** — empty-scan causes are an OPEN set and NO running total is stated in either doc (a count in two files drifts apart); the `--no-renames` rationale I first wrote was FALSE and is corrected in place WITH the slip recorded, because the parser rewrite and not the flag is what closed cross-funding · gh#58 declined on ADR-0024's own unmet precondition plus its measured 0-collisions-in-98, and because a geometric band check enumerates {stage-control boxes}×{dialog band}, which is unowned and never converges · gh#56 = option A; B measurably INVERTS the control and E was declined 2026-08-19 · gh#54's string and its `#setup-error` slot are the owner's, chosen this session · browser probes stay MANUAL per gh#43 · gh#54's ticket comment on the slot beat the code comment, which was stale

next:
- [ ] owner: tick or reject gh#53's 5 boxes. 4 read as met against the tree. Criterion 3 cites a LINE RANGE in `src/shell/session.ts` that has rotted — re-anchor it to `LEGACY_ID` and the absent-`gen`-reads-as-0 rule. Done when gh#53 closes or that criterion is re-worded
- [ ] owner-run: gh#9 domain → gh#29 AdSense. `dig +short watduang.com NS` EMPTY, re-verified at this save. Blocks the ONE remaining box on each of #15 #16 #17 #18 — **those four tools are BUILT and shipping**, only the ad box is open, do not re-scope them as unbuilt
- [ ] owner-run: gh#13 last box — `docs/verification/gh13-real-device-script.md` on one real iPhone. An agent CANNOT do this; the simulator tooling reaches simulators only
- [ ] owner: gh#12 keyword planner · gh#19 month-6 organic-clicks gate
- [ ] the citation gate polices repo FILES only. GitHub issue bodies and acceptance criteria are unpoliced, and gh#53 is live proof the rot class survives there

inflight: measured at save — tree clean apart from this save · open PRs 0 (checked `gh pr list`) · bg tasks 0 (checked) · ALL PUSHED, `origin/main..HEAD` empty before this save's own commit

spent: queue 8→5, all 5 owner-blocked · batches 3 · dispatches 15 · fable 5 (1 SOLVE fork + 4 REFUTE across 2 artifacts; 1 abort returned nothing and burned no round) · GitHub writes 8 comments + 4 closes · ctx ~370k at save
