# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state


### S2026-08-25#5

done: **no `src/` change at all this session — design canvas + tickets only** · 5 NEW artboards `design/HomeShrine|HomeEditorial|HomeArcade|CatFortunePop|CatPartyPop.dc.html` + `canvas.json` page-4 (3 home directions at 1440px, 2 หมวด pages in pop-card) + 7 notes · republished as a **NEW artifact** on the owner's call — this session could not read the old one back (WebFetch is redirected by the context-mode hook, so the skill's `--extract` path was unreachable), old link left intact · background review returned 4 REAL defects in the new artboards, all fixed before publish: an invented tagline tail in 3 files, the `/games/` nav label disagreeing across files, tool descriptions truncated three different ways, and a header comment claiming every line came from the manifest when a quarter of it was new copy · 11 tickets filed #86–#96, native GitHub dependencies, every body byte-verified against its source file after publish · #89 body widened so its rule covers the roster half too

dec: **owner 2026-08-25** — home direction = **C สนามวัดดวง** (`design/HomeArcade.dc.html`) · the pop-card UI moves to the หมวด pages and the home page takes the new direction · the 3 hub group cards go, and the 4 manifest fields only they read are deleted with them, reversing part of gh#75 (in #87) · "ฟรี / 2–10 คน" cut from visible copy while `<title>` and `<meta description>` keep it · **the shared roster AND the 2–10 range are both scoped to the สุ่มคนโดน หมวด alone, and เซียมซี takes no exception despite passing the phone round a circle** → ADR-0039 · the tool→game handoff narrows to that หมวด · the 3 tools lose the ten-name ceiling

next:
- [ ] **FOCUS — commit.** gh#82+gh#83+gh#84 have sat uncommitted since S#4 behind a REFUTE nobody read. The artefact is still on disk at `out-refute2.json` under the scratchpad of session `5720467b-ba8c-48c6-a09b-99a8b3d3aeee` — another session's temp dir, so verify it exists before planning on it and re-run the round if it is gone. Read it, act on the findings, then commit. Done when `git status --short` prints nothing and CI is green on the pushed commit
- [ ] agent: #86 or #90 — the only two tickets with no open blocker, in different lanes, no file overlap. Done when either closes
- [ ] agent: #90 has to put a question to the owner — does a tool page get a right-hand ad rail, or stay ADR-0004's below-the-tool only. Done when the artboard states one and names the ADR amendment if it needs one
- [ ] owner: review the two Thai strings gh#83's worker wrote in `siamsi.ts` — `HINT_TAP_ONLY` and `HINT_ENABLE_SHAKE`. Product copy no test can judge. Done when accepted or reworded
- [ ] owner: open the six game screens and judge them against `design/` by eye. Done when accepted or a change list exists
- [ ] agent: gh#82 left `/games/` and `/tools/` with no ad slot on purpose — an artboard comes first if the owner wants inventory there
- [ ] owner-run: the AdSense console page exclusion for the one denylisted page. No gate in this repo can observe it
- [ ] owner-run: gh#9 domain then gh#29 AdSense. Blocks the last box on gh#15 gh#16 gh#17 gh#18 — those four tools are BUILT and shipping
- [ ] owner-run: gh#13 last box — the real-device script on one real iPhone, runnable now on the Azure default hostname
- [ ] owner: gh#12 keyword planner · gh#19 month-6 organic-clicks gate
- [ ] agent, PARKED by owner 2026-08-25, do not pick up without a new decision: re-run the hero as a true transparent cutout

inflight: measured at save — 27 dirty paths (18 modified carried from gh#82+gh#83+gh#84 since S#4, 6 new design files, `scripts/public-orphan-check.mjs`, `design/canvas.json`) plus this save's own writes · 0 unpushed commits before this save's own · 0 open PRs (checked) · 30 open issues (checked) · 0 background tasks (the review agent returned) · **`design/watduang-design-canvas.html` is a ~2.2MB seeded bundle and `.gitignore` named only the OLD filename — fixed to a pattern in this save, so the bundle stays out of the tree**

spent: queue 9→11 (2 owner items drained, 4 added by this session's decisions) · dispatches 1 (one review agent, returned with 4 real findings) · tickets filed 11 · REFUTE rounds unchanged, the S#4 round is still unread
