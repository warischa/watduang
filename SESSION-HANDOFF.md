# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-15#2

done: **F1 fixed, `4b14565`** — a late `setPlayers` could resurrect a discarded record. `65d3d3c` closed that window for `#ss-draw`/`#ss-pass`; the resume path (`siamsi.ts:344`, split from its closure by `await load()` at `[id].astro:56`) was the sibling caller it missed. Guard = per-closure `mayCreate` in `loadSession()`: only the first `setPlayers` creates, later ones inherit `write()`'s existence refusal. `siamsi.ts` untouched. **Mechanism = call ordinality within one closure** — the flag refuses nothing itself and does NOT detect `clear()`; safety rests on `[id].astro:50-51` being the first `setPlayers` on every closure a game gets. Proof: F1 ordering red→green · anti-over-fix control (#20's refresh-resume must still update) · positive control vs `65d3d3c^`. 83/83 · tsc 0 · build 0 · #26 (closed) · ADR-0010 · **`ab52d9d`** — ADR-0010's clobber claim scored REFUTED at claim scope only; 2 REFUTE rounds each killed a real defect (R1: stated mechanism false — `setPlayers` writes the load-time snapshot `session.ts:67,70`, only existence re-read `:53`; R2: adjacency is not universal → became F1) · ADR-0010 Context citations re-verified, **8 of 13 had drifted** when `65d3d3c` reshaped `siamsi.ts` · `player-select.ts` Thai comments → English, Thai string literals byte-identical · #20 DoD box ticked w/ `evidence/20/01-*` (1/1) · #24 comment posted · shellcheck clean on `site-owner-wizard.sh`

dec: **`65d3d3c`'s browser harness is NOT in the tree** — it lived under `.claude/worktrees/`, gitignored by that same commit; runnable descendant = the ADR-0008 block in `session.test.mjs`. Evidence kept outside the repo does not survive its session · did NOT spot-fix `session.ts` when R1 surfaced it — those semantics were stabilized by a 12/12 repro; fixed only once chosen, with the positive control mandatory · #26 filed AND closed same session (fix shipped; left open it would read as pending at RH) · ADR-0010's decision (defer per-game keying) untouched and standing

next:
- [x] F1's browser race window — **superseded. Do NOT run the CDP probe.** The old DoD ("a CDP run shows the interleaving or proves it unreachable") was unreachable on both branches: the interleaving set is owned by the browser scheduler + HTML navigation queue, so sampling it never converges, and "prove it unreachable" targets a false statement — `session.ts:41` already records that `location.reload()` is a macrotask away, i.e. the race is spec-**permitted**. Replaced by ordering enumeration at the `loadSession()` seam (`session.test.mjs` +4, 83→87): 2 of 4 orderings are unguarded and now pinned by tests, both unreachable in production today by call-site accident, not by construction. Full record + the facts that would invert it: ADR-0010 § Finding S2026-08-15#3. `evidence/20/01-*` re-captured against HEAD — ADR-0009 provenance gap closed.
- [ ] deploy chain — `bash scripts/site-owner-wizard.sh` §1/§2/§4, owner-run · unblocks 4 ad-slot boxes (#15-#18) + #13's real-device box · `--check` exits 0 (verified this session)
- [ ] `docs/agents/triage-labels.md` is stale — claims the labels don't exist and "no repo exists"; both false, `gh label list` returns all 10 · done when it matches `gh`
- [ ] owner glance: Thai failed-resume string on `siamsi.ts` (compliant, unreviewed)
- [ ] #12 seeds ready; the measurement itself is owner-run (Google Ads login)

inflight: measured at save — `ab52d9d` · `4b14565` · this save commit, all on `main`; push runs immediately after this commit · open PRs: checked, none · GitHub writes: #20 body edit, #24 comment, #26 create+close · 8 subagents returned, 0 escalations

spent: queue 7→5 · batches 3
