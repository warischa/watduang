# ADR-0014 — No navigation target inside `#stage`

Date: 2026-08-17 · Status: accepted · Supersedes nothing · Related:
[ADR-0013](0013-an-unprompted-exit-whose-label-matches-its-effect-is-not-the-25-class.md) (in
conflict — see below), [ADR-0009](0009-a-dod-box-whose-proof-set-we-do-not-own-is-mis-scoped.md),
issues #37, #39

## Context

Every game transitions by calling `stage.replaceChildren()`. The screen that replaces the old one was
placing an in-stage `<a href="/games/">` at a coordinate the finger had just used, so a second tap —
the ordinary reality of a phone passed around a table — navigated the group off their round.

Measured in `daily-fortune` at a genuine 320px with an 8-name roster (#37). A 2-name roster showed
nothing, which is why an earlier verdict claimed the game was safe: one configuration cannot earn a
universal. The same in-stage anchor was then found in all six games.

## Decision

`#stage` contains **no navigation targets**. A game renders no `<a href>` into the stage. The one
crawlable outbound link lives in static page chrome above `#stage`
(`src/layouts/GameLayout.astro`).

**Retargeted 2026-08-26 by [ADR-0041](0041-the-all-games-page-cannot-exist-after-adr-0040.md):** that
link pointed at `/games/`, and `/games/` no longer exists. It now points at `/`. Nothing in this ADR
turns on the target — every property below is a property of where the link *sits*: static, first in
`<main>`, nothing above it that changes height at runtime, and therefore the one link exempt from
ADR-0015's leave-confirm. Read `/games/` in the sections below as "the outbound link".

Chosen on ownership, not taste. The set this invariant must enumerate is "navigation targets inside
`#stage`" — a set we own, and one we can make **empty by construction**, so it converges vacuously.
The alternatives each rest on a set nobody owns:

- **Layout guard** (render the next screen's first control below the previous screen's maximum y):
  that bound is owned by Thai text length × roster size × the layout engine. The same control's y
  swings 323→683px across rosters 2 to 8. Never converges.
- **Spatial guard** (swallow the first activation inside the abandoned rect): the rect is ours, but
  telling a stale tap from a deliberate one needs timing or `event.detail` click-count, both
  browser-owned — the settle-gate set already rejected for this class, in disguise. A count-only
  version also eats siamsi's every-turn ส่งต่อ→จั่วดวง overlap.

Placement **above** the stage is load-bearing: nothing above that line changes height at runtime, so
no `replaceChildren()` can pull it back under a finger.

## Consequences

- A new game must not render a link into the stage. The invariant is machine-checked by claim 0 of
  `scripts/no-nav-in-stage-probe.mjs`, which was red on all six games before the fix and green on all
  six after — that red is the calibration, and without it the check would prove nothing.
- The link became crawlable as a side effect: `dist/game/*/index.html` carried **0 of 6** links to
  `/games/` before this and carries one each now. It had only ever been rendered by game JS, where no
  crawler saw it. SEO is this project's business model, so this matters more than the bug fix does.
- Editing all six games rather than the two where a collision reproduced is deliberate: per-game
  clearance ranged from −26px to +339px and is not stable across roster sizes, so coordinate
  reasoning cannot be trusted per game.

## Known conflict with ADR-0013 — not resolved here

This invariant says no navigation target may sit under a post-transition finger. `GameNav` is a
navigation target that does exactly that: it sits *below* `#stage`, and a transition that shrinks the
stage slides its links up into the vacated coordinate. Measured — siamsi `#ss-again` at roster 7 with
24-character names resolves 25 of 60 sampled points to `/game/pick-loser/` and `/game/short-stick/`;
pick-loser at roster 10 puts `/game/timebomb/` under the start button.

ADR-0013 locks `GameNav` as-is. Both cannot hold. **This ADR's invariant is currently satisfied only
inside the stage**, and the conflict is filed as #39 for an owner decision rather than patched. Do not
read ADR-0013 as settled while #39 is open.

**Resolved by [ADR-0015](0015-a-leave-confirm-guards-the-links-we-cannot-move.md).** The invariant
above remains scoped to `#stage` and is unchanged. Outside the stage the links stay where they are and
a leave-confirm changes what a stray tap costs instead of where the link sits. Two consequences for
anyone verifying this ADR:

- **Claim 2 of `scripts/no-nav-in-stage-probe.mjs` stays RED for siamsi and love-match, by design.**
  It measures geometry, and the geometry is unchanged. A green claim 2 would mean the check was
  weakened to match the fix.
- Claim 0 (`stageHasNoAnchor`) is the machine-check for *this* ADR and stays green on all six games.

## The fact that would change this

If a game genuinely needs an in-stage exit for gameplay reasons, the only convergent alternative is a
stage-height floor (`min-height` on `#stage`) so a shrinking screen cannot pull chrome upward — and
that reintroduces exactly the unowned set rejected above, so it would need per-roster-size
verification per game rather than one reading.

Separately, the harness that proved this sampled three points on **centre-x only**. That is why the
`GameNav` collisions were missed: the anchors sit ~7px off that axis. Any future verification of this
invariant must grid-scan the whole control box and must sample the `#start-round` transition.
Both now exist — `scripts/gamenav-again-grid-probe.mjs` and `scripts/gamenav-start-grid-probe.mjs` —
and the centre-x probe has since had two of its own blind spots closed: an off-viewport control used
to score a vacuous PASS (now INCONCLUSIVE), and the ordering bug that let one unmeasurable tap mask a
game with real hits (now FAIL first). Neither hole was found by running the probe; both were found by
reading it. Treat a green from any harness here as a claim about the points it sampled, nothing more.

## Outcome recorded 2026-08-18 (ADR-0016)

The alternatives section above did work it was not written for. Its layout-guard measurement
(323→683px) pre-emptively killed a geometry fix a later session had already queued for short-stick,
before a line of it was written.

Its spatial-guard rejection, however, is narrower than it reads. That rejection turns on a guard
having to *classify* a contact as stale-vs-deliberate using browser-owned signals. A guard that
classifies nothing — disabling every post-swap control for a fixed window — is not covered by it, and
[ADR-0016](0016-a-gate-that-classifies-nothing-converges.md) adopts exactly that. This ADR's own
invariant is unchanged and still stage-scoped to navigation targets.
