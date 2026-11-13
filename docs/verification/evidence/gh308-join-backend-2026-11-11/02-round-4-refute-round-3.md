## Round 4: REFUTE round 3 (expiry at the commit, an owned name cap, a write trace)

The judge's reproductions ran in a scratch copy: a start paused at its name listing across creation +
72 h answered 200 after status had read `gone`, and the event then lived to creation + 96 h and
beyond; with 299 names, 200 concurrent joins were all admitted (499 names, the reviewed start
answered 400); a join that writes and deletes a blob before the PIN compare passed all 36 service
tests, because they compared blob snapshots, not calls.

Fixes (ADR-0076 holds the protocol):

- Start re-checks `isLive` right before its conditional write, on the record version that write is
  conditional on, and stamps `started` with that time; once the write has landed it checks the clock
  again, and a write it cannot show landed while the event was live is put back (`If-Match` on the
  ETag it just wrote) and answered 404 `gone`. So `started` is never later than creation + 72 h, a
  start answered 200 committed while the event was live, and ADR-0076's latest expiry (creation +
  96 h, the lifecycle rule's sizing) holds by construction. Residual, stated in the ADR: between a
  write in flight across the expiry and the write that puts it back, status can read `started`.
- The name cap is `slots/0001` … `slots/0300` under the event. A join lists them, tries free numbers
  in random order with `If-None-Match`, and answers 409 `full` when every try is refused; the name
  blob is written only while a slot is held. A slot create that answers an error is followed by a
  HEAD: the slot holds the join's id, so one that committed anyway is used, not stranded. The listing count before the write is deleted. A failed
  admission releases its slot (unless its name blob was written, which then holds it and answers the
  same device's retry); a join that loses the name race releases its slot; the undo path deletes the
  name, then the slot; removal frees the slot whose metadata holds the removed id, and a retried
  removal of an id no longer listed frees it too.
- The test container's wrapper records every storage call (`callsOf(tag)`), and the in-memory
  container gained `setMetadata` so a metadata write is traced like the rest. `failNext` gained an
  `applied` mode: the call takes effect, then the caller gets the error (a write that committed but
  lost its answer). The two failure-at-every-step tests run in both modes.

Storage calls per correct join: 5 -> 6 (read record, HEAD name, list slots, put slot, put name, read
record). Wrong-PIN join: 1 (the record read), no write call, asserted on the trace.

New tests in `join-service.test.mjs`, red on the round-3 code where the old code can show it
(`refute3-old-red-output.txt`: tests 40, pass 31, fail 9; run in the repo before `join.mjs` was
edited, hashes in the header):

| test | red on round 3 (its own assertion) |
|---|---|
| a start whose commit comes after the never-started expiry answers gone, at every storage step (no write when the expiry passed before the write; the write and its undo when it passed during it) | paused before step 1 of 3 (the listing): "the start went through" |
| 200 concurrent joins with one slot left admit exactly one, 199 answer full | 200 answered 201 |
| a removal frees its slot; a new join takes it; the next is full | no slot blobs (0 !== 299) |
| a wrong PIN issues no storage write; a correct join issues none before its PIN compare | wrong-PIN half green on round 3 (it wrote nothing); the correct-join trace has 1 write, not 2. The red that matters is the judge's mutant below |
| a storage failure at any step of a removal never strands the slot (both failure modes) | green on round 3 (no slots, so 0 and 0); red only through its mutants |

An earlier draft of the start test accepted a 200 whose `started` was stamped before the expiry; it
was green with the start paused at its own record write, which is the judge's reproduction one step
later. The test now requires `gone` at every step, and redded on that draft ("paused before storage
step 2 of 3: the start went through") before the post-write check was added. Likewise the applied
failure mode redded the first slot code ("applied failure at step 3 of 6: one phone holds more than
one slot") before the HEAD after a failed create was added.

Pre-existing tests changed, old -> new (each gains assertions; none lost one):

- stored records key set: + every slot's metadata is exactly `['id']`;
- a join racing a start it was not reviewed for: + the only slot left is the reviewed name's;
- two devices racing for one name: + the only slot left is the winner's;
- 200 phones with an overlapping retry: + 200 slots, not 400;
- a storage failure at any step of a join, 300 phones: + runs in both failure modes; + after phone 0,
  one slot held; + 300 slots held, and one more join answers `full`; the injected failure answers 503
  -> 503, except an applied failure at the slot create, which answers 201 (the join recovers the slot
  it holds; the test checks the failed call was that create);
- `everyStep` passes the step index to `check` (the start test reads which call was paused).

Mutants added (n = 50 -> 64, all red; `mutants-output.txt`): a start that checks liveness only at its
first read; a start that does not re-check once its write has landed; a start that answers gone after
its write but leaves the write in place; a slot create that committed but answered an error left
behind; a slot that stores more than the join id; the cap counted from a listing again; a refused slot create counted as held; a failed
admission keeps its slot; a failed admission frees its slot even when its name was written; a join
that loses the name race keeps its slot; a join not admitted keeps its slot; a removal keeps the
slot; a retried removal does not free a slot left behind; and the judge's mutant (a blob put and
deleted before the PIN compare), which reds only the new trace test. Two existing mutants were
re-anchored: "start gives up after a lost write" now edits `if (!committed) continue;` (the write's
line changed); "the PIN throttle put back" named its blob `slot`, which now collides with the join's own
`slot` and redded the whole file on a SyntaxError (the wrong reason); renamed `pinSlot`, it reds 5
tests on their assertions.

