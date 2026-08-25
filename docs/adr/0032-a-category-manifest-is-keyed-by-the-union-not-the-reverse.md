# ADR-0032 — a category manifest is keyed by the union, not the reverse

Status: accepted · 2026-08-25 · gh#74 · extends ADR-0026, ADR-0031

## Context

gh#74 needed a category manifest: for every category id `GameModule` allows, a label, a when-to-use
line, intro copy, and an accent name. The obvious shape is to make the manifest the single source and
derive the type from it:

```ts
export const categories = { fortune: {...}, party: {...} } as const;
export type Category = keyof typeof categories;
```

One source, no possible drift. This is what a future reader will reach for, which is why the reason
it was rejected has to be written down.

## Decision

The union stays hand-written in `src/games/types.ts`. The manifest is typed
`Record<Category, CategoryMeta>` in `src/games/categories.ts`.

Parity is still enforced in both directions and still at compile time: a key present in only one of
the two is a `tsc` error, not a runtime surprise.

## Why not derive

`scripts/validate-games.mjs` runs as npm `prebuild` and imports this module chain with **plain node**,
not through Vite. `keyof typeof` forces `types.ts` to become a value import rather than a type-only
one, and node's ESM resolver cannot guess a missing `.ts` extension. The derived version typechecks,
passes `astro check`, and breaks the build gate that is the whole point of the ticket — in a script
that runs before the build, so the failure surfaces far from its cause.

`Record<Category, ...>` buys the same guarantee with none of that exposure.

## Ownership — why both gates converge

Two gates were added to `validate-games.mjs`:

- a game declaring a category with no manifest entry fails
- a manifest key claimed by no game fails

Per ADR-0031, the question is which set each gate enumerates and who owns it. Gate one enumerates the
categories declared by this repo's game modules; gate two enumerates the keys of this repo's category
manifest. Both sets are ours, both are statically imported, neither is owned by a library, a parser, or
an outside party. **Both converge** — unlike the hand-rolled half of ADR-0031, these can be written as
enumerations and be done.

The condition on that: they must read the two static artifacts and never a glob. A glob enumerates
what exists, so it cannot fail on something that is gone.

An empty manifest fails on its own (ADR-0019) — with zero keys, gate two has nothing to iterate and
would pass vacuously while the site built zero category pages green.

## The prediction this ADR makes

If `validate-games.mjs` ever loses its direct node import of the `.ts` chain, this decision's whole
reason evaporates and the gates should move into `getStaticPaths`. Ownership still converges there;
only the gate's home flips. Re-open this ADR at that point rather than keeping the shape out of habit.

## What this does NOT cover

It says nothing about whether a value the manifest declares is actually *used* correctly downstream.
It was not meant to, and it did not: the first implementation interpolated the category slug where it
needed `meta.accent`, emitting `var(--accent-fortune)` — a token defined nowhere — and every gate in
this repo stayed green. See gh#85.
