#!/usr/bin/env bash
# Run the gates the WORKFLOW runs, in the workflow's own order — locally, before a push.
#
# WHY THIS EXISTS. This repo carries TWO gate lists and they have drifted:
# package.json's `ci` aggregate is what a developer runs locally, and .github/workflows/ci.yml is
# what actually gates the deploy. The workflow never invokes `npm run ci` — it spells every gate out
# as its own step (scripts/gate-selftest-coverage-check.mjs's header documents this, and the
# divergence is real: ci-probes is a workflow step and is absent from the npm chain). So a green
# `npm run ci` is NOT evidence that the push will pass. This script reads ci.yml itself, so it
# cannot drift from the list that gates deploy — the list is derived, never copied.
#
# THE TRAP THIS SCRIPT IS WRITTEN AROUND. The first version used `mapfile -t CMDS < <(awk ...)`.
# macOS ships bash 3.2; `mapfile` arrived in bash 4. The array came back empty, the loop body never
# ran, the failure counter stayed 0, and the script exited 0 — indistinguishable from every gate
# passing. Hence two deliberate choices below: a `while IFS= read -r` loop, which works on 3.2, and
# a hard assertion on the extracted count, so an empty work-set can never read as a pass.
#
#   bash scripts/run-workflow-gates.sh          # run them all, exit = number of failures
#   MIN_STEPS=25 bash scripts/run-workflow-gates.sh
#
# Exit: 0 all passed · N = N gates failed · 98 = extractor is broken (not the tree) · 99 = not a repo
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 99
cd "$ROOT" || exit 99

WORKFLOW=.github/workflows/ci.yml
[ -f "$WORKFLOW" ] || { echo "no $WORKFLOW"; exit 99; }

# Floor, not a pinned count: the workflow gains steps over time and a pin would rot into a chore.
# Its only job is to make "extracted nothing" impossible to mistake for "everything passed".
MIN_STEPS=${MIN_STEPS:-20}

OUT_DIR=${OUT_DIR:-$(mktemp -d)}
LOG="$OUT_DIR/workflow-gates.log"
: > "$LOG"

CMDFILE="$OUT_DIR/cmds"
awk '
  /^[[:space:]]*run:[[:space:]]*/ {
    line = $0
    sub(/^[[:space:]]*run:[[:space:]]*/, "", line)
    if (line ~ /^npm ci$/) next          # deps are already installed locally
    if (line ~ /^(node|npm|npx|bash) /) print line
  }
' "$WORKFLOW" > "$CMDFILE"

n=$(wc -l < "$CMDFILE" | tr -d ' ')
if [ "$n" -lt "$MIN_STEPS" ]; then
  echo "ABORT: extracted $n commands from $WORKFLOW, expected at least $MIN_STEPS."
  echo "The extractor is broken, not the tree. Do NOT read this as a pass."
  exit 98
fi
echo "extracted $n workflow command(s)" | tee -a "$LOG"

fails=0
while IFS= read -r cmd; do
  [ -z "$cmd" ] && continue
  step_log="$OUT_DIR/step.$$"
  # Exit code read directly from the command, never through a pipe — a pipe reports the LAST
  # stage's status and this repo has been burned by that before.
  if bash -c "$cmd" > "$step_log" 2>&1; then
    echo "PASS  $cmd" | tee -a "$LOG"
  else
    rc=$?
    fails=$((fails + 1))
    echo "FAIL($rc)  $cmd" | tee -a "$LOG"
    { echo "----- last 25 lines -----"; tail -25 "$step_log"; echo "----- end -----"; } >> "$LOG"
    tail -25 "$step_log"
  fi
  rm -f "$step_log"
done < "$CMDFILE"

echo "" | tee -a "$LOG"
echo "TOTAL=$n FAILS=$fails" | tee -a "$LOG"
echo "log: $LOG"
exit "$fails"
