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

## `tsc --noEmit` does not typecheck `.astro`

**Symptom:** `npx tsc --noEmit` exits 0 and you conclude the types are clean. They may not be.

Verified 2026-08-21 by planting a real type error inside a `.astro` script block: `tsc` still exited 0
and reported zero errors. It only sees the plain `.ts` files. Every `.astro` component — which is where
this project's shell logic lives — is invisible to it.

**The real gate is `npx astro check`**, which is what CI runs. Calibrated the same day: 0 errors on a
clean tree, exit 1 with the planted error present.

Do not accept "tsc 0" as evidence that a change to a `.astro` file typechecks, and do not write it into
a definition of done — name `astro check` instead.

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

**Two more ways the driver reports a dead page that is alive.** `driver.mjs`'s `evaluate(body)` wraps
what you pass in `(async () => { body })()`, so an expression **without `return`** yields
`{value: null}` — indistinguishable from a page that never loaded. Write `return document.title`, not
`document.title`. And `driver.mjs` **attaches** to an existing CDP endpoint; it does not launch
Chrome. With nothing listening you get `ECONNREFUSED`, which reads like a broken build rather than a
browser you forgot to start.

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

## OIDC federated credential subject — AADSTS700213 despite matching the docs

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
working — `azure/login` succeeded and fetched the deployment token, run 32273450017.

**Recover the true value:** the failing `azure/login` step prints the `subject claim` it presented —
read it off that run's log. The numeric IDs belong to this org and this repo; they are not guessable
and will differ for any other repo, so there is nothing to look up in advance.

**Don't:** trust Microsoft's docs, a blog post, or a prior session's memory for the subject format on
this org — recreate the credential from a failing run's log instead, every time.
