# Verify work the way CI does

Split out of `docs/runbook.md` at the seam `CLAUDE.md` already names (ADR-0012). The runbook keeps
a pointer; everything about reproducing CI's own verdict lives here.

**Before writing any verification command, read `docs/agents/shell-traps.md`** — the six ways a
probe reports a number that is not true (zsh vs bash, exit codes through a pipe, redirect order,
word-splitting, unquoted globs, per-member calibration). Split out 2026-08-31 on the ceiling.

## `npm run ci` is NOT the list that gates deploy — run the workflow's own

This repo carries **two** gate lists and they have drifted. `package.json`'s `ci` aggregate is what a
developer runs locally; `.github/workflows/ci.yml` is what gates the deploy, and the workflow never
invokes `npm run ci` — it spells every gate out as its own step. `scripts/gate-selftest-coverage-check.mjs`'s
header documents the same split. So a green `npm run ci` is not evidence the push will pass: on
2026-08-30 the workflow list ran 30 steps and three of them were red while the npm chain had no
opinion about two of the three.

    bash scripts/run-workflow-gates.sh

It reads `ci.yml` and derives the list, so it cannot drift from the thing it is standing in for. Exit
code is the number of runnable gates that failed **plus the number that were never executed**;
**98 means the extractor is broken, not the tree**, and **96 means the workflow moved the unit tests
out of local reach** — never read either as a pass. `MIN_STEPS=` raises
the floor. `CLASSIFY_ONLY=1` prints the partition and executes nothing.

**What a local green does and does not prove.** It proves every step classified runnable ran and
passed, in the workflow's own order, single-line and `run: |` block alike. It proves nothing about
the not-runnable set, which the script names each run with the marker that caught it: a body holding
`${{`, or writing `$GITHUB_OUTPUT`. Today that is `Decide whether the browser probes can add
anything` and `Fetch SWA deployment token`, plus the `npm ci` deliberate skip. For those, read the
run's per-step conclusions below — never this script's exit code.

**Why the `$GITHUB_OUTPUT` half of that rule is load-bearing.** `Fetch SWA deployment token` carries
`${{` only in its `if:`; its run body is expression-free and shells out to `az staticwebapp secrets
list` against the production resource group. A partition keyed on `${{` alone would classify a
production token fetch as safe to run locally and then run it.

**Two guards this repo owns, checked before every marker rule.** `${{` and `$GITHUB_OUTPUT` are
GitHub's vocabulary, so the set they enumerate is not one this repo controls and an ordinary
workflow edit moves a step across the boundary in either direction. Both directions were
demonstrated on doctored copies of `ci.yml`. **Rationale, the demonstrations, and the rejected
alternative live in ADR-0056 — read it there, it is not restated here.** Operationally:

- **DENY wins over every other rule.** A run body invoking a cloud CLI at a command position
  (`az`, `aws`, `gcloud`, `kubectl` and siblings), emitting `::add-mask::`, or carrying
  credential-shaped text is `NORUN` whatever its markers say. The banner prints the rule that caught
  it, e.g. `[DENY cloud CLI: az]`. Deliberately over-broad: a false deny costs one locally-skipped
  gate, printed with its reason; a false allow runs a production credential fetch on a laptop.
- **REQUIRE aborts rather than discloses.** A body line starting `node --test` or `npm test` must
  land in a runnable class, and at least one such step must exist. Otherwise the script prints
  `ABORT: the workflow moved the unit tests out of local reach` and **exits 96** — before the
  banner, before `CLASSIFY_ONLY` can exit 0. A banner disclosure is what let a reader trust
  `TOTAL=30 FAILS=0`, so this is not a footnote.

Both are re-derived from the workflow text every run — no pinned name, index or title, because a
pinned list is what rotted the original extractor. They bound the damage; they do not prove the
partition complete (ADR-0056 § What this does not prove).

**Why unexecuted steps count as failures.** gh#171: the extractor read single-line `run:` commands
only, so all five `run: |` blocks — `Unit tests` among them — sat outside the work-set, and it
printed `TOTAL=30 FAILS=0` on a red tree. A runnable step that did not run is now arithmetic in the
exit code, and the summary ends in a verdict stating its own scope rather than a bare `FAILS=0`.

**The one expensive step, and an opt-out that costs the exit code.** The browser probes are 88% of
the workflow's wall clock and drive a real Chrome — a second run attaches to the first one's browser
(`docs/runbook.md`), so it is wrong, not merely slow. The step is classified EXPENSIVE by a derived
property, never by name: the workflow gates it on `if: steps.<id>.outputs.<x>`, so CI itself decides
per run whether it is worth paying for. It runs by default; `SKIP_EXPENSIVE=1` skips it and counts it
**not-executed**, forcing a non-zero exit and the "Do not push." verdict, so an opted-out run is
always visibly incomplete. `CLASSIFY_ONLY=1` prints all four classes **tab-separated**.

