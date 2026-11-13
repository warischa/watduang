#!/usr/bin/env bash
# gh#308: import the join and feedback function modules with the REAL Azure packages, installed from
# the committed lock in a scratch copy (never inside the repo: gates walk the tree, ADR-0074).
# Run from the repo root: bash docs/verification/evidence/gh308-join-backend-2026-11-11/real-sdk-probe.sh
set -euo pipefail
B=$(mktemp -d)
cp -R services/feedback/. "$B/"
(cd "$B" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1)
cat > "$B/probe.mjs" <<'JS'
for (const rel of process.argv.slice(2)) {
  try { await import(new URL(rel, import.meta.url)); console.log(`${rel}: loaded`); }
  catch (e) { console.log(`${rel}: THREW ${e?.name}: ${String(e?.message).slice(0, 80)}`); }
}
JS
cd "$B"
echo "packages: $(ls node_modules | wc -l | tr -d ' ') top-level entries in node_modules"
echo "--- join, no app settings";               env -i PATH="$PATH" node probe.mjs ./src/functions/join.mjs 2>&1 | grep -E 'loaded|THREW'
echo "--- feedback, no app settings (control)";  env -i PATH="$PATH" node probe.mjs ./src/functions/feedback.mjs 2>&1 | grep -E 'loaded|THREW'
echo "--- join then feedback, settings present"; env -i PATH="$PATH" FEEDBACK_ACCOUNT_URL=https://account.blob.core.windows.net node probe.mjs ./src/functions/join.mjs ./src/functions/feedback.mjs 2>&1 | grep -E 'loaded|THREW'
node -e 'const fs=require("fs");const f="src/functions/join.mjs";const s=fs.readFileSync(f,"utf8");if(!s.includes("const conditions = (ifMatch)"))process.exit(2);fs.writeFileSync(f,s.replace("const conditions = (ifMatch)","draws();\nconst conditions = (ifMatch)"))'
echo "--- eager mutant of join (scratch copy only), no app settings"; env -i PATH="$PATH" node probe.mjs ./src/functions/join.mjs 2>&1 | grep -E 'loaded|THREW'
