# Session handoff — วัดดวง

**This is the home of live state, not a supplement** — `CLAUDE.md` no longer has a § Current state; resume reads this file as the primary source.

Format · window · budget · roll: `.claude/commands/save-session.md` · Rationale for every decision lives in GitHub issues and `docs/adr/` — **never restate it here, cite the number** · map = [#1](https://github.com/warischa/watduang/issues/1) · archive: `docs/sessions-archive.md`

## Current state

### S2026-08-20#3

done: **gh#51 CLOSED** (comment `5355231191`, 3/3 DoD ticked, posted body diff-verified vs source file — only a trailing newline differs) · pre-close verification: the issue's own "Inferred, not confirmed" claim grep-verified HOLDS (5 non-siamsi games write only `markPlayed`; `played` unread outside `session.ts` plumbing) · F-8 ceiling independently re-confirmed **structural** by edge-walk: `write()` key-scoped, played set never comes from storage (`PlayerSetup.astro:267-278→:324→:188`), prefill always rendered re-tickable; 1 near-miss (non-atomic `loadGroup` read pair, roster.ts:55-56) same ceiling, self-heals · **DEPLOY ARMED 11:40Z** — 3 secrets set via `gh secret set` after az verification (app `watduang` exists, fed cred pinned `refs/heads/main`, tenant+sub match checklist §2); `gh secret list` = 3 of 3 · open issues 12→11 · no src edits.

dec: F-7 closed with a **runtime caveat stated in the comment**: measurement runtime was unrecorded; inferred headless Chromium (the repo's only automated apparatus); "unreachable" scoped to it — iOS stays ADR-0021's gap; fork verdict: making iOS a closure condition re-keys the ticket to a set Apple owns · owner 2026-08-20: approved arming via az/gh CLI **and** approved go-live — the push carrying THIS entry is the first-ever `Azure/static-web-apps-deploy@v1` run.

next:
- [ ] **FOCUS · verify go-live**: the run for this push must show Deploy ≠ `skipped` AND success; then probe `https://<app>.azurestaticapps.net/` — 200 + Thai copy renders. Deploy fails → read the step log via the jobs endpoint (`docs/agents/ci-verification.md`), fix, re-push
- [ ] owner-run: gh#9 domain (wizard §1/§4 — nameserver migration, NOT registrar forwarding) → gh#29 AdSense. Live URL now unblocks the live-URL boxes on gh#13 · #15 · #16 · #17 · #18
- [ ] **before any game ships a quit-round button**: `clear()` refusal silent on `PlayerSetup` path (wires no `onWriteRefused`) + 3 `refusalCopy` strings say "not saved" where a refused clear's loss is "not discarded". Done when a `clear()` caller on a long-lived closure reports its refusal
- [ ] optional 2nd runbook seam if it grows again: OIDC section → `docs/agents/ci-verification.md` (runbook 74.6%)

inflight: measured at save — tree carries only this save's files · open PRs: checked, 0 · **deploy run pending: fires on this push, watched this session** · secrets 3/3 (probe 11:40Z) · open issues 11

spent: queue 5→4 · fable calls 1 (fork SOLVE; REFUTE not triggered — no src diff) · dispatches 3 (edge-walker, bulk-reader, adversary) · GitHub writes: 1 comment, 1 body edit, 1 close, 3 secrets
