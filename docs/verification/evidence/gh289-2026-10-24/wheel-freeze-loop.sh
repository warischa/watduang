#!/usr/bin/env bash
# gh#289 diagnostic. Run wheel-freeze.mjs N times with FREEZE ms of GPU-process SIGSTOP after each click.
# One Chrome, own ports 4614/9614, own profile; kills only the pids it started.
set -u
N=${N:-3}; FREEZE=${FREEZE:-0}
REPO=/Users/waris.c/claude/free-game
SP=${SP:-$(mktemp -d)}  # where the per-run output and Chrome profile go
OUT=$SP/wfreeze; mkdir -p "$OUT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd "$REPO" || exit 9
npx serve@14 dist/ -l 4614 > "$OUT/serve.log" 2>&1 &
SPID=$!
for i in $(seq 1 60); do curl -sf http://localhost:4614/ > /dev/null && break; sleep 1; done
for run in $(seq 1 "$N"); do
  rm -rf "$OUT/prof"
  "$CHROME" --headless --disable-gpu --no-sandbox --remote-debugging-port=9614 --user-data-dir="$OUT/prof" > /dev/null 2>&1 &
  CPID=$!
  for i in $(seq 1 60); do curl -sf http://127.0.0.1:9614/json/version > /dev/null && break; sleep 1; done
  GPU=$(ps -axo pid=,command= | grep -F -- "$OUT/prof" | grep -F -- "--type=gpu-process" | grep -v grep | awk '{print $1}' | head -1)
  [ -n "$GPU" ] || { echo "run $run: no gpu-process found"; kill "$CPID"; continue; }
  PROBE_BASE=http://localhost:4614 CDP_PORT=9614 GPU_PID=$GPU FREEZE=$FREEZE RATE=${RATE:-1} node scripts/driver.mjs "$REPO/docs/verification/evidence/gh289-2026-10-24/wheel-freeze-diag.mjs" > "$OUT/f$FREEZE-$run.json" 2>&1
  kill -CONT "$GPU" 2>/dev/null
  kill "$CPID" 2>/dev/null; wait "$CPID" 2>/dev/null
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (r.error) { console.log("ERROR", r.error); process.exit(0); }
    for (const s of r.spins) { const a = s.at2300, z = s.settled;
      console.log(`s${s.spin} @${a.at} res=${a.result||"-"} ptr=${a.pointer} running=${a.running} start=${a.startRel} reveal=${a.revealRel} end=${a.endRel} | settled res=${z.result} ptr=${z.pointer} end=${z.endRel} ${a.result!==a.pointer?"MISMATCH@2300":""} ${z.result!==z.pointer?"MISMATCH-SETTLED":""}`); }
  ' "$OUT/f$FREEZE-$run.json" 2>&1 | sed "s/^/gpu=$GPU run$run /"
done
kill "$SPID" 2>/dev/null
