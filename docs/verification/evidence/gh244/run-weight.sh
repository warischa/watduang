#!/usr/bin/env bash
# gh#244 box 5 runner: serve the CURRENT dist/ and measure / at 1440 and 320, one fresh Chrome per
# width, so no response is served from cache. Build first with `npm run build`. Usage:
#   bash docs/verification/evidence/gh244/run-weight.sh <label>   -> writes weight-<label>-<width>.json
# Tears down only the pids it started (runbook: never by process name).
set -u
LABEL="${1:?label required: before|after}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
cd "$ROOT" || exit 2

npx serve dist/ -l 4321 > "$TMP/serve.log" 2>&1 &
SERVE_PID=$!
sleep 3

rc=0
for W in 1440 320; do
  "$CHROME" --headless --disable-gpu --no-sandbox --remote-debugging-port=9222 \
    --user-data-dir="$TMP/prof-$W" > "$TMP/chrome-$W.log" 2>&1 &
  CHROME_PID=$!
  sleep 3
  if W="$W" node scripts/driver.mjs "$HERE/home-weight-probe.mjs" > "$HERE/weight-$LABEL-$W.json"; then
    echo "W=$W ok"
  else
    echo "W=$W FAILED"; rc=1
  fi
  kill "$CHROME_PID" 2>/dev/null; wait "$CHROME_PID" 2>/dev/null
done

kill "$SERVE_PID" 2>/dev/null; wait "$SERVE_PID" 2>/dev/null
rm -rf "$TMP"
exit $rc
