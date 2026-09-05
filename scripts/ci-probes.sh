#!/usr/bin/env bash
# The 7 CI-worthy browser probes (docs/verification/probe-triage-2026-08-26.md, "What's actually
# trustworthy right now"), run in PARALLEL LANES (four, plus one per play-screen-fit shard after the
# first -- see FIT_SHARDS) against the ALREADY-BUILT dist/ -- this script
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
# Exit: 0 only if every probe leg passes AND exactly EXPECTED_LEGS legs report AND the play-screen-fit
# shards between them walked every play route, on the clean side and on the control side separately. Any
# failing leg prints `::error::probe FAIL: <label>` with a reason, and the final lines list every failed
# label. The three conditions are independent on purpose: a leg's exit code cannot see a shard that was
# never scheduled, and EXPECTED_LEGS cannot see a route that no shard owns.
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
# --- the play-screen-fit shard count, and THE ONE LINE TO EDIT if this ever needs backing out ------
# The fit walk is split across FIT_SHARDS legs by route (a stride over the manifest ids, in
# scripts/play-screen-fit-probe.mjs's playRoutes). Shard 0 rides lane3; every other shard gets a lane and
# a Chrome of its own from FIT_LANE_CDPS below, so lowering this number is a one-line change here (plus
# re-pinning EXPECTED_LEGS, which is pinned and never counted, by 2 legs per shard).
# WHY IT COULD NEED LOWERING, stated because it is the real risk of this split and not a hypothetical:
# each shard adds a Chrome to a 4-vCPU runner, and this probe measures a SELF-TIMED screen — roughly 57%
# of the control leg's wall time is timer waits rather than CPU, which is what makes the extra Chromes
# affordable, but a runner under CPU pressure delivers those timers late. If a real CI run shows a fit row
# flipping to NEVER LEFT THE FRESH SCREEN, or a row changing which press is its worst screen, the answer
# is FEWER SHARDS, not more Chromes: the rows are the measurement and the lane packing is not.
FIT_SHARDS=3
FIT_LANE_CDPS="${PROBE_CDP_FIT_PORTS:-9349 9350}"
# driver.mjs's nav() waits on Page.loadEventFired with NO timeout -- a URL that never fires load hangs
# forever, and in CI that burns the whole job budget instead of failing. Per-leg watchdog below.
# ponytail: one flat timeout for every leg; narrow-overflow is the long one (22 screens — 5 games at
# two rosters each, 4 tools at three). Re-count this when a page is added or delisted; the number is
# pinned for real in ci-probes-verdict.mjs, and this comment is only a hint about which leg is slowest.
LEG_TIMEOUT="${PROBE_TIMEOUT:-600}"
OUT_DIR="${PROBE_OUT_DIR:-$(mktemp -d /tmp/ci-probes.XXXXXX)}"
SITE="http://localhost:${PORT}"
mkdir -p "$OUT_DIR"
# The ports actually taken: one per fit shard BEYOND shard 0, which rides lane3's Chrome. Derived, so
# lowering FIT_SHARDS also stops the port being bound and the Chrome being launched -- an unused Chrome
# would still be competing for the runner's CPU with the legs that matter.
FIT_ACTIVE_CDPS=""
n_fit=1
for cdp in $FIT_LANE_CDPS; do
  if [ "$n_fit" -lt "$FIT_SHARDS" ]; then FIT_ACTIVE_CDPS="$FIT_ACTIVE_CDPS $cdp"; n_fit=$((n_fit + 1)); fi
done
if [ "$n_fit" -ne "$FIT_SHARDS" ]; then
  echo "::error::FIT_SHARDS=${FIT_SHARDS} needs $((FIT_SHARDS - 1)) port(s) in FIT_LANE_CDPS but only got: ${FIT_LANE_CDPS}. Add a port or lower FIT_SHARDS -- a shard with no lane would silently not run."
  exit 1
