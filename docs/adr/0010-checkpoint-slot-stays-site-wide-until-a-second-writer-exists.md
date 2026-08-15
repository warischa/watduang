# ADR-0010 — The checkpoint slot stays site-wide until a second writer exists

Date: 2026-08-15 · Status: accepted · Issue: [#24](https://github.com/warischa/watduang/issues/24)

## Context

The shell keeps one checkpoint slot for the whole site. A white-box audit this session traced every
read and every write of it: 4 writes (`siamsi.ts:281` `save()`, `siamsi.ts:320` clear-on-round-over,
`PlayerSetup.astro:141` discard-then-start, `session.ts:82` `clear()`), 2 preserving rewrites
(`session.ts:68` `setPlayers`, `:72` `markPlayed`), and 3 reads (`siamsi.ts:335`,
`PlayerSetup.astro:131`, `:296`). Line references re-verified against the tree at S2026-08-15#2 —
the originals were written before `65d3d3c` reshaped `siamsi.ts` and had drifted.

Result: **every guard is read-side.** `resumeFrom` checks the game label (`siamsi.ts:125`) and
`planStart` checks `checkpoint?.game === gameId` (`player-select.ts:47`). The write side has none —
`saveCheckpoint` (`session.ts:78-81`) never compares `cp.game` to what is already in the slot.

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
(`src/shell/session.ts:67,70`), never a fresh read. Break that adjacency and the checkpoint does
clobber, pinned both ways by `src/shell/session.test.mjs`: the safe ordering in "game B start
(setPlayers) preserves game A checkpoint" and the hostile ordering in the boundary-pin test that
follows it. **That adjacency is local to the start handler's own pair — it is not a property of the
codebase.** See the open finding below.

Two sub-claims were already covered by committed calibrated checks:
`src/games/siamsi.test.mjs:129-141` (resume with diverging/empty roster) and
`src/shell/session.test.mjs:36-41` (players/checkpoint persistence). The one sub-claim that rested
only on reading `session.ts:70` now has its own test.

The fact that would change this: any reader of `session.players` running *before* the current
page's own start, or any checkpoint writer landing between a closure's creation and that closure's
own `setPlayers` call. The first does not exist today — the only cross-page reader is resume
(covered above), and `src/shell/PlayerSetup.astro:131,296` read only the checkpoint. **The second
did exist** — recorded and fixed below.

## Finding S2026-08-15#2 — a late `setPlayers` could resurrect a discarded record · FIXED

Found while scoring the claim above, and fixed in the same session. `src/games/siamsi.ts:344` is a *second*
`setPlayers` on the closure the start handler created, and on first mount `await load()`
(`src/pages/game/[id].astro:56`) separates it from that closure's creation. The panel stays live in
that gap: ล้างกลุ่มนี้ → `session.clear()` (`src/shell/PlayerSetup.astro:304`) empties the record,
and `location.reload()` (`:310`) is a macrotask away. If the module resolves first, `:344` runs with
`create = true` and rebuilds the record *with its checkpoint* — the discarded round un-discards.

This is the failure `65d3d3c` closed for the `#ss-draw` / `#ss-pass` writers. The resume path is a
sibling caller that fix did not cover, which is why "`setPlayers` is the sole creator and always runs
first" held as written and still left this open — it runs first, and then again later.

Confirmed: the storage semantics, by probe against the real `src/shell/session.ts` (after `clear()`,
a `:344`-shaped `setPlayers` leaves a record carrying a `siamsi` checkpoint). Not measured: the
browser-side race window, argued from `65d3d3c`'s own reproduction rather than observed. The fact
that would kill this finding: proof the pending module continuation can never run between
`session.clear()` and the reload committing.

**The fix:** `loadSession()` now carries a per-closure `mayCreate`, true only until the first
`setPlayers` on that closure; every later `setPlayers` passes `create = false` and inherits
`65d3d3c`'s refusal in `write()` when the record is gone. `siamsi.ts` is untouched — the guard sits
at the chokepoint every caller routes through, not on siamsi's resume path.

Be precise about what that guard does: it keys on **call ordinality within one closure**. The flag
refuses nothing itself, does not track whether this closure created the record, and does not detect
the `clear()`. Its safety rests on `src/pages/game/[id].astro:50-51` being the *first* `setPlayers`
on every closure a game module receives.

The fact that would change this: a page that hands a game a session closure whose first `setPlayers`
happens inside the game. That page silently loses the protection — the same locality this ADR scores
above, one level up.

Proof: `src/shell/session.test.mjs` pins the F1 ordering (red before the guard, green after) and an
anti-over-fix control — a later `setPlayers` must still update a record that is still there, which is
issue #20's refresh-resume path. Positive control run against `65d3d3c^`: the ADR-0008 "a discard is
final" test goes red there and green at HEAD, so the apparatus does reproduce the known-bad case.

Note for future sessions: `65d3d3c`'s original browser harness is **not in the tree** — it lived
under a `.claude/worktrees/` path that the same commit gitignored. Its runnable descendant is the
ADR-0008 block in `src/shell/session.test.mjs`. Evidence kept outside the repo does not survive the
session that made it.

## Finding S2026-08-15#3 — the race was the wrong target; two unguarded orderings exist instead

The queued task was "measure F1's browser race window" — the claim that a module continuation
resolves before `location.reload()` commits. That measurement was **not** attempted, on purpose.

**Why the browser probe was dropped.** The set it would sample — interleavings of a module
continuation against the navigation commit — is owned by the browser's scheduler and the HTML
navigation task queue, not by us. A negative reading on one Chrome build converges on nothing, so
"no interleaving observed" is unfalsifiable as an exit criterion. Sampling a set we do not own
never terminates.

**The race is spec-permitted, not unreachable.** `location.reload()` queues a navigation and
script keeps running — `src/shell/session.ts:41` already recorded this ("a macrotask away").
Any attempt to prove the interleaving impossible would have been proving a false statement. Do not
record "the race cannot happen"; record that it is permitted and **bounded at the seam**.

**What replaced it.** Orderings of calls on the `loadSession()` closure surface are finite and
ours, so they were enumerated in `src/shell/session.test.mjs` (+4 tests, 83 → 87). Four orderings,
along two axes — closure created before/after the discard × first `setPlayers` spent/unspent:

| Ordering | Outcome |
|---|---|
| FRESH — discard, then a new closure's first `setPlayers` | **must create.** Anti-over-fix control: "no create after a discard" is the wrong invariant |
| FRESH-THEN-STALE — closure creates round 2 after discard 1, then discard 2 | refused, and a second late call still refused. `mayCreate` is per-closure one-shot, not a global post-discard rule |
| **STALE, first `setPlayers` unspent** | **unguarded.** Record and checkpoint return; `planStart` → `'ask'` |
| **STALE, record re-exists** | **unguarded.** `write()`'s check is existence-based, not identity-based, so the stale snapshot overwrites the new round |

The last two tests pin the **hole**, not the guard. They are green today because they assert the
violation; closing either hole flips its own pin red by design.

**Both holes are unreachable in production today** — by call-site accident, not by construction:

- `src/pages/game/[id].astro:50-51` are adjacent statements with no suspend between them, so a
  closure's first `setPlayers` is synchronous with its own creation. The only `await` (`load()`,
  `:56`) comes after. No closure can be stale-with-unspent-first-call.
