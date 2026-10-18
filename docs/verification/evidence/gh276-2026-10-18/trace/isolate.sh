#!/bin/bash
# gh#276 phase 1b: every traced run came back fast while the untraced lean arm was mostly slow. Two things differ
# between them: the CDP trace itself and the navigator.locks.query() snapshots (QUERY=1). This rotates three arms
# so load drifts across all of them alike, one fresh stand-in Chrome per sample (run.sh):
#   P = plain, QUERY=0 (the interleave's L arm)   Q = plain, QUERY=1   T = traced, QUERY=0
#   DIST=<dist> RAWDIR=<dir outside the repo> K=3 ./isolate.sh   -> diag-iso-<arm>-<k>.json, load-iso-<arm>-<k>.txt
DIST=${DIST:?}; RAWDIR=${RAWDIR:?}; K=${K:-3}
HERE="$(cd "$(dirname "$0")" && pwd)"
for k in $(seq 1 $K); do
  for arm in P Q T; do
    case $arm in P) m=plain; q=0;; Q) m=plain; q=1;; T) m=trace; q=0;; esac
    echo "== $arm-$k $(date +%T) $(uptime)"
    DIST=$DIST TAG=iso-$arm-$k MODE=$m QUERY=$q RAWDIR=$RAWDIR bash "$HERE/run.sh" 2>&1 | grep -v Terminated
  done
done
