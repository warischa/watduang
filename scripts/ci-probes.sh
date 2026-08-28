#!/usr/bin/env bash
# The 7 CI-worthy browser probes (docs/verification/probe-triage-2026-08-26.md, "What's actually
# trustworthy right now"), run in one pass against the ALREADY-BUILT dist/ -- this script never runs
# a build. It is meant to be called as a late step in ci.yml's single `build` job, after the Build
# step, because a probe that measures a freshly regenerated dist/ is not measuring the bytes that get
# deployed (the standing no-post-Build-rebuild invariant in .github/workflows/ci.yml).
#
# Exit: 0 only if every probe leg passes. Any failing leg prints `::error::probe FAIL: <label>` with
# a reason, and the final line lists every failed label.
#
# DELIBERATELY NOT WIRED, not an oversight: ad-slot-grid-probe.mjs and adslot-wheel-delay-probe.mjs are
# both fixed and calibrated, and both stay MANUAL per their own STATUS reasoning -- ad-slot-grid measures
# slot geometry Google owns and can change without a commit here, and for the wheel delay a SPIN_MS
# source tripwire stays green on the likelier regression at no browser cost. Not wired because they
# exist; wired only when a probe's red would mean a regression in THIS repo.
#
# Why bash and not .mjs: the serve/port-collision/trap-teardown pattern below is lifted from
# scripts/smoke-dist.sh, which already encodes two hazards learned the hard way. Only the per-probe
# JSON verdicts need real code, and those live in scripts/ci-probes-verdict.mjs.
#
# GitHub Actions runs `run:` steps under `bash -e {0}` -- errexit only, NO pipefail. Do not add
# pipefail: smoke-dist.sh's header records a run where adding it skipped the trap teardown and let a
# later run go green against a stale server.
set -e

# --- config ------------------------------------------------------------------------------------
# Own ports, deliberately not smoke-dist.sh's 4321 nor the 9222/4322/4399 other sessions have used,
# so this script can never probe a foreign server or attach to someone else's Chrome.
PORT="${PROBE_PORT:-4344}"
CDP_A="${PROBE_CDP_PORT:-9344}"
CDP_B="${PROBE_CDP_REDUCED_PORT:-9345}"
# driver.mjs's nav() waits on Page.loadEventFired with NO timeout -- a URL that never fires load hangs
# forever, and in CI that burns the whole job budget instead of failing. Per-leg watchdog below.
# ponytail: one flat timeout for every leg; narrow-overflow is the long one (22 screens — 5 games at
# two rosters each, 4 tools at three). Re-count this when a page is added or delisted; the number is
# pinned for real in ci-probes-verdict.mjs, and this comment is only a hint about which leg is slowest.
LEG_TIMEOUT="${PROBE_TIMEOUT:-600}"
OUT_DIR="${PROBE_OUT_DIR:-$(mktemp -d /tmp/ci-probes.XXXXXX)}"
SITE="http://localhost:${PORT}"
mkdir -p "$OUT_DIR"

# --- preconditions -----------------------------------------------------------------------------
if [ ! -f dist/index.html ]; then
  echo "::error::dist/index.html not found -- this script probes an existing build and must never make one. Run it after the Build step."
  exit 1
fi

for p in "$PORT" "$CDP_A" "$CDP_B"; do
  # A port already LISTENing before this script starts belongs to some other process -- probing it
  # would report a green for someone else's (possibly stale) dist/ or browser profile.
  if (exec 3<>"/dev/tcp/localhost/${p}") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "::error::Port ${p} is already in use before this script started -- refusing to probe a foreign server/browser. Set PROBE_PORT / PROBE_CDP_PORT / PROBE_CDP_REDUCED_PORT."
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
  # Loud, never a skip: a "no browser, nothing to check" pass is exactly the shape of gate that
  # cannot fail (docs/agents/ci-verification.md).
  echo "::error::No Chrome/Chromium found -- set CHROME=<path>. These probes cannot be skipped into a pass."
  exit 1
fi

# --- serve + two browsers ----------------------------------------------------------------------
# Chrome B exists only for home-direction-c-probe.mjs's reduced-motion leg: prefers-reduced-motion is
# a launch flag, not something CDP can toggle per tab, and that probe's own header prescribes two
# instances. Both legs of that probe run, or its motion criterion is never checked at all.
npx serve@14 dist/ -l "$PORT" > "$OUT_DIR/serve.log" 2>&1 &
SERVER_PID=$!
"$CHROME" --headless --disable-gpu --no-sandbox --remote-debugging-port="$CDP_A" \
  --user-data-dir="$OUT_DIR/prof-a" > /dev/null 2>&1 &
