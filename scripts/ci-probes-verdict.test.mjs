// node --test — no framework. Spawns the real CLI (it reads argv/exits, nothing exported) with a
// synthetic summary and reads its printed verdict line. One invariant:
//
//   1. When a leg count comes up short, the verdict must name WHY (summary.scenarioErrors), not
//      just report the count. `arm-gate` already did this (line ~180); `arm-gate-control` checked
//      the count and stopped, throwing away the recorded scenarioError -- exactly the failure a
//      lost leg in CI is unattributable from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, 'ci-probes-verdict.mjs');

function runVerdict(label, summary) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-probes-verdict-test-'));
  const outFile = join(dir, 'out.json');
  const errFile = join(dir, 'err.log');
  writeFileSync(outFile, JSON.stringify({ summary }));
  writeFileSync(errFile, '');
  return spawnSync(process.execPath, [scriptPath, label, outFile, '0', errFile], { encoding: 'utf8' });
}

// strip-chip-visibility reports checked/bad/minSlackPx at the TOP level of its JSON, not nested under
// `summary` like the probes above -- a raw variant of runVerdict rather than reusing the wrapped one.
function runVerdictRaw(label, obj) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-probes-verdict-test-'));
  const outFile = join(dir, 'out.json');
  const errFile = join(dir, 'err.log');
  writeFileSync(outFile, JSON.stringify(obj));
  writeFileSync(errFile, '');
  return spawnSync(process.execPath, [scriptPath, label, outFile, '0', errFile], { encoding: 'utf8' });
}

test('arm-gate-control names the scenarioError when a leg is lost, not just the count', () => {
  const summary = {
    breakGuard: true,
    totalGapTests: 11,
    scenarioErrors: ['short-stick loser=2: page crashed mid-loop'],
    failing: [],
    suppressionLegs: 9,
    suppressionLegsRed: 9,
  };
  const res = runVerdict('arm-gate-control', summary);
  assert.equal(res.status, 1, `expected the leg-count mismatch to fail the control: ${res.stdout}`);
  assert.match(
    res.stdout,
    /short-stick loser=2: page crashed mid-loop/,
    `verdict must surface the recorded scenarioError, got: ${res.stdout}`
  );
});

// gh#210: the SUMMARY_FIELDS marker line ci-probes.sh's probe() turns into `LEG_SUMMARY <lane> <label>
// checked=N bad=N minSlack=Xpx`. Must print on BOTH the pass path and the fail path (a line that only
// ever showed up on FAIL was the bug this exists to catch -- it vanished on exactly the green runs
// anyone reads), and the two runs below must not print the SAME line, or the field is decorative.
test('strip-chip-visibility prints a SUMMARY_FIELDS line that changes between a clean and a bad run', () => {
  const clean = runVerdictRaw('strip-chip-visibility', {
    control: false, breakReach: false, seededName: 'x', checked: 9, bad: 0, minSlackPx: 12.34,
    results: [], badRows: [],
  });
  const dirty = runVerdictRaw('strip-chip-visibility', {
    control: false, breakReach: false, seededName: 'x', checked: 9, bad: 1, minSlackPx: -3.21,
    results: [], badRows: [{ id: 'short-stick' }],
  });
  assert.equal(clean.status, 0, `expected the clean row set to pass: ${clean.stdout}`);
  assert.equal(dirty.status, 1, `expected the bad row to fail: ${dirty.stdout}`);
  const cleanLine = (clean.stdout.match(/^SUMMARY_FIELDS.*$/m) || [])[0];
  const dirtyLine = (dirty.stdout.match(/^SUMMARY_FIELDS.*$/m) || [])[0];
  assert.equal(cleanLine, 'SUMMARY_FIELDS checked=9 bad=0 minSlack=12.34px', `PASS run: ${clean.stdout}`);
  assert.equal(dirtyLine, 'SUMMARY_FIELDS checked=9 bad=1 minSlack=-3.21px', `FAIL run: ${dirty.stdout}`);
  assert.notEqual(cleanLine, dirtyLine, 'a summary line that reads the same on red and green measures nothing');
});

