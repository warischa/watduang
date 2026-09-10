#!/usr/bin/env bash
# The one lane that can produce a PASS or a FAIL from scripts/webgl-pixels-probe.mjs.
#
# Every other browser lane in this repo launches Chrome with --disable-gpu. ON A MAC that returns
# null from getContext('webgl') on every one of them, and the only honest verdict there is
# UNMEASURED. That qualifier was added 2026-09-10 and it matters: on the CI runner the same flag
# leaves a 3D route's canvas LIVE, established by signature and not by a read, and WHY is explicitly
# not known -- ANGLE/SwiftShader on the runner image, llvmpipe and a Chrome-version gate are all
# candidates and none was measured. scripts/canvas-ink-probe.mjs now takes the in-page read on its
# own lane so the next run answers it from the runner. Do not restate the flag as a context state.
# This lane asks for the software rasteriser explicitly instead, which is what a runner with no GPU
# can still give: a live WebGL context, rendered on the CPU.
#
# TWO LEGS, ONE INVOCATION, ONE SERVER AND ONE CHROME. The clean leg reads the shipped surfaces; the
# stub-control leg re-runs the SAME probe with STUB_DRAW=1, which no-ops the draw calls while leaving
# the context live, and requires it to come back FAIL. Without that second leg this lane is a probe
# whose only evidence of being able to fail was produced by hand, once, on one laptop: an edit that
# loosens the nonBlank decision inside webgl-pixels-probe.mjs would leave the clean leg green on a
# blank canvas forever, with nothing red -- exactly the two-way probe this lane replaced.
#
# WHY IN HERE AND NOT AS A SECOND CI STEP: a control exists to show this probe's own detector going
# red in the SAME browser the clean leg used, and a second step means a second Chrome, which is a
# second environment, which calibrates nothing. That is the rule scripts/ci-probes.sh already runs on
# -- every `probe X` / `probe X-control` pair there shares one CDP port and is never split. This lane
# is not registered in ci-probes.sh, so its legs are counted here instead of against that script's
# pinned EXPECTED_LEGS, and adding a leg costs no edit to a file two other gates share.
#
# Exit code IS the verdict, and the three states stay apart:
#   0  PASS        a live context, the canvas drew, AND the control leg went red on cue
#   1  FAIL        a live context and a blank canvas -- or a control leg that no longer goes red
#   2  UNMEASURED  no live context here -- not a pass, and never relaxed into one
#
# The clean leg's verdict is reported first and wins: an UNMEASURED run stays a 2 rather than being
# overwritten by whatever its control did, because the instrument being gone is the thing to surface.
#
# Runs against an ALREADY-BUILT dist/ and never builds one -- a probe that measures a freshly
# regenerated dist/ is not measuring the bytes that get deployed.
#
# WHERE THIS BELONGS IN CI: immediately after the step named "Browser probes against the deployed
# artifact", sharing that step's probe-scope gate, and before the probe-output upload step so a red
# here keeps its JSON. The workflow file is a shared registry and is wired by hand, not from here:
#
#   - name: WebGL play surfaces actually draw (ADR-0051 pixel readback)
#     if: steps.probe-scope.outputs.run == 'true'
#     env:
#       WEBGL_PROBE_OUT_DIR: ${{ runner.temp }}/ci-probes/webgl-pixels
#     run: bash scripts/webgl-pixels-lane.sh
#
# Any non-zero fails that step, and exit 2 (UNMEASURED) is deliberately among them: this lane exists
# only to measure, so a runner that cannot give a live context is an instrument change to surface
# rather than a pass to inherit. That matches the play-exit guard, where an UNMEASURED blocks exactly
# like a failure. Softening it to `|| [ $? -eq 2 ]` would recreate the two-way probe this replaces.
#
# GitHub Actions runs `run:` steps under `bash -e {0}` -- errexit only, NO pipefail (adding it once
# skipped a trap teardown and let a later run go green against a stale server).
set -e

PORT="${WEBGL_PROBE_PORT:-4351}"
CDP="${WEBGL_PROBE_CDP_PORT:-9333}"
OUT_DIR="${WEBGL_PROBE_OUT_DIR:-$(mktemp -d)}"
mkdir -p "$OUT_DIR"

if [ ! -f dist/index.html ]; then
  echo "::error::dist/index.html not found -- this lane probes an existing build and must never make one. Run it after the Build step."
  exit 1
fi

for p in "$PORT" "$CDP"; do
  # A port already LISTENing belongs to somebody else; probing it would report a verdict about their
  # server or their browser.
  if (exec 3<>"/dev/tcp/localhost/${p}") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "::error::Port ${p} is already in use -- refusing to probe a foreign server/browser. Set WEBGL_PROBE_PORT / WEBGL_PROBE_CDP_PORT."
    exit 1
  fi
