# ADR-0010 findings — S2026-08-15#2 and S2026-08-15#3

Moved verbatim out of `docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md` to keep that ADR under the repo byte budget. See the ADR for the pointer lines that replaced these sections in place.

## Re-scoring S2026-08-15#4 — collision verdict unchanged, liveness gap found, clobber claim REFUTED

**Scored S2026-08-15#4 — NOT fired for collision, but the scoring reasoning was incomplete.** Game 3
(`pick-loser`) entered `manifest.ts`; its only session write is `markPlayed`, which preserves the
loaded checkpoint. Siamsi remains the sole checkpoint writer, so the *collision* verdict stands: this
ADR's decision is unchanged and per-game keying stays deferred — the trigger is still a second
*checkpoint-writing* game.

"Writes no checkpoint" was then read as evidence the game was safe generally. It is not: the shared
unit this ADR protects is the session record, not the checkpoint field. A checkpoint-free game still
has a live round living in that same record, and `session.clear()` empties the whole record for every
game regardless of whether a checkpoint was ever written. Containment only ever held for checkpoint
collision — it was never a liveness argument. That gap left the clear-confirmation prompt blind to a
live round in any checkpoint-free game; the liveness half is now covered separately by a `roundLive`
check in `planClear` (`src/shell/player-select.ts`), fed from the panel's own hidden-state
(`src/shell/PlayerSetup.astro`) — not by anything site-wide-vs-per-game keying could have prevented.

Also open, found by the same design pass and **not** fixed: game B's start still clobbers shared
`session.players` via the `setPlayers` call in `src/pages/game/[id].astro`'s `watduang:start` handler.
**Scored S2026-08-15#2 — REFUTED at this scope only.** The ADR's decision above (keep one site-wide
checkpoint slot; defer per-game keying) stands; only this closing clobber claim is wrong.

