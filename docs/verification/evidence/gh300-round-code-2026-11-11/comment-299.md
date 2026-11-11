## #300 result (after REFUTE rounds 1–2, the SOLVE verdict, and REFUTE rounds 1–2 on the final round — round 2 PASS): the round code works. Decisions 5 and 13 hold.

Proof: pure logic in `src/prize-draw/` (`schedule.ts`, `round-code.ts`, `cards.ts`, 30 `node --test` tests). Evidence, with every number, its command and n: `docs/verification/evidence/gh300-round-code-2026-11-11/README.md`. Both evidence scripts assert their checks and exit 0, and each was shown to exit 1 under a mutation.

**Owner rulings recorded:**
- **R1:** codes are 9 digits (5-digit seed); card rounds use 12, and the final code 6.
- **R4:** the conditional spread is accepted as is, with no per-roster hard cap. The owner decided this after being told the earlier "±0.44 points" understated it: random rosters gave a per-event worst median of 0.48, p90 0.57 and max 0.72 points over 300 rosters, and a hand-picked roster reached 1.06 points.
- **R2:** a card-round fate readable at the deal is accepted.
- **R3:** "one name per device" is held by the client only; the admin review is the real guard.

### Decision 5 (phone results from a round code, server at join only): holds

- **What the phone keeps from join:** the event key (the QR's PIN) and its identity, a CSPRNG id from the server (`randomBytes(16)`). A malformed identity (lone surrogate) is refused.
- **How it works:** the host ranks the live roster by a hash and ships the seed plus the cut value, so the code alone fixes the exact count. Roster order changes neither the code nor the survivors.
- **Measured:**
  - Phone == host on 2,416,000 of 2,416,000 (identity, round) pairs at N = 50, 52 and 200.
  - Tries per round: worst 4, p99 2 (n = 80,000 draws per N).
- **Check digit:** refuses typos, adjacent swaps and wrong-round codes.
  - Rounds 1–4 take only 9- or 12-digit codes; round 5 takes only the 6-digit final code.
  - This deliberately overturns the earlier "round 5 refused".
- **Membership contract:** one non-blocking status fetch after the host starts and before any reveal, built in #308 / #309; decision 5 forbids only reveal-time calls.
  - `removed`: the phone reads `removed`, never `in`, and never gets a final slot.
  - `unconfirmed`: results are provisional, and the UI says the main screen decides.
- **Condition:** phones enter every round's code in order, so the main screen should keep earlier codes visible.

### Decision 7 (equal odds): exact ex ante; a disclosed spread for a fixed event, accepted (R4)

- **Ex ante, exact by exchangeability:** ids are i.i.d. CSPRNG strings, and the survivor set ignores roster order. Before the ids exist, every identity's chance is exactly keep/N.
- **Once one event's key and ids are fixed:**
  - Each identity's chance over all seeds is a fixed number with SD sqrt(p(1 − p) / valid seeds). This is a disclosed spread, not a bound.
  - With random ids, 5 SD is crossed in about 1 event in 5,000.
  - A hand-picked roster reached 1.06 points (our rebuilt one: 0.98 points).
- **Gated by a seeded sweep of random rosters** in production id shape, every seed enumerated per roster through production `fateValue` (one hash implementation; the sweep's private copy is gone):
  - N = 200, 300 rosters: pooled z SD 0.994, fraction |z| > 3 0.0028, max |z| 4.27, worst-deviation median 0.49 points.
  - N = 300, 150 rosters: 0.999 / 0.0027 / 4.17 / 0.49 points.
  - A 4-digit seed fails the median gate (1.53 points), and the hand-picked roster fails max |z| (5.88).
  - Final-round REFUTE r1, fix 1: the judge's mutant (ids starting `dn` get fate 0) injected into production `fateValue` reds the sweep (exit 1; max |z| 301 at N = 200, 416 at N = 300). The sweep used to measure a private hash copy, so only a sampled parity check stood between a production-only bias and the gates.
- **The earlier aggregate SHA-256 comparison did not prove per-identity fairness**; it is replaced by the sweep.

### Decision 13 (composed hand, phone shows its card before the rule): holds

- **The rule is drawn after the deal.** The 12-digit deal code carries two cuts, so either rule keeps exactly the scheduled count: 24,000 of 24,000 dealt rounds at N = 200, 52 and 37.
- **The phone derives its own card from the code and its identity alone.** |N − 2·keep| people per round can read their fate off it; R2 accepts this. For example 10 of 20 at 20 → 5, and none on halving rounds.
- **Costs:** the person taps which rule came out, and faces repeat (200 → 100: mean 19.5 decks, max 32).

### The final (SOLVE D2)

- **`hostFinalCode(eventKey, order)`** encodes the order the #304 tracer already drew, as a 6-digit code: the first 5-digit seed whose final hash sends each finalist to its index, plus a check digit. It never draws. If no seed encodes the order it returns null, and the caller shows no final code.
  - Measured: 0 of 2,000 random orders unencodable; median 2,109 seeds scanned.
  - Final-round REFUTE r1, fix 2: a sparse `order` (a hole) or a non-string slot is refused with RangeError; a new test was red on the old code.
- **`phoneFinalSlot`** gives a finalist its index only when its rounds 1–4 fold reads `in`. An eliminated phone holding the final code reads `out`.

### For the follow-up tickets

- #304 hands `order` (a plain array) to `hostFinalCode`, and reuses `proposeSchedule`.
- #306 / #309 build on `hostCutRound`, `hostDealRound`, `phoneVerdicts`, `phoneFinalSlot` (both with membership) and `phoneCard`.
- #308 / #309 build the post-start membership fetch.
- Not covered: pairwise fairness; real-phone timing.
