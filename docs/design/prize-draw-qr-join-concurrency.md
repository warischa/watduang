# Prize-draw QR join: admission, slots and the race protocol

Companion to [ADR-0076](../adr/0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md). The authoritative statement is the invariant list at the top of `services/feedback/src/join.mjs`; this file spells out the per-operation call sequences and the REFUTE history behind them. Model: a storage call either takes effect before the request's next call or never; a request may stall or be terminated at any point, but the platform ends it within its function timeout. Siblings: [protocol](prize-draw-qr-join-protocol.md) (store port, storage layout, clocks), [names](prize-draw-qr-join-names.md) and [join and slots](prize-draw-qr-join-slots.md) (the join sequence, the slot cap, reservations).

## Admission: the record and the numbered slots decide who is in; name blobs never do

A name counts (`admission` and `verdictOf` in `join.mjs`) only when the event is live, its id is not in `removed`, a slot numbered 1 to the cap holds its `id`, its name `key` and its `owner` (SHA-256 of the token hash and that key), and the event is open or the id is in the frozen roster; the slot is read before the final record read. That one predicate decides the admin list, the frozen roster, every retry answer and the cap. Name blobs are the payload and the uniqueness index: how many exist decides nothing, so **every admitted name has a slot**, not every stored blob.

A blob that does not count (its writer was terminated after its PUT, failed after a commit whose answer was lost, or lost its slot or its id) is garbage. Garbage is collected best-effort and bounded: an admin list or a start deletes at most 16 per call, and a join that meets it deletes it or takes the name over, each delete or overwrite conditional on the ETag a HEAD just read, so a name that replaced it is never touched; purge's prefix sweep takes the rest. A verdict of garbage is final (gone, removed, not in the roster, and an id never gets a slot back), so a later read cannot make it count. Correctness depends neither on collection succeeding nor on any writer finishing. (REFUTE round 2: a name that landed after its id was removed and then threw stayed stored, its retry answered 200 with the removed id, and a retry through a removal in progress answered 200 too.) Rejected: holding the name payload inside the slot set (a larger storage change, needed only if the cap had to bound stored payloads even after a writer is terminated).

## The event record is the single point of truth

REFUTE round 1 replayed three interleavings on the real SDK against Azurite: a removal answered `removed` while a start froze the name in; a join that wrote after a purge left a name behind, and the retried purge answered 404; a delayed removal deleted a later joiner who had taken the same name.

Every state change (open, started, closed) and every removal is a write to the event record conditional on the ETag read. A writer that loses re-reads and decides again, up to 5 times, then answers 503. Joins never write the record, so a crowd never contends on it.

## Removal

It first writes the id into the record's `removed`, then deletes the name blob, and only if a HEAD still shows that id, with `If-Match` on that blob's ETag. Then it frees the slot whose metadata holds that id (HEAD, then delete with `If-Match`): the id's name blob is gone, and an id is never created twice, so nothing else relies on that slot. A removal retried for an id no longer listed still frees that id's slot, so a removal that failed between the two deletes leaks nothing.

An id already in `removed` is removed: the removal skips the record write and finishes the deletes, even if a start froze the roster since (that start subtracted it), so a removal whose write landed and answered 412 never answers 409 `started` for a name the roster left out. A start subtracts `removed`, so a removal is decided by the record write, whether or not the blob is gone yet.

**`removed` is a fence kept for the life of the event: it only grows.** A listing shows stored names, not the ids a stalled send still holds, so pruning it to listed ids let a removed id come back. (Cross-lineage REFUTE round 1: a send stalled after its claim, its twin completed, the admin removed that id and then another name, which dropped the first entry; the stalled send resumed, answered 201 with no slot, and the room filled to 301 names in 300 slots.) Only the admin adds to it, so it grows by the admin's removals and nothing else. A removal that finds its id fenced but no name stored answers `removed: true` when the fence first appeared during this request (its own write that landed and answered 412, or a twin's) and `removed: false` when the fence was already there.

## Start

Reads the record, lists the names and then the numbered slots, freezes the reviewed ids that are admitted against that record, and writes the record as `started` with the roster, conditional on the ETag it read. A removal in between moves the ETag, so the start re-reads.

Liveness is decided again just before that write, on the record version the write is conditional on, and `started` is stamped with that same time: a start that began before the never-started expiry and reaches its write after it answers 404 `gone` and writes nothing. Once the write has landed, liveness is checked once more against the clock: a write that cannot show it landed while the event was live is put back (the record as read, `If-Match` on the ETag just written) and the start answers 404 `gone`. So a start answered 200 committed while the event was live. (REFUTE round 3 paused a start across creation + 72 h; status read `gone`, then the start answered 200 and revived it.)

The put-back is acknowledged: one refused re-reads the record, and while the record still holds this start (same `started`) it tries again on the new version, up to 5 times, then answers 503. A record that no longer holds it (put back by a retried write that landed, closed, purged) is gone already. So a start never answers `gone` over a record it left started. (REFUTE round 4: a refused put-back answered `gone` while the record stayed started.)

## Purge

Writes the record as `closed` (version, admin hash and created only), which closes admission; deletes every other blob of the event; deletes the record; then sweeps once more. A join that wrote before the sweep's listing is swept; one that wrote after it re-reads a closed or missing record and removes itself. With no record left there is no token to check and nothing to protect, so a retried purge is answered 200 and only sweeps.

`join-service.test.mjs` replays each of those races at every storage step of the paused request, not only the step the reviewer used, and each is red on the code before this protocol.

## What the abuse budgets looked like, and why they went

Round 2 shipped two IP-free counters: 100 creates per UTC hour app-wide, and 300 wrong-or-in-flight PIN attempts per event per hour, each attempt holding a slot blob claimed before the compare. REFUTE round 2 left four findings on them: the create budget is a shutdown any stranger holds (100 requests close event creation for every party for the rest of the hour); a slot stranded by a storage failure counts as a wrong PIN, so abandoned slots lock an event; a phone's retries count as attempts, so an honest crowd can lock itself; and the create counter can roll back. With no client identity (the no-IP ruling), every server-side counter is global to its scope, so whoever spends it locks it for everyone. And a PIN throttle that bounds a guesser must refuse the right PIN too while tripped (otherwise the one success is the oracle), so every variant is a lock an id-holder can trigger.

The call trace now: a wrong-PIN join makes no write call at all, and its whole trace is the one record read (the test container records every storage call in order; a snapshot of the blobs could not see a write undone before the answer, and REFUTE round 3's mutant did exactly that). A correct join makes 7 storage calls (read record, HEAD name, list slots, put slot, put name, HEAD slot, read record); its first write comes after the PIN compare. The round 2 PIN slot made 8.
