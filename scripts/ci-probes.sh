#!/usr/bin/env bash
# The 7 CI-worthy browser probes (docs/verification/probe-triage-2026-08-26.md, "What's actually
# trustworthy right now"), run in FOUR PARALLEL LANES against the ALREADY-BUILT dist/ -- this script
# never runs a build. It is meant to be called as a late step in ci.yml's single `build` job, after
# the Build step, because a probe that measures a freshly regenerated dist/ is not measuring the
# bytes that get deployed (the standing no-post-Build-rebuild invariant in .github/workflows/ci.yml).
#
# Why lanes: measured on CI run 2026-08-29 (main), the sequential pass took 723s and the whole job
# 14.4 min -- 84% of the job was this step. Legs are independent (each drives its own tab against a
# read-only static server), so they are packed into 4 lanes by those measured times; the longest
# lane (arm-gate + its control) is ~200s. Legs WITHIN a lane still run one at a time, and every
# lane gets its OWN Chrome instance -- per docs/runbook.md "Two headless probes at once attach to
# each other's browser", two drivers sharing one CDP port silently measure each other's state. The
# static server is shared on purpose: that hazard lives in the browser, not in `serve`.
#
# Exit: 0 only if every probe leg passes AND exactly EXPECTED_LEGS legs report. Any failing leg
# prints `::error::probe FAIL: <label>` with a reason, and the final lines list every failed label.
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
CDP_1="${PROBE_CDP_PORT:-9344}"
CDP_B="${PROBE_CDP_REDUCED_PORT:-9345}"
CDP_2="${PROBE_CDP_PORT_2:-9346}"
CDP_3="${PROBE_CDP_PORT_3:-9347}"
CDP_4="${PROBE_CDP_PORT_4:-9348}"
# driver.mjs's nav() waits on Page.loadEventFired with NO timeout -- a URL that never fires load hangs
# forever, and in CI that burns the whole job budget instead of failing. Per-leg watchdog below.
# ponytail: one flat timeout for every leg; narrow-overflow is the long one (22 screens — 5 games at
# two rosters each, 4 tools at three). Re-count this when a page is added or delisted; the number is
# pinned for real in ci-probes-verdict.mjs, and this comment is only a hint about which leg is slowest.
LEG_TIMEOUT="${PROBE_TIMEOUT:-600}"
OUT_DIR="${PROBE_OUT_DIR:-$(mktemp -d /tmp/ci-probes.XXXXXX)}"
SITE="http://localhost:${PORT}"
mkdir -p "$OUT_DIR"
# Pinned, not counted from what ran: a lane is a background subshell, and a lane that dies mid-run
# (errexit, an OOM-killed Chrome) would otherwise read as FEWER GREENS and still exit 0 -- the exact
# silent-skip shape docs/agents/ci-verification.md exists to kill. 18 = the probe/standalone
# invocations in the lanes below (grep -cE '^  (probe|standalone) ' agrees); re-record this number
# in the same commit that adds or removes a leg.
EXPECTED_LEGS=18

# --- preconditions -----------------------------------------------------------------------------
if [ ! -f dist/index.html ]; then
  echo "::error::dist/index.html not found -- this script probes an existing build and must never make one. Run it after the Build step."
  exit 1
fi

for p in "$PORT" "$CDP_1" "$CDP_2" "$CDP_3" "$CDP_4" "$CDP_B"; do
  # A port already LISTENing before this script starts belongs to some other process -- probing it
  # would report a green for someone else's (possibly stale) dist/ or browser profile.
  if (exec 3<>"/dev/tcp/localhost/${p}") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "::error::Port ${p} is already in use before this script started -- refusing to probe a foreign server/browser. Set PROBE_PORT / PROBE_CDP_PORT / PROBE_CDP_PORT_2..4 / PROBE_CDP_REDUCED_PORT."
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

