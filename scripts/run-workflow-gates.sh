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

# ---------------------------------------------------------------------------
# RECONCILIATION (gh#171). `n` is the count of commands this extractor could PARSE, not the count
# the workflow RUNS, and a reader takes those for the same number. On 2026-08-31 this script printed
# TOTAL=30 FAILS=0 on a tree whose `npm test` was red, that push went to main, and CI failed on the
# Unit tests step -- which is a multi-line `run: |` block the extractor cannot read. The pass was
# honest about its 30 and silent about the rest, which is the ADR-0019 failure: a green implying
# coverage it has not earned.
#
# So the skipped set is named on every run. Derived from the workflow each time, never a pinned list,
# so it cannot rot when a step is added, removed, or converted between the two forms.
declared=$(grep -c '^[[:space:]]*run:' "$WORKFLOW")
SKIPFILE="$OUT_DIR/skipped-steps"
awk '
  /^[[:space:]]*-[[:space:]]+name:[[:space:]]/ {
    name = $0
    sub(/^[[:space:]]*-[[:space:]]+name:[[:space:]]*/, "", name)
  }
  /^[[:space:]]*run:[[:space:]]*\|[[:space:]]*$/ { print (name == "" ? "(unnamed step)" : name) }
' "$WORKFLOW" > "$SKIPFILE"
multiline=$(grep -c . "$SKIPFILE" 2>/dev/null || echo 0)
other=$((declared - n - multiline))

echo "" | tee -a "$LOG"
echo "NOT EXECUTED HERE -- $WORKFLOW declares $declared run: step(s); this run executed $n." | tee -a "$LOG"
while IFS= read -r s; do
  [ -z "$s" ] && continue
  echo "  multi-line 'run: |' block, not extractable  ->  $s" | tee -a "$LOG"
done < "$SKIPFILE"
if [ "$other" -gt 0 ]; then
  echo "  $other further single-line step(s) filtered by the extractor (the npm ci install)" | tee -a "$LOG"
fi
echo "  A green below does NOT cover the steps above. Run them yourself -- 'npm test' above all." | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "TOTAL=$n FAILS=$fails" | tee -a "$LOG"
echo "log: $LOG"
exit "$fails"
