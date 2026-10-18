#!/bin/bash
# Interleaved base/fix stand-in P1 (+H on fix): B,F,B,F,... one fresh Chrome at a time.
#   BASE_DIST=<dist> FIX_DIST=<dist> TAG=interleave K=7 ./interleave.sh   (ports: 4413/4414 http, 9413/9414 CDP)
BASE_DIST=${BASE_DIST:?}; FIX_DIST=${FIX_DIST:?}; TAG=${TAG:-interleave}; K=${K:-7}; BURN=${BURN:-2}
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PIDS=(); ALL="$HERE/.killed.il.$$"
kids() { local p; for p in $(pgrep -P "$1" 2>/dev/null); do echo "$p"; kids "$p"; done; }
killtree() { local a; a="$(echo "$1"; kids "$1")"; kill $a 2>/dev/null; sleep 1; kill -9 $a 2>/dev/null; echo "$a" >> "$ALL"; }
cleanup() { for p in "${PIDS[@]}"; do killtree "$p"; done; sleep 1; left=0
  for p in $(cat "$ALL" 2>/dev/null); do ps -p "$p" >/dev/null 2>&1 && { echo "LEFTOVER $p"; left=1; }; done
  echo "teardown: $(sort -u "$ALL" 2>/dev/null | wc -l | tr -d ' ') pids killed, leftovers=$left; ports listening: $(lsof -nP -ti tcp:4413,4414,9413,9414 2>/dev/null | wc -l | tr -d ' ')"; rm -f "$ALL"; }
trap cleanup EXIT
lsof -nP -ti tcp:4413,4414,9413,9414 >/dev/null 2>&1 && { echo "ports in use: refusing"; exit 2; }
ps -eo command | grep -E "remote-debugging-port|run-workflow-gates" | grep -v grep | grep -q . && { echo "another headless Chrome / gate lane running: wait"; exit 2; }
load() { { echo "== $1 $(date +%T)"; uptime; ps -eo pcpu,pid,command | sort -rn | head -5 | cut -c1-100; } >> "$HERE/load-$TAG.txt"; }
: > "$HERE/load-$TAG.txt"
( cd "$BASE_DIST/.." && npx serve dist -l 4413 >"$HERE/serve-$TAG-base.log" 2>&1 ) & PIDS+=($!)
( cd "$FIX_DIST/.." && npx serve dist -l 4414 >"$HERE/serve-$TAG-fix.log" 2>&1 ) & PIDS+=($!)
for pt in 4413 4414; do for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}" http://localhost:$pt/ | grep -q 200 && break; sleep 0.5; done; done
one() { # $1=B|F
  local who=$1 hp cdp scen; if [ $who = B ]; then hp=4413; cdp=9413; scen=P1; else hp=4414; cdp=9414; scen=P1,H; fi
  local prof; prof=$(mktemp -d /private/tmp/claude-501/lat-prof-XXXXXX)
  taskpolicy -b "$CHROME" --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox --no-first-run --no-default-browser-check --remote-debugging-port=$cdp --user-data-dir="$prof" >/dev/null 2>&1 & local cp=$!
  local bp=(); for i in $(seq 1 $BURN); do taskpolicy -b bash -c 'while :; do :; done' & bp+=($!); done
  PIDS+=($cp "${bp[@]}")
  for i in $(seq 1 40); do curl -s http://127.0.0.1:$cdp/json/version >/dev/null && break; sleep 0.5; done
  BASE=http://localhost:$hp CDP_PORT=$cdp COND=standin-$who N=1 SCEN=$scen OUT="$HERE/il-$TAG-$who-$2.json" node "$HERE/latency.mjs" >/dev/null 2>"$HERE/il-$TAG-$who-$2.err"
  echo "$who#$2: $(tail -2 "$HERE/il-$TAG-$who-$2.err" | tr '\n' ' ' | cut -c1-200)"
  for p in "${bp[@]}" $cp; do killtree "$p"; done; sleep 2; rm -rf "$prof"
}
load before
for k in $(seq 1 $K); do one B $k; one F $k; [ $k = $(( (K+1)/2 )) ] && load midway; done
load after
