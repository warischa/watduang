# Site owner checklist

Four things no agent can do — each runnable start-to-finish without asking a question back.
Rationale for every decision lives in the linked issues; this doc restates only the steps.

## 1. Register `watduang.com` — [#9](https://github.com/warischa/watduang/issues/9)

**Why blocked on you:** buying a domain needs a card and personal details — HITL by definition.

**Steps:**
- [ ] Go to a domain registrar's website (for example `namecheap.com`). Type `watduang.com` into the search box and press search. Confirm it still shows as **available** — it was free as of 2026-08-13, but names like this can be taken at any time, so trust what the search box shows you right now, not this note. If it shows as taken, stop here and flag it — do not substitute a different name on your own.
- [ ] **This step costs money and cannot be undone.** Add `watduang.com` to your cart and check out with a credit/debit card. The checkout page shows the exact price before you pay — read it there. If the registrar suggests `lomwong.com` as a similar name, do not buy it — that is a different, already-parked domain sold at broker markup, not the one we want.
- [ ] Optional, same checkout: also add `wadduang.com` (note the double "d") as a typo guard. Skip this if you want to keep the cost down — it is not required.
- [ ] Turn on WHOIS privacy: after checkout, open the registrar's dashboard, find `watduang.com` in your list of domains, open its settings, and turn on the option called "WHOIS Privacy" (sometimes labelled "Domain Privacy" or "ID Protection"). This hides your personal contact details from public whois lookups.
- [ ] Turn on auto-renew: in that same domain settings screen, turn on "Auto-Renew" and confirm the payment card on file is valid — an expired domain after the site ranks is very hard to get back.

**How you know it worked:** look up `watduang.com` on a public whois tool (for example `lookup.icann.org`) — it should show a registration/expiry date and your registrar's name instead of "available". In the registrar's dashboard, the domain's Privacy and Auto-Renew toggles should both show "On". All of this can be checked immediately after checkout — there is no waiting period.

**What it unblocks:** immediately after the domain exists, connect Google Search Console to it — that's the only next step any issue asks for (#19's checklist item 2). DNS records and the SWA custom domain are §4 below, and that step also needs §2 (the app deployed) done first — do not attempt it until both §1 and §2 are checked off.

Note: #19's 6-month organic-clicks gate does not start counting the day you register. Its month 1 begins when the first `/tools/` page **and** the third game are live in production (#19's own wording) — registering the domain only removes the block on connecting Search Console.

## 2. Azure SWA phase 2 — set `AZURE_STATIC_WEB_APPS_API_TOKEN`

**Why blocked on you:** the token comes from an Azure resource tied to your subscription; an agent has no Azure credentials.

