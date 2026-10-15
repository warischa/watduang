// gh#264 REFUTE round 6. The invariant: an `ONLY=<route>:<width>` filter that matches no route or no
// viewport is a hard failure that names the filter, raised at module load -- before the driver opens a
// browser session -- never a run that walks nothing and reports checked:0 with a green exit.
// No browser: each case imports the probe in a fresh node process (an import that throws is cached
// per process, so cases never share one), the same way the driver's own import does before CDP.
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';

const PROBE = new URL('./strip-chip-visibility-probe.mjs', import.meta.url).href;

function load(only) {
  const env = { ...process.env };
  delete env.ONLY;
  if (only !== undefined) env.ONLY = only;
  return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(PROBE)})`], {
    env,
    encoding: 'utf8',
  });
}

for (const only of ['short-stick:999', 'no-such-route:320', 'short-stick']) {
  test(`ONLY=${only} matches nothing: the probe refuses at load and names the filter`, () => {
    const r = load(only);
    assert.notEqual(r.status, 0, `exit 0 on a filter that selects nothing; stderr: ${r.stderr}`);
    assert.match(r.stderr, new RegExp(`ONLY=${only.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), r.stderr);
  });
}

// Positive control: a filter that selects one combo, and no filter at all, still load clean.
for (const only of ['short-stick:320', undefined]) {
  test(`ONLY=${only ?? '(unset)'} loads clean`, () => {
    const r = load(only);
    assert.equal(r.status, 0, r.stderr);
  });
}
