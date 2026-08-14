# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#6

done: **[#25] shipped `322423d`** (5 files, +321/−79, **63 → 72 tests**) — `ล้างกลุ่มนี้` asks before discarding a live round; new `planClear(checkpoint, confirmed)` takes **no `gameId` by design** (`clear()` is site-wide, so a game-matched test lets one game's page kill another's round) · **REFUTE ×2 caught 4 defects pre-commit**, all silent-loss family: stale armed question survived start/resume · focus sat on the destructive button (click fires on Enter *keydown*) · its own detector matched `session.clear()` inside a comment · the corrected comment+ADR then **overshot** ("the one door" — `เล่นอีกรอบ` mounts directly, `siamsi.ts:253`/`timebomb.ts:147`) · **docs `9ef6ec2`** — `runbook.md` Thai→English + per-set-member rule, 3 shell traps each reproduced live · `scripts/driver.mjs` promoted out of volatile tmp, `browser-verification.md` now matches what ships · **#15–#18 walked in a real browser: 23 PROVEN · 8 UNPROVEN · 0 FAILED** — evidence in scratchpad only, **GitHub untouched, ticking is the owner's**

dec: #25 = ADR-0008 pattern, condition `checkpoint !== null` **not** game-matched — ADR-0008 amended, both halves settled + new flip-fact · REFUTE cap 2 rounds held, no fork-return: every finding was a bug *in* the mechanism, never the mechanism

next:
- [ ] ⚠ **SUPERSEDED — do not act on the "23 PROVEN" figure above.** The G3 report it cited died with its scratchpad. All **41** unticked boxes on #15–#18 were re-walked in S2026-08-14#7; the record now lives **committed** at `docs/verification/tools-15-18/{15,16,17,18}.md` + `docs/verification/README.md`, evidence at `docs/verification/evidence/`. Real tally: **30 PROVEN · 0 FAILED · 8 UNPROVABLE · 3 UNDECIDED = 41**. The old "31 walked" is explained — #16+#17+#18 unticked = 11+11+9 = 31, so the prior session never walked #15; re-walking those same 31 yields **22** PROVEN, not 23. Ticking is still the owner's, and REFUTE withheld #16-08 (evidence gap) and requires a #22 scope note on #15-02/#16-06/#17-07
- [ ] `package.json` has **no `test` script** — every session re-derives `node --test 'src/**/*.test.mjs'` (glob **quoted**; `node --test <dir>` misreads dir as module path on node 22 → `ci.yml:38`) · 1 line, flagged twice
- [ ] `0 selected names` silently takes the numbered-mode fallback (#22) instead of the below-min refusal gate — found in browser, **not a bug**, nothing documents it
- [ ] `.claude/commands/save-session.md` is Thai and agent-facing → owed English at next touch (`docs/sessions-archive.md` never converts)
- [ ] #13 DoD4 real phone + #20 → steps in `docs/site-owner-checklist.md` · **closing DoD4 closes #13**
- [ ] #9 domain · Azure token (**only real CSP/AdSense proof**) — both owner-gated, checklist §1/§2
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one; that is also ADR-0008's new flip-fact

inflight: measured at save — `9ef6ec2` on `fix/25-clear-guard`, this save commits on top, then merge → `main` + push both this turn · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down, verified via `lsof -ti:4321,9222` (empty) · G3 evidence + orchestrate ledger: session scratchpad, not committed