Every reader of `session.players` runs *after* its own page's `setPlayers`. The start handler sets
players before it mounts (`session.setPlayers(...)` then `game.mount(...)`, both in
`src/pages/game/[id].astro`'s `watduang:start` handler), and the เล่นอีกรอบ path re-mounts via
`mountInto` on the closure start already populated (the `เล่นอีกรอบ` click handler in `src/games/siamsi.ts`
and in `src/games/timebomb.ts`) — so the `session.players` reads in `siamsi.ts`'s `renderIdle` and
`startRound`, in `timebomb.ts`'s `renderIdle` and `arm`, and in `_template.ts`'s `mount()` always see
the panel's fresh selection, never a stale one from a previous game. The only cross-page reader is
resume, and `resumeFrom` deliberately ignores `current` — the checkpoint owns its roster
(`resumeFrom`'s docblock in `src/games/siamsi.ts`, "The checkpoint owns its roster (#23)") and restores
`session.players` from the blob (`ctx.session.setPlayers(resumed.players)` in `mountInto`'s resume
branch, `src/games/siamsi.ts`); the design comment inside that same branch names this transience as
intended.

Game B's start also preserves game A's checkpoint on the ordering the start handler uses:
`loadSession()` and `setPlayers()` sit back-to-back (both calls in `src/pages/game/[id].astro`'s
`watduang:start` handler), and `setPlayers` writes back the same snapshot `session.checkpoint` it
loaded (the `checkpoint: session.checkpoint` line in `write()`'s `JSON.stringify` call, and the
`checkpoint: stored.checkpoint` initializer in the `session` object literal, both in `session.ts`),
never a fresh read. Break that adjacency and the checkpoint does clobber, pinned both ways by
`src/shell/session.test.mjs`: the safe ordering in "game B start (setPlayers) preserves game A
checkpoint" and the hostile ordering in the boundary-pin test that follows it. **That adjacency is
local to the start handler's own pair — it is not a property of the codebase.** See the finding
below — open when written, closed S2026-08-15#4.

Two sub-claims were already covered by committed calibrated checks: the resume tests in
`src/games/siamsi.test.mjs` (resume with diverging/empty roster) and the players/checkpoint
persistence tests in `src/shell/session.test.mjs`. The one sub-claim that rested only on reading the
`checkpoint` field in `read()` in `session.ts` now has its own test.

The fact that would change this: any reader of `session.players` running *before* the current
page's own start, or any checkpoint writer landing between a closure's creation and that closure's
own `setPlayers` call. The first does not exist today — the only cross-page reader is resume
(covered above), and the two `session.checkpoint` reads in `PlayerSetup.astro`'s `requestStart` and
`requestClear` read only the checkpoint. **The second did exist** — recorded and fixed below.

## Finding S2026-08-15#2 — a late `setPlayers` could resurrect a discarded record · FIXED

Found while scoring the claim above, and fixed in the same session. `ctx.session.setPlayers(resumed.players)`
in `mountInto`'s resume branch (`src/games/siamsi.ts`) is a *second* `setPlayers` on the closure the
start handler created, and on first mount `await load()` (`src/pages/game/[id].astro`) separates it
from that closure's creation. The panel stays live in that gap: ล้างกลุ่มนี้ → `session.clear()`
(in `requestClear`, `src/shell/PlayerSetup.astro`) empties the record, and `location.reload()` (same
function) is a macrotask away. If the module resolves first, that resume `setPlayers` runs with
`create = true` and rebuilds the record *with its checkpoint* — the discarded round un-discards.

This is the failure `65d3d3c` closed for the `#ss-draw` / `#ss-pass` writers. The resume path is a
sibling caller that fix did not cover, which is why "`setPlayers` is the sole creator and always runs
first" held as written and still left this open — it runs first, and then again later.

Confirmed: the storage semantics, by probe against the real `src/shell/session.ts` (after `clear()`,
a resume-shaped `setPlayers` leaves a record carrying a `siamsi` checkpoint). Not measured: the
browser-side race window, argued from `65d3d3c`'s own reproduction rather than observed. The fact
that would kill this finding: proof the pending module continuation can never run between
`session.clear()` and the reload committing.

**The fix:** `loadSession()` now carries a per-closure `mayCreate`, true only until the first
`setPlayers` on that closure; every later `setPlayers` passes `create = false` and inherits
`65d3d3c`'s refusal in `write()` when the record is gone. `siamsi.ts` is untouched — the guard sits
at the chokepoint every caller routes through, not on siamsi's resume path.

Be precise about what that guard does: it keys on **call ordinality within one closure**. The flag
refuses nothing itself, does not track whether this closure created the record, and does not detect
the `clear()`. Its safety rests on the `session.setPlayers(...)` call in `src/pages/game/[id].astro`'s
`watduang:start` handler being the *first* `setPlayers` on every closure a game module receives.

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
script keeps running — the `loadSession()` doc comment in `src/shell/session.ts` already recorded
this ("a macrotask away").
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

- `loadSession()` and `setPlayers()` in `src/pages/game/[id].astro`'s `watduang:start` handler are
  adjacent statements with no suspend between them, so a closure's first `setPlayers` is synchronous
  with its own creation. The only `await` (`load()`, same handler) comes after. No closure can be
  stale-with-unspent-first-call.
- `clear()` (in `requestClear`, `src/shell/PlayerSetup.astro`) is always chained to `location.reload()`
  (same function) in the same handler; a same-document new round requires a second `watduang:start`,
  which builds a fresh closure.
- `gameCtx` is module-level, overwritten on every `mountInto` (in `src/games/siamsi.ts` and in
  `src/games/timebomb.ts`) and nulled by `teardown()` (`siamsi.ts`). The replay button reads it
  **at click time** (the `เล่นอีกรอบ` click handler in `siamsi.ts`), not render time, so the resume
  `setPlayers` in `mountInto` always fires on the current mount's closure. No holder of a stale
  closure with a reachable write path exists.

The second hole's class also covers `markPlayed` and `saveCheckpoint` (`detonate()` in `timebomb.ts`,
`save()` in `siamsi.ts`) — both write the full stale snapshot under the same existence-only check.
Same unreachability argument; named here so a future writer inherits the warning.

**The facts that would invert this** (both pinned in the test comments): any `setPlayers` caller
other than the one in `[id].astro`'s `watduang:start` handler and the resume `setPlayers` in
`siamsi.ts`'s `mountInto` that has a suspend between its `loadSession()` and its *first*
`setPlayers`; or any record creation that does not require a fresh user gesture — a client router
or an auto-start. Either turns a boundary pin into a live ADR-0008 violation.

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

## Supersession — S2026-08-15#4

Everything above is the record as written. It is **not** current. The two orderings it reports as
open were closed on 2026-08-15 by an identity compare-and-swap at `write()` (`src/shell/session.ts`).

**Reversal.** S2026-08-15#3 deliberately left both open, on the grounds that closing them was
speculative: they were unreachable by call-site accident, not by construction. That premise expired
in the same session that added game 3 `pick-loser` — a new caller is exactly the trip-wire #27
named. Decision taken by the site owner with that trade-off stated.

**Stale above — do not reuse these numbers:**
- the quadrant rows for the two unguarded orderings describe the pre-CAS seam
- the Calibration paragraph (red 9/2, 11 tests) calibrates the **removed** `mayCreate` mechanism.
  Recalibrated against the CAS guard: mutant M1 (revert `session.ts` to `4b14565`'s `mayCreate`
  mechanism) → pass 11 / fail 4 of 15, `src/shell/session.test.mjs` (tests 10, 11, 14, 15 — the old
  `mayCreate` was spent unconditionally, so the post-quota-retry test fails too, and the F2 aging test
  added after this paragraph fails against it the same way, since both landed in the same rewrite).
- the "What this does not cover" paragraph above ("`MAX_AGE_MS` aging is expressible at this seam but
  is a different invariant — the key survives aging, so `write()`'s existence check passes while
  `read()` reports empty") — superseded
  by the same CAS rewrite: `write()` now re-reads via `readRaw()`, which ages the record, so an aged
  record refuses a non-creating write and agrees with `read()`. Pinned by the aged-record test added
  to `src/shell/session.test.mjs` in this fix pass.

**What the guard now enumerates:** the identity a closure captured at load vs the identity in the
stored record — both minted by `session.ts` and persisted in sessionStorage. That set is owned by
this module by construction, which is why it converges where a browser-interleaving criterion could
not (ADR-0009). Absent record + captured id → refuse (hole a); stored id ≠ captured id → refuse
(hole b, covering `markPlayed` and `saveCheckpoint` through the same chokepoint); no id at all
(legacy record predating the field) → matches; only `setPlayers` may create. `mayCreate` and the
existence check are deleted, not layered. The identity commits only after a successful `setItem`,
so a swallowed quota error cannot turn the guard into a permanent silent no-op.

**Left open, deliberately:** two racing *fresh* closures (a double-fired `watduang:start`) flip from
last-write-wins to first-write-wins. Slot behaviour there was already unspecified above.

**The fact that would change the approach:** any caller outside `session.ts` needing to hand a
session identity to another closure — the CAS becomes forgeable and the guard has to move to a
write token the module keeps private.

## S2026-08-18 — gate wired, re-scored: trigger not fired

**S2026-08-18 — the trigger is now a gate, not a note. Decision unchanged.** This ADR's deferral rests
entirely on one condition, and until now nothing enforced it: the trigger lived in prose in
`_template.ts`, to be noticed by whoever adds the next game. `scripts/checkpoint-writer-check.mjs`
now fails CI the moment a second file under `src/games/` calls `saveCheckpoint`, and fails with
instructions — it names this ADR, names gh#24, and — until 2026-08-19 — said to build the per-game design specced in
§ Decision before shipping that game. Wired before the Build step, so it cannot touch `dist/`.

Re-scored at the same time: siamsi is still the sole checkpoint-writing game, so **the trigger has
not fired and this ADR's decision stands unchanged**. Per-game keying was deliberately NOT built —
an agent started to and was stopped, because § Why defer rather than build point 1 is still true:
whether วัดดวง should ever hold two paused rounds is a product call, and building the mechanism
answers it by accident. The owner chose the gate over the build.