# --- serve + five browsers ---------------------------------------------------------------------
# One normal Chrome per lane (CDP_1..CDP_4) so no two concurrent legs ever share a browser. Chrome B
# exists only for home-direction-c-probe.mjs's reduced-motion leg: prefers-reduced-motion is a launch
# flag, not something CDP can toggle per tab, and that probe's own header prescribes two instances.
# Both legs of that probe run, or its motion criterion is never checked at all. Chrome B is driven
# only from lane four, so it is never shared either.
npx serve@14 dist/ -l "$PORT" > "$OUT_DIR/serve.log" 2>&1 &
KILL_PIDS="$!"
for cdp in "$CDP_1" "$CDP_2" "$CDP_3" "$CDP_4"; do
  "$CHROME" --headless --disable-gpu --no-sandbox --remote-debugging-port="$cdp" \
    --user-data-dir="$OUT_DIR/prof-$cdp" > /dev/null 2>&1 &
  KILL_PIDS="$KILL_PIDS $!"
done
"$CHROME" --headless --disable-gpu --no-sandbox --force-prefers-reduced-motion \
  --remote-debugging-port="$CDP_B" --user-data-dir="$OUT_DIR/prof-b" > /dev/null 2>&1 &
KILL_PIDS="$KILL_PIDS $!"
# Unconditional teardown on every exit path, so a failure never leaves an orphan holding a port for
# the next run to falsely pass against.
trap 'kill $KILL_PIDS 2>/dev/null || true' EXIT

wait_ready() { # url, label
  for _ in $(seq 1 30); do
    if curl -sf "$1" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "::error::$2 did not become ready within 30s"
  exit 1
}
wait_ready "${SITE}/" "server on ${PORT}"
for cdp in "$CDP_1" "$CDP_2" "$CDP_3" "$CDP_4"; do
  wait_ready "http://127.0.0.1:${cdp}/json/version" "Chrome on ${cdp}"
done
wait_ready "http://127.0.0.1:${CDP_B}/json/version" "Chrome B (reduced motion) on ${CDP_B}"

# --- the verdicts ------------------------------------------------------------------------------
# driver.mjs exits 0 for any probe that returns SOMETHING -- a probe's own PASS/FAIL lives in its JSON
# and nothing read it before this file existed. One predicate per leg, keyed by label. Every predicate
# also asserts liveness (the run really visited N pages / really fired its trigger), because each of
# these probes reports its clean state as a zero or an empty list.
# The verdict table lives in scripts/ci-probes-verdict.mjs (see its header for why it is not a
# heredoc: macOS bash 3.2 cannot parse an apostrophe inside a heredoc nested in $( )).

# --- the run -----------------------------------------------------------------------------------
# probe()/standalone() run inside lane subshells, so shell variables cannot carry results back to
# the parent -- each leg appends its label to $LANE.pass or $LANE.fail instead, and the parent
# aggregates from those files after the lanes join. LANE is set at the top of each lane function.
probe() { # label, probe-file, cdp-port, [extra VAR=val ...]
  label="$1"; file="$2"; cdp="$3"; shift 3
  out="$OUT_DIR/$label.json"
  err="$OUT_DIR/$label.err"
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
    echo "$label" >> "$OUT_DIR/$LANE.pass"
  else
    echo "::error::probe FAIL: ${label} -- ${msg}"
    echo "$label" >> "$OUT_DIR/$LANE.fail"
  fi
}

# These two probes orchestrate their own driver.mjs run and judge their own measurements (exit
# non-zero on a red) — but they serve NOTHING: their standalone entry expects a server and a Chrome
# to already exist (their headers say "serve dist/ ... first"), so each leg is pointed at THIS
# script's server and its lane's Chrome via the BASE/CDP_PORT env vars both probes honor. Their
# default 4455/9455 and 4580/9580 ports are for manual runs only and are never bound here.
# Each ships its calibration as a BREAK_* control leg, judged the same way as the probe() controls:
# a control that cannot make its own detector red fails the leg. They run here, behind this bash
# wrapper, because control-floor-probe.mjs carries no --selftest by design (its calibration IS the
# control leg) and the meta-gate audits node-invoked steps only.
standalone() { # label, command...
  label="$1"; shift
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
    echo "$label" >> "$OUT_DIR/$LANE.pass"
  else
    echo "::error::probe FAIL: ${label} -- exit ${rc}: $(tail -n 3 "$OUT_DIR/$label.log" | tr '\n' ' ')"
    echo "$label" >> "$OUT_DIR/$LANE.fail"
  fi
}

