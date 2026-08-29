# ADR-0015 — A leave-confirm guards the links we cannot move

Date: 2026-08-17 · Status: accepted · Supersedes nothing · Related:
[ADR-0014](0014-no-navigation-target-inside-the-stage.md) (extends its reasoning past the stage),
[ADR-0013](0013-an-unprompted-exit-whose-label-matches-its-effect-is-not-the-25-class.md) (resolves
the conflict filed at its foot), [ADR-0009](0009-a-dod-box-whose-proof-set-we-do-not-own-is-mis-scoped.md),
issues #35, #37, #39

## Context

ADR-0014 emptied `#stage` of navigation targets. The hazard relocated one layer out: `GameNav`
(`src/layouts/GameLayout.astro`) sits *below* `#stage`, so a transition that shrinks the stage slides
its links up into the coordinate the finger just used. The second tap of a double-tap opens another
game and the group loses the round they were playing.

Measured at a genuine 320px against the post-ADR-0014 build:

- siamsi `#ss-again`, roster 7 with 24-character names — 25 of 60 grid points inside the button's own
  box resolve to live `GameNav` anchors.
- pick-loser, roster 10 — the `#start-round` panel collapse drops `/game/timebomb/` under the start
  button, 8 of 45 points.
- love-match `#lm-again`, roster **2** with 20–24 character names — 4 of 40 points resolve to
  `/game/timebomb/`. Rosters 3–10 are clean, and short names are clean at every size.

That last reading is the important one. The collision is **not monotonic in roster size**, so no
per-game or per-roster clearance argument can be trusted, and the earlier "love-match is not
reproduced" verdict was an artifact of centre-x sampling.

## Decision

**A click on a link that can move asks for confirmation when the page has started a round.** Nothing
moves; only the consequence of the collision changes.

The guard is a capture-phase `click` listener on `document`, appended to PlayerSetup's existing
external island (no new `<script>` — ADR-0005). It matches `a[href]:not([data-stable-exit])`, and it
is inert unless the page carries a `gameId` and `#player-setup` is hidden.

## Why — the ownership answer

The guard's set is **inverted**, and that is the whole reason this approach converges. It does not
enumerate the links that can end up under a finger — that set grows with the page and is not ours.
It marks the links that provably *cannot* move: `data-stable-exit`, carried today by exactly one
element, the `/games/` link that ADR-0014 already placed above `#stage` and proved immobile.
Everything else below the stage — `GameNav`'s five siblings, the brand footer's link home — is
guarded without ever being named.

The rejected alternatives each rest on a set nobody owns:

- **Relocate `GameNav` above `#stage`**, mirroring ADR-0014. Rejected because #35 placed it below the
  fold deliberately, and its stated reason is this same hazard: a game page is a phone being passed
  around mid-round, so an above-the-fold link is itself a tap-away hazard. This trades the hazard in
  the opposite direction rather than removing it.
- **A suppression window after each stage mutation.** Two unowned sets: the window `N` (human
  double-tap cadence × paint latency — the settle-gate set ADR-0014 rejects by name), and "things
  that move `GameNav`", of which the stage mutations we fire are only a subset. The `min-height: 250px`
  ad slot at `GameLayout.astro:50` sits between the stage and the nav, and an ad iframe resizes on
  Google's schedule, not ours.
- **A stage-height floor.** The unowned set ADR-0014 already rejected: Thai text length × roster size
  × layout engine.

Crawlability does not discriminate between these options: crawlers read HTML, so every one of them
keeps #35's five sibling links in the served markup. This decision was made on ownership alone.

## What the predicate carries — and what it does not

"A round is live" is `root.hidden` on `#player-setup` (`src/shell/PlayerSetup.astro`). No such
predicate existed and none was added.

**That bit means "this page started a round", not "a round is running now."** Nothing un-hides the
panel when a round ends, so the confirm also fires on a finished-round summary. The copy is therefore
bounded by what the bit carries and claims only that the tap leaves the page. An earlier draft read
`เริ่มรอบบนหน้านี้ไปแล้ว ถ้าไปเกมอื่นตอนนี้ รอบนี้จะจบ`, which asserts a live round will end when none
exists; it was replaced for that reason, not for wording taste. This follows the `clearCopy`
precedent in the same file: over-naming what a control affects is fine, under-naming never is, and
claiming a state that does not exist is neither.

