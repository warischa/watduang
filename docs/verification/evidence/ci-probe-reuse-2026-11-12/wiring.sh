#!/usr/bin/env bash
# Drives ci.yml's probe-scope step body (extracted from the workflow, never copied) through the main
# and branch cases with GitHub's expressions substituted. Needs a built dist/ in the repo, gh logged
# in for the real-API case, and nothing else. The repo is the one this file sits in:
#   bash <repo>/docs/verification/evidence/ci-probe-reuse-2026-11-12/wiring.sh [workflow-file]
set -u
ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel) || exit 99
HERE=$(cd "$(dirname "$0")" && pwd)
WF=${1:-$ROOT/.github/workflows/ci.yml}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
awk '/id: probe-scope/{f=1} f&&/^[[:space:]]*run: \|/{r=1; match($0,/^[[:space:]]*/); ind=RLENGTH; next} r{ if ($0 !~ /^[[:space:]]*$/) { match($0,/^[[:space:]]*/); if (RLENGTH<=ind) exit } print substr($0, ind+3) }' "$WF" > "$TMP/body.tmpl"
[ -s "$TMP/body.tmpl" ] || { echo "could not extract the probe-scope step body from $WF"; exit 98; }

# label ref event before sha [PATH prefix]
case_() {
  local label=$1 ref=$2 event=$3 before=$4 sha=$5 pre=${6:-}
  sed -e "s#\${{ github.ref }}#$ref#g" -e "s#\${{ github.event_name }}#$event#g" -e "s#\${{ github.event.before }}#$before#g" "$TMP/body.tmpl" > "$TMP/body.sh"
  : > "$TMP/out"; mkdir -p "$TMP/rt"
  ( cd "$ROOT" && PATH="${pre:+$pre:}$PATH" GITHUB_OUTPUT="$TMP/out" RUNNER_TEMP="$TMP/rt" GITHUB_SHA="$sha" GITHUB_RUN_ID=999 GITHUB_REPOSITORY=warischa/watduang bash -e "$TMP/body.sh" > "$TMP/log" 2>&1 )
  echo "== $label  rc=$?  output: $(grep -c '^run=' "$TMP/out") run= line(s): $(grep '^run=' "$TMP/out" | tr '\n' ' ')"
  grep -E '^probe-scope: (main — )?(run=|reason:)|^probe-reuse|failing safe' "$TMP/log" | cut -c1-190 | sed 's/^/   /'
}

H=$(git -C "$ROOT" rev-parse HEAD)
X=$(git -C "$ROOT" rev-parse HEAD~1)
PAIR=$(git -C "$ROOT" rev-parse 478288a)
D=$(cd "$ROOT" && node scripts/probe-scope.mjs --dist-digest dist)
echo "dist digest of this tree: $D"
FAKE_DIGEST=$D case_ "main push, fake gh: one green push run with this digest -> reuse (run=false)" refs/heads/main push "$X" "$H" "$HERE/fake-gh-green"
FAKE_DIGEST=$(printf 'f%.0s' $(seq 64)) case_ "main push, fake gh: digest differs -> run" refs/heads/main push "$X" "$H" "$HERE/fake-gh-green"
FAKE_DIGEST=$D FAKE_RED="Browser probes against the deployed artifact (gh#122)" case_ "main push, fake gh: probe step red -> run" refs/heads/main push "$X" "$H" "$HERE/fake-gh-green"
case_ "main push, gh fails and prints run=false on stderr -> run" refs/heads/main push "$X" "$H" "$HERE/fake-gh-fails"
case_ "main push, real API at 478288a (past runs carry no digest artifact) -> run" refs/heads/main push "$X" "$PAIR"
case_ "main push, lookup crashes (bad sha) -> run" refs/heads/main push "$X" "zzz"
case_ "main, not a push -> run" refs/heads/main pull_request "$X" "$H"
case_ "branch push, docs-only diff ce720a6..7cefc99 -> skip (unchanged rule)" refs/heads/batch/x push "$(git -C "$ROOT" rev-parse ce720a6)" "$(git -C "$ROOT" rev-parse 7cefc99)"
case_ "branch push, src diff f181241..568ba85 -> run (unchanged rule)" refs/heads/batch/x push "$(git -C "$ROOT" rev-parse f181241)" "$(git -C "$ROOT" rev-parse 568ba85)"
mv "$ROOT/dist" "$ROOT/dist.wiring-bak"
FAKE_DIGEST=x case_ "main push, no dist/ (digest fails), fake gh green -> run" refs/heads/main push "$X" "$H" "$HERE/fake-gh-green"
mv "$ROOT/dist.wiring-bak" "$ROOT/dist"
