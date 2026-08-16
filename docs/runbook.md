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
node scripts/make-og.mjs site      # site-wide card, for every non-game page
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
npm run build        # not npx astro build
npx tsc --noEmit     # run separately, build doesn't do this
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

## Driving the site in a headless browser

`scripts/driver.mjs` + CDP on `:9222`, against a real `npm run build` served by `npx serve dist/ -l 4321`.
`docs/agents/browser-verification.md` governs — read it first.

**Do:**

```bash
# wipe storage ON THE ORIGIN — a wipe issued from about:blank clears nothing
# siamsi needs BOTH clicks to be genuinely mid-round:
#   start-round  -> mounts the game idle
#   #ss-start    -> actually enters phase 'turn'
```

**Don't:** assume `start-round` alone put you mid-round — a harness that skips `#ss-start` reads
`phase: null` and then reports a clean pass on a state that never existed.

Before trusting any null result, run both controls: a positive one (the detector sees a write you
know happens) and a negative one (the thing is absent when it should be). Pick the detector to match
the failure — checking `checkpoint` misses a variant that revives the record with `checkpoint: null`;
raw record presence catches it.

## Thai character classes in grep are locale-dependent

Unlocaled `grep '[ก-๛]'` mis-collates and invents matches — 42 false positives on one file, and a
second run of the same pipeline disagreed with the first.

**Do:**

```bash
LC_ALL=en_US.UTF-8 grep -n '[ก-๛]' file     # force the locale, every time
```

**Don't:** reach for `grep -P` — BSD grep on macOS has no PCRE. For anything load-bearing, do the
scan in python (`re.compile(r'[฀-๿]')`); a shell probe that contradicts itself proves nothing.

## A comment-only change still moves `dist/`

Astro **emits HTML comments into built pages**. Every other comment channel is stripped: `.astro`
frontmatter, CSS comments in `<style>`, and `//` / `/* */` inside `.ts`/`.mjs` and `<script>` all
disappear. Only `<!-- -->` sitting in template position survives into the output. So a diff touching
nothing but comments still changes built files, and a byte-identity check on `dist/` reports a
failure that is not one. Measured on
[#36](https://github.com/warischa/watduang/issues/36): 236 comment lines migrated, 0 user-facing
strings touched, 9 of 38 `dist/` files differed.

**Do:** strip HTML comments before comparing, and compare the *multiset* of rendered Thai runs on
both sides — #36 went 193 → 193, drift 0. A plain count only falling catches a deletion; the multiset
also catches a translation, which is the failure that actually matters here.

**Don't:** conclude "comments never reach `dist`" from one grep. That was inferred this session from
two probes and was wrong. One probe searched for `ระเบิดเวลา` — which is also the game's *name*, so it
appears in `dist` whether or not the comment survives. An input where right and wrong agree measures
nothing; pick a phrase that can only be comment prose.
