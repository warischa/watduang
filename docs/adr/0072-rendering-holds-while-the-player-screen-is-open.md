# ADR-0072 — rendering holds while the player screen is open

Date: 2026-10-17 · Status: accepted (owner popups 2026-10-17, recorded on gh#272) · Owner decision ·
Relates: [ADR-0071](0071-one-shared-player-setup-screen-for-every-party-game.md), [ADR-0051](0051-canvas-2d-is-the-default-and-a-play-route-never-blanks-the-page.md), [ADR-0057](0057-closing-a-modal-is-a-reveal.md), [ADR-0059](0059-the-arm-gate-decides-from-the-browsers-input-clock.md)

## Context

On a device where a 3D play route renders through software compositing, every frame blocks the main
thread. Each Web Lock grant behind the shared roster (`roster.ts` `withLock`: a legacy migration on
open, and every roster save) waited for a gap between frames. A stand-in measured 14–19 s on
2026-10-16 (gh#272 Evidence). The owner ruled that latency must be bounded, with a budget of ≤ 1 s.

## Decision

- **The shared player screen owns a render hold.** It is held from before migration starts, through
  every pending or open state (the first open and every mid-round reopen), and until any roster save
  has settled and the screen has closed or handed over. It is exposed as `isRenderHeld` /
  `onRenderHold` and as `data-render-hold` on the document element. Handover is acknowledged
  (`data-player-screen-handover`) only after the route's `onStart` succeeds.
- **A frozen or blank background is accepted** while the screen is open. croc-bite defers its first 3D
  boot to handover.
- **Scope:** suspension adapters on the WebGL routes (croc-bite, one-bomb, pinocchio-luck). Every party
  play route declares an adapter, or `none` with a reason, in the one registry
  `src/play/_render-suspension.json`, along with its permitted WebGL extensions.
  `render-suspension-check` gates the declarations.
- **Locks stay.** `withLock` serialization is unchanged. A lock-side fast path was rejected, because it
  loses cross-tab atomicity.
- **Detection is runtime, against a set the project owns.** The CI WebGL lane hooks `getContext`,
  `getExtension`, WebGPU and `Worker` before page script on every party route. A route that creates a
  WebGL context while declared `none`, requests an extension its registry entry does not list, or draws
  while the hold reads `held` fails by name. Syntax detection and method-list patching were both
  rejected in review, because they enumerate browser-owned sets and never converge.

## Consequences

- A new party play route needs a registry entry, or the gate reds.
- A new extension, worker or WebGPU use on a party route reds the WebGL lane until the registry admits it.
- The lane cannot see a context or extension requested only later in a round, past where the handover
  walk stops, nor one in another document.
- **Prediction:** this hold brings P1 (navigation to an interactive player screen, with a migration
  seeded) under 1 s on the stand-in.
  **Outcome 2026-10-17: REFUTED.** Medians went 13.1 s → 1.26 s in separate runs, and 25.5 s → 12.7 s
  in interleaved runs under load. Neither met the budget. What remains is a 3–5 s lock wait during
  page-startup main-thread work (inferred, untraced). That is #276. Evidence:
  `docs/verification/evidence/gh272-2026-10-17/`.