- `clear()` (`src/shell/PlayerSetup.astro:304`) is always chained to `location.reload()` (`:310`)
  in the same handler; a same-document new round requires a second `watduang:start`, which builds a
  fresh closure.
- `gameCtx` is module-level, overwritten on every `mountInto` (`src/games/siamsi.ts:331`,
  `src/games/timebomb.ts:260`) and nulled by `teardown()` (`siamsi.ts:372`). The replay button
  reads it **at click time** (`siamsi.ts:266-267`), not render time, so `siamsi.ts:344` always
  fires on the current mount's closure. No holder of a stale closure with a reachable write path
  exists.

The second hole's class also covers `markPlayed` and `saveCheckpoint` (`timebomb.ts:230`,
`siamsi.ts:283`) — both write the full stale snapshot under the same existence-only check. Same
unreachability argument; named here so a future writer inherits the warning.

**The facts that would invert this** (both pinned in the test comments): any `setPlayers` caller
other than `[id].astro:51` and `siamsi.ts:344` that has a suspend between its `loadSession()` and
its *first* `setPlayers`; or any record creation that does not require a fresh user gesture — a
client router or an auto-start. Either turns a boundary pin into a live ADR-0008 violation.

**Calibration.** Positive control: deleting only `mayCreate = false;` (leaving `65d3d3c`'s
write-level existence check intact) goes red 9/2, caught by the assertion at
`session.test.mjs:260` — "a stale closure re-created the round the player discarded" — inside the
test declared at `:246`. Over-fix direction also run: blunt
(all 11 red), but test 8's own message fires, so its create-path assertion is load-bearing rather
than decorative. Both pins were additionally proven non-vacuous by mutation — a hole-closing mutant
for each flips exactly its own pin.

**What this does not cover.** The browser interleaving itself, by construction. Whether a queued
`watduang:start` can be replayed after a clear, since dispatch lives in the DOM. `MAX_AGE_MS` aging
is expressible at this seam but is a different invariant — the key survives aging, so `write()`'s
existence check passes while `read()` reports empty. And a double-fired `watduang:start` on first
mount interleaves two **fresh** closures, each spending its first `setPlayers` before its first
suspend: that is last-write-wins between two new rounds, with no discard involved, so it is not an
ADR-0008 case — but it is still unspecified behaviour of the slot.

## Related

- [#24](https://github.com/warischa/watduang/issues/24) — the ticket this answers
- [#26](https://github.com/warischa/watduang/issues/26) — the S2026-08-15#2 finding, filed and closed (fix `4b14565`)
- [#27](https://github.com/warischa/watduang/issues/27) — the two unguarded orderings from S2026-08-15#3: pinned, unreachable today, with the trip-wire that reopens them
- ADR-0008 — starting a round never resumes or discards one silently
- ADR-0009 — a DoD box whose proof set we do not own is mis-scoped