done

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome google-chrome-stable chromium chromium-browser; do
    if [ -x "$c" ] || command -v "$c" > /dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ]; then
  # Loud, never a skip: "no browser, nothing to check" is exactly the shape of gate that cannot fail.
  echo "::error::No Chrome/Chromium found -- set CHROME=<path>. This lane cannot be skipped into a pass."
  exit 1
fi

npx serve@14 dist/ -l "$PORT" > "$OUT_DIR/serve.log" 2>&1 &
KILL_PIDS="$!"
# NO --disable-gpu, and the swiftshader flags are the point of this lane: they are what turns
# UNMEASURED into a real reading on a runner that has no GPU at all. --enable-unsafe-swiftshader is
# required from Chrome 128 on, where the software fallback stopped being implicit.
# The flags are a knob so the UNMEASURED leg stays re-runnable rather than being a one-off claim:
# WEBGL_PROBE_CHROME_FLAGS=--disable-gpu must exit 2, and a lane that cannot reach 2 is not proving
# that its own green came from a live context.
GPU_FLAGS="${WEBGL_PROBE_CHROME_FLAGS:---use-angle=swiftshader --enable-unsafe-swiftshader}"
# Word splitting is how a flag list is passed here, so $GPU_FLAGS is deliberately unquoted.
# (Trailing prose after the code makes the directive unparseable, which silently disables it.)
# shellcheck disable=SC2086
"$CHROME" --headless --no-sandbox $GPU_FLAGS \
  --remote-debugging-port="$CDP" --user-data-dir="$OUT_DIR/prof-webgl" > "$OUT_DIR/chrome.log" 2>&1 &
KILL_PIDS="$KILL_PIDS $!"
trap 'kill $KILL_PIDS 2>/dev/null || true' EXIT

wait_ready() { # url, label
  for _ in $(seq 1 30); do
    if curl -sf "$1" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "::error::$2 did not become ready within 30s"
  exit 1
}
wait_ready "http://127.0.0.1:${PORT}/" "server on ${PORT}"
wait_ready "http://127.0.0.1:${CDP}/json/version" "Chrome on ${CDP}"

name_for() { # exit code -> the verdict that code means
  case "$1" in 0) echo PASS ;; 1) echo FAIL ;; 2) echo UNMEASURED ;; *) echo "no-verdict(exit $1)" ;; esac
}

LEGS_RUN=0
LEGS_MATCHED=0
LEG_RC=0
leg() { # label, expected-exit-code, [VAR=val ...]
  label="$1"; want="$2"; shift 2
  echo "webgl-pixels leg: ${label} (expecting $(name_for "$want"))"
  set +e
  # Per-leg JSON: one shared filename would let the control overwrite the clean leg's record in the
  # uploaded artifact, leaving a red with no evidence of what the clean run actually read.
  env BASE="http://127.0.0.1:${PORT}" CDP_PORT="$CDP" "$@" \
    node scripts/webgl-pixels-probe.mjs | tee "$OUT_DIR/webgl-pixels-${label}.json"
  LEG_RC="${PIPESTATUS[0]}"
  set -e
  LEGS_RUN=$((LEGS_RUN + 1))
  if [ "$LEG_RC" -eq "$want" ]; then
    LEGS_MATCHED=$((LEGS_MATCHED + 1))
    echo "  LEG OK  ${label}: $(name_for "$LEG_RC")"
  else
    echo "  LEG BAD ${label}: got $(name_for "$LEG_RC"), expected $(name_for "$want")"
  fi
}

leg clean 0
rc="$LEG_RC"
# Always run the control, including after a red clean leg: whether the detector still works is a
# separate question from what it read, and skipping it would hide an instrument failure behind a
# result failure.
leg stub-control 1 STUB_DRAW=1
crc="$LEG_RC"

case "$rc" in
  0) echo "webgl-pixels clean leg: PASS" ;;
  1) echo "::error::webgl-pixels clean leg: FAIL -- a live WebGL context drew nothing (ADR-0051)" ;;
  2) echo "::error::webgl-pixels clean leg: UNMEASURED -- this runner gave no live WebGL context, so nothing was checked. Not a pass." ;;
  *) echo "::error::webgl-pixels clean leg: the probe exited ${rc} -- it did not reach a verdict" ;;
esac
if [ "$crc" -ne 1 ]; then
  echo "::error::webgl-pixels lane: the stub-control leg reported $(name_for "$crc") where it must report FAIL -- with the draw calls stubbed out this probe can no longer tell a drawn canvas from a blank one, so its clean leg's verdict is worth nothing. Fix the probe, do not relax this."
fi
echo "webgl-pixels lane: ${LEGS_MATCHED}/${LEGS_RUN} leg(s) matched their expected verdict"
echo "webgl-pixels lane: output in $OUT_DIR"

# The clean leg's code wins when it is non-zero -- an UNMEASURED run stays a 2 and is never softened.
if [ "$rc" -ne 0 ]; then exit "$rc"; fi
if [ "$crc" -ne 1 ]; then exit 1; fi
exit 0
