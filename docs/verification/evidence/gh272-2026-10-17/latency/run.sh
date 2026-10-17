#!/bin/bash
# gh#272 latency run. Re-run against another build/port with ONLY these env vars changed:
#   DIST=<worktree>/dist PORT=4411 CDP=9411 TAG=base ./run.sh [standin|reference|both]
# Optional: N=3 (runs per path), BURN=8 (burner count), W=1440 H=900, ROUTE=croc-bite, SCEN=P1,P2,C
# Every pid started here is recorded and killed by pid on exit (never by name); leftovers are reported.
DIST=${DIST:?set DIST=<build dist dir>}
PORT=${PORT:-4411}; CDP=${CDP:-9411}; TAG=${TAG:-base}; N=${N:-5}; BURN=${BURN:-2}
WHICH=${1:-both}
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FLAGS=(--headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox --no-first-run --no-default-browser-check --remote-debugging-port=$CDP)
PIDS=()   # every pid started by this script (roots)
kids() { local p; for p in $(pgrep -P "$1" 2>/dev/null); do echo "$p"; kids "$p"; done; }
killtree() { local all; all="$(echo "$1"; kids "$1")"; kill $all 2>/dev/null; sleep 1; kill -9 $all 2>/dev/null; echo "$all" >> "$HERE/.killed.$$"; }
cleanup() {
  for p in "${PIDS[@]}"; do killtree "$p"; done
  sleep 1; left=0
  for p in $(cat "$HERE/.killed.$$" 2>/dev/null); do if ps -p "$p" >/dev/null 2>&1; then echo "LEFTOVER pid $p"; left=1; fi; done
  echo "teardown: $(sort -u "$HERE/.killed.$$" 2>/dev/null | wc -l | tr -d ' ') pids killed, leftovers=$left; ports: $(lsof -ti tcp:$PORT,tcp:$CDP 2>/dev/null | wc -l | tr -d ' ') listening"
  rm -f "$HERE/.killed.$$"
}
trap cleanup EXIT
lsof -ti tcp:$PORT,tcp:$CDP >/dev/null 2>&1 && { echo "port $PORT or $CDP already in use: refusing"; exit 2; }
if ps -eo command | grep -E "remote-debugging-port|run-workflow-gates" | grep -v grep | grep -q .; then echo "another headless Chrome / gate lane is running: wait"; exit 2; fi

( cd "$DIST/.." && npx serve dist -l $PORT >"$HERE/serve-$TAG.log" 2>&1 ) & PIDS+=($!)
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/ | grep -q 200 && break; sleep 0.5; done
curl -s -o /dev/null -w "serve http=%{http_code}\n" http://localhost:$PORT/

run_cond() { # $1 = standin|reference
  local cond=$1 prof; prof=$(mktemp -d /private/tmp/claude-501/lat-prof-XXXXXX)
  local bpids=()
  if [ "$cond" = standin ]; then
    # slow cores: background QoS (E-cores) for Chrome and every burner; burners saturate that cluster
    taskpolicy -b "$CHROME" "${FLAGS[@]}" --user-data-dir="$prof" >"$HERE/chrome-$TAG-$cond.log" 2>&1 & local cp=$!
    for i in $(seq 1 $BURN); do taskpolicy -b bash -c 'while :; do :; done' & bpids+=($!); done
  else
    "$CHROME" "${FLAGS[@]}" --user-data-dir="$prof" >"$HERE/chrome-$TAG-$cond.log" 2>&1 & local cp=$!
  fi
  PIDS+=($cp "${bpids[@]}")
  for i in $(seq 1 40); do curl -s http://127.0.0.1:$CDP/json/version >/dev/null && break; sleep 0.5; done
  curl -s http://127.0.0.1:$CDP/json/version | grep -o '"Browser": "[^"]*"'
  echo "chrome pid=$cp burners=${bpids[*]:-none}" | tee "$HERE/pids-$TAG-$cond.txt"
  BASE=http://localhost:$PORT CDP_PORT=$CDP COND=$cond N=$N OUT="$HERE/latency-$TAG-$cond.json" node "$HERE/latency.mjs"
  for p in "${bpids[@]}" $cp; do killtree "$p"; done
  sleep 2; rm -rf "$prof"
}
case $WHICH in standin|reference) run_cond $WHICH;; both) run_cond reference; run_cond standin;; esac
