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
- **No pipe needed for the same trap.** A command LIST reports its last element too, so
  `bash scripts/run-workflow-gates.sh; echo done` and `... ; tail -20 log` both report `echo`/`tail`'s
  status — and that is the number a background-task notification hands back as "exit code". Hit three
  times in one session (2026-09-07) by someone who knew the rule, because appending a convenience
  `tail` is a reflex. The fix is structural: record the code on the line right after the command
  (`rc=$?; echo "SUITE_RC=$rc" >> log`) and grep that, or end the wrapper with `exit "$rc"` so the
  reported status is honest by construction. Never quote a wrapped run's verdict from the harness's
  own exit code without saying which recorded line you read.

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

**More shell traps, each reproduced on this machine before being written down** (no count in this
sentence on purpose — it said "three" while four were listed, for as long as nobody re-read it):

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

## The instrument measured something other than what you asked

The traps above are about the shell running your command differently than you read it. These are
about the command running correctly and answering **a different question** — every one returns a real
number, from a clean exit, about the wrong subject. All reproduced 2026-09-07, in one session, by an
agent who then wrote four of them into claims before re-measuring.

**Name what the command actually counts before quoting what it returned.** That sentence is the
whole section.

- **An `awk` range ending in `0` runs to END OF FILE, so it counts a superset.** `awk '/\.target/,0'`
  is not "the `.target` block" — `0` never matches, so the range never closes. Reproduced on a
  two-rule stylesheet whose `.target` block contains no `font-size` and no `padding`: the range
  reported `font-size=1 padding=1`, both belonging to the *next* rule. A brace-accurate walk
  (`/pat/{f=1} f{print} f&&/}/{exit}`) reported `0` and `0`. In the real case this nearly refuted a
  correct finding about six route stylesheets.
- **`grep -A N` prints a block that LOOKS complete and stops N lines in.** There is no truncation
  marker, and the last line printed is usually a plausible property, so nothing signals the cut.
  Reproduced on a ten-property CSS rule: `grep -A8` printed nine lines ending on `align-items` and
  reported `min-height` **absent**; the real block has it. A present declaration read as missing,
  twice in one session, once on the exact value a ticket turned on.
- **A missing file yields EMPTY; a real zero yields `0`. A label renders them identically.**
  Reproduced: `grep -c pat missing.txt` captures `[]` with rc `2`; `grep -c pat exists-no-match.txt`
  captures `[0]` with rc `1`. Written into a report as `count=$v`, the first prints `count=` and the
  second `count=0` — and `count=` was read as "zero", i.e. as evidence, when it meant the instrument
  never ran. If a count can be empty, check rc, or print a sentinel.
- **A lazy regex extracting a delimited body under-extracts and still passes.** `/=> `([\s\S]*?)\n`;/`
  on a real probe in this repo captured **2412 of 5267 characters** — under half the template — and
  the fragment happened to be valid, so the check reported PASS. A pass on 46% of the subject.
  Earlier the same day the same shape reported a *parse failure* on a file `node --check` accepted;
  which way it lands is luck, and neither reading is about the file. Walk delimiters with
  backtick/`${}` awareness, and diff the extracted length against the file before trusting a verdict.
- **Counting a term's MENTIONS counts prose about the data as data.** Reproduced on a registry whose
  `_readme` names the three file kinds it can hold: `grep -o` reported `style.css` once, so "one
  stylesheet entry exists". Parsing the object reported **zero** `style.css` keys — the single hit was
  the sentence describing the format. Same family as the runtime-value rule below: if the subject is
  structure, parse it; a name's frequency is not a count of anything.
- **A text grep cannot answer a question about a runtime value.** `grep -c playRoute src/games/manifest.ts` returns 0 while importing that module and filtering on `playRoute` returns all eleven route ids — the field is declared in each game module and composed at import time. Claims about a property, an export, or a resolved config get EXECUTED, never searched for by name; a zero from one file's text is not evidence a runtime property is absent. On 2026-09-05 that zero was published as a refutation of a correct design and written into a brief telling the worker to distrust it.
  Routed out of `CLAUDE.md` on 2026-09-08 at the seam that file already names (ADR-0012) — `CLAUDE.md`
  sends every "before writing a verification command" task here, and this is one. The prose above is
  the routed text unchanged; `CLAUDE.md` keeps the first sentence as its one-line trigger.

**The cheapest control for all six:** run the same instrument against an input whose answer you
already know, in the direction that would expose the bug. The under-extraction above was caught only
by running the extractor against the file at `HEAD` as a positive control, and the superset only by
using a route whose block genuinely holds the properties. An instrument that has never disagreed with
a known-good input has not been tested; it has just agreed with you.

