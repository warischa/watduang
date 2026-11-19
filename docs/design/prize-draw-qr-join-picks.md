# Prize-draw QR join: picks for the mini-event pages

Companion to [ADR-0076](../adr/0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md) (amendment 2026-11-19, gh#311). The invariant list at the top of `services/feedback/src/join.mjs` is authoritative; if this file disagrees with it, this file is wrong. The wire table is in the [protocol doc](prize-draw-qr-join-protocol.md#contract). Revised after REFUTE round 1 (2026-11-19): close now freezes each member's blob, so a snapshot no longer comes from listing blobs that are still mutable.

## Why

gh#311: on a mini-event page, members pick on their own phones, and the server stores the picks before the rule is drawn. Rounds repeat, duplicates are allowed, and a member with no pick when the timer ends gets a random one. Owner ruling 2026-11-19: a member may change their pick until the MC closes picking.

## The switch

The pick paths exist only while the app setting `DRAW_PICKS` is exactly `1`, read per request, never at load. When the setting is off, a pick path answers 404 `no-route` for every method and body, before any body is read and with no storage call. Every other path keeps its answer from before picks existed: an unrouted path answers 413 when it has a body, 404 when it has none. A zip-deploy for a phase-2 fix ships all of `services/feedback/`, so this code can go live before any page uses it.

## Routes, caps, authorization

- **Open** (admin, `POST events/{eventId}/rounds`, `{round, options}`). Rounds open in order, round n only once round n-1 is closed. A retried open with the same round and count answers it again. Opening needs the start to be settled (see below), otherwise 409 `settling`.
- **Pick** (phone, `POST events/{eventId}/rounds/{round}/picks/{id}`, `{pin, option}`).
- **Close** (admin, `POST events/{eventId}/rounds/{round}/close`). It answers the snapshot.
- **Result** (phone, `GET events/{eventId}/picks/{id}` for the latest round, `GET events/{eventId}/rounds/{round}/picks/{id}` for any round). A phone can settle its pick in any round, even after the next round has opened.

Caps:

- `round` is 1 to 10 (`MAX_ROUNDS`) and `options` 2 to 16. A pick is an integer index below the round's count, never free text.
- Body caps are 256 bytes for open, pick and close, and 0 for result. There is no rate limit (ADR-0076).

A pick is authorised by **id plus PIN**. The id must be in the frozen roster, and the PIN is compared as for a join. The device token is not checked. The id is issued by the server, and only the joining phone and the admin list see it. A wrong PIN, a non-member, a bad index or a round that is not open is refused before any write.

## State

All under `<eventId>/`:

- `rounds/0001` ... `rounds/0010`, one JSON blob per round. It holds `round`, `options`, `state` (`open`, `closing`, `closed`), `opened` and a write mark `w`. Once the round is closed it also holds `picks`, with `id`, `option`, `picked` and `w` per member.
- `picks/<round>/<id>`, one empty blob per member per round. A phone writes `id`, `option` and `w`. The close's freeze adds `picked` and `frozen`.

Rounds are not kept in the event record. Every status call and join downloads the record, and a stalled pick must still find the round that decides it. Picks touch neither the record nor slot metadata.

## Close: fence, freeze each member, commit

1. Write `closing` on the round blob, conditional on the ETag read. From then on, a pick that reads the round is refused (409).
2. Freeze each roster member's blob, 16 at a time: HEAD it, then write it with `frozen` set, conditional on that ETag. The frozen value is the pick the blob holds. Where it holds none (or an index the round does not allow), the value is a uniform `crypto.randomInt` fill, written create-only. A refused write was a phone's write in between, so the freeze reads the blob again, up to 5 attempts. An already-frozen blob (frozen by this close earlier, or by a racing close) is taken as it stands.
3. Commit `closed` with the frozen values, conditional on the fence's ETag.

Every close of a round builds its snapshot from the same frozen blobs. A closed round is never rewritten, and every later close (a refresh, a retry, a racing close, or a commit whose answer was lost) answers the stored snapshot, byte-identical.

**Cost at 300 members.** One record read, one round read and one fence, then a HEAD and a write per member (600 calls in 19 waves of 16), then the commit and one record read: 605 storage calls when nothing races (asserted by a test). Retries come only from that member's own sends. A close that fails part-way leaves the round `closing`, and a retried close resumes it.

## Pick: one conditional write

1. Read the record (live, PIN, member), then the round (it must be `open`).
2. HEAD the member's blob. If it is frozen, answer 409 `closed`. Otherwise write it conditionally on that version (create-only if the blob is absent).
3. A write that lands came before this member's freeze. It is the member's entry unless another send of the same member lands after it: storage order decides, not answer order. So 200 means "landed before the freeze", not "is the entry". Two sends can both answer 200; the one that reached storage last is the entry.
4. If the write is refused, read the blob back. This write's own mark means it landed (a retry by the SDK). A frozen blob means 409. Any other refusal is a concurrent send by the same member, and the write is retried on the new version.

**Invariant:** `snapshot[m]` is the last of member m's writes to reach storage before m's freeze, else the fill. A 200 landed before the freeze. A 409 means rejected and absent from the snapshot (it may still have landed earlier, as a retry by the SDK, and then been replaced). A 503 or a timeout is unknown. A test replays two sends from one member against a close under every interleaving of the calls that conflict, and reads storage order off the store.

**Only the result route is final, and only once the member is frozen or the round is closed.** Its answer while the round is `open` is provisional. A blob only ever holds a landed write, so the result shows:

- while the round is `open`: the pick as it stands;
- once the member's blob is frozen: the frozen value;
- once the round is `closed`: the snapshot entry.

**Rule for the phone page:** render "locked" from the result route, never from a 200. After any answer other than 200, re-read the result.

## Start settlement

A start whose commit lands after the never-started expiry puts the record back. Only a running request can do that, and a request ends within `RECLAIM_AFTER_MS` of the start stamp. A start is settled when that reach ends before the expiry, or once it has passed. Rounds open only after the start has settled, so a pick is never taken against a roster that can still roll back. A start made long before the expiry is settled at once. A start made within 15 minutes of the expiry waits out its reach.

## Purge

Gone is final. Purge is resumable: it closes the record first, and a retry after a timeout finds it closed (or deleted) and sweeps again. Every write to a round (an open's create, a close's fence, freezes and commit, a pick) reads the record afterwards. If the event is gone by then, the writer deletes the round's blobs, whatever their ETags, and answers 404. When an open and a close both stall across a purge, whichever finishes second still cleans up.

`MAX_ROUNDS` is sized by purge, whose sweep deletes one blob at a time. 600 join blobs plus 10 rounds × 301 is 3610 deletes, about 36 s at an assumed 10 ms each, inside the SWA proxy's 45 s.

## Tests

Pick against close under every interleaving of their storage calls (one-member roster, 510 schedules), and two sends from one member against a close under every interleaving of the calls that conflict. The other races replay at every storage step: close against close, close against purge, open against purge, pick against purge. There are also tests for the post-fence change scenario, the start roll-back, a lost commit, a lost pick answer and a stalled result.

## Residuals

- Purge does not fence a round's writers. An open or a pick that dies between its write and its own check can leave one round or pick blob behind: random ids and no name, unreachable (every route reads the record first). A retried purge removes it, and the lifecycle rule removes it within 4 days.
- A close's freezes happen at most 16 at a time. This assumes the store tolerates that much parallelism.
- Nothing in `src/` calls these routes yet. Their deploy is a later batch ask.