# --- the lanes -----------------------------------------------------------------------------------
# Packed from the per-leg times measured on the 2026-08-29 sequential CI run, so the lanes finish
# together instead of one dragging: lane1 199s · lane2 186s · lane3 167s · lane4 163s. A probe and
# its positive control always share a lane -- the control exists to calibrate that probe's detector
# in the same environment, and splitting the pair would let them see different browsers.
#
# Positive-control legs sit next to the probe they calibrate. narrow-overflow and ad-reflow both pass
# on "nothing moved" and neither reports a calibration of its own, so each is run twice: once clean,
# once with its detector handed something it MUST see. category-pop and home-direction-c inject their
# own overflow and report it in `calibration`, checked above -- they need no second leg.
# no-nav-in-stage, leave-confirm and arm-gate pass on "nothing happened" too (no anchor in #stage, no
# live button in a closed dialog, no early tap getting through), so each gets its own BREAK_GUARD
# control leg. Their clean predicates read only what each probe MEASURED -- see the per-label notes
# in ci-probes-verdict.mjs, including why no-nav-in-stage claim 2 is deliberately not gated.
# gh#149 — LANE 1 IS GONE, and with it four legs (20 -> 16): arm-gate + arm-gate-control (lane1),
# stick-tap-target and mount-failed-network (lane4). Every one of them drove a /game/<id>/ landing
# page that ADR-0050 ruling 2 deleted, and none of their subjects survived the move: the arm-gate
# scenarios were short-stick's and timebomb's stage screens, stick-tap-target measured short-stick's
# stick row, and mount-failed-network exercised src/pages/game/[id].astro's panel-restore path, which
# only a party page could reach. THIS IS A COVERAGE LOSS, not a relocation — ADR-0050 ruling 3 still
# promises every game a double-tap-guarded X control, and nothing in this file measures it today.
# The successors exist and are NOT wired: scripts/play-exit-probe.mjs and
# scripts/play-exit-guard-probe.mjs already walk every play route derived from the manifest, but both
# are standalone tools that print JSON and exit 0 unconditionally, so each needs a verdict predicate
# in scripts/ci-probes-verdict.mjs before it can gate anything. That is the change that puts these
# four legs back; adding a page id to a probe list cannot.
# THAT CHANGE IS lane1 BELOW (16 -> 18 legs). Both probes now aggregate their own per-route pass flags
# and exit non-zero, so they need no verdict predicate here -- they are standalone() legs like
# control-floor, judged on their own exit code. Coverage is NOT identical to the four retired legs: the
# X guard is measured again on every play route, the deleted landing pages' own DOM is not.
lane1() {
  LANE=lane1
  # Positional args, not env: both probes read <cdpPort> <shotDir> from argv (their headers document
  # a manual `node scripts/... 9222 /tmp` call). BASE is the only env they take, and *-FAIL.png
  # screenshots land in $OUT_DIR next to the leg logs.
  standalone play-exit       env BASE="$SITE" node scripts/play-exit-probe.mjs       "$CDP_1" "$OUT_DIR" ci
  standalone play-exit-guard env BASE="$SITE" node scripts/play-exit-guard-probe.mjs "$CDP_1" "$OUT_DIR"
}
lane2() {
  LANE=lane2
  probe narrow-overflow          narrow-overflow-probe.mjs          "$CDP_2"
  probe narrow-overflow-control  narrow-overflow-probe.mjs          "$CDP_2" BREAK_GUARD=1 LONG_TOKEN=Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaftschaferswes
  probe ad-reflow                ad-reflow-first-list-load-probe.mjs "$CDP_2"
  probe ad-reflow-control        ad-reflow-first-list-load-probe.mjs "$CDP_2" BREAK_GUARD=1
}
lane3() {
  LANE=lane3
  probe no-nav-in-stage           no-nav-in-stage-probe.mjs           "$CDP_3"
  probe no-nav-in-stage-control   no-nav-in-stage-probe.mjs           "$CDP_3" BREAK_GUARD=1
  probe leave-confirm             leave-confirm-probe.mjs             "$CDP_3"
  probe leave-confirm-control     leave-confirm-probe.mjs             "$CDP_3" BREAK_GUARD=1
  probe category-pop              category-pop-probe.mjs              "$CDP_3"
}
lane4() {
  LANE=lane4
  probe wheel-pointer-name        wheel-pointer-name-probe.mjs        "$CDP_4"
  probe home-direction-c-normal   home-direction-c-probe.mjs          "$CDP_4"
  probe home-direction-c-reduced  home-direction-c-probe.mjs          "$CDP_B"
  standalone live-region-floor         env BASE="$SITE" CDP_PORT="$CDP_4" node scripts/live-region-floor-probe.mjs
  standalone live-region-floor-control env BASE="$SITE" CDP_PORT="$CDP_4" BREAK_GUARD=1 node scripts/live-region-floor-probe.mjs
  standalone control-floor             env BASE="$SITE" CDP_PORT="$CDP_4" node scripts/control-floor-probe.mjs
  standalone control-floor-control     env BASE="$SITE" CDP_PORT="$CDP_4" BREAK_FLOOR=1 node scripts/control-floor-probe.mjs
}

