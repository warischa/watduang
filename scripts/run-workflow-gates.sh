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
# THE SECOND TRAP (gh#171). The extractor used to read single-line `run:` commands ONLY, so the five
# multi-line `run: |` blocks — `Unit tests` among them — were never executed, and the run still
# exited 0. On 2026-08-31 it printed TOTAL=30 FAILS=0 on a tree whose `npm test` was red, that push
# went to main, and CI failed on Unit tests. So this script now executes multi-line bodies too, and
# a step that is runnable but was NOT executed counts as a failure, not as a footnote.
#
# THE PARTITION. A declared `run:` step is STRUCTURALLY-NOT-RUNNABLE here when its run BODY contains
# `${{` (a GitHub expression, meaningless outside Actions) or writes `$GITHUB_OUTPUT` (it exists to
# feed a later step, and running it locally is not a gate). Both terms are load-bearing: `Fetch SWA
# deployment token` carries `${{` only in its `if:` — its body is expression-free and shells out to
# `az staticwebapp secrets list` against the production resource group. Keyed on `${{` alone this
# script would classify a production token fetch as safe and then run it. The partition is derived
# from ci.yml on every run; a hand-pinned list is what rotted last time.
#
# WHY THOSE TWO MARKERS ARE NOT ENOUGH, AND THE TWO OWNED GUARDS THAT BOUND IT. `${{` and
# `$GITHUB_OUTPUT` are GitHub's vocabulary, not this repo's: an ordinary workflow edit moves a step
# across the boundary in either direction without anyone thinking about this script. Both directions
# were demonstrated pre-merge, 2026-08-31:
#   (a) rewrite the token step to `>> "$GITHUB_ENV"` and its body holds NEITHER marker — it becomes
#       RUN, and a local invocation fires `az staticwebapp secrets list` at production;
#   (b) put any `${{ matrix.* }}` in the `Unit tests` body and it becomes NORUN — a red `npm test`
#       exits 0 again, the exact defect gh#171 remediates.
# So two guards keyed on sets THIS repo owns — the shape of its own commands — sit around the marker
# rules and cannot be overridden by any marker:
#   DENY (wins over every other rule, including the SKIP/EXP/RUN ladder): a body line that invokes a
#     cloud CLI, masks a secret, or carries credential-shaped text is NORUN whatever its markers say.
#     Deliberately over-broad — a false deny costs one locally-skipped gate, printed with its reason
#     in the banner; a false allow runs a production credential fetch on a laptop.
#   REQUIRE (aborts, exit 96): a body line that starts the unit tests (`node --test`, `npm test`)
#     must land in a runnable class, and at least one such step must exist. If either fails the run
#     ABORTS non-zero — a banner disclosure is what let a reader trust TOTAL=30 FAILS=0 in gh#171.
# Both are re-derived from the workflow text on every run — no pinned name, index, or title list.
# What they do NOT prove: the partition is still read out of a file whose semantics are GitHub's.
# The guards bound the damage of a drifting classification; they do not make it complete.
#
# THE EXPENSIVE CLASS, AND WHY OPTING OUT COSTS THE EXIT CODE. One runnable step -- the browser
# probes -- is 88% of the workflow's wall clock and drives a real Chrome; a second probe run attaches
# to the first one's browser (docs/runbook.md), so it is a correctness hazard when two agents share
# this machine, not just a cost. It is identified by a DERIVED property, never by name or index: the
# workflow itself gates it on `if: steps.<id>.outputs.<x>` -- CI decides per run whether it is worth
# it, which is exactly the "expensive" signal. It RUNS by default, so an unqualified green means what
# the verdict line says. `SKIP_EXPENSIVE=1` skips it and COUNTS IT AS NOT-EXECUTED, which forces a
# non-zero exit. A skip that kept exit 0 would recreate the defect gh#171 exists to remediate.
#
# THE CITATION RANGE. In CI the added-lineno-citation gate takes its base from the push or PR event
# (the step's `env:` block, which this extractor never reads). Run here with nothing set, the gate
# fell back to its own local default, HEAD~1 -> working tree, so it saw ONE commit. On 2026-10-01 a
# docs/evidence commit sat on top of an unpushed src commit: the lane's step scanned 0 files ("nothing
# policed was scanned") and passed, while the same gate given the real base scanned 3 files and 324
# lines. So this script now exports CITATION_DIFF_RANGE as the merge-base of HEAD and origin/main,
# as a BARE rev, never `<sha>..HEAD`: the gate folds in uncommitted and untracked files only when the
# range has no `..`, so the bare form covers every unpushed commit plus the working tree. A stale
# origin/main (no recent fetch) moves the base further back while main only moves forward, so it
# widens the scan, never narrows it. No origin/main, or HEAD already on it, leaves the variable unset
# and the gate's HEAD~1 default runs, which is never narrower than the HEAD -> working tree it would
# otherwise get. A CITATION_DIFF_RANGE the caller already set is used as given. A `citation range:`
# line before the first step prints which case applied and why.
#
# THE PROBE SCOPE (2026-11-12, owner pick). CI skips the probe-gated steps on a branch push whose
# every changed path is inert (scripts/probe-scope.mjs, gh#270), but this script ran them anyway, so
# a docs-only commit paid the ~9-minute browser lane (542s, n=4, docs/agents/ci-verification.md) for
# a verdict no CI run would ask of that diff. It now asks the SAME resolver about every path that
# differs from the merge-base of HEAD and origin/main in HEAD, in the index or in the working tree,
# untracked files included -- the widest diff this tree can carry to a push. All
# inert -> the steps gated on exactly `steps.probe-scope.outputs.run == 'true'` are NOT OWED: each is
# printed, counted apart from not-executed, and the exit can be 0. Anything else -- one non-inert
# path, no merge-base, a list or resolver that fails, a resolver that fails its own selftest -- leaves
# them owed. Another expensive step keeps the SKIP_EXPENSIVE rule. Nothing settable forces "not
# owed": the answer comes from git and the resolver alone. A stale origin/main only widens the diff.
#
#   bash scripts/run-workflow-gates.sh          # run them all
#   MIN_STEPS=25 bash scripts/run-workflow-gates.sh
#   SKIP_EXPENSIVE=1 bash scripts/run-workflow-gates.sh  # fast; exits non-zero whenever the probes are owed
#   CLASSIFY_ONLY=1 bash scripts/run-workflow-gates.sh   # print the partition, execute nothing
#   CITATION_DIFF_RANGE=<rev> bash scripts/run-workflow-gates.sh  # pin the citation gate's base
#
# Exit: 0 every runnable step ran and passed · N = N runnable steps failed or went unexecuted
#       96 = the workflow moved the unit tests out of local reach (REQUIRE guard)
#       95 = the workflow moved the browser lanes out of local reach (GUARD 3)
#       97 = a probe matrix variable was inherited from the calling shell (GUARD 4)
#       98 = the extractor is broken (not the tree) · 99 = not a repo
set -u

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 99
cd "$ROOT" || exit 99

