# Verify work the way CI does

Split out of `docs/runbook.md` at the seam `CLAUDE.md` already names (ADR-0012). The runbook keeps
a pointer; everything about reproducing CI's own verdict lives here.


**Symptom:** a verification command reports "pass" or "fail" that doesn't match reality, with no
error — a calibrated gate FIRES on both the good case and the bad case · `EXIT=` comes back empty ·
`node --test` reports 2 failures on code that isn't broken.

**Cause:** the agent's shell is **zsh**, CI runs **bash**. Three differences are silent:

- `for x in $VAR` — zsh does **not** word-split an unquoted variable; the loop runs once, treating
  the whole string as a single value.
- `${PIPESTATUS[0]}` is bash-only · zsh's equivalent is `$pipestatus[1]`. Get it wrong and you get an
  empty value, not an error.
- `$?` **after a pipe** is the exit code of the last command in the pipe (e.g. `tail`), not the one
  you meant to check — `cmd | tail` then reading `$?` is always 0.

`node --test <dir>` also breaks on node 22 (it reads the dir as a module path) — `ci.yml` quotes a
glob for exactly this reason.

**Do:**

```bash
bash -c "node --test 'src/**/*.test.mjs'"   # not node --test src/tools/
bash -c 'cmd > /dev/null 2>&1; echo EXIT=$?' # catch exit directly, not through a pipe
```

**Verify a gate:** calibrate both ways — it must pass on a known-good input and fail on a known-bad
one. If the positive control fails (known-good reports broken), **the measuring tool is broken, not
the thing being measured** — throw out that whole run, don't touch the code yet.

**A gate that covers a SET must be calibrated per member, not once.** Passing both-ways on one
member proves nothing about the rest. Real case: the CI sitemap gate in `.github/workflows/ci.yml`
was calibrated both ways on the `wheel` tool page and passed clean — while blind to the other three
tool pages. It covered **1 of 4**. Calibrate each member the gate is supposed to cover, or state which
ones you didn't and why.

**Three more shell traps, each reproduced on this machine before being written down:**

1. **Unquoted flag glob.** A file named `-v` sitting in a directory turns `grep -q TODO *` into
   `grep -q TODO -v file1.txt` — `-v` gets read as invert-match. Reproduced: a file that truly
   contains `TODO` reports exit `0` (found) when grepped by name, but exit `1` (not found) when
   grepped via the unquoted `*` glob — no error, just a silently flipped answer. Fix: `grep -q TODO
   ./*` (leading `./` stops a dash-prefixed name from being read as a flag) — reproduced flipping the
   exit code back to `0`.
2. **BSD `grep` has no PCRE lookahead.** This machine's real `/usr/bin/grep` (what CI and any
   fresh shell get) has no `-P` at all — `grep -P` exits `2` with `invalid option -- P`. `-E` with a
   `(?=...)` lookahead exits `2` with `repetition-operator operand invalid`. Both loud, not silent —
   but only if you're calling real grep; an interactive session can have `grep` shadowed by a
   ugrep-backed shell function that supports `-P` and won't catch this. Write POSIX ERE only when the
   check has to match what CI runs.
3. **Heredoc inside a double-quoted `bash -c "..."` expands `$?` too early.** `bash -c "false; cat
   <<EOF\nEXIT=$?\nEOF"` prints `EXIT=0` always — the **outer** shell expands `$?` while parsing the
   double-quoted argument, before the inner `false` ever runs. No error, no warning, just a wrong
   value. Reproduced side by side: the double-quoted form always prints `EXIT=0`; the single-quoted
   form (`bash -c 'false; cat <<EOF\nEXIT=$?\nEOF'`) correctly prints `EXIT=1`, because the inner
   shell — not the outer one — expands `$?` when the delimiter is unquoted. This is why the `EXIT=$?`
   idiom above is written single-quoted.

4. **`cd` persists across chained commands, so a later step can silently run in the wrong tree.**
   Reproduced 2026-08-22 while calibrating a control: `cd "$WT" && node --test …` (the pre-fix
   worktree) was followed by a bare `node --test …` meant for the fixed tree. The second run
   inherited the first's cwd, re-ran the pre-fix tree, and reported `0 pass / 4 fail` — a *correct*
   result for the tree it actually measured, and indistinguishable from the fix being broken. Nothing
   errored. Use an absolute `cd` in every step that matters, and echo both the cwd and a one-line
   fingerprint of the tree under test (`grep -c '<the new symbol>' <file>`) beside the result.

Point of traps 1, 3 and 4: all fail **silently** — the wrong answer looks exactly like a pass, with
no exit code or error message flagging it. Run every probe with real `bash`, and don't trust "it
printed something" as proof it printed the right thing.

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

**What a local green does and does not prove.** It proves every step this script classified
RUNNABLE-LOCALLY ran and passed, in the workflow's own order — single-line `run:` commands and
multi-line `run: |` blocks alike. It proves nothing about the STRUCTURALLY-NOT-RUNNABLE set, which
the script names on every run with the marker that classified each: a run body containing `${{` (a
GitHub expression that has no meaning outside Actions) or writing `$GITHUB_OUTPUT` (a step that
exists to feed a later one). Today that set is `Decide whether the browser probes can add anything`
and `Fetch SWA deployment token`, plus the `npm ci` install, which is a deliberate skip. Those gates
are covered by the real run on GitHub and by nothing else — read the run's per-step conclusions
below, never this script's exit code, for them.

**Why the `$GITHUB_OUTPUT` half of that rule is load-bearing.** `Fetch SWA deployment token` carries
`${{` only in its `if:`; its run body is expression-free and shells out to `az staticwebapp secrets
list` against the production resource group. A partition keyed on `${{` alone would classify a
production token fetch as safe to run locally and then run it.

