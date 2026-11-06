# ADR-0074 — the feedback endpoint is a linked Function App that lives outside the site build

Date: 2026-11-04 · Status: accepted (owner popups on gh#292, 2026-11-04) · Owner decision ·
Amends: the CLAUDE.md portability rule ("everything Azure-specific in exactly 2 files") ·
Relates: [ADR-0005](0005-page-js-must-never-inline.md), [ADR-0033](0033-a-design-value-not-in-the-canvas-is-drift.md)

## Context

The owner asked for a page where players send feedback and suggest games, stored as CSV on Azure
Blob that the owner opens directly, with no admin page (gh#292). A static site cannot write to Blob
safely by itself: a write SAS in public HTML lets anyone write anything, with no validation. A
server-side endpoint is needed, and every shape of one breaks the letter of the portability rule.

Measured 2026-11-04: the SWA is on the Standard plan, which allows linking one existing Function App
at `/api` (Microsoft Learn, "Bring your own functions"). Managed functions do not support a managed
identity (same vendor table), so they would need a storage secret. The CSP has no `form-action`, so
a same-origin native form post needs no CSP change.

## Decision

- **A separate Function App, linked to the SWA at `/api`.** The site's form posts to the relative
  `/api/feedback`; the function answers with a 303 to `/feedback/sent/` or `/feedback/failed/`.
  The page ships no script.
- **Its code lives in this repo at `services/feedback/`, outside the site build.** That directory
  is the third Azure home, beside `staticwebapp.config.json` and the deploy step. `dist/` stays pure
  static, nothing under `src/` names an Azure host, and the build pulls in no Azure SDK.
- **The pure rules are gated in CI.** `services/feedback/src/record.mjs` (parsing, caps,
  honeypot, CSV quoting and formula escape) has no SDK import, so `services/*/src/**/*.test.mjs`
  runs without installing the function's dependencies. It runs in its own `ci.yml` step, with its
  own non-zero pass count, so a glob that matched nothing cannot hide inside the site's count (the
  gh#45 shape); `npm test` runs it too. The function's
  `node_modules` is never installed inside the repo: it is built in a scratch copy and zip-deployed.
- **Storage:** a dedicated account, anonymous access off, shared-key access off. The function's
  system-assigned identity holds Storage Blob Data Contributor on the `feedback` container only. The
  owner reads with Storage Blob Data Reader on the account. One append blob per UTC month with a
  UTF-8 BOM and header row, so Excel opens Thai correctly. A month that fills its blob (50,000
  blocks, one per row) continues in `feedback-YYYY-MM-part2.csv` and on, up to 20 parts, each with
  its own header. A lifecycle rule deletes blobs 180 days after creation, matching the page's
  6-month privacy notice (owner ruling).
- **The body is bounded before it is buffered.** HTTP streams are on (`app.setup`), a declared
  Content-Length over the cap is refused unread, and the body is read through a capped reader that
  stops one chunk past the cap. The cap is derived from the field maxima at 9 bytes per character
  (a 3-byte character, percent-encoded) plus slack, so a form filled to every maxlength in Thai
  fits. Line breaks are normalised to LF before counting, because a native form sends CRLF.
- **Dependencies are pinned exactly, with `services/feedback/package-lock.json` committed**, so a
  redeploy installs the versions that were tested.

## Consequences

- `npx serve dist/` still serves every page, but the form's target 404s there. That is expected:
  the endpoint is a separate service, and a non-Azure host has to proxy `/api` to it.
- The page must not reach production before the endpoint is live and linked, or it ships a form
  that fails.
- The function deploys by hand today (zip deploy). A CI step would need a new role grant for the
  GitHub OIDC identity on the Function App; that grant is an owner ask, not part of this decision.
- **Named residual: the repo copy and the live function can drift.** Nothing redeploys
  `services/feedback/` when it changes, and no gate compares the two. Any change under that
  directory makes the repo newer than the live function until this redeploy runs; the REFUTE fixes
  of 2026-11-04 (streamed cap, derived cap, CRLF, part rollover, pinned lock) are such a change.
  Run it from the repo root with the subscription that holds `rg-watduang` (the shell default is
  a different one):

  ```bash
  B=$(mktemp -d) && Z="$(mktemp -d)/feedback.zip" && cp -R services/feedback/. "$B/" && rm -f "$B"/src/*.test.mjs && (cd "$B" && npm ci --omit=dev --no-audit --no-fund && zip -qr "$Z" . -x '.funcignore') && az functionapp config appsettings set -n func-watduang-feedback -g rg-watduang --subscription "<rg-watduang subscription id>" --settings WEBSITE_RUN_FROM_PACKAGE=1 -o none && az functionapp deployment source config-zip -n func-watduang-feedback -g rg-watduang --subscription "<rg-watduang subscription id>" --src "$Z"
  ```

  **The app runs from package (`WEBSITE_RUN_FROM_PACKAGE=1`, added 2026-11-06, gh#294).** Extracted
  onto the app's file share, the 82 MB of `node_modules` made a cold start outlast the SWA `/api`
  proxy, which gives up at about 45s with a 500 "Backend call failure". The first post after idle
  was lost. Run from the mounted zip, a fresh host answered in 8.3s, 9.8s and 11.5s. Never remove
  the setting. A cold-start probe needs a host start in `LogFiles/eventlog.xml`:
  `az functionapp restart` does not reliably cold-start the app, but an app-setting change does.
  Evidence: `docs/verification/evidence/gh294-cold-start/2026-11-06.md`.

  The archive goes to a fresh directory every build: `zip -r` into an existing archive updates it
  and keeps entries for removed files, and a stale `src/functions/*.mjs` would still load under the
  `main` glob. Then prove it the same way as the first deploy: one POST through the site origin
  lands a 303 and one row. The install stays outside the repo on purpose, because gates walk the tree.
- The SWA `/api` proxy answers any `Transfer-Encoding: chunked` request with a 500 "Backend call
  failure" before the function sees it (measured live 2026-11-04, even a tiny body; no row
  written). A browser's native form post always sends Content-Length, so only hand-made requests
  hit it; a probe of the oversize path must send Content-Length, or it measures the proxy.
- Accepted residual: the endpoint has no rate limiter. The honeypot, the field caps and the body
  cap bound one post, not a flood; the part rollover keeps a flood from blocking real posts for
  the rest of the month, up to 20 parts.
- Accepted residual (decided in the parent session, REFUTE round 1, 2026-11-04): an append that commits but
  whose response is lost is retried by the SDK, so one post can leave two identical rows. No
  idempotency is built: the owner reads the file by eye, and a duplicate feedback row costs
  nothing.
- Windows Consumption needs `WEBSITE_NODE_DEFAULT_VERSION=~22`. `~24` resolved to an old Node that
  failed at startup on 2026-11-04 (host status: "Use of const in strict mode"). Node 22 reaches end
  of life on 2027-04-30; retest `~24` before then.
  **Amended 2026-11-06:** the app ran a 32-bit worker (`use32BitWorkerProcess=true`). With the worker
  set to 64-bit, `~24` runs `C:\Program Files\nodejs\24.22.1\node.exe` and live POSTs return 303 with
  one row each. The app now runs 64-bit on `~24`. Evidence:
  `docs/verification/evidence/gh292-feedback/node24-2026-11-06.md`.
