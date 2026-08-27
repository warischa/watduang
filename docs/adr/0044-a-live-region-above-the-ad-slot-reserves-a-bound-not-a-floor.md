# ADR-0044 — a live region above the ad slot reserves a bound, not a floor

Status: accepted, 2026-08-27 · supersedes nothing · extends ADR-0024 (the reflow is the hazard, not the clearance) · issue gh#120

## Context

ADR-0024 established that the *reflow* is the hazard: the ad slot must not move once a page has
rendered. gh#114 and gh#120 traced one mechanism for that — a region that collapses when empty and
grows when the list renders, while the ad is a following sibling. The fix for that mechanism was a
fixed height with internal scroll, and `max-height` was foreclosed because it permits the collapse.

That reasoning was correct and incomplete. It bounded the *list* regions and left a second mechanism
untouched: an **announced live region** (`role="status"` / `aria-live`) whose text a script rewrites,
reserving its space with `min-height`.

`min-height` is a floor, not a bound. It constrains the small direction only. When the initial copy
wraps to more lines than the floor allows, the element is taller than its reserve; when the script
replaces that copy with something shorter, the element drops **to** the floor. Everything below it
moves up, the ad slot included.

Two facts made this invisible for months:

1. Whether the initial copy exceeds the floor depends on the resolved font's line metrics.
2. This site ships **no fonts**. It declares `Noto Sans Thai`, `Sarabun` and `Mitr`, self-hosts none
   of them, and applies the stack to individual elements rather than at the document root — so text
   heights belong to the visitor's operating system, and `body` resolves to the UA default.

On the developer's macOS the initial three lines fit *inside* the floor, so both states sat on it and
the measured delta was 0. On the CI runner the same three lines exceeded it, and the delta was −9px.
Every local verification passed for that reason alone, including the run that closed gh#120's first
round.

The rule itself was not unknown. It existed as prose, in comments on the two pages that had already
been bitten — "A BOUND, not a floor", and a warning that a future `min-height` would bring the reflow
straight back. Prose does not fail a build. The two pages that never received the fix kept the bug,
and one of them carried it on two elements at once.

## Decision

An element that is announced (`role="status"` or `aria-live`) and sits above an `.ad-slot` **must
reserve its space as a bound, never as a floor.**

The shape, following the precedent already set on the pages that were fixed first:

- an explicit `line-height`, so a height expressed in `em` is an exact line count on *any* font,
- a fixed `height`,
- the element's own `overflow-y`,
- `min-height` and `min-block-size` forbidden on such elements, and `max-height` still foreclosed.

This is enforced by a gate rather than a comment. Its input set is one we own — the tool pages and
their scoped styles — so it converges, and a new page cannot inherit the bug silently.

## Consequences

**Accepted.** A bound can clip text that exceeds it; the element's own `overflow-y` handles that, and
the reserve is chosen from a real browser measurement at the narrow breakpoint rather than calculated.
Any changed height is a design value and is recorded as a deliberate ADR-0033 departure with the
measurement behind it.

**Disclosed ceiling.** The gate is page-scoped. A `min-height` arriving from a global stylesheet or a
shared component would pass it. That is a narrower hole than the one this closes, but it is the same
shape — a rule enforced over part of its set — and it is tracked rather than assumed away.

**Not decided here.** Whether to self-host the Thai font is left open. Doing so would make the glyph
metrics ours and is the only option that converges across visitor platforms; it also adds a binary
that ships on presence alone, page weight, and a CSP consideration. That trade-off is the owner's and
lives on gh#120.

**What this ADR does not claim.** It does not claim the ad slot is now stable on every device. It
claims the two known height-varying mechanisms above the slot are bounded, and that the invariant is
now checked on two platforms instead of one. Visitors are on Android and iOS, neither of them either
platform.

## The fact that would change this

A reserve expressed as a bound that still varies — i.e. an announced region whose height changes
across the first render *without* any `min-height` present. That would mean the bound itself is
font-dependent in a way `line-height` does not pin, and the reserve would have to stop being
expressed in `em` at all.

Secondarily: if the Thai font is ever self-hosted, the metrics become ours and the *floor* mechanism
stops being platform-variable — it would still be wrong, but it would fail identically everywhere,
and it would then be catchable locally.
