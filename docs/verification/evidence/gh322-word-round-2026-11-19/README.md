# gh#322: engine 2a proof — single-step word rounds for games 1, 5 and 7 (2026-11-19)

Pure-logic proof, with no UI, that a word round in event mode lands exactly on the cut under both candidates and both polarities, and that a phone rebuilds its own hand from the code plus a rule tap. Format follows the gh#300 card proof. Code: `src/prize-round/` (`conditions.ts`, `round.ts`, `fixtures.mjs`, one `*.test.mjs` per module). Phase-1 modules are imported, never edited: `hostDealCuts`, `fateValue`, `hashToScale`, `dammCheck`, `parseCode` (round-code), `proposeSchedule` (schedule), `cutsInHalf` (event, tests only).

The engine lives outside `src/prize-words/` because that directory's oracle pins its runtime modules to data and types only (the oracle's "runtime modules under src/prize-words carry no logic" test, and the spec's "Principles"). It imports the bank types and data from there.

## Method

- **Half-cut only** (owner ruling 2026-11-19 on gh#311): live = 2 × keep. `hostDealCuts` then returns two equal cuts, so every identity is in exactly one of two groups: group 0 (fate value below the cut, the lowest `keep`) or group 1.
- **Game 1:** a pair of conditions (A, B) from one family. Group 0 is dealt a hand of 3 distinct words from A∧¬B, group 1 from ¬A∧B (a hash-driven partial shuffle, the `cardFor` pattern generalised). Match = every word in the hand satisfies the drawn condition.
- **Games 5 and 7:** group 0 holds the first value of a pair (consonant class or English word type; a syllable count 1–4), group 1 the second. The two candidates are words, one per value, hashed from the pool.
- **Polarity:** "match = survive" keeps the matching group, "match = out" keeps the other. At a half-cut both keep exactly `keep`. The drawn candidate (0 or 1) and the polarity reach the phone by a rule tap (`RuleTap`).
- **Conditions** read one STORED cell each (`holds`): equality on scalar cells, membership on list cells (`letters`, `toneMarks`, `vowels`). Nothing is derived from spelling. Only `reviewed`, unretired words in a family's `eligible` list are dealt.
- **Feasibility is computed, never hand-kept:** for each language × pool × (game, family), every pair of present values is tested. Game 1 needs ≥ 3 words in each quadrant; games 5/7 need ≥ 1 word per held value. Every excluded pair carries its counts as the reason (`feasibilityReport`).
- **Wording** (Thai and English) is data marked `WORDING_PROVISIONAL`; final copy is the canvas ticket's (gh#325). No deal reads it.

## Code format (REFUTE round 1: 14 digits)

`seed (5) + cut (3) + bank revision (1) + kind (2) + pool (1) + format (1) + Damm check (1)` = **14 digits**, e.g. `03141 500 1 01 0 0 6`; the check is over the round number then the code. Kind 00–49 indexes `KINDS`; 50–99 is engine 2b's block (gh#323 shares the family). Revision = `BANK_REVISION` mod 10 of the host's build. Format is 0.

- **Why 14:** the first cut was 11 digits, one deletion from a deal (12). One insertion into the real deal code `006693614308` gave a valid game-4 code. Every phase-1 length (7, 9, 12) is now ≥ 2 away, and Damm rejects every single substitution and adjacent swap inside the family. 13 would sit one insertion from a deal.
- **Measured** (`../gh323-scripted-cut-2026-11-19/codes-output.txt`, 2,000 valid codes per kind, every single edit): 0 of 6,408,296 edited or foreign codes accepted by the word or script decoder. The old 11-digit word code accepted 1,889 of 493,690 deal-code edits.
- **Refused:** cut 000 (no half-cut host mints it), format ≠ 0, kind outside `KINDS`. A phone on another revision returns `{ refused: 'stale-bank' }` and never deals; a bad code returns `{ refused: 'bad-code' }` (`phoneWordVerdict` returns the reason).
- **Non-half-cut:** the host throws on `live ≠ 2 × keep`; the decoder refuses every phase-1 code by length.

## Numbers

Commands run from the repo root. `proof.mjs` prints `checks failed: K` and exits 1 on a miss.

| command | runtime | result | exit |
|---|---|---|---|
| `node --test 'src/prize-round/*.test.mjs' 'src/prize-words/*.test.mjs'` | about 5 s | 86 tests, 0 fail (with engine 2b's and the bank's) | 0 |
| `node docs/verification/evidence/gh322-word-round-2026-11-19/proof.mjs sweep` (output: `sweep-output.txt`) | 61 s | 0 checks failed | 0 |
| `node docs/verification/evidence/gh322-word-round-2026-11-19/proof.mjs bank` (output: `bank-feasibility-output.txt`) | under 1 s | as stored: 0 of 88 rows (no word reviewed); review ignored: 88 of 88 | 0 |

- **Configurations:** every half-cut step of `proposeSchedule(N)` for N = 9..300 (`cutsInHalf`): **396 configurations**. They contain only **5 distinct live → keep shapes**: 10 → 5, 20 → 10, 40 → 20, 100 → 50 and 200 → 100. The rosters and event keys differ per configuration.
- **Fixture setups:** 57 (game, language, pool, family) combinations with a feasible pair in the fixture banks. A test asserts that every one of the 22 `KINDS` entries has at least one, so every kind is dealt.
- **Sweep A** (every configuration × every setup × 3 event keys): 67,716 rounds, 2,989,080 identities, 270,864 cut checks (round × 2 candidates × 2 polarities), 2,989,080 phone checks. **0 cut mismatches, 0 phone mismatches**, 0 holders matching both or neither candidate, 0 pending or retired words dealt, 0 bad hands (each hand holds distinct words, all from its own group's quadrant).
- **Sweep B** (N = 40, 100, 200, every half-cut step: 40 r1, 40 r2, 100 r1, 100 r3, 100 r4, 200 r1, 200 r2 × every setup × 20 event keys): 7,980 rounds, 558,600 identities, 31,920 cut checks, **0 mismatches** of any kind.
- **What a phone check compares:** the phone rebuilds its holding and both candidates from (event key, identity, round, code) only. It must equal the host's holding (word ids in order, or the held value) and candidates, and agree with the host on all 4 taps. One `phoneWordVerdict` call per identity, rotating the tap, is compared against the count's own evaluation.
- **Survivors are counted from the dealt items:** each holding is evaluated through the condition predicate in the sweep (`fixtures.mjs`, `sweep`), not through the round module's own verdict. The host's `hostSurvivors` count is asserted equal too.
- **Unit-suite sweep:** the same checks at 2 event keys per configuration with one setup each (792 rounds, 34,960 identities), plus N = 40/100/200 × every setup (399 rounds, 27,930 identities). Both run in the suite, which CI collects through its `src/**/*.test.mjs` glob.

## Must-red record

Each mutant was applied in a sandbox copy of `src/` at the final file state, one at a time, and restored by hash. The repo's files were never mutated. Every red listed is an assertion failure, except where a crash is named.

| target | mutant | red (test that failed) |
|---|---|---|
| quadrant composition | hands drawn from every eligible word (`quadrants: [words, words]`) | exact-cut sweep (cut 2,450, suspense 24,952, hand 26,118 bad), N = 200/100/40 sweep, golden vectors. `proof.mjs sweep` exit 1: A cut 208,308 / B cut 24,568 bad |
| game 5/7 composition | every holder gets the pair's first value | both sweeps, wrong-code test, golden vectors |
| phone == host | phone's group boundary `<=` instead of `<` | both sweeps, wrong-code test |
| review filter | pending words admitted | eligibility test, both sweeps, golden vectors, never-dealt test |
| retired filter | retired words admitted | eligibility test, both sweeps, never-dealt test |
| 3-word quadrant floor | floor 1 | the 3 + 2 / 3 + 3 threshold test and the feasibility-report test, as assertions; the two sweeps, both golden tests and the never-dealt test as crashes (a hand drawn from a quadrant smaller than 3 reads an undefined word) |
| Damm check; length `<`; format ignored; cut 000 accepted; revision check removed; empty setups or configs cut to N = 40 in `proof.mjs` (coverage pinned: 396 configs, 57 setups, 22 kinds) | (round 1 fixes; recorded in `../gh323-scripted-cut-2026-11-19/must-red-output.txt`) | typo tests, crossover test, two-build test; `proof.mjs sweep` exit 1 |
| mode table | `KINDS` entries 0 and 1 swapped | KINDS-table test, golden vectors |
| half-cut host guard | removed | "host refuses any round that is not a half-cut" |
| golden vectors vs bank order | golden test run on a reordered pool | golden vectors |
| the reorder-sensitivity test | pool order ignored (words sorted by id) | "the golden vectors see a reordered pool" |
| stored cells only | `firstChar` read from the text | "every predicate reads the stored cell" |
| list-cell membership | `toneMarks` treated as a scalar | Thai equality/membership test, every-kind test |
| value order | numbers sorted descending | value-order test |
| wording | dotted circle removed | wording test |
| every kind dealt | fixture without the 7 Thai office words that make `firstChar`, `toneMarks` and `karan` feasible | every-kind test. That fixture is the state before the words were added, when those three Thai game-1 kinds had no setup and no sweep dealt them |

A scoped `tsc --noEmit --strict` over `round.ts` and `conditions.ts` exits 0. Must-red for that instrument: a planted type error exits 2 (TS2322).

## Feasibility report: live bank, review ignored (sizing only)

Measured on the bank as stored: th 481 pending (34 retired), en 442 pending (80 retired), 0 reviewed, and the report offers 0 of 88 rows a pair: the review filter holds on the real bank. For sizing only, `proof.mjs bank` then stamps a copy `reviewed`. Snapshot (re-run 2026-11-19, REFUTE round 1): `bank-th.ts` sha256 prefix `0ad4e977fccdadab`, `bank-en.ts` `415c8842b609e9d2`; retired words stay excluded.

- **Words per pool:** th general 199, office 82, food 112, animal 88; en general 148, office 117, food 94, animal 83.
- **Every one of the 88 rows** (22 kinds × 4 pools) has at least one feasible pair. In total: 6,603 feasible pairs and 5,771 excluded pairs, each excluded pair with its quadrant counts.
- **Thinnest families:**
  - `karan`, `liveDead` and `doubleLetter` have one feasible pair each, the two values of the boolean or live/dead.
  - Thai animal `toneMarks` has 1 feasible pair (5 excluded).
  - English food and animal `syllables` have 3 feasible pairs (3 excluded).
- The full per-row table is in `bank-feasibility-output.txt`.

## Open risks

- **Wiring:** phase-1 `phoneVerdicts` reads a 14-digit entry as `bad-code`, and then every later round reads `unknown`. The game tickets need a fold that knows about word rounds, plus a rule tap carrying `{ rule, polarity }`.
- **Golden vectors pin the fixture banks only.** Real bank order is not pinned until words are reviewed; a later ticket must add a vector over reviewed live words.
- **Feasible pairs depend on the reviewed set.** The revision digit makes a stale phone refuse; it repeats every 10 revisions.
- **Small quadrants repeat hands.** A quadrant of exactly 3 words gives every holder in that group the same hand.
- **`KINDS` and `POOL_ORDER` are frozen code tables.** `KINDS` may grow to 50 entries.

## Not covered

- Fairness spread (inherited unchanged from gh#300: the groups come from `hostDealCuts`).
- Multi-step reveals (engine 2b).
- Thai text in 3D, the UI and the rule-tap screen.
- Final copy (gh#325).
- Games 2–4.
- The live bank's own golden vector.
