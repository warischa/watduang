# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-26#2

done: **5 issues closed, 4 filed, 6 commits, 2 deploys, all live and re-verified against the deployed site** · gh#113 seven stale `/games/` comment lines across six files, not the ticket's two — condition queried, not the phrasing · gh#110 `.draw-box` border-box, +28px ad drift gone, offset flat across 17 samples, calibrated on both trees; ticket's accumulation premise refuted, defect is one-time per list load · gh#94 `carriesGroup` on `CategoryMeta` + optional `category` prop on `GameNav`, zero category literal, proved on built output and by TS2741 in both directions; wheel desc clause DELETED not reworded, same clause deleted from `team.astro` SEO description; box 4 was already pinned so one assertion added, not a suite · gh#108 azure/login v2→v3 · gh#85 closed as already-built, all five boxes verified by running the gate not reading it · gh#111 box 2, heading now required, ts(2322) calibrated both ways · `/tools/` hub styled from fully unstyled: card tap area 5.8%→99.7%, title 16px/400/UA-blue→22px/600 h2, back link 84x18→149x72, footer 44x24→44x44, cards hug text · `docs/runbook.md` 12018→10130B, page-deletion section routed to `docs/agents/page-deletion.md` on the ADR-0012 seam, zero inbound citations, checked twice on independent paths · `scripts/crawl-check-gamenav.mjs` expectation derived from both manifests, no category and no count literal, selftest needle re-anchored, mutants 2/2 planted 2/2 caught, real gate broken and restored twice
dec: owner 2026-08-26: gh#108 prove on a throwaway branch before main · delete the `team.astro` continue clause for consistency with the wheel · file the +70px ad reflow · file the ungated-tool-nav and the SEO-link-trade-off findings · file the probe edge-bug finding · push both deploys · `GameNav` heading CORRECTED (required prop) rather than documented, because a comment is not a guard
next:
- [ ] **FOCUS gh#112** — owner Thai for the two labels, then the tool-page Thai sweep. Largest open content block. Done when it closes
- [ ] agent: gh#115 crawl-check reads 0 tool pages. Done when it scans all four and its printed count traces to pages actually opened, calibrated per member
- [ ] agent: gh#117 tap-area probes may miscount at the box edge. Seven candidate scripts named in the ticket. Done when each is classified affected or not, and every affected one is fixed with a before/after miss count
- [ ] agent: gh#114 the +70px ad move on the first list load. Done when the offset holds across that load at 320 and 390, or ADR-0024 records the exemption
- [ ] agent: `docs/agents/ci-verification.md` is 11447 of 12288 bytes. Route a section out before the next append
- [ ] owner: gh#116 record the SEO internal-link trade-off gh#94 made, or specify how to keep the links. Done when the record exists
- [ ] owner: gh#111 box 3 — a word for the union of เกม and ดูดวง pages. ADR-0040 left it open on purpose. Blocks closing gh#111
- [ ] owner: Thai copy for gh#101 (fixes the live dead end), gh#97, gh#99. Blocks every content ticket
- [ ] owner: does a category page get the top bar? Done when the allowlist is decided
- [ ] owner: gh#89 rule — done when it names permitted surfaces, not banned strings
- [ ] owner: judge the remaining tool artboards and the wheel by eye. The `/tools/` hub was judged this session; the rest still have only machine checks
- [ ] owner-run: gh#9 domain then gh#29 AdSense, still blocking the last box on gh#15 gh#16 gh#17 gh#18 · gh#13 real-device script · gh#12 · gh#19
- [ ] agent, PARKED by owner 2026-08-25, needs a new decision: re-run the hero as a true transparent cutout
inflight: measured at save — dirty paths are this save's own writes only · 0 unpushed once this save pushes · 0 open PRs (checked) · 1 worktree, the main checkout (checked) · 0 background tasks (checked) · no branches beyond main, so the merge asked for is a no-op and was NOT performed
spent: queue 10→13 · batches 3 · ctx not measured at save · 4 tickets filed gh#114 gh#115 gh#116 gh#117 · 3 blockers caught before commit, two by the pre-merge review and one by the orchestrator