echo "ci-probes: 4 lanes launched -- per-lane output prints when each lane's log is collected below"
LANE_PIDS=""
lane1 > "$OUT_DIR/lane1.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
lane2 > "$OUT_DIR/lane2.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
lane3 > "$OUT_DIR/lane3.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
lane4 > "$OUT_DIR/lane4.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
set +e
for p in $LANE_PIDS; do wait "$p"; done
set -e

for n in 1 2 3 4; do
  echo "--- lane$n ---"
  cat "$OUT_DIR/lane$n.log" 2>/dev/null || echo "(lane$n produced no log)"
done

# --- aggregate ---------------------------------------------------------------------------------
PASS_LABELS=$(cat "$OUT_DIR"/lane?.pass 2>/dev/null || true)
FAIL_LABELS=$(cat "$OUT_DIR"/lane?.fail 2>/dev/null || true)
N_PASS=$(printf '%s\n' "$PASS_LABELS" | grep -c . || true)
N_FAIL=$(printf '%s\n' "$FAIL_LABELS" | grep -c . || true)
LEGS=$((N_PASS + N_FAIL))

if [ -n "$FAIL_LABELS" ]; then
  echo "::error::ci-probes: failing probe leg(s): $(echo $FAIL_LABELS)"
  echo "ci-probes: output kept in ${OUT_DIR}"
  exit 1
fi
if [ "$LEGS" -ne "$EXPECTED_LEGS" ]; then
  # Fewer (or more) legs than pinned means a lane died before finishing its list, or a leg wrote no
  # verdict -- a green with missing legs is a silent skip, and this repo treats those as red.
  echo "::error::ci-probes: ${LEGS} leg(s) reported but ${EXPECTED_LEGS} are pinned -- a lane died mid-run. Logs in ${OUT_DIR}"
  exit 1
fi
# Every number and every name here comes from the legs actually run: the parenthetical that used to
# describe the set ("7 probes + 2 positive controls + ...") was a literal, and this repo has shipped a
# gate whose success line printed a number from a different expression than the thing it measured.
echo "ci-probes: ${LEGS} leg(s) passed: $(echo $PASS_LABELS)"
