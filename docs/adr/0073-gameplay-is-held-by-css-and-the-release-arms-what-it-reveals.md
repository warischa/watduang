# ADR-0073 — gameplay is held by CSS, and the release arms what it reveals

Date: 2026-10-20 · Status: accepted (owner-approved DoD amendment on gh#269, 2026-10-20) · Owner decision
(mechanism) + fork verdicts (implementation) · Extends: [ADR-0072](0072-rendering-holds-while-the-player-screen-is-open.md) ·
Relates: [ADR-0057](0057-closing-a-modal-is-a-reveal.md), [ADR-0059](0059-the-arm-gate-decides-from-the-browsers-input-clock.md)

## Context

ADR-0072 gave the shared player screen a render hold (`data-render-hold` on the document element), but
the hold suspended rendering only — gameplay under the screen stayed in the DOM, visible and tappable,
and a reveal made by a stylesheet alone was invisible to the pre-open sampler (gh#269). The 2026-10-18
design for direction (b) proposed per-route holds plus a static grader of route CSS overrides.

## Decision

- **One CSS rule holds every gameplay root:** `html:not([data-render-hold='free'])
  [data-first-screen-root="gameplay"]` → hidden, opacity 0, pointer-events none, no transition or
  animation. Held before any script runs; released only by the controller's existing setter. No `inert`.
- **Each route declares its first-screen roots** in its own game entry (`firstScreenRoots`, a typed
  field required when `playRoute` is set) with roles gameplay · container · ps-mount · pre-open · chrome.
  Only gameplay roots are marked in `markup.html`. one-bomb `#menuOverlay` and croc-bite
  `#screen-setup` are pre-open (owner ruling): their existing script release stands.
- **Two instruments, split by who owns the set.** `first-screen-roots-check` grades the markup-owned
  half (declared roots marked, undeclared top-level elements fail closed, mount containment). The
  cascade and the real mount root are browser-owned, so the `player-screen-face` browser leg reads them:
  every declared root held while the screen is open, and the element carrying `ps` is the declared mount
  outside every gameplay root. Static CSS grading and parsing route scripts were rejected — parser- and
  browser-owned sets never converge (gh#267, gh#270; REFUTE round 1 here).
- **The release is a reveal and arms its region (ADR-0057)** at the later of the release and the
  handover settling: a late release (a roster write still pending) is armed, and a control a route
  disables in its own — possibly async — `onStart` is never handed back. A bare microtask was rejected
  (REFUTE round 2: it races an async `onStart`); a capture-phase input swallow was rejected (outside the
  arm-gate fleet, and a release has no input stamp for ADR-0059's clock).

## Consequences

- A page whose script dies before the screen mounts now shows hidden gameplay instead of dead gameplay;
  the same pages were unplayable before. Traced 2026-10-20: no normal path of 8 × 14 routes stays held.
- Stated ceilings: a `display:contents` root plus a child override; gameplay live during an `await`
  that spans a late release; a never-settling `onStart` leaves the late-release arm dead.
- Flip-fact: a route that must show gameplay before handover (a pre-open screen that is gameplay)
  needs a new role, not an exemption.
