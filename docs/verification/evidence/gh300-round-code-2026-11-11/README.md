# gh#300: round-code proof (2026-11-11, revised after REFUTE rounds 1–2, the SOLVE verdict, and REFUTE round 1 on the final round)

Pure-logic proof, with no UI, that the QR-mode round code of gh#299 decision 5 works, and how the card hand of decision 13 lands exactly. Base commit `ce720a6`, re-checked at `7cefc99` (a sibling docs commit; it touches none of these files). Code: `src/prize-draw/` (`schedule.ts`, `round-code.ts`, `cards.ts` and one `*.test.mjs` each).

## Owner rulings (popup, 2026-11-11)

- **R1:** the seed is 5 digits. A cut code is **9 digits**, a deal code **12**; the final code (D2 below) is **6**.
- **R4:** the conditional spread is **accepted as is, with no per-roster hard cap**. This was decided after the owner was told the earlier "max about ±0.44 points" understated it. The SOLVE verdict's random-roster numbers were per-event worst median 0.48, p90 0.57, max 0.72 points over 300 rosters, and a hand-picked roster reached 1.06 points. So nothing drops or re-draws seeds to cap a roster's spread.
- **R2:** card-round fate readable at the deal is **accepted**. The MC may pick the card game in any round.
- **R3:** "one name per device" is held by the client only; the admin review is the real guard.

## Verdict

- **Decision 5 holds.** A phone works out its own fate from the typed code plus the event key and its join identity. There is no server call at reveal. Phone and host agreed on 2,416,000 of 2,416,000 (identity, round) pairs. Its one other input is membership, from a status fetch after the start ("Membership contract").
- **Decision 13 holds, and the rule is drawn after the deal.** A card round's deal code carries two cuts, so either rule keeps exactly the scheduled count. A phone derives its own card from the code and its identity alone. Under R2, the |N − 2·keep| people whose card fixes their fate are accepted.
- **Decision 7 (equal odds) holds as stated under "Fairness claim":** exact ex ante; for a fixed event key, a disclosed spread, accepted by R4.
- **The final:** a 6-digit final code tells each finalist phone its index in the order the gh#304 tracer drew. It adds no new draw ("Final code").

## Protocol

