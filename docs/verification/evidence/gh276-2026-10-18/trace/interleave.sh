#!/bin/bash
# gh#276 phase 1b: matched-load interleave of the two P1 drivers on ONE build, H,L,H,L,... one fresh stand-in
# Chrome per sample. Adapted from the gh#272 interleave.sh (same launch recipe), with its teardown and refusal
# lsof checks fixed: lsof takes ONE protocol prefix and a comma list of ports; `tcp:A,tcp:B` errors
# ("unknown service") and a `2>/dev/null | wc -l` then reads 0 whatever is listening.
#   DIST=<dist> RAWDIR=<dir outside the repo> TAG=hl K=7 ./interleave.sh     (ports: HTTP=4421, CDP=9421)
#   H = latency-lt.mjs P1 N=1 (the gh#272 harness; rAF loop + heartbeat in page) -> il-<TAG>-H-<k>.json
#   L = trace.mjs MODE=plain (lean in-page instruments)                         -> il-<TAG>-L-<k>.json
DIST=${DIST:?}; RAWDIR=${RAWDIR:?}; TAG=${TAG:-hl}; K=${K:-7}; BURN=${BURN:-2}; HTTP=${HTTP:-4421}; CDP=${CDP:-9421}
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PIDS=(); ALL="$RAWDIR/.killed.il.$$"
kids() { local p; for p in $(pgrep -P "$1" 2>/dev/null); do echo "$p"; kids "$p"; done; }
killtree() { local a; a="$(echo "$1"; kids "$1")"; kill $a 2>/dev/null; sleep 1; kill -9 $a 2>/dev/null; echo "$a" >> "$ALL"; }
ports() { lsof -nP -ti "tcp:$HTTP,$CDP"; }
cleanup() { for p in "${PIDS[@]}"; do killtree "$p"; done; sleep 1; left=0
  for p in $(cat "$ALL" 2>/dev/null); do ps -p "$p" >/dev/null 2>&1 && { echo "LEFTOVER $p"; left=1; }; done
  echo "teardown: $(sort -u "$ALL" 2>/dev/null | wc -l | tr -d ' ') pids killed, leftovers=$left; listening on $HTTP/$CDP: [$(ports | tr '\n' ' ')]"; rm -f "$ALL"; }
ports >/dev/null && { echo "ports $HTTP/$CDP in use: refusing"; exit 2; }
ps -eo command | grep -E "remote-debugging-port|run-workflow-gates" | grep -v grep | grep -q . && { echo "another headless Chrome / gate lane running: wait"; exit 2; }
trap cleanup EXIT
l1() { uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/'; }
: > "$HERE/load-$TAG.tsv"; echo -e "sample\tstart\tload1_before\tload1_after\tend" >> "$HERE/load-$TAG.tsv"
( cd "$DIST/.." && exec npx serve dist -l "$HTTP" >"$RAWDIR/serve-$TAG.log" 2>&1 ) & PIDS+=($!)
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}" "http://localhost:$HTTP/" | grep -q 200 && break; sleep 0.5; done
one() { # $1=H|L $2=k
  local who=$1 prof b0 t0; prof=$(mktemp -d "$RAWDIR/prof-XXXXXX")
  taskpolicy -b "$CHROME" --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --no-sandbox --no-first-run --no-default-browser-check --remote-debugging-port=$CDP --user-data-dir="$prof" >/dev/null 2>&1 & local cp=$!
  local bp=(); for i in $(seq 1 $BURN); do taskpolicy -b bash -c 'while :; do :; done' & bp+=($!); done
  PIDS+=($cp "${bp[@]}")
  for i in $(seq 1 40); do curl -s "http://127.0.0.1:$CDP/json/version" >/dev/null && break; sleep 0.5; done
  b0=$(l1); t0=$(date +%T)
  if [ $who = H ]; then
    BASE="http://localhost:$HTTP" CDP_PORT=$CDP COND=standin-H N=1 SCEN=P1 OUT="$HERE/il-$TAG-H-$2.json" node "$HERE/latency-lt.mjs" >/dev/null 2>"$RAWDIR/il-$TAG-H-$2.err"
  else
    BASE="http://localhost:$HTTP" CDP_PORT=$CDP MODE=plain OUT="$HERE/il-$TAG-L-$2.json" node "$HERE/trace.mjs" >"$RAWDIR/il-$TAG-L-$2.err" 2>&1
  fi
  echo "DRIVER_RC=$?" >> "$RAWDIR/il-$TAG-$who-$2.err"
  echo -e "$who-$2\t$t0\t$b0\t$(l1)\t$(date +%T)" >> "$HERE/load-$TAG.tsv"
  echo "$who#$2: $(tr '\n' ' ' < "$RAWDIR/il-$TAG-$who-$2.err" | cut -c1-220)"
  for p in "${bp[@]}" $cp; do killtree "$p"; done; sleep 2; rm -rf "$prof"
}
for k in $(seq 1 $K); do one H $k; one L $k; done
