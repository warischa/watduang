# gh#323: engine 2b proof — multi-step scripted-cut rounds for games 2, 3 and 4 (2026-11-19)

Pure-logic proof that games 2 (ตัวอักษรในมือ), 3 (บิงโกอักษร) and 4 (คำต่อคำ) cut exactly at a half-cut under both candidate scripts and both polarities, and that a phone matches the host at every step from the code plus a rule tap.

Code in `src/prize-round/`: `script-kit.ts` (types, hashes, `scoreAt`), `scripted.ts` (host/phone engine), `letters.ts` / `bingo.ts` / `chain.ts` (compositions), `scripted-fixtures.mjs` (fixtures, sweep), `code-crossover.mjs` (edit measurement), each with tests.

Phase-1 modules are imported only. REFUTE round 1 moved both engines onto one 14-digit code (`round.ts`).

## Method

- **Half-cut only** (owner ruling 2026-11-19): live = 2 × keep. `hostDealCuts` puts each identity in group 0 (fate value below the cut, the lowest `keep`) or group 1.
- **Two candidate scripts plus a rule tap.** Each game composes scripts 0 and 1 so that group 0 matches script 0 and not script 1, and group 1 the reverse.
  - A phone rebuilds its holding from the code before the reveal (`phoneScriptDeal`).
  - It learns the drawn script and the polarity only from the tap (`RuleTap` from engine 2a).
  - It then follows each step on its own (`phoneScriptTrace` / `phoneScriptStep`).
  - Its holding matches exactly one candidate, so no phone holds the ending before the reveal.
- **One scorer for all three games.** A script is a list of items revealed one per step. After step k, a holder's score is the number of held items among the first k script items. The holder matches when the final score reaches the game's threshold.
- **Game 2** (threshold 1): two candidate words A and B from the pool.
  - Group 0 holds one tile from `letters(A) − letters(B)` and group 1 one tile from `letters(B) − letters(A)`, read from the stored `letters` cell.
  - A pair needs at least 2 tiles on each side (`MIN_TILES_PER_SIDE`).
  - Each step reveals one letter of the stored `letters` cell, so scoring reads only the stored cell; `text` only orders the steps (first appearance; a stored letter the text lacks goes last). REFUTE round 1: a `cat` row storing b, q, r, z now reveals and scores b, q, r, z.
  - Tile alphabet (a choice, named here): any codepoint in `letters`, vowel signs and tone marks included, as Thai crossword tiles are.
- **Game 3** (threshold 4): no bank is read. The alphabets are 42 Thai consonants (the 44-consonant table minus the obsolete U+0E03 and U+0E05) and 26 English letters. A hash splits each alphabet into four sets:

  | Set | Letters | Drawn by |
  |---|---|---|
  | SHARED | 6 | both scripts |
  | OWN_0 | 6 | script 0 only |
  | OWN_1 | 6 | script 1 only |
  | REST | the remainder | neither |

  - Each script is 12 draws: SHARED plus its own set.
  - A group-g card has 9 distinct letters: m − z letters from OWN_g, z ≤ 3 from SHARED, and 9 − m from REST, with m from 4 to 6.
  - Under its own script a card scores m (4 to 6). Under the other it scores z (0 to 3).
  - So every survivor has more marks than every eliminated player. "Fewest marks are out" is exact with no tie, which **supersedes the hash tiebreak** in the gh#311 body.
- **Game 4** (threshold 1): two word-disjoint chains of `CHAIN_LENGTH` = 5 words.
  - Group 0 holds a word of chain 0 and group 1 a word of chain 1. Each person's word is a hash of their identity over the chain positions, because a phone knows neither the roster nor `keep`.
  - Search: depth-first in an order hashed from the round, capped at 100,000 visited nodes (a count, so host and phone agree). A pool is feasible only if the bank-order search finds a pair within the cap; a round whose seeded search hits the cap falls back to that pair. REFUTE round 2: a 101-row pool where every chain needs one shared word took 44 s, now infeasible in 28 ms. Brute-force agreement: 300 random graphs × 4 orders.
- **Link rule** (owner ruling 2026-11-19, implemented literally):
  - Thai: a word is chain-eligible only if its stored `lastChar` is in the 44-consonant table, and the next word's stored `firstConsonant` must equal it. So words ending in อ, ว or ย qualify, for example `th-general-013` (ends ว), `th-general-022` (ends ย) and `th-general-053` (ends อ).
  - English: the stored `lastChar` must equal the next word's `firstChar`.
  - Every chain word must be chain-eligible.
