#!/bin/bash
# One render = one codex exec, cwd = the scratch dir (outside the repo). Usage: render.sh IMG_04_00N
# The scratch dir is supplied by the caller and the repo root is resolved from this script's
# location at runtime; no machine path is stored here.
S=${S:?set S to the scratch dir holding prompts/ and renders/}
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
id="$1"
log="$S/renders/$id/run.log"
t0=$(date +%s); echo "start $(date -u +%FT%TZ)" > "$S/renders/$id/time.txt"
( cd "$S" && codex exec --skip-git-repo-check -i "$REPO/images/IMG_02_003.png" -- "$(cat "$S/prompts/$id.sent.txt")" < /dev/null ) > "$log" 2>&1
rc=$?
t1=$(date +%s)
echo "end $(date -u +%FT%TZ) rc=$rc wall_s=$((t1 - t0))" >> "$S/renders/$id/time.txt"
cat "$S/renders/$id/time.txt"
ls -la "$S/renders/$id/"
