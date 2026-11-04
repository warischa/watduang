# gh#292 — feedback endpoint proof, 2026-11-04

Function App `func-watduang-feedback` (Windows Consumption, East Asia, Node `~22`), linked to SWA
`watduang` at `/api`. Storage `stwatduangfeedback`, container `feedback`. Every row below was read
back by downloading `feedback-2026-11.csv` with the owner's own Azure login (`--auth-mode login`,
Storage Blob Data Reader), which is also the owner's read path.

## Requests through the site origin

Origin: the SWA default hostname in `docs/runbook.md`. Rows counted before and after each request.

| Case | Request | Response | Rows added |
|---|---|---|---|
| positive control | `kind=game`, game name, message, email | 303 `/feedback/sent/` | +1 (expected +1) |
| honeypot filled | `website=x` | 303 `/feedback/sent/` | +0 (expected +0) |
| oversize body | 20,000-char message (the deployed code then capped the body at 16 KB) | 303 `/feedback/failed/` | +0 (expected +0) |
| formula prefix | message starting with "=" | 303 `/feedback/sent/` | +1, stored with a leading apostrophe |
| GET | `GET /api/feedback` | 404 | none |
| direct host | POST to the function's own `azurewebsites.net` host after linking | 401 | none |

The formula row as stored: `"'=HYPERLINK(""http://x"",""[gh#292 test]"")"`. The file starts with the
bytes `EF BB BF` and then `received_at,kind,game_name,message,email`.

## The one startup fault

The first deploy returned 503 on every request. Host status read `node exited with code 1 ...
SyntaxError: Use of const in strict mode`, with `WEBSITE_NODE_DEFAULT_VERSION=~24`. Setting `~22`
(one variable) made the next request return 303. Recorded in ADR-0074.

## Unit rules

`node --test services/feedback/src/record.test.mjs`: 8 pass. Must-red: with the formula escape and
the honeypot removed from a copy of `record.mjs`, 3 of 8 fail (honeypot, cell escape, row shape).

## Left in the CSV

Three test rows, each tagged "[gh#292 test]", are in `feedback-2026-11.csv`. The owner can delete
them from a downloaded copy; the stored file is read-only to the owner role and ages out with the 180-day
lifecycle rule.

## Not covered

- The lifecycle deletion itself: the rule is set (`daysAfterCreationGreaterThan: 180`, append and
  block blobs, prefix `feedback/`), but nothing can be observed deleting for 180 days.
- Load: no rate limiter (accepted residual, ADR-0074).
