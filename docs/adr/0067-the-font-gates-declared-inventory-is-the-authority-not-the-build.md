# ADR-0067 — the font gate's declared inventory is the authority, not what the build happens to ship

Status: accepted 2026-09-14 · supersedes nothing · relates to ADR-0051, gh#202, gh#237

## Context

`scripts/font-coverage-check.mjs` proves the shipped Thai subset covers every reachable codepoint.
It carried an escape: `main()` printed a `SKIP:` line and returned 0 as soon as the shipped-font
corpus was empty, and it reached that return before the inventory was ever checked. Deleting all
four expected faces therefore made the gate **greener**, not redder — the failure the gate exists to
catch was the one input that silenced it.

The owner ruled on 2026-09-14 that a vanished inventory must FAIL, and that this is distinct from a
build that legitimately self-hosts nothing, which must stay green.

The hard part is that both states are identical on disk: zero font files under `dist/`. The
mechanism has to take its signal from somewhere other than the shipped-font count.

## Decision

**The project's declared inventory is the sole authority.** `EXPECTED_STEMS`, crossed with the two
extensions the file already pairs, is the set. The `SKIP` path survives only when the declared
inventory AND the shipped corpus are both empty; a non-empty declared inventory with zero shipped
fonts is the vanished-inventory case and reds, naming every missing member.

An empty declaration is a **source-level** statement — `EXPECTED_STEMS = []` — and is deliberately
not expressible through any command-line argument.

**Ownership:** the set is owned by the project's maintainers, in source. Partition key: the exact
basename, as (stem, extension). Expected members classify present or missing; shipped members
classify approved or unapproved.

## Alternatives rejected

**Derive the signal from the build's CSS** — red when an `@font-face` names a `src: url()` that is
not shipped, green when the build declares no self-hosted face at all. Rejected on two grounds. It
loses the expectation in exactly the case this change exists to catch, because the CSS and the fonts
disappear together. And this build declares its faces **inline in the built HTML**, not in a
stylesheet, so a CSS-file scan already misses them today. CSS URL semantics are parser-owned, and a
set owned by a parser does not converge by patching.

**Both, with a cross-check** that the `@font-face` set agrees with `EXPECTED_STEMS`, to catch a face
renamed in CSS but not in the constant. Rejected: it inherits the CSS-derived half's ownership
problem without fixing the disappearance case.

## Consequences

- A legitimately font-free build needs a source edit to declare itself. This is intended: the
  declaration is the thing being trusted, so it should cost a reviewed change. Verified reachable —
  a gate whose only pass path nobody can exercise would be a different defect.
- The gate's own `--selftest` is decoupled from the production constant and uses a fixture
  inventory, so emptying `EXPECTED_STEMS` does not break calibration.
- `--expected` stays fixture-only and now refuses to express emptiness at all. Empty, `none`, and
  any value that filters to nothing are hard errors. A repeated `--expected` or `--dist` is refused
  rather than resolved by first-occurrence precedence — the old `indexOf` read only the first, so a
  second declaration was silently unvalidated and unused.

## Accepted boundary

This approach certifies **declared basenames, not CSS reachability**. A valid, shipped font moved
away from the URL that references it still passes. Closing that needs a separate resource-location
contract and was deliberately left out of scope.

## The fact that would flip this

One unchanged source revision having to produce both a font-hosting and a font-free build. Then a
single global constant is the wrong shape and a project-owned build-profile inventory replaces it.

## Calibration on record

Same sabotaged tree, one variable — a copy of `dist/` with all four font files deleted: the gate at
the pre-change commit exits **0** printing `SKIP:`; the gate after exits **1** naming all four
missing faces. A detector's green means nothing until the same instrument has gone red on an input
built to kill it.
