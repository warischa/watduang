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
code is the number of failed gates; **98 means the extractor is broken, not the tree** — never read
that as a pass. `MIN_STEPS=` raises the floor.

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
