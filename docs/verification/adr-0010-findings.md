# ADR-0010 findings — S2026-08-15#2 and S2026-08-15#3

Moved verbatim out of `docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md` to keep that ADR under the repo byte budget. See the ADR for the pointer lines that replaced these sections in place.

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
- lines 110-112 ("`MAX_AGE_MS` aging is expressible at this seam but is a different invariant — the
  key survives aging, so `write()`'s existence check passes while `read()` reports empty") — superseded
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

