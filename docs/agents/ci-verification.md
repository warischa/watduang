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

**What a local green does and does not prove, and how a step gets classified** -> `docs/agents/workflow-gate-classification.md`.
Moved there 2026-09-08 (a further ADR-0012 task seam): the DENY and REQUIRE guards, the `${{` and
`$GITHUB_OUTPUT` marker rules, why an unexecuted step counts as a failure, and why the 98 leg exists
are read when you are auditing the runner or debugging a NORUN -- not on a routine verify, which the
exit-code paragraph above already covers.

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

## The fast lane already exists — do not re-invent it, and do not hand-pick gates instead

Routed from `CLAUDE.md` 2026-09-08 (ADR-0012 seam; that file keeps the heading as its trigger). One line, unwrapped, so the bytes are verbatim. 88% above is CI's clock, 542/577 below is this machine's — two scopes, not a conflict.

`SKIP_EXPENSIVE=1 bash scripts/run-workflow-gates.sh` drops the two browser lanes and **always exits non-zero** (they count as not-executed), so a fast run can never be misread as a pass. CI decides the same thing by itself in `ci.yml`'s `probe-scope` step: on `main` probes always run because that run gates Deploy · no usable base commit → fail safe, run · diff touches `src/` or `public/` → run · otherwise skip. Use the fast lane while iterating; the full suite still runs once before a push. Two things that are NOT true: "the suite is slow" as a reason to cut scope — the runner now times every step, and FOUR local runs (n=4, this machine, not CI) put ~542s of the suite's ~577s in ONE step, the gh#122 browser probe — the 542s reproduced exactly all four times, next slowest step 7s — so a broad cut is aimed at the wrong thing; and a small diff is not a small blast radius — a one-line `--font-sans` edit changes text metrics on every page, which is exactly the shape a by-eye subset lets through.

## A local browser green can be blind to the path CI actually tests (2026-09-09, gh#213)

**Two different Chrome launches, two different answers, and the fast one is the one you reach for.**
The probe lanes here do not all launch Chrome the same way. `scripts/webgl-pixels-lane.sh` uses
`--use-angle=swiftshader --enable-unsafe-swiftshader`, which **grants a working WebGL2 context**.
`scripts/ci-probes.sh`'s other lanes use `--disable-gpu`, which grants **no context of either type —
on a Mac**. That qualifier was added 2026-09-10; without it the sentence is false about CI.

**CI's own lane is live, by signature, and the mechanism is NOT identified.** Measured:
`one-bomb`'s fit line from a CI run (100% / 35 ink / 2 screens at 1440) reproduces locally under
swiftshader and not under `--disable-gpu` (93.8% / 26 ink / 4 screens). So the runner's lane has a
context. WHY is unknown and must not be asserted — ANGLE/SwiftShader on the runner image, llvmpipe,
and a Chrome-version gate on what `--disable-gpu` disables are all candidates, none measured.
`scripts/canvas-ink-probe.mjs` now prints the in-page read as a `::notice::` and into
its artifact, so the next run settles it.

A 3D route takes a different code path under those two, so a swiftshader green says nothing about the
no-context path — the one ADR-0051 protects, on the audience CLAUDE.md calls core rather than edge —
and a Mac `--disable-gpu` green says nothing about the path CI takes. That is how a route shipped
with its ADR-0051 fallback never once exercised in a real browser: every local run picked the
swiftshader flags, and the route's own no-3D test asserts that path against a fake DOM. **State which
flags you used whenever you report a browser measurement**, and confirm in-page that `getContext`
returns null before concluding anything. A flag name is not a context state; only the read is.

## The probe's own dispatch latency sits inside the number it gates (2026-09-09, gh#122)

**A working route can read UNMEASURED because the runner is slow, and it reproduces.** CI's runner has
2 vCPU and runs five Chrome instances plus `serve` at once. The `play-exit` probe drives a burst that
must land inside the arm window; on that hardware the burst arrived **704 ms** after being driven at
**80 ms**. By then the exit control had legitimately armed and enabled, so the out-of-window burst hit
it, navigated to the site root, and destroyed the JS context holding the probe's own signal variables.
The post-burst read came back null, which the probe reports as "the trigger left the screen unchanged"
— when the screen had in fact already changed.

**Two traps in reading that.** First, the message names the route, so it reads like a route defect;
the discriminating evidence is in the run artifact's timeline, via `gh run download`, where the
disabled flags before and after the burst show the transition did happen. Second, an identical second
failure does **not** refute a slow-harness explanation — a reliably under-resourced runner fails the
same way every time, so "it failed twice identically" is what this cause predicts, not evidence
against it. Before blaming a route, reproduce under the lane's literal flags and check whether the
burst landed in the window at all.
