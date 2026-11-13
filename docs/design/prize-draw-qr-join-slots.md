# Prize-draw QR join: the join sequence, the slot cap and reservations

Companion to [ADR-0076](../adr/0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md); the invariant list at the top of `services/feedback/src/join.mjs` is authoritative, and the model (a storage call takes effect before the request's next call or never; a request may stall or be terminated) is stated in [concurrency](prize-draw-qr-join-concurrency.md), where admission and the record protocol live. Siblings: [protocol](prize-draw-qr-join-protocol.md) (store port, storage layout, clocks) and [names](prize-draw-qr-join-names.md).

## Join

Reads the record, compares the PIN and HEADs its name blob. A blob there is judged by admission: admitted and this device's, 200 with its id (before the started check, so a valid member's retry works after the start); admitted and another device's, 409 `taken` (or `started`); not admitted, it is garbage: deleted, and the answer is 404 `gone`, 409 `started`, 409 `removed` for this device's fenced id, or else the join goes on and takes the name over. It then claims a slot and writes its name blob (`If-None-Match`, or `If-Match` on the garbage it takes over, with the slot's id). A write refused by a blob that is not this join's is judged the same way: admitted, 200 or `taken`; this device's fenced id, 409 `removed`; garbage, taken over on its ETag.

**Its final checks come after its last write, in this order:** HEAD its slot (it must still hold this owner and id), then read the record, last. Open, or started with this id in the roster, not in `removed`, and the slot held: 201, or 200 when the name was already this join's (another send of it, or this send's own write that landed and answered 409). Otherwise it deletes the name blob (and the slot, if it still holds this id) and answers 404 `gone` (closed, purged or expired), 409 `started`, 409 `removed`, or, with the slot taken from under it and no fence, 503 so the phone retries. No join ever re-acquires a slot after its checks: a check that fails undoes. (Cross-lineage REFUTE round 1: a shared send stalled before its slot check, the id was removed, and the send re-created the deleted slot and answered 201 with no name, leaving the next phone `full`.)

## The name cap is a fixed slot set, not a count

Round 3 counted names with a listing before the write; REFUTE round 3 seeded 299 names, sent 200 joins at once, and all 200 were admitted (499 names; the reviewed start then answered 400). Now a join lists `slots/` and answers 409 `full` when it holds none and every free one it tries is refused. Its name blob is written only after a slot is held, and only a name with a numbered slot is admitted, so admitted names never exceed the slots.

**A slot belongs to one device and one name, not to one request.** Its `owner` is SHA-256 of the device token's hash and the name key, so every send of one join (a retry, an overlapping second send) maps to one owner. A join whose owner already holds a listed slot shares it and takes its id; otherwise it tries the free slots in an order seeded by its owner, so sends of one owner meet on one slot while distinct owners spread. A create that is refused or fails reads the slot back: its own write, or a send of the same owner, is shared; only another owner's slot moves on. (REFUTE round 4: slots were claimed per request, and 200 phones each sending twice left phones told `full`.)

The token is attacker-owned, so this bounds occupancy per device token and name, not token churn or request cost (no budget, ADR-0076); one name per device stays client-held, so a device with two names holds two slots. A send that shares a slot **touches** it: it rewrites the slot with `If-Match` on the version it read, a fresh `at` and its own `w`, so the slot's ETag moves whenever a second request may rely on it.

## Reservations: a slot is freed only where no name can rely on it

1. A removal, after its fence write.
2. A join's undo after a fence or a closed admission.
3. The request that created it, with a delete conditional on its creating ETag: when it loses the name race to another device, or when it fails and no name holds its id. Any touch moved that ETag, so once another send shares the slot the delete is refused and that send owns the outcome.
4. A purge.
5. **Reclamation by the next claimer:** with no free slot left, a join takes a slot whose `at` is more than **15 minutes** (`RECLAIM_AFTER_MS`) old and whose name key holds no name with its id, by a delete conditional on the ETag it just read, then claims it with a create-only write.

A slot already absent may be created at once; a delete answered false or with an error is settled by a HEAD, and only absence lets the claimer create, so a replacement made by a racing claimer refuses that create and stays. (REFUTE round 2: a delete that landed but lost its answer left a healthy join `full` beside an empty slot, and of two racing claimers the loser answered `full` while the slot was empty.) No timer process runs.

Why 15 minutes: the Function App sets no `functionTimeout`, so the Consumption limit applies (default 5 minutes, at most 10; vendor documentation, not re-read in this change), and every request that claimed or touched the slot has ended by then, so no live writer is robbed. A writer that somehow outlived it finds its slot gone or another owner's on its final check, deletes its name and answers 503; the phone retries. If the plan's timeout is ever raised above 15 minutes, this bound must be raised with it. (Cross-lineage REFUTE round 1: name writes failed after their slots landed and the phones gave up; 300 hidden reservations the admin could not see or remove left 0 names and every healthy join `full`.)

Rejected: a counter in the event record or in one blob (every join would contend on one ETag; inferred, not measured, that a crowd of 200 would turn into 503s), and keeping the listing count with a re-check after the write (inferred, not measured: two joins at the cap each see the other and both undo, so the bound holds but can refuse the last free place).
