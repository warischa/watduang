# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state


### S2026-11-08#1
done: RH + pick "go A" (row 4.1 only) · trigger re-check at `d0d5ac3`, no row flips: gh#290 comment `6716175814`, gh#291 comment `6716176017` · gh#295 F4 detector `docs/verification/evidence/gh295-refute/wheel-landing-counterexample.mjs.txt` re-run at HEAD rc=1: still reproduces, same as base, positive control holds; comment `6716176230` · all three read back identical · no src change
dec: agent: F4 stays recorded, not fixed — its detector re-holds with a contact stamped 200 handled at 6250 (about a 6s stall), reachability inferred, not measured (gh#295 comment `6716176230`) · gh#9 split per `unblock-round.md` §2: purchase = owner act; SWA hostname bind is agent-doable, `az` logged in (checked 2026-11-08)
next: [ ] gh#290 · gh#291 · gh#295 F4 · `src/games/_arm-gate.ts` stated ceilings (uncapped deferral; gate built with no pointer contact behind it, dice-loser under reduced motion named as the shape to measure, never measured; caller disables during an open window; one-bit marker, keyboard in the overlap span; gh#297 stale-anchor unarmed overlap) — record only, no open decision consumes them; last re-check 2026-11-08 comments above
next: [ ] H: gh#9 buy `watduang.com` — payment + personal details; checklist in gh#9 comment `5789453647` (re-run whois, WHOIS privacy, auto-renew, registrar with ALIAS/ANAME/flattening). Hand back: registrar name + sign in to it in the browser pane, or say you will do the DNS → unblocks the bind line below
next: [ ] gh#9 bind apex + www: SWA hostnames via `az`, registrar TXT/ALIAS/CNAME via browser pane, steps 1–5 of comment `5789453647` — ⚠confirm (prod config) · crit: `dig +short watduang.com A` resolves, `dig +short www.watduang.com CNAME` = the app host, both Custom domains rows `Ready`, then close gh#9 · Blocked · ask: after H: gh#9 — grant the bind (a) / owner does it (b)
next: [ ] gh#160 · gh#29 · gh#19 — wait on the gh#9 bind (stated blocker, not re-probed 2026-11-08); gh#29 also needs the owner's AdSense account; the 300px ad rail on the wheel, draw and team boards needs ADR-0004 approval after gh#29 · Blocked · ask: unblocks when the bind lands
next: [ ] gh#12 Keyword Planner volumes → `docs/research/` — agent drives it in the browser pane · Blocked · ask: owner signs in to Google Ads in the pane (owner edit); whether the owner has a Google Ads account is unverified
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — also carries gh#204 boxes 7 and 9, gh#205 box 1, gh#219 box 1 (each ticket's last comment, 2026-09-21 / 2026-09-15), plus the adds in archive entries S2026-11-07#2, S2026-11-07#1, S2026-11-06#3. Hand back: results on gh#141
inflight: measured at save — main = origin/main `478288a` + `9776fcc` + `d0d5ac3` + this save (unpushed, docs only, ride the next src push); prod = `478288a`; 0 open PRs; worktrees none; bg tasks 0
errors: a `next:` line listed a gate ceiling ("two-cancellers strand") that `_arm-gate.ts` does not state — an enumeration written from memory, not read from the file; replaced above with the file's own list
