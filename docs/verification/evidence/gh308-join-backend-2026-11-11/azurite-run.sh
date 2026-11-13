#!/usr/bin/env bash
# gh#308: run the join suite against Azurite with the real storage SDK, plus the calibration probe whose
# answers the in-memory container copies. The SDK and Azurite install into temp directories, never into
# the repo (gates walk the tree, ADR-0074). Port 10000 must be free.
# Run from the repo root: bash docs/verification/evidence/gh308-join-backend-2026-11-11/azurite-run.sh
set -euo pipefail
E=docs/verification/evidence/gh308-join-backend-2026-11-11
B=$(mktemp -d)
Z=$(mktemp -d)
cp -R services/feedback/. "$B/"
cp "$E/azurite-calibration.mjs" "$B/"
(cd "$B" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1)
(cd "$Z" && npm init -y >/dev/null && npm install azurite@3 --no-audit --no-fund >/dev/null 2>&1)
echo "azurite $(cd "$Z" && node -p 'require("azurite/package.json").version'), storage-blob $(cd "$B" && node -p 'require("@azure/storage-blob/package.json").version'), node $(node --version)"
"$Z/node_modules/.bin/azurite-blob" --silent --location "$Z/data" --blobPort 10000 --skipApiVersionCheck &
AZ=$!
trap 'kill $AZ' EXIT
for _ in $(seq 1 30); do nc -z 127.0.0.1 10000 2>/dev/null && break; sleep 1; done
echo "--- calibration"
(cd "$B" && node azurite-calibration.mjs 2>&1 | grep -v Warning)
echo "--- join-service.test.mjs against Azurite"
(cd "$B" && DRAW_TEST_AZURITE='UseDevelopmentStorage=true' node --test src/join-service.test.mjs 2>&1 | grep -E '^not ok|^# (tests|pass|fail|cancelled)')
