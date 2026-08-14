# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-14#5

done: **[#23] shipped `5aec128`** (12 files, +214/−47, **57 → 63 tests**) — the checkpoint now owns its roster, element-wise name gate gone; per-line mechanism in the commit body, DoD evidence in the [#23] comment · ADR-0008 two-button resume prompt · **REFUTE caught 1 real defect** — `#player-count` had no listener, so a stale roster started a 4-player round; fixed, proved both ways · `ci.yml` sitemap gate checked **1 of 4** tools, now all four calibrated per page · **[#22] closed** 5/5 · [#23] 6/6 ticked, **held open** on Thai copy · #15–#18 **13 of 59** ticked (31 UNPROVEN · 7 DEFER · 3 NEEDS-VIEWPORT) · new `docs/site-owner-checklist.md` · filed [#24] [#25]

dec: ADR-0008 (**scoped to round-start**; `ล้างกลุ่มนี้` mid-round = [#25]) · ADR-0007 scored — still untested, `.astro` wiring has no coverage and CI passes either way · #23 DoD box 3 unconstructible as written, body unedited + annotated

next:
- [ ] **Thai copy sign-off** — `ยังมีรอบที่เล่นค้างอยู่ จะกลับไปเล่นต่อ หรือเริ่มรอบใหม่กับวงที่เลือกไว้?` → then `gh issue close 23`; asked, unanswered
- [ ] [#25] `ล้างกลุ่มนี้` mid-round discards a live round, label names only the group — **live round-loss path**, 3 options in the ticket, owner picks
- [ ] [#24] one checkpoint slot site-wide — dormant until a 2nd game writes one; `game` tags, doesn't select
- [ ] #15–#18 **31 UNPROVEN** boxes — evidence-or-leave rule held, don't tick on inference
- [ ] #13 DoD4 real phone + #20 → steps in `docs/site-owner-checklist.md` · **closing DoD4 closes #13**
- [ ] #9 domain · Azure token (**only real CSP/AdSense proof**) — both owner-gated, checklist §1/§2
- [ ] promote scratchpad `driver.mjs` → `scripts/` — `scripts/cdp.mjs` can't do cross-page nav or console listeners, so `docs/agents/browser-verification.md` overstates the shipped instrument
- [ ] `docs/runbook.md` § "ตรวจงานให้เหมือน CI" — "calibrate both ways" is **insufficient**: a gate covering a SET needs calibrating per member (sitemap gate passed both ways on `wheel`, blind to 3 pages) · + 3 new zsh traps (unquoted flag glob · BSD `grep -E` has no PCRE lookahead · heredoc in `bash -c`) · **deferred:** file is Thai, convert-on-touch makes it a full-file conversion

inflight: measured at save — `5aec128` on `fix/23-checkpoint-identity`, this save commits on top, then merge → `main` + push both this turn · open PRs: none (checked `gh pr list`) · no background tasks · headless Chrome + `serve dist` torn down, verified stopped via `pgrep`+`lsof` (ports 4321/9222 free) · orchestrate ledger: session scratchpad, not committed

