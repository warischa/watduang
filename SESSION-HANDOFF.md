# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-29#6
done: merges to main all CI-green + deployed: 5f25435 (cannon-flag play route + 4-lane probes), daab4da (gh#135 มือลั่น + gh#136 วัดพลัง play routes, วัดพลัง live for the first time), 7360cfc (gh#144 X exit + ADR-0050 + shared fake-DOM harness), 0f7cb2a (in-game edit-players + setup now persists the group). What git cannot show: last deploy run 33254399476 success; main probe step ~3.5 min (the wt merge verify met); every phase browser-proven (roster 375px, X guard hold-through/stray-tap/bfcache at 320px both motion modes, edit prefill + save-back read from localStorage); gh#135 gh#136 gh#144 closed with evidence comments; gh#141 now holds 4 game rows; gh#138 closed — recipe at docs/agents/play-route-recipe.md + chrome probes moved to scripts/ (502766f); probe-scope gate 3/4 proven in CI — the "src push on an existing branch" path is the one still unproven.
dec: ADR-0049 ACCEPTED option (b) policy-only — docs batch, one push at save (this save is the instance) · ADR-0050 written, records the seven 2026-08-29 rulings · owner (in-session popups): #143+#144 before #145-149 · play routes get an in-game แก้ผู้เล่น control (shipped) · both deploy pushes and all tracker writes explicitly approved
next:
- [ ] agent: before briefing gh#145-147 confirm each game has a mockup — Bomb and ไม้สั้นไม้ยาว exist under the mockup dir; สุ่มคนโดน has no obvious match (dice-loser unverified) — no mockup routes the game to gh#137, not the lift track
- [ ] agent: run gh#145-147 as ONE batch — parallel worktrees, shared gate files reserved to the integrator, one integration, one REFUTE, one deploy
- [ ] agent: string-extractor seam — COPY export exists for pick-loser only; five game modules still inline their strings
- [ ] owner: gh#141 walkable, 4 rows — includes the iOS click-vs-pointerup question on the X and freeze-tap first-tap latency (~500ms busy main thread after load, found in headless)
- [ ] owner: gh#29 AdSense · gh#139 which of the 8 mockups ship · gh#140 player identity — one sitting
inflight: measured at save — tree carries only this save docs (ADR-0049 status, handoff, archive) · 0 open PRs (checked) · no bg tasks · main == origin/main at 0f7cb2a before this docs push
spent: queue 9 -> 2 owner-blocked · 4 deploys green · 12 briefs, 3 REFUTE rounds (real findings every round, all fixed pre-commit) · ctx healthy at save
errors: sequenced a merge on a false file-overlap premise (fork corrected it) · shipped a test pin whose regex could not match the code it pinned (its own first run caught it) · two agent-planted hazards reached the tree before my re-read: a literal NUL byte in a src file, and a comment made false by the very commit that landed it