# OWNED GUARD 4 (ADR-0078). The probe step's body is `npm run ci-probes`, and scripts/ci-probes.sh
# picks its mode from the environment: CI sets these per matrix job, through the step's env:, which
# this script never reads. Here the probe step must be the packed run of every lane. An inherited
# value would turn it green on one group's legs, or on a directory of lane files with no browser at
# all (REFUTE 2026-11-12). Refused rather than unset, so the shell that exported it hears about it.
for v in PROBE_LANES PROBE_AGGREGATE PROBE_FIT_SHARDS MATRIX_KEEP MATRIX_LANE; do
  if [ -n "${!v:-}" ]; then
    echo "ABORT: $v is set in this shell. It switches scripts/ci-probes.sh out of the packed run."
    echo "Unset it, or run scripts/ci-probes.sh directly for one lane. Do NOT read this as a pass."
    exit 97
  fi
done

# NOT overridable, on purpose: the whole claim of this script is that it reads the file that gates
# deploy. The guards below are proved against a doctored ci.yml inside a throwaway git repo instead.
WORKFLOW=.github/workflows/ci.yml
[ -f "$WORKFLOW" ] || { echo "no $WORKFLOW"; exit 99; }

# Floor, not a pinned count: the workflow gains steps over time and a pin would rot into a chore.
# Its only job is to make "extracted nothing" impossible to mistake for "everything passed".
MIN_STEPS=${MIN_STEPS:-20}
CLASSIFY_ONLY=${CLASSIFY_ONLY:-}
SKIP_EXPENSIVE=${SKIP_EXPENSIVE:-}

OUT_DIR=${OUT_DIR:-$(mktemp -d)}
LOG="$OUT_DIR/workflow-gates.log"
: > "$LOG"

