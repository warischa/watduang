#!/usr/bin/env bash
# gh#252: drive swap-probe.mjs over the audited pages, fresh Chrome per run, against one dist directory.
#   bash docs/verification/evidence/gh252/run-swap.sh <dist-dir> <label>
# FONTS modes run: block (control, the pre-Mitr page), delay (late swap, the real-network case).
# Writes swap-<label>.json (an array of every run). Tears down only the pids it started.
set -u
DIST="${1:?dist dir}"; LABEL="${2:?label}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
cd "$ROOT" || exit 2
export CDP_PORT=9351 BASE=http://localhost:4351
MODES="${MODES:-block delay}"
WIDTHS="${WIDTHS:-1440 320}"

npx serve "$DIST" -l 4351 > "$TMP/serve.log" 2>&1 &
SERVE_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:4351/ && break; sleep 0.5; done

rc=0; n=0
for W in $WIDTHS; do
  for ENTRY in "/|none" "/c/party/|none" "/c/fortune/|none" "/game/siamsi/|none" "/tool/wheel/|wheel" "/tool/number/|number"; do
    P="${ENTRY%%|*}"; I="${ENTRY##*|}"
    case "$P" in *"${ONLY:-}"*) ;; *) continue ;; esac
    for F in $MODES; do
      "$CHROME" --headless --disable-gpu --no-sandbox --remote-debugging-port=9351 \
        --user-data-dir="$TMP/prof-$n" > "$TMP/chrome-$n.log" 2>&1 &
      CHROME_PID=$!
      for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:9351/json/version && break; sleep 0.25; done
      W="$W" PAGE="$P" INTERACT="$I" FONTS="$F" node "$HERE/swap-probe.mjs" > "$TMP/run-$n.json" || rc=1
      kill "$CHROME_PID" 2>/dev/null; wait "$CHROME_PID" 2>/dev/null
      n=$((n + 1))
    done
  done
done
node -e '
  const fs = require("fs"); const [tmp, here, label] = process.argv.slice(1);
  const runs = fs.readdirSync(tmp).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)))
    .map((f) => JSON.parse(fs.readFileSync(tmp + "/" + f)));
  fs.writeFileSync(here + "/swap-" + label + ".json", JSON.stringify(runs, null, 2));
  console.log("runs", runs.length);
' "$TMP" "$HERE" "$LABEL"

kill "$SERVE_PID" 2>/dev/null; wait "$SERVE_PID" 2>/dev/null
rm -rf "$TMP"
exit $rc