// gh#210, the shape the first slack arithmetic actually shipped. `visibility: hidden` preserves
// geometry, so the control leg's coverage edge stayed a real coordinate inside the strip and every
// off-edge chip measured POSITIVE slack -- while `naked` counted all of them. Failures and healthy
// margin on the same line, every CI run, with a correct exit code the whole time, which is why only
// the line could tell. The fix makes slack absent when there is no band; this pins the contradiction
// as a hard red so the guard holds wherever the arithmetic moves to.
//
// `bad: 8` is the real control count, measured on a green local suite run 2026-09-07 -- one of the
// nine combos has no hidden chip, so with the band gone there is nothing there to be a naked cut.
// Using the measured number rather than a round 9 keeps this fixture the shape a real run produces.
test('a control leg reporting failures AND non-negative slack is a red, not a pass', () => {
  const base = { control: true, breakReach: false, seededName: 'x', checked: 9, results: [], badRows: [] };

  // The bug's exact output: failures next to healthy margin.
  const contradictory = runVerdictRaw('strip-chip-visibility-control', { ...base, bad: 8, minSlackPx: 3.2 });
  assert.equal(contradictory.status, 1, `expected a red: ${contradictory.stdout}`);
  assert.match(contradictory.stdout, /contradicts itself/, `expected the contradiction named: ${contradictory.stdout}`);

  // The fixed output: the band is gone, so there is no coverage to have margin against.
  const absent = runVerdictRaw('strip-chip-visibility-control', { ...base, bad: 9, minSlackPx: null });
  assert.equal(absent.status, 0, `absent slack on a force-hidden band is coherent: ${absent.stdout}`);
  assert.match(absent.stdout, /minSlack=n\/a/, `expected n\\/a, got: ${absent.stdout}`);

  // A genuine naked cut still reds through the ORIGINAL reason, not this guard -- otherwise the guard
  // would be shadowing the failure it is meant to sit beside.
  const genuine = runVerdictRaw('strip-chip-visibility', {
    control: false, breakReach: false, seededName: 'x', checked: 9, bad: 1, minSlackPx: -3.21,
    results: [], badRows: [{ id: 'short-stick' }],
  });
  assert.equal(genuine.status, 1, `expected a red: ${genuine.stdout}`);
  assert.doesNotMatch(genuine.stdout, /contradicts itself/, `negative slack is coherent: ${genuine.stdout}`);
});

// An unmeasurable walk (a tap whose sampled points sat outside the viewport) scores INCONCLUSIVE on
// claim 1, which leaves the `fail` list empty -- indistinguishable from a clean run to a predicate
// that only reads `fail`. The probe has emitted the `inconclusive` list all along; these pin that the
// verdict now reads it, including the case where the key is gone (a rename must go red, not green).
const noNavClean = (claim1) => ({
  breakGuard: false,
  gamesWithUsableWalk: 3,
  claim0_stageHasNoAnchor: { pass: [], fail: [], inconclusive: [] },
  claim1_noNavTargetHitInStage: { pass: ['love-match'], fail: [], inconclusive: [], ...claim1 },
});

test('no-nav-in-stage goes red when claim 1 could not measure a game', () => {
  const res = runVerdict('no-nav-in-stage', noNavClean({ inconclusive: ['siamsi'] }));
  assert.equal(res.status, 1, `an unmeasurable walk must not report clean: ${res.stdout}`);
  assert.match(res.stdout, /siamsi/, `the verdict must name the unmeasured game: ${res.stdout}`);
});

test('no-nav-in-stage passes when claim 1 measured every game', () => {
  const res = runVerdict('no-nav-in-stage', noNavClean({ pass: ['love-match', 'siamsi', 'daily-fortune'] }));
  assert.equal(res.status, 0, `a fully measured clean run must pass: ${res.stdout}`);
});

test('no-nav-in-stage goes red when claim 1 carries no inconclusive list at all', () => {
  const res = runVerdict('no-nav-in-stage', noNavClean({}));
  assert.equal(res.status, 1, `a missing list must not read as clean: ${res.stdout}`);
});

// Drift hardening, not a shape today's probe can emit: the lists are built by bucketing each game on
// a state string, so renaming that state empties pass, fail and inconclusive together and every
// list-based check above reads clean. The three usable walks have to be somewhere.
test('no-nav-in-stage goes red when every claim 1 list is empty', () => {
  const res = runVerdict('no-nav-in-stage', noNavClean({ pass: [] }));
  assert.equal(res.status, 1, `three usable walks and no verdicts is a broken partition, not a pass: ${res.stdout}`);
});