STEPDIR="$OUT_DIR/steps"
mkdir -p "$STEPDIR"
MANIFEST="$OUT_DIR/manifest"
VIOLATIONS="$OUT_DIR/unit-test-out-of-reach"

# One pass over the workflow. Every `run:` step — single-line and `run: |` block alike — becomes a
# body file, and the manifest carries `index<TAB>class<TAB>marker<TAB>step name`.
#   RUN    = runnable locally
#   EXP    = runnable but expensive; runs by default, SKIP_EXPENSIVE=1 turns it into a not-executed
#   SKIP   = deliberately not run here (the npm ci install; deps are already present)
#   NORUN  = structurally not runnable (see THE PARTITION above)
LC_ALL=C awk -v dir="$STEPDIR" -v vfile="$VIOLATIONS" '
  # OWNED GUARD 1 (deny). Called on every body LINE as it is read, so the anchor is a real command
  # position and never a fragment of a longer word. First hit wins and is reported verbatim.
  function denyreason(s,   t) {
    if (match(s, /(^|[[:space:]]|[;&|(])(az|aws|gcloud|azcopy|kubectl|doctl|flyctl|wrangler|heroku|vercel)[[:space:]]/)) {
      t = substr(s, RSTART, RLENGTH); gsub(/[^a-z]/, "", t)
      return "DENY cloud CLI: " t
    }
    # A runner-only system install (the gh#287 Thai face): on a laptop sudo stalls on a password prompt.
    if (match(s, /(^|[[:space:]]|[;&|(])(sudo|apt-get|apt|dpkg)[[:space:]]/)) {
      t = substr(s, RSTART, RLENGTH); gsub(/[^a-z-]/, "", t)
      return "DENY system package manager: " t
    }
    if (s ~ /::add-mask::/) return "DENY secret masking"
    if (s ~ /[Ss]ecret|[Cc]redential|[Pp]assword|[Tt]oken|[Aa]pi[-_]?[Kk]ey|API_KEY/) return "DENY credential-shaped"
    return ""
  }
  # OWNED GUARD 2 (require). Line-anchored, so a mention inside a `#` comment cannot demand a class.
  function isunittest(s) {
    return (s ~ /^[[:space:]]*(node[[:space:]]+--test|npm[[:space:]]+(run[[:space:]]+)?test)/)
  }
  function scanline(i, s,   d) {
    if (deny[i] == "" && (d = denyreason(s)) != "") deny[i] = d
    if (isunittest(s)) hastest[i] = 1
  }
  function classify(idx,   b) {
    b = body[idx]
    # Deny wins over every other rule, markers included: no `${{`, no `$GITHUB_OUTPUT`, and no
    # absence of either can promote a credential- or cloud-shaped body back into the runnable set.
    if (deny[idx] != "")       { mark[idx] = deny[idx];       return "NORUN" }
    if (b ~ /\$\{\{/)          { mark[idx] = "${{" ;          return "NORUN" }
    if (b ~ /\$GITHUB_OUTPUT/) { mark[idx] = "$GITHUB_OUTPUT"; return "NORUN" }
    if (b ~ /^npm ci[[:space:]]*$/) { mark[idx] = "deps already installed"; return "SKIP" }
    if (cond[idx] != "")       { mark[idx] = cond[idx];        return "EXP" }
    mark[idx] = "-"
    return "RUN"
  }
  # Block mode first, so a shell line inside a body can never be read as YAML.
  inblock {
    if ($0 ~ /^[[:space:]]*$/) { print "" >> bodyfile; next }
    match($0, /^[[:space:]]*/)
    if (RLENGTH > blockindent) { print $0 >> bodyfile; body[n] = body[n] "\n" $0; scanline(n, $0); next }
    close(bodyfile); inblock = 0
    # fall through: this line is the next YAML key
  }
  /^[[:space:]]*-[[:space:]]+name:[[:space:]]/ {
    name = $0
    sub(/^[[:space:]]*-[[:space:]]+name:[[:space:]]*/, "", name)
    sub(/[[:space:]]+$/, "", name)
    stepif = ""
  }
  # A new list item is a new step: no condition carries over from the one before (a step that opens
  # with `- uses:` would otherwise lend its `if:` to the next `run:`).
  /^[[:space:]]*-[[:space:]]+[A-Za-z_]/ { stepif = "" }
  # CI gates this step on another step -- or, since the probe matrix (ADR-0078), on another JOB --
  # diffing the tree first, i.e. CI itself decides per run whether it is worth paying for. Derived, so
  # a new expensive step inherits the class with no edit here.
  /^[[:space:]]*if:[[:space:]].*(steps|needs)\.[A-Za-z0-9_-]+\.outputs\./ {
    stepif = $0
    sub(/^[[:space:]]*if:[[:space:]]*/, "", stepif)
    sub(/[[:space:]]+$/, "", stepif)
  }
  /^[[:space:]]*run:[[:space:]]*\|[[:space:]]*$/ {
    n++
    match($0, /^[[:space:]]*/); blockindent = RLENGTH
    bodyfile = dir "/" n ".sh"
    printf "" > bodyfile; close(bodyfile)
    names[n] = (name == "" ? "(unnamed step)" : name)
    cond[n] = stepif
    body[n] = ""; kind[n] = "block"; inblock = 1
    next
  }
  /^[[:space:]]*run:[[:space:]]*[^|>[:space:]]/ {
    n++
    line = $0
    sub(/^[[:space:]]*run:[[:space:]]*/, "", line)
    sub(/[[:space:]]+$/, "", line)
    bodyfile = dir "/" n ".sh"
    print line > bodyfile; close(bodyfile)
    names[n] = (name == "" ? "(unnamed step)" : name)
    cond[n] = stepif
    body[n] = line; kind[n] = "line"
    scanline(n, line)
    next
  }
  END {
    if (inblock) close(bodyfile)
    seen = 0
    for (i = 1; i <= n; i++) {
      c = classify(i)
      printf "%d\t%s\t%s\t%s\n", i, c, mark[i], names[i]
      if (hastest[i]) {
        seen++
        if (c != "RUN" && c != "EXP")
          printf "  step %d \"%s\" runs the unit tests but classified %s (%s)\n", i, names[i], c, mark[i] > vfile
      }
    }
    if (seen == 0)
      printf "  no step in this workflow starts the unit tests at all (no `node --test`, no `npm test`)\n" > vfile
  }
' "$WORKFLOW" > "$MANIFEST"

parsed=$(grep -c . "$MANIFEST")
declared=$(LC_ALL=C grep -c '^[[:space:]]*run:' "$WORKFLOW")
if [ "$parsed" -lt "$MIN_STEPS" ] || [ "$parsed" -ne "$declared" ]; then
  echo "ABORT: parsed $parsed run: step(s) from $WORKFLOW; it declares $declared (floor $MIN_STEPS)."
  echo "The extractor is broken, not the tree. Do NOT read this as a pass."
  exit 98
fi

# OWNED GUARD 2 fires here, BEFORE the banner and before CLASSIFY_ONLY can exit 0: the unit tests
# leaving local reach is not a footnote to disclose, it is the thing gh#171 fixed.
if [ -s "$VIOLATIONS" ]; then
  echo "ABORT: the workflow moved the unit tests out of local reach."
  cat "$VIOLATIONS"
  echo "This script can no longer run $WORKFLOW's unit tests, so it cannot fail when they are red."
  echo "Do NOT read this as a pass. Fix the workflow or this script's REQUIRE guard, not the exit code."
  exit 96
fi

# OWNED GUARD 3 (the probe matrix, ADR-0078): the browser lanes must stay in local reach as well. In
# CI they run as matrix jobs, and one `${{ matrix.* }}` written into a probe step's body would make it
# NORUN here -- the local suite would then stop running the probes without a red, exactly gh#171's
# shape. So a runnable step must invoke the packed probe run and another the WebGL lane, or this aborts.
# Invoke, not mention: the match is anchored at the start of a body line, as GUARD 2 is, so a `#`
# comment, an `echo`, or `bash -n` naming the script cannot stand in for the lane (REFUTE 2026-11-12).
# An env-prefixed invocation does not match either; that aborts here, loudly, rather than passing.
missing_lanes=""
for need in ci-probes webgl-pixels-lane; do
  found=0
  while IFS="$(printf '\t')" read -r idx class marker sname; do
    { [ "$class" = "RUN" ] || [ "$class" = "EXP" ]; } || continue
    case "$need" in
      ci-probes) grep -Eq '^[[:space:]]*(npm run ci-probes|(bash[[:space:]]+)?scripts/ci-probes\.sh)([[:space:]]|$)' "$STEPDIR/$idx.sh" && found=1 ;;
      webgl-pixels-lane) grep -Eq '^[[:space:]]*(bash[[:space:]]+)?scripts/webgl-pixels-lane\.sh([[:space:]]|$)' "$STEPDIR/$idx.sh" && found=1 ;;
    esac
  done < "$MANIFEST"
  [ "$found" -eq 1 ] || missing_lanes="$missing_lanes $need"
done
if [ -n "$missing_lanes" ]; then
  echo "ABORT: no runnable step in $WORKFLOW invokes:${missing_lanes} -- the browser lanes left local reach."
  echo "Do NOT read this as a pass. Keep the lane's step body free of \${{ }} (pass the matrix through env:)."
  exit 95
fi

runnable=$(awk -F'\t' '$2=="RUN" || $2=="EXP"' "$MANIFEST" | grep -c .)
notrunnable=$(awk -F'\t' '$2=="NORUN"' "$MANIFEST" | grep -c .)

# THE PROBE SCOPE (header). Decided before the banner, so CLASSIFY_ONLY prints it too.
# The probe gate as each workflow layout spells it: a step condition in the one-job layout, a job
# output in the probe matrix (ADR-0078). Only steps carrying one of these can be NOT OWED.
PROBE_GATES="steps.probe-scope.outputs.run == 'true'|needs.dist.outputs.run == 'true'"
is_probe_gate() { case "|$PROBE_GATES|" in *"|$1|"*) return 0 ;; *) return 1 ;; esac; }
probe_owed=yes
# The full ref: a short `origin/main` resolves a tag or branch of that name first, and a local
# `git tag origin/main HEAD` would make every unpushed commit vanish from the diff. Three trees are
# listed, because each can differ from the base on its own: HEAD (what a push carries, even when the
# working tree reverted a committed change), the index (what the next commit carries), and the
# working tree with its untracked files. The union is deduplicated before the resolver reads it.
if scope_base=$(git merge-base HEAD refs/remotes/origin/main 2>/dev/null); then
  scope_raw="$OUT_DIR/probe-scope-changed.raw"
  scope_list="$OUT_DIR/probe-scope-changed.txt"
  if git diff --name-only --no-renames "$scope_base" HEAD > "$scope_raw" \
    && git diff --cached --name-only --no-renames "$scope_base" >> "$scope_raw" \
    && git diff --name-only --no-renames "$scope_base" >> "$scope_raw" \
    && git ls-files --others --exclude-standard >> "$scope_raw" \
    && LC_ALL=C sort -u "$scope_raw" > "$scope_list" \
    && node scripts/probe-scope.mjs --selftest > /dev/null \
    && scope_decision=$(node scripts/probe-scope.mjs --changed "$scope_list"); then
    scope_reason=$(printf '%s\n' "$scope_decision" | sed -n 's/^reason: //p')
    if printf '%s\n' "$scope_decision" | grep -qx 'run=false'; then
      probe_owed=no
      probe_note="NOT OWED -- $scope_reason, from merge-base $scope_base (origin/main) to HEAD, the index and the working tree, untracked files included; CI skips these steps on a branch push of such a diff"
    else
      probe_note="owed -- $scope_reason (since merge-base $scope_base, in HEAD, the index or the working tree)"
    fi
  else
    probe_note="owed -- listing the changed paths or the resolver failed, failing safe"
  fi
