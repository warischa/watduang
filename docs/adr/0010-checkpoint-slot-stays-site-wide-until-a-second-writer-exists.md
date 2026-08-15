# ADR-0010 — The checkpoint slot stays site-wide until a second writer exists

Date: 2026-08-15 · Status: accepted · Issue: [#24](https://github.com/warischa/watduang/issues/24)

## Context

The shell keeps one checkpoint slot for the whole site. A white-box audit this session traced every
read and every write of it: 4 writes (`siamsi.ts:267` `save()`, `siamsi.ts:304` clear-on-round-over,
`PlayerSetup.astro:141` discard-then-start, `session.ts:68` `clear()`), 2 preserving rewrites
(`session.ts:51`, `:57`), and 3 reads (`siamsi.ts:318`, `PlayerSetup.astro:131`, `:296`).

Result: **every guard is read-side.** `resumeFrom` checks the game label (`siamsi.ts:121`) and
`planStart` checks `checkpoint?.game === gameId` (`player-select.ts:47`). The write side has none —
`saveCheckpoint` (`session.ts:59-62`) never compares `cp.game` to what is already in the slot.

Unreachable today: `manifest.ts:10` is `[timebomb, siamsi]` and `timebomb.ts` has zero checkpoint
references. Siamsi is the sole writer. But `_template.ts`, the scaffold game 3 is copied from,
mentioned the slot nowhere — so game 3 would have destroyed a live เซียมซี round on its first save,
before any read-side guard could run.

## Decision

**Keep one site-wide slot. Do not add a write-side ownership guard. Do not move to per-game keying.**

A write-side guard cannot work. All four semantics fail:

| Semantic | Why it fails |
|---|---|
| refuse silently | breaks game B's own refresh-resume — the feature [#20](https://github.com/warischa/watduang/issues/20) ships |
| throw | crashes B mid-round; contradicts `session.ts:37-39`, which deliberately swallows storage failures |
| overwrite + warn | warns nobody, still destroys A |
| explicit ownership | the only defensible shared-slot option, but needs a new prompt and new approved Thai copy |

Guarding at start-time only **detects**: extending `planStart` to any-game cannot honour its own
approved answer, because `กลับไปเล่นรอบที่ค้าง` on game B's page would mean navigating away to game A
— a third action ADR-0008 never approved.

The engineering answer that does work is to remove the collision rather than police it: key the slot
by `cp.game` (`checkpoints: Record<string, Checkpoint>`), scope `loadSession(gameId?)`. Shape is
~50 lines across 7 files, with **zero** lines in `siamsi.ts` and `player-select.ts` — which is the
evidence it sits at the chokepoint. It was designed in full and deliberately not built.

## Why defer rather than build

1. **The question is product-level, not technical.** Per-game slots exist to let two games hold paused
   rounds at once. วัดดวง is one phone passed around one group. Whether the site should ever hold two
   live rounds is a product call, and building the mechanism answers it by accident.
2. **The failure needs a game that does not exist.** Game 3 is the trigger. When it is designed the
   question has a real answer instead of a speculative one, and the design above is recorded here and
   still costs ~50 lines then.
3. **ADR-0008's flip-fact has not fired.** Its stated condition (`ADR-0008:106-112`) is *a second game
   shipping checkpoints, or #24 resolving to per-game slots*. Siamsi remains the sole writer and this
   ADR declines per-game slots, so `planClear`'s deliberately game-agnostic predicate stays correct
   rather than merely convenient. Deferring is consistent with ADR-0008, not an override of it.

## Interim mitigation

`_template.ts` now states that the slot is site-wide, that `saveCheckpoint` performs no ownership
check, that `saveCheckpoint(null)` / `clear()` empties it for every game, and that `saveCheckpoint`
only **updates** an existing session record — never creates one, so a save before `setPlayers()`
silently no-ops (see ADR-0008 and the `write(create=false)` guard shipped in `65d3d3c`).

## The fact that would change this

A second checkpoint-writing game entering `manifest.ts`. At that moment the collision is reachable,
`ADR-0008:106-112` fires, and per-game keying should be built as designed above — including
`planClear`'s condition and the precision of `รอบที่ค้าง` in the clear warning, which may by then mean
more than one round is at stake.

Also open, found by the same design pass and **not** fixed: game B's start still clobbers shared
`session.players` via `[id].astro:52`.

## Related

- [#24](https://github.com/warischa/watduang/issues/24) — the ticket this answers
- ADR-0008 — starting a round never resumes or discards one silently
- ADR-0009 — a DoD box whose proof set we do not own is mis-scoped
