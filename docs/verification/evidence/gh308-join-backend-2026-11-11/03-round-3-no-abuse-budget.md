## Round 3: no abuse budget, a new expiry clock

Owner rulings, 2026-11-11: drop the create budget (the cost bound is a billing alert at the gh#310
deploy); drop the PIN throttle entirely (a wrong PIN answers 403 and writes nothing); the QR carries
the PIN; an event expires 24 hours after its start, or 72 hours after creation if never started; the
privacy text keeps "ภายในไม่กี่วัน". G4 (the counter can roll back) is moot: the counter is deleted.

New tests in `join-service.test.mjs`, each red on the round-2 code (`budget-drop-old-red-output.txt`:
tests 36, pass 28, fail 8, exit 1; the code was copied to scratch before any edit and the new test
file run there with `node --test src/join-service.test.mjs`):

| test | red on round 2 (its own assertion) |
|---|---|
| create number 101 in one hour answers 201 | 429 `busy` |
| 301 wrong PINs, then the right PIN in the same hour answers 201 | 429 `locked` |
| a wrong PIN answers 403 and leaves the container's blob set unchanged | a slot blob appeared |
| 200 phones, each with one overlapping retry: 200 answers 201, 200 answer 200, one id per phone, 200 names | all 400 answered 429 |
| a storage failure at each storage step of a join, for each of 300 phones (the name cap) in one event, then each phone's retry on healthy storage answers 200 or 201 | step 2 of 8, phone 299: 429 `locked` (300 stranded slots, so the retry's claim is the 301st) |
| a started event: live 23h59m after its start, gone at 24h01m (start 60 h after the create) | the start itself answered 404 `gone` |
| a never-started event: live at 71 h, gone at 73 h | 71 h read as gone |

The start comes 60 hours after the create on purpose: in that band a clock from creation (24 or 72
hours), or the shorter of the two, disagrees with the start clock on the live leg, and a longer start
clock or none disagrees on the gone leg. A one-phone version of the storage-failure test is green on
round 2 (one stranded slot is far below 300), so the test runs a full room.

Pre-existing tests changed, old -> new, and why:

- whole flow: `expiresAt` = create + 24 h -> create + 72 h (the never-started expiry; ruling 4);
- "an event expires 24 hours after it is created" -> the two expiry tests above (ruling 4);
- "a missing container is a 503, never a spent budget" (create only) -> create, status and join each
  answer 503 (with no counter, create's three refused puts also answer 503, so create alone no
  longer tells a missing container from an absent blob; status does: read as absent it says `gone`);
- "an event holds at most MAX_NAMES joins, and right PINs never use up the PIN budget" -> the name
  cap only (no PIN budget);
- deleted, the behaviour they pinned is gone by ruling, each with its replacement: "creation is
  budgeted app-wide" (101st is 429) -> create number 101 answers 201; "wrong PINs are budgeted per
  event" (right PIN 429 after 300 wrong) -> 301 wrong PINs then 201; "a parallel burst of guesses
  gets no more comparisons than the budget" -> the 200-phone burst, every request served; "two
  creates racing on the budget are both counted" -> none, the counter it raced on is deleted (G4).

Mutants changed (n = 45 -> 50, all red):

- "creation budget not enforced" -> "an app-wide create budget put back";
- "PIN budget as a counter: compare first, count wrong ones after" -> "a PIN counter after the
  compare that locks the event";
- "a right PIN keeps its slot" -> "the PIN throttle put back: a slot claimed before the compare"
  (reds 4 tests: wrong PINs, blob set, 200 phones, storage failure) and "a wrong PIN leaves a trace
  in storage";
- "expiry removed" re-anchored to the new clock; added "expiry clock from creation even after a
  start", "an unstarted event lives 24 hours", "a started event lives 72 hours", "create reports the
  start clock as its expiry".

Storage calls per join, measured with a counting store port on both versions of `join.mjs`: a correct
join 8 -> 5 (read, put slot, list slots, delete slot, head, list names, put, read -> read, head, list
names, put, read); a wrong-PIN join 3 -> 1 (read only), and it leaves no blob.

The lifecycle rule (ADR-0076 Retention, layer 3) moves from 1 day to 4 days: an unstarted record
sits unmodified for up to 72 hours, and the latest expiry is 96 hours after creation.