**Owner ruling (#39): this ceiling is accepted as permanent.** The dialog asks only whether to leave,
and both buttons are bounded the same way — an earlier stay button read `เล่นรอบนี้ต่อ`, which promises
to resume a round that may already be over, so it names the page instead. The copy is final, not a
placeholder. Stopping the stray tap was the goal; narrating what is at stake was never reachable
without state this site does not have.

**Amended 2026-08-29, owner ruling: the go button now names the page too.** `ไปเกมอื่นตอนนี้ไหม` /
`ไปเกมอื่น` became `ออกจากหน้านี้ตอนนี้ไหม` / `ออกจากหน้านี้`. This is not a wording change against the
ruling above — it is that ruling applied to a link the site did not have when it was made. A game whose
module carries `playRoute` renders a chrome link INTO the same game's full-screen route
(`src/layouts/GameLayout.astro`), and on that link `ไปเกมอื่น` claims a destination that is false: the
player is entering this game, not leaving for another. The section above already rejects copy that
"asserts" something untrue, and it already resolved the stay button the same way — by naming the page
instead of the outcome. The go button was the one control still named after a destination, which held
only while every intercepted link went somewhere else. It no longer does.

## Anti-recursion — the confirm must not become the bug

A confirm is a tappable surface appearing at the moment a second tap is already queued. Three layers,
all enumerating sets we own:

1. `showModal()` puts the dialog in the top layer and makes the rest of the document inert.
2. The dialog anchors to the viewport half the finger is **not** in, and the same class flips
   `flex-direction` so the accept control sits at the far edge. This is a property, not a measurement:
   with `max-block-size: 45dvh`, `0.45H + 16 < 0.5H` holds for every `H ≥ 320`.
3. Focus parks on the stay control, which geometry cannot cover.

`max-block-size: 45dvh` is load-bearing, not styling. Without the cap, clearance depends on Thai copy
length × layout engine — the unowned set again.

**Not covered:** a third tap deliberately aimed at the accept control (aimed ⇒ ADR-0013 territory); a
finger travelling ≥ ¼ viewport between taps (unmeasured); UA back-gesture, back button, or tab close;
browsers without `<dialog>`, where the guard **fails open** by design.

## Consequences

- Claim 2 of `scripts/no-nav-in-stage-probe.mjs` stays **RED** for siamsi and love-match, deliberately.
  The geometric collision is unchanged — only its consequence is. Turning that claim green would mean
  weakening the check to match the fix, which is the one thing a verification must never do.
- Tool pages are **unguarded**, gated on the absence of `gameId`. The reason is that there is no round
  to lose there: tool state is memory-only and ephemeral by design, and the sibling-game nav is the
  conversion path a tool page exists to offer. This is **not** a claim that tool pages do not collide
  — whether a tool CTA collapse drops a `wheel-next` link under the finger is unmeasured.
- Verification of this class uses **real touch events** (`Input.dispatchTouchEvent` via
  `scripts/driver.mjs`), not `.click()` plus `elementFromPoint`. The latter proves where a link is; it
  never proves that navigation happens. The positive control is the unfixed build, where the same tap
  navigates `/game/siamsi/` → `/game/pick-loser/`.
- Any check written for this class must be calibrated in **both** directions. The first crawl check
  written here passed a page that linked to its own game, because it deleted the self-link before
  counting — it had only ever been calibrated against undercounting.

## Not gated by CI

Two checks were written and calibrated for this class and **deliberately not wired into `ci.yml`**
(owner ruling, #39): `scripts/crawl-check-gamenav.mjs` and an `astro check` step. Both run only when
someone runs them. Until they are wired, CI cannot catch a `GameNav` self-link regression, and it
cannot catch a broken reference inside an `.astro` file at all — `npm run build` exits 0 on one and
ships anchors with empty link text. The scripts and the proposed YAML are in the tree; the decision
was to revisit them alongside the deploy chain rather than now.

## The fact that would change this

If copy long enough to exceed `45dvh` is ever introduced, `overflow: auto` scrolls the accept control
out of the visible dialog and the clearance property stops describing what the finger can reach. The
cap would then have to become a constraint on the message length rather than on the dialog.

Separately: if a predicate for "a round is running now" ever exists, the copy could say what is
actually at stake instead of only that the tap leaves the page. Today no such state exists anywhere on
the site — siamsi is the sole checkpoint writer and its checkpoint is forward-only. The owner has
accepted that ceiling rather than built the state, so this is a live limit, not an oversight.