else
  probe_note="owed -- no merge-base with origin/main, failing safe"
fi

{
  echo "STRUCTURALLY NOT RUNNABLE HERE -- these gates are NOT covered by anything below:"
  awk -F'\t' '$2=="NORUN" { printf "  [%s]  %s\n", $3, $4 }' "$MANIFEST"
  awk -F'\t' '$2=="SKIP"  { printf "  [deliberate skip: %s]  %s\n", $3, $4 }' "$MANIFEST"
  awk -F'\t' -v skip="$SKIP_EXPENSIVE" -v owed="$probe_owed" -v gates="$PROBE_GATES" 'BEGIN { ng = split(gates, G, "|"); for (i = 1; i <= ng; i++) isgate[G[i]] = 1 } $2=="EXP" {
    printf "  [expensive, CI-gated on %s]  %s  ->  %s\n", $3, $4,
      (owed == "no" && ($3 in isgate) ? "NOT OWED (probe scope below)" : \
        (skip == "" ? "RUNS (unset SKIP_EXPENSIVE)" : "SKIPPED, counted as NOT EXECUTED"))
  }' "$MANIFEST"
  echo "probe scope: $probe_note"
  echo ""
} | tee -a "$LOG"

if [ -n "$CLASSIFY_ONLY" ]; then
  cat "$MANIFEST"
  echo "log: $LOG"
  exit 0