**Why two markers were still not enough, and the two guards this repo owns.** `${{` and
`$GITHUB_OUTPUT` are *GitHub's* vocabulary. The set they enumerate is not one this repo controls, so
an ordinary workflow edit moves a step across the boundary without anyone thinking about the script.
Both directions were demonstrated on doctored copies of `ci.yml`, 2026-08-31: rewriting the token
step's `>> "$GITHUB_OUTPUT"` to `>> "$GITHUB_ENV"` left its body holding **neither** marker, the
pre-guard script classified it `RUN`, and a local invocation would have fired
`az staticwebapp secrets list` at production; adding `${{ matrix.foo }}` to the `Unit tests` body
flipped it to `NORUN`, restoring the gh#171 defect of a red `npm test` exiting 0. Two guards keyed on
**this repo's own command shapes** now wrap the marker rules, re-derived from the workflow text every
run (no pinned name, index, or title — a pinned list is what rotted the original extractor):

- **DENY, and deny wins over every other rule.** A run body whose *lines* invoke a cloud CLI
  (`az`, `aws`, `gcloud`, `kubectl`, and siblings, anchored to a command position), emit
  `::add-mask::`, or carry credential-shaped text (secret / credential / password / token / apiKey)
  is `NORUN` whatever its markers say — the banner prints the rule that caught it, e.g.
  `[DENY cloud CLI: az]`. Deliberately over-broad: a false deny costs one locally-skipped gate,
  printed with its reason; a false allow runs a production credential fetch on a laptop.
- **REQUIRE, and it aborts rather than discloses.** A body line starting `node --test` or `npm test`
  must land in a runnable class, and at least one such step must exist. Otherwise the script prints
  `ABORT: the workflow moved the unit tests out of local reach` and **exits 96** — before the banner,
  before `CLASSIFY_ONLY` can exit 0. A disclosure in a banner is exactly what let a reader trust
  `TOTAL=30 FAILS=0`, so the unit tests leaving local reach is not a footnote.

**The honest limit.** These guards bound the damage; they do not prove the partition complete. The
classification is still derived by reading a file whose *semantics* belong to GitHub — a construct
Actions treats specially and neither guard recognises would still be classified by shape alone. What
is now owned is the consequence: a step this repo would be reckless to run cannot become runnable,
and the one step whose failure must always be reachable cannot become unreachable quietly. Full
inversion (allowlisting every runnable command) was considered and rejected: it is a second set that
rots on its own schedule, and the extractor already aborts 98 when parsed ≠ declared.

**Why the exit code counts unexecuted steps as failures (gh#171).** The extractor used to read
single-line `run:` commands only, so all five multi-line `run: |` blocks — `Unit tests` among them —
were silently outside the work-set. On 2026-08-31 it printed `TOTAL=30 FAILS=0` on a tree whose
`npm test` was red; the push went to main and CI failed on `Unit tests`. The count was honest and the
summary line was still readable as "CI would pass", which is the ADR-0019 failure: a green implying
coverage it has not earned. A step that is runnable here but did not run is now arithmetic in the
exit code, and the summary line ends in a verdict that states its own scope rather than a bare
`FAILS=0`.

**The one expensive step, and the opt-out that costs you the exit code.** The browser probes are 88%
of the workflow's wall clock and drive a real Chrome — a second probe run attaches to the first one's
browser (`docs/runbook.md`), so a second one is wrong, not just slow. The script classifies that step
EXPENSIVE by a derived property, never by name: the workflow itself gates it on
`if: steps.<id>.outputs.<x>`, so CI decides per run whether it is worth paying for. It runs by
default. `SKIP_EXPENSIVE=1` skips it and counts it as **not-executed**, which forces a non-zero exit
and the "never executed. Do not push." verdict — so a run that used the opt-out is always visibly
incomplete and never predicts CI. `CLASSIFY_ONLY=1` prints all four classes (RUN / EXP / SKIP /
NORUN) as **tab-separated** columns.

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

## OIDC federated credential subject — AADSTS700213 despite matching the docs

Split out of `docs/runbook.md` at the seam `CLAUDE.md` already names (ADR-0012).

**Symptom:** `azure/login` (OIDC) fails with:

```
AADSTS700213: No matching federated identity record found for presented assertion subject
```

even though the federated credential's subject was set exactly the way Microsoft's docs — and every
guide — say to set it: `repo:<owner>/<repo>:ref:refs/heads/<branch>`.

**Cause:** on this GitHub organisation, GitHub does not send that subject. It sends the
immutable-identifier form, with numeric IDs appended to both the owner and the repo:

```
repo:warischa@271706784/watduang@1332779094:ref:refs/heads/main
```

Measured, not assumed: the credential was first created with the name-based form, and login failed
with the exact error above. It was caught 2026-08-19 by a throwaway smoke test on a temporary branch,
before the site ever went live. The credential has since been corrected to the ID form and proven
working — `azure/login` succeeded and fetched the deployment token, run 32273450017 (see "Per-step
outcomes" above, same run).

**Recover the true value:** the failing `azure/login` step prints the `subject claim` it presented —
read it off that run's log. The numeric IDs belong to this org and this repo; they are not guessable
and will differ for any other repo, so there is nothing to look up in advance.

**Don't:** trust Microsoft's docs, a blog post, or a prior session's memory for the subject format on
this org — recreate the credential from a failing run's log instead, every time.

## Calibrating a new gate at run level

Moved to `docs/agents/ci-gate-calibration.md` (a further ADR-0012 task seam) — proving a **brand-new**
gate fires on `main` is read only when someone is standing up that gate, not on every routine verify or
read-a-verdict pass covered above.
