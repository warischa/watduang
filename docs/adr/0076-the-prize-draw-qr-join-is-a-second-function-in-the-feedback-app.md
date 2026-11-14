# ADR-0076 — the prize-draw QR join is a second function in the feedback Function App

Date: 2026-11-11 (owner rulings the same day, after REFUTE rounds 1-3) · Status: accepted (deployed 2026-11-14, gh#310) ·
Extends: [ADR-0074](0074-the-feedback-endpoint-is-a-linked-function-outside-the-build.md) ·
Relates: [ADR-0075](0075-a-third-category-company-party-games-holds-games-for-an-organiser-and-a-room.md), [ADR-0026](0026-a-set-we-do-not-own-is-guarded-at-authorship.md), gh#299, gh#300, gh#308

Mechanics live in `docs/design/`: [protocol](../design/prize-draw-qr-join-protocol.md) (contract, storage, clocks), [names](../design/prize-draw-qr-join-names.md), [concurrency](../design/prize-draw-qr-join-concurrency.md) (admission, record, removal, start, purge) and [join and slots](../design/prize-draw-qr-join-slots.md). The code-side source of truth is the invariant list at the top of `services/feedback/src/join.mjs`. Evidence: `docs/verification/evidence/gh308-join-backend-2026-11-11/`.

## Context

QR mode of the prize draw (gh#299 decision 4): people scan a QR on the projected screen, type a nickname, and the admin reviews the list before the start. The build is pure static, so this needs a server. An SWA links exactly one Function App at `/api` (vendor doc), and that slot holds `func-watduang-feedback` (ADR-0074), so the join lives in that app.

Read-only probe, 2026-11-11: the app is Consumption, system-assigned identity, one function (`feedback`). Account `stwatduangfeedback` holds one container, `feedback`; its only role is Storage Blob Data Contributor scoped to it; the lifecycle policy has one rule, `delete-feedback-after-6-months`.

Owner rulings 2026-11-11, binding: names capped at 12 characters; one name per device is client-held, and admin review is the real guard; no IP stored, ever; join data auto-deletes after the event; the event PIN is required; a taken name is refused with a prompt.

## Decision

**One catch-all function, `draw`, at `/api/draw/{*path}`, GET and POST only.** Routing is `routeDraw` in the pure `services/feedback/src/join.mjs`, where it is tested; `functions/join.mjs` only adapts HTTP and Blob storage to it. Rejected: seven `app.http` registrations: untestable without the SDK, and seven chances for a load-time mistake in an app that also serves feedback.

**Contract.** Seven routes (create, join, names, remove, start, status, purge), JSON, `no-store`; table in the protocol doc. Admin routes send the `adminToken` (256 random bits, returned once by create) in `X-Draw-Admin`; the server keeps only its SHA-256. Not `Authorization`: the SWA proxy may replace it (unverified; deploy step 7 proves it). The PIN is on the projector, so it never authorises an admin route.

**Identity.** `id` is 128 random bits from the server, the opaque join identity the gh#300 round-code proof assumes; `eventKey` is the PIN. A re-join gets a new id (a re-roll, gh#300 condition 4; the head-count review bounds it). The device `token` is stored hashed, so a retried join whose response was lost gets its own id back, even after the start.

**Start freezes exactly the ids the admin reviewed.** Nothing joins unreviewed; an empty roster is refused (409 `empty`); a new join after the start answers 409 `started`. A phone makes one non-blocking status call after the start, before any reveal (an orchestrator choice, revisable); none happens at reveal (gh#299 decision 5).

**Names: an allow-list this code owns; the sink still escapes.** A deny-list cannot converge on Unicode's invisible marks; `checkName` admits only a set it owns (Thai letters, vowels, marks and digits; ASCII letters and digits; space and `.` `-` `'` `_`), at most 12 clusters (owner ruling 2026-11-11), split by a rule this code owns, not the runtime's ICU. The server never pre-escapes; the sinks (gh#308 page half, gh#309) escape, and server rules do not substitute (ADR-0026). The uniqueness key and the rules in full: names doc.

**Storage.** Same account and identity as feedback, new container `prize-draw-join`, all under `<eventId>/`: the event record, one blob per name, one per held slot (`slots/0001` ... `slots/0300`). Table storage was rejected (new role). The store port has no blind write: a write only creates (`If-None-Match: *`) or only replaces the version it read (`If-Match`); a missing container is a 503, never "absent".

**Admission: the record and the numbered slots decide who is in; name blobs never do.** A name counts only when the event is live, its id is not in `removed`, a numbered slot holds its id, name key and owner, and the event is open or the id is in the frozen roster. One predicate decides the admin list, the roster, every retry answer and the cap. A name blob that does not count is garbage, collected best-effort; correctness depends neither on collection nor on any writer finishing.

**Slot ownership: a slot belongs to one device and one name, not to one request.** Its `owner` is `sha256(tokenHash/nameKey)`, so every send of one join shares one slot and one id, and a shared send touches the slot so its ETag moves. The name cap is this fixed slot set (300), not a count: a listing count admitted 200 concurrent joins at 299 names.

**Removal fence: `removed` only grows.** A removal writes the id into the record's `removed` first, then deletes the name and frees its slot. A listing cannot show the ids a stalled send still holds, so pruning let a removed id come back.

**Reclamation of stranded slots after `RECLAIM_AFTER_MS` (15 minutes).** With no free slot, the next claimer takes a slot that old whose name key holds no name with its id, by a conditional delete and a create-only write; no timer runs. Rationale: the app sets no `functionTimeout`, so the Consumption limit applies (default 5 minutes, at most 10; vendor documentation, not re-read here), so every request that claimed or touched the slot has ended by then. Raise this bound if the plan's timeout ever exceeds 15 minutes.

**Conditional-write reconciliation by stored content.** A create refused with 409 or 412 may be this request's own write, landed on an attempt whose answer was lost and retried by the SDK. Every written blob carries who owns it (slot `owner`, name `id`, record admin hash, start stamp and roster); a refused write reads it back, and ours is used. **A delete that answers 404 is deleted** (the SDK's retry of a delete that landed); a moved ETag (412) is "not deleted" and a caller that must know reads the blob back.

**The event record is the single point of truth.** Every state change (open, started, closed) and every removal is a write to it conditional on the ETag read; a loser re-reads, up to 5 attempts, then answers 503. Joins never write it, so a crowd never contends. A start decides liveness again at its commit, so a start answered 200 committed while the event was live. Purge closes the record first.

**No abuse budget (owner rulings 2026-11-11, after REFUTE round 2).** There is **no create budget** and **no PIN throttle**. With no client identity (the no-IP ruling) every server-side counter is global to its scope, so whoever spends it locks it for everyone, and a PIN throttle that bounds a guesser must refuse the right PIN too, so each variant is a lock an id-holder can trigger. The cost bound is a billing alert set at the gh#310 deploy, never code. A wrong PIN answers 403 `pin` and makes no write call (asserted on the call trace). The QR carries the PIN; admin review stays the real guard, since a name joined by a guessed PIN reaches only the review list. With no throttle, a scripted guesser at an assumed 50 guesses a second (not measured) reaches an even chance at one event's 6-digit PIN in about 3 hours.

**Expiry clocks, three retention layers.** (1) The admin purges. (2) Every route except purge treats an event as gone **24 hours after its start**, or, never started, **72 hours after its creation** (owner ruling 2026-11-11: an organiser sets up the day before, so a creation clock could end it mid-party). (3) A lifecycle rule on `prize-draw-join/` deletes base blobs more than **4 days** after last modification, as the backstop: the latest expiry is creation + 96 hours, and an unstarted record sits unmodified for up to 72 hours, so a 1-day rule would delete live events. Derivation and the one residual window: protocol doc.

**Privacy: no IP; deletion "ภายในไม่กี่วัน".** Only method, path, the `X-Draw-Admin` header and the body reach the logic; stored records come from an allow-list (tested with an IP planted in the request); failure logs carry operation, status and error code only, since logs outlive the purge. Deletion is worded "ภายในไม่กี่วัน" (within a few days), deliberately not a number (owner ruling 2026-11-11): the vendor doc bounds only the first lifecycle run and gives periodic runs no completion bound, so layer 3 alone promises no stated number; one would need a mechanism we own, such as an hourly timer sweep in the same app. The proposed privacy text (not shipped) is in the evidence directory.

**Load isolation (fork hazard #1).** The join module builds its client on first use, inside the handler's error path, so a load-time throw cannot take feedback down (`join-import.test.mjs`).

## Portability

`services/feedback/` stays the one Azure home outside the build (ADR-0074); this adds a module there, nothing under `src/` names an Azure host, and `dist/` stays pure static. The page calls the relative `/api/draw/...`, which `connect-src 'self'` already admits. `npx serve dist/` 404s `/api`, as for feedback.

## Deploy (gh#310 — guarded, never run from a build ticket)

In this order, each with its verify; storage first, so the code never meets a missing container:

1. **Keep the live package for rollback.** Download it first; under run-from-package it sits in `data/SitePackages/` (confirmed 2026-11-14 via Kudu VFS, Azure AD token). Rebuilding from the repo is no rollback: it can drift (ADR-0074).
2. Create container `prize-draw-join` on `stwatduangfeedback`, anonymous access off.
3. Grant the app's identity Storage Blob Data Contributor scoped to that container. Verify: the role assignment list shows two scopes, `feedback` and `prize-draw-join`.
4. Add the lifecycle rule: base blobs in `prize-draw-join/` more than 4 days after last modification. The policy is one document per account: write it with **both** rules. Verify: the policy shows `delete-feedback-after-6-months` unchanged plus the new rule.
5. Set a billing alert on the Function App and the data account, the only cost bound on create and join; the threshold is the owner's call. Verify: the alert is listed with threshold and recipient.
6. Zip-deploy with ADR-0074's command (it strips `src/*.test.mjs`).
7. Verify feedback first: one POST through the site origin lands a 303 and one row. Then `draw` through the site origin: create, join, names (an admin route: proves `X-Draw-Admin` survives the proxy), start, status, purge. Any red in feedback: redeploy the step 1 zip and verify feedback again.

## Consequences and residuals

- The Blob adapter runs in every test against an in-memory container that answers each conditional case as Azurite did; the suite also passes on Azurite (evidence). Real Azure Blob first runs it at deploy step 7.
- Cold start on Consumption is 8-12 s (gh#294); the page must tolerate it, the SWA proxy gives up at about 45 s.
- Nothing in code bounds cost or PIN guesses: a scripted flood runs the function until the billing alert fires. Anyone with the join link can fill the 300 names; the admin removes names or opens a new event.
- The 300-name cap is exact under concurrent joins but not over an event: a removal frees a slot, so more than 300 joins can pass. A slot with no name lowers the cap for at most `RECLAIM_AFTER_MS` once the room is full; the admin never sees it. A join whose compensating delete fails leaves its name and slot until the lifecycle rule.
- Look-alikes inside the allowed set are not folded (names doc); admin review is the guard. The phone counts clusters with its own ICU; the server's count rules.
- Platform logs (Application Insights, if connected) are outside this code; gh#310 checks they keep no client IPs.