fi

# THE CITATION RANGE (header). Exported, or `bash -e "$body"` never sees it.
head_sha=$(git rev-parse HEAD)
if [ -n "${CITATION_DIFF_RANGE:-}" ]; then
  range_note="CITATION_DIFF_RANGE=$CITATION_DIFF_RANGE (set by the caller, used as given)"
elif upstream_base=$(git merge-base HEAD refs/remotes/origin/main 2>/dev/null) && [ "$upstream_base" != "$head_sha" ]; then
  export CITATION_DIFF_RANGE="$upstream_base"
  ahead=$(git rev-list --count "$upstream_base..HEAD")
  range_note="CITATION_DIFF_RANGE=$upstream_base -> working tree (merge-base of HEAD and origin/main: $ahead commit(s) not on origin/main, plus uncommitted and untracked files)"
elif [ -n "${upstream_base:-}" ]; then
  range_note="CITATION_DIFF_RANGE unset -> the gate's HEAD~1 default (HEAD is already on origin/main, nothing unpushed)"
else
  range_note="CITATION_DIFF_RANGE unset -> the gate's HEAD~1 default (no merge-base with origin/main)"
fi
echo "citation range: $range_note" | tee -a "$LOG"

echo "executing $runnable runnable step(s) of $declared declared" | tee -a "$LOG"