fi
# Pinned, not counted from what ran: a lane is a background subshell, and a lane that dies mid-run
# (errexit, an OOM-killed Chrome) would otherwise read as FEWER GREENS and still exit 0 -- the exact
# silent-skip shape docs/agents/ci-verification.md exists to kill. Re-record this number in the same
# commit that adds or removes a leg. It is no longer one grep: fit_pair is written once and CALLED once
# per shard, so the count is the 18 probe/standalone lines outside fit_pair plus 2 x FIT_SHARDS
# (grep -cE '^  (probe|standalone) ' returns 20 -- the two lines inside fit_pair, counted once each).
# gh#179, 18 -> 20: play-screen-fit and its play-screen-fit-control joined lane3.
# 20 -> 24: the fit pair became FIT_SHARDS pairs (2 legs per shard, labels suffixed with the shard index)
# so the walk could be split across lanes. This number is a HUMAN-MAINTAINED pin and is blind to the one
# failure the split introduces -- a route added to the manifest and to no shard keeps the leg count at 24
# while going unwalked -- so it is NOT what proves coverage. The FIT_SHARD_WALKED union check in the
# aggregate block below is.
EXPECTED_LEGS=24

# --- preconditions -----------------------------------------------------------------------------
if [ ! -f dist/index.html ]; then
  echo "::error::dist/index.html not found -- this script probes an existing build and must never make one. Run it after the Build step."
  exit 1
fi

for p in "$PORT" "$CDP_1" "$CDP_2" "$CDP_3" "$CDP_4" "$CDP_B" $FIT_ACTIVE_CDPS; do
  # A port already LISTENing before this script starts belongs to some other process -- probing it
  # would report a green for someone else's (possibly stale) dist/ or browser profile.
  if (exec 3<>"/dev/tcp/localhost/${p}") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "::error::Port ${p} is already in use before this script started -- refusing to probe a foreign server/browser. Set PROBE_PORT / PROBE_CDP_PORT / PROBE_CDP_PORT_2..4 / PROBE_CDP_REDUCED_PORT / PROBE_CDP_FIT_PORTS."
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
for cdp in "$CDP_1" "$CDP_2" "$CDP_3" "$CDP_4" $FIT_ACTIVE_CDPS; do
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
for cdp in "$CDP_1" "$CDP_2" "$CDP_3" "$CDP_4" $FIT_ACTIVE_CDPS; do
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
  leg_t0=$(date +%s)
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
  # gh#202 follow-up: per-leg wall time, machine-readable. Rebalancing lanes by eye does not work --
  # the only per-lane figure anyone had was measured on one Mac on one day, and a rebalance proposed
  # from leg COUNTS was wrong twice over (lane1's two legs each walk every route, and the fit pair
  # must stay together or its control sees a different browser). Grep LEG_SECONDS out of a CI run
  # before moving anything.
  leg_el=$(( $(date +%s) - leg_t0 ))
  echo "LEG_SECONDS $LANE $label $leg_el"
  if [ "$vrc" -eq 0 ]; then
    echo "  PASS  $label (${leg_el}s)"
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
  leg_t0=$(date +%s)
  ( "$@" ) > "$OUT_DIR/$label.log" 2>&1 &
  pid=$!
  ( sleep "$LEG_TIMEOUT"; kill -9 "$pid" 2> /dev/null ) &
  watchdog=$!
  set +e
  wait "$pid"
  rc=$?
  set -e
  { kill "$watchdog" && wait "$watchdog"; } 2> /dev/null || true
  leg_el=$(( $(date +%s) - leg_t0 ))
  echo "LEG_SECONDS $LANE $label $leg_el"
  if [ "$rc" -eq 0 ]; then
    echo "  PASS  $label (${leg_el}s)"
    # A green leg's log is otherwise swallowed; surface its warnings as job annotations (gh#182: the
    # fit probe reports px drift on KNOWN_OVERFLOW rows this way and never reds on it).
    grep -E '^::(warning|notice)::' "$OUT_DIR/$label.log" || true
    echo "$label" >> "$OUT_DIR/$LANE.pass"
  else
    # ERRORS FIRST, then the tail. gh#202 lost an hour to this line: a tail of 3 on a failing fit
    # probe returned three ::warning:: lines and NO ::error::, so the CI log said the leg failed and
    # showed nothing that could have caused it -- the real reason was only in the uploaded artifact.
    # A failing leg's error lines are the one thing that must never need a download to read.
    echo "::error::probe FAIL: ${label} -- exit ${rc}: $(grep -h '^::error::' "$OUT_DIR/$label.log" 2>/dev/null | head -n 5 | tr '\n' ' ')$(tail -n 3 "$OUT_DIR/$label.log" | tr '\n' ' ')"
    echo "$label" >> "$OUT_DIR/$LANE.fail"
  fi
}

