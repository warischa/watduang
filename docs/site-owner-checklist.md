# Site owner checklist

Five things no agent can do. §1 and §2 are runnable start-to-finish right now; §3, §4, and §5 are
gated on these two — each says exactly what it's waiting on — and moved to
[post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget.
Rationale for every decision lives in the linked issues; this doc restates only the steps.

## ⚠ Read this before doing any of the three below

**Right now, `gh api repos/warischa/watduang/actions/secrets` returns `total_count: 0` (verified
2026-08-18) — this repo has no secrets, so every push to `main` today builds and runs CI only, it
does **not** deploy.** `ci.yml` gates the entire Deploy step on
`HAS_DEPLOY_TOKEN: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN != '' }}` — the instant that one
secret exists (the last action in §2 below), **every future push to `main`, by anyone, permanently
becomes a live production deploy.** There is no separate "go live" switch and no way to arm it
partially. Any assumption anyone has been working under — "pushing to main is safe, nothing ships"
— is void from the second that secret is added, and stays void until it's deleted again.

**Do these three in this order — each is a real prerequisite for the next, not just a
suggestion:**

1. **§2 below — Azure deploy token.** Do this first: it's the only one of the three that unblocks
   something *by itself* (the real-phone pass, [#13](https://github.com/warischa/watduang/issues/13)
   DoD item 4 — see [post-launch-checklist.md](post-launch-checklist.md) §3, needs a live deploy on
   the `azurestaticapps.net` URL, not the custom domain). It is also a hard prerequisite for
   everything downstream — §4 (connect the domain) and §5 (AdSense) both require a deployed app to
   exist first.
2. **§1 below — register `watduang.com`.** Do this second: on its own it only unblocks connecting
   Google Search Console. Its real weight is as the other prerequisite §4 needs — AdSense (§5)
   reviews a live site on the real domain, so this has to land before that domain can be connected
   or reviewed.
3. **§5, in [post-launch-checklist.md](post-launch-checklist.md) — AdSense publisher ID.** Do this
   last: it depends on both of the above (through §4, connecting the domain), so nothing is left for
   it to unblock until §2 and §1 are both done. It's the final domino — landing it lets
   [#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18)
   each close their one remaining ad-slot checkbox. **What it does *not* do automatically: close the
   epic [#14](https://github.com/warischa/watduang/issues/14).** Verified against the issues
   themselves — #14 carries no DoD checkboxes of its own, and GitHub's sub-issue relation on #14
   only lists #21 and #22 (both already closed, unrelated to ads); #15-#18 name #14 as "Parent" in
   prose only, not as a tracked sub-issue. So ticking #15-#18's ad-slot boxes does not auto-close
   #14 — closing it once all four tools are done is a judgment call for whoever's working the
   tracker, not something that happens on its own.

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

**What it unblocks:** immediately, on its own — [#13](https://github.com/warischa/watduang/issues/13)'s
last open DoD box, the real-phone pass ([post-launch-checklist.md](post-launch-checklist.md) §3). That
test runs on the app's `azurestaticapps.net` URL, so it needs no domain — §2 alone is enough to close
#13. A live deploy is also **necessary** to prove CSP/AdSense for real — until the site is actually
deployed and live, ad rendering under the CSP is unverified. It is **not sufficient on its own** for
ads: the four ad-slot boxes ([#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18)) also need an AdSense publisher ID, which is §5 in [post-launch-checklist.md](post-launch-checklist.md), and §4 (connecting the domain) besides. Doing §2 alone does not close them.

## 3. Real-phone pass — [#13](https://github.com/warischa/watduang/issues/13) DoD item 4 + [#20](https://github.com/warischa/watduang/issues/20)

Moved to [post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget. The
heading stays here so a heading scan still finds it, and so an existing §3 citation still resolves
in one hop.

## 4. Connect `watduang.com` to the Azure Static Web App

Moved to [post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget. The
heading stays here so a heading scan still finds it, and so an existing §4 citation still resolves
in one hop.

## 5. AdSense account + publisher ID — [#29](https://github.com/warischa/watduang/issues/29)

Full steps live in [post-launch-checklist.md](post-launch-checklist.md) §5 — including the two
constraints that matter most: Google's inline activation snippet must NOT be pasted into a page
(ADR-0005; CI fails the build on it), and pages carrying `ads: false` keep it. The heading stays here
so a heading scan still finds it, and so an existing §5 citation still resolves in one hop.

Ordering, and what it does *not* close (epic [#14](https://github.com/warischa/watduang/issues/14)),
are in the warning at the top of this doc.
