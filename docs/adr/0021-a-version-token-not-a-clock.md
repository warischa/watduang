# ADR-0021 — A version token, not a clock

Date: 2026-08-19 · Status: accepted · Issue: [#49](https://github.com/warischa/watduang/issues/49)

## Context

ADR-0010's identity compare-and-swap in `write()` (`src/shell/session.ts`) answers "whose round is in
the slot" by comparing `current.id !== myId`. It cannot answer a second question: "is my copy of that
round current". A page frozen in bfcache keeps a live closure holding the round's own id. On restore,
the identity compare passes, and the closure's stale snapshot overwrites whatever the newer page
instance already wrote — silently, because nothing throws and nothing looks wrong.

Measured, gh#49: holder 2 → 1, results 2 → 1, a drawn card back in the deck.

**Why a clock does not work — the load-bearing fact.** The clobbering write carried a *newer* wall
clock than the value it destroyed: `1787147041344` over `1787147038224`. A monotonic-stamp guard is
last-write-wins-by-time, and time is exactly what lets this loss through — the stale closure wrote
*after* the fresh one in wall-clock terms, not before. Wall clock also ties outright at round end,
where `markPlayed` and `saveCheckpoint(null)` fire from one handler in the same millisecond
(`src/games/siamsi.ts`, the `roundOver` branch of `passToNext`). A too-permissive token is the whole
failure mode here, and a clock is too permissive by construction.

## Decision

**A monotonic generation counter on the stored record (`StoredSession.gen`), used as a
compare-and-swap token inside the existing `write()` chokepoint — not a clock, and not a lock.**

The check sits as a **sibling** of the identity branch in `write()`, never nested inside it. The
identity compare is skipped whenever the stored `id` is `undefined` (a pre-identity, legacy record —
see `LEGACY_ID` in `session.ts`), so a guard nested inside that branch would inherit the same blind
spot: gh#49 through the legacy door would look identical to gh#49 through the normal one. Absent `gen`
reads as `0`, so the one sibling check covers both doors with no special-casing.

The counter commits only after `sessionStorage.setItem` returns, mirroring the reasoning already
governing `id` in the same function: minting an id before a throwing `setItem` would make a Safari
private-mode failure look like a create that succeeded, and every later write would then refuse
against an id never persisted. The same trap applies to `gen` — bumping it before a throwing `setItem`
leaves the closure one version ahead of a record that never moved, and it would refuse every write
after that, permanently.

**Why no lock.** `write()` is already an atomic read-modify-write: one JS realm runs at a time per tab,
and a bfcached page is frozen, so nothing interleaves between the read and the `setItem` inside it. The
only missing piece was ever the version. `sessionStorage` is scoped per top-level tab — a second tab
has its own store and cannot reach this key — and neither `SharedWorker` nor a service worker has
`sessionStorage` at all. There is no concurrent writer to lock against.

## Alternatives rejected

**Monotonic wall-clock stamp.** Rejected on the evidence above: the exact write that caused the
measured loss carried the newer timestamp, and round-end's two same-tick writes tie outright. Fails on
the too-permissive side.

**Discard the stale closure at `pageshow` using `event.persisted`.** Rejected on ownership, not cost.
It would enumerate the ways a stale document can resume — bfcache eligibility, freeze/resume, a future
prerender — and that set belongs to the browser, not to this repo, so a fix built against it never
converges. It also breaks the innocent case `src/pages/game/[id].astro`'s `pagehide` handler
deliberately preserves: an ordinary back-button return to a round still in progress, which must keep
working and is not the hazard. Fails too-strict, in the other direction from the clock.

## What this rests on

**The failure direction that matters is the strict one.** A token too permissive lets a stale write
through — the original bug. A token too strict silently refuses a *legitimate* save, which is the same
data-loss harm from the other side and harder to notice, because nothing errors and the UI gives no
sign a write was dropped. Adversarial review walked first start, resume, mid-round, round end,
discard-then-start, clear, leave-confirm, tool pages, and play-again looking specifically for a
legitimate write the new check would refuse, and did not find one.

**Verification.** `docs/verification/evidence/49/probe.mjs` reported CONFIRMED before this change and
REFUTED after, with its positive control and bfcache-restore detection both still true. Four unit tests
in `src/shell/session.test.mjs` cover what the probe cannot reach at the browser level: the legacy
gen-less record (`gh#49 legacy`), discard-then-start racing an older closure, and the same-tick
round-end write pair. State the gap plainly: all of that is Chrome over CDP plus Node — iOS Safari, the
product's real phone, is not covered by either.

## What would change this

If `write()` stops being the only path to `KEY` — a second `setItem` on the same key, or a genuinely
concurrent writer — the counter becomes a *detector* of a lost update rather than a guard against one,
and the slot would need real mutual exclusion. `navigator.locks` is the tool for that, and it must be
**capability-checked, not container-checked**: Node 22 defines `navigator` without `.locks`, so a
container check (`if (navigator)`) passes where the capability is actually absent.

## Related

- gh#49 — the ticket this answers
- ADR-0010 — the checkpoint slot stays site-wide; a different question (slot scope, not write
  freshness) about the same `write()` chokepoint
