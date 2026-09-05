// gh#193. The invariant: a route whose burst leg was NOT exercised is not inside the number the
// summary line calls "checked", and the summary names it. `checked` and `skips` used to be maintained
// independently (`checked = Object.keys(out).length`), so a skipped route landed in both and the count
// read as coverage it had not earned -- the same shape gh#186 named for the gate scripts.
// gh#199 TIGHTENS that invariant -- nothing below was weakened to make anything pass. Being outside
// `checked` turned out not to be enough: a route the probe could not WALK still rode out on a green
// exit code. The unexercised set now splits on the button count the finder measured on the game root,
// and only the zero-button half may be silent:
//   buttonsInRoot > 0 (or no triggerScan at all) -> UNMEASURED, exit 1.
//   buttonsInRoot === 0                          -> EXEMPT, exit 0, named in the summary.
// The gh#193 case that asserted `code === 0` for a finder miss is now asserted RED, deliberately.
// Pure: PROBE_OUT_FIXTURE drives the probe's REAL verdict block over a recorded `out`, no browser.
// Nothing here re-implements the bookkeeping; every number asserted is parsed out of the probe's
// own stdout.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBE = fileURLToPath(new URL('./play-exit-probe.mjs', import.meta.url));
const DIR = mkdtempSync(join(tmpdir(), 'play-exit-probe-test-'));

// A route the probe would judge green on every leg.
const clean = (id) => ({
  route: id,
  idle: { present: true },
  m1_pathname: '/',
  transitionTrigger: { label: 'start', x: 10, y: 10 },
  triggerScan: { buttonsInRoot: 3, rejected: [] },
  transitioned: true,
  burst: { pathname: `/game/${id}/play/`, defectContacts: [], isVoid: false, attempts: 1,
           contacts: { total: 6, onBtnWhileDisabled: 5 }, gaps: [80], inputGaps: [80], maxGap: 80,
           maxInputGap: 80, gapsOverArmDelay: 0, inputGapsOverArmDelay: 0 },
  m3_pathname: '/',
});
// The gh#193 shape, re-read by gh#199: the finder found nothing to press on a page that HAS three
// buttons, after both attempts. The route was not walked and the probe cannot say the route is at
// fault -- UNMEASURED.
const noTrigger = (id) => ({ ...clean(id), transitionTrigger: null,
  triggerScan: { buttonsInRoot: 3, rejected: [{ label: 'x', w: 20, h: 20, top: 4, inHeader: true, hidden: false }] },
  burst: { ...clean(id).burst, attempts: 2 } });
// A finder that threw (root selector matched nothing) records no scan at all. Must NOT buy an
// exemption -- absence of a measurement is the thing this ticket refuses to score.
const noScan = (id) => ({ ...clean(id), transitionTrigger: null, triggerScan: null });
// The only exemptable shape: the game root really holds no button, measured this run.
const noButtons = (id) => ({ ...clean(id), transitionTrigger: null, triggerScan: { buttonsInRoot: 0, rejected: [] } });

