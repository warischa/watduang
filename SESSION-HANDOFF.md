# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#7

done: **all 41 unticked boxes on #15–#18 re-walked, record COMMITTED** `f1d67fa` (32 files, +1619/−20) → `docs/verification/` (4 reports · 21 text artifacts · README · red-green-non-vacuity) · tally **30 PROVEN · 0 FAILED · 8 UNPROVABLE · 3 UNDECIDED = 41**, counted from the files not from agent self-reports · lost "31" explained + png-drop + red-green-wording-false: **ADR-0009** · red-green proof: **3 NON-VACUOUS, 1 VACUOUS** · `package.json` +`test` = `ci.yml:40` verbatim · 2 merged branches deleted · `CONTEXT.md` +`คนที่ N` · `PlayerSetup.astro` +comment · `site-owner-checklist.md` §1/§2 unattended-runnable · `browser-verification.md` trap 3→4 (+the wipe trap, +per-set-member calibration) · **REFUTE ×1 → 6 CONFIRMED defects, all fixed**

dec: **ADR-0009** (new) · **ADR-0007** scored twice-over (its own scratchpad warning came true; belowMin now *provably unreachable*) · rewording the 4 red-green boxes is legitimate **only if visible + owner-approved**

next:
- [ ] tick **29 of 30** PROVEN on #15–#18 — **withhold #16-08** (pressable-path half has no committed artifact) · verify: ticked count == report PROVEN − 1 · **re-count the 41 against live issues first** — box-ID→checkbox-line mapping is unverified
- [ ] reword the 4 red-green boxes (#15-14 #16-13 #17-14 #18-12) to the non-vacuity invariant, visibly · **#15-14 stays un-tickable until 3 `() => 1` clamp tests exist** (wheel/draw/number) — that also closes the one VACUOUS finding
- [ ] owner call: 3 UNDECIDED (#16-11 #17-12 #18-10) are all "respects reduced motion" on tools with **no motion to suppress** — only the wheel animates, the four DoD lists were templated · mark N/A, or decide those tools were meant to animate
- [ ] `docs/site-owner-checklist.md` has **no step connecting `watduang.com` to the Static Web App** — owner can buy the domain + deploy and never join them
- [ ] `belowMin` unreachable = dead guard → own issue · **no test pins the `startBtn`/0-selected DOM branch** (only `numberedPlayers`/`resolveStart` unit-tested)
- [ ] `.github/workflows/ci.yml` — 22 Thai comment lines owed English; they carry the CSP-gate reasoning, convert carefully · `.claude/commands/save-session.md` still Thai
- [ ] #13 DoD4 real phone — now needs **§2 only** (a deploy), not the domain · #9 domain · Azure token (**only real CSP/AdSense proof**) — owner-gated, checklist §1/§2
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one (ADR-0008 flip-fact)

inflight: measured at save — this save commits on `main` and **pushes** (authorized this turn) · open PRs: none (checked `gh pr list`) · no background tasks · all 5 ports released, verified `lsof -ti:4321,9222,9223,9224,9225` empty with a negative control · worktree removed, `git worktree list` = 1 · orchestrate ledger: session scratchpad, NOT committed (deliberate — its durable facts are in this entry + ADR-0009)