// gh#289: wheel-pointer-name judges the disc AT THE REVEAL, and a third run slows the animation clock
// so a reveal that fires on a timer from the tap lands while the disc is still turning. The slow run
// must also prove its lever took effect, or a no-op playback rate passes it vacuously.
const wheelSpin = (spin, over = {}) => ({
  spin, resultText: 'A', pointerLabel: 'A', hitTag: 'path', pathCount: 5, runningAtReveal: 0, revealMs: 2010, endMs: 2005, ...over,
});
const wheelRun = (width, rate, spinOver = {}) => ({
  width, rate, innerWidth: width,
  spins: [1, 2, 3].map((n) => wheelSpin(n, rate < 1 ? { revealMs: 4010, endMs: 4005, ...spinOver } : spinOver)),
});
const wheelOut = (slowOver = {}, extra = {}) => ({
  runs: [wheelRun(320, 1), wheelRun(390, 1), wheelRun(390, 0.5, slowOver)], ...extra,
});

test('wheel-pointer-name passes when every reveal lands on a resting disc, the slow run included', () => {
  const res = runVerdictRaw('wheel-pointer-name', wheelOut());
  assert.equal(res.status, 0, `a clean run must pass: ${res.stdout}`);
});

test('wheel-pointer-name goes red when the name is announced while the disc is still turning', () => {
  const res = runVerdictRaw('wheel-pointer-name', wheelOut({ runningAtReveal: 1, revealMs: 2062, pointerLabel: 'B' }));
  assert.equal(res.status, 1, `a reveal over a running transition must fail: ${res.stdout}`);
  assert.match(res.stdout, /still turning/, `the verdict must say the disc was still turning: ${res.stdout}`);
});

test('wheel-pointer-name goes red on a running transition even when the wedge happens to match', () => {
  const res = runVerdictRaw('wheel-pointer-name', wheelOut({ runningAtReveal: 1, revealMs: 3800 }));
  assert.equal(res.status, 1, `matching by luck mid-turn is still an early reveal: ${res.stdout}`);
});

test('wheel-pointer-name goes red when the slow run shows the playback-rate lever did nothing', () => {
  const res = runVerdictRaw('wheel-pointer-name', wheelOut({ revealMs: 2010, endMs: 2005 }));
  assert.equal(res.status, 1, `a slow run that ends at normal speed measured nothing: ${res.stdout}`);
  assert.match(res.stdout, /lever/, `the verdict must name the lever: ${res.stdout}`);
});

test('wheel-pointer-name goes red when the slow run is missing', () => {
  const out = wheelOut();
  out.runs.pop();
  const res = runVerdictRaw('wheel-pointer-name', out);
  assert.equal(res.status, 1, `two runs is the pre-gh#289 shape and must not pass: ${res.stdout}`);
});

test('wheel-pointer-name goes red when a spin carries no reveal-time reading', () => {
  const res = runVerdictRaw('wheel-pointer-name', wheelOut({ runningAtReveal: undefined }));
  assert.equal(res.status, 1, `an unmeasured reveal must not read as a resting disc: ${res.stdout}`);
});

// gh#289 review: "not early" is not "on landing". A page whose landing listener never matches still
// reveals, via its fallback timer, long after the disc stopped; with no running transition and the
// right wedge that passed. The reveal must follow the landing closely.
test('wheel-pointer-name goes red when the reveal trails the landing (a fallback timer, not the landing)', () => {
  const res = runVerdictRaw('wheel-pointer-name', { runs: [
    wheelRun(320, 1, { revealMs: 6000, endMs: 2005 }), wheelRun(390, 1), wheelRun(390, 0.5),
  ] });
  assert.equal(res.status, 1, `a reveal 4s after the landing is not a reveal on landing: ${res.stdout}`);
  assert.match(res.stdout, /after the disc landed/, `the verdict must say the reveal trailed the landing: ${res.stdout}`);
});

test('wheel-pointer-name goes red when the slow run uses a rate its lever check cannot discriminate', () => {
  const out = wheelOut();
  out.runs[2].rate = 0.9;
  const res = runVerdictRaw('wheel-pointer-name', out);
  assert.equal(res.status, 1, `at rate 0.9 a no-op lever passes the floor, so the rate itself must be pinned: ${res.stdout}`);
});

// gh#289 review round 2: a page can pause the disc, announce, and resume it in a microtask, so
// runningAtReveal reads 0 while the disc lands seconds later. The reveal must not precede the landing.
test('wheel-pointer-name goes red when the reveal precedes the landing even though no transition reads as running', () => {
  for (const [label, runs] of [
    ['normal speed', [wheelRun(320, 1, { revealMs: 1000, endMs: 2005 }), wheelRun(390, 1), wheelRun(390, 0.5)]],
    ['slowed clock', [wheelRun(320, 1), wheelRun(390, 1), wheelRun(390, 0.5, { revealMs: 1000, endMs: 4010 })]],
  ]) {
    const res = runVerdictRaw('wheel-pointer-name', { runs });
    assert.equal(res.status, 1, `${label}: an announce 1000ms before the landing must fail: ${res.stdout}`);
    assert.match(res.stdout, /before the disc landed/, `${label}: the verdict must say the reveal preceded the landing: ${res.stdout}`);
  }
});

