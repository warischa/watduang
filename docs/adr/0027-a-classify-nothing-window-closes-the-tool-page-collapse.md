# ADR-0027 — A classify-nothing window closes the tool-page collapse hazard

Date: 2026-08-22 · Status: accepted · Supersedes nothing · Related:
[ADR-0015](0015-a-leave-confirm-guards-the-links-we-cannot-move.md) (tool-page carve-out, not
reversed), [ADR-0016](0016-a-gate-that-classifies-nothing-converges.md) (same shape, reused),
[ADR-0024](0024-the-reflow-is-the-hazard-not-the-clearance.md) (the geometric fix this one replaces) ·
Issues: gh#61, #35, #37, #39

## Context

Collapsing PlayerSetup's panel after the CTA on a tool page drops a game link under the finger:
measured 40 of 75 grid points colliding at 320px on `/tool/team/`, and a real double-tap navigated to
`/game/timebomb/` on the second contact. **ADR-0015's tool-page carve-out stands** — no leave-confirm
was added to tool pages, and it was not reconsidered here. A leave-confirm was rejected for this class:
it guards the consequence of the tap, not the geometry, so gh#61's acceptance criterion (the page does
not navigate) would have stayed red and could only have been passed by weakening the check.

A geometric fix shipped first: hold the panel's layout box with `visibility: hidden`, only its content
hidden. It worked — 0 of 75 — and it left 288–480px of permanent blank space above the tool result at
320px. The site owner ruled that unacceptable and it was reverted.

## Decision

**A capture-phase, document-wide swallower of `click` and `pointerdown`, for one `ARM_DELAY_MS` window
after the collapse.** It lives in `requestStart` (`src/shell/PlayerSetup.astro`), gated on
`gameId === undefined`, installed after the panel collapses. Every contact restarts the window; it is
removed on release. It imports `ARM_DELAY_MS` from `src/games/_arm-gate.ts` rather than copying it.

## Why — the ownership answer

Three further shapes were rejected, each on the same test ADR-0015 and ADR-0016 already apply: does
this repo own the set the mechanism enumerates?

- **Native scroll anchoring** (`overflow-anchor`) — browser-owned, suppressed at scroll-top, recent in
  Safari.
- **Move `GameNav` above the fold on tool pages** — hands the landing-zone set to whoever next edits
  page chrome, and it sits below deliberately per issue #35.
- **Release the held box on `touchend`** — a settle window in event clothes, keyed on user-owned tap
  cadence, and it never releases at all for a mouse or keyboard user.

The shape shipped is ADR-0016's, reused rather than reinvented: it classifies nothing. It does not try
to tell a stale contact from a deliberate one — that needs browser-owned timing signals and never
converges. It refuses every contact for a fixed window this repo already claimed, via double-tap
physiology, for the game-stage gate. The swallowed set needs no enumeration, and the trigger is a
single collapse site in `requestStart`. ADR-0015's own rejection of suppression windows does not apply
here — that rejection concerned a window keyed on ad-iframe resizes on Google's schedule; this one keys
on one mutation this repo performs.

The gate is `gameId === undefined`, not `clearsSession === false`, deliberately: it is the same bit the
leave-confirm listener at the foot of this file already reads. A page with a game has that dialog in
front of every link for as long as `root.hidden` is true; a page without one gets this window instead.
No page is in neither set, and none in both, so a future tool page that omits `gameId` still lands in
one of the two guards rather than falling through unguarded.

This does **not** extend to `clearsSession`, which defaults to `true`. A new tool page copied from
`team.astro` without that prop would render a fully armed clear button on a page ADR-0004 forbids to
touch the session. That polarity predates this decision and is tracked separately — do not read the
paragraph above as covering it.

## What was considered and decided, not left open

The owner was asked whether the panel could simply never hide on tool pages — a hazard empty by
construction, and stronger on ownership than a window, since nothing would need to reason about timing
at all. The owner chose the window, to keep the collapse-then-reveal flow tool pages already use.
Record that this was asked and answered, so it is not re-litigated.

## Consequences

- Fails **closed**: the worst case is one too-fast tap doing nothing and the player tapping again,
  never a stolen navigation.
- Evidence: `docs/verification/evidence/61/`, calibrated three ways — the pre-fix build navigates, the
  fixed build does not, and a tap after the window closes still acts normally.

## The fact that would change this

Any legitimate sub-400ms tap on a tool page's own controls, arriving immediately after the collapse.
That would force a scoped or two-phase guard — naming the controls it must not swallow — rather than a
whole-document window.
