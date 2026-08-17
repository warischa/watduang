# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-17#1

done: **3 commits, `c92ae41`→`5c36883`, pushed, CI green on all 3.** `95db4bf` **#25-class data loss fixed: `ล้างกลุ่มนี้` destroyed a live round in 5 of 6 games with no prompt** — `planClear` gained `roundLive` (`player-select.ts`), fed from `root.hidden` in `requestClear` (`PlayerSetup.astro`), the liveness bit the shell already set and never read back · `clearCopy()` picks 3 copy cases · `roster.add` re-reads before write (cross-tab lost update) unioned with the in-memory list so a failed write still keeps names on screen · NEW `scripts/check-citations.mjs` + `roster.test.mjs` · `thai-comments.mjs` now `exitCode=1` on hit (it **always exited 0 and ran nowhere** — #36 was closed on its metric) · both wired into `ci.yml`, both selftest-calibrated both ways · `c92ae41` `วง`→"group" in 10 `src/games` comments · `5c36883` `<!--` → `{/* */}` in `GameLayout` + 4 tool pages: **dev prose reached 10 of 14 built pages**, `dist/` −2774B · tests 122→138 · ADR-0008 + ADR-0010 corrected · gh#29 body: 4 line-number cites → `§N`

dec: **`วง` = the roster subset playing this round, renders "group"** — anchored to shipped `GROUP_KEY='watduang:group'`, verified at `75322a9`: `types.ts:23` defines it, `timebomb.ts:1` used `วน` not `วง`, `pick-loser.ts:1` was already English. A fable SOLVE fork claimed polysemy citing those exact lines; refuted on primary evidence. **Scope: code comments only** — `นั่งเป็นวง` in UI copy is a real physical-circle sense and stays · **citations never quote heading prose or line numbers** — 4 have died that way; cite issue/ADR numbers or `§N`, the *checker* is what bounds the set, not the syntax (ADR-0008 §Flip-fact re-scored: the 2026-08-15 entry inferred safety from manifest *length*; the load-bearing fact is that siamsi is the sole `saveCheckpoint` caller) · **owner approved** all 3 confirm-copy pairs incl. the both-case over-naming on siamsi's own page (over-names OK, under-names never)

next:
- [ ] **owner-run, unchanged:** wizard §2 Azure token · #9 domain · #29 AdSense pub-ID (**#29 closes gh#15–18 in one stroke**, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:14`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty
- [ ] `love-match.ts:290-301` — first chip tap re-renders the row without that person, shifting later chips under the finger; a rapid double-tap reads out a pair the group never chose. Recoverable in 1 tap via "ดูคู่อื่น", so Low. Done when a settle gate exists and a test pins it. ⚠ `pick-loser.ts:93`'s `phase` gate is same-button re-entrancy, NOT a shifted-target gate — don't copy it. Double-tap in pick-loser/daily-fortune unsettled: depends on pixel positions, static reading can't decide
- [ ] browser proof covered only the **numbered-players** path (`start-numbered`) at 320px — the name-entry path was never driven. Done when M1–M3 pass on it too · via `docs/agents/browser-verification.md`
- [ ] `GameNav` (`GameLayout.astro:49`) navigates away from a live round with no prompt — label matches effect so not #25-class, but it is the last unprompted exit. Done when owner rules it in or out
- [ ] `PlayerSetup.astro:281` `saveGroup([...selected])` is NOT gated by `clearsSession` — a tool page may write the group prefill though it may not wipe it (intended per #15, reads as a contradiction). Done when the asymmetry is either commented at the line or removed
- [ ] two-tab `roster.add` residual race (read-read-write-write) still loses a name — union can't express a deletion, `remove`/`clear` would need tombstones. Never reproduced in a browser, only reasoned. Done when 2 real tabs confirm or refute it

inflight: measured at save — tree clean · 0/0 with `origin/main` · **open PRs: checked, none** · CI green on `5c36883` (run 95278882033, Deploy step `skipped` = no deploy) · open issues 12 · branches: `main` only · GitHub writes: gh#29 body edited (round-trip verified) · this save is committed direct to main, no PR

spent: queue 5→6 · closed 0, filed 0 · batches 2 · ctx 29% at save · ended early: no

meta: master SH/RH re-read at this save — **master converged to this repo's layout**: its § State home now declares `SESSION-HANDOFF.md` the ONE state home and RH gives it precedence, so `.claude/commands/save-session.md` §1 was a stale fork claiming master said the opposite (fixed here). Still genuinely repo-specific: **h3 `### S` headers** (master expects `## S`, so `roll-state-window.sh` always ABORTs → manual sed roll + 3 asserts, ran that way this save) · the repo-wide budget sweep whose leading `!` is load-bearing · 12KB ceiling for every `docs/**` and `.claude/**` doc
