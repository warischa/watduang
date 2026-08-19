# Site owner checklist

Five things no agent can do. §1 and §2 are runnable start-to-finish right now; §3, §4, and §5 are
gated on these two — each says exactly what it's waiting on — and moved to
[post-launch-checklist.md](post-launch-checklist.md) to stay under the doc budget.
Rationale for every decision lives in the linked issues; this doc restates only the steps.

## ⚠ Read this before doing any of the three below

**Right now, `gh api repos/warischa/watduang/actions/secrets` returns `total_count: 0` (verified
2026-08-18) — this repo has no secrets, so every push to `main` today builds and runs CI only, it
does **not** deploy.** `ci.yml` gates the deploy on `HAS_DEPLOY_IDENTITY`,
true only when all three of `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` exist —
the instant the third one is added (the last action in §2 below), **every future push to `main`, by
anyone, permanently becomes a live production deploy.** There is no separate "go live" switch; two of
the three arm nothing. Any assumption anyone has been working under — "pushing to main is safe,
nothing ships" — is void from the second that third secret is added, and stays void until one of
them is deleted again.

**Do these three in this order — each is a real prerequisite for the next, not just a
suggestion:**

1. **§2 below — arm the Azure deploy identity.** Do this first: it's the only one of the three that unblocks
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

What registering the domain unblocks — moved to
[site-owner-checklist-background.md](site-owner-checklist-background.md) (byte-identical).

## 2. Azure SWA phase 2 — add the three deploy identity secrets

**Why blocked on you:** only a repo admin can add repository secrets, and the identity they name lives
in your Azure tenant — an agent has neither.

Background on what was already built in Azure before these steps — moved to
[site-owner-checklist-background.md](site-owner-checklist-background.md) (byte-identical).

**Steps — add three repository secrets:**
- [ ] Open this repo in your browser → **Settings** tab → **Secrets and variables** (left sidebar) → **Actions** → **New repository secret**.
- [ ] Name field: exactly `AZURE_CLIENT_ID`. Secret field: `5ba15c58-2635-40b9-9b50-e69594d69430`. Click **Add secret**.
- [ ] **New repository secret** again — name `AZURE_TENANT_ID`, secret `bbf3b249-d680-458b-9ec7-52dba8859dca`, **Add secret**.
- [ ] **New repository secret** again — name `AZURE_SUBSCRIPTION_ID`, secret `b337bf17-02fa-4dd0-8526-e71fee2b6f61`, **Add secret**.

Why these are *secrets* not *variables*, and what `total_count` doesn't tell you — moved to
[site-owner-checklist-background.md](site-owner-checklist-background.md) (byte-identical).

⚠ **The moment the third one is added, every future `git push` to `main` — by anyone, not just you —
becomes a real production deploy.** `ci.yml` does not check whether you meant to arm it; the three
secrets existing IS the switch. Two ways to disarm: delete any one of them at the same GitHub screen
(fast, repo side — the next push skips the deploy again), or delete the federated credential in Entra
ID (authoritative, Azure side — after that even a fully armed repo cannot sign in).

And once armed, **Re-run all jobs** on an older green `main` push is a real deploy too — the gate is
re-evaluated against today's secrets, not against whatever was configured when that run first ran. An
old run is not a free way to test the deploy.

⚠ **Do not let the Azure portal connect GitHub for you — not while creating a resource, not
afterwards.** This is why the app was created with source "Other", and it still matters if anyone ever
recreates it. The portal's own "deploy from GitHub" flow generates *its own* secret with a random
suffix (`AZURE_STATIC_WEB_APPS_API_TOKEN_LEMON_WAVE_00AD12A10`) and commits *its own* workflow file to
this repo automatically — an outward-facing, hard-to-undo change. That workflow would collide with the
hand-written `ci.yml` CI depends on, and its secret is not a name this repo reads.

Rotation background — moved to
[site-owner-checklist-background.md](site-owner-checklist-background.md) (byte-identical).

**How you know it worked:** this repo's **Settings → Secrets and variables → Actions** page lists all
three names (the values are never shown again — that's normal). That confirms they exist; it does not
confirm a deploy. For that you need a push to `main` — not a free test, it is the real production
deploy every future push will now trigger. When one happens (yours or anyone else's), open the
**Actions** tab → that run → the "Azure login (OIDC)", "Fetch SWA deployment token" and "Deploy to
Azure Static Web Apps" steps should all run instead of being reported as `skipped`. A pull-request run
shows all three `skipped` no matter what the secrets say — that is not a sign of failure.

What arming the deploy identity unblocks — moved to
[site-owner-checklist-background.md](site-owner-checklist-background.md) (byte-identical).

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