CHROME_A_PID=$!
"$CHROME" --headless --disable-gpu --no-sandbox --force-prefers-reduced-motion \
  --remote-debugging-port="$CDP_B" --user-data-dir="$OUT_DIR/prof-b" > /dev/null 2>&1 &
CHROME_B_PID=$!
# Unconditional teardown on every exit path, so a failure never leaves an orphan holding a port for
# the next run to falsely pass against.
trap 'kill "$SERVER_PID" "$CHROME_A_PID" "$CHROME_B_PID" 2>/dev/null || true' EXIT

wait_ready() { # url, label
  for _ in $(seq 1 30); do
    if curl -sf "$1" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "::error::$2 did not become ready within 30s"
  exit 1
}
wait_ready "${SITE}/" "server on ${PORT}"
wait_ready "http://127.0.0.1:${CDP_A}/json/version" "Chrome A on ${CDP_A}"
wait_ready "http://127.0.0.1:${CDP_B}/json/version" "Chrome B (reduced motion) on ${CDP_B}"

# --- the verdicts ------------------------------------------------------------------------------
# driver.mjs exits 0 for any probe that returns SOMETHING -- a probe's own PASS/FAIL lives in its JSON
# and nothing read it before this file existed. One predicate per leg, keyed by label. Every predicate
# also asserts liveness (the run really visited N pages / really fired its trigger), because each of
# these probes reports its clean state as a zero or an empty list.
# The verdict table lives in scripts/ci-probes-verdict.mjs (see its header for why it is not a
# heredoc: macOS bash 3.2 cannot parse an apostrophe inside a heredoc nested in $( )).

# --- the run -----------------------------------------------------------------------------------
FAILED=""
PASSED=""
LEGS=0
probe() { # label, probe-file, cdp-port, [extra VAR=val ...]
  label="$1"; file="$2"; cdp="$3"; shift 3
  out="$OUT_DIR/$label.json"
  err="$OUT_DIR/$label.err"
  LEGS=$((LEGS + 1))
  echo "probe: $label ($file)"
  # Both env var names on purpose: the 7 probes disagree (BASE vs PROBE_BASE) and exporting both is
  # cheaper and safer than a per-probe table that goes stale when one probe is edited.
  env BASE="$SITE" PROBE_BASE="$SITE" CDP_PORT="$cdp" "$@" \
    node scripts/driver.mjs "scripts/$file" > "$out" 2> "$err" &
  pid=$!
  ( sleep "$LEG_TIMEOUT"; kill -9 "$pid" 2> /dev/null ) &
  watchdog=$!
  set +e
  wait "$pid"
  rc=$?
  set -e
  # kill + reap: without the wait, bash prints a "Terminated: 15" job message into the CI log for
  # every leg, which reads like a probe was killed when it was only the watchdog standing down.
  { kill "$watchdog" && wait "$watchdog"; } 2> /dev/null || true
  set +e
  msg=$(node scripts/ci-probes-verdict.mjs "$label" "$out" "$rc" "$err" 2>&1)
  vrc=$?
  set -e
  if [ "$vrc" -eq 0 ]; then
    echo "  PASS  $label"
    PASSED="$PASSED $label"
  else
    echo "::error::probe FAIL: ${label} -- ${msg}"
    FAILED="$FAILED $label"
  fi
}

