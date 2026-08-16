# Site owner checklist

Five things no agent can do. §1 and §2 are runnable start-to-finish right now; §3, §4, and §5 are
gated on these two — each says exactly what it's waiting on — and moved to
[post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget.
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

**What it unblocks:** immediately after the domain exists, connect Google Search Console to it — that's the only next step any issue asks for (#19's checklist item 2). DNS records and the SWA custom domain are §4 in [post-launch-checklist.md](post-launch-checklist.md), and that step also needs §2 (the app deployed) done first — do not attempt it until both §1 and §2 are checked off.

Note: #19's 6-month organic-clicks gate does not start counting the day you register. Its month 1 begins when the first `/tools/` page **and** the third game are live in production (#19's own wording) — registering the domain only removes the block on connecting Search Console.

## 2. Azure SWA phase 2 — set `AZURE_STATIC_WEB_APPS_API_TOKEN`

**Why blocked on you:** the token comes from an Azure resource tied to your subscription; an agent has no Azure credentials.

**Steps:**
- [ ] Check whether the resource already exists: go to `portal.azure.com`, sign in, type "Static Web Apps" into the search bar at the top, and click the matching service. If an app for this site is already listed, skip to the next step.
- [ ] **If no app is listed, create one — this costs money.** Click **+ Create**. Pick your subscription, then create or pick a resource group. Name the app (for example `watduang`). Pick any region close to Thailand (for example "East Asia" or "Southeast Asia"). For **Plan type**, pick **Standard** (this project's stack requires Standard, not Free) — the review screen shows the exact monthly price before you click Create; read it there. For **Deployment details / Source**, you must pick **Other** — **do not pick GitHub**. Picking GitHub lets Azure auto-connect the repo, which causes the exact problem described in the warning below. Click **Create** and wait — the portal shows "Your deployment is complete" when the resource is ready, usually within a couple of minutes.
- [ ] Get the resource's deployment token: open the Static Web App resource → **Overview** (left menu) → **Manage deployment token** → click the copy icon next to the token value shown.
- [ ] In GitHub: open this repo in your browser → **Settings** tab → **Secrets and variables** (left sidebar) → **Actions** → **New repository secret**. In the "Name" field type exactly `AZURE_STATIC_WEB_APPS_API_TOKEN`. In the "Secret" field paste the value you copied. Click **Add secret**.

⚠ **The moment you click Add secret, every future `git push` to `main` — by anyone, not just you — becomes a real production deploy.** `ci.yml` checks whether this secret exists at the job level (`:13-14`); it doesn't check whether you meant to arm it. There is no separate "go live" switch — the secret existing IS the switch. If you're not ready for that yet, don't add the secret. To turn it back off later: delete the secret at the same GitHub Settings screen — the next push after that will skip the deploy step again, same as today.

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

**How you know it worked:** immediately after clicking **Add secret**, this repo's **Settings → Secrets and variables → Actions** page lists `AZURE_STATIC_WEB_APPS_API_TOKEN` (the value itself is never shown again — that's normal). That confirms the secret exists; it does not by itself confirm a deploy. To confirm an actual deploy, you need a push to `main` — but per the warning above, that's not a free test: it's a real production deploy, the same one every future push to `main` will now trigger. When one happens (yours or anyone else's), open the GitHub **Actions** tab → click that run → confirm the "Deploy to Azure Static Web Apps" step is no longer reported as `skipped`. This typically finishes within a few minutes of the push. Checking a pull-request run will always show it `skipped` regardless of the secret — that is not a sign of failure.

**What it unblocks:** a live deploy is **necessary** to prove CSP/AdSense for real — until the site is actually deployed and live, ad rendering under the CSP is unverified. It is **not sufficient on its own**: the four ad-slot boxes ([#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18)) also need an AdSense publisher ID, which is §5 in [post-launch-checklist.md](post-launch-checklist.md). Doing §2 alone does not close them.

## 3. Real-phone pass — [#13](https://github.com/warischa/watduang/issues/13) DoD item 4 + [#20](https://github.com/warischa/watduang/issues/20)

Moved to [post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget. The
heading stays here so a heading scan still finds it, and so an existing §3 citation still resolves
in one hop.

## 4. Connect `watduang.com` to the Azure Static Web App

Moved to [post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget. The
heading stays here so a heading scan still finds it, and so an existing §4 citation still resolves
in one hop.

## 5. AdSense account + publisher ID — [#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18)

Moved to [post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget. The
heading stays here so a heading scan still finds it, and so an existing §5 citation still resolves
in one hop.
