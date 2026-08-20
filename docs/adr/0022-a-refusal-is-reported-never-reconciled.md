# A refused write is reported at the chokepoint, never reconciled

[ADR-0021](0021-a-version-token-not-a-clock.md) gave `write()` a generation token so a stale closure
cannot clobber a newer checkpoint. [#50](https://github.com/warischa/watduang/issues/50) found the
other half: the refusal was correct and **invisible**, so a bfcache-restored page that kept playing
lost its whole round in silence.

We decided the refusal **reports** and nothing else. It does not re-sync the generation, does not
adopt the stored record, and does not try to notice when a page was restored.

## Why not reconcile

The muted closure is the guard *working*. At the moment of refusal the closure's memory and the
stored record have genuinely diverged — an older base plus whatever the player has tapped since,
against a record another document has moved on. There are only two things reconciliation can do with
that, and both are worse than refusing:

- **Adopt the stored record** — discards the state the player can see on screen, so the DOM lies about
  the round in front of them. That is [ADR-0008](0008-starting-a-round-never-resumes-or-discards-one-silently.md)
  in substance: a round disappearing without being asked about.
- **Re-sync the generation and then write** — persists the stale snapshot over the newer record, which
  is the gh#49 bug reintroduced by its own fix.

So "keep the round playable" is not on the menu. Only the silence was ever the defect.

ADR-0021 had already declined the event-driven form of this on ownership grounds: catching restores
would enumerate bfcache eligibility, freeze/resume, a future prerender — a set the browser owns, not
this repo, so it never converges. It also breaks the innocent case `src/pages/game/[id].astro`'s
`pagehide` handler deliberately preserves: an ordinary back-button return to a live round.

## Why the chokepoint, not the callers

`write()` is the one place all three writers route through, and its own docstring says so. The
alternative — every caller checks a return value and decides what to say — spreads the obligation to
every game module, and the manifest grows: 1 game = 1 file. A game added later would inherit the
*unsafe* default of forgetting to check.

Reporting at `write()` makes the set size 1. Two consequences worth keeping:

- The listener lives on a `ShellSession`, never on `GameSession`, so a game cannot see or clobber it.
  Handling a refusal is the shell's job once.
- `write()` declares a return type instead of `void`, so a guard branch added later **cannot** be
  silent — a bare `return` is a compile error. The next person to add a guard is forced into the
  signal rather than reminded to add one.

## Three reasons, not one message

The record is gone · someone else's round holds the slot · this closure is a version behind. Those are
three different losses to a player, and [#25](https://github.com/warischa/watduang/issues/25)'s
owner-approved rule is that the copy names every loss it actually causes — over-naming is acceptable,
under-naming is not.

A closure that never established an identity is **not** any of them. Storage that always throws (Safari
private mode, a full quota) has `setPlayers` swallowed by `write()`'s own catch, leaving no identity, and
every later write then finds no record. Reporting "the round was cleared" there names a false cause and
re-announces on every tap — the exact per-tap alarm that catch exists to avoid. So the report is
conditional on the closure having known a record.

## Consequences

- The player-facing surface is text only, no control: a button would be a new tap surface, which is
  what [ADR-0015](0015-a-leave-confirm-guards-the-links-we-cannot-move.md) and
  [ADR-0020](0020-a-gate-fix-is-itself-a-new-surface.md) exist for. It sits as a sibling *after*
  `#stage` — outside it per [ADR-0014](0014-no-navigation-target-inside-the-stage.md), and after it so
  that showing it cannot push the game's own controls under a finger mid-tap.
- Storage that always throws still loses everything silently. That is pre-existing, unrelated to the
  generation token, and deliberately left unsignalled here rather than solved badly.
- The notice *clearing* on a new round is unproven by test — there is no DOM harness for
  `src/pages/game/[id].astro`.

## What this rests on

The gh#49 harness was run against both trees, not just the fixed one: the pre-fix commit reports
CONFIRMED and the fixed tree reports REFUTED, with `bfcacheRestored: true` in both legs. Without that
positive control, a REFUTED and a harness that has quietly stopped working are the same output.
Evidence: `docs/verification/evidence/50/`.

Since confirmed on real WebKit, which the Chrome-CDP legs above could not close because bfcache
behaviour is engine-specific: `docs/verification/evidence/50/webkit/` (iPhone 17 Pro, iOS 26.5). The
notice fires on a diverged closure and stays absent on an innocent restore whose write succeeds. That
second leg is the one that matters here — it is what distinguishes this decision from a notice that
renders unconditionally. Both legs assert `pageshow.persisted`, because a page WebKit declines to cache
produces no notice for a reason that has nothing to do with this guard.

**The fact that would reopen this:** a provably safe automatic merge of the two diverged states —
append-only, disjoint fields — would make adopt-and-replay viable and could keep the round playable.
It does not exist today: the checkpoint is a single slot
([ADR-0010](0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md)).
