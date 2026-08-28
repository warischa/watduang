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
