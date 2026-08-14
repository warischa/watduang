# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#6

done: **[#25] shipped `322423d`** (5 files, +321/−79, **63 → 72 tests**) — `ล้างกลุ่มนี้` asks before discarding a live round; new `planClear(checkpoint, confirmed)` takes **no `gameId` by design** (`clear()` is site-wide, so a game-matched test lets one game's page kill another's round) · **REFUTE ×2 caught 4 defects pre-commit**, all silent-loss family: stale armed question survived start/resume · focus sat on the destructive button (click fires on Enter *keydown*) · its own detector matched `session.clear()` inside a comment · the corrected comment+ADR then **overshot** ("the one door" — `เล่นอีกรอบ` mounts directly, `siamsi.ts:253`/`timebomb.ts:147`) · **docs `9ef6ec2`** — `runbook.md` Thai→English + per-set-member rule, 3 shell traps each reproduced live · `scripts/driver.mjs` promoted out of volatile tmp, `browser-verification.md` now matches what ships · **#15–#18 walked in a real browser: 23 PROVEN · 8 UNPROVEN · 0 FAILED** — evidence in scratchpad only, **GitHub untouched, ticking is the owner's**

dec: #25 = ADR-0008 pattern, condition `checkpoint !== null` **not** game-matched — ADR-0008 amended, both halves settled + new flip-fact · REFUTE cap 2 rounds held, no fork-return: every finding was a bug *in* the mechanism, never the mechanism

next:
- [ ] tick the **23 PROVEN** boxes on #15–#18 — verdict + evidence path per box in the G3 report; the **8 left are honestly unprovable**: 4 ad-slot (no AdSense in `dist/` yet) · 4 red-green git-history claims
- [ ] `package.json` has **no `test` script** — every session re-derives `node --test 'src/**/*.test.mjs'` (glob **quoted**; `node --test <dir>` misreads dir as module path on node 22 → `ci.yml:38`) · 1 line, flagged twice
- [ ] `0 selected names` silently takes the numbered-mode fallback (#22) instead of the below-min refusal gate — found in browser, **not a bug**, nothing documents it
- [ ] `.claude/commands/save-session.md` is Thai and agent-facing → owed English at next touch (`docs/sessions-archive.md` never converts)
- [ ] #13 DoD4 real phone + #20 → steps in `docs/site-owner-checklist.md` · **closing DoD4 closes #13**
- [ ] #9 domain · Azure token (**only real CSP/AdSense proof**) — both owner-gated, checklist §1/§2
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one; that is also ADR-0008's new flip-fact

inflight: measured at save — `9ef6ec2` on `fix/25-clear-guard`, this save commits on top, then merge → `main` + push both this turn · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down, verified via `lsof -ti:4321,9222` (empty) · G3 evidence + orchestrate ledger: session scratchpad, not committed