const run = (out) => {
  const path = join(DIR, `out-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(out));
  // Both streams, because the CI wrapper redirects a leg's stderr into the same log it filters, so a
  // line that only ever reaches stdout is not the same claim as a line CI keeps.
  const p = spawnSync(process.execPath, [PROBE], { env: { ...process.env, PROBE_OUT_FIXTURE: path }, encoding: 'utf8' });
  const stdout = p.stdout ?? '', stderr = p.stderr ?? '', code = p.status;
  const summary = stdout.split('\n').find((l) => l.startsWith('play-exit: '));
  assert.ok(summary, `no summary line in probe output:\n${stdout}`);
  const m = /play-exit: (\d+) of (\d+) route/.exec(summary);
  assert.ok(m, `the summary line does not report a checked count out of the walked route set: ${summary}`);
  const checked = Number(m[1]);
  const ids = (re) => {
    const named = re.exec(summary)?.[1] ?? '';
    return named === 'none' ? [] : named.split(',').map((s) => s.trim()).filter(Boolean);
  };
  return {
    code, stdout, stderr, summary, checked,
    // The exact filter a PASSING leg's log is put through by the CI wrapper: everything else in that
    // log is discarded on a green run. Anything asserted off this list is a line CI really shows.
    ciKept: [...`${stdout}\n${stderr}`.matchAll(/^::(warning|notice)::.*$/gm)].map((m) => m[0]),
    // EXEMPT is the last segment of the line; UNMEASURED is bounded by the segment that follows it.
    exempt: ids(/EXEMPT[^:]*: (.*)$/),
    unmeasuredNamed: ids(/UNMEASURED[^:]*: (.*?), \d+ route\(s\) EXEMPT/),
    skipped: [...stdout.matchAll(/^ {2}SKIP (\S+) /gm)].map((m) => m[1]),
    unmeasured: [...stdout.matchAll(/^ {2}UNMEASURED (\S+) /gm)].map((m) => m[1]),
  };
};

test('a zero-button route is outside the checked count, named exempt, and does not block', () => {
  const routes = { alpha: clean('alpha'), 'short-stick': noButtons('short-stick'), gamma: clean('gamma') };
  const r = run(routes);
  // Calibration: the fixture must really reach the skip path, or the disjointness below is vacuous.
  assert.deepStrictEqual(r.skipped, ['short-stick'], `fixture did not exercise the skip path: ${r.summary}`);
  assert.deepStrictEqual(r.unmeasured, [], 'a measured zero-button root is not an UNMEASURED route');
  // The invariant, both halves.
  assert.strictEqual(r.checked, Object.keys(routes).length - r.skipped.length,
    `the skipped route is still inside the checked count: ${r.summary}`);
  for (const id of r.skipped) {
    assert.ok(r.exempt.includes(id), `${id} was skipped but the summary does not name it exempt: ${r.summary}`);
  }
  assert.strictEqual(r.code, 0, 'a route with nothing to press is a property of the route, not a failed measurement');
});

// gh#199's whole point, and the assertion gh#193 had the other way round. This exact fixture --
// a null trigger on a route that HAS buttons -- used to print SKIP and exit 0.
test('a route the finder could not resolve a trigger on is UNMEASURED and reds the run', () => {
  const routes = { alpha: clean('alpha'), 'short-stick': noTrigger('short-stick'), gamma: clean('gamma') };
  const r = run(routes);
  assert.deepStrictEqual(r.unmeasured, ['short-stick'], `fixture did not reach the UNMEASURED path: ${r.stdout}`);
  assert.deepStrictEqual(r.skipped, [], 'an unwalked route must not also be scored as an exemption');
  assert.deepStrictEqual(r.exempt, [], `the summary still exempts a route nothing walked: ${r.summary}`);
  assert.deepStrictEqual(r.unmeasuredNamed, ['short-stick'], `the summary does not name the unmeasured route: ${r.summary}`);
  assert.strictEqual(r.checked, 2, `an unmeasured route is not coverage: ${r.summary}`);
  assert.strictEqual(r.code, 1, 'a route the probe could not walk must not ride out on a green exit code');
  // The red has to name a cause -- only tail -n 3 of this reaches the CI log.
  assert.match(r.stdout, /UNMEASURED short-stick .*3 button\(s\) in the game root/);
});

// Fail-closed: the absence of a scan is the absence of evidence, and evidence is what buys the
// exemption. A finder expression that throws must not read as "this route has nothing to press".
test('a route with no triggerScan recorded at all is UNMEASURED, not exempt', () => {
  const r = run({ alpha: clean('alpha'), beta: noScan('beta') });
  assert.deepStrictEqual(r.unmeasured, ['beta']);
  assert.deepStrictEqual(r.exempt, []);
  assert.strictEqual(r.checked, 1);
  assert.strictEqual(r.code, 1);
  assert.match(r.stdout, /UNMEASURED beta .*returned nothing at all/);
});

// Must-red control for the parse: with nothing skipped the same parse has to report full coverage,
// so a test that passes by reading zeros out of a broken line cannot go green above.
test('with every route exercised the count is the full route set and nothing is named exempt', () => {
  const r = run({ alpha: clean('alpha'), gamma: clean('gamma') });
  assert.deepStrictEqual(r.skipped, []);
  assert.deepStrictEqual(r.unmeasured, []);
  assert.strictEqual(r.checked, 2);
  assert.deepStrictEqual(r.exempt, []);
  assert.deepStrictEqual(r.unmeasuredNamed, []);
  assert.strictEqual(r.code, 0);
});

// gh#199 follow-up. The walk now starts every route from a DECLARED state -- Storage.clearDataForOrigin
// before every navigation -- because the routes share one origin and the ones walked earlier wrote
// `watduang:roster`, which made short-stick auto-advance past its own entry point and score UNMEASURED.
// That behaviour lives in the browser leg, so what a fixture CAN pin is the two things the verdict block
// must keep doing about it, and both of these fail if the clear is ever quietly removed:
//   1. the record carries the site-storage key count the route loaded with, and an UNMEASURED red
//      prints it -- that number is what tells "the finder missed" apart from "the route auto-advanced
//      past its entry point", which is the exact pair that cost this leg a ticket.
//   2. an UNMEASURED route is still RED. The declared start makes the red rarer; it must not make it
//      unreachable, and the browser-side must-red for that is recorded in the ticket.
test('an UNMEASURED red names the storage state the route loaded with', () => {
  const dirty = (id) => ({ ...noTrigger(id), triggerScan: { ...noTrigger(id).triggerScan, storageKeysAtLoad: 3 } });
  const r = run({ alpha: clean('alpha'), 'short-stick': dirty('short-stick') });
  assert.strictEqual(r.code, 1, 'a declared starting state must not make the UNMEASURED red unreachable');
  assert.deepStrictEqual(r.unmeasured, ['short-stick']);
  assert.match(r.stdout, /3 site storage key\(s\) present at load/,
    'the red does not say what state the route loaded with, so it cannot tell a finder miss from an auto-advanced route');
});

// Must-red control for the assertion above: with the clear working the count is 0, and a test that
// passes by matching any digit at all cannot go green here.
test('a route that loaded with no site storage reports zero, not the same number', () => {
  const r = run({ alpha: clean('alpha'), beta: { ...noTrigger('beta'), triggerScan: { buttonsInRoot: 3, storageKeysAtLoad: 0, rejected: [] } } });
  assert.match(r.stdout, /0 site storage key\(s\) present at load/);
  assert.doesNotMatch(r.stdout, /3 site storage key\(s\) present at load/);
});

// The precondition the burst leg exists for. src/shell/PlayExit.astro disarms the X on ANY document
// pointerdown, so a trigger that changed nothing on screen still leaves the burst landing on a
// DISABLED X -- every other check in the verdict passes and the route greens without a round
// transition ever having happened. This fixture is that exact shape: a route green on every leg
// EXCEPT `transitioned`.
test('a trigger that changed nothing on screen is UNMEASURED, not a green burst', () => {
  const inert = { ...clean('beta'), transitioned: false };
  const r = run({ alpha: clean('alpha'), beta: inert });
  assert.deepStrictEqual(r.unmeasured, ['beta'], 'a burst driven by an inert control was scored as coverage');
  assert.deepStrictEqual(r.exempt, [], 'a route the probe could not set up is not an exemption');
  assert.strictEqual(r.checked, 1, 'a route that never transitioned is not inside the checked count');
  assert.strictEqual(r.code, 1);
  assert.match(r.stdout, /UNMEASURED beta .*left the screen unchanged \(transitioned=false\)/);
});

// Must-red control for the case above, and for the fixture: `null` is what the probe records when the
// signature helper was never installed, and it must be judged exactly as harshly as `false` -- a
// `!== true` test is the only form that is closed on both.
test('an unrecorded transition is judged as harshly as a false one', () => {
  const r = run({ alpha: clean('alpha'), beta: { ...clean('beta'), transitioned: null } });
  assert.deepStrictEqual(r.unmeasured, ['beta']);
  assert.strictEqual(r.code, 1);
  // The same fixture with the flag set really does pass, so the two tests above cannot be going green
  // off a broken parse or an unrelated red.
  const ok = run({ alpha: clean('alpha'), beta: clean('beta') });
  assert.deepStrictEqual(ok.unmeasured, []);
  assert.strictEqual(ok.checked, 2);
  assert.strictEqual(ok.code, 0);
});

test('every route exempted is a red, not a green zero', () => {
  const r = run({ alpha: noButtons('alpha'), gamma: noButtons('gamma') });
  assert.strictEqual(r.checked, 0);
  assert.deepStrictEqual(r.exempt, ['alpha', 'gamma']);
  assert.strictEqual(r.code, 1, 'a walk that exercised no route at all must not exit 0');
});

// The margin has to be readable on a GREEN run. The five input gaps were printed only on a VOID, so
// a run that passed recorded no band at all and "the burst still lands well inside the arm window"
// was an assumption nothing had measured -- which is how a leg drifted to within 15% of ARM_DELAY_MS
// across many greens before the first void. Distinct gap values here, so a band printed off a
// constant, or off the wrong route's record, cannot go green.
test('a passing burst prints its own input gaps, not only a void one', () => {
  const base = clean('beta');
  const banded = { ...base, burst: { ...base.burst, gaps: [81.5, 92, 83, 84], inputGaps: [81.5, 92, 83, 84], maxGap: 92, maxInputGap: 92 } };
  const r = run({ alpha: clean('alpha'), beta: banded });
  assert.strictEqual(r.code, 0, 'the fixture must really pass, or this band is a red line and proves nothing about a green run');
  assert.match(r.stdout, /^ {2}GAPS beta: .*input gaps 81\.5, 92, 83, 84/m,
    'a green run records no gap band, so its margin against ARM_DELAY_MS is unmeasurable');
});

// Printing the band is not publishing it. A passing leg's log is swallowed whole except for the
// annotation lines, so a band on plain stdout measures the margin only for whoever runs the probe by
// hand -- and the runner whose drift this exists to catch is the CI one. Asserted against the same
// filter the wrapper applies, so this stays true only while the band survives a green leg.
test('a passing burst publishes its band through the channel a green CI leg keeps', () => {
  const base = clean('beta');
  const banded = { ...base, burst: { ...base.burst, gaps: [81.5, 92, 83, 84], inputGaps: [81.5, 92, 83, 84], maxGap: 92, maxInputGap: 92 } };
  const r = run({ alpha: clean('alpha'), beta: banded });
  assert.strictEqual(r.code, 0, 'the fixture must really pass, or this proves nothing about a green leg');
  assert.ok(r.ciKept.some((l) => /GAPS beta: .*input gaps 81\.5, 92, 83, 84/.test(l)),
    `the band never reaches a green CI leg's log; annotation lines it does keep:\n${r.ciKept.join('\n') || '(none)'}`);
  assert.ok(r.ciKept.some((l) => /GAPS alpha: /.test(l)),
    'only one route published a band -- the band must be per walked route, not per interesting route');
});
