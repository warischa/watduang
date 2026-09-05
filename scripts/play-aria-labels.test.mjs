// The injector rewrites tracked source files, so its addressing rules get a real test rather than a
// comment. The gate (scripts/play-icon-label-check.mjs) judges the RESULT; this pins the mechanism
// that produces it. Both must exist: a green gate after an --apply proves only that the two agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLabels, iconOnlyButtons, selectorFor, loadTable, routeIds } from './play-aria-labels.mjs';

const one = (html) => iconOnlyButtons(html)[0];

test('icon-only is text with no letter and no digit', () => {
  assert.equal(iconOnlyButtons('<button id="a">✕</button>').length, 1, 'a bare glyph is icon-only');
  assert.equal(iconOnlyButtons('<button id="a">7</button>').length, 0, 'a digit names itself');
  assert.equal(iconOnlyButtons('<button id="a">-10</button>').length, 0, 'a signed number names itself');
  assert.equal(iconOnlyButtons('<button id="a">ปิด</button>').length, 0, 'Thai text names itself');
  assert.equal(iconOnlyButtons('<button id="a">Close</button>').length, 0, 'Latin text names itself');
  assert.equal(iconOnlyButtons('<button id="a"><svg></svg></button>').length, 1, 'an svg-only button is icon-only');
  assert.equal(iconOnlyButtons('<button id="a">${name}</button>').length, 0, 'an interpolated name is not readable here');
});

test('a key is chosen most-specific first', () => {
  const table = { '#a': 'ไอดี', '[data-key="x"]': 'แอตทริบิวต์', '.c': 'คลาส' };
  assert.equal(selectorFor(one('<button id="a" data-key="x" class="c">✕</button>'), table), '#a');
  assert.equal(selectorFor(one('<button data-key="x" class="c">✕</button>'), table), '[data-key="x"]');
  assert.equal(selectorFor(one('<button class="c">✕</button>'), table), '.c');
  assert.equal(selectorFor(one('<button class="other">✕</button>'), table), null, 'no key must not guess');
});

test('applying adds a label, replaces a wrong one, and leaves visible copy alone', () => {
  const table = { r: { '#a': 'ปิด' } };
  const added = applyLabels('<button id="a" title="เดิม">✕</button>', 'r', table);
  assert.equal(added.changed, 1);
  assert.match(added.text, /aria-label="ปิด"/);
  assert.match(added.text, /title="เดิม"/, 'the existing title must survive untouched');

  // The zero-trigger case: an English label from the mockup must lose to the table.
  const replaced = applyLabels('<button id="a" aria-label="Close">✕</button>', 'r', table);
  assert.equal(replaced.changed, 1);
  assert.doesNotMatch(replaced.text, /Close/);
  assert.match(replaced.text, /aria-label="ปิด"/);

  // Re-running must be a no-op, or an extraction would churn the file on every run.
  assert.equal(applyLabels(replaced.text, 'r', table).changed, 0, 'applying twice must change nothing');

  // A button the table does not name is left exactly as it was.
  const untouched = '<button id="zz">✕</button>';
  assert.equal(applyLabels(untouched, 'r', table).text, untouched);
});

test('every route the table names still exists on disk', () => {
  const routes = new Set(routeIds());
  for (const id of Object.keys(loadTable())) {
    assert.ok(routes.has(id), `table names route "${id}" which is not a directory under src/play`);
  }
});
