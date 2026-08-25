# ADR-0035 — a reference set is bounded by what paints, not by the one attribute we thought of

Date: 2026-08-25 · Status: accepted · Relates: ADR-0019, ADR-0020, ADR-0026, gh#85

## Context

gh#85 added `scripts/dangling-css-var-check.mjs`: a post-build gate that fails when a page in
`dist/` references a CSS custom property nothing on that page defines. It exists because gh#74
shipped `var(--accent-fortune)` — a property defined nowhere — and `tsc`, the build, 188 tests and
every other gate were green while both category pages painted their accent as `currentColor`.

The gate went in green and calibrated. The pre-merge adversarial pass then found four ways it was
wrong, one of which mattered: it collected references from `<style>` blocks and `style=` attributes
only. SVG presentation attributes also paint through `var()` — `stroke="var(--color-line-strong)"`
resolves in both Chrome and WebKit — and this very diff ships that shape in `GameLayout.astro`'s nav
arrow, on all six built game pages. A future token rename would leave the arrow unpainted with the
gate reporting green: precisely the defect class gh#85 was written to stop, inside the gate built to
stop it.

Two of the other three findings were the same shape one level down. `\bstyle=` also matched
`data-style=`, so a `data-style="--x:red"` attribute injected a false *definition* that could mask a
real dangling reference. And `var(` was matched case-sensitively, while `VAR(--x)` is valid CSS.
The fourth was a comment asserting `\b` blocked `data-style`, written in the same edit that made it
false — the ADR-0019 pattern again.

## Decision

**A gate's reference set is bounded by everything that can paint the value, not by the syntax we
first thought of. Where that set belongs to a spec rather than to this repo, the gate scans
everything and over-flags, instead of enumerating an allowlist.**

So the gate now collects references from **every attribute value**, not from an allowlist of
presentation attributes. The set of attributes that accept `var()` is owned by the SVG and CSS
specs — it grows without asking this repo — so an allowlist would need editing every time a spec
adds a member, and each miss is a silent false green. Scanning every attribute inverts that: the
failure mode becomes a false red, which names the page and the property and costs one edit to
resolve. This is ADR-0026's authorship rule applied to a set we cannot enumerate: mark the provably
safe and negate.

The definition set is the mirror image and stays **narrow**: only `<style>` blocks, `style=`
attributes, and repo-owned linked stylesheets. A definition can only come from those. Widening
definitions is the dangerous direction, because a spurious definition satisfies a real dangling
reference and turns the gate green — which is exactly what the `data-style` bug did.

**Asymmetry is the rule, and it is deliberate: widen references, narrow definitions.** A gate whose
green is trusted must fail toward noise, never toward silence.

The gate's green is also now scoped in its own header. It covers markup this repo ships. It does
**not** cover markup that only exists at runtime — a `var()` inside an `innerHTML` string, or a
property set via `element.style.setProperty()` — because those live in `.ts` and never appear in
`dist/`. `src/games/pick-loser.ts`'s `BURST_SVG` is one. That set is guarded at authorship per
ADR-0026, and claiming otherwise in the header would have been the same unearned sentence this gate
exists to catch.

## Alternatives rejected

**An allowlist of SVG presentation attributes** (`fill`, `stroke`, `stop-color`, …). Rejected: the
set is spec-owned, so the allowlist never converges, and every omission is a false green.

**Leave references at `style=` only and accept the hole.** Rejected: the hole is occupied. This diff
ships six pages that paint through a presentation attribute.

## Calibration standard this set

Each of the three code fixes was reverted **in isolation** in a scratch copy, and each turned its own
new fixture red and only its own — 3 for 3. A fixture that has never been observed failing on the
unfixed detector is not calibration, and a single revert of all three at once proves only the first
assertion the runner reaches.

## The fact that would change this

Scanning every attribute producing a false red on markup that is genuinely fine and cannot be
rewritten. Then the reference set needs a documented exclusion for that construct — one exclusion,
named, with the reason — rather than a retreat to an allowlist.