**Steps:**
- [ ] Check whether the resource already exists: go to `portal.azure.com`, sign in, type "Static Web Apps" into the search bar at the top, and click the matching service. If an app for this site is already listed, skip to the next step.
- [ ] **If no app is listed, create one — this costs money.** Click **+ Create**. Pick your subscription, then create or pick a resource group. Name the app (for example `watduang`). Pick any region close to Thailand (for example "East Asia" or "Southeast Asia"). For **Plan type**, pick **Standard** (this project's stack requires Standard, not Free) — the review screen shows the exact monthly price before you click Create; read it there. For **Deployment details / Source**, you must pick **Other** — **do not pick GitHub**. Picking GitHub lets Azure auto-connect the repo, which causes the exact problem described in the warning below. Click **Create** and wait — the portal shows "Your deployment is complete" when the resource is ready, usually within a couple of minutes.
- [ ] Get the resource's deployment token: open the Static Web App resource → **Overview** (left menu) → **Manage deployment token** → click the copy icon next to the token value shown.
- [ ] In GitHub: open this repo in your browser → **Settings** tab → **Secrets and variables** (left sidebar) → **Actions** → **New repository secret**. In the "Name" field type exactly `AZURE_STATIC_WEB_APPS_API_TOKEN`. In the "Secret" field paste the value you copied. Click **Add secret**.

⚠ **Add the secret by hand — do not let the Azure portal connect GitHub for you, at the create step above or afterward.** The portal's own
"deploy from GitHub" flow generates *its own* secret name with a random suffix appended
(`AZURE_STATIC_WEB_APPS_API_TOKEN_LEMON_WAVE_00AD12A10`) and commits *its own* workflow file to this repo automatically —
an outward-facing, hard-to-undo change. This repo's
`ci.yml` already reads the plain, unsuffixed name — gating the job at `HAS_DEPLOY_TOKEN` (`:14`) and consuming
it in the "Deploy to Azure Static Web Apps" step's `azure_static_web_apps_api_token` input (`:208`) — so a
portal-generated secret would not be found — and the generated workflow would collide with the hand-written
one that CI depends on.

Rotation: resetting the token (portal **Reset token**, or `az staticwebapp secrets reset-api-key`) does
**not** update GitHub. Deploys fail until you paste the new value into the same secret.

**How you know it worked:** `.github/workflows/ci.yml` reads the secret at the job level (`HAS_DEPLOY_TOKEN`) and consumes it in the "Deploy to Azure Static Web Apps" step. That step only runs `if` the event is a `push` to `refs/heads/main` **and** the token is set. So: push a commit to `main`, open the run in the GitHub Actions tab (repo → **Actions** tab → click the newest run), and confirm the "Deploy to Azure Static Web Apps" step is no longer reported as `skipped`. This typically finishes within a few minutes of the push — refresh the run page to see it update. Checking a pull-request run will always show it `skipped` regardless of the secret — that is not a sign of failure.

**What it unblocks:** this is **the only thing that can prove CSP/AdSense for real** — until the site is actually deployed and live, ad rendering under the CSP is unverified.

## 3. Real-phone pass — [#13](https://github.com/warischa/watduang/issues/13) DoD item 4 + [#20](https://github.com/warischa/watduang/issues/20)

**Why blocked on you:** wake lock, iOS audio unlock, and sessionStorage restore-after-refresh only prove out on a real phone browser — no test suite covers them.

**This section cannot start until §2 above is done.** There is no live site to test on a phone until the first deploy has actually run (§2) — this test uses the `azurestaticapps.net` URL, not `watduang.com`, so §1 (buying the domain) is not a prerequisite and can happen later. Do not attempt this section before §2 is checked off.

**#13 DoD item 4 (verbatim from the issue):**

> เล่นจริงบนมือถือ 1 เครื่อง: start → ส่งวน → boom → เล่นอีกรอบ — จอไม่ดับกลางรอบ (wake lock) และเสียงออกบน iOS (unlock จากปุ่ม start)

In English: on one real phone, play `timebomb` for real — start → pass it around → boom → play again. The screen must not go dark mid-round (wake lock working), and sound must play on iOS (unlocked by the tap on the start button).

**#20's open item, same pass** (issue says explicitly this can be done together with #13 DoD item 4):
- [ ] Play `siamsi` to mid-round → refresh the page → press `เริ่มรอบ` → press `กลับไปเล่นรอบที่ค้าง` → the same round must come back, not restart.
- [ ] **Do the same again with a numbered round** — start via `เริ่มแบบ "คนที่ 1, 2, 3…"`, get to mid-round, refresh, resume. This is the path [#23](https://github.com/warischa/watduang/issues/23) just rewrote, so it is the one most worth a real phone.
- Note the extra tap: resuming now goes through a two-button question (`กลับไปเล่นรอบที่ค้าง` / `เริ่มรอบใหม่`) rather than resuming on its own — that is deliberate, see [ADR-0008](adr/0008-starting-a-round-never-resumes-or-discards-one-silently.md). A refresh that comes straight back into the round *without* asking would be a bug worth reporting.

**Steps:**
- [ ] Open the site's Azure URL on one real phone — find it in the Azure portal: Static Web Apps → the app → **Overview** → the URL shown at the top of the page (it looks like `something.azurestaticapps.net`). `watduang.com` itself will not point at the site yet — connecting the domain is §4 below, done after this section.
- [ ] Run the `timebomb` sequence above.
- [ ] Run both `siamsi` mid-round refresh checks above — normal-started, then numbered.

**How you know it worked:** all of the above hold true on the phone, with no workaround needed.

**What it unblocks:** ticking #13 DoD item 4 closes issue #13 (its other three DoD boxes are already checked). The `siamsi` item closes the one open task left on #20.

## 4. Connect `watduang.com` to the Azure Static Web App

**Why blocked on you:** adding a custom domain needs the registrar account from §1 and the Azure resource from §2 — both are yours, an agent has credentials for neither.

**This section cannot start until §1 (domain registered) and §2 (app deployed) are both done.** The exact target values below (the app's default hostname) only exist once §2's resource is created.

**Steps:**
- [ ] Get the app's default hostname: Azure portal → Static Web Apps → the app → **Overview** → copy the URL shown there without `https://` (it looks like `something.azurestaticapps.net`). You'll paste this exact value into DNS records below.
- [ ] **`www.watduang.com` (subdomain) — do this one first:** at your registrar's DNS management page (the same account from §1), add a **CNAME** record: Host/Name `www`, Value/Target = the default hostname you copied above, TTL default/automatic.
- [ ] In the Azure portal: Static Web Apps → the app → **Custom domains** (left menu) → **+ Add** → enter `www.watduang.com` → Azure detects this as a CNAME-validated subdomain automatically → click **Add**. Wait for the status to change from validating to **Ready** (can take up to a few hours for DNS to propagate — refresh the Custom domains page to check).
- [ ] **`watduang.com` (apex/root domain):** in the Azure portal: Static Web Apps → the app → **Custom domains** → **+ Add** → enter `watduang.com`. Azure shows validation type **TXT** and displays the exact TXT record value to use. Copy that value.
- [ ] At the registrar's DNS management page, add a **TXT** record: Host/Name `@` (root), Value = the exact token Azure just showed you. Save, then go back to the Azure portal and click **Validate** (or wait — Azure re-checks automatically) until it accepts the TXT record.
- [ ] After the TXT record validates, the Azure portal shows the next record it needs to route traffic to the apex — this is normally an **ALIAS** or **ANAME** record (a plain A/static-IP record is not offered because Azure Static Web Apps has no fixed IP). Add whatever record type and value the portal displays, at the registrar's DNS management page, with Host/Name `@` (root).
- [ ] If the registrar's DNS panel has no ALIAS or ANAME record type available, move the domain's **nameservers** to a DNS provider that does support one — Azure DNS or Cloudflare. At the registrar's domain settings page, find "Nameservers" (sometimes "DNS management" or "Custom DNS") and switch it from the registrar's default to the new provider's nameserver addresses (Azure DNS: create a DNS zone for `watduang.com` first, then use the 4 nameservers listed under that zone's **Overview**; Cloudflare: add `watduang.com` as a site, then use the 2 nameservers it assigns). Save the change, then run `dig NS watduang.com` (or `nslookup -type=NS watduang.com`) to confirm it took — it should return the new provider's nameservers, not the registrar's; this can take up to 24-48 hours to propagate. Once it shows the new nameservers, create the ALIAS/ANAME record for `@` pointing at the same target from the previous step, in the new provider's DNS zone — then continue this section unchanged.
- [ ] Set the canonical domain: in the Azure portal's **Custom domains** list, find `watduang.com` showing status **Ready** → open its **···** menu → **Set as default domain**. Wait for the status to stay **Ready** (can take up to a few hours for DNS to propagate — refresh the Custom domains page to check).

**How you know it worked:** the Azure portal's **Custom domains** page lists both `watduang.com` and `www.watduang.com` with status **Ready**, not "Validating" or an error, and `watduang.com` is marked **Default**. Open `https://watduang.com` and `https://www.watduang.com` in a browser on any device — both must load the live site with a valid padlock/certificate (Azure issues the TLS certificate automatically once validation succeeds — no separate certificate step is needed).

**What it unblocks:** `watduang.com` finally points at the deployed site instead of only the `azurestaticapps.net` URL — the domain bought in §1 and the app deployed in §2 are now the same site a visitor reaches, on one canonical hostname.
