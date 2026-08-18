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

Moved to `docs/agents/ci-verification.md` (ADR-0012 task seam). Read it before reproducing any CI
verdict — it covers the silent-`EXIT=$?` traps, bash-vs-zsh probe failures, and why `gh run list`
404s on this repo.

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

## Two headless probes at once attach to each other's browser

`scripts/driver.mjs` reads `CDP_PORT` and defaults to **9222**. Two probe agents launched in parallel
both target 9222 and both `npx serve` on the same port, so the second silently drives the first one's
Chrome against the first one's `dist/`. Nothing errors; both report results, and one set is measuring
the wrong tree.

Give each concurrent run its own pair — e.g. `CDP_PORT=9333` with `-l 4322` — and launch Chrome with a
matching `--remote-debugging-port` and its own `--user-data-dir`. A probe that finds itself attached to
a target it did not launch should stop, not measure.

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

## The clear-round confirm — approved copy, and why it focuses cancel

ADR-0008 is the decision; these are the operational details it relies on. Owner-approved (#25), and the
rule is that the copy names **every** loss the confirm will actually cause — over-naming is acceptable,
under-naming is not. `clearCopy` in `src/shell/player-select.ts` selects; `null` means "leave the
template default alone". Any edit must keep these byte-identical — `PlayerSetup.astro` ships the first
pair as markup and ADR-0008 quotes them.

| case | question | confirm button |
|---|---|---|
| stranded checkpoint only (template default) | `ยังมีรอบที่เล่นค้างอยู่ ถ้าล้างกลุ่มนี้ รอบที่ค้างจะหายไปด้วย` | `ล้างและทิ้งรอบที่ค้าง` |
| live round on this page | `เริ่มรอบบนหน้านี้ไปแล้ว ถ้าล้างกลุ่มนี้ รอบนี้จะหายไปทั้งรอบ` | `ล้างและทิ้งรอบนี้` |
| both at once | `เริ่มรอบบนหน้านี้ไปแล้ว และยังมีรอบที่เล่นค้างอยู่ด้วย ถ้าล้างกลุ่มนี้ ทั้งรอบนี้และรอบที่ค้างจะหายไป` | `ล้างและทิ้งทุกรอบ` |

`ยกเลิก` takes focus when the question opens, and that is load-bearing, not styling. A click fires on
Enter **keydown**, so focusing the destructive button puts it under a key that may still be held —
auto-repeat, or a habitual second Enter, confirms a question the player never read. Both prompts in
`src/shell/PlayerSetup.astro` focus their safe branch for this reason.
