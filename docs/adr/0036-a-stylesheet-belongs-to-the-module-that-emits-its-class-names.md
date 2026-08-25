# ADR-0036 — a stylesheet belongs to the module that emits its class names

Status: accepted · 2026-08-25 · gh#77-gh#81 · extends ADR-0033

## Context

gh#76 finished สุ่มคนโดน to the design canvas and, in doing so, put both halves of the pattern in one
place: the shared game-screen classes AND pick-loser's own prefixed classes went into the single
`<style is:global>` block at the bottom of `src/pages/game/[id].astro`. Its header called itself
"shared by every game that adopts the pattern".

Five more game visuals then had to be built. Following the shipped pattern literally means five
implementers writing into one file. That is not a style question — it is a concurrency question, and
it decides how the work can be cut at all.

## Decision

Each game gets `src/styles/games/<id>.css`, imported by the game page. The shared game-screen
vocabulary — `.stage-screen`, `.game-btn`, `.game-btn-primary`, `.game-btn-secondary` — stays declared
once in the page's own block and is never redeclared or overridden from a per-game sheet.

The rule the placement follows: **the module that emits a class name owns the stylesheet that defines
it.** A game module builds its DOM at runtime and assigns `.tb-*`, `.sm-*`, `.st-*`, `.df-*`, `.lm-*`;
those live with that game. The shell emits the shared classes; those live with the shell.

## Why not the alternatives

**One shared block, five writers.** Five parallel implementers writing adjacent hunks of one file
either corrupt each other or serialize. Worktrees do not fix it: integration becomes conflict
resolution by hand, and each tree verifies against a CSS environment that is not the merged one.

**Sequencing the five.** Costs roughly five times the wall clock, and each implementer copies the
previous one's idiom rather than reading its own artboard.

**The orchestrator writing all five CSS blocks itself.** Splits each game's DOM and its CSS across two
authors, so selectors get written against markup that does not exist yet. ADR-0033's remedy is that
design *values* are handed over exactly, not that one author writes all the CSS.

## The cost this buys, and the guard on it

Astro bundles a bare CSS import page-globally, and one page component renders every game URL. So
**every game page loads every game's stylesheet.** An unprefixed `.card` or `.meter` in one sheet
restyles a sibling game while that game's own tests stay green — a defect no per-game verify can see,
because it is not in that game's file set.

The guard is a per-game prefix on every selector, checked at integration across all five sheets at
once: no selector shared between two games, none touching shared vocabulary. That check belongs to
whoever holds all the sheets, never to an individual brief.

## Ownership

The per-game class set enumerates one game module's runtime DOM vocabulary. The module emits it, the
stylesheet follows it, and nothing under `design/` enumerates it at all — the artboards carry zero
class names, only inline styles. The set is ours and it is small, so it converges.

The shared subset is shell vocabulary. Commonly owned means owned by nobody among five concurrent
writers, which is why it is frozen for the duration of a fan-out rather than merely discouraged.

## The prediction this ADR makes

If per-game CSS ever stops being page-global — a per-route stylesheet, or a bundler that splits by
import graph — the prefix mandate becomes belt-and-braces rather than the only thing standing between
two games. Re-open then; the placement rule survives either way.

## What this does NOT cover

Nothing here prevents a per-game sheet from reaching outside its own subtree with a descendant
selector, or from winning a specificity fight with shared vocabulary it never names. The prefix audit
sees class names, not reach.
