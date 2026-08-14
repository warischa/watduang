# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#2

done: **[#15] tool 1 shipped `24fe2c8`** — `/tool/wheel/` · `/tools/` · `src/tools/wheel.ts` + mutation-proven tests · shell shared with games · **fixed the CSP defect that silently blocked page JS, + 3 new gates in `ci.yml`** · 20 tests · `/tools/` no longer orphaned `0a485ee` · docs → pointers `bb9c1dc` · tracker: opened #19 #20 · #12 is no longer a gate · linked #14 #19 #20 under #1 · dep #19←#9 · **pushed, and CI went green on GitHub with all 3 new gates on their first real run** (`31763743017`, Deploy still skipped — no secret yet) · state moved out of `CLAUDE.md` into this file `2143101` · language policy `d3279d4` · `CLAUDE.md` converted to English this save

dec: ADR-0005 (page JS must never inline) · ADR-0004 §added-during-#15 (indirect session access · remembered group · absence baseline) · **the real gate is now ticket #19, not #12** (ADR-0003) · state home = this file, which **overrides master save-session** — reason recorded in `.claude/commands/save-session.md`, do not move it back without reading that · language = write English, ship Thai (`CLAUDE.md` § Language); Thai docs convert on touch, `docs/sessions-archive.md` never

next:
- [ ] **[#16][#17][#18] can run in parallel now** — frame is reusable per ADR-0004 · add the slug to `EXPECTED_TOOL_SLUGS` in `ci.yml` · done = build + `node --test` green, and the absence gate goes red when the page is `mv`d away
- [ ] #13 DoD item 4, real phone (site owner) — **closing it closes #13** · same session, also check #20: siamsi mid-round → refresh → must restore the round
- [ ] #9 register `watduang.com` (site owner) — `whois` still free (checked 2026-08-14) · #19 is blocked by it
- [ ] Azure SWA phase 2 — site owner sets secret `AZURE_STATIC_WEB_APPS_API_TOKEN` · done = Deploy no longer shows skipped in `gh run view` · **the only thing that can prove CSP/AdSense for real**
- [ ] 2 REFUTE findings still unfiled (awaiting permission) — both written up in ADR-0004 §added-during-#15: silent drop on the `max` side · discoverability of the "คนที่ 1..N" mode
- [ ] confirm or change PartyPick

inflight: tree clean · no open PRs (checked) · no background tasks · pushed this round
