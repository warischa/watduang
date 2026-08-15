#!/usr/bin/env bash
# Interactive wizard for the site owner — walks the owner-gated steps in
# docs/site-owner-checklist.md §1 (register domain), §2 (Azure deploy token),
# and §4 (connect domain to Azure). See that doc for full rationale; this
# script only prompts, explains, waits, and (optionally) runs read-only
# checks. It never touches Azure, GitHub, or a registrar itself.
#
# §3 (real-phone pass) is deliberately excluded: it's a manual test on a
# phone, not an account/credential/domain step an agent is locked out of by
# definition — nothing here for a wizard to gate.
#
# This script:
#   - NEVER runs `az`, `curl -X`, `gh api -X`, `rm`, or any deploy command.
#   - NEVER creates, mutates, or deletes anything (Azure, GitHub, DNS, domain).
#   - Only reads (optional `dig`/`whois`/`gh secret list` checks, all
#     read-only) after you confirm you've done a step, so you catch mistakes
#     before moving on.
#
# Usage:
#   ./scripts/site-owner-wizard.sh            interactive walkthrough
#   ./scripts/site-owner-wizard.sh --check     print every step, no prompts,
#                                              no network calls — dry run
#   ./scripts/site-owner-wizard.sh --help      this text

set -uo pipefail

CHECK_MODE=0
for arg in "$@"; do
  case "$arg" in
    --help|-h)
      grep '^#' "$0" | sed 's/^#//; s/^ //'
      exit 0
      ;;
    --check|--dry-run)
      CHECK_MODE=1
      ;;
    *)
      echo "Unknown flag: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

STEP_NUM=0

# Print a step's instructions. In --check mode, that's all it does.
# In interactive mode, wait for the owner to confirm before continuing.
step() {
  local title="$1"
  local body="$2"
  STEP_NUM=$((STEP_NUM + 1))
  echo
  echo "── Step ${STEP_NUM}: ${title} ──"
  echo "$body"
  if [ "$CHECK_MODE" -eq 1 ]; then
    return
  fi
  local ans
  while true; do
    # EOF (Ctrl-D, or stdin not a terminal) must end the wizard, not spin forever.
    read -r -p "Done? [y = yes, s = skip, q = quit wizard] " ans || {
      echo
      echo "No input available — quitting. Nothing was changed by this wizard."
      exit 1
    }
    case "$ans" in
      y|Y) break ;;
      s|S) echo "Skipped — you can re-run this wizard later."; break ;;
      q|Q) echo "Quitting. Nothing was changed by this wizard."; exit 0 ;;
      *) echo "Type y, s, or q." ;;
    esac
  done
}

# Optional read-only check, run only after the owner confirms a step.
# Never runs in --check mode (no network calls in the dry run).
maybe_verify() {
  local label="$1"
  local cmd="$2"
  if [ "$CHECK_MODE" -eq 1 ]; then
    return
  fi
  # EOF is treated as "no" — never block, never run a check nobody asked for.
  read -r -p "Run a read-only check now (${label})? [y/N] " ans || ans=""
  case "$ans" in
    y|Y)
      echo "+ $cmd"
      eval "$cmd" || echo "(check did not confirm it yet — that can be normal if DNS/propagation is still in progress)"
      ;;
    *) : ;;
  esac
}

echo "watduang.com site-owner wizard"
echo "Walks docs/site-owner-checklist.md §1, §2, §4. Performs nothing itself —"
echo "every account, payment, and credential action is yours to click through."
[ "$CHECK_MODE" -eq 1 ] && echo "(--check mode: printing every step, no prompts, no network calls)"

# ── §1: Register watduang.com ──────────────────────────────────────────────
echo
echo "=== §1. Register watduang.com ==="
echo "Why this needs you: buying a domain needs your card and identity — no agent has either."

step "Check availability" \
"Go to a registrar (e.g. namecheap.com), search \"watduang.com\", confirm it
still shows AVAILABLE. If it's taken, stop and flag it — do not substitute a
different name yourself."

step "Buy watduang.com" \
"COSTS MONEY, CANNOT BE UNDONE. Add watduang.com to cart, check out with your
card. Read the exact price on the checkout page before paying. If the
registrar upsells lomwong.com as \"similar\" — skip it, that's a different,
already-parked domain at broker markup."

step "(Optional) buy the typo guard" \
"Same checkout, optionally also add wadduang.com (double \"d\"). Skip if you
want to keep cost down — not required."

step "Turn on WHOIS privacy" \
"Registrar dashboard → find watduang.com → domain settings → turn on
\"WHOIS Privacy\" / \"Domain Privacy\" / \"ID Protection\"."

step "Turn on auto-renew" \
"Same settings screen → turn on Auto-Renew, confirm the card on file is
valid. An expired domain after the site ranks is hard to get back."

maybe_verify "public whois lookup for watduang.com" \
  "whois watduang.com 2>/dev/null | head -20"

# ── §2: Azure SWA phase 2 — deploy token ───────────────────────────────────
echo
echo "=== §2. Azure Static Web Apps — set AZURE_STATIC_WEB_APPS_API_TOKEN ==="
echo "Why this needs you: the token comes from an Azure resource tied to your subscription."

