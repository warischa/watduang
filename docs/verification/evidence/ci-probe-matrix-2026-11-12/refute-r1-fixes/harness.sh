#!/usr/bin/env bash
# Replay REFUTE r1 counter-examples against a candidate runner, in throwaway repos.
# usage: bash harness.sh <repo-root-holding-the-candidate>
# Prints one line per case: <case> rc=<n> expect=<n> <OK|MISMATCH>.
set -u
SRC=$1
H=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
mkrepo() { # $1 = dir, $2 = workflow file
  mkdir -p "$1/scripts" "$1/.github/workflows"
  cp "$SRC/scripts/run-workflow-gates.sh" "$SRC/scripts/probe-scope.mjs" "$1/scripts/"
  cp "$2" "$1/.github/workflows/ci.yml"
  git -C "$1" init -q && git -C "$1" add -A && git -C "$1" -c user.email=h@h -c user.name=h commit -qm x
}
run() { # $1 case, $2 expect, $3 workflow, rest = env assignments
  local c=$1 want=$2 wf=$3; shift 3
  local d="$WORK/$c"; mkrepo "$d" "$wf"
  ( cd "$d" && env "$@" OUT_DIR="$d.out" CLASSIFY_ONLY=1 bash scripts/run-workflow-gates.sh > "$d.log" 2>&1 ); local rc=$?
  local v=OK; [ "$rc" = "$want" ] || v=MISMATCH
  printf '%-34s rc=%-3s expect=%-3s %s\n' "$c" "$rc" "$want" "$v"
}
REAL="$SRC/.github/workflows/ci.yml"
for v in A B C D H1 H2 H3 H4 X W1 W2; do python3 "$H/doctor.py" "$REAL" "$WORK/ci-$v.yml" "$v"; done
run 0-real-positive-control         0  "$REAL"
run A-lane-body-matrix-expr         95 "$WORK/ci-A.yml"
run B-A+comment-mentions-lane       95 "$WORK/ci-B.yml"
run C-A+bash-n-on-lane-script       95 "$WORK/ci-C.yml"
run D-A+echo-of-lane-command        95 "$WORK/ci-D.yml"
run H1-A+lane-line-in-heredoc       95 "$WORK/ci-H1.yml"
run H2-A+lane-line-under-if-false   95 "$WORK/ci-H2.yml"
run H3-A+lane-as-echo-continuation  95 "$WORK/ci-H3.yml"
run H4-A+lane-or-true               95 "$WORK/ci-H4.yml"
run X-A+lane-name-prefix            95 "$WORK/ci-X.yml"
run W1-webgl-body-matrix-expr       95 "$WORK/ci-W1.yml"
run W2-W1+comment-mentions-webgl    95 "$WORK/ci-W2.yml"
run E1-inherited-PROBE_AGGREGATE    97 "$REAL" PROBE_AGGREGATE=/x
run E2-inherited-PROBE_LANES        97 "$REAL" PROBE_LANES=nav
run E3-inherited-PROBE_FIT_SHARDS   97 "$REAL" PROBE_FIT_SHARDS=5
run E4-inherited-MATRIX_KEEP        97 "$REAL" MATRIX_KEEP=play-exit
run E5-inherited-MATRIX_LANE        97 "$REAL" MATRIX_LANE=lane1
run E6-empty-PROBE_LANES-is-unset   0  "$REAL" PROBE_LANES=
# Install order: the first RUN install must come before the first RUN Build.
m="$WORK/0-real-positive-control.out/manifest"
first_install=$(awk -F'\t' '$2=="RUN" && $4=="npm ci" {print $1; exit}' "$m")
first_build=$(awk -F'\t' '$2=="RUN" && $4=="Build" {print $1; exit}' "$m")
ov=OK; [ -n "$first_install" ] && [ -n "$first_build" ] && [ "$first_install" -lt "$first_build" ] || ov=MISMATCH
printf '%-34s install=%s build=%s %s\n' "I-install-before-first-build" "${first_install:-none}" "${first_build:-none}" "$ov"
echo "work: $WORK"
