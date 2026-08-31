# Shell traps that make a probe lie

Split out of `docs/agents/ci-verification.md` on 2026-08-31 — that doc is about reproducing CI's
verdict; this is about why your own probe reports a number that is not true. The combined file
crossed its 12KB ceiling. Read this BEFORE writing a verification command; read the other one
before trusting a local green.


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

