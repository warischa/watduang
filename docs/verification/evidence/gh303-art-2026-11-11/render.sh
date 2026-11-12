#!/bin/bash
# One render = one codex exec, cwd = the scratch dir (outside the repo). Usage: render.sh IMG_04_00N
S=/private/tmp/claude-501/-Users-waris-c--claude-spares-spare-zPc8K1/39b3f1af-9b72-404c-b761-02eda9dffadf/scratchpad/gh303-art
id="$1"
log="$S/renders/$id/run.log"
t0=$(date +%s); echo "start $(date -u +%FT%TZ)" > "$S/renders/$id/time.txt"
( cd "$S" && codex exec --skip-git-repo-check -i /Users/waris.c/claude/free-game/images/IMG_02_003.png -- "$(cat "$S/prompts/$id.sent.txt")" < /dev/null ) > "$log" 2>&1
rc=$?
t1=$(date +%s)
echo "end $(date -u +%FT%TZ) rc=$rc wall_s=$((t1 - t0))" >> "$S/renders/$id/time.txt"
cat "$S/renders/$id/time.txt"
ls -la "$S/renders/$id/"
