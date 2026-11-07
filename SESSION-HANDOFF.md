# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state


### S2026-11-07#2
done: RH + pick G1 then G2 · gh#297 fix E `e8fdab0` + REFUTE r1 spot-fix `ad66831` (deliberate tap past an anchored window not re-held) + r2 PASS `b86ed5f` · gh#298 `syncControls` reads `gateHolds` `33f84f4` · gh#296 desktop 940px card from 1100px `d9e3f31`, foot-band fix `478288a`, renders `a1a24d8` · evidence `docs/verification/evidence/armgate-leak-refute/gh297-fix-e.md`, `docs/verification/evidence/gh296/`, `docs/verification/evidence/gh296-ship/` · full gates at `478288a` 52 executed 0 failed · CI branch 42376969725 + main 42378263557 success · `scripts/live-site-bytes.sh` same=203 diff=0 miss=0 (pre-deploy 160/18/25) · gh#297, gh#298, gh#296 closed with evidence comments, read back · remote `batch/gh297-298-296` deleted (contained in main) · `9776fcc` evidence README marked shipped
dec: owner popups 2026-11-07 (gh#296 ruling also on the ticket's closing comment): gh#296 = ship the board's 940px card, no ad rail · fix the card's foot band before deploy · deploy the batch | agent: fix E over a per-control holder list (invariant S stays a stated ceiling in the gate) · gh#298 via `gateHolds` read, not a re-hold callback · names list closes the controls stack + `scroll-margin-top: 96px` on the disc (measured 82px overhang plus slack)
next: [ ] gh#290 · gh#291 residuals, plus gh#295 F4 and the gate's stated ceilings in `src/games/_arm-gate.ts` (keyboard in the overlap span; two-cancellers strand; stale-anchor unarmed overlap) — record only, no open decision consumes them
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account; the 300px ad rail the wheel, draw and team boards draw needs ADR-0004 approval and waits on gh#29 · Blocked · ask: unblocks when H: gh#9 lands (`dig +short watduang.com A` empty 2026-11-07)
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — adds: wire-snip close the rules modal then tap scan on turns 1–3 (gh#297), player screen stepper tap after a late re-hold keeps start inert (gh#298), plus the adds in archive entries S2026-11-07#1 and S2026-11-06#3; `/tool/wheel/` 1100px+ is desktop-only, not this queue
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — main = origin/main `478288a` + `9776fcc` + this save (unpushed, docs only); prod = `478288a`; 0 open PRs; worktrees none; bg tasks 0
errors: completeness claims from a narrow search, two instances caught by REFUTE: "no other gated control acts on press" came from a literal `'pointerdown'` grep that cannot see siamsi's helper-registered listener, and the wheel radios were written as gated through `also` without reading the call · a saved detector carried a premise the previous session's caller fix had removed (`wire-variant` `ORDER=head`), found only when its assert threw