- **Polarity:** both proven for all three games; meaningful for game 2 (hit = out / saved). gh#311 states one direction for games 3 and 4; offering the reverse is a product call.
- **Only `reviewed`, unretired words** reach games 2 and 4.

## Code format (REFUTE round 1: shared 14-digit family)

A script code is engine 2a's word-family code (`round.ts` `familyCode`): `seed (5) + cut (3) + bank revision (1) + kind (2) + pool (1) + format (1) + Damm check (1)` = **14 digits**, e.g. `03141 500 1 50 0 0 8`. Kind 50–55 = `SCRIPT_KINDS` (game 2/3/4 × th/en); 00–49 is engine 2a's. Game 3 only under pool digit 0; format 0; cut 000 refused (no half-cut host mints it). The revision digit is `BANK_REVISION` mod 10: a phone on another revision gets `{ refused: 'stale-bank' }` and never deals (two-build test).

- **Why:** the first cut was 13 digits, one insertion from a phase-1 deal (12): the judge turned the real deal code `006693614308` into a valid game-4 code. All phase-1 lengths (7, 9, 12) are now ≥ 2 away, and one Damm check covers both engines, so no single substitution, insertion, deletion or adjacent swap crosses a kind.
- **Measured** (`proof.mjs codes 2000`, `codes-output.txt`): 2,000 valid codes of each kind (cut, deal, final, word, script); every single edit offered to every decoder, each code also offered as is to other kinds' decoders.

| source → decoder | before (11 / 13 digits) | now (14) |
|---|---|---|
| deal edited → word | 1,889 / 493,690 | 0 / 493,690 |
| deal edited → script | 8 / 493,690 | 0 / 493,690 |
| word or script edited → phase-1 | not measured | 0 / 1,142,238 |
| every other row into word/script | 0 | 0 |

Total now: 0 of 6,408,296 edited or foreign codes accepted by the word or script decoder.

## Numbers

Run from the repo root, 2026-11-19. Fixtures: `scriptFixtureBanks()` = engine 2a's plus 37 words giving two disjoint chains of 5 in the general, office and food pools; animal stays thin, so 16 of 18 setups play.

| command | runtime | result | exit |
|---|---|---|---|
| `node --test 'src/prize-round/*.test.mjs' 'src/prize-words/*.test.mjs'` | about 5 s | 86 tests, 0 fail | 0 |
| `node docs/verification/evidence/gh323-scripted-cut-2026-11-19/proof.mjs sweep` (`sweep-output.txt`) | 108 s | 0 checks failed | 0 |
| `node docs/verification/evidence/gh323-scripted-cut-2026-11-19/proof.mjs codes 2000` (`codes-output.txt`) | 12 s | 0 accepted | 0 |
| `node docs/verification/evidence/gh323-scripted-cut-2026-11-19/proof.mjs bank` (`bank-output.txt`) | about 1 s | as stored: 0 of 16 bank setups play; review ignored: all 16 play | 0 |

- **Configurations:** 396 half-cut steps of `proposeSchedule(N)` for N = 9..300, in 5 shapes: 10→5, 20→10, 40→20, 100→50 and 200→100.
- **Sweep A** (every configuration × all 16 setups × 3 event keys): 19,008 rounds (game 2: 9,504; game 3: 2,376; game 4: 7,128), 839,040 identities, 76,032 cut checks, 22,028,440 step checks.
  - **0 cut, 0 phone, 0 step, 0 suspense, 0 cross-group, 0 script mismatches.**
  - Game 3: the lowest survivor had 4 marks and the highest eliminated had 3.
- **Sweep B** (N = 40/100/200, all 7 half-cut steps × 16 setups × 20 keys): 2,240 rounds, 156,800 identities, 4,119,620 step checks, 0 mismatches of any kind.
- **What each check compares.** The evaluator in `scripted-fixtures.mjs` is written apart from the composition modules:
  - Survivors are counted from dealt items and stored cells (game 4 with its own copy of the link rule) and must equal `keep` under all 4 taps, as must `hostSurvivors`.
  - Every holder must match exactly its own group's script (suspense) and hold nothing from the other side (cross-group).
  - Phone side: the deal must equal the host's holding; for **each of the 4 taps**, every step (item, score, step count) must equal the evaluator and `hostScores`, and the verdict the evaluator.
  - The phone runs on a `structuredClone` of the banks: no shared cache.
