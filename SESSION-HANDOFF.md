# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-10-01#1
done: RH FRESH (both axes; whois `watduang.com` still `No match`, 2026-09-26) · no src change · filed 5 tickets from the owner's live-site review, each body read back equal to its draft (trailing newlines stripped), all labelled `ready-for-agent`, native blocked-by edges read back: gh#240 · gh#241 · gh#242 blocked by gh#241 · gh#243 blocked by gh#241 · gh#244 blocked by gh#243.
dec: owner popup rulings 2026-10-01, recorded in the ticket bodies: dice-loser idle faces DIMMED (gh#240) | `docs/agents/assets.md` 60 KB raster ceiling = per image, plus lazy-load (gh#241, gh#242) | the live home lacks all four: game art at a glance, motion, bold colour/type, game-portal layout rather than an ad landing (gh#243) | home mockups wait for the pilot card art (gh#243 blocked by gh#241) | the owner's ask overrides assets.md rule 1 "draw it in code first" for game-card art only (gh#241).
next: [ ] gh#240 dice-loser dimmed idle faces — crit per ticket: a fresh load shows pips on all three dice before any tap, dimmed and measured at 320px; idle faces never feed `rollDice`; `arm-reveal-paths` green; a check that reds when the reset goes back to blank
next: [ ] gh#241 game-card art pilot via /gpt-image-2 — one game end to end; crit: `magick` alpha checks pass, ≤60 KB as shipped, lazy-loaded, `images/IMAGES.md` row · Blocked · ask: the owner approves the style (that box is the owner's) before gh#242 and gh#243 start
next: [ ] gh#242 art for every remaining game — Blocked by gh#241 (native edge)
next: [ ] gh#243 home redesign mockups — 2–3 directions, each answering the four lacks above; the concept already shipped once (gh#87, `design/HomeArcade.dc.html`, then ADR-0058), so a mockup that only restates it fails · Blocked by gh#241 · ask: the owner picks one; a pick that changes ADR-0058's structure amends that ADR
next: [ ] gh#244 build the chosen home canvas — Blocked by gh#243 (native edge)
next: [ ] gh#9 close — after H: gh#9, verify and close with an evidence comment. Verify: `dig +short watduang.com A` resolves, the owner reports both SWA Custom domains rows `Ready`, `https://watduang.com` serves the site · Blocked · ask: unblocks when H: gh#9 lands — nothing to decide before then
next: [ ] gh#160 — Cloudflare Web Analytics, chosen and not wired; its other blocker #159 is confirmed dead. Verify: per ticket, once the domain resolves · Blocked · ask: unblocks when H: gh#9 lands — nothing to decide before then
next: [ ] gh#29 — ad slots need the domain AND an owner AdSense account, site review and publisher ID; two owner acts, not one, per its own body. Verify: publisher ID recorded and ad code live · Blocked · ask: unblocks only after gh#9 AND the owner's AdSense account — do not brief it as domain-only
next: [ ] gh#19 — month-6 organic-clicks gate; needs the domain, Search Console connected to it, and six months of traffic. Verify: organic clicks recorded at month 6 · Blocked · ask: nothing to decide until the domain and the traffic window both exist
next: [ ] H: gh#9 owner registers `watduang.com` AND binds the apex and `www` in the SWA portal per comment `5789453647` (ruling 2026-09-23 recorded in the archive, not on gh#9) — owner-only and financial, never an agent action; re-run whois immediately before paying (`No match` again 2026-09-26, RH), privacy on, auto-renew on, and check the registrar offers ALIAS/ANAME/flattening at the apex. Hand back: `dig +short watduang.com A` resolves and both Custom domains rows read `Ready`
next: [ ] H: gh#141 walk every box on a real phone with `docs/verification/gh141-real-device-script.md` — the 20 boxes of comment `5790035284` plus the เนื้อคู่ row added 2026-09-26; gh#204/gh#205/gh#219 carry NO agent slice per their triage comments. Also note, not yet on any ticket: croc-bite and pinocchio-luck frame rate after `2fd61ab`/`daeb9ac`, and the croc-bite lite tier via a coarse pointer. Verify: every box noted with device and OS on its own ticket
next: [ ] H: gh#12 needs an owner Google Ads account, NOT the domain — its body says `Blocked by: —`. Verify: Keyword Planner volumes recorded under `docs/research/`, never `.scratch/`
inflight: measured during this save — `gh pr list --state open` empty; one worktree, `main`; no background tasks; the tree is dirty only with this save's files
spent: queue 4→9 · batches 0 — no ticket closed; 5 filed
errors: **(1) cause asserted from a grep slice** — wrote "renderPips runs only at mount" into the handoff before reading `renderTurn`, which resets every turn to face 0 on purpose; corrected one turn later, before any ticket was filed.
