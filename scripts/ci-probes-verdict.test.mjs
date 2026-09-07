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
import { mkdtempSync, writeFileSync } from 'node:fs';
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
