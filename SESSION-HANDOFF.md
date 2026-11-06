# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-11-06#3
done: RH · impeccable design skill installed as a project plugin, telemetry off (`578e52d`) · critique + audit of `/`, `/c/fortune/`, `/game/siamsi/`, `/tools/`, `/tool/wheel/`, `/game/timebomb/play/` → `docs/verification/evidence/impeccable-2026-11-06/README.md` · gh#295 filed (one cycle ticket, 12 owner picks) · A1–A6 shipped and DEPLOYED `e9716ff` (CI main 42207502483 success; `scripts/live-site-bytes.sh` same=201 diff=0; the live joined-tagline probe was red before the deploy) · REFUTE pass: no confirmed bug; findings 2, 3 and 6 fixed (`2c9c9e7`, `b36b9b1`) · gh#295 progress comment 6683654839 (read back)
dec: owner popups 2026-11-06 (recorded on gh#295's body): install = plugin + hooks · targets = home, fortune, tools, one party route · all 12 picks · one cycle ticket · party rows and value-free bugs straight to code, the rest canvas first · push approved | agent: A6 joiner at render time, between every grapheme cluster (keeps the manifest and the OG lock byte-exact; engine-independent)
next: [ ] gh#295 B1–B6, canvas first (ADR-0033): B3 ToolHeader gutter ≥1100px · B2 siamsi vessel redraw (reads as a beer glass, §32/1) · B5 siamsi keep-slip + slip text alignment · B6 wheel feedback / GameNav / desktop · B4 home shelf + hero — rows and options on gh#295's body · crit: boards in `design/` approved by the owner, then code with the full gates
next: [ ] gh#295 B1 privacy page + footer links — feeds gh#29 (AdSense "Required content", answer 1348695) · Blocked · ask: who writes the policy text (a: agent drafts, owner approves; b: owner supplies)
next: [ ] verify impeccable loaded at session start — `/impeccable` in the skill list and its SessionStart hook ran; set `IMPECCABLE_LIVE_COPY_AGENT=chat` before any `live` use (README of pbakaus/impeccable: Apply otherwise launches `claude --permission-mode bypassPermissions`) · crit: the skill listing shows `impeccable`
next: [ ] gh#290 · gh#291 · gh#295 residuals (pass label ellipsis on shared-prefix names; 41px ticking scroll with two 24-char names at 320x568, pre-existing) — record only, no open decision consumes them
next: [ ] gh#9 close · gh#160 · gh#29 · gh#19 — all wait on H: gh#9; gh#29 also needs the AdSense account · Blocked · ask: unblocks when H: gh#9 lands (`dig +short watduang.com A` empty 2026-11-06)
next: [ ] H: gh#9 register `watduang.com` + bind apex/www in SWA (comment `5789453647`) — owner-only, financial. Hand back: `dig +short watduang.com A` resolves, both Custom domains rows `Ready`
next: [ ] H: gh#141 real-device walk `docs/verification/gh141-real-device-script.md` — adds: the /feedback/ form from a phone with a Thai keyboard · home h1 at phone width · gh#295 A1–A6 (timebomb spark and boom burst, the pass label, siamsi held-key draw on desktop Safari, the ดวงวันนี้ tagline wrap on iOS Safari) · the device boxes of gh#204 (7, 9), gh#205 (1), gh#219 (1)
next: [ ] H: gh#12 Keyword Planner (owner Google Ads account). Hand back: volumes under `docs/research/`
inflight: measured at save — main = origin/main `e9716ff` + this save (unpushed, docs only); prod = `e9716ff`; 0 open PRs; worktrees none (agent worktree removed at this save); bg tasks none
errors: one class, two instances — a wrapper's exit read as the verdict: the background gates task exited 0 on a FAILED run (my trailing echo), and the first full gates ran after only the narrow tests, so the importer set (two source-shape tests) red on my own wrapper · the Write tool decoded a `⁠` escape into the literal character (caught by the REFUTE pass, fixed by byte-level perl)
