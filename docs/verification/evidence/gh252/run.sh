#!/usr/bin/env bash
# gh#252 runner. Serves one dist directory on :4351 and drives it with headless Chrome on :9351, one
# FRESH Chrome profile per (probe, width[, page, repeat]) so nothing comes from a warm font or HTTP cache.
# Tears down only the pids it started. Usage (from the worktree root):
#   bash docs/verification/evidence/gh252/run.sh <dist-dir> <label> <what>
#   what = fonts | weights | cls | home-weight | font-requests | all   (font-requests is not part of all)
# Writes docs/verification/evidence/gh252/<what>-<label>-<width>.json
set -u
DIST="${1:?dist dir}"; LABEL="${2:?label}"; WHAT="${3:?what}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
cd "$ROOT" || exit 2
export CDP_PORT=9351 BASE=http://localhost:4351 DIST
REPEATS="${REPEATS:-3}"
CLS_PAGES="/ /c/party/ /c/fortune/ /game/siamsi/ /tool/wheel/"

npx serve "$DIST" -l 4351 > "$TMP/serve.log" 2>&1 &
SERVE_PID=$!
for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:4351/ && break; sleep 0.5; done

start_chrome() {  # fresh profile named $1
  "$CHROME" --headless --disable-gpu --no-sandbox --remote-debugging-port=9351 \
    --user-data-dir="$TMP/prof-$1" > "$TMP/chrome-$1.log" 2>&1 &
  CHROME_PID=$!
  for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:9351/json/version && return 0; sleep 0.25; done
  return 1
}
stop_chrome() { kill "$CHROME_PID" 2>/dev/null; wait "$CHROME_PID" 2>/dev/null; }

rc=0
for W in 1440 320; do
  export W
  if [ "$WHAT" = fonts ] || [ "$WHAT" = all ]; then
    start_chrome "f$W" || rc=1
    PAGES="/,/c/party/,/c/fortune/" node "$HERE/platform-fonts-probe.mjs" > "$HERE/fonts-$LABEL-$W.json" || rc=1
    stop_chrome; echo "fonts W=$W done"
  fi
  if [ "$WHAT" = weights ] || [ "$WHAT" = all ]; then
    start_chrome "w$W" || rc=1
    node scripts/driver.mjs "$HERE/mitr-weight-probe.mjs" > "$HERE/weights-$LABEL-$W.json" || rc=1
    stop_chrome; echo "weights W=$W done"
  fi
  if [ "$WHAT" = font-requests ]; then
    start_chrome "r$W" || rc=1
    node "$HERE/font-requests-probe.mjs" > "$HERE/font-requests-$LABEL-$W.json" || rc=1
    stop_chrome; echo "font-requests W=$W done"
  fi
  if [ "$WHAT" = home-weight ] || [ "$WHAT" = all ]; then
    start_chrome "h$W" || rc=1
    node scripts/driver.mjs docs/verification/evidence/gh244/home-weight-probe.mjs > "$HERE/home-weight-$LABEL-$W.json" || rc=1
    stop_chrome; echo "home-weight W=$W done"
  fi
  if [ "$WHAT" = cls ] || [ "$WHAT" = all ]; then
    for P in $CLS_PAGES; do
      for N in $(seq 1 "$REPEATS"); do
        start_chrome "c$W-$N" || rc=1
        PAGES="$P" node scripts/driver.mjs docs/verification/evidence/ui-audit-2026-10-04/ui-audit-probe.mjs \
          > "$TMP/cls-$W-$(echo "$P" | tr '/' '_')-$N.json" || rc=1
        stop_chrome
      done
    done
    node -e '
      const fs=require("fs"),[tmp,here,label,w]=process.argv.slice(1);
      const rows={};
      for (const f of fs.readdirSync(tmp).filter(f=>f.startsWith("cls-"+w+"-"))) {
        const j=JSON.parse(fs.readFileSync(tmp+"/"+f)); const p=j.pages[0];
        (rows[p.path] ||= []).push({cls:p.cls, lcp:p.lcp, innerWidth:p.innerWidth});
      }
      fs.writeFileSync(here+"/cls-"+label+"-"+w+".json", JSON.stringify({width:+w,note:"ui-audit-probe CLS, one fresh Chrome per run",runs:rows},null,2));
    ' "$TMP" "$HERE" "$LABEL" "$W"
    echo "cls W=$W done"
  fi
done

kill "$SERVE_PID" 2>/dev/null; wait "$SERVE_PID" 2>/dev/null
rm -rf "$TMP"
exit $rc