- **Join identity:** an opaque id from a CSPRNG. QR mode uses the server's `randomBytes(16)`; admin mode uses the tracer's crypto ids. The phone stores it with the event key (the QR's PIN).
  - Identities are NFC-normalised on both sides.
  - A malformed identity (a lone UTF-16 surrogate) is refused with a RangeError by `canonicalIdentity`.
- **Fate value:** `fateValue` = FNV-1a over UTF-8 of (tag, event key, round, seed, identity), then the MurmurHash3 32-bit finaliser, scaled to [0, 1000). It is synchronous.
  - **One hash implementation:** `hashToScale` and `fateValue` are both built on the exported `hashPrefixState` + `hashFromPrefixBytes`. `fateValue` caches the prefix state (keyed on event key, round and seed) and a bounded map of identity bytes, filled only after `canonicalIdentity` accepts the identity. A unit test pins the cached path to a from-scratch reference over 20,000 interleaved calls.
- **Cut round (`hostCutRound`):** the host draws a 5-digit seed, ranks the live roster, and ships seed + cut + check. A phone is in when its value is below the cut. On a boundary tie, the host draws again. Roster order changes neither the code nor the survivor set; a test checks this.
- **Deal round (`hostDealCuts`, `hostDealRound`):** seed + low cut + high cut + check. Rule 0 keeps the lowest `keep` values and rule 1 the highest `keep`.
- **Check digit:** Damm over the round number followed by the code.
  - `ROUNDS` = 1–4 take cut or deal codes (9 or 12 digits). `FINAL_ROUND` = 5 takes only a 6-digit final code.
  - Lengths never overlap, and every round number is one digit (round 10 would share Damm state with round 2). So a typo, an adjacent swap, or a code typed into the wrong round is refused.
  - Accepted input: ASCII or Thai numerals; spaces and dashes are ignored.
- **Staying out:** `phoneVerdicts` folds over every code so far; once out, it stays out. A bad code, or a missing drawn rule, stops the fold.
- **Schedule (`proposeSchedule`):** an even geometric shrink to 5, snapped to a 1-2-5 number within 1.6x, for n >= 9.

## Why this approach

| Approach | Verdict | Reason |
|---|---|---|
| (a) threshold keep/alive, re-draw until the count lands | rejected | The phone needs both counts after the review. About 1 seed in 18 lands at 200 → 100 (binomial pmf 0.056, computed). |
| (b) code seeds a permutation of the roster | rejected | The phone would need the reviewed roster: a second server fetch of the whole list. |
| **(c) cut in the code** | **chosen** | The code alone fixes the exact count. The phone needs no head count, keep count or roster. About 1.05 tries per round. |
| one seed for the event, shrinking cuts | rejected | The final ranking would be computable from the round-1 code. |

## Membership contract

A name removed at the admin review keeps its phone, and the code math alone may say "in" (counter-example: guests 001–050, guest-001 removed, keep 20).

- `phoneVerdicts(eventKey, identity, entries, membership)` and `phoneFinalSlot(...)` take `membership`: `'confirmed' | 'removed' | 'unconfirmed'`. There is no default.
- **Source:** one non-blocking status fetch after the host starts the event and before any reveal, built by gh#308 / gh#309. Decision 5 forbids only reveal-time calls.
- **`removed`:** always reads `removed`, never `in`, and never gets a final slot.
- **`unconfirmed`:** computes the fates but returns `provisional: true`; the UI says the main screen decides.

## Fairness claim

- **Ex ante: EXACT, by exchangeability.** Identities are i.i.d. random strings from a CSPRNG, the event key is random, and the survivor set ignores roster order. So before the ids exist, every identity's chance in a round is exactly keep/N.
- **Conditional on one event's key and ids: a disclosed spread, not a bound.**
  - Over all seeds, each identity's chance is then a fixed number that drifts from keep/N, with SD sqrt(p(1 − p) / valid seeds). Any short code has this.
  - With random ids, 5 SD is crossed in about 1 event in 5,000.
  - A hand-picked roster has reached 0.0106: the REFUTE judge's, 1.06 points. Our own rebuilt one reaches 0.00977.
  - R4 accepts this spread with no per-roster cap.
- **The gate is a seeded sweep of random rosters** in `simulate.mjs`. Each roster's every seed is enumerated through production `fateValue` (no private hash copy), and four gates apply:
  - pooled z SD in [0.97, 1.03]
  - fraction |z| > 3 in [0.0017, 0.0037]
  - max |z| <= 5
  - median per-roster worst deviation <= 0.006
- **Fixed-roster checks are canaries, not the gate:** the N = 12 unit test and the deal-round enumeration in `deal-check.mjs`.
- **The aggregate SHA-256 comparison of earlier revisions did not prove per-identity fairness** and has been removed. The sweep's z-distribution gates take its place.
- **Re-roll (R3):** a player who re-joins to re-roll their id is stopped only by the admin review.

## Final code (SOLVE verdict D2)

- **`hostFinalCode(eventKey, order)`:** `order` is the tracer's already-drawn final order, a plain array of 5 identities, where index = slot.
  - It scans 5-digit seeds from zero for the first whose `hashToScale('final', …, 5)` sends every finalist to its own index, and returns that seed plus a check digit (6 digits).
  - It never draws, so it cannot change the order. It returns null if no seed encodes the order; the caller then shows no final code and never redraws.
  - It throws RangeError on a hole in `order` (a sparse array) or a slot that is not a string, as it already did on a wrong length or a duplicate.
- **`phoneFinalSlot(eventKey, identity, entries, finalCode, membership)`:** returns `{ verdict, slot, provisional }`.
  - It gives a slot only when the fold over rounds 1–4 reads `in`. An eliminated phone holding the final code reads `out` with no slot. `removed` stays `removed`.
  - The final code is never folded by `phoneVerdicts`, so a fifth entry there is still a bad code.
- **Overturned on purpose:** the earlier "round 5 is refused" rule. Round 5 now admits a 6-digit code and nothing else. The round-domain test was updated and a length/round matrix test added.
- **Measured:**
  - 2,000 random orders of 5 random ids: 0 unencodable. Seeds scanned: median 2,109, p99 14,323, max 25,477 of 100,000.
  - The SOLVE agent's own run: 240,000 finalist/permutation pairs, mean 32 encoding seeds each, min 11, none unencodable.

## Numbers

Commands, run from the repo root. Each script asserts its checks, prints `checks failed: K`, and exits 1 on any miss.

| command | runtime | result | exit |
|---|---|---|---|
| `node docs/verification/evidence/gh300-round-code-2026-11-11/simulate.mjs 1` (output: `simulate-output.txt`) | 493 s (sweep through production `fateValue`: 0.87 s/roster at N = 200, 1.23 at N = 300; measured while the mutant sweep ran alongside on another core, so not a lone-run timing) | 0 checks failed | 0 |
| `node docs/verification/evidence/gh300-round-code-2026-11-11/deal-check.mjs` (output: `deal-check-output.txt`) | about 13 s | 0 checks failed | 0 |
| `node --test src/prize-draw/*.test.mjs` (seeded test PRNG) | about 1.4 s | 30 tests, 0 fail | 0 |

- **Code lengths:** cut 9 (for example `267 545 271`), deal 12, final 6. Digits only.
- **Tries per round:** n = 20,000 events × 4 rounds per N; the asserted bound is 20. The ideal i.i.d. control agrees within 6 standard errors (asserted).

  | N | cut: mean / p99 / worst | deal: mean / p99 / worst |
  |---|---|---|
  | 50 | 1.011 / 2 / 3 | 1.019 / 2 / 4 |
  | 52 | 1.012 / 2 / 3 | 1.021 / 2 / 4 |
  | 200 | 1.049 / 2 / 4 | 1.058 / 2 / 4 |

- **Phone == host:** 400,000 + 416,000 + 1,600,000 (identity, round) pairs at N = 50 / 52 / 200 (2,000 events each), 0 mismatches. Deal-round cards: 740,000 + 178,000 + 148,000 at N = 200 / 52 / 37, 0 mismatches.
- **Random-roster sweep** (round 1, every one of 100,000 seeds per roster, ids in the production shape from a seeded PRNG):

  | N → keep | rosters | z values | pooled z SD | fraction \|z\| > 3 | max \|z\| | per-roster worst deviation: median / p90 / max |
  |---|---|---|---|---|---|---|
  | 200 → 100 | 300 | 60,000 | 0.9942 | 0.00280 | 4.27 | 0.00486 / 0.00586 / 0.00709 |
  | 300 → 100 | 150 | 45,000 | 0.9994 | 0.00267 | 4.17 | 0.00485 / 0.00565 / 0.00670 |

- **Production path:** the sweep calls production `fateValue` for every (seed, identity), so there is no hash copy left to keep in parity. Its enumeration's separability rule equals `hostCutRound`'s on 300 of 300 forced seeds, asserted before the sweep runs (`enumeration-control`).
- **Canaries:**
  - The N = 12 unit test: 99,421 valid seeds, max deviation 0.00464 against 5 SD = 0.00793.
  - Deal rounds in `deal-check.mjs`: max 0.00462 / 0.00386 / 0.00373 at 200 → 100 / 50 → 20 / 20 → 5, each inside its own 5 SD.
- **Reach-the-final detector** (cut rounds; max |z| <= 4 at the stated n):

  | run | max \|z\| | result |
  |---|---|---|
  | N = 200, 40,000 events | 2.66 | pass |
  | N = 50, 40,000 events | 2.78 | pass |
  | unit test, N = 50, 3,000 events | 2.13 | pass |
  | ×0.90 variant / ×0.97 variant / no finaliser, N = 200 | 16.91 / 5.16 / 19.25 | red, as required |

- **Cards:** 8,000 of 8,000 dealt rounds exact under both rules at each of N = 200, 52 and 37. Decks needed at 200 → 100: mean 19.5, max 32.

## Card method

1. A deal round offers a rule pair (`RULE_PAIRS`): black with face cards, or clubs with face cards. The pair follows from the code.
2. Each identity falls in one of four groups (both rules / first only / second only / neither) and is dealt a face from that group, with repetition.
3. The host draws the rule **after** the deal; either rule keeps exactly `keep`.
4. **Readable at the deal (accepted by R2):** |N − 2·keep| holders, asserted per step by `deal-check.mjs`. Examples: 10 of 50 at 50 → 20; 10 of 20 at 20 → 5; none on halving rounds.
5. N = 52 is not special: one deck matches none of the rules at 52 → 20.

## Must-red record

| target | how it was made red | result |
|---|---|---|
| sweep median gate | `SEED_DIGITS` back to 4, full 300 + 150 rosters | exit 1, on the median gate only (0.01533 / 0.01564 > 0.006) |
| sweep max \|z\| gate | hand-picked roster (`handpick.mjs` → `handpicked-roster.json`; `simulate.mjs roster <file>`) | exit 1: max \|z\| 5.88, worst deviation 0.00977 |
| hash-parity control (superseded: the copy is gone) | one finaliser constant changed in the script's hash copy | exit 1: 8,996 parity failures; 297 of 300 separability mismatches |
| sweep runs production `fateValue` (final-round REFUTE r1, finding 1) | judge's mutant `if (identity.startsWith('dn')) return 0;` injected into production `fateValue`; `simulate.mjs sweep 300 150` (output: `sweep-judge-mutant-output.txt`) | exit 1, 6 checks failed: pooled z SD, fraction \|z\| > 3 and max \|z\| at both N. N = 200: 5.46 / 0.00668 / 301.49; N = 300: 6.29 / 0.00782 / 416.03. The median gate stayed green (0.00491 / 0.00488), so only the per-identity gates see this bias. Restored from a copy; sha256 equal to the pre-mutation file |
| `fateValue` cache keyed on every prefix field | the seed dropped from the cache key | the from-scratch reference test red, with 11 others |
| final-round REFUTE r1, finding 2 (sparse order) | the code before the hole / non-string check | "hostFinalCode refuses a sparse order" red (1 fail) |
| final: eliminated phone reads out | the alive check deleted from `phoneFinalSlot` | test red |
| final: round 5 admits the final code | the old "round 5 refused" restored | final and matrix tests red |
| roster order irrelevant | the ranking sort removed | roster-order test red (with many others) |
| finding 2 (membership) | the `removed` branch deleted | membership test red |
| finding 3 (lone surrogate) | the check deleted | malformed-identity test red |
| finding 4 (`simulate.mjs` exits on a miss) | phones always say `out` | exit 1 |
| finding 4 (`deal-check.mjs` exits on a miss) | every forced seed thrown | exit 1 |
| finding 5 (round domain) | the domain checks deleted | round-domain test red |
| NEW-2 (gate uses the actual valid-seed count) | guest-001 ×0.98275 | inside the old fixed-floor bound (0.008062 <= 0.008333), outside the true one (> 0.007929 at 99,413 valid seeds); the test is red under the old denominator |

- The earlier seams (the stubs, plus 6 mutants) are unchanged.
- Every mutation was made on a copy-backed file and the hash compared after restore.

**Not re-homed:** the REFUTE judge's own hand-picked id list was not in the files handed over. `handpicked-roster.json` is a rebuilt roster, made by a documented deterministic greedy method, not the judge's list.

## Conditions for the owner

1. Phones enter every round's code in order; the main screen keeps earlier codes visible.
2. Membership comes from one status fetch after the start (gh#308 / gh#309). Until it answers, results are provisional.
3. Odds are exact ex ante. The conditional spread is accepted as is (R4). Re-roll is guarded by the admin review only (R3).
4. Card rounds: readable-at-deal fates are accepted (R2), and the person taps which rule came out.
5. The final code exists only when the tracer hands an order; if none encodes, no final code is shown.

## Not covered

- The final game's draw itself (the tracer owns it).
- Joint fairness (pairwise co-survival).
- Whole-event reach-final frequency through deal rounds.
- Real-phone timing.
- Approach (a)'s "1 seed in 18" figure is computed, not simulated.