step "Check whether the SWA resource already exists" \
"portal.azure.com → search \"Static Web Apps\" → open it. If an app for this
site is already listed, skip to the next step."

step "Create the resource if it's not listed" \
"COSTS MONEY. + Create → pick subscription + resource group → name it (e.g.
\"watduang\") → region near Thailand → Plan type: STANDARD (this project
needs Standard, not Free) → Deployment details / Source: pick OTHER, NOT
GitHub (picking GitHub makes Azure auto-connect the repo and generate its
own conflicting secret + workflow file — see the checklist's ⚠ for why).
Click Create, wait for \"Your deployment is complete\"."

step "Copy the deployment token" \
"Static Web App resource → Overview → \"Manage deployment token\" → copy the
value shown."

step "Add the GitHub secret" \
"This repo on github.com → Settings → Secrets and variables → Actions →
New repository secret. Name: exactly AZURE_STATIC_WEB_APPS_API_TOKEN.
Secret: paste the value you copied. Click Add secret.
Do NOT let the Azure portal's own \"deploy from GitHub\" flow do this for
you — it creates a differently-named secret and its own workflow file that
collides with this repo's ci.yml."

maybe_verify "secret name is present in this repo (value is never shown)" \
  "if command -v gh >/dev/null 2>&1; then gh secret list --repo warischa/watduang 2>/dev/null | grep AZURE_STATIC_WEB_APPS_API_TOKEN; else echo 'gh (GitHub CLI) not found on this machine -- check the same thing on the web instead: this repo on github.com -> Settings -> Secrets and variables -> Actions, and look for AZURE_STATIC_WEB_APPS_API_TOKEN in the Repository secrets list.'; fi"

# ── §4: Connect watduang.com to the Azure Static Web App ───────────────────
echo
echo "=== §4. Connect watduang.com to the Azure Static Web App ==="
echo "Needs §1 (domain registered) and §2 (app deployed) both done first."

step "Copy the app's default hostname" \
"Azure portal → Static Web Apps → the app → Overview → copy the URL shown
there, without https:// (looks like something.azurestaticapps.net)."

step "Add the www CNAME (do this one first)" \
"Registrar DNS management → add a CNAME record: Host/Name \"www\",
Value/Target = the default hostname you just copied, TTL default."

step "Add www.watduang.com as a custom domain in Azure" \
"Azure portal → the app → Custom domains → + Add → enter
www.watduang.com → Azure auto-detects it as CNAME-validated → Add. Wait for
status Ready (can take hours for DNS to propagate)."

step "Add the apex watduang.com as a custom domain in Azure" \
"Azure portal → Custom domains → + Add → enter watduang.com. Azure shows a
TXT validation type and the exact TXT value to use — copy it."

step "Add the TXT record and validate" \
"Registrar DNS management → add a TXT record: Host/Name \"@\", Value = the
exact token Azure showed you. Save, then Validate in the Azure portal (or
wait for it to auto re-check)."

step "Add the ALIAS/ANAME record for the apex" \
"After TXT validates, Azure shows the next record it needs — normally
ALIAS or ANAME (no plain A record: Azure Static Web Apps has no fixed IP).
Add that exact record/value at the registrar, Host/Name \"@\".
IMPORTANT: if your registrar's DNS panel has no ALIAS/ANAME record type,
the fallback is a NAMESERVER MIGRATION to a provider that has one (Azure
DNS or Cloudflare) — NOT registrar-level domain forwarding. Forwarding
breaks the apex canonical (see astro.config.mjs:5). Registrar settings →
Nameservers → point at the new provider's nameservers, confirm with
\`dig NS watduang.com\` (if this machine doesn't have \`dig\`, use \`nslookup
-type=NS watduang.com\` instead -- more commonly installed; if neither
command exists, check via the web instead, e.g.
https://mxtoolbox.com/SuperTool.aspx?action=ns%3awatduang.com), then create the
ALIAS/ANAME record in that provider's zone instead, and continue this step
unchanged."

step "Set watduang.com as the default domain" \
"Azure portal → Custom domains list → watduang.com showing status Ready →
··· menu → Set as default domain. Wait for status to stay Ready."

maybe_verify "DNS + live site for both hostnames" \
  "if command -v dig >/dev/null 2>&1; then dig +short CNAME www.watduang.com; dig +short TXT watduang.com; elif command -v nslookup >/dev/null 2>&1; then nslookup -type=CNAME www.watduang.com; nslookup -type=TXT watduang.com; else echo 'no dig or nslookup on this machine -- check DNS via the web instead, e.g. https://mxtoolbox.com/SuperTool.aspx?action=cname%3awww.watduang.com and https://mxtoolbox.com/SuperTool.aspx?action=txt%3awatduang.com'; fi; curl -s -o /dev/null -w 'watduang.com -> %{http_code}\n' https://watduang.com; curl -s -o /dev/null -w 'www.watduang.com -> %{http_code}\n' https://www.watduang.com"

echo
echo "Wizard done. Nothing above was performed automatically — every ☑ is yours."
