# ADR-0070 — A solo landing reserves its first screen until mount, and only until mount

Date: 2026-10-04 · Status: proposed (gh#253 design review; rides the session's integrated push) ·
Extends: ADR-0024, ADR-0044 · Carves out of: ADR-0014, ADR-0015 (their stage-height floor) · Issue: gh#253

## Context

The three solo landings that share `GameLayout` (`/game/siamsi/`, `/game/daily-fortune/`, `/game/love-match/`)
ship `#stage` empty, as they must (ADR-0014, ADR-0028: the stage-empty gate in
`scripts/no-nav-in-stage-check.mjs`). The page script lazy-imports the game module and mounts it, so on
first paint the how-to section, the ad slot, the game nav and the footer sit directly under an empty
stage, then jump down by the first screen's height (~520-600px) when the module lands. The 2026-10-04 UI
audit read CLS 0.28 at 1440 on siamsi; the gh#252 slow-4G read was 0.28 at 1440 and 0.64 at 320. The ad
slot is one of the things that moves, so this is an ADR-0024 instance: the reflow is the hazard.

## Decision

1. **The game declares its first-screen height** as data it owns: `firstScreenReserve: { phone, wide }`
   on the game module (CSS px; `phone` below the tokens.css 640px tablet boundary, `wide` from it up).
   `GameLayout` hands it to `#stage` as two custom properties in a `style` attribute. No child markup:
   the stage still ships empty.
2. **`#stage` reserves that height only while it carries no `data-stage` attribute.** The page script
   sets `data-stage="mounted"` in the same task as `mount()` returns, and `data-stage="failed"` on every
   failed import or mount (solo and party paths both), so a page whose game never arrives shows no empty
   hole. The attribute is never removed.
3. **The outcome is asserted, never the height.** The check is residual CLS (<= 0.05 per landing per
   viewport, the layout-shift instrument the audit used), plus "the stage reads `mounted` and its computed
   `min-block-size` is 0px after mount", plus a failure leg. Height equality is never asserted.

## Why this is not the floor ADR-0014 and ADR-0015 rejected

Those ADRs rejected a stage-height floor as an **in-play mis-tap guard**: keeping a shrinking screen from
pulling the chrome upward under a finger, which needs a bound over Thai text length x roster size x engine
for every screen of every round. That set is unowned and unbounded. This reserve answers a different
question over a set of one: the height of the **first** screen, before any input is possible, released for
good the moment the game owns the stage. After mount the stage sizes to its content exactly as before, so
every in-play reflow ADR-0014 and ADR-0015 reasoned about is unchanged, and their leave-confirm and grid
probes still own it. It is keyed on an attribute the page script sets, never on `:empty`: siamsi calls
`stage.replaceChildren()` on every screen, so `:empty` is the game's render strategy, not a mount signal,
and keying on it would turn the reserve into exactly the in-play floor rejected above.

## Why per game and per width class, and what the class cannot see

One value for the three pages is the wrong partition key: three different first screens. Measured (Mitr
self-hosted, `docs/verification/evidence/gh253/stage-heights-before.json`): siamsi 597 at 320, 576 at
360-414, 534 from 480 up; daily-fortune 530 at every width; love-match 569 up to 560, 517 from 639 up.
From 640 up every game is constant, so the `wide` value is exact. Below 640 the height changes inside the
class where Thai copy wraps, so the `phone` value is the common phone widths' height, and the residual at
the other widths is a 20-60px move. That residual is small in CLS terms on purpose: a shift's score is
its impact fraction times its distance fraction, and both are a fraction of the viewport. The values are
measured, not derived; a copy or font change that moves a first screen changes the residual, and the
probe below is what notices.

Note 2026-10-04 (gh#251): the owner's 16px phone body ruling grew two phone first screens (daily-fortune
539, love-match 579 up to 560 and 527 at 600-639); their `phone` values moved with it, `wide` did not.
`scripts/validate-games.mjs` now requires the field, both widths positive, on every game with no
`playRoute`, the same key the landing route builds on.

## Rejected

- **Hide the below-stage content until mount** — removes the shift by hiding the crawlable how-to and the
  game nav behind JS; SEO is the business model.
- **modulepreload alone** — moves the mount earlier, does not remove the move; on a slow network the
  empty-stage frame still paints.
- **Skeleton markup inside `#stage`** — breaks the stage-empty gate (ADR-0028), and a static child is a
  tap target a transition can land on (ADR-0014).
- **One shared floor value** — see above; three screens, three heights.

## Regression check and where it runs

`scripts/stage-reserve-probe.mjs` (via `scripts/driver.mjs`), set derived from the manifest (every game
without a `playRoute`). It asserts residual CLS, the `mounted` attribute, the released `min-block-size`
after mount, the declared properties, and a failure leg. It reds on the unfixed build (CLS 0.28 / 0.45,
no attribute) and on a mutant that never releases the reserve (CLS stays green there; the floor check
reds, which is why the CLS number alone is not the check).

It is **not** wired into `scripts/ci-probes.sh`; it runs in dated evidence
(`docs/verification/evidence/gh253/`). Its own cost is small (one Chrome, ~18 s wall locally), but that
lane is most of CI's wall clock, its legs are pinned (`EXPECTED_LEGS`) with a verdict predicate and a
calibrating control leg each, and the fast unthrottled lane cannot see the phone case at all: on a fast
localhost the module mounts before first paint, so the unfixed build reads CLS 0 below 640px and only the
throttled runs measure the phone reserve. A CI leg would therefore check the wide reserve and the release
mechanism only. The fact that would move it into CI: a second regression of a solo landing's CLS, or a
fourth solo landing.

## The failure path

A failed import or mount releases the reserve, so a failed page shifts its below-stage content up once
(measured 0.28 at 1440 on siamsi with the chunk aborted). That is chosen over the alternative, an empty
first-screen-sized hole above the how-to section on a page whose game never comes.

## The fact that would change this

If a solo game's first screen stops being a fixed-height function of width — for example, it renders a
remembered result whose length varies per visitor — a declared reserve can no longer be close for every
visitor, and the residual must be re-measured over that set before this holds.
