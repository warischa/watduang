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
import { classify, exitCodeFor, aggregate, resolveGLContext } from './webgl-pixels-probe.mjs';

// A mock canvas modelling the ONE browser behaviour this resolution logic depends on: a canvas locks
// to the first context type it is ever handed and returns null for every other type after that
// (measured against a live headless Chrome running the lane's own flags -- see webgl-pixels-probe.mjs).
// 'webgl' and 'experimental-webgl' are the same family: a canvas that locked to one answers the other.
function mockCanvas(lockedType = null) {
  let locked = lockedType === 'experimental-webgl' ? 'webgl' : lockedType;
  return {
    getContext(type) {
      const family = type === 'experimental-webgl' ? 'webgl' : type;
      if (locked === null) { locked = family; return { family }; }
      return family === locked ? { family } : null;
    },
  };
}
// The readback's ORIGINAL resolution, before webgl2 was added -- kept here only to prove leg 1 red.
const originalResolve = (canvas) => canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

test('calibration leg 1 (red before the fix): a webgl2 canvas was invisible to the original resolution', () => {
  const canvas = mockCanvas('webgl2');
  assert.equal(originalResolve(canvas), null);
  // Which is exactly what fed contextLive: false into classify, and classify calls that UNMEASURED.
  assert.equal(classify({ contextLive: !!originalResolve(canvas), nonBlank: null }).verdict, 'UNMEASURED');
});

test('calibration leg 2 (green after the fix): resolveGLContext finds the same webgl2 canvas', () => {
  const canvas = mockCanvas('webgl2');
  const ctx = resolveGLContext(canvas);
  assert.notEqual(ctx, null);
  assert.equal(classify({ contextLive: !!ctx, nonBlank: null }).verdict, 'UNMEASURED'); // no frame read yet
  assert.equal(classify({ contextLive: !!ctx, nonBlank: true }).verdict, 'PASS'); // once a frame is read
});

test('calibration leg 3: a plain webgl canvas resolves the same before and after the fix', () => {
  for (const lockedType of ['webgl', 'experimental-webgl']) {
    const before = mockCanvas(lockedType);
    const after = mockCanvas(lockedType);
    assert.notEqual(originalResolve(before), null);
    assert.notEqual(resolveGLContext(after), null);
  }
});

test('calibration leg 4 (must-red unmoved): a canvas with no context at all still resolves to null', () => {
  const canvas = { getContext: () => null }; // no context of any type, ever
  assert.equal(resolveGLContext(canvas), null);
  assert.equal(classify({ contextLive: !!resolveGLContext(canvas), nonBlank: null }).verdict, 'UNMEASURED');
});

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
