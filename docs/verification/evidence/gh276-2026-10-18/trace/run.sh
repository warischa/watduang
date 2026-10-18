#!/bin/bash
# gh#276 phase 1: one stand-in P1 run on croc-bite, plain or traced. One fresh Chrome per call.
#   DIST=<worktree>/dist TAG=<name> MODE=plain|trace|harness RAWDIR=<dir outside the repo> ./run.sh
#   harness = the gh#272 latency.mjs P1, N=1, unmodified (its stderr line carries the lock wait)
#   optional: HTTP=4421 CDP=9421 BURN=2 QUERY=1
#   WARM=1: one warm-up P1 in the same Chrome + profile first, the measured P1 in a new tab (reused profile)
#   THROTTLE=0: no taskpolicy and no burners (positive control)
# Stand-in = the gh#272 latency harness's (interleave.sh): `taskpolicy -b` swiftshader Chrome + BURN `taskpolicy -b`
# busy loops. Every pid started here is recorded and killed by pid on exit (never by name).
DIST=${DIST:?}; TAG=${TAG:?}; MODE=${MODE:-plain}; RAWDIR=${RAWDIR:?}; HTTP=${HTTP:-4421}; CDP=${CDP:-9421}; BURN=${BURN:-2}; QUERY=${QUERY:-0}
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PIDS=(); ALL="$RAWDIR/.killed.$$"
kids() { local p; for p in $(pgrep -P "$1" 2>/dev/null); do echo "$p"; kids "$p"; done; }
killtree() { local a; a="$(echo "$1"; kids "$1")"; kill $a 2>/dev/null; sleep 1; kill -9 $a 2>/dev/null; echo "$a" >> "$ALL"; }
# lsof takes ONE protocol prefix and a comma list of ports; `tcp:A,tcp:B` errors ("unknown service") and a
# `2>/dev/null | wc -l` then reads 0 whatever is listening.
ports() { lsof -nP -ti "tcp:$HTTP,$CDP"; }
prof=""
cleanup() { for p in "${PIDS[@]}"; do killtree "$p"; done; sleep 1; [ -n "$prof" ] && rm -rf "$prof"; left=0
  for p in $(cat "$ALL" 2>/dev/null); do ps -p "$p" >/dev/null 2>&1 && { echo "LEFTOVER $p"; left=1; }; done
  echo "teardown: $(sort -u "$ALL" 2>/dev/null | wc -l | tr -d ' ') pids killed, leftovers=$left; listening on $HTTP/$CDP: [$(ports | tr '\n' ' ')]"; rm -f "$ALL"; }
ports >/dev/null && { echo "ports $HTTP/$CDP in use: refusing"; exit 2; }
# a headless Chrome, anything on our CDP port, or a gate lane. NOT bare `remote-debugging-port`: an Electron desktop app's
# helpers carry `remote-debugging-port=0` permanently and would block every run (seen 2026-10-18).
ps -eo command | grep -E -- "--headless|remote-debugging-port=$CDP( |$)|run-workflow-gates" | grep -v grep | grep -q . && { echo "another headless Chrome / gate lane running: wait"; exit 2; }
trap cleanup EXIT
load() { { echo "== $1 $(date +%T)"; uptime; ps -eo pcpu,pid,command | sort -rn | head -5 | cut -c1-100; } >> "$HERE/load-$TAG.txt"; }
: > "$HERE/load-$TAG.txt"
( cd "$DIST/.." && exec npx serve dist -l "$HTTP" >"$RAWDIR/serve-$TAG.log" 2>&1 ) & PIDS+=($!)
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}" "http://localhost:$HTTP/" | grep -q 200 && break; sleep 0.5; done
prof=$(mktemp -d "$RAWDIR/prof-XXXXXX")
CFLAGS=(--headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox --no-first-run --no-default-browser-check --remote-debugging-port=$CDP --user-data-dir="$prof")
if [ "${THROTTLE:-1}" = 1 ]; then
  taskpolicy -b "$CHROME" "${CFLAGS[@]}" >"$RAWDIR/chrome-$TAG.log" 2>&1 & PIDS+=($!)
  for i in $(seq 1 $BURN); do taskpolicy -b bash -c 'while :; do :; done' & PIDS+=($!); done
else # THROTTLE=0: positive control -- same flags, no taskpolicy, no burners
  "$CHROME" "${CFLAGS[@]}" >"$RAWDIR/chrome-$TAG.log" 2>&1 & PIDS+=($!)
fi
for i in $(seq 1 40); do curl -s "http://127.0.0.1:$CDP/json/version" >/dev/null && break; sleep 0.5; done
if [ "${WARM:-0}" = 1 ]; then
  # reused profile: one full warm-up P1 (its own tab: seed on home, open the route, close the tab) in this same
  # Chrome + profile, then the measured P1 below repeats that exact flow in a NEW tab.
  BASE="http://localhost:$HTTP" CDP_PORT=$CDP MODE=plain OUT="$HERE/warm-$TAG.json" node "$HERE/trace.mjs"
  echo "WARMUP_RC=$?"; sleep 2
fi
load before
if [ "$MODE" = harness ]; then
  # the gh#272 latency harness itself, P1 once, unmodified: the exact artifact behind the gh#276 numbers
  BASE="http://localhost:$HTTP" CDP_PORT=$CDP COND=standin-$TAG N=1 SCEN=P1 OUT="$HERE/harness-$TAG.json" node "$HERE/../../gh272-2026-10-17/latency/latency.mjs" >/dev/null
else
  BASE="http://localhost:$HTTP" CDP_PORT=$CDP MODE=$MODE QUERY=$QUERY HEAVY=${HEAVY:-0} RAW="$RAWDIR/trace-$TAG.json" OUT="$HERE/diag-$TAG.json" node "$HERE/trace.mjs"
fi
echo "DRIVER_RC=$?"
load after
