#!/usr/bin/env bash
# Asks the local runner (CLASSIFY_ONLY, executes nothing) for its probe-scope answer across tree
# states, inside a throwaway clone of this repo whose origin/main is this repo's main. Optionally
# runs the round-1/round-2 scripts too, to show each state is one they got wrong.
#   bash docs/verification/evidence/ci-probe-reuse-2026-11-12/local-legs.sh [older-runner.sh ...]
set -u
ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel) || exit 99
RUNNER="$ROOT/scripts/run-workflow-gates.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
C="$TMP/clone"
git clone -q --local "$ROOT" "$C"
git -C "$C" checkout -q -B probe-legs refs/remotes/origin/main
B=$(git -C "$C" rev-parse HEAD)
ask() { ( cd "$C" && CLASSIFY_ONLY=1 bash "$1" 2>&1 ) | grep '^probe scope:' | cut -c1-120; }
leg() {
  echo "== $1  (expect: $2)"
  echo "   final:   $(ask "$RUNNER")"
  for old in ${OLDER[@]+"${OLDER[@]}"}; do echo "   $(basename "$old"): $(ask "$old")"; done
}
reset_() { git -C "$C" reset -q --hard "$B"; git -C "$C" clean -qfd; git -C "$C" tag -d origin/main > /dev/null 2>&1 || true; }
OLDER=("$@")
commit_() { git -C "$C" -c user.name=t -c user.email=t@t commit -qam "$1"; }

reset_; leg "clean tree at origin/main" "NOT OWED (empty diff)"
reset_; printf '\nx\n' >> "$C/docs/runbook.md"; mkdir -p "$C/docs/tmp-leg"; echo x > "$C/docs/tmp-leg/new.md"
leg "docs edit + untracked docs file" "NOT OWED"
echo x > "$C/src/zz-untracked.txt"; leg "same + one untracked src file" "owed"
reset_; printf ' ' >> "$C/src/pages/index.astro"; leg "one tracked src byte" "owed"
reset_; printf '\n' >> "$C/src/pages/index.astro"; git -C "$C" add src/pages/index.astro
git -C "$C" show HEAD:src/pages/index.astro > "$C/src/pages/index.astro"
leg "src change staged, working tree reverted (MM)" "owed"
reset_; printf '\n' >> "$C/src/pages/index.astro"; commit_ "src byte"; git -C "$C" tag origin/main HEAD
leg "unpushed src commit + a local tag named origin/main at HEAD" "owed"
reset_; printf '\n' >> "$C/src/pages/index.astro"; commit_ "src byte"
git -C "$C" checkout -q "$B" -- src/pages/index.astro; printf '\nx\n' >> "$C/docs/runbook.md"
leg "unpushed src commit, index and working tree reverted to base, docs edit" "owed"
reset_
