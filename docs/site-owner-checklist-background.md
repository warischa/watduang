# Site owner checklist — background

Moved verbatim out of `docs/site-owner-checklist.md` to keep that file under the repo byte budget.
See that file for the live steps and go-live warnings; everything here is rationale, historical
detail, or background — none of it is a step you need to perform.

## §1 — what registering the domain unblocks

**What it unblocks:** immediately after the domain exists, connect Google Search Console to it — that's the only next step any issue asks for (#19's checklist item 2). DNS records and the SWA custom domain are §4 in [post-launch-checklist.md](post-launch-checklist.md), and that step also needs §2 (the app deployed) done first — do not attempt it until both §1 and §2 are checked off.

Note: #19's 6-month organic-clicks gate does not start counting the day you register. Its month 1 begins when the first `/tools/` page **and** the third game are live in production (#19's own wording) — registering the domain only removes the block on connecting Search Console.

## §2 — what was already built in Azure

**Already built in Azure on 2026-08-19 — do not recreate any of it:** the Static Web App **`watduang`**
(resource group **`rg-watduang`**, Standard, East Asia), created with **Deployment source: Other** so
Azure never attached a workflow of its own; and an app registration whose federated credential is
scoped to `repo:warischa/watduang:ref:refs/heads/main`, holding Contributor on that one resource and
carrying **zero client secrets or certificates**. GitHub signs in with OIDC, so there is no deployment
token to copy or paste any more.

## §2 — why these are secrets, not variables

All three are identifiers, not passwords. They go in *secrets* rather than *variables* so the armed
state lives in one list rather than two — split across both, a check that reads only one would call an
armed repo unarmed. But be precise about what the count tells you: **`actions/secrets total_count` is a
conservative hint, not the answer.** One of three, or any unrelated secret, makes it non-zero while
`ci.yml` is still not armed. The authoritative test is all three of these exact names being present.
The imprecision runs toward "treat a push as a deploy", which is the safe direction to be wrong in.

## §2 — secret rotation

Rotation: nothing to rotate. `ci.yml` fetches the deployment token fresh on every run using the OIDC
session and never stores it, so **Reset token** in the portal no longer breaks deploys.

## §2 — what arming the deploy identity unblocks

**What it unblocks:** immediately, on its own — [#13](https://github.com/warischa/watduang/issues/13)'s
last open DoD box, the real-phone pass ([post-launch-checklist.md](post-launch-checklist.md) §3). That
test runs on the app's `azurestaticapps.net` URL, so it needs no domain — §2 alone is enough to close
#13. A live deploy is also **necessary** to prove CSP/AdSense for real — until the site is actually
deployed and live, ad rendering under the CSP is unverified. It is **not sufficient on its own** for
ads: the four ad-slot boxes ([#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18)) also need an AdSense publisher ID, which is §5 in [post-launch-checklist.md](post-launch-checklist.md), and §4 (connecting the domain) besides. Doing §2 alone does not close them.
