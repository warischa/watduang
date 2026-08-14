# Runbook

Gotchas you must know **before** acting, not after breaking something — they live here because
they hold true across sessions, not because they're this round's status.
`CLAUDE.md` keeps only the trigger line pointing here (under § Rules that must not be broken — has
to sit in a file that auto-loads, not `SESSION-HANDOFF.md`, which doesn't get injected).

## OG images — Thai vowels shatter silently

**Symptom:** the script runs clean, no error, every PNG comes out — but Thai vowels and tone marks
turn into dotted-circle placeholders (◌). "ระเบิดเวลา" comes out as "ระเบ ◌ ิ ดเวลา".

**Cause:** this machine has no libraqm, so Pillow's normal text path skips complex-script shaping
for Thai. Already shipped broken once, as `public/og/timebomb.png`.

**Don't:** render Thai text with Pillow · break a line mid-Thai-word (splitting a consonant from a
vowel that has to compose with it produces the same dotted-circle result).

**Proven path:** SVG → `rsvg-convert` (pango+fontconfig shape Thai correctly) → PNG.

```bash
node scripts/make-og.mjs <game-id>
node scripts/make-og.mjs site      # การ์ดระดับเว็บ ใช้กับหน้าที่ไม่ใช่เกมทุกหน้า
```

**Verify:** open the PNG and look at it, every time. "Ran clean" is not evidence here — broken and
correct look obviously different to the eye, but no exit code says so.

`scripts/make-og.mjs` is deliberately not wired into an npm script — the output has to pass human
eyes before use. The backstop is `validate-games.mjs`, which hard-fails if `public/og/<og>` doesn't
exist as a real file.

## build — must go through `npm run`, nothing else

**Symptom:** a new game with no OG image yet builds clean locally, then fails in CI · or code with a
type error builds clean, then breaks at runtime.

**Cause:** `npm run build` has a `prebuild` that runs `validate-games.mjs` — but `npx astro build`
skips that lifecycle entirely · and `astro build` **never typechecks**, no matter how you spell the
call.

**Do:**

```bash
npm run build        # ไม่ใช่ npx astro build
npx tsc --noEmit     # ต้องรันแยก build ไม่ทำให้
```

CI calls `npm run build` in `.github/workflows/ci.yml` for the same reason — if someone ever reverts
that to `npx astro build`, the gate goes silent instantly.

## Verify work the way CI does

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
bash -c "node --test 'src/**/*.test.mjs'"   # ไม่ใช่ node --test src/tools/
bash -c 'cmd > /dev/null 2>&1; echo EXIT=$?' # จับ exit ตรงๆ ไม่ผ่าน pipe
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

Point of traps 1 and 3: both fail **silently** — the wrong answer looks exactly like a pass, with
no exit code or error message flagging it. Run every probe with real `bash`, and don't trust "it
printed something" as proof it printed the right thing.

## Read closed issues before opening a new question

**Symptom:** you put a choice to the site owner and get an answer that contradicts a decision
already made — because neither side realized the missing context.

**Happened twice in one day:**

- Chose category `fortune` for game 2, assuming the category was still open — #5 (closed) already
  has a table of 7 chosen games, including two fortune-telling games →
  [ADR-0002](adr/0002-siamsi-is-the-eighth-game.md)
- Proposed collapsing tools down to just the wheel because it's the biggest search term — #11
  (closed) already decided to ship all 4, and **wrote the counterargument in advance**: the tools
  won't rank for that term, "and that's the plan, not a failure" →
  [ADR-0004](adr/0004-tools-come-before-more-games.md)

**Do:** before putting any decision to the site owner, read the relevant closed issues first.
`gh issue list --state closed` is only a dozen-odd issues — reading them all costs less than
steering someone into the wrong call.

**Don't:** assume "closed issue = done, don't read it" — a closed issue is where the decision lives,
not where abandoned work goes.
