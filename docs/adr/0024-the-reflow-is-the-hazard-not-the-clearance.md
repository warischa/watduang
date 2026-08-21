# ADR-0024 — The reflow is the hazard, not the clearance

Date: 2026-08-21 · Status: accepted · Issues: [#55](https://github.com/warischa/watduang/issues/55) · [#39](https://github.com/warischa/watduang/issues/39)

## Context

gh#55 measured the `#clear-choice` dismissal at 320px and found no collision: tapping `ยกเลิก` did not
land a stage control under the finger, on either game tested. The guard originally specified for that
ticket was therefore a guard against a configuration that already passed.

An adversarial fork rejected it, and the site owner ruled on the reason rather than on the measurement.
`#clear-choice` was a plain block with `hidden`, so `[hidden] { display: none }` took it out of flow and
everything below it moved. The ~60px of horizontal clearance that made the measured case a miss is
emergent from Thai text width crossed with font metrics — the same kind of unowned set ADR-0014 already
declined to measure once. It is owned by nobody, it is not asserted anywhere, and it says nothing about
games whose stage controls have not been written yet.

So the hazard is not "how much clearance is there". The hazard is that dismissing the question **moves
things at all**. Remove the movement and the whole family closes, including its unwritten members.

## Decision

**`#clear-choice` is a `<dialog>`, raised with `showModal()`, and it keeps its `hidden` attribute.**

`#leave-confirm` in the same file is already this shape (ADR-0015), so this follows a proven local
pattern rather than inventing one. It differs from `#leave-confirm` in exactly one respect, and that
difference is the point:

**`#leave-confirm` fails OPEN. `#clear-choice` fails SAFE.** `#leave-confirm` returns early when
`showModal` is unavailable and lets the click through, because eating a navigation click with no way to
ask is worse than allowing it. `#clear-choice` guards a destructive action — the group and every round
in the session slot — so a browser that cannot be asked must never be cleared. Copying leave-confirm's
early return onto this path is a silent data-loss path, not a degraded guard.

## What this rests on

Three things surfaced while building it. Each was measured, and each changed the implementation.

**1. The acceptance invariant as first stated does not discriminate.** "`stageBefore` and `stageAfter`
rects for the live `#stage` control must be identical" is true of the **pre-fix** build too — verified by
building `HEAD` in a separate worktree and running the same probe against it. `#clear-choice` renders
*below* `#stage`, so nothing the stage owns was ever downstream of the reflow; and the probe's two
snapshots straddle the whole open-and-dismiss cycle, which returns every moved element to where it
started. Right and wrong agree on that observable, so it measures nothing.

The discriminating observable is the set that *is* downstream: every interactive element in the
document, sampled three times (before open, while open, after dismissal). Pre-fix, opening the question
moved 7 elements — the live stage control and six page-chrome links — down by 100px on timebomb and
122px on siamsi, and dismissing moved all 7 back up by the same amount. Post-fix, the moved set is empty
in both directions on both games; the only rects that change are the dialog's own two buttons, between
"not rendered" and their fixed position.

**2. Dropping `hidden` alone is not a fallback.** The first implementation gated only the `showModal()`
call and let the `hidden = false` line carry the no-dialog browser. Driven for real — `showModal` and
`close` deleted from `HTMLDialogElement.prototype` before the island ran — the question reported
`hidden: false` with **zero client rects** and focus on `<body>`, and Clear group became a control that
visibly did nothing. `dialog:not([open]) { display: none }` comes from the UA sheet and outlives any
missing method, so a UA that styles `<dialog>` at all still hides it. The fallback therefore sets
`[open]` by hand. That renders it in both populations: out of flow where the UA knows `<dialog>`, and as
the in-flow block this shipped as before gh#55 where it does not. Reflowing is an acceptable fallback;
unanswerable is not.

**3. ESC and `ยกเลิก` were not the same dismissal.** They were already equal on the destructive axis —
nothing is cleared until `#clear-confirm` is pressed — but not on the other two. ESC left the `hidden`
attribute behind, so the element's two closed states drifted apart; and the UA restores focus to
whatever was focused when `showModal()` ran, which is `<body>` when a tap opened the question (a tap does
not focus the button it hits on iOS). Measured: `activeElement` was `BODY` after a real Escape and
`clear-group` after the button. Both side effects now live on the dialog's own `close` event, which is
ADR-0015's rule (c) shape applied to the second dialog, and ESC is now byte-for-byte the same outcome.

**`ยกเลิก` still takes focus, and that had to be re-proven, not inherited.** `showModal()` autofocuses
the first focusable descendant, which in DOM order is the destructive button. The explicit
`clearCancelBtn.focus()` runs in the same synchronous task and takes it back — measured `activeElement`
`clear-cancel` with text `ยกเลิก` on both games, in both the modal and the no-`showModal` path.

## Consequences

- `#clear-choice` joins `scripts/leave-confirm-check.mjs` as condition (e), and joins condition (a)'s
  display-gating set. No new script and no new CI step — the existing "Leave-confirm stays inert while
  closed" step already runs `--selftest` first. Five known-bad fixtures, each calibrated both ways.
- Condition (c) is now bound to `leaveDlg` by name. Matching on the event name alone graded whichever
  `close` listener came first in source, whatever element it belonged to; with two dialogs in the file
  that verdict tracks line order rather than the element under test. The un-narrowed pattern fails the
  known-good fixture, which is what pins the narrowing.
- **Ceiling, disclosed:** this repo adds no CSS for `#clear-choice`, so its open box is wherever the UA
  centres it. A tap on `ยกเลิก` therefore lands where a stage control may already have been sitting,
  behind the backdrop. That is a different class from the one removed — the control is static and
  visible before the tap rather than arriving under a finger already descending — and it measured 0
  collisions across 98 grid points on both games at 320×568, with the probe's positive control firing
  (72 and 78 collisions) on the same run. It is not zero by construction. If a future game puts a live
  control at the viewport centre, anchor the dialog the way `#leave-confirm[open].at-top/.at-bottom` is
  anchored in `src/styles/tokens.css`, and extend condition (b)'s clearance budget to cover it.
