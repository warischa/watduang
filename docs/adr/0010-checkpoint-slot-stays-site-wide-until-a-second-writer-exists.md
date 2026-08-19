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

Unreachable today: siamsi is the sole `saveCheckpoint` caller — grep the callers, do not count the
manifest (six games ship now; the four added since only call `markPlayed`, which preserves the
checkpoint). But `_template.ts`, the scaffold a new game is copied from,
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

A second checkpoint-writing game entering `manifest.ts`. At that moment the collision is reachable
and `ADR-0008:106-112` fires. **The response is to reopen gh#24 with the owner, not to build**: the
owner declined per-game keying on 2026-08-19, so the design above records what was rejected, not a
plan. A reopened question must still settle `planClear`'s condition and the precision of `รอบที่ค้าง`
in the clear warning, which may by then mean more than one round is at stake.

**Re-scored S2026-08-15#4 — collision verdict unchanged; a liveness gap and a REFUTED clobber claim
were found and closed in the same pass.** Full text moved to `docs/verification/adr-0010-findings.md`
(byte-identical).

Finding S2026-08-15#2 — a late `setPlayers` could resurrect a discarded record · FIXED. Full text moved to `docs/verification/adr-0010-findings.md` (byte-identical); see [#26](https://github.com/warischa/watduang/issues/26).

Finding S2026-08-15#3 — the race was the wrong target; two unguarded orderings exist instead. Full text moved to `docs/verification/adr-0010-findings.md` (byte-identical); see [#27](https://github.com/warischa/watduang/issues/27). **Both orderings CLOSED S2026-08-15#4** by an identity compare-and-swap at `write()` — see § Supersession in that file for what went stale.

**S2026-08-18 — gate wired, re-scored the same day: trigger not fired.** Full text moved to
`docs/verification/adr-0010-findings.md` (byte-identical).

**The product call was answered on 2026-08-19, and the answer is no.** Asked directly whether วัดดวง
should ever hold two paused rounds at once, the owner said one slot for the whole site is enough and
closed gh#24. So the deferral above is no longer provisional — it is the decision. Per-game keying is
declined, not postponed, and `scripts/checkpoint-writer-check.mjs` changes character with it: it was a
tripwire holding a seat for an undecided design, and it is now permanent enforcement of a settled one.

That gate's failure text was corrected in the same move, superseding the S2026-08-18 note above: it
no longer orders the declined design built. A second writer now reads as a reason to reopen gh#24
with the owner, and the gate's `--selftest` pins the ABSENCE of the old work-order wording.

The gate's own limits are written in its `ponytail:` header and are real: an aliased or destructured
call (`const { saveCheckpoint } = gameCtx.session`) escapes it — measured, not assumed — and it sees
nothing outside the flat `src/games/*.ts` glob. It proves the trigger fired; it does not prove the
per-game design above is correct.

## Related

- [#24](https://github.com/warischa/watduang/issues/24) — the ticket this answers
- [#26](https://github.com/warischa/watduang/issues/26) — the S2026-08-15#2 finding, filed and closed (fix `4b14565`)
- [#27](https://github.com/warischa/watduang/issues/27) — the two unguarded orderings from S2026-08-15#3: CLOSED S2026-08-15#4 by identity CAS at `write()`. The trip-wire fired the same session it was set: game 3 `pick-loser` was added as a new caller, which is exactly the premise the deferral rested on
- ADR-0008 — starting a round never resumes or discards one silently
- ADR-0009 — a DoD box whose proof set we do not own is mis-scoped
- ADR-0021 — a version token, not a clock: a different question (write freshness, not slot scope)
  about the same `write()` chokepoint
