#!/usr/bin/env bash
# Build dist at the current tree, serve it, run the gh#263 under-44 probe at 320 and 1440, tear down by pid.
# usage: OUT_DIR=<dir outside the repo> run-under44.sh <label>   (from the repo root) -> $OUT_DIR/{320,1440}.json + meta.txt
set -u
L=${1:?label}
R=${OUT_DIR:?set OUT_DIR to a directory outside the repo}
mkdir -p "$R"
SPORT=4461; CPORT=9361
if lsof -ti:$SPORT,$CPORT >/dev/null 2>&1; then echo "PORT-BUSY $(lsof -ti:$SPORT,$CPORT | tr '\n' ' ')"; exit 3; fi
{ echo "head $(git rev-parse --short HEAD)"; echo "status:"; git status --porcelain; date '+start %F %T'; } > "$R/meta.txt"
npm run build > "$R/build.log" 2>&1; echo "build rc=$?" >> "$R/meta.txt"
npx serve dist/ -l $SPORT > "$R/serve.log" 2>&1 & SPID=$!
PROF=$(mktemp -d "$R/prof.XXXX")
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox \
  --remote-debugging-port=$CPORT --user-data-dir="$PROF" > "$R/chrome.log" 2>&1 & CPID=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:$SPORT/ && curl -s -o /dev/null http://localhost:$CPORT/json/version && break; sleep 1; done
for W in 320 1440; do
  BASE=http://localhost:$SPORT CDP_PORT=$CPORT W=$W node scripts/driver.mjs docs/verification/evidence/gh263-under44/ui-under44-probe.mjs > "$R/$W.json" 2> "$R/$W.err"
  echo "probe $W rc=$? bytes=$(wc -c < "$R/$W.json")" >> "$R/meta.txt"
done
kill $CPID $SPID 2>/dev/null; sleep 2
pkill -P $SPID 2>/dev/null
rm -rf "$PROF"
echo "ports-after: $(lsof -ti:$SPORT,$CPORT | tr '\n' ' ')" >> "$R/meta.txt"
date '+end %F %T' >> "$R/meta.txt"
cat "$R/meta.txt"
