# Prize-draw QR join: wire contract, storage and clocks

Companion to [ADR-0076](../adr/0076-the-prize-draw-qr-join-is-a-second-function-in-the-feedback-app.md), which holds the decisions. This file holds the mechanics too detailed for a decision record. The code-side source of truth is the invariant list at the top of `services/feedback/src/join.mjs`; if this file and that list disagree, the code wins and this file is wrong. Siblings: [names](prize-draw-qr-join-names.md) (the name rules) and [concurrency](prize-draw-qr-join-concurrency.md) (admission, slots, removal, start, join, purge).

## Contract

JSON both ways; every response `no-store`, `nosniff`, `application/json`. Routing is `routeDraw` in `join.mjs`; the function module only adapts HTTP and Blob storage to it.

| route | who | request | answer |
|---|---|---|---|
| `POST events` | admin | none | 201 `{eventId, pin, adminToken, expiresAt}` (`expiresAt` is the never-started expiry, creation + 72 h; a start moves it, see Clocks) |
| `POST events/{eventId}/join` | phone | `{pin, name, token}` | 201 `{id, name, eventKey}` · 200 same on a retry from the same device · 403 `pin` · 404 `gone` · 409 `started` / `taken` / `full` / `removed` (the admin removed this join while a send of it was in flight) · 503 `unavailable` · 422 `{error:'name', reason}` |
| `GET events/{eventId}/names` | admin | none | 200 `{state: open/started, names: [{id, name, joined}]}` (admitted names only) |
| `POST events/{eventId}/names/{id}/remove` | admin | none | 200 `{removed}` · 409 `started` |
| `POST events/{eventId}/start` | admin | `{ids}` | 200 `{roster: [{id, name}]}`, frozen and idempotent · 409 `empty` |
| `GET events/{eventId}/status/{id}` | phone | none | 200 `{state: 'open'}` · `{state: 'started', member}` · `{state: 'gone'}` |
| `POST events/{eventId}/purge` | admin | none | 200 `{purged: true}` (works after expiry too; a retry after the purge is 200 too) |

Also, from `handleDraw` and the function module: 404 `no-route`, 405 `method`, 400 `bad-request` (unparsable body, bad device token, bad `ids`), 401 `admin` on an admin route with a wrong or missing token, 413 `too-large` (per-operation body caps), and 503 `unavailable` for any storage failure.

