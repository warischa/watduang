// node --test — pure cut-schedule logic, no DOM
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeSchedule } from './schedule.ts';

test('the owner example: 200 people walk 200 -> 100 -> 50 -> 20 -> 5', () => {
  assert.deepEqual(proposeSchedule(200), [200, 100, 50, 20, 5]);
});

test('every head count from 9 to 1000 gets 4 strictly shrinking cuts ending on a final of 5', () => {
  for (let n = 9; n <= 1000; n++) {
    const s = proposeSchedule(n);
    assert.equal(s.length, 5, `n=${n}`);
    assert.equal(s[0], n, `n=${n}`);
    assert.equal(s[4], 5, `n=${n}`);
    for (let i = 1; i < s.length; i++) {
      assert.ok(Number.isInteger(s[i]) && s[i] < s[i - 1], `n=${n} schedule ${s.join('>')}`);
    }
  }
});

test('fewer than 9 people cannot fill 4 elimination rounds above a final of 5', () => {
  assert.throws(() => proposeSchedule(8), RangeError);
});