**Why that 98 leg exists.** The first version of that script used `mapfile -t CMDS < <(awk ...)`.
macOS ships bash 3.2 and `mapfile` arrived in bash 4, so the array came back empty, the loop body
never ran, the failure counter stayed 0, and the script exited **0** — identical to every gate
passing. The lesson generalises past this one builtin: in a verification script, an empty work-set
must be a hard failure, and "run it in bash, not zsh" is not enough when the local bash is a 2007
build. Calibrate the abort leg the way you would calibrate a gate — it is checked in three ways
(impossible floor, empty workflow, outside a repo) and all three return non-zero.

## Reading CI's verdict on this repo

**This section used to say `gh run list` always 404s. As of 2026-08-19 that is no longer true, and
believing it costs every session a workaround it does not need.** Measured that day, all exit 0 and
return data: `gh run list` (three runs listed), `gh api repos/warischa/watduang/actions/runs`
(`total_count` 110), `gh api repos/warischa/watduang/commits/<sha>/check-runs` (`total_count` 1), and
`gh api repos/warischa/watduang/actions/runs/<id>/jobs` (real per-step conclusions).

Why it 404'd before is not established — the 110 runs say the repo was never empty, so the earlier
reading was about the request or the token state of the day, not about the repo. Do not rebuild a
theory on it. Just try the direct call first and fall back only if it actually fails.

**Per-step outcomes** — this is the one worth knowing, because it answers "did Deploy run?" directly
instead of inferring it:

```bash
gh api "repos/warischa/watduang/actions/runs/<run-id>/jobs" \
  --jq '.jobs[0].steps[] | "\(.conclusion)  \(.name)"'
```

Used on 2026-08-19 to confirm the three deploy steps reported `skipped` on run 32269327426, and that
the OIDC login step reported `success` on run 32273450017. Prefer it over inferring the Deploy step
from `gh secret list` plus `HAS_DEPLOY_IDENTITY` in `ci.yml`.

**The workflow-scoped endpoint still works and is still the most convenient for "how did the newest
run end":**

```bash
gh api "repos/warischa/watduang/actions/workflows/333456382/runs?per_page=1" \
  --jq '.workflow_runs[0]|"\(.head_sha[0:7]) \(.status) \(.conclusion//"-")"'
```

Get the id from `gh api repos/warischa/watduang/actions/workflows --jq '.workflows[0].id'` rather than
trusting the one above — a renamed workflow file changes it.

**The trap that wastes the most time:** `/commits/<sha>/status` returns `"pending"` with an EMPTY
`.statuses[]`. That does not mean CI is running — it means no *legacy* commit statuses exist at all,
which is the normal state for an Actions-only repo. Polling it waits forever on a job that already
finished. Check `.statuses | length` before believing `.state`.

GitHub also returns intermittent `HTTP 503` on `api.github.com/graphql` (which `gh issue close` uses).
A close can fail with 503 *after* the comment posted — re-read the issue state rather than assuming
either outcome.

## OIDC federated credential subject — AADSTS700213

Moved to `docs/agents/deploy-oidc.md` (2026-08-31, this file crossed its 12KB ceiling). Symptom:
the deploy job fails to federate despite a subject that matches the documentation.

## Calibrating a new gate at run level

Moved to `docs/agents/ci-gate-calibration.md` (a further ADR-0012 task seam) — proving a **brand-new**
gate fires on `main` is read only when someone is standing up that gate, not on every routine verify or
read-a-verdict pass covered above.

## A pixel the fit probe records is one machine's number

`scripts/play-screen-fit-probe.mjs` records overflow px per route x viewport. On 2026-09-02 the CI
runner measured every non-zero row 4-28% above this Mac's numbers on the same commit (power-meter
76 -> 268 clipped) and read 0px on three rows the Mac records at 2-17px — the workflow installs no
font, so Thai text wraps under a fallback face (inferred). Zero held on both machines.

**Do:** gate only what both machines agree on — a row is classified, no key is stale, a `FITS_ROWS`
row stays within `OVERFLOW_TOLERANCE_PX` of zero. Growth or a 0px reading on a `KNOWN_OVERFLOW` row
prints a `::warning::`, which `scripts/ci-probes.sh` surfaces on a green leg. Before pinning any
new measured number, download the last `browser-probe-output-*` artifact and `diff` its rows
against a local run first — two text files, no new run.

**Don't:** widen `OVERFLOW_TOLERANCE_PX` to cover a machine difference; it hides the same regression
on both. The converging fix is a self-hosted Thai webfont on play routes (owner decision).

**Cheaper proof:** the probe's set checks (union = manifest x viewports, no stale key, reason prefix)
are pure functions of two files — prove them with `node --test`, never with a browser walk; re-measure
only when src or the measurement code changed.