test('wheel-pointer-name goes red when a spin has no finite reveal time', () => {
  for (const revealMs of [undefined, null, NaN, Infinity, '2010']) {
    const res = runVerdictRaw('wheel-pointer-name', wheelOut({ revealMs }));
    assert.equal(res.status, 1, `revealMs ${String(revealMs)} is not a measurement and must not pass: ${res.stdout}`);
    assert.match(res.stdout, /no reveal time/, `the verdict must say the reveal time is missing: ${res.stdout}`);
  }
});

test('wheel-pointer-name passes a reveal at the landing, a rounding step early, or inside the trailing limit', () => {
  for (const [revealMs, endMs] of [[2005, 2005], [2004, 2005], [2255, 2005]]) {
    const out = { runs: [wheelRun(320, 1, { revealMs, endMs }), wheelRun(390, 1), wheelRun(390, 0.5)] };
    const res = runVerdictRaw('wheel-pointer-name', out);
    assert.equal(res.status, 0, `reveal ${revealMs}ms vs landing ${endMs}ms is an honest reveal: ${res.stdout}`);
  }
});

// gh#288 -- the home-page judge must read the scroll-reveal verdict. Base inputs are RECORDED probe
// outputs (docs/verification/evidence/gh244/, one per motion leg), which pass every older term of the
// judge; the scroll-reveal object is grafted on, because those runs predate it. Missing object = red
// (liveness, never a skip); every required boolean false = red naming it; a void run = red with its
// own reason; a lane that disagrees with the leg = red.
const recorded = (leg) => JSON.parse(readFileSync(join(here, '..', 'docs', 'verification', 'evidence', 'gh244', `probe-home-page-${leg}.json`), 'utf8'));
const REVEAL_KEYS = ['detectorCalibrated', 'belowFoldSectionPending', 'pendingFormForLane', 'nothingAboveFoldPending', 'neverOnAdHeroOrStage', 'revealedOnScroll', 'nothingInViewLeftPending'];
const goodReveal = (lane) => ({ lane, voidUnlessPlainNavigation: true, ...Object.fromEntries(REVEAL_KEYS.map((k) => [k, true])) });
const withReveal = (leg, scrollReveal) => {
  const out = recorded(leg);
  if (scrollReveal !== undefined) out.verdict.scrollReveal = scrollReveal;
  return out;
};

test('home-page passes a recorded verdict with a good scroll-reveal object, on both motion legs', () => {
  for (const leg of ['normal', 'reduced']) {
    const r = runVerdictRaw(`home-page-${leg}`, withReveal(leg, goodReveal(leg)));
    assert.equal(r.status, 0, `${leg}: ${r.stdout}`);
  }
});

test('home-page goes red when the scroll-reveal verdict is missing (liveness, never a skip)', () => {
  for (const leg of ['normal', 'reduced']) {
    const r = runVerdictRaw(`home-page-${leg}`, withReveal(leg, undefined));
    assert.equal(r.status, 1, `${leg}: a probe output without scrollReveal must not pass -- got: ${r.stdout}`);
    assert.match(r.stdout, /scrollReveal/);
  }
});

test('home-page goes red on every required scroll-reveal boolean that is false', () => {
  for (const leg of ['normal', 'reduced']) {
    for (const k of REVEAL_KEYS) {
      const r = runVerdictRaw(`home-page-${leg}`, withReveal(leg, { ...goodReveal(leg), [k]: false }));
      assert.equal(r.status, 1, `${leg} ${k}=false must be red -- got: ${r.stdout}`);
      assert.match(r.stdout, new RegExp(k), `${leg}: the reason must name ${k}`);
    }
  }
});

test('home-page names a void scroll-reveal run as void, and fails it', () => {
  const r = runVerdictRaw('home-page-normal', withReveal('normal', { ...goodReveal('normal'), voidUnlessPlainNavigation: false }));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /void/i);
  assert.match(r.stdout, /voidUnlessPlainNavigation/);
});

test('home-page goes red when the scroll-reveal lane disagrees with the leg', () => {
  const r = runVerdictRaw('home-page-reduced', withReveal('reduced', goodReveal('normal')));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /lane/);
});
