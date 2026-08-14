# Site owner checklist

Three things no agent can do — each runnable start-to-finish without asking a question back.
Rationale for every decision lives in the linked issues; this doc restates only the steps.

## 1. Register `watduang.com` — [#9](https://github.com/warischa/watduang/issues/9)

**Why blocked on you:** buying a domain needs a card and personal details — HITL by definition.

**Steps** (from #9's checklist):
- [ ] Re-check whois before buying — confirmed free 2026-08-13, but nobody has it reserved. Names like this disappear fast — re-check right before you buy, not from this note.
- [ ] Register `watduang.com`.
- [ ] Consider also registering `wadduang.com` as a typo guard (issue leaves this unchecked/optional).
- [ ] Turn on WHOIS privacy.
- [ ] Turn on auto-renew — an expired domain after the site ranks is a disaster.
- **Do not buy `lomwong.com`** — it's a parked domain at broker pricing, not the chosen name.

**How you know it worked:** the domain resolves in whois to you, privacy is on, auto-renew is on.

**What it unblocks:** immediately after the domain exists, connect Google Search Console to it — that's the only next step any issue asks for (#19's checklist item 2). Do not set up DNS records, SWA custom domain, or anything else — no issue asks for it yet.

Note: #19's 6-month organic-clicks gate does not start counting the day you register. Its month 1 begins when the first `/tools/` page **and** the third game are live in production (#19's own wording) — registering the domain only removes the block on connecting Search Console.

## 2. Azure SWA phase 2 — set `AZURE_STATIC_WEB_APPS_API_TOKEN`

**Why blocked on you:** the token comes from an Azure resource tied to your subscription; an agent has no Azure credentials.

**Steps:**
- [ ] Confirm the Azure Static Web Apps resource exists for this site (per issue #13's own scope note, creating that resource may not be done yet — that has to happen before a token exists to copy).
- [ ] Get the resource's deployment token: in the Azure portal, open the Static Web App → **Overview** → **Manage deployment token** → copy the value. CLI equivalent: `az staticwebapp secrets list --name <APP_NAME> --resource-group <RESOURCE_GROUP> --query "properties.apiKey"`. ([Microsoft docs](https://learn.microsoft.com/en-us/azure/static-web-apps/deployment-token-management))
- [ ] In GitHub: repo **Settings → Secrets and variables → Actions**, add a new repository secret named exactly `AZURE_STATIC_WEB_APPS_API_TOKEN`.

⚠ **Add the secret by hand — do not let the Azure portal connect GitHub for you.** The portal's own
"deploy from GitHub" flow generates *its* secret name with a random suffix appended
(`AZURE_STATIC_WEB_APPS_API_TOKEN_LEMON_WAVE_00AD12A10`) and commits *its own* workflow file. This repo's
`ci.yml` already reads the plain, unsuffixed name at `:14` and `:201`, so a portal-generated secret would
not be found — and the generated workflow would collide with the hand-written one that CI depends on.

Rotation: resetting the token (portal **Reset token**, or `az staticwebapp secrets reset-api-key`) does
**not** update GitHub. Deploys fail until you paste the new value into the same secret.

**How you know it worked:** `.github/workflows/ci.yml` reads the secret at the job level (`HAS_DEPLOY_TOKEN`) and consumes it in the "Deploy to Azure Static Web Apps" step. That step only runs `if` the event is a `push` to `refs/heads/main` **and** the token is set. So: push a commit to `main`, open the run in the GitHub Actions tab, and confirm the "Deploy to Azure Static Web Apps" step is no longer reported as `skipped`. Checking a pull-request run will always show it `skipped` regardless of the secret — that is not a sign of failure.

**What it unblocks:** this is **the only thing that can prove CSP/AdSense for real** — until the site is actually deployed and live, ad rendering under the CSP is unverified.

## 3. Real-phone pass — [#13](https://github.com/warischa/watduang/issues/13) DoD item 4 + [#20](https://github.com/warischa/watduang/issues/20)

**Why blocked on you:** wake lock, iOS audio unlock, and sessionStorage restore-after-refresh only prove out on a real phone browser — no test suite covers them.

**#13 DoD item 4 (verbatim from the issue):**

> เล่นจริงบนมือถือ 1 เครื่อง: start → ส่งวน → boom → เล่นอีกรอบ — จอไม่ดับกลางรอบ (wake lock) และเสียงออกบน iOS (unlock จากปุ่ม start)

In English: on one real phone, play `timebomb` for real — start → pass it around → boom → play again. The screen must not go dark mid-round (wake lock working), and sound must play on iOS (unlocked by the tap on the start button).

**#20's open item, same pass** (issue says explicitly this can be done together with #13 DoD item 4):
- [ ] Play `siamsi` to mid-round → refresh the page → press `เริ่มรอบ` → press `กลับไปเล่นรอบที่ค้าง` → the same round must come back, not restart.
- [ ] **Do the same again with a numbered round** — start via `เริ่มแบบ "คนที่ 1, 2, 3…"`, get to mid-round, refresh, resume. This is the path [#23](https://github.com/warischa/watduang/issues/23) just rewrote, so it is the one most worth a real phone.
- Note the extra tap: resuming now goes through a two-button question (`กลับไปเล่นรอบที่ค้าง` / `เริ่มรอบใหม่`) rather than resuming on its own — that is deliberate, see [ADR-0008](adr/0008-starting-a-round-never-resumes-or-discards-one-silently.md). A refresh that comes straight back into the round *without* asking would be a bug worth reporting.

**Steps:**
- [ ] Open the live site on one real phone.
- [ ] Run the `timebomb` sequence above.
- [ ] Run both `siamsi` mid-round refresh checks above — normal-started, then numbered.

**How you know it worked:** all of the above hold true on the phone, with no workaround needed.

**What it unblocks:** ticking #13 DoD item 4 closes issue #13 (its other three DoD boxes are already checked). The `siamsi` item closes the one open task left on #20.
