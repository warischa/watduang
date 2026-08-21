# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-21#3

done: **5 commits `fb23fc7`→`4aa31af`, all pushed · CI `32449744506` + `32452639073` green incl. `Deploy to Azure Static Web Apps` · live-verified both ways** · **404 was indexable** — served at 200 with no robots meta, same class as `85a32e7`; found by sweeping routes the go-live probe never checked (a happy-path probe only tests routes that EXIST). `Base.astro` gains an optional `noindex` prop, `404.astro` the only page passing it; guard pins BOTH halves — a flipped default or negated condition in `Base.astro` deindexes every page while staying green — calibrated 4 ways. Live: robots meta present on `/404.html`, ABSENT on `/game/timebomb/` · **gh#55 CLOSED structurally, not by measurement** — `#clear-choice` is a `<dialog>` (ADR-0024). Probe re-ran on siamsi/3 + timebomb/3, both refuted, positive control 78/91; roster axis proved DEAD (`result-roster-invariance.json`), so coverage is 2 configs not 3. `leave-confirm-check` extended to 2 dialogs / 5 conditions · **gh#53 start path fixed, ZERO new Thai** — reused `refusalCopy`'s `'other-round'` arm; `StartKind` stated on `watduang:start`, `ShellSession` widened so only the shell can mint (a game passing `'new-round'` is TS2554 — planted and confirmed) · **gh#54 data loss fixed** — mount guarded, panel restored, roster survives; restore deferred to a microtask or the fix works exactly ONCE (cached chunk throws sync inside `dispatchEvent`, `requestStart` then re-hides). Evidence `docs/verification/evidence/54/` · **citation gate shipped (gh#57 closed)** — `scripts/added-lineno-citation-check.mjs`, diff-scoped; CI first run scanned 634 added lines, not a silent zero · ~47 citations re-anchored to durable symbols · tests 164→173 · `astro check` 0 · build 14 pages · 10 static gates selftest+run 0

dec: **ADR-0024** · **ADR-0025** · owner overrode their own gh#55 tripwire rule after the fork's evidence — the ~60px margin is emergent from Thai text width, NO CSS declares it · gh#54's failure string is the owner's to write (gh#25) — slot + constraints delivered in gh#54's comment · gh#59's two gate holes left unfixed ON PURPOSE: that artifact's REFUTE budget is 2/2 and the exemption logic is the part both rounds found bugs in · `npx tsc --noEmit` does NOT typecheck `.astro` — planted a type error it missed; `npx astro check` is the real gate (`docs/runbook.md`)

next:
- [ ] owner-run: gh#9 domain → gh#29 AdSense. `dig +short watduang.com NS` EMPTY (re-verified 2026-08-21) — still the blocker for the one ad box on each of #15 · #16 · #17 · #18
- [ ] owner-run: gh#13 last box — run `docs/verification/gh13-real-device-script.md` on one real iPhone. Done when gh#13 carries device · iOS · browser · Auto-Lock setting · the qualifying round's timed untouched duration · pass/fail per invariant
- [ ] owner: write gh#54's failure string. Slot + constraints are in gh#54's comment. Done when the string exists and the mount catch renders it through `showError`
- [ ] gh#56 — resume inherits a cross-game id. Needs an owner decision on giving the checkpoint blob its own identity (touches ADR-0010 · ADR-0021) BEFORE any code
- [ ] gh#59 — 2 known gate holes: duplicate-token laundering (fix = compare occurrence counts, not set membership) · `SESSION-HANDOFF.md`'s exclusion rationale is half-true for `next:`/`inflight:`, which are live pointers not record
- [ ] gh#58 — the dialog is UA-centred; needs `#leave-confirm`'s `.at-top`/`.at-bottom` + a clearance budget in `tokens.css`

inflight: measured at save — tree carries only this save · open PRs 0 (checked `gh pr list`) · bg tasks 0 (checked) · open issues 14→16 · ALL PUSHED `fb23fc7`→`4aa31af`, `origin/main..HEAD` empty before this save's own commit

spent: queue 5→6 · fable calls 5 (1 SOLVE fork + 4 REFUTE rounds across 3 artifacts; batch-2 and batch-3 both hit 2/2) · dispatches 12 · GitHub writes: 4 issues created, 4 comments, 2 closed · ctx 397k at save