# Positive-control legs sit next to the probe they calibrate. narrow-overflow and ad-reflow both pass
# on "nothing moved" and neither reports a calibration of its own, so each is run twice: once clean,
# once with its detector handed something it MUST see. category-pop and home-direction-c inject their
# own overflow and report it in `calibration`, checked above -- they need no second leg.
probe narrow-overflow          narrow-overflow-probe.mjs          "$CDP_A"
probe narrow-overflow-control  narrow-overflow-probe.mjs          "$CDP_A" BREAK_GUARD=1 LONG_TOKEN=Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaftschaferswes
probe ad-reflow                ad-reflow-first-list-load-probe.mjs "$CDP_A"
probe ad-reflow-control        ad-reflow-first-list-load-probe.mjs "$CDP_A" BREAK_GUARD=1
probe category-pop             category-pop-probe.mjs              "$CDP_A"
probe home-direction-c-normal  home-direction-c-probe.mjs          "$CDP_A"
probe home-direction-c-reduced home-direction-c-probe.mjs          "$CDP_B"
probe mount-failed-network     mount-failed-network-probe.mjs      "$CDP_A"
probe stick-tap-target         stick-tap-target-probe.mjs          "$CDP_A"
probe wheel-pointer-name       wheel-pointer-name-probe.mjs        "$CDP_A"
# The next three pass on "nothing happened" too (no anchor in #stage, no live button in a closed
# dialog, no early tap getting through), so each gets its own BREAK_GUARD control leg. Their clean
# predicates read only what each probe MEASURED -- see the per-label notes in ci-probes-verdict.mjs,
# including why no-nav-in-stage claim 2 is deliberately not gated.
probe no-nav-in-stage           no-nav-in-stage-probe.mjs           "$CDP_A"
probe no-nav-in-stage-control   no-nav-in-stage-probe.mjs           "$CDP_A" BREAK_GUARD=1
probe leave-confirm             leave-confirm-probe.mjs             "$CDP_A"
probe leave-confirm-control     leave-confirm-probe.mjs             "$CDP_A" BREAK_GUARD=1
probe arm-gate                  arm-gate-probe.mjs                  "$CDP_A"
probe arm-gate-control          arm-gate-probe.mjs                  "$CDP_A" BREAK_GUARD=1

# --- standalone legs -----------------------------------------------------------------------------
# These two probes orchestrate their own driver.mjs run and judge their own measurements (exit
# non-zero on a red) — but they serve NOTHING: their standalone entry expects a server and a Chrome
# to already exist (their headers say "serve dist/ ... first"), so each leg is pointed at THIS
# script's server and Chrome A via the BASE/CDP_PORT env vars both probes honor. Their default
# 4455/9455 and 4580/9580 ports are for manual runs only and are never bound here.
# Each ships its calibration as a BREAK_* control leg, judged the same way as the probe() controls:
# a control that cannot make its own detector red fails the leg. They run here, behind this bash
# wrapper, because control-floor-probe.mjs carries no --selftest by design (its calibration IS the
# control leg) and the meta-gate audits node-invoked steps only.
standalone() { # label, command...
  label="$1"; shift
  LEGS=$((LEGS + 1))
  echo "probe: $label (standalone)"
  ( "$@" ) > "$OUT_DIR/$label.log" 2>&1 &
  pid=$!
  ( sleep "$LEG_TIMEOUT"; kill -9 "$pid" 2> /dev/null ) &
  watchdog=$!
  set +e
  wait "$pid"
  rc=$?
  set -e
  { kill "$watchdog" && wait "$watchdog"; } 2> /dev/null || true
  if [ "$rc" -eq 0 ]; then
    echo "  PASS  $label"
    PASSED="$PASSED $label"
  else
    echo "::error::probe FAIL: ${label} -- exit ${rc}: $(tail -n 3 "$OUT_DIR/$label.log" | tr '\n' ' ')"
    FAILED="$FAILED $label"
  fi
}
standalone live-region-floor         env BASE="$SITE" CDP_PORT="$CDP_A" node scripts/live-region-floor-probe.mjs
standalone live-region-floor-control env BASE="$SITE" CDP_PORT="$CDP_A" BREAK_GUARD=1 node scripts/live-region-floor-probe.mjs
standalone control-floor             env BASE="$SITE" CDP_PORT="$CDP_A" node scripts/control-floor-probe.mjs
standalone control-floor-control     env BASE="$SITE" CDP_PORT="$CDP_A" BREAK_FLOOR=1 node scripts/control-floor-probe.mjs

if [ -n "$FAILED" ]; then
  echo "::error::ci-probes: failing probe leg(s):${FAILED}"
  echo "ci-probes: output kept in ${OUT_DIR}"
  exit 1
fi
# Every number and every name here comes from the legs actually run: the parenthetical that used to
# describe the set ("7 probes + 2 positive controls + ...") was a literal, and this repo has shipped a
# gate whose success line printed a number from a different expression than the thing it measured.
echo "ci-probes: ${LEGS} leg(s) passed:${PASSED}"