Admin routes send the `adminToken` in the header `X-Draw-Admin` (not `Authorization`: the SWA `/api` proxy may replace that header on its way to a linked backend, unverified either way; gh#310 step 7 proves an admin route through the site origin). The server keeps only its SHA-256. The PIN is on the projector, so it never authorises an admin route.

## Identity

`id` is 128 random bits from the server, base64url: the opaque join identity the gh#300 round-code proof assumes (`fateValue` in `src/prize-draw/round-code.ts`). `eventKey` is the PIN, as that file's protocol states. A re-join gets a new id, so a player can re-roll their fate (gh#300 condition 4); the admin's head-count review bounds it. `token` is a device-held random string (16-64 base64url characters), stored hashed: a join whose response was lost and is retried with the same token gets its own id back, not "taken". That check comes before "started", so it still works after the start. One name per device stays client-held.

## The QR link

The main-screen QR encodes `https://watduang.com/game/prize-draw/join/#event=<eventId>&pin=<pin>`: the event id and PIN in the URL fragment, never the query (orchestrator decision, gh#308), so they reach no server log, `Referer` header or ad request. The join page reads only the fragment, then strips it from the visible URL with `history.replaceState` and keeps the link in `sessionStorage` for a reload of that tab. The page is `noindex` and out of the sitemap.

## Start and status

Start freezes exactly the ids the admin reviewed. A name that joins between the admin's last look and the start is not in the roster, and its status says `member: false`. A start whose roster would be empty is refused (409 `empty`) because a frozen roster cannot be undone. After the start a new join answers 409 `started`, and so does a removal of an id that is not already fenced; an admitted member's retry still answers 200. A phone makes one non-blocking status call after the start and before any reveal (an orchestrator choice, revisable). No server call happens at reveal (gh#299 decision 5).

## Storage

Same account and identity as feedback (`FEEDBACK_ACCOUNT_URL`, no new app setting), new container `prize-draw-join` (`DRAW_CONTAINER` overrides). Layout per event, all under `<eventId>/`:

- `event.json`, the event record: `state` (`open`, `started` or `closed`), PIN, admin-token hash, created, `removed` (ids the admin removed whose blob may still exist), and after the start the frozen `roster` and its time;
- one empty blob per name at `names/<key>`, whose metadata holds `id`, base64url `name`, `joined` and the token hash, so one listing returns the whole review list;
- one empty blob per held slot at `slots/0001` ... `slots/0300`, whose metadata holds the join `id`, its `owner` (SHA-256 of the device token's hash and the name key), the name `key`, `at` (the time of its last claim or touch) and `w` (a random mark of the write that put it there). These are the name cap.

Nothing is stored outside an event's prefix, and a join with a wrong PIN stores nothing. Table storage was rejected: it would need a new role, and the identity holds Blob roles only.

## The store port

No blind write: a write either only creates (`If-None-Match: *`) or only replaces the version that was read (`If-Match: <ETag>`). 409, 412 or 404 means the condition failed, except a 404 for a missing container, which is an error (503): read as an absent blob it would make every event read as gone.

A refused create is not proof that nothing was written: the SDK retries a write whose answer was lost, and the retry of one that landed is refused by its own blob. So every created blob carries who owns it (a slot its `owner`, a name its join `id`), and a create refused or failed reads it back: a blob that is ours is used. (REFUTE round 4: a name whose create landed and answered 409 gave its slot back, and the next join made 301 names in 300 slots.)

A write to the event record, refused with 409 or 412, is read back by what the write itself put there:

- a create is ours when the record holds this attempt's admin hash (otherwise create left an orphan record and answered a second event);
- a start's commit, when it holds that start's `started` stamp and roster (otherwise the start answered 200 without its expiry re-check);
- a removal's, when `removed` already holds the id;
- a purge's, when the record is closed.

A delete answers true when the blob is gone, including the 404 that the SDK's retry of a delete that landed meets. A moved ETag (412) answers false, which Azurite also answers for a blob that is gone, so a caller that must know reads the blob back. A missing container stays an error. A listing returns no ETag to the logic, because the service spells it without quotes there (measured on Azurite), so a conditional delete takes its ETag from a HEAD or from its own upload.

## Clocks

An event is gone, purged or not, **24 hours after its start**, or, never started, **72 hours after its creation** (owner ruling 2026-11-11: an organiser sets up the day before, so a clock from creation could end the event mid-party). Every route reads it as gone, except purge, which still works after expiry. The start time is the record's `started`.

The lifecycle rule on `prize-draw-join/` deletes base blobs more than **4 days** after last modification. Why 4: a blob is never needed past its event's expiry, and the latest expiry is 96 hours after creation. A start re-checks liveness at its write and stamps `started` with that check's time, so `started` is never later than creation + 72 h, and the event is gone 24 hours after it. A test pauses a start at each storage step across creation + 72 h: every step answers `gone`, and the event reads as gone at creation + 96 h. Every blob of an event is written at or after its creation. An unstarted record sits unmodified for up to 72 hours, so round 2's 1-day rule would have deleted live events.

One window is left: a start whose write is in flight across creation + 72 h lands, then puts the record back, so between those two writes a status call can read `started`; the start itself answers `gone`. If the put-back keeps failing, the start answers 503, never `gone`, and the record stays started with a `started` at or before creation + 72 h, so the 96-hour bound still holds.

The vendor doc bounds only the first lifecycle run ("up to 24 hours" after a policy change) and says runs are periodic, with no completion bound. So layer 3 alone gives no promise a privacy page can state as a number.

## No IP, and logs

The function module passes exactly method, path, the `X-Draw-Admin` header and the body into `handleDraw`; of the other headers only Content-Length is read, for the body cap. Stored records are built from an allow-list (a test checks their exact keys, with an IP planted in the request). Failure logs carry the operation, status code and error code only, because logs outlive the purge.

## Load isolation (fork hazard #1)

The host loads every module under `src/functions/`; one that throws while loading takes feedback down with it. The join module builds its client on first use, inside the handler's error path, and does not call `app.setup` (streams are feedback's, app-wide). `join-import.test.mjs` imports it in a child with stubbed Azure packages and no app settings.
