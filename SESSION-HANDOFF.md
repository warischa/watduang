# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#4

done: **[#21][#22] + 2 unfiled data-loss paths shipped `697b131`** — `src/shell/player-select.ts` (new, pure `resolveStart`/`numberedPlayers`) + `player-select.test.mjs` · `PlayerSetup.astro` · 57 tests, build green · #21 over-max warns naming who sits out, **stored group stays the full ticked set** · #22 button `เริ่มแบบ "คนที่ 1, 2, 3…"` visible on first paint with group pre-ticked, never touches selected/group/session · **data-loss 1** `saveGroup([])` moved inside the `clearsSession` gate · **data-loss 2** untick-all path wiped the group — copy reworded + write guarded by `selected.size > 0` · `#start-numbered` hidden while a checkpoint exists on `setPlayers` pages (one tap orphaned a live siamsi round — reproduced, then fixed) · checkpoint-slot audit: **no collision possible**, all 4 tool modules are pure fns · filed [#23] · #15–#18 got 5 DoD ticks + evidence comments, **none closed** · new `scripts/cdp.mjs` + `docs/agents/browser-verification.md`

dec: ADR-0007 (ADR-0004's party-size rule constrains the SET a guard enumerates, not where it lives — extraction to a testable module is legal · ADR-0004 prediction scored: confirmed in substance, refuted in wording) · browser instrument = CDP device emulation, **never `--window-size`** → `docs/agents/browser-verification.md`

next:
- [ ] [#23] checkpoint identity — 4 symptoms, 1 cause (numbered rounds unresumable · hide-condition game-agnostic · re-ticking reorders the Set · "ล้างกลุ่มนี้" no-op on tool pages) · **do not spot-fix one** · first 2 DoD boxes reproduce headlessly via `scripts/cdp.mjs`
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same pass: #20 siamsi mid-round → refresh → must restore
- [ ] #15–#18 still **5/59** DoD ticked — most of the rest are logic assertions CI likely already satisfies but nobody has confirmed
- [ ] #9 register `watduang.com` (site owner) · #19 blocked by it
- [ ] Azure SWA phase 2 — site owner sets `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer `skipped` · **the only thing that can prove CSP/AdSense for real**

inflight: measured at save — `697b131` committed, this save commits on top, both pushed this turn · working tree otherwise clean · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down and verified stopped
