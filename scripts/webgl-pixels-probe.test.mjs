// The verdict classifier, tested without a browser (ADR-0051's pixel readback for a WebGL route).
//
// The whole point of this probe is the THREE-way split: a two-way probe cannot tell "the feature is
// broken" from "the run was void", and on every lane this repo runs today the honest answer is
// UNMEASURED. So the mapping from (context live?, pixels non-blank?) to a verdict is a pure function
// and it is pinned here, where no GPU, no Chrome and no served dist can make it green by accident.
//
//   node --test 'scripts/webgl-pixels-probe.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, exitCodeFor, aggregate } from './webgl-pixels-probe.mjs';

test('no live context is UNMEASURED, never a pass and never a failure', () => {
  assert.equal(classify({ contextLive: false, nonBlank: null }).verdict, 'UNMEASURED');
  // A dead context cannot be overruled by a pixel reading, whatever that reading claims.
  assert.equal(classify({ contextLive: false, nonBlank: true }).verdict, 'UNMEASURED');
  assert.equal(classify({ contextLive: false, nonBlank: false }).verdict, 'UNMEASURED');
});

test('a live context that drew is PASS', () => {
  assert.equal(classify({ contextLive: true, nonBlank: true }).verdict, 'PASS');
});

test('a live context that stayed blank is FAIL', () => {
  assert.equal(classify({ contextLive: true, nonBlank: false }).verdict, 'FAIL');
});

test('a live context whose readback never happened is UNMEASURED, not PASS', () => {
  // The readback can be unavailable on a live context -- a lost context, or no animation frame ever
  // fired. That is a void reading, so it takes the void verdict rather than being read either way.
  assert.equal(classify({ contextLive: true, nonBlank: null }).verdict, 'UNMEASURED');
  assert.equal(classify({ contextLive: true }).verdict, 'UNMEASURED');
});

test('every verdict carries a reason', () => {
  for (const input of [
    { contextLive: false, nonBlank: null },
    { contextLive: true, nonBlank: true },
    { contextLive: true, nonBlank: false },
    { contextLive: true, nonBlank: null },
  ]) {
    assert.match(classify(input).reason, /\S/);
  }
});

test('exit codes keep the three states apart', () => {
  assert.equal(exitCodeFor('PASS'), 0);
  assert.equal(exitCodeFor('FAIL'), 1);
  assert.equal(exitCodeFor('UNMEASURED'), 2);
});

test('aggregate: a failure outranks a void reading, and a void reading outranks a pass', () => {
  assert.equal(aggregate(['PASS', 'PASS']), 'PASS');
  assert.equal(aggregate(['PASS', 'UNMEASURED']), 'UNMEASURED');
  assert.equal(aggregate(['UNMEASURED', 'FAIL']), 'FAIL');
  assert.equal(aggregate(['PASS', 'FAIL', 'UNMEASURED']), 'FAIL');
  // No route measured at all is UNMEASURED, not a pass by absence -- the same shape as a gate that
  // classifies nothing (ADR-0016), which is the one way this probe could go green measuring nothing.
  assert.equal(aggregate([]), 'UNMEASURED');
});