# --- the lanes -----------------------------------------------------------------------------------
# Packed from the per-leg times measured on the 2026-08-29 sequential CI run, so the lanes finish
# together instead of one dragging: lane1 199s · lane2 186s · lane3 167s · lane4 163s. THAT PACKING WENT
# OUT OF BALANCE at gh#179, when lane3 took the play-screen-fit pair (~704s measured locally) and became
# the critical lane on its own; the pair is now split by ROUTE across FIT_SHARDS lanes, which cuts that
# walk to roughly one third. Re-pack from a real CI run's per-leg times, not from these.  A probe and
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
  # gh#184's rendered half is NOT wired here yet, and the reason is the whole point.
  # scripts/strip-chip-visibility-probe.mjs exists, is calibrated, and its clean/control predicates are
  # already written in ci-probes-verdict.mjs -- but its "naked cut" test demands the gradient cover the
  # ENTIRE visible sliver of a clipped chip, and a chip's width is Thai font metrics on whatever machine
  # is rendering. The reaches it green-lights were measured on one Mac. That is precisely the gh#202
  # trap, where a row read 0px locally and 75px on the runner, and the repo's own rule from it is to
  # diff a CI artifact against a local run before gating any measured number. Wiring it now would gate a
  # number two machines have not been shown to agree on.
  # What it needs first: .strip-chip has no max width (flex: 0 0 auto), so the sliver is unbounded and
  # belongs to a set we do not own. Cap the chip, then size the fade to the cap, and both sides are ours
  # -- see the follow-up ticket. Until then this runs by hand, and the shipped guard for the band is the
  # counter's unit test plus each route's own behavioural test.
}
lane3() {
  LANE=lane3
  probe no-nav-in-stage           no-nav-in-stage-probe.mjs           "$CDP_3"
  probe no-nav-in-stage-control   no-nav-in-stage-probe.mjs           "$CDP_3" BREAK_GUARD=1
  probe leave-confirm             leave-confirm-probe.mjs             "$CDP_3"
  probe leave-confirm-control     leave-confirm-probe.mjs             "$CDP_3" BREAK_GUARD=1
  probe category-pop              category-pop-probe.mjs              "$CDP_3"
  # gh#179 — the first leg that walks a play route PAST its setup screen. Standalone: it aggregates
  # its own per-row verdict and exits non-zero, like control-floor, so it needs no predicate in
  # ci-probes-verdict.mjs. What it GATES is the walk (a route whose walk stayed on setup) plus the
  # FITS_ROWS regression pin; the scroll and width-fill numbers it prints are a REPORT that
  # gh#180/#181/#182/#183 act on, deliberately not a threshold. Its control leg makes the walk stand
  # still and requires every row to report it never left setup.
  # MEASURED on this machine, 2026-08-31: 324s clean + 380s control = 704s for the WHOLE walk, which
  # made lane3 the critical lane on its own (it was 167s). It is now split by route across FIT_SHARDS
  # lanes; lane3 keeps its five short legs plus shard 0, and fit_lane below carries the rest.
  fit_pair 0 "$CDP_3"
}
# One shard's two legs, ALWAYS ADJACENT AND ALWAYS ON ONE CDP PORT. The pair is what may never be split:
# the control exists to show this probe's own detector failing in the same browser the clean leg used, and
# a second Chrome is a second environment, so a control run there calibrates nothing. Splitting by ROUTE
# is a different cut and is safe -- each shard is a complete clean-vs-control pair over the routes it owns.
fit_pair() { # shard-index, cdp-port
  standalone "play-screen-fit-$1"         env BASE="$SITE" CDP_PORT="$2" FIT_SHARD="$1" FIT_SHARDS="$FIT_SHARDS" node scripts/play-screen-fit-probe.mjs
  standalone "play-screen-fit-control-$1" env BASE="$SITE" CDP_PORT="$2" FIT_SHARD="$1" FIT_SHARDS="$FIT_SHARDS" BREAK_WALK=1 node scripts/play-screen-fit-probe.mjs
}
# A lane that is nothing but one shard's pair. Generic rather than lane5()/lane6() so FIT_SHARDS stays the
# only number: a shard with no lane function would simply not run, and this file must not have a way to
# lose a shard quietly.
fit_lane() { # shard-index, cdp-port, lane-name
  LANE="$3"
  fit_pair "$1" "$2"
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

N_LANES=$((4 + FIT_SHARDS - 1))
# The union check below harvests FIT_SHARD_WALKED lines by globbing this directory. OUT_DIR is a fresh
# mktemp on CI but is REUSED whenever PROBE_OUT_DIR is set, which is how it is run locally -- and a
# leftover play-screen-fit-2.log from an earlier run would satisfy the union for a shard that no longer
# runs at all. That is exactly the "deleted from the lane list" case the union exists to catch, so the
# stale file has to go before the lanes start rather than being reasoned about afterwards.
rm -f "$OUT_DIR"/play-screen-fit*.log

echo "ci-probes: ${N_LANES} lanes launched -- per-lane output prints when each lane's log is collected below"
LANE_PIDS=""
lane1 > "$OUT_DIR/lane1.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
lane2 > "$OUT_DIR/lane2.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
lane3 > "$OUT_DIR/lane3.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
lane4 > "$OUT_DIR/lane4.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
# One lane per fit shard after shard 0, numbered on from lane4 so the lane?.pass/lane?.fail glob and the
# per-lane log dump below keep working without a second naming scheme.
fit_shard=1
for cdp in $FIT_ACTIVE_CDPS; do
  ln="lane$((4 + fit_shard))"
  fit_lane "$fit_shard" "$cdp" "$ln" > "$OUT_DIR/$ln.log" 2>&1 & LANE_PIDS="$LANE_PIDS $!"
  fit_shard=$((fit_shard + 1))
done
set +e
for p in $LANE_PIDS; do wait "$p"; done
set -e

for n in $(seq 1 "$N_LANES"); do
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
# --- fit-shard COVERAGE, and why EXPECTED_LEGS is not it -----------------------------------------
# Splitting the fit walk across lanes buys wall clock and costs the one thing a single leg had for free:
# nobody had to ask whether every route was walked. So it is asked here, and it is asked of the RUN rather
# than of this file's own leg list. Each fit leg prints one FIT_SHARD_WALKED line on its success path
# naming the ids it really produced rows for; the clean legs' union and the control legs' union must EACH
# equal the manifest exactly. A shard that was killed, never scheduled, deleted from the lane list, or
# handed a stride that skips an id writes no line for those ids and the union comes up short.
# THIS IS NOT WHAT EXPECTED_LEGS CHECKS. That number is human-maintained and counts invocations: a route
# added to the manifest and to no shard leaves it at 24 and green. The manifest is read here from the
# probe's own playRoutes with every narrowing knob unset, so the expected set cannot be a stale literal.
FIT_EXPECT="$OUT_DIR/fit-manifest.ids"
env -u FIT_SHARD -u FIT_SHARDS -u ROUTES_ONLY node --input-type=module \
  -e 'import { playRoutes } from "./scripts/play-screen-fit-probe.mjs"; console.log(playRoutes().join("\n"));' \
  | sort > "$FIT_EXPECT"
if [ ! -s "$FIT_EXPECT" ]; then
  # An empty expected set would make every union match. A comparison that cannot fail is not a check.
  echo "::error::ci-probes: could not derive the play-route list from scripts/play-screen-fit-probe.mjs -- refusing to compare the fit shards against an empty set."
  exit 1
fi
for leg in clean control; do
  got="$OUT_DIR/fit-walked-$leg.ids"
  grep -h "^FIT_SHARD_WALKED $leg " "$OUT_DIR"/play-screen-fit*.log 2>/dev/null \
    | sed 's/^.*routes=//' | tr ',' '\n' | grep . | sort -u > "$got"
  if ! cmp -s "$FIT_EXPECT" "$got"; then
    echo "::error::ci-probes: the ${leg} play-screen-fit shards did not between them walk every play route. MISSING: $(comm -23 "$FIT_EXPECT" "$got" | tr '\n' ' ')UNEXPECTED: $(comm -13 "$FIT_EXPECT" "$got" | tr '\n' ' ')-- a shard reported no FIT_SHARD_WALKED line, so it never ran or never passed. Logs in ${OUT_DIR}"
    exit 1
  fi
done
echo "ci-probes: play-screen-fit shards walked every play route on both the clean and the control side ($(grep -c . "$FIT_EXPECT") route(s), FIT_SHARDS=${FIT_SHARDS})"

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
