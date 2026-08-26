# gh#43 — run-level calibration of the four new tripwires

Method: `docs/agents/ci-gate-calibration.md` § "Calibrating a new gate at run level" (moved out of
`docs/agents/ci-verification.md` after this evidence was written; title quoted here was already stale
before that move). `on: push` in `ci.yml` carries no branch filter, so a throwaway branch produces real
runs and `main` never goes red. Branch `calibrate/gh43-gates`, deleted local and remote after use.

Each commit's **tree** equals `main`'s tree plus exactly one break — verified with
`git diff --name-only main <sha>` returning exactly one file, and returning EMPTY for the green
baseline. Runs read from the workflow-scoped endpoint (`gh run list` 404s on this repo).

| commit | break | gate under test | run | conclusion |
|---|---|---|---|---|
| `11f83db` | `#leave-confirm[open]` → `#leave-confirm` in `src/styles/tokens.css` | leave-confirm-check | 32137448649 | **failure (RED)** |
| `3c5e529` | `armAllButtons` call commented out in `src/games/pick-loser.ts` | arm-gate-coverage-check | 32137515596 | **failure (RED)** |
| `77b416d` | `data-stable-exit` removed from `src/layouts/GameLayout.astro` | stable-exit-markers-check | 32137520256 | **failure (RED)** |
| `52a8dbd` | backtick `watduang:roster` writer added to `src/shell/session.ts` | roster-lock-structure-check | 32137522133 | **failure (RED)** |
| `6db366b` | none — tree identical to `main` | all four | 32137525502 | **success (GREEN)** |

## What this proves, and what it does not

Proves the four steps are really wired: they run in Actions and a non-zero exit really blocks the
job. Local runs cannot show this — a `|| true`, a bad indent, or a devDependency that never reaches
CI all pass locally.

**Does not** prove which step went red. `/actions/runs/<id>/jobs` 404s on this repo, so per-step
conclusions are unreadable. Attribution rests on two things recorded before the pushes: each commit
carries exactly one break, and a local pre-check confirmed each break trips **only** its own gate out
of all five source-scan gates (`no-nav-in-stage-check` plus the four new ones). That is an inference
from two measured facts, not a direct observation.

## Deviation from the recorded procedure, stated rather than hidden

`docs/agents/ci-gate-calibration.md` requires the deliberate break be type-only and runtime-inert, so that a green
commit would deploy something harmless. Three of these four breaks are real behaviour changes. The
rule's purpose is satisfied by other means here: the branch was never merged, and
`gh api repos/warischa/watduang/actions/secrets` returned `total_count=0` immediately before the
pushes, so `HAS_DEPLOY_TOKEN` at `ci.yml` gates the Deploy step off entirely — no deploy path existed
for any of these commits.

## A first attempt that was invalid

The first calibration script committed a break, pushed, then ran `git checkout -- <file>` to restore.
That restores from `HEAD`, which already contained the just-committed break, so the breaks
accumulated: successive commits carried 1, 2, 3 and 4 breaks, and the intended "restore" commit was
empty. Only the first commit was a valid one-variable diff. Recorded because a cumulative-break
calibration produces red runs that look exactly like correct ones.

---

# ADR-0010 trigger gate — same method, S2026-08-18

`scripts/checkpoint-writer-check.mjs` fires when a second game under `src/games/` calls
`saveCheckpoint`, which is ADR-0010's own stated deferral condition. Wired at `ci.yml:79`, before
Build. Branch `calibrate/gh24-tripwire`, deleted local and remote after use.

| commit | break | run | conclusion |
|---|---|---|---|
| `36cc3c7` | `gameCtx?.session.saveCheckpoint(null)` added to `src/games/timebomb.ts` | 32146528209 | **failure (RED)** |
| `84779c6` | none — tree identical to `main` | 32146530561 | **success (GREEN)** |
| `b5ae65f` | `main` itself, gate live | 32146524396 | **success (GREEN)** |

One file differs from `main` on the red commit, verified with `git diff --name-only main 36cc3c7`;
empty for the green baseline. `gh api repos/warischa/watduang/actions/secrets` returned
`total_count=0` immediately before the pushes, so no commit here had a deploy path.

Measured limits of this gate, also written in its `ponytail:` header: an aliased or destructured call
(`const { saveCheckpoint } = gameCtx.session`) passes clean — planted and confirmed — and it sees
nothing outside the flat `src/games/*.ts` glob. It reports that ADR-0010's trigger fired; it does not
validate the per-game design ADR-0010 specced.