- **Unit suite:** the sweep at 2 keys (792 rounds); N = 40/100/200 × every setup; 6 golden vectors; reorder, crossover and two-build tests.

## Must-red record

Each mutant ran alone in a sandbox copy of `src/`, restored by hash. 34 mutants, each red in the unit suite (every failing test listed in `must-red-output.txt`, with the proof-script runs):

| mutant | red |
|---|---|
| skip the tap: the phone uses script 0 | sweeps, golden; `proof.mjs sweep` exit 1, A: cut 0, phone 1,421,944, step 6,971,898 |
| group leak, one per game (game 2 shown) | sweeps, golden; `proof.mjs sweep` exit 1, A: cut 8,870, cross 31,877, phone 0 |
| 13-digit family (format digit dropped) | crossover test, length test, typo tests, golden; `proof.mjs codes` exit 1 (deal → word 114, → script 112) |
| cut 000 accepted | both typo tests |
| revision check removed (2a; 2b) | the two-build test |
| game 2 reveal from `text` | the stored-cell scoring test |
| `setups = []`, or configs cut to N = 40, in either `proof.mjs` | `proof.mjs sweep` exit 1 (coverage pinned: 396 configs, 7 named, setups, every kind) |
| chain search uncapped; cap check removed; exhaustion misreported | pathological-pool test; capped-search test |

A leak reds cut and cross-group with phone == host intact; skipping the tap reds only phone and step. Scoped `tsc --noEmit --strict` (hand-picked flags) over `src/prize-round/*.ts`: exit 0; planted type error: exit 2.

## Live bank, review ignored (sizing only)

As stored: th 481 and en 442 words, 0 reviewed, so 0 of 16 bank setups play. Retired words (th 34, en 80) stay excluded; `proof.mjs bank` stamps a copy `reviewed`. Re-run after REFUTE round 2, table unchanged; sha256 prefixes: `bank-th.ts` `0ad4e977fccdadab`, `bank-en.ts` `415c8842b609e9d2`.

- **Game 2:** every pool has pairs, from en animal (1,451 pairs) to th general (16,144). The full table is in `bank-output.txt`.
- **Game 4:** the largest L with two word-disjoint chains comes from an exhaustive pair search per L, up to 15, with a 5 M node budget. A trailing `+` marks a lower bound.

| pool | th: eligible / L | en: eligible / L |
|---|---|---|
| general | 123 / 15+ | 119 / 15+ |
| office | 54 / 11 | 109 / 15+ |
| food | 74 / 10 | 76 / 8 |
| animal | 49 / **5** | 58 / 9 |

- All 8 pools play at `CHAIN_LENGTH` 5. Thai animal is exactly at the edge.
- The seeded search costs at most 1,465 nodes (th animal), out of 200 seeds per pool.
- Thai: 300 of 447 unretired words are chain-eligible. 147 end in a character outside the consonant table.

## Open risks

- **Holderless chain words at small cuts.** Holders hash over 5 positions:

  | shape | chains with a word nobody holds (sweep A) |
  |---|---|
  | 10→5 | 3,870 of 4,032 |
  | 20→10 | 2,527 of 5,436 |
  | 40→20 and above | about 0 |

  A fix needs a `keep`-dependent chain length (game-ticket call).
- **Thai animal game 4 sits at L = 5 exactly.** Review or retirement can make it infeasible. The host then refuses it with the reason.
- **The link rule is not yet in the spec.** `prize-words-spec.md` still lists it under "Open, for the owner", and the ticket's third box wants it recorded. `chain.ts` keeps the consonant table; no stored link attribute exists.
- **Wiring:** phase-1 `phoneVerdicts` reads a 14-digit code as `bad-code`. Game tickets need a fold that dispatches on length to `phoneScriptVerdict`/`phoneScriptTrace` with a `{ rule, polarity }` tap.
- **Typing cost:** 14 digits (was 11 / 13); the revision digit repeats every 10 revisions.
- **Golden vectors pin fixture banks only**; host and phone must share the bank bundle.
- **Game 2 Thai tiles include combining marks.** The canvas ticket decides their display.

## Not covered

- UI, canvas and copy.
- The Thai-in-3D still (a separate evidence directory).
- Fairness spread (inherited from `hostDealCuts`).
- The standalone pages.
