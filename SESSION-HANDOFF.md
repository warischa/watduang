# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state


### S2026-11-11#1
done: RH (FRESH) + U round · design grilling for the company New Year prize draw → record gh#299 (body = decisions 1–14; comments 2026-11-11: owner ruling on `ui-ux-pro-max`, execution scaffold) · 11 children gh#300–gh#310 as sub-issues of gh#299, native blocking deps, `ready-for-agent` · every body and comment read back identical · `CLAUDE.md` `ui-ux-pro-max` line `5d17a1e` · no src change
dec: owner popups 2026-11-11 — feature decisions recorded in gh#299's body; ticket cut = coarse (11), game canvases wait for the gh#302 pick, phase-2 tickets filed after phase 1 (recorded in gh#299's body, decision 12 and its delivery section) · U round: gh#9 bind = owner does it, agent verifies after; gh#12 parked (both rulings recorded here, not on the tickets)
next: [ ] gh#299 children: frontier gh#300 · gh#301 · gh#302 in parallel worktrees, then the chain to gh#310 — how: scaffold comment on gh#299 (2026-11-11); re-derive the frontier from native deps via `gh`, never from this line; owner picks on gh#302 and gh#303 asked live as popups · crit: each child closed with an evidence comment after a REFUTE pass; gh#310 closes on the full `scripts/run-workflow-gates.sh` green and the owner's deploy go · via /orchestrate
next: [ ] gh#290 · gh#291 · gh#295 F4 · `src/games/_arm-gate.ts` stated ceilings (uncapped deferral; gate built with no pointer contact behind it, dice-loser under reduced motion named as the shape to measure, never measured; caller disables during an open window; one-bit marker, keyboard in the overlap span; gh#297 stale-anchor unarmed overlap) — record only, no open decision consumes them; last re-check 2026-11-08 comments above
next: [ ] H: gh#9 buy `watduang.com` — payment + personal details; whois still `No match` (checked 2026-11-11); checklist in gh#9 comment `5789453647` (re-run whois, WHOIS privacy, auto-renew, registrar with ALIAS/ANAME/flattening). Hand back: say when bought → unblocks the verify line below
next: [ ] gh#9 verify the bind, then close gh#9 — owner binds apex + www (steps 1–5 of comment `5789453647`; ruling 2026-11-11 recorded here, not on the ticket) · crit: `dig +short watduang.com A` resolves, `dig +short www.watduang.com CNAME` = the app host, both Custom domains rows `Ready` · Blocked · ask: owner edit (buy + bind)
next: [ ] gh#160 · gh#29 · gh#19 — wait on the gh#9 bind (stated blocker, not re-probed 2026-11-08); gh#29 also needs the owner's AdSense account; the 300px ad rail on the wheel, draw and team boards needs ADR-0004 approval after gh#29 · Blocked · ask: unblocks when the bind lands
next: [ ] gh#12 Keyword Planner volumes → `docs/research/` — agent drives it in the browser pane · Blocked · ask: owner edit — sign in to Google Ads in the pane when ready (parked by the owner 2026-11-11, recorded here)
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — also carries gh#204 boxes 7 and 9, gh#205 box 1, gh#219 box 1 (each ticket's last comment, 2026-09-21 / 2026-09-15), plus the adds in archive entries S2026-11-07#2, S2026-11-07#1, S2026-11-06#3. Hand back: results on gh#141
inflight: measured at save — main = origin/main `478288a` + `9776fcc` `d0d5ac3` `ef3f20b` `5d17a1e` + this save (unpushed, docs only, ride the next src push); prod = `478288a` (last main CI run, checked 2026-11-11); 0 open PRs; worktrees none; bg tasks 0
errors: wrote bash-4 syntax (`declare -A`) for macOS bash 3.2 — the script died before any write, rerun in python · typed an Arabic letter inside a Thai word in the gh#299 draft — caught by a codepoint check before publishing
