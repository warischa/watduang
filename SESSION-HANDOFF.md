# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state


### S2026-08-18#3

done: **2 commits `39a7244` + `a92115f`, pushed, CI GREEN** — runs 32111657030 + 32113231806, read via `gh api .../workflows/333456382/runs` (`gh run list` still 404s). Also verified `b6da4ab` green (32111380866 is a calibration run, not it) — last session left its CI verdict UNVERIFIED; it was fine. **gh#38 CLOSED** (reason=completed) · **gh#43 FILED** ("42 — browser probes prove load-bearing invariants and run nowhere") · **gh#37 narrowed, kept OPEN** (`issuecomment-5325138096`; gh#38 got `issuecomment-5325026562`; both round-trip-verified against the API). NEW `@astrojs/check@0.9.10` devDep + `npx astro check` blocking at `ci.yml:59`, immediately before Build → gh#38, evidence `docs/verification/evidence/38/` files `04`-`07` (box1 PROVEN · box2 UNDECIDED · box3 PROVEN · box4 PROVEN). NEW `scripts/no-nav-in-stage-check.mjs` at `ci.yml:55`, 5 patterns, static tripwire for ADR-0014 → ADR-0018. `short-stick` + `timebomb` retrofitted onto `armAllButtons` (renderDraw · renderResult · renderIdle), drift closed → ADR-0017 amended twice. `scripts/arm-gate-probe.mjs` dead `SIAMSI_NAMES` deleted; siamsi coverage investigated first and is **REAL** — the reason it must NOT call `seedRoster()` (that helper wipes the ADR-0010 checkpoint) is now a comment there. tests 153 unchanged · astro check hints 4→3.

dec: **ADR-0018** — a static tripwire may stand in for an unrunnable probe only if it names what it cannot prove; its pattern set is calibrated against the idiom THIS codebase writes · **CI gates calibrate at RUN level on a throwaway branch** when per-step verdicts are unreadable — 2 commits, byte-identical trees but one type-only variable, red then green, `on: push` has no branch filter so main never goes red → `docs/agents/ci-verification.md` · **owner: real-touch probes NOT re-run for the retrofit** — shape-only conversion, the probes prove a physical-layer fact it cannot disturb · **gh#38 box 2 left UNDECIDED** — its "if it fails" precondition never fired, no decision invented · **suppression lists forbidden on the astro check gate** — that is the only path by which it becomes ADR-0016 rotting-ledger class

next:
- [ ] **gh#43 — decide per probe (focus).** 9 browser probes back shipped invariants and run nowhere. Each needs exactly one of: wired into CI + calibrated red · replaced by a static tripwire per ADR-0018 with its ceiling in the script header · deliberately manual with the reason stated. Done when no probe in gh#43 table is undecided. ⚠ anything added to `ci.yml` must be proven not to rebuild `dist/` after the gates that read it — that incident is why `crawl-check-gamenav --selftest` sits commented out at `ci.yml:163`
- [ ] **gh#37 — owner call: close or keep.** In-stage nav harm is closed (6/6 modules, source-verified, no browser run); what remains live is the recorded ADR-0016 exception set (daily-fortune roster chips, `#pl-pick`). Done when closed, or a comment states what keeps it open
- [ ] **owner-run, unchanged:** wizard §2 Azure token · gh#9 domain · gh#29 AdSense pub-ID (gh#29 closes gh#15-18, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:232` gates on `HAS_DEPLOY_TOKEN`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty

inflight: measured at save — working tree carries only this save own files · **open PRs: checked, none** · branches: `main` only; `calibrate/gh38-red` deleted local+remote after use · worktrees: 1, clean · `gh api .../actions/secrets` **total_count=0**, re-checked immediately before both pushes, so neither was a deploy · GitHub writes this session: 2 comments, 1 issue closed, 1 issue filed · committed direct to main, no PR

spent: queue 6→3 · closed 1, filed 1 · batches ~30 · ctx ~287k of 1M at save
