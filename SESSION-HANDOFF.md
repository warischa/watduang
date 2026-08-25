# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-25#6

done: **no `src/` change at all — ADR + docs + canvas + tickets only** · **ADR-0040 landed** (6f45a50) with `CLAUDE.md` opening line rewritten and `CONTEXT.md` gaining `การดูดวง` as a term so the vocabulary does not contradict the ADR on day one · **9 NEW artboards** `design/SiamsiIntent|SiamsiShake|SiamsiStick|SiamsiSlip|DuangTodayIdle|DuangTodayResult|SoulmateStart|SoulmateResult|SoulmateSolo.dc.html` + `canvas.json` page-5 + 2 briefs (fbadfab) · **2 defects came out of RENDERING, not reading**: a heading overflowed the 390px artboard at Mitr 26px (ceiling now written into the file — 15 advance-bearing Thai glyphs, combining marks are free), and the fallen ติ้ว floated above a ground line no other screen draws (line deleted) · **`docs/agents/assets.md` gains the measured model result** behind the generated-art path · **3 test images generated, pipeline proven end to end** — 1024 render → crop → alpha threshold → 480px, 83KB, passes the repo's own transparency gate · **tickets: 8 NEW #97–#104** with native `blocked_by` edges verified by read-back, **#96 widened** from "remove the range" to the solo page class, **#95 CLOSED on a premise change** (nothing takes a name any more), **#89 given the neighbour cite**

dec: **ADR-0040** — เกม exist in the สุ่มคนโดน หมวด alone · ดูดวง pages are solo · `players: [1,1]` becomes legal and the validator's `min >= 2` opens · `/game/<id>/` URL prefix unchanged · owner 2026-08-25, all from the popup: เซียมซี takes **no ไม้ปวย** step and **unlimited re-draw**, slip = กลอน + 4 headings + closing thought · ดวงวันนี้ = comedy, everyday, 3 lines from 3 non-overlapping หมวด, verdict derived from the luck sum, **not** a per-day lock (that stays daily-fortune's old promise and dies with it) · เนื้อคู่ replaces ดวงความรัก, 80/20, **the 20% branch keeps its odds and is reworded, not removed**, น้ำหนัก cut, สัญชาติ kept as text and never used to draw a face · portraits pre-generated and mapped **1:1 to character cards**, so a picture can never disagree with its words · **image model = `wan2.7-image-pro`, explicitly, NOT the qwen-image skill's default** — measured with prompt/size/seed held identical: qwen returned 3 channels and alpha mean exactly 1, wan returned a real cutout

next:
- [ ] **FOCUS — commit the S#4 carry-over.** gh#82+gh#83+gh#84 have now sat uncommitted through THREE sessions behind a REFUTE nobody read. Artefact at `out-refute2.json` under the scratchpad of session `5720467b-ba8c-48c6-a09b-99a8b3d3aeee` — another session's temp dir, so check it exists before planning on it and re-run the round if it is gone. Read it, act, commit. Note `siamsi.ts` in that carry-over is the file #97 rewrites — land this first or the rewrite fights a dirty tree. Done when `git status --short` prints nothing and CI is green on the pushed commit
- [ ] agent: **#96** — the solo page class. Unblocks #97 #99 #101 and everything behind them; nothing else in the ดูดวง redesign can start until it lands. Done when it closes
- [ ] agent: #86 or #90 — no open blocker, different lanes, no file overlap. Done when either closes
- [ ] agent: #90 has to put a question to the owner — does a tool page get a right-hand ad rail, or stay ADR-0004's below-the-tool only. Done when the artboard states one and names the ADR amendment if it needs one
- [ ] owner: judge the three สุ่มคนโดน game screens against `design/` by eye. The other three are being replaced by #97 #99 #101, so only the party half is worth reviewing now. Done when accepted or a change list exists
- [ ] owner: the shake-hint copy review carried from S#5 moves onto #97's new strings — the old `HINT_TAP_ONLY` wording is replaced by a press-and-hold line in that ticket. Done when the new copy is accepted or reworded
- [ ] agent: gh#82 left `/games/` and `/tools/` with no ad slot on purpose — an artboard comes first if the owner wants inventory there
- [ ] owner-run: the AdSense console page exclusion for the one denylisted page. No gate in this repo can observe it
- [ ] owner-run: gh#9 domain then gh#29 AdSense. Blocks the last box on gh#15 gh#16 gh#17 gh#18 — those four tools are BUILT and shipping
- [ ] owner-run: gh#13 last box — the real-device script on one real iPhone, runnable now on the Azure default hostname
- [ ] owner: gh#12 keyword planner · gh#19 month-6 organic-clicks gate
- [ ] agent, PARKED by owner 2026-08-25, do not pick up without a new decision: re-run the hero as a true transparent cutout — **this session found the reason it failed** and wrote it into `docs/agents/assets.md`, so the blocker is now technical-solved and the park is a product call only

inflight: measured at save — 19 dirty paths (18 modified, 1 untracked: the S#4 carry-over plus this save's own two writes) · **3 unpushed commits, one of which is S#5's own save commit** — the previous save was never pushed, so this save commits without pushing to match · 0 open PRs (checked) · 30 open issues (checked) · 0 background tasks (checked)

spent: queue 11→12 (1 owner item drained as obsolete-and-rerouted, 2 added by this session, 1 rerouted into a ticket) · dispatches 0 (no subagents this session) · tickets 8 filed + 1 widened + 1 closed + 1 commented · images 3 generated, 0 kept in the tree
