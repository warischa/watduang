# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-16#4

done: **5 commits, `37bcd33`→`012db0e`, pushed, CI green on both pushes.** `d1949f9` `GameNav.astro:15` `aria-label={heading}` — the desync was LIVE on 9 of 10 navs; it hid because `tool/number.astro:41` overrides `heading` with the exact string that was hardcoded · `a872e88` both budget FAILs cleared: `site-owner-checklist.md` 17651B→8665B split at the deploy seam (§3/§4 state their own dependency) into NEW `docs/post-launch-checklist.md` 10730B, moved H2s stubbed so §3/§4/§5 citations still resolve in 1 hop · `adr/0004` 15081B→8287B by **translation alone, no split** · `save-session.md` budget table now defers to `check-budgets.sh` + carries a repo-wide sweep · `75322a9` NEW `scripts/thai-comments.mjs`, parser-backed (typescript + @astrojs/compiler, no new dep), selftest calibrated BOTH ways, reproduces #36's table 236 lines/35 of 52 files · `7970c3d` **#36 migrated by 4 parallel workers on disjoint sets, then CLOSED** with an evidence comment · `012db0e` `CONTEXT.md` 8011B→5716B, prose EN / terms Thai · `runbook.md` new trap "A comment-only change still moves `dist/`" · #24 `wayfinder:grilling` removed. Open issues 13→12

dec: **`วง` renders "group", NOT "circle"** — REFUTE said circle by majority; overridden on primary evidence, `session.ts:1` was already English pre-migration and says "this group" about the same `GameSession` (its count included code identifiers like `GROUP_KEY`) · `adr/0004` NOT split — ADR-0012: the addenda guard the same decision, a split greens the byte gate while RAISING per-route ingest · doc budget gate does NOT cover `docs/verification/**` · `sessions-archive.md` · `.scratch/**` (owner call) · a comment needing Thai text uses `\uXXXX` escapes — ASCII so the gate stays 0, and the concrete example survives instead of decaying into a general claim · **#36's "0 Thai comments" metric CONFLICTS with CLAUDE.md's keep-domain-terms-verbatim rule** — the detector counts any Thai char in a comment; resolved by romanize/translate in comments only

next:
- [ ] **owner-run, unchanged:** wizard §2 Azure token · #9 domain · #29 AdSense pub-ID (**#29 closes gh#15–18 in one stroke**, then epic gh#14). ⚠ the moment `gh secret list` is non-empty every push to main IS a deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it. Done when `gh secret list` non-empty
- [ ] **`วง` rendering is split** — "group" in `src/shell/**`, "circle" in `src/games/**`; 4 workers each resolved my contradictory brief differently. Done when one term is used repo-wide. ⚠ needs the ORIGINAL Thai per line (`git show 75322a9:<file>`) to tell which rendered `วง` vs `รอบ` — they are different terms and a blind rename corrupts both
- [ ] **`adr/0008:139` cites `runbook.md` by a Thai heading name** — resolves today, breaks the moment the runbook converts to English. Same defect class that broke `adr/0007` this session. Done when it cites a durable anchor
- [ ] **checkpoint/session write path never edge-walked** (ADR-0010 · #24) — deferred at the drain gate, not because it was cleared. Done when the money/state-mutating path has a coverage report
- [ ] `scripts/thai-comments.mjs` gaps, both marked in source: a comment inside an `.astro` `{expression}` is an unmodelled channel (would UNDER-report, 0 such today) · `site-owner-wizard.sh` is outside the grammar, 0 Thai today, skip warned on stderr only

inflight: measured at save — tree clean · 0/0 with `origin/main` · open PRs checked, none · CI green on `012db0e` (run 31955132825) · open issues 12 · branches: `main` only · GitHub writes: #36 commented + closed, #24 label removed

spent: queue 5→5 · closed 3, filed 3 · batches 3 · ctx 33% at save · ended early: no
