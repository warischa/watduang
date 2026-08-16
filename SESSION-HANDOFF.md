# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-16#3

done: **`ac52311` pushed, CI green, deploy skipped** — `gh secret list` proved empty *in the same shell command as the push*, so the condition could not go stale between check and act. New `docs/agents/capture-freshness.md`; `browser-verification.md` 15270B→11579B PASS; `adr/0009:93` repointed; the moved H2 stays behind as a stub so that citation still resolves in one hop. **#36 filed** — Thai-comment migration scope, body readback-verified, 35-row table intact. #12·#9·#24·#29 relabelled → **all 13 open issues now carry a triage label**; #20 got a doc-move pointer comment. GameNav audit **no regressions**: the 3 former inline copies are md5-identical to the component after class-name normalisation, `-next` selectors survive by construction, 0 self-links, ADR-0005 clean. ponytail debt: 12 markers, 10 with ceilings, **0 outstanding**.

dec: **ADR-0012** — a doc split follows the *task seam*, not section size; overturned S#2's queued "split traps out", which would have raised per-route ingest while greening the byte gate · Thai-comment migration = **file an issue naming the whole set** (owner call: not convert-now, not scope-the-rule-to-new-code) → #36 · #24 got `ready-for-human`+`wayfinder:grilling` as least-wrong — **no label in the set means "dormant until a trigger fires"**, which is what #24 is

next:
- [ ] **`src/layouts/GameLayout.astro:44-46` ponytail comment guards the wrong file** — it warns about a `<style>` block landing *in GameLayout*; the real threat is `src/styles/tokens.css`, global via `Base.astro:2`, reaching every page (verified: 8 direct + `game/[id].astro` through GameLayout wrapping `<Base>`). Conclusion still true, stated mechanism is not. Done when the comment names tokens.css
- [ ] **2 budget FAILs, measured this session, not caused by `ac52311`** — `docs/site-owner-checklist.md` 17651B · `docs/adr/0004-*.md` 15081B (also still Thai → converts on touch). Root cause they went unseen: `check-budgets.sh` gates ONE doc per call, there is no repo-wide invocation. Done when both PASS
- [ ] #36 Thai-comment migration — 236 lines across 35 of 52 files, `ready-for-agent`. ⚠ several of those files also hold Thai **strings** that must survive; the DoD carries the calibration check
- [ ] **wizard §2 Azure token** — owner-run, unblocks #13's real-phone pass. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to main IS a production deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it
- [ ] #9 domain · #29 AdSense pub-ID — owner-run, **#29 closes gh#15–18 in one stroke**, then epic gh#14 · `GameNav.astro:15-16` `aria-label` hardcoded while `heading` is a prop — silently desyncs on the next override · row 4 locked till rows 6/7 · row 5 locked (ADR-0011) · #24 dormant (ADR-0010)

inflight: measured at save — tree clean before this commit, 0/0 with `origin/main` · open PRs checked, none · CI green on `ac52311` · open issues 13 · branches: `main` only · GitHub writes: #36 created, #12/#9/#24/#29 relabelled, #20 commented

spent: queue 6→5 · batches 3 · ctx 17% at save · ended early: no
