# gh#308 backend half: QR join endpoint (2026-11-11)

Base `7cefc99`, with the join files and sibling work uncommitted in the same tree. Decision record:
ADR-0076. Page half not started; it waits on the gh#304 tracer. No `az`, `func` or deploy command ran.

Three rounds on the same day. Round 1 built the endpoint. REFUTE round 1 (real SDK on Azurite) found
three races (a removal against a start, a join against a purge, a delayed removal against a later
joiner), no abuse bound, an invisible mark that a deny-list let through, and tests that supplied
storage atomicity themselves. Round 2 fixed all of them; ADR-0076 holds the protocol.

Round 3 (owner rulings after REFUTE round 2, whose open finding F4 split into G1-G4): both abuse
budgets are gone (no create counter, no PIN slot, no 429), a wrong PIN changes no storage state, and
an event expires 24 hours after its start, or 72 hours after creation if never started. See
"Round 3" below.

Round 4 (REFUTE round 3's three findings): a start decides liveness again at its write; the name cap
is a fixed set of slot blobs; the tests record every storage call in order. See "Round 4" below; the
sections after it describe the code as it now stands.

## Files

- `services/feedback/src/join.mjs` (pure: routing, name allow-list, concurrency protocol, expiry clock, store port; no SDK)
- `services/feedback/src/functions/join.mjs` (function `draw` at `/api/draw/{*path}`; Blob adapter; lazy client)
- Tests: `join-name.test.mjs` (13), `join-service.test.mjs` (41), `join-import.test.mjs` (3)
- Here: `mutants.mjs` + `mutants-output.txt`; `old-code-red-output.txt` (round 2) and
  `budget-drop-old-red-output.txt` (round 3), `refute3-old-red-output.txt` (round 4); `azurite-run.sh` +
  `azurite-calibration.mjs` + `azurite-run-output.txt`; `real-sdk-probe.sh` +
  `real-sdk-probe-output.txt` (import only; re-anchored and run in round 2, not re-run in round 3: the function module changed by one comment)

`join-service.test.mjs` drives every request through the HTTP handler that `functions/join.mjs`
registers, so the real Blob adapter runs in every test. The Azure packages resolve to stubs through
a module hook; the storage stub hands the adapter an in-memory container that answers each
conditional case with the status Azurite gave the real SDK (calibration below). Every storage call
yields and can be paused per request, which is how each race is replayed at every storage step of
the paused request. The test clock is node's mocked `Date` (`mock.timers`, still marked experimental
on Node 22; it prints a warning, and a change to that API would show as a red here first).

## Commands and results (all from the repo root)

- `node --test 'services/feedback/src/**/*.test.mjs'`: tests 76, pass 76, fail 0 (round 4; 71 in
  round 3, 69 before it). That is 57 join (13 + 41 + 3) plus 19 feedback (`record` 8, `record-hardening` 11); the feedback tests are
  unchanged. `join-service.test.mjs` alone, 3 runs in a row (round 4, after the last edit): pass 41,
  fail 0, exit 0 each time (slot choice is random, so this is the repeat check). The CI step for
  `services/*` asserts a non-zero pass count only, so no pinned count moves.
- Gates: `npm run thai-comments` scans src/ and scripts/ only, so it was also run scoped, as
  `node scripts/thai-comments.mjs services/feedback/src`: 9 files scanned, 0 Thai comment lines, exit 0.
  - `npm run added-lineno-citation-check`: exit 0.
  - `npm run check-citations`: exit 0.


## Where the sections went

This record was one file and is split by section so each part stays under the 12288-byte doc ceiling. Each section's text is unchanged; "below" and "above" inside a section now mean "in the file named here".

| section | file |
|---|---|
| Round 4: REFUTE round 3 (expiry at the commit, an owned name cap, a write trace) | `02-round-4-refute-round-3.md` |
| Round 3: no abuse budget, a new expiry clock | `03-round-3-no-abuse-budget.md` |
| Red on the code before round 2; Must-red (n = 64 mutants) | `04-red-before-round-2-and-must-red-mutants.md` |
| Azurite; Not covered | `05-azurite-and-not-covered.md` |
| Proposed privacy text: PROPOSED, not shipped (for the privacy page, after the section "ข้อมูลที่คุณส่งมาเอง") | `06-proposed-privacy-text.md` |
