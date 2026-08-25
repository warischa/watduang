# ADR-0038 — a ticket may name a dependency the project does not need

Status: accepted · 2026-08-25 · gh#83

## Context

gh#83 asks for the เซียมซี barrel to become shakeable, and words one of its acceptance criteria as
"the 3D library loads by dynamic import on this game's page only, and never enters the shared bundle".
The criterion presupposes a 3D library. Nothing else in the ticket requires one.

This repo ships four packages in total and treats that count as load-bearing —
`docs/agents/browser-verification.md` says outright that Playwright "is not installed and must not be
added". A game page ships under 10 KB of JavaScript, on a site whose entire pitch is that it opens
instantly while a group waits. The barrel is a 200×240 inline SVG.

## Decision

The shake is built with CSS 3D transforms — `perspective`, `transform-style: preserve-3d`,
`rotate3d()` — driven by `devicemotion`, on the SVG barrel already shipped. No dependency, no model
file, no binary.

The acceptance criterion is rewritten to its intent: **the shake code loads on this game's page only
and never enters the shared bundle.** The owner approved both the approach and the rewrite on
2026-08-25.

Rewriting an acceptance criterion is an owner decision, never an implementer's. What is written here
is that the criterion named a *mechanism* where it meant a *property*, and that the property is what
the project actually cares about.

## Why the property, not the mechanism

Every functional criterion in gh#83 holds without a library. Tap-only play is already pinned by a
test. Per-page loading is structural: the game page lazy-imports each game module, so bytes inside
`siamsi.ts` reach no other page — the isolation the criterion asks for is a property of the existing
loader, not of any library's import style. Permission prompts, opt-in, silent degrade, reduced motion
and sensor absence are all implementation concerns that a library would not have helped with.

A mesh and a texture would have been cost without surface at 200×240 — plus an entry in
`public/models/`, which is a publish surface (`docs/agents/assets.md`), on the same day a gate for
unreferenced files under `public/` was being built.

## Ownership

The CSS 3D path touches sets owned by browser vendors: CSS 3D support, `DeviceMotionEvent`, and iOS's
permission prompt. It touches them **only through feature detection that fails open to tap**. The
invariant "playable without shaking" is therefore empty by construction — there is no state in which
it can be violated — so it converges (ADR-0031).

A library would have added a set owned by the npm ecosystem: versions, advisories and transitive
churn, forever, for one screen.

## The prediction this ADR makes

An owner statement that the barrel must be a modeled asset, or a measured sub-parallax frame rate on a
real low-end Android under sensor-driven transforms, would reopen this. The cheap check is one phone
and one build — it has not been run.

## What this does NOT cover

The shake is a second activation path. `armAllButtons` gates taps only, so the sensor path needed its
own arming; nothing here says that arming is correct, only that it was required. Nor does it cover the
new tap surface the opt-in introduced on iOS: making the hint line a button adds a control to a screen
that previously had one, which is the hazard ADR-0020 names.
