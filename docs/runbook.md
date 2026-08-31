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

## Adding a game trips two pinned-count gates, and one is invisible to `npm run ci`

**Symptom:** every gate passes locally, CI goes red anyway.

`bundle-freeze-check` and `control-floor-probe` both pin a count that any new game changes, and
`ci-probes` is not in the `ci` chain. Two gates, but **three** constants to re-record —
`bundle-freeze-check` pins `BASELINE_BASENAMES`, `BASELINE_TOTAL_BYTES` and (since gh#168)
`BASELINE_PAGE_ENTRIES`, the page-to-entry-chunk pair set that is what actually catches a new play
route, since every play route's script shares one hash-stripped basename. Full detail, and the three
commands "locally green" actually means: `docs/agents/porting-a-mockup-game.md`.

## `tsc --noEmit` does not typecheck `.astro`

**Symptom:** `npx tsc --noEmit` exits 0 and you conclude the types are clean. They may not be.

Verified 2026-08-21 by planting a real type error inside a `.astro` script block: `tsc` still exited 0
and reported zero errors. It only sees the plain `.ts` files. Every `.astro` component — which is where
this project's shell logic lives — is invisible to it.

**The real gate is `npx astro check`**, which is what CI runs. Calibrated the same day: 0 errors on a
clean tree, exit 1 with the planted error present.

Do not accept "tsc 0" as evidence that a change to a `.astro` file typechecks, and do not write it into
a definition of done — name `astro check` instead.

## The live site's address, and two things that will send you to the wrong one

Production is served from the Azure Static Web Apps default hostname:

`https://white-plant-05ad7c600.7.azurestaticapps.net`

It is a default hostname, not the intended one, and is expected to be replaced once gh#9 registers
`watduang.com`. It also changes if the SWA resource is ever recreated, so treat it as current-value,
not constant.

**The sitemap will send you somewhere that does not resolve.** `astro.config.mjs`'s `site` key and
`public/robots.txt` both carry `https://watduang.com`, so every `<loc>` in the built
`dist/sitemap-0.xml` does too — and `host watduang.com` exits 1 (measured 2026-08-30). A probe that
fetches each `<loc>` reaches nothing and reports zero findings, which reads exactly like a clean pass.
Take the origin from above and only the *path* from the sitemap.

**CI has not checked the live site.** The `ci.yml` step named "Browser probes against the deployed
artifact" runs `npm run ci-probes`, and `scripts/ci-probes.sh` sets `SITE` to a localhost port and
serves `dist/` there. The name says deployed; the target is local. A green CI is not a live check.

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

Moved to `docs/agents/browser-verification.md` — the setup, the driver usage and the traps now live
together there. CLAUDE.md already routes browser work to that file before you start.


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

Moved to `docs/agents/ci-verification.md` (ADR-0012 task seam). Read it before diagnosing an
`azure/login` OIDC failure — it sits beside "Reading CI's verdict on this repo" because both concern
the same run.

## Deleting or renaming a page

Moved to `docs/agents/page-deletion.md` (ADR-0012 task seam). Read it before deleting or renaming any
page — it covers the hardcoded smoke-step path list and the Azure trailing-slash route collision.

## An open agent worktree makes repo tooling grade a second copy of the repo

**Symptom:** gates and sweeps fail on files you never touched, naming paths under
`.claude/worktrees/agent-<id>/`. Confirmed twice: the save-session budget sweep reported nine FAILs for
docs its own table exempts, and `check-citations` went red, taking `npm run ci` with it.

**Cause:** a worktree is a second checkout inside the repo. Exclusions written as `./`-anchored find
paths, or as an exact relative path inside a script, do not match the copy — so the copy gets graded.

**Fix:** exclude the relative path `.claude/worktrees`. Never exclude `.claude` itself; the command docs
under it carry live references that must stay checked.

**Unmeasured:** twelve other gates under `scripts/` walk the filesystem and none excludes worktrees.
Red-vs-silently-double-counting is not established. So run the full suite with **no worktree present**
before trusting a green, and read any red naming a `.claude/worktrees/` path as an artifact.

**A worktree is branched from where the session STARTED, not from HEAD.** An agent dispatched after
several commits still gets the older tree, so it verifies code you already replaced. Seen: a worktree
sat at the session's first commit while HEAD was six ahead. Name the commit you expect in the brief and
make the agent report what it actually found.

**Exit-code trap:** the sweep's raw pipeline exits 1 when every doc is healthy and 0 when one is over
budget. The leading `!` in the documented command flips it; read the status without the `!` and the
verdict inverts.

Full probe triage and the per-gate detail: `docs/verification/probe-triage-2026-08-26.md`.

## `driver.mjs`'s `evaluate()` needs an explicit `return`, and a missing one looks like a missing element

`session.evaluate(body)` wraps what you pass as `(async () => { <body> })()` with `awaitPromise: true`
and `returnByValue: true`. So the body is a **function body, not an expression** — without an explicit
`return` you get `{ value: null }`, and exceptions come back as `{ error }` rather than being thrown.

Two ways this costs a run:

- Passing a bare IIFE (`(() => { … })()`) reads as a statement whose value is discarded → `{value: null}`.
- The `{value, error}` wrapper is an object, so comparing the *wrapper* instead of `.value` is always
  truthy-or-always-falsy. This produced a false "`#start-numbered` not found" against a control that
  was present and working, and sent a probe hunting a nonexistent setup bug.

Confirm you can read back one trivial value (`return document.title`) before building a measurement on
top of it. `#start-numbered` starts a round with **no roster names needed** — if it appears absent, suspect
the return contract before suspecting the page.
