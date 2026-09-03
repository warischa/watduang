// gh#193. The invariant: a route whose burst leg was NOT exercised is not inside the number the
// summary line calls "checked", and the summary names it. `checked` and `skips` used to be maintained
// independently (`checked = Object.keys(out).length`), so a skipped route landed in both and the count
// read as coverage it had not earned -- the same shape gh#186 named for the gate scripts.
// Pure: PROBE_OUT_FIXTURE drives the probe's REAL verdict block over a recorded `out`, no browser.
// Nothing here re-implements the bookkeeping; every number asserted is parsed out of the probe's
// own stdout.
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
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
  transitioned: true,
  burst: { pathname: `/game/${id}/play/`, defectContacts: [], isVoid: false, attempts: 1,
           contacts: { total: 6, onBtnWhileDisabled: 5 }, gaps: [80], inputGaps: [80], maxGap: 80,
           maxInputGap: 80, gapsOverArmDelay: 0, inputGapsOverArmDelay: 0 },
  m3_pathname: '/',
});
// The gh#193 shape: the finder found nothing to press, so nothing disarmed the X and the burst leg
// never happened on this route.
const noTrigger = (id) => ({ ...clean(id), transitionTrigger: null });

const run = (out) => {
  const path = join(DIR, `out-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(out));
  let stdout, code = 0;
  try {
    stdout = execFileSync(process.execPath, [PROBE], { env: { ...process.env, PROBE_OUT_FIXTURE: path }, encoding: 'utf8' });
  } catch (e) { stdout = e.stdout ?? ''; code = e.status; }
  const summary = stdout.split('\n').find((l) => l.startsWith('play-exit: '));
  assert.ok(summary, `no summary line in probe output:\n${stdout}`);
  const m = /play-exit: (\d+) of (\d+) route/.exec(summary);
  assert.ok(m, `the summary line does not report a checked count out of the walked route set: ${summary}`);
  const checked = Number(m[1]);
  const named = /EXEMPT[^:]*: (.*)$/.exec(summary)?.[1] ?? '';
  return {
    code, stdout, summary, checked,
    exempt: named === 'none' ? [] : named.split(',').map((s) => s.trim()).filter(Boolean),
    skipped: [...stdout.matchAll(/^ {2}SKIP (\S+) /gm)].map((m) => m[1]),
  };
};

test('a route whose burst leg was skipped is outside the checked count and named in the summary', () => {
  const routes = { alpha: clean('alpha'), 'short-stick': noTrigger('short-stick'), gamma: clean('gamma') };
  const r = run(routes);
  // Calibration: the fixture must really reach the skip path, or the disjointness below is vacuous.
  assert.deepStrictEqual(r.skipped, ['short-stick'], `fixture did not exercise the skip path: ${r.summary}`);
  // The invariant, both halves.
  assert.strictEqual(r.checked, Object.keys(routes).length - r.skipped.length,
    `the skipped route is still inside the checked count: ${r.summary}`);
  for (const id of r.skipped) {
    assert.ok(r.exempt.includes(id), `${id} was skipped but the summary does not name it exempt: ${r.summary}`);
  }
  assert.strictEqual(r.code, 0, 'a lone skip among exercised routes is not a red');
});

// Must-red control for the parse: with nothing skipped the same parse has to report full coverage,
// so a test that passes by reading zeros out of a broken line cannot go green above.
test('with every route exercised the count is the full route set and nothing is named exempt', () => {
  const r = run({ alpha: clean('alpha'), gamma: clean('gamma') });
  assert.deepStrictEqual(r.skipped, []);
  assert.strictEqual(r.checked, 2);
  assert.deepStrictEqual(r.exempt, []);
  assert.strictEqual(r.code, 0);
});

test('every route skipped is a red, not a green zero', () => {
  const r = run({ alpha: noTrigger('alpha'), gamma: noTrigger('gamma') });
  assert.strictEqual(r.checked, 0);
  assert.deepStrictEqual(r.exempt, ['alpha', 'gamma']);
  assert.strictEqual(r.code, 1, 'a walk that exercised no route at all must not exit 0');
});
