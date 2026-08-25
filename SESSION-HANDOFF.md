# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-25#4

done: **gh#75 gh#76 gh#85 committed+PUSHED, CI green, live** (4 parts: da06606 225f10c 4aec341 07bbfd4) · **gh#77-gh#81 five game visuals SHIPPED and pushed** — per-game stylesheets (ADR-0036), 5 workers parallel on disjoint file sets, `[id].astro` seam pre-written SELF · **body reset** `Base.astro` +`body{margin:0}`, the site had none, verified inlined into all 10 dist pages · **2 browser probes added** `scripts/stick-tap-target-probe.mjs` `scripts/narrow-overflow-probe.mjs` + evidence `docs/verification/evidence/77-81/` · **gh#84 orphan-binary gate SHIPPED uncommitted** `scripts/public-orphan-check.mjs` NEW + `assets.md` + package.json + ci.yml (orchestrator wired the last two) · **gh#83 shake SHIPPED uncommitted** `siamsi.ts` +230 `siamsi.test.mjs` +284 `siamsi.css` +29, CSS 3D no dep · **gh#82 SHIPPED uncommitted, built SELF** validator denylist + 5 ads flips + 250px + hub/category slots · 4 REAL DEFECTS caught after workers returned: gh#79 44px tap target failed at EVERY roster size (real pre-fix measurement 42px at 390px/6 — the one case the worker called a pass; my own arithmetic missed the UA body margin too) · 3 screens scrolled 28px sideways on a 24-char Latin name, found by my own probe not the REFUTE · love-match #36 test unfalsifiable TWICE (2nd cause: fake `click()` honours `disabled`, so the guard was unreachable — mutation-tested both fixes) · longest-reading test never rendered the longest reading · verified SELF: tsc 0 · astro check 0 · tests 189→204→211 · build 0 · 15 gates selftest+real 0 · selector audit 56 selectors 0 collisions · fleet 11 dispatches

dec: ADR-0036 a stylesheet belongs to the module that emits its class names — per-game sheets, shared vocabulary frozen during a fan-out, prefix audit belongs to whoever holds all the sheets · ADR-0037 "no slot on the play screen" was never "no slot on the page" (issue #13 amendment 8); denylist not allowlist because a wrong true is account-termination class and a wrong false only loses money · ADR-0038 a ticket may name a dependency the project does not need; gh#83 AC2 rewritten to its intent, owner-approved · owner 2026-08-25: siamsi ads=true · game slot height 250px not the canvas 60px · fix the validator now · push to live · **gh#82's brief was REFUSED by the QwenCloud content inspector** (`data_inspection_failed`) because explaining why one page must never request an ad IS restricted-content language — reported not reconciled, built SELF; an identical retry gets an identical refusal and the flagged text is the safety-critical part

next:
- [ ] agent: REFUTE round 1 on the gh#82+gh#83+gh#84 diff was still running at save — out-refute2.json in the session scratchpad, SID in the run-2 ledger. Read it, act on findings, THEN commit. Round 1 of 2 used. Done when the tree is committed and `git status --short` is empty
- [ ] owner: review the two Thai strings gh#83's worker authored — `HINT_TAP_ONLY` and `HINT_ENABLE_SHAKE` in siamsi.ts. Product copy no test can judge. Done when accepted or reworded
- [ ] owner: open the six game screens and judge them against `design/` by eye — gh#76's one AC no command can check, now covering five more screens. Note the body reset moved every page 8px per side since you last looked. Done when accepted or a change list exists
- [ ] owner-run: the AdSense console page exclusion for the one denylisted page. Account action, no gate in this repo can observe it. Blocks nothing in code
- [ ] owner-run: gh#9 domain then gh#29 AdSense. `dig +short watduang.com NS` still EMPTY, re-measured at this save. Blocks the last box on gh#15 gh#16 gh#17 gh#18 — those four tools are BUILT and shipping
- [ ] owner-run: gh#13 last box — the real-device script on one real iPhone. Runnable NOW on the Azure default hostname
- [ ] agent: gh#82 leaves `/games/` and `/tools/` without a slot on purpose — no artboard marks one. If the owner wants inventory there, an artboard comes first
- [ ] owner: gh#12 keyword planner · gh#19 month-6 organic-clicks gate
- [ ] agent, PARKED by owner 2026-08-25, do not pick up without a new decision: re-run the hero as a true transparent cutout. Same reasons as before

inflight: measured at save — working tree carries gh#82+gh#83+gh#84 UNCOMMITTED (19 paths) plus this save's writes · 0 unpushed commits before this save's own · open PRs 0 (checked) · **1 bg task LIVE: the REFUTE dispatch** · open issues 24 · quota token-plan 79.2% at run-2 start; the 7-day window rolled mid-session so no burn figure can be read from a start/end delta

spent: queue 8→9 (gh#75 gh#76 gh#85 gh#77-81 gh#82 gh#83 gh#84 drained, 4 owner items added) · dispatches 11 (2 forks, 5+2 workers, 1 builder, 1 REFUTE returned, 1 REFUTE inflight, 1 refused) · REFUTE rounds 1/2 on the run-2 artefact, 1/2 on the run-1 artefact, re-forks 0/1 · ended early: 0 required pending, REFUTE inflight