fails=0
executed=0
notowed=0
while IFS="$(printf '\t')" read -r idx class marker sname; do
  [ "$class" = "RUN" ] || [ "$class" = "EXP" ] || continue
  if [ "$class" = "EXP" ] && [ "$probe_owed" = "no" ] && is_probe_gate "$marker"; then
    echo "NOT-OWED  $sname  (probe scope: every changed path since origin/main is inert)" | tee -a "$LOG"
    notowed=$((notowed + 1))
    continue
  fi
  if [ "$class" = "EXP" ] && [ -n "$SKIP_EXPENSIVE" ]; then
    echo "NOT-EXECUTED  $sname  (SKIP_EXPENSIVE=1 — this costs the exit code)" | tee -a "$LOG"
    continue
  fi
  body="$STEPDIR/$idx.sh"
  if [ ! -s "$body" ]; then
    echo "NOT-EXECUTED  $sname  (empty body file — extractor lost it)" | tee -a "$LOG"
    continue
  fi
  step_log="$OUT_DIR/step.$idx.out"
  # `bash -e <file>` mirrors what a GitHub `run:` step gets, and keeps every multi-line body out of
  # `bash -c` (this repo bans a heredoc nested in `bash -c`). Exit code read straight off the
  # command, never through a pipe — a pipe reports the LAST stage's status.
  t0=$SECONDS
  if bash -e "$body" > "$step_log" 2>&1; then
    dur=$((SECONDS - t0))
    executed=$((executed + 1))
    echo "PASS  $sname  (${dur}s)" | tee -a "$LOG"
  else
    rc=$?
    dur=$((SECONDS - t0))
    executed=$((executed + 1))
    fails=$((fails + 1))
    echo "FAIL($rc)  $sname  (${dur}s)" | tee -a "$LOG"
    { echo "----- last 25 lines -----"; tail -25 "$step_log"; echo "----- end -----"; } >> "$LOG"
    tail -25 "$step_log"
  fi
done < "$MANIFEST"

# Single source for not-executed: whatever was runnable and did not run, for ANY reason other than
# the probe scope's own NOT-OWED answer, which is counted (and printed) on its own.
notexec=$((runnable - executed - notowed))

echo "" | tee -a "$LOG"
rc=$((fails + notexec))
[ "$rc" -gt 97 ] && rc=97
if [ "$rc" -eq 0 ]; then
  verdict="LOCAL GATES PASSED -- and this covers ONLY the $executed step(s) executed above."
  if [ "$notowed" -gt 0 ]; then
    verdict="$verdict $notowed probe-gated step(s) $probe_note."
  fi
else
  verdict="LOCAL GATES FAILED -- $fails failed, $notexec runnable step(s) never executed. Do not push."
fi
echo "declared=$declared  executed=$executed  failed=$fails  not-executed=$notexec  not-owed=$notowed  not-runnable-here=$notrunnable" | tee -a "$LOG"
echo "log: $LOG"
echo "$verdict" | tee -a "$LOG"
exit "$rc"
