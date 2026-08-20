#!/usr/bin/env bash
# Interactive wizard for the site owner — walks the owner-gated steps in
# docs/site-owner-checklist.md §1 (register domain), §2 (arm the OIDC deploy identity),
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
  "if command -v whois >/dev/null 2>&1; then whois watduang.com 2>/dev/null | head -20; else echo 'whois not found on this machine -- check via the web instead, e.g. https://www.whois.com/whois/watduang.com'; fi"

# ── §2: Azure SWA phase 2 — arm the OIDC deploy identity ───────────────────
echo
echo "=== §2. Azure Static Web Apps — add the three deploy identity secrets ==="
echo "Why this needs you: only a repo admin can add GitHub secrets. The Azure side is already built."
echo
echo "Already done for you on 2026-08-19, nothing to click in Azure:"
echo "  - Static Web App 'watduang' (resource group rg-watduang, Standard, East Asia)"
echo "    created with Deployment source OTHER, so Azure did not attach its own workflow."
echo "  - App registration + federated credential, so deploys authenticate by OIDC."
echo "    There is no deployment token to copy any more, and no password anywhere."

step "Add the three repository secrets" \
"This repo on github.com -> Settings -> Secrets and variables -> Actions ->
New repository secret. Add all three, names exactly as written:

  AZURE_CLIENT_ID        5ba15c58-2635-40b9-9b50-e69594d69430
  AZURE_TENANT_ID        bbf3b249-d680-458b-9ec7-52dba8859dca
  AZURE_SUBSCRIPTION_ID  b337bf17-02fa-4dd0-8526-e71fee2b6f61

These are identifiers, not passwords. They go in secrets rather than variables
so the armed state lives in ONE place -- but note 'this repo has secrets' is
now only a conservative hint, not the answer: one of three, or any unrelated
secret, makes the count non-zero while CI is still NOT armed. The real test is
all three of these names being present. It errs toward 'treat a push as a
deploy', which is the safe direction to be wrong in.

WARNING: the moment all three exist, every push to main by anyone is a real
production deploy. Two of three is NOT armed, and CI treats it that way.
To disarm later: delete any one secret here, or delete the federated
credential on the app registration in Entra ID.

Also: once armed, hitting 'Re-run all jobs' on an OLD green main-push run is
a real deploy too. The gate is re-evaluated against today's secrets, so an
old run is not a free test."

maybe_verify "all three secrets present (values are never shown)" \
  "if ! command -v gh >/dev/null 2>&1; then echo 'gh (GitHub CLI) not found -- check on the web instead: this repo on github.com -> Settings -> Secrets and variables -> Actions, and confirm ALL THREE AZURE_* names are listed. Any fewer and CI stays unarmed.'; elif ! listing=\$(gh secret list --repo warischa/watduang 2>&1); then echo 'CANNOT TELL -- gh could not read the secret list. This is NOT the same as \"not armed\":'; printf '%s\\n' \"\$listing\" | sed 's/^/    /'; echo 'Until this prints ARMED or NOT ARMED, treat main as ARMED: assume any push you make is a real production deploy. Re-auth with \"gh auth status\" and run this again.'; else found=0; for n in AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID; do if printf '%s\\n' \"\$listing\" | awk '{print \$1}' | grep -qx \"\$n\"; then echo \"  present: \$n\"; found=\$((found+1)); else echo \"  MISSING: \$n\"; fi; done; echo \"\$found of 3 present\"; if [ \"\$found\" -eq 3 ]; then echo 'ARMED -- every push to main is now a production deploy, and so is Re-run all jobs on an OLDER main run'; else echo 'NOT ARMED -- CI will skip the deploy steps'; fi; fi"

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
