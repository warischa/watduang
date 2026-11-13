// Frame-time sampling for the prize reveal (gh#305): off unless a probe enables it, and its summary is the
// median, p95 and max per phase of the RAF intervals and the CPU time around each advance.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ft from './frame-time.ts';

test('off unless enabled: no global, or a global that is not an opt-in object, yields no sampler', () => {
  assert.equal(ft.activeFrameSampler({}), null);
  assert.equal(ft.activeFrameSampler({ [ft.FRAME_TIME_GLOBAL]: false }), null);
  assert.equal(ft.activeFrameSampler({ [ft.FRAME_TIME_GLOBAL]: { enabled: false } }), null);
  // Positive control: the same call on an opt-in object does sample, so the nulls above measure the gate.
  assert.ok(ft.activeFrameSampler({ [ft.FRAME_TIME_GLOBAL]: { enabled: true } }));
});

test('an opt-in object is upgraded in place, so the page reads back what the host recorded', () => {
  const g = { [ft.FRAME_TIME_GLOBAL]: { enabled: true } };
  const s = ft.activeFrameSampler(g);
  assert.ok(s);
  assert.equal(ft.activeFrameSampler(g), s, 'a second reveal on the page got a second sampler');
  s.frame('cut:0', null, 2);
  s.frame('cut:0', 16, 3);
  s.gap('held', 500);
  assert.equal(g[ft.FRAME_TIME_GLOBAL].frames.length, 2);
  assert.deepEqual(g[ft.FRAME_TIME_GLOBAL].gaps, [{ kind: 'held', ms: 500 }]);
});

test('summary per phase: count, median, p95 and max; a first frame has no interval', () => {
  const s = ft.createFrameSampler();
  for (let i = 1; i <= 100; i++) s.frame('countdown', i, i / 10);
  s.frame('countdown', null, 50);
  s.frame('cut:1', 20, 1);
  const sum = s.summary();
  assert.deepEqual(sum.countdown.raf, { count: 100, median: 50.5, p95: 95, max: 100 });
  assert.equal(sum.countdown.cpu.count, 101);
  assert.equal(sum.countdown.cpu.max, 50);
  assert.deepEqual(sum['cut:1'].raf, { count: 1, median: 20, p95: 20, max: 20 });
});
