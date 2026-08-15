# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-15#1

done: **stale-closure checkpoint bug found + fixed, `65d3d3c`** (13 files, +607/−85) — a discarded round could come back: `loadSession()` hands out independent closures over one key, so a `#ss-draw`/`#ss-pass` click between `clear()`'s `removeItem` and `location.reload()` re-wrote the checkpoint via the game's stale `ctx.session`; after reload เริ่มรอบ offered กลับไปเล่นรอบที่ค้าง for the round just discarded. **Reproduced 12/12**, 3 write paths, positive+negative controls → **0/12 after**. Fix = `session.ts` `write(stored, create=false)`, never create only update; `setPlayers` is sole creator and always runs first (`[id].astro:50-51`, `siamsi.ts:344`). Regression detector is **raw record presence, NOT the checkpoint field** — one variant revives the record with `checkpoint:null`, indistinguishable from absent through `loadSession()` · **#16-08 ticked → 37 of 41** (`evidence/16/08-*`; identity by unique TEXT match + all-other-boxes-identical, asserted before AND after) · **#20's last DoD box proven** (`evidence/20/01-*`; mid-round state identical across refresh — plain reload does NOT auto-resume, เริ่มรอบ raises `#resume-choice`, both correct per ADR-0008) · `siamsi.ts` +holder-vs-`results.length` invariant +non-silent failed resume · `_template.ts` +shared-slot warning · `site-owner-wizard.sh` 16 owner steps · `keyword-planner-seeds.md` 11 items ×2 Thai seeds, zero invented volumes · Thai→English in 5 files · verified 79/79 · tsc 0 · build 0

dec: **#24 deferred — ADR-0010** (design recorded there, not built) · **ADR-0008's flip-fact re-checked against code: NOT met** — siamsi is still the sole checkpoint writer, so `planClear`'s game-agnostic predicate stays correct; an earlier claim this session that the trigger had fired was wrong, corrected in ADR-0008 · REFUTE round 1 → 6 findings, 5 fixed (wizard EOF infinite loop reproduced then cured · untracked worktree · Thai residue · TSV snapshot unlabeled · template omitted the create-guard), no round 2, all spot-fixable · `box-verdict-map.tsv` state column deliberately NOT flipped — it is a frozen snapshot (35 rows still read `unticked` while ticked); col7 renamed `live_state_at_2026_08_14_mapping_proof` instead

next:
- [ ] post the `#24` analysis comment — drafted this session, NOT posted (never authorized); rationale is safe in ADR-0010 · done when `gh issue view 24 --comments` shows it
- [ ] owner glance: new Thai string on `siamsi.ts` failed-resume path — `กู้รอบที่ค้างไม่ได้ — ข้อมูลรอบเดิมเสียหาย เริ่มรอบใหม่ได้เลย` (compliant, unreviewed)
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` walks checklist §1/§2/§4, unblocks 4 ad-slot boxes + #13 DoD4 · `--check` exits 0 today
- [ ] `[id].astro:52` — game B's start clobbers shared `session.players`; found by the ADR-0010 design pass, NOT fixed
- [ ] `player-select.ts` legacy Thai comments — file untouched this session so converge-on-touch never fired
- [ ] #12 seeds ready; the measurement itself is owner-run (Google Ads login)

inflight: measured at save — `65d3d3c` + this save commit on `main`, pushed · open PRs: checked, none · agent worktree removed and `.claude/worktrees/` now gitignored · 11 subagents returned · GitHub writes this session: 1 body edit + 1 comment, both on #16
