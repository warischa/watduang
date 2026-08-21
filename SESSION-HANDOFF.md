# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-21#1

done: **3 commits `dbace51` `29765a2` `8c39aed`** · **gh#51 F2 follow-up closed structurally, no UI built**: `clear()`'s silent refusal on the `PlayerSetup` path is UNREACHABLE — `requestClear` binds `const session = loadSession()` in its own body with no async escape before `session.clear()`, and the confirm branch re-enters `requestClear` (`PlayerSetup.astro:394`) so `loadSession()` re-runs. Pinned by a source-text test (ADR-0023) · **the first version of that test PASSED WHILE THE INVARIANT WAS DEAD** — matched a `loadSession()` token, not the receiver of `.clear()`; REFUTE proved it by mutation. Tightened to anchor the binding form + ban `await`/`.then(`/`yield`; 4 mutations calibrated, 2 re-run by the orchestrator (163/1 each, tree restored byte-identical) · `PlayerSetup.astro` comment corrected — "(or check the return)" was FALSE: `clear(): void` (`session.ts:245`) vs `write(): WriteRefusal | null` (`:181`) · **`docs/verification/gh13-real-device-script.md` NEW** — its first draft's wake-lock check COULD NOT FAIL (every ส่งต่อ tap resets iOS Auto-Lock); now demands a round untouched from Start, independently timed > Auto-Lock, inconclusive as a third outcome; 6 stale citations in it corrected · edge-walk filed **gh#53 · gh#54 · gh#55** · handoff's "live URL unblocks #13·#15·#16·#17·#18" was too broad — corrected before rolling · runbook re-measured: PASSES budget, 2nd seam NOT needed · debt harvest: 36 `ponytail:` markers, 0 lacking a ceiling, 0 TODO/FIXME/HACK/XXX · tests 164 · tsc 0 · build 14 pages.

dec: **ADR-0023** — a provably unreachable branch gets a structural test, not a notice; judged a corollary of ADR-0018. Two independent grounds: a dead branch means a notice is a new tap surface (ADR-0020), AND it was copy-blocked — all 3 `refusalCopy` strings end "ไม่ได้บันทึก" (the write was not saved); a refused *clear*'s loss is "ไม่ได้ล้าง", a string that does not exist and #25 forbids inventing · the sync re-entrant-writer escape is deliberately NOT enumerated (set owned by future contributors, never converges) — named in the test title per ADR-0019 · owner 2026-08-21: commit direct to `main`, then push · **gh#55 filed DESPITE its own probe refuting the collision** — `#ss-draw` overlaps in the vertical axis; only ~65px of horizontal margin prevents the hit, and nothing enforces that.

next:
- [ ] owner-run: gh#9 domain → gh#29 AdSense. `dig +short watduang.com NS` returns EMPTY (verified 2026-08-21) — still the blocker for the one ad box left on each of #15 · #16 · #17 · #18
- [ ] owner-run: gh#13 last box — run `docs/verification/gh13-real-device-script.md` on one real iPhone. Done when gh#13 carries device · iOS · browser · Auto-Lock setting · the qualifying round's timed untouched duration · pass/fail per invariant
- [ ] gh#53 (refusal names the opposite loss) · gh#54 (failed mount has no failure surface, wipes the roster) — both CONFIRMED and line-verified; both need owner approval on Thai copy before a fix ships
- [ ] gh#55 — re-run `docs/verification/evidence/55/clear-cancel-collision-probe.mjs` against `timebomb` and a 2nd roster size; siamsi@3 at 320px is all that is covered
- [ ] `fnBody` (`player-setup.test.mjs`) mishandles `/* */` and braces inside strings — knowingly unfixed, neither condition exists in the current body

inflight: measured at save — tree carries only this save's 2 files · open PRs 0 (checked) · bg tasks 0 (checked) · open issues 11→14 · 3 commits ahead of origin at write time; this save's own commit + push follow immediately — confirm with `git log --oneline origin/main..HEAD` (empty = pushed)

spent: queue 3→5 · fable calls 2 (fork SOLVE + 1 REFUTE round; round 2 not needed, findings were spot-fixable) · dispatches 8 · GitHub writes: 3 issues, 2 comments · ctx 270k at save
