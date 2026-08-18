# ADR-0016 — A gate that classifies nothing converges where a spatial guard could not

Date: 2026-08-18 · Status: accepted · Supersedes nothing · Related:
[ADR-0014](0014-no-navigation-target-inside-the-stage.md) (narrows how its alternatives section is
read), [ADR-0015](0015-a-leave-confirm-guards-the-links-we-cannot-move.md) (same ownership test,
opposite move), [ADR-0010](0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md)
· Issues: gh#40, gh#41, gh#42

## Context

Every game swaps `#stage` inside a click handler, so the second contact of one physical double-tap
can land on a control that did not exist when the finger started moving. Two instances had harm with
no recovery: short-stick's draw screen could end the round for a player who never held the phone
(no checkpoint by design, `short-stick.ts:3-4`), and timebomb's idle screen could arm a live fuse
that nobody knew was running (`arm()` accepts any gesture).

The obvious fix — offset the next screen's controls below the previous screen's box — is the guard
ADR-0014:29-30 already measured and rejected: the bound is owned by Thai text length × roster size ×
the layout engine, and the same control's y swings 323→683px across rosters 2 to 8.

## Decision

`src/games/_arm-gate.ts`. Post-swap controls render natively `disabled`; a 400ms timer arms them;
any `pointerdown` inside `#stage` restarts the window. One shared module, so the two games cannot
drift apart. The leading underscore keeps it out of the game page's lazy-loader glob
(`src/pages/game/[id].astro:21-26` excludes `_*.ts`), as `_template.ts` does.

## Why this is not the guard ADR-0014 rejected

ADR-0014:31-34 also rejected a **spatial** guard, and that rejection reads at first glance as
covering this one. It does not, and the difference is the whole decision:

- The rejected guard had to **classify** a contact — stale or deliberate — which needs `event.detail`
  or timing, both browser-owned. Unowned set, never converges.
- This gate classifies nothing. It disables everything for a fixed window **we** choose. The set it
  bounds is "how long after a swap can a ghost contact arrive", answered by human double-tap
  physiology, not by the browser.
- ADR-0014's count-only objection — that it would eat siamsi's every-turn ส่งต่อ→จั่วดวง overlap —
  has no counterpart in these two games: on the paths gated here the phone is physically in transit
  between two people, so no legitimate sub-500ms follow-up tap exists. That is a claim about
  particular paths, not a universal — see "Known premise exceptions" below.
- ADR-0014's invariant is scoped to **navigation targets**. These harms are an in-stage draw and an
  in-stage fuse, not navigations.

Same ownership test as ADR-0015, opposite move: ADR-0015 inverted an unowned set to a set we own by
marking the provably-safe few. Here the set is made ours by refusing to discriminate at all.

## What this rests on

Assumption: no legitimate sub-500ms tap on a gated control, because the phone is in transit. It holds
per path, not everywhere; the paths where it is known to fail are listed under "Known premise
exceptions". It is a fact about how these games are played, not about the code, and it is the first thing a future
design breaks — a rapid-fire round or a hold-and-repeat control needs its real inter-tap gap measured
before reusing this. The assumption is written at `_arm-gate.ts:11`.

Second accepted ceiling: deferral is uncapped. A finger resting in the stage keeps controls disabled
indefinitely. Left uncapped deliberately — it fails closed and it is visible; a cap is the thing that
would let a ghost through.

## Consequences

- Worst failure is a swallowed early tap: the player taps again. Never a stolen action.
- Accessibility: controls are *created* disabled, never yanked from under a focused element. During
  the window the stage has no focusable children, so one Tab reaches page chrome, and the enable is
  unannounced. Bounded at 400ms and recoverable; accepted.
- Verified with real touch, not `.click()`: `scripts/arm-gate-probe.mjs`, calibrated red on a
  `dc55dd7` worktree that lacks the gate (8 sub-400ms cases steal a draw or arm a fuse) and green on
  the fixed tree. Evidence `docs/verification/evidence/40/`.
- Measured rather than assumed: a real touch on a `disabled` button still dispatches a `pointerdown`
  that bubbles to `#stage`, so the restart leg is real and not decorative.
- The remaining four games are gated under gh#42, two controls deliberately excluded. siamsi was
  judged first and its premise **holds**: ADR-0014:34's ส่งต่อ→จั่วดวง overlap is *spatial*, not
  temporal — `passToNext` advances the holder, so the post-swap screen names a different player and
  instructs the handoff, and the phone changes hands between those two taps.

## Known premise exceptions

The premise is per path. These are the paths where it is known **not** to hold, recorded so a later
reader neither "fixes" the omissions nor widens the gate onto them:

- **`daily-fortune`'s roster chips — not gated.** The again-button to chip hop is the same finger:
  the chips (built per roster name in the ask screen, each wired to `reveal(name)`) exist so one
  operator can tap through the roster. Gating them would swallow a deliberate tap in normal play.
- **`pick-loser`'s `#pl-pick` — not gated.** No handoff exists in the `#pl-again` to `#pl-pick`
  flow, so one hand taps both. Its harm is real and unrecoverable — `pickLoser` falls back to
  unseeded `Math.random`, so a redraw names a different person — but gating a control whose premise
  is false is exactly the trade this ADR refuses. Owner decision, 2026-08-18.
- **`love-match`'s pick chips — gated anyway, accepted cost.** The again-to-chip hop is one finger
  with no handoff — the same pattern that exempted `daily-fortune`'s chips above. The two games
  differ in how much it costs, not in whether the premise holds: a love-match chip tap mutates the
  row in place instead of swapping the stage, so the window delays only the first tap of a fresh
  pick, where gating daily-fortune's chips would delay one tap per roster member. The reasoning is
  recorded at the call site in `love-match.ts`.
- **First-draw controls — gated anyway, accepted cost.** Whoever taps start may be `players[0]`
  themselves (`siamsi` sets `holder = 0` when the round begins), so no transit precedes the first
  draw. `short-stick` already ships this same trade, and says so at its call site. The cost is one
  swallowed tap on a fails-closed control; the player taps again.

## The fact that would change this

Any legitimate sub-500ms tap appearing on a gated control. That kills the timing premise outright and
forces a two-phase interaction — an explicit confirm step on the destination screen — rather than a
window.
