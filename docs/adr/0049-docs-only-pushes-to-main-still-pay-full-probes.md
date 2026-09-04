# ADR-0049 — docs-only pushes to main still pay full probes

Status: accepted — option (b), policy only · 2026-08-29 · **amended 2026-09-04, see the last section** · owner ruling in-session (popup, S2026-08-29#5):
the workflow stays unchanged and the deploy gate keeps re-verifying every main push; docs commits are
batched and pushed once at session save. The probe cost of a stray docs-only push is accepted as the
price of an unconditional deploy gate.

## Context

`ci.yml`'s `probe-scope` step (commit 70991a1) already skips the browser probe run for pushes that
cannot change `dist/` — anything that touches neither `src/` nor `public/`. That skip is scoped to
non-main branches on purpose: the step hard-codes `probes always run` for `refs/heads/main`, because
that run is the one that gates Deploy.

On 2026-08-29, at least 3 docs-only pushes to `main` each paid the full probe cost anyway
(`SESSION-HANDOFF.md`, next-queue item). The skip logic that would have caught them already exists —
it is simply not applied to the one branch where the cost was paid.

This ADR does not decide between the two options below. It presents both for the owner to pick.

## Option (a) — extend the skip to main

Remove the `main` special case from `probe-scope` and let the same `src/|public/` diff decide for
main pushes too, the same way it already decides for every other branch.

Trade-off: the deploy-gating run would no longer re-verify an identical `dist/` before Deploy runs. A
docs-only push to main would deploy on the strength of probes that ran on an earlier commit, not this
one.

**Acceptance test for (a):** a docs-only push to `main` shows `probe-scope` output with `probes
SKIPPED` and the reason echoed; a push touching `src/` still shows `probes run` and the probe step
executes.

## Option (b) — policy only, no workflow change

Leave `ci.yml` unchanged. Batch docs-only commits during a session and push them once, at session
save, instead of pushing each one individually. Every push to main keeps paying full probes, but there
are fewer pushes.

Trade-off: relies on the agent remembering to batch; a mid-session push (e.g. to unblock a reader) still
pays full cost. No change to the deploy-gating guarantee.

## Decision

Not made here. Owner picks (a) or (b).

## Amendment 2026-09-04 — option (b) measured leaking

Measured 2026-09-04 with `gh run list` over the last 60 CI runs (2026-08-29 → 2026-09-03): 33 were
`docs:` pushes to main, each paying the full browser-probe step (751–770 s) — 376 min of probes in
6 days. Option (b) as written ("push once at session save") leaked through several saves per day,
each save a full-probe push.

Owner ruling 2026-09-04 (go B): the mechanism moves out of this repo into the global save-session
**Push** rule (`~/.claude/commands/save-session.md`): docs commits stack locally and ride the next
src push; push at save only when the target branch's CI skips docs-only diffs or the repo has no
CI. This repo's `main` does neither, so docs never push at save here.

`ci.yml` unchanged — `probe-scope` still hard-codes `run=true` on `main`. Option (a) remains open
for the owner. `CLAUDE.md` § Batch boundaries, item (1), updated in the same commit.
