# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-15#3

done: **F1's resurrection window bounded at the seam, not measured in the browser — `68e4a03` · `a5b2ffd`** (5 files, +227/−16). Planned CDP probe DROPPED at the fork: the interleaving set is owned by the browser scheduler + HTML nav queue → sampling it never converges; and "prove it unreachable" targets a false statement (`session.ts:41` already records `location.reload()` is a macrotask away → the race is spec-**permitted**). Replaced by ordering enumeration at the `loadSession()` seam, `session.test.mjs` +4 (83→87). **Result is NOT the expected negative: 2 of 4 orderings are unguarded**, and the new tests pin the HOLE, not the guard — (a) stale closure whose first `setPlayers` is unspent; (b) `write()`'s check is existence-based, not identity-based, so a stale snapshot overwrites a new round (same class covers `markPlayed`/`saveCheckpoint`). Both unreachable in production today by call-site accident, not by construction. Calibrated both ways: pos control red 9/2 at `session.test.mjs:260`; each pin separately proven non-vacuous by a hole-closing mutant. REFUTE round 1 clean over 6 attacks. Also: `evidence/20/01-*` re-captured vs HEAD (ADR-0009 provenance gap closed) · `triage-labels.md` synced to `gh` 18/18 · 87/87 · tsc 0 · build 0 · ADR-0010 § Finding S2026-08-15#3 · #27 filed

dec: **an exit criterion over a set you do NOT own is unfalsifiable** — enumerate a set you own instead (ADR-0010) · the 2 holes were deliberately NOT closed: unreachable today, closing them is speculative → tracked as a trip-wire (#27), not a fix task · **#26 was the wrong home** for the finding (CLOSED 04:10Z, verified via `gh`) → new issue, never a comment on a closed one · #2's stale CDP DoD retired in-place before the roll so RH cannot re-enter the dead end · prior save's manual roll had glued `### S2026-08-15#1` onto a `-->` line (not line-start, would not render) — fixed this save

next:
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` §1/§2/§4, owner-run · unblocks 4 ad-slot boxes (#15-#18) + #13's real-device box · `--check` exits 0 (verified S#2)
- [ ] ADR-0010 is now 15.4KB (>12KB doc budget) — move its oldest finding sections to the archive at next touch · done when `check-budgets.sh` passes on it
- [ ] owner glance: Thai failed-resume string on `siamsi.ts` (compliant, unreviewed)
- [ ] #12 seeds ready; the measurement itself is owner-run (Google Ads login)

inflight: measured at save — `68e4a03` + `a5b2ffd` pushed to `main`; tree clean before this save commit · open PRs: checked, none · GitHub writes: #27 created (labels `bug` + `needs-triage`) · 6 subagents returned, 0 escalations, 0 verify failures

spent: queue 5→4 · batches 1 · ended early: 1 required pending (deploy chain — owner-run, blocked all session)
