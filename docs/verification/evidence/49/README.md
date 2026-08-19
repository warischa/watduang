# gh#49 — a bfcache-restored page silently overwrites a newer checkpoint

**Verdict: CONFIRMED.** Measured against a real `npm run build` served on `:4321`, headless Chrome over CDP, 2026-08-19.

## What settles it

Both page instances held record id `mt0576wa-1` throughout, so the identity check at `src/shell/session.ts:89` passed on the stale write.

| | holder | results | deck |
|---|---|---|---|
| before the step-7 tap (written by instance #2) | 2 | 2 | `[23,10]` |
| after instance #1's `ส่งต่อ` tap | 1 | 1 | `[1,23,10]` |

Strictly less progress on every axis, and the deck grew back — a drawn card returned to it. No confirm, no message, no undo.

## Why the obvious guard does not work

The clobbering write carries a **newer** wall-clock stamp than the value it destroys: `1787147041344` over `1787147038224`. A last-write-wins-by-timestamp check would let it through. The comparison has to be against the stamp *this closure last persisted*, not against the clock.

## Controls

- **Positive control passed.** An ordinary `startRound()` moved the checkpoint from `null` to a live value in the same harness (`run1.json` labels "positive control: after setPlayers, before startRound" and "after startRound"). A null result would therefore have meant something. It was not a null result.
- **The restore was a real bfcache restore, not a reload.** A marker set on instance #1 survived two `history.back()` steps, and a pre-armed `pageshow` listener recorded `persisted: true` (`run1.json`).

## Reproducing

`node scripts/driver.mjs docs/verification/evidence/49/probe.mjs` (from repo root) against a built and served tree. See `docs/agents/browser-verification.md` for the driver conventions, and `docs/runbook.md` § "Two headless probes at once attach to each other's browser" before running it alongside anything else.

## Recipe note

`ส่งต่อ` renders only in phase `drawn`, so the probe taps draw once on instance #1 before leaving the page. The mechanism under test is unchanged.
