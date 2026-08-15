# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-15#6

done: **`c72ff15` pushed · 4 stale red-green verdicts annotated · kill-tests calibrated both ways · owner checklist made owner-runnable** — 6 files +16/−6, CI `31891059300` green. `docs/verification/tools-15-18/{15,16,17,18}.md` each got a dated annotation — pure insertion, `--numstat` 2/0, verdict lines untouched (they record a walk). Calibration: reverted each clamp singly, ran only that tool's suite — wheel/draw/number each red in **exactly** the named test, team 1/10, all green on restore → "gap closed" is measured, not cited. `ci.yml:16,18` actions→v5, both `success` in CI; deploy step `skipped` (secrets total_count=0 → that push was NOT a prod deploy). `site-owner-checklist.md` 5 drift fixes, load-bearing = add-secret consequence warning. #1 commented (`issuecomment-5302760777`). 96/96.

dec: **games 2–7 pause SUPERSEDED — no gate, no owner left** — ADR-0003 (`a4eda47`) replaced #12's go/no-go with #19's Search-Console-clicks gate; #12's own body disclaims itself, worksheet never existed. Traps: ~230-item content library is **NOT** re-authorized (ADR-0003:13,19 = risk ordering, not a gate) · pause clause hyperlinks `issues/12` directly so **ticket=NN+1 does NOT apply there** (3 numbering schemes in that one comment) · #19 gates the `/en/` pivot not the build, blocked by #9 · the 2 verification docs never contradicted — different questions (non-vacuity of the Aug-14 suite vs red-green provenance), so the annotation frames gap-found→gap-closed, not supersession · `site-owner-checklist.md:33` = **job** level (`ci.yml:13-14`), not workflow level

next:
- [ ] games 2–7 unblocked — pick the next game per ADR-0004 ordering + #5's list. Done when its page + tests ship, CI green
- [ ] #29 AdSense account + pub-ID — owner-run (Google identity + payment details; an agent must never enter them). Done when #29 boxes 1-2 tick
- [ ] deploy chain `bash scripts/site-owner-wizard.sh` §1/§2/§4 — owner-run. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:209`) — every push pre-auth void, re-gate it
- [ ] #28 aged-record 6h — owner accepts or changes; if changed, `MAX_AGE_MS` (`session.ts:5`) + `session.test.mjs:413`'s 7h fixture move together
- [ ] #12 no longer a gate (own body says so) — close or relabel; GitHub write, needs owner go
- [ ] #1 body ~L81 still reads "pause live" — commented, not edited; body edit needs owner go
- [ ] `scripts/site-owner-wizard.sh:159-160` (`gh secret list` — owner may lack gh) + `:198` (`dig NS`, no `nslookup` fallback) — found, not fixed
- [ ] #24 dormant until a 2nd checkpoint writer exists (ADR-0010)

inflight: measured at save — tree: `SESSION-HANDOFF.md` + `docs/sessions-archive.md` modified (this save only) · `c72ff15` pushed, no ahead-count · open PRs: checked, none · CI green on `c72ff15` · open issues: 13 · GitHub writes this session: #1 comment only

spent: queue 7→8 · batches 1 · ended early: no — every agent-doable item Done, rest owner-blocked

