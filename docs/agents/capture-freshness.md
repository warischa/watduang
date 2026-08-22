# Capture freshness

Moved out of `browser-verification.md` to stay under the house doc budget. Consulted at
review/citation time, not while driving a browser — see that file for the run-time playbook.

## When a committed capture goes stale — and when it does not

A committed capture proves a **point-in-time** claim: at the commit it names, the wire was connected in
a real browser. A later commit cannot un-happen that. Freshness afterwards is a *regression* question —
but only sometimes the unit suite's to answer. Which case you are in decides everything below.

**This section applies only to a capture with a named, executing unit twin** — a wiring/state proof
whose logic real tests actually run. It does **not** apply to `320px` reflow, reduced-motion, or any
visual capture: those have no unit equivalent in this repo, nothing re-checks them, and concluding
from CSS is the exact failure this tooling exists to replace.

A visual verdict is still **pinned to its own `capturedAtCommit`** — it remains a true statement about
that commit, and stays readable as one forever. What differs is only the re-trigger, which is wider
and has no seam list to narrow it: **any shared CSS, layout, or script-loading change re-triggers a
visual capture.** So do not read a visual PROVEN as current, and do not read it as void either — read
it as "true at that commit, re-run before relying on it now." Worked example:
`docs/verification/evidence/pick-loser/01-pick-loser-browser.json` records `320px` PROVEN and
reduced-motion N/A at `e0c4479`; both are pinned there and re-trigger on the next shared-CSS change.

**Re-run a wiring capture when the browser-owned seam changes. The seam includes — and this list is
illustrative, not exhaustive:**

- the resume trigger path — `player-select.ts` `planStart()`
- a game's `resumeFrom()` or its render path
- the ADR-0008 approved strings
- a storage-mechanism swap — leaving `sessionStorage`, or moving resume out of the click path
- **`src/pages/game/[id].astro` and `src/shell/PlayerSetup.astro`** — the actual wire, and never executed by any test

**The general test, which outranks the list: any change to a file the capture's unit twin cites by
line number re-triggers the capture.** The suite here leans on `.astro` line ordering it cannot run —
`session.test.mjs` cites the `watduang:start` listener's `loadSession()` → `setPlayers()` adjacency in
`game/[id].astro` ("back-to-back with nothing in between") in several comments (the ADR-0010
clobber-claim test, the writer-lands-between-closures test, F1's late-setPlayers test, and the
FIRST-setPlayers-after-discard test) — while `npm test` is `node --test 'src/**/*.test.mjs'`
and executes no `.astro` at all. It leans on `PlayerSetup.astro` too, but since `9108069` it cites that
one by function name (`requestClear()`, `requestStart()`) rather than by line. Do not reintroduce a
number there: `scripts/added-lineno-citation-check.mjs` now rejects one on any line a push adds.
Insert one `await` between `[id].astro`'s `loadSession()` and `setPlayers()` calls and
browser resume breaks with all 96 tests still green. A premise the tests only *assert in a comment* is
browser-owned, whatever file it lives in.

Internal refactors genuinely *behind* the seam do not invalidate a capture. Worked example: `9c9a080`
rewrote `session.ts`'s `write()` into an identity CAS and did not invalidate #20's capture — it left
`player-select.ts`, `siamsi.ts`, and both `.astro` files untouched, and extended the suite 87→96.
(the F1 test, `` F1: the resume path's late setPlayers must not rebuild a record that was discarded
meanwhile ``, exercises the #20 refresh-resume entry as its setup; it is not a dedicated
refresh-resume proof, so do not cite it as one.)

**Why this is a rule and not a preference.** Not because future commits are "not ours" — they are, and
[ADR-0009](../adr/0009-a-dod-box-whose-proof-set-we-do-not-own-is-mis-scoped.md)'s not-ours sets are
Google, a deploy that does not exist, the immutable past, and the owner's phone. The reason is that a
seam test is **evaluable per commit, at commit time**, so the obligation converges — which is what
ADR-0009 means by rating browser behaviour *"ours → walk it; converges"*: one walk plus a decidable
re-trigger, not a standing debt. Precedent: `68e4a03` bound an ordering "at the seam, not in the
browser". Decided S2026-08-15#5.

**An independent trigger the file list cannot detect:** a change in what the *browser platform*
guarantees — a Chrome change to `sessionStorage` eviction, bfcache vs `pagehide`. No diff of this repo
will signal it, so it can never come from the seam list; it arrives from outside and mandates a fresh
capture on its own.

**When in doubt, re-capture.** A needless capture costs one driver run. A skipped one puts a false
green in a tracker whose entire purpose is honest verdicts.
