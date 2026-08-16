# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-16#2

done: **3 commits, CI green each, deploy `skipped` (0 secrets re-verified in-shell at push)** — `10d09e7` new `src/components/GameNav.astro` replaces 3 already-drifted inline copies, 5 call sites, game pages gain sibling nav (12+/21− in page files) · `1679a69` `/tool/number/` nav · `0bdce86` trap 7 in `browser-verification.md`. **#35 CLOSED 9/9** — per-box evidence and 2 self-corrections live in its closing comment. Branch `worktree-agent-a3373c30e64ce69da` deleted (was `c62f438`). #14–#18 audited: **nothing closeable** — gh#14 epic has no DoD section, gh#15–18 each have exactly ONE unchecked box and it is the same ad-slot box, all gated on #29. 122 tests · 320px re-proven on 10 pages, detector calibrated both ways.

dec: rationale lives in #35's closing comment — cite it, never restate · class names `wheel-next`/`draw-next`/`team-next` pass as **props and survive verbatim in served HTML** (gh#15–18 committed evidence cites those selectors; renaming silently voids it) · commit split by **copy decision, not by file**: `heading="เล่นเกมต่อ"` lands only in `1679a69`, so #35's own diff ships no new visible Thai · that heading IS newly-visible — the aria-label was never user-visible; owner chose it knowing that · GameNav sits inside `<main>` on tool pages (34rem column), outside on game pages — safe only while `GameLayout` has no `<style>` block, ceiling marked in a `ponytail:` comment there

next:
- [ ] **Thai code-comment migration — owner scope call, blocks nothing else.** Real set **213 Thai comment lines across 34 of 50 files** in `src/`+`scripts/`; the English rule is dated 2026-08-14 and postdates them. Converting a subset = half-converted at repo scale. Done when an issue names the file set, or the rule is scoped to new code only
- [ ] **`docs/agents/browser-verification.md` over budget 15270B > 12288B** — already over at 14096B before trap 7 added 1174B; earlier budget sweeps never covered this file. Heaviest: traps 6190B · stale-capture 4087B. Done when `check-budgets.sh` passes; fix is structural (split traps out), not prose-squeezing
- [ ] **wizard §2 Azure token** — owner-run, unblocks #13's real-phone pass. Done when `gh secret list` non-empty. ⚠ from that moment `git push` to `main` IS a production deploy (`ci.yml:13-14`) — every push pre-auth void, re-gate it
- [ ] #9 register `watduang.com` — owner-run, payment · #29 AdSense pub-ID — owner-run, **closes gh#15–18 in one stroke** (identical single box), then epic gh#14
- [ ] row 4 locked till rows 6/7 show results · row 5 locked (ADR-0011) · #24 dormant (ADR-0010) · #12 relabel-only

inflight: measured at save — tree clean, 0 ahead of `origin/main` · open PRs checked, none · CI green on `0bdce86` · open issues 12 · branches: `main` only · GitHub writes: #35 body edited ×2, commented, closed

spent: queue 8→6 · batches 4 · ctx 21% at save · ended early: no
