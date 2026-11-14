# ADR-0079 — The prize draw's final round code carries the event's prize count

Date: 2026-11-14 · Status: accepted (owner ruling 2026-11-14, on the gh#309 open points) ·
Relates: [ADR-0076](0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md) (Identity: the event key is the PIN, the join id is the identity), gh#299 decision 5, gh#300, gh#309

Evidence: [`docs/verification/evidence/gh300-round-code-2026-11-11/README.md`](../verification/evidence/gh300-round-code-2026-11-11/README.md) (the round-code protocol and its fairness gates, which this change leaves byte-identical).

## Context

No ADR recorded the round-code format until now: gh#300 proved it, and its evidence README holds the format. This ADR records the one change to it.

In QR mode a phone computes its own result from the codes the main screen shows, with no server call at reveal time (gh#299 decision 5). The final always holds 5 finalists (`FINAL_SIZE`), but an event has 1 to 5 prizes, and a place past the prize count holds none (`winners` in `src/prize-event/event.ts`). The 6-digit final code (5-digit seed + check digit) told a finalist phone its place but not the prize count. So with 3 prizes, the finalists placed 4 and 5 were told `คุณได้รางวัล` ("you won a prize") while the main screen showed no prize for them (found in the gh#309 build).

Owner ruling 2026-11-14: add one digit to the final round code that encodes the event's prize count, and give a finalist placed past it the board's approved out frame (`reveal-out`) instead of the claim.

## Decision

**The final code is 7 digits: seed (5) + prize count (1) + check (1).** The prize-count digit is 1 to `FINAL_SIZE` (5).

- **The check digit covers it.** The Damm check runs over the round number, the seed and the count digit, so a single-digit typo in the count is refused like any other typo.
- **Parsing refuses any other count.** `parseCode` refuses 0 and 6 to 9 even under a valid check digit.
- **Lengths still never overlap:** cut 9, deal 12, final 7. A code typed into the wrong kind of round is still refused.

**The count is no input to any fate.** `hostFinalCode(eventKey, order, prizes)` scans seeds exactly as before: the final slot hash does not include the count, so the same order finds the same seed whatever the count. The count only rides in the code. So every fairness claim of gh#300 is unchanged. The evidence scripts (`simulate.mjs`, `deal-check.mjs`) were re-run on the changed code and printed the same result lines.

- `prizes` defaults to `FINAL_SIZE`, which is why the gh#300 evidence scripts, which never pass it, still run unchanged. The projector (`src/prize-event/view.ts`) always passes the event's own count.

**The phone (`src/prize-join/reveal.ts`) reads the count.**

- `phoneFinalSlot` returns the count with the slot.
- A finalist whose place is below the count gets the claim, `รางวัลที่ N`.
- A finalist at or past the count gets `reveal-out`, with the final's name in its heading.

## Rejected

- **Leave the code at 6 digits and let the staff check catch it:** the phone would still tell a non-winner they won, in front of the room.
- **A status-route field for the prize count:** the status call happens before the start, and the prize count is the MC's setup, not the join server's. It would also add a server dependency to the reveal path that decision 5 avoids.
- **Encode the prize count in every round's code:** only the final needs it, and the cut and deal lengths (9, 12) are owner-ruled (gh#300 R1).
