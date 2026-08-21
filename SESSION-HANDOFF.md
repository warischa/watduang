# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state
### S2026-08-21#5

done: **1 commit `72733e3`, pushed · CI green incl. `Deploy to Azure Static Web Apps`, 0 failed steps · open issues 12->13** · **gh#53 unblocked** — criterion 3 re-anchored to `LEGACY_ID` + the absent-`gen`-reads-as-0 rule; narrative marked historical and pinned to `29765a2`, deliberately NOT re-anchored (re-anchoring a fixed bug's description makes a record read as a live pointer); body read back byte-identical, 5 boxes unticked / 0 ticked — ticking and closing stay the owner's · **criterion 5's control RECORDED, it never existed before** — worktree at `a14fe6b^` + today's `session.test.mjs`: the test RAN and its ASSERTION failed (expected `other-round`, actual `stale-version`) while the continuation control stayed GREEN on that same tree, so it tells replace from continue rather than merely breaking; 28/28 on HEAD; worktree removed, live tree verified clean by the parent not the agent · **rot swept tracker-wide** — all 12 open bodies scanned: 12 citations, 3 OK, 9 rotted; 8 were in gh#53, the 9th in gh#29 (re-anchored to the named CI step + `csp-inline-check.mjs`; 0 citations left there) · **`docs/agents/issue-tracker.md`** — Thai->English convert-on-touch, plus a BAN on line citations in bodies/comments/criteria per ADR-0026 · **gh#60 opened** — number tool `render()` omits the `MAX_RANGE_SIZE` mirror, so a wide range shows a ready button then throws on every tap; parent-confirmed by reading the source
dec: ADR-0026 — a set we do not own is guarded at AUTHORSHIP, not by a scanner; owner declined extending the gate to issue bodies · gh#53 re-anchor scoped to criterion 3 + one historical note (owner) · criterion 5 left un-worded on purpose — re-wording a criterion changes what the owner is being asked to accept · the ban's narrative exception covers COMMENTS, because reporting rot cannot be written without quoting the rot · 2 of 3 edge-walk findings left unfiled (owner)
next:
- [ ] owner: tick or reject gh#53's 5 boxes. All 5 now read as met, criterion 5 on recorded evidence. Done when gh#53 closes
- [ ] owner-run: gh#9 domain -> gh#29 AdSense. `dig +short watduang.com NS` EMPTY, re-verified at this save. Blocks the ONE remaining box on each of #15 #16 #17 #18 — those four tools are BUILT and shipping, do not re-scope them as unbuilt
- [ ] owner-run: gh#13 last box — `docs/verification/gh13-real-device-script.md` on one real iPhone. An agent CANNOT do this; the simulator tooling reaches simulators only
- [ ] owner: gh#12 keyword planner · gh#19 month-6 organic-clicks gate
- [ ] gh#60 — number tool `render()` misses the cap mirror. Ready for an agent once triaged
- [ ] 2 edge-walk findings unfiled by owner's call: the draw page's shrinking `render()` under ADR-0024 (needs a manual 320px probe, gh#43) · `requestClear` on tool pages has no confirm, latent behind one `hidden` attribute
- [ ] the ban binds AGENTS via `docs/agents/issue-tracker.md`; an issue typed by hand is unbound — ADR-0026 names that as the fact that reopens the gap

inflight: measured at save — tree dirty only with this save · open PRs 0 (checked `gh pr list`) · bg tasks 0 (checked) · everything before this save's own commit is pushed
spent: queue 5->7 · batches 2 · dispatches 6 · fable 2 (1 SOLVE fork + 1 REFUTE; 7 findings, all accepted and fixed pre-send) · GitHub writes 3 comments + 2 body edits + 1 issue · ctx ~190k at save
