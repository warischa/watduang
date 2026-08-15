# ADR-0010 — The checkpoint slot stays site-wide until a second writer exists

Date: 2026-08-15 · Status: accepted · Issue: [#24](https://github.com/warischa/watduang/issues/24)

## Context

The shell keeps one checkpoint slot for the whole site. A white-box audit this session traced every
read and every write of it: 4 writes (`siamsi.ts:281` `save()`, `siamsi.ts:320` clear-on-round-over,
`PlayerSetup.astro:141` discard-then-start, `session.ts:131` `clear()`), 2 preserving rewrites
(`session.ts:117` `setPlayers`, `:121` `markPlayed`), and 3 reads (`siamsi.ts:335`,
`PlayerSetup.astro:131`, `:296`). Line references re-verified against the tree at S2026-08-15#2 —
the originals were written before `65d3d3c` reshaped `siamsi.ts` and had drifted.

Result: **every guard is read-side.** `resumeFrom` checks the game label (`siamsi.ts:125`) and
`planStart` checks `checkpoint?.game === gameId` (`player-select.ts:47`). The write side has none —
`saveCheckpoint` (`session.ts:127-129`) never compares `cp.game` to what is already in the slot.

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
| throw | crashes B mid-round; contradicts `session.ts:108-110`, which deliberately swallows storage failures |
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

**Scored S2026-08-15#4 — NOT fired.** Game 3 (`pick-loser`) entered `manifest.ts`, but writes no
checkpoint: its only session write is `markPlayed`, which preserves the loaded snapshot. Siamsi
remains the sole checkpoint writer, so this ADR's decision stands unchanged and per-game keying stays
deferred. The trigger is a second *checkpoint-writing* game, not merely a third game.

Also open, found by the same design pass and **not** fixed: game B's start still clobbers shared
`session.players` via `[id].astro:51`. **Scored S2026-08-15#2 — REFUTED at this scope only.** The
ADR's decision above (keep one site-wide checkpoint slot; defer per-game keying) stands; only this
closing clobber claim is wrong.

Every reader of `session.players` runs *after* its own page's `setPlayers`. The start handler sets
players before it mounts (`src/pages/game/[id].astro:51,62`), and the เล่นอีกรอบ path re-mounts via
`mountInto` on the closure start already populated (`src/games/siamsi.ts:269`,
`src/games/timebomb.ts:147`) — so `src/games/siamsi.ts:210,290`, `src/games/timebomb.ts:87,187` and
`src/games/_template.ts:33` always see the panel's fresh selection, never a stale one from a
previous game. The only cross-page reader is resume, and `resumeFrom` deliberately ignores
`current` — the checkpoint owns its roster (`src/games/siamsi.ts:122-123`) and restores
`session.players` from the blob (`src/games/siamsi.ts:344`); the design comment at
`src/games/siamsi.ts:338-343` names this transience as intended.

Game B's start also preserves game A's checkpoint on the ordering the start handler uses:
`loadSession()` and `setPlayers()` sit back-to-back (`src/pages/game/[id].astro:50-51`), and
`setPlayers` writes back the same snapshot `session.checkpoint` it loaded
(`src/shell/session.ts:119,100`), never a fresh read. Break that adjacency and the checkpoint does
clobber, pinned both ways by `src/shell/session.test.mjs`: the safe ordering in "game B start
(setPlayers) preserves game A checkpoint" and the hostile ordering in the boundary-pin test that
follows it. **That adjacency is local to the start handler's own pair — it is not a property of the
codebase.** See the finding below — open when written, closed S2026-08-15#4.

Two sub-claims were already covered by committed calibrated checks:
`src/games/siamsi.test.mjs:129-141` (resume with diverging/empty roster) and
`src/shell/session.test.mjs:36-41` (players/checkpoint persistence). The one sub-claim that rested
only on reading `session.ts:70` now has its own test.

The fact that would change this: any reader of `session.players` running *before* the current
page's own start, or any checkpoint writer landing between a closure's creation and that closure's
own `setPlayers` call. The first does not exist today — the only cross-page reader is resume
(covered above), and `src/shell/PlayerSetup.astro:131,296` read only the checkpoint. **The second
did exist** — recorded and fixed below.

Finding S2026-08-15#2 — a late `setPlayers` could resurrect a discarded record · FIXED. Full text moved to `docs/verification/adr-0010-findings.md` (byte-identical); see [#26](https://github.com/warischa/watduang/issues/26).

Finding S2026-08-15#3 — the race was the wrong target; two unguarded orderings exist instead. Full text moved to `docs/verification/adr-0010-findings.md` (byte-identical); see [#27](https://github.com/warischa/watduang/issues/27). **Both orderings CLOSED S2026-08-15#4** by an identity compare-and-swap at `write()` — see § Supersession in that file for what went stale.

## Related

- [#24](https://github.com/warischa/watduang/issues/24) — the ticket this answers
- [#26](https://github.com/warischa/watduang/issues/26) — the S2026-08-15#2 finding, filed and closed (fix `4b14565`)
- [#27](https://github.com/warischa/watduang/issues/27) — the two unguarded orderings from S2026-08-15#3: CLOSED S2026-08-15#4 by identity CAS at `write()`. The trip-wire fired the same session it was set: game 3 `pick-loser` was added as a new caller, which is exactly the premise the deferral rested on
- ADR-0008 — starting a round never resumes or discards one silently
- ADR-0009 — a DoD box whose proof set we do not own is mis-scoped
