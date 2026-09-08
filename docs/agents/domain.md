# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** No monorepo signals in this repo — one `CONTEXT.md` + `docs/adr/` at the root.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

Neither exists yet in this repo — that is expected and fine.

## Where decisions currently live

`docs/adr/` exists and is the durable home for decisions — read the ADRs touching the area you are about to work in, and count them from disk rather than from any number in prose. GitHub Issues carry spec- and product-level reasoning: the wayfinder map is [#1](https://github.com/warischa/watduang/issues/1). Read the map's **Decisions so far** section (`gh issue view 1`) before proposing anything that touches stack, SEO, monetisation, or content rules — several decisions there were reversed once already, and the map records which way they landed.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## A number in an ADR carries the command that produced it

Every count, byte figure or measurement written into an ADR names the command that produced it —
beside the number, in the ADR. Not "measured on such a date": the actual command.

**Why, from the case that forced the rule.** ADR-0062's first draft stated how many files cited a
doc's traps by number and how many referenced its path. Both figures came from a grep filtered to
`.md` and `.mjs`, and both were written down as repo-wide totals. Across all tracked files the answers
differ — and which one is even *correct* depends on the question being asked: a same-line citation, a
whole-file mention, and a tracked-path reference are three different counts of three different things.
**The counting method is itself a claim, and it is the half that gets skipped.**

Two consequences. A figure with no command beside it is unverified the next time anyone reads the ADR,
however confident the sentence sounds. And a figure you cannot reproduce is a finding, not a rounding
error — correct the number or correct the command, never leave both standing.

ADR-0062 carries the shape to copy: a table, one row per count, the command in its own column. This
does not apply to a value the ADR itself *decides* (a chosen threshold, a declared budget) — only to
a figure describing the tree, which is the kind that rots.
