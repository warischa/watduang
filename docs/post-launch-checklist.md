# Post-launch checklist

Moved out of `site-owner-checklist.md` to stay under the house doc budget. §1 (register the domain)
and §2 (arm the Azure deploy secret) stay in [site-owner-checklist.md](site-owner-checklist.md) —
do those first. §3, §4, and §5 here are gated on those two — each says exactly what it's waiting on.
Rationale for every decision lives in the linked issues; this doc restates only the steps.

## 3. Real-phone pass — [#13](https://github.com/warischa/watduang/issues/13) DoD item 4 + [#20](https://github.com/warischa/watduang/issues/20)

**Why blocked on you:** wake lock, iOS audio unlock, and sessionStorage restore-after-refresh only prove out on a real phone browser — no test suite covers them.

**This section cannot start until §2 (`site-owner-checklist.md` §2) is done.** There is no live site to test on a phone until the first deploy has actually run (§2) — this test uses the `azurestaticapps.net` URL, not `watduang.com`, so §1 (buying the domain, `site-owner-checklist.md` §1) is not a prerequisite and can happen later. Do not attempt this section before §2 is checked off.

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

**This section cannot start until §1 (domain registered) and §2 (app deployed) — both in `site-owner-checklist.md` — are done.** The exact target values below (the app's default hostname) only exist once §2's resource is created.

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

## 5. AdSense account + publisher ID — [#29](https://github.com/warischa/watduang/issues/29), closing boxes on [#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18)

**Why blocked on you:** an AdSense account is tied to your Google identity, your address, and your payment and tax details. An agent has none of these and must never enter them.

**This section cannot start until §1 and §2 (both in `site-owner-checklist.md`) and §4 above are done.** AdSense reviews a *live site on its real domain* — there is nothing to submit until `watduang.com` loads the deployed site.

**Steps:**
- [ ] Go to `adsense.google.com`, sign in with the Google account you want to own this revenue, and follow its sign-up flow. It asks for your country, address, and payment details — enter these yourself.
- [ ] Add `watduang.com` as a site in the AdSense dashboard and request review. Approval commonly takes days to weeks; there is no way to shorten it.
- [ ] Copy your **publisher ID** — it looks like `ca-pub-0000000000000000`. This is the value the site needs. It is not a secret in the credential sense (it ships in the page), but paste it into the repo yourself or hand it to an agent explicitly.
- [ ] Once approved, tell whoever is doing the integration that §5 is done and give them the publisher ID.

⚠ **Do not paste Google's activation snippet into a page.** AdSense gives you an inline `<script>` block. This site's CSP sets no `'unsafe-inline'` in `script-src` by design, and CI has a gate that fails the build on any inline page script ([ADR-0005](adr/0005-page-js-must-never-inline.md); the gate is the "CSP inline-script gate (dist artifact)" step in `.github/workflows/ci.yml`, around `:85`). The ad tag has to be integrated as an **external, self-hosted script file** served under `'self'`, exactly like the site's own `_astro/*.js` bundles. Pasting the snippet inline will fail CI, and loosening the CSP to make it pass is the one fix that is not allowed.

⚠ **Pages that carry `ads: false` keep it.** That flag is a deliberate content-policy decision, not an oversight — see [#5](https://github.com/warischa/watduang/issues/5). Enabling ads there is a separate decision with legal and policy weight, never a side effect of switching AdSense on.

**How you know it worked:** the AdSense dashboard shows your site as **Ready** (not "Getting ready" or "Needs attention"), and you have a `ca-pub-` publisher ID in hand. Nothing on the live site changes yet at that point — wiring the ID into the site is the implementation step this section unblocks, not part of this section.

**What it unblocks:** the four ad-slot DoD boxes on [#15](https://github.com/warischa/watduang/issues/15)-[#18](https://github.com/warischa/watduang/issues/18), **together with §2** — a live deploy proves ad rendering under the real CSP, and this section supplies the ID there is nothing to render without. Neither section closes those boxes alone.
