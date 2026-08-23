# Tools come before game #3 — the four per #11 don't collapse into one, and don't route through `GameModule`

#11 already decided: all 4 randomizer tools ship in v1 (วงล้อ · จับฉลาก · แบ่งทีม · สุ่มเลข), and tools are "connective tissue, not a front door." #6 pins `/tool/<slug>` singular — 1 tool = 1 URL.

This ADR adds three things #11 and #6 don't cover: **order** (tools before game #3) · **code shape** (doesn't route through `GameModule`) · **ads** (placed below the tool).

## Rejected path — collapse into a single wheel, make name-draw/number-draw presets

Proposed earlier in this same session: since `วงล้อสุ่ม` is the biggest search term (#4 measured it at ~21x the games category), concentrate effort there and avoid thin content. **Rejected**, because:

- #11 already decided to ship all 4 in v1 at near-zero cost — collapsing doesn't actually save anything.
- The preset plan drops the team-split randomizer entirely, which is the tool that feeds a roster into the next game.
- The reasoning behind that proposal (the wheel is the front door) is exactly what #11 already guarded against in writing: "the tools page won't rank for `วงล้อสุ่ม`, and that's the plan, not a failure" along with "never reinterpret this later as 'the tool doesn't work' and pivot resources into it."

Recorded here because if it isn't written down, someone will re-propose the same preset with the same reasoning in six months.

## Doesn't route through `GameModule`

Tools aren't games per the `CONTEXT.md` definition — no rounds, no turn order. `GameModule` mandates `players[min,max]`, `seo.steps`, `category`, none of which fit `วงล้อสุ่ม`. Forcing it in would make half the fields optional and fill the validator with `if`s.

Pure logic lives at `src/tools/<slug>.ts` with a test alongside; the page is a `.astro` that imports it — a single seam, as high as possible, and CI already picks it up via the `src/**/*.test.mjs` glob with no workflow change needed.

**Condition from #11 that must not slip:** tools must share `PlayerSetup` with the games, and after spinning the player must be able to continue straight into a game with the roster carried over — a standalone page with no roster erases differentiators #1 and #2 of the site.

## Ads

Tool pages **carry ads, placed below the tool** — matching #8, which names the hub and setup/rules/post-game as real inventory. Space is reserved with `min-height`, and injection above content is forbidden.

Honest admission: spinning the wheel has the same reveal beat as a game screen. The argument that "a tool is used solo, so there's no phone-passing beat" isn't 100% clean.

## Consequences

Tools fall outside `scripts/validate-games.mjs` — nothing checks `og`, `seo` for them. Share cards still come free from the defaults in `Base.astro`; everything else stays eyeballed until the 4 tools show a real shared contract worth extracting, with a validator.

Root of the near-miss: the site owner was asked to choose before #11 and #6 had been read — same failure mode as [ADR-0002](0002-siamsi-is-the-eighth-game.md), which came from not reading #5 first. Read closed decisions before opening a new question, not after.

## Added during implementation of [#15](https://github.com/warischa/watduang/issues/15) — three things the original decision didn't cover

### "Tools must not touch `session.ts`" includes indirect paths too

`session.ts` has a **single** checkpoint slot shared across every game. A tool overwriting it destroys `siamsi`'s mid-round recovery.

This rule can be broken without touching code at all: `PlayerSetup` deliberately renders the "ล้างกลุ่มนี้" button **outside** `#player-setup` (so it stays clickable once the panel is hidden), and that button calls `session.clear()`. Once a tool page embeds `PlayerSetup`, the button comes along with it → open the wheel while a `siamsi` round is mid-game, tap that button, and the checkpoint vanishes with no warning.

Fixed with a `clearsSession` prop (default `true`, so existing games don't change). Tool pages pass `false`.

> **Outcome — 2026-08-23:** that prop is gone, superseded by gh#65. The rule above stands; only its
> mechanism changed. The prop defaulted to `true`, so a tool page was protected only for as long as its
> author remembered to pass `false` — a new page copied from `team.astro` without it shipped a fully
> armed `session.clear()` onto a page this ADR forbids to touch the session, with nothing failing or
> warning. The button is now derived from `gameId !== undefined` inside `PlayerSetup`, so a page with no
> game cannot obtain it by omission, and a mount still passing the old prop fails `astro check` rather
> than being ignored. Sole guarded set is "every page under `src/pages/tool/`", and the test that pins it
> reads that directory rather than a list of three (ADR-0027 records the same one-bit partition).

**Broader lesson: a rule written as "don't import X" isn't enough — check what a shared component drags in with it.**

### Remembered group — clamp on use, not on store

`roster.ts` stores the selected group under a separate key, `watduang:group` (`'watduang:roster'`'s original shape is untouched, since existing users already have a `string[]` there), and `loadGroup()` intersects it against the current roster to keep deleted-name ghosts from coming back.

Tried storing the group already clamped, to close the symptom of "check 11 boxes on a `max=10` page, and the 11th gets silently dropped again on every visit." **Rejected**, because it means walking through a page with a smaller `max` just once permanently loses the group — trading data loss for mere annoyance.

The original symptom stays, and it's known: the `min` side already surfaces a visible rejection, the `max` side still drops silently — that's a follow-up ticket, not something a storage change fixes.

Another unfixed side effect: once the previous group comes pre-checked, the path to "คนที่ 1, 2, 3…" mode (nobody selected) becomes harder to find — every checkbox has to be cleared first. The copy in `PlayerSetup` was corrected to match, but the flow itself still isn't clean — also a follow-up.

### The baseline for "a page went missing" must not derive from `src/`

#15 requires CI to **fail when a tool page goes missing**, which a glob cannot do — a glob enumerates what exists, so it can never fail because something is gone.

`src/pages/tool/` can't be the baseline either, because it's **the generator itself** — delete a page and the baseline shrinks right along with `dist/` → silent pass.

So the baseline is a slug list hardcoded in `ci.yml` itself — a set we own, and pinned at 4 by #11, so it converges (unlike a set a library or attacker owns, which never stops needing patches). Same role `manifest.ts` already plays for game pages.

If a 5th tool ever becomes possible — the set stops being pinned by #11 — this must move from a list in `ci.yml` to a tools manifest.

## Added during implementation of [#16](https://github.com/warischa/watduang/issues/16) [#17](https://github.com/warischa/watduang/issues/17) [#18](https://github.com/warischa/watduang/issues/18) — two things REFUTE caught before merge

### Group-size rule enforced at the page, not in the logic

`drawNames()` used to enforce "at least 2 names" on its `pool` parameter, but the tool page passes down the **remaining pile** as `pool`.
Once one person is left, the button is still clickable; pressing it throws every time, so the last person can never be drawn — and one existing test **had already pinned that wrong behaviour in place**.

Root cause: the rule was enforced on the **wrong set**. "Need at least 2 people to play" is a **group-size** rule, not a per-draw rule.
`draw.astro` already checks `players.length` (the full group), so the guard in the logic was redundant and wrong at the same time — deleted, not moved.

Contrast with `splitTeams()`, which correctly keeps `MIN_NAMES`, because it always receives the full group, never a shrinking pile.

**Broader lesson: before adding a guard, ask whether that parameter is actually the set the rule is talking about — a variable named `pool` doesn't mean it's the whole group.**

### `pickNumber`'s range needs a ceiling

`pickNumber()` builds one array slot per number in the range before drawing. A range of `1-999999999` = ~1e9 slots — tab hangs/OOMs on mobile.
Nothing capped it, because the existing validation only checked "range needs at least 2 values," which is the lower bound, not the upper one.

Ceiling = `MAX_RANGE_SIZE = 10000`, rejected with a Thai-language error message · party games have no case that needs a wider range than this.
The ceiling also keeps the candidates array small enough that the algorithm itself doesn't need to change.

**This whole class of bug is silent in tests** — tests always run with small ranges, so it can never surface. Needs a test that fires a large range directly.
