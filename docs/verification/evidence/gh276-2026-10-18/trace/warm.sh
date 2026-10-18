#!/bin/bash
# gh#276: fresh vs reused profile on the stand-in, F,R,F,R,... K pairs, then the unthrottled control U x N.
# One fresh Chrome per sample (run.sh). F = fresh profile (as before). R = WARM=1: one warm-up P1 in the same
# Chrome + profile, then the measured P1 in a new tab. U = THROTTLE=0: no taskpolicy, no burners, fresh profile.
# MODE=trace (default) traces every measured run in both arms alike; MODE=plain runs the same rotation untraced.
#   DIST=<dist> RAWDIR=<dir outside the repo> K=7 N=3 [MODE=trace] [P=w] ./warm.sh
#   -> diag-<P>-<arm>-<k>.json, warm-<P>-R-<k>.json (the warm-up run), load-<P>-*.txt
DIST=${DIST:?}; RAWDIR=${RAWDIR:?}; K=${K:-7}; N=${N:-3}; MODE=${MODE:-trace}; P=${P:-w}
HERE="$(cd "$(dirname "$0")" && pwd)"
for k in $(seq 1 $K); do
  echo "== F-$k $(date +%T) $(uptime)"; DIST=$DIST TAG=$P-F-$k MODE=$MODE RAWDIR=$RAWDIR bash "$HERE/run.sh" 2>&1 | grep -v -E "Terminated|Killed"
  echo "== R-$k $(date +%T) $(uptime)"; DIST=$DIST TAG=$P-R-$k MODE=$MODE WARM=1 RAWDIR=$RAWDIR bash "$HERE/run.sh" 2>&1 | grep -v -E "Terminated|Killed"
done
for k in $(seq 1 $N); do
  echo "== U-$k $(date +%T) $(uptime)"; DIST=$DIST TAG=$P-U-$k MODE=$MODE THROTTLE=0 RAWDIR=$RAWDIR bash "$HERE/run.sh" 2>&1 | grep -v -E "Terminated|Killed"
done
