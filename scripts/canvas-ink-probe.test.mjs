// gh#224 — the 2D-ink leg's verdict mapping and its leg-level judgement, pinned WITHOUT a browser.
//
// The classifier is the whole product of the probe: everything else is apparatus for producing its
// inputs. A mapping provable only by the apparatus it governs is a mapping nobody can check when the
// apparatus is the thing that broke — the shape scripts/webgl-pixels-probe.test.mjs already uses.
//
// The case that matters most is the third verdict. A leg that cannot say "I never got there" reports
// an unreached screen as a screen that painted nothing, and sends the next reader hunting a rendering
// bug that does not exist. What separates the two here is a count of the route's own paint calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classify, judge, RECORDED_IDLE, INK_COLOUR_FLOOR } from './canvas-ink-probe.mjs';

const drewRow = (id) => ({ id, verdict: 'DREW', reason: 'x', clearCalls: 9 });
const blankRow = (id) => ({ id, verdict: 'BLANK', reason: 'x', clearCalls: 9 });
const idleRow = (id, clearCalls = 9) => ({ id, verdict: 'UNMEASURED', reason: 'x', clearCalls });

test('paint calls plus ink is DREW, and coverage is a floor of zero rather than a magnitude', () => {
  assert.equal(classify({ canvasSeen: true, paintCalls: 3, coverage: 1, colours: 40 }).verdict, 'DREW');
  // wire-snip-panic's real numbers: 1156 fill() calls, 0.0027 coverage, 13 colours. A magnitude floor
  // would call that blank, and the magnitude is owned by particle count and timing, not by this repo.
  assert.equal(classify({ canvasSeen: true, paintCalls: 1156, coverage: 0.0027, colours: 13 }).verdict, 'DREW');
});

test('paint calls with nothing landing is BLANK — which is exactly the control leg', () => {
  assert.equal(classify({ canvasSeen: true, paintCalls: 1156, coverage: 0, colours: 0 }).verdict, 'BLANK');
  assert.equal(
    classify({ canvasSeen: true, paintCalls: 5, coverage: 1, colours: INK_COLOUR_FLOOR - 1 }).verdict,
    'BLANK',
    'a solid single-colour fill covers everything and still proves no palette ever ran',
  );
});

test('UNMEASURED is a third state, never collapsed into BLANK', () => {
  const unreached = classify({ canvasSeen: false });
  assert.equal(unreached.verdict, 'UNMEASURED');
  assert.match(unreached.reason, /no visible canvas/);

  // The distinction the whole leg turns on: a live loop clearing 596 times with zero paint calls did
  // not draw a blank frame, it never reached a moment it draws.
  const idle = classify({ canvasSeen: true, paintCalls: 0, coverage: 0, colours: 0 });
  assert.equal(idle.verdict, 'UNMEASURED');
  assert.match(idle.reason, /not one paint call/);

  assert.equal(classify({ canvasSeen: true, paintCalls: 2, coverage: null, colours: null }).verdict, 'UNMEASURED');
  assert.equal(classify({ canvasSeen: true, paintCalls: 2, coverage: 0, colours: 0, readbackError: 'SecurityError' }).verdict, 'UNMEASURED');

  // Three distinct verdicts from three distinct situations, and the two UNMEASURED situations do not
  // share a reason string — a leg that cannot tell them apart cannot report which one happened.
  assert.equal(new Set([
    classify({ canvasSeen: true, paintCalls: 1, coverage: 1, colours: 9 }).verdict,
    classify({ canvasSeen: true, paintCalls: 1, coverage: 0, colours: 0 }).verdict,
    classify({ canvasSeen: false }).verdict,
  ]).size, 3);
  assert.notEqual(unreached.reason, idle.reason);
});

// Fixtures are built FROM the real RECORDED_IDLE map rather than from invented ids: judge() checks
// the record against the derived list in both directions, so a fixture that named only some of the
// recorded routes would red for a reason the test is not about.
const recordedIds = [...RECORDED_IDLE.keys()];
const idleRows = () => recordedIds.map((id) => idleRow(id));
const derivedWith = (...ids) => [...ids, ...recordedIds].sort();

test('the clean leg wants DREW, the control leg wants BLANK, and a recorded idle route is UNMEASURED on both', () => {
  const derivedIds = derivedWith('a');
  assert.deepEqual(judge([drewRow('a'), ...idleRows()], { stubbed: false, derivedIds }), []);
  assert.deepEqual(judge([blankRow('a'), ...idleRows()], { stubbed: true, derivedIds }), []);
  assert.equal(judge([blankRow('a'), ...idleRows()], { stubbed: false, derivedIds }).length, 1);
  assert.equal(judge([drewRow('a'), ...idleRows()], { stubbed: true, derivedIds }).length, 1);
});

test('an unrecorded UNMEASURED reds — a route that stops drawing cannot hide in the third state', () => {
  const bad = judge([idleRow('a'), ...idleRows()], { stubbed: false, derivedIds: derivedWith('a') });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /not recorded as an idle-canvas route/);
});

test('a recorded route still has to prove its render loop is alive', () => {
  const rows = idleRows();
  rows[0] = idleRow(recordedIds[0], 0);
  const bad = judge(rows, { stubbed: false, derivedIds: derivedWith() });
  assert.equal(bad.length, 1);
  assert.match(bad[0], /the loop is dead/);
});

test('the record reds when it goes stale in either direction', () => {
  // It draws now: drop the entry.
  const rows = idleRows();
  rows[0] = drewRow(recordedIds[0]);
  assert.match(judge(rows, { stubbed: false, derivedIds: derivedWith() })[0], /the record is stale/);
  // It is no longer a derived 2D route: drop the entry.
  assert.match(
    judge([drewRow('a')], { stubbed: false, derivedIds: ['a'] }).join('\n'),
    /no longer derives it as a 2D play route/,
  );
});

test('a derived route nobody walked reds, and a subset run cannot claim the set', () => {
  const derivedIds = derivedWith('a', 'b');
  assert.match(judge([drewRow('a'), ...idleRows()], { stubbed: false, derivedIds }).join('\n'), /b: derived .* never walked/);
  assert.deepEqual(judge([drewRow('a')], { stubbed: false, derivedIds, full: false }), []);
});
