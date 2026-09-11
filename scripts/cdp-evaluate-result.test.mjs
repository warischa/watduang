// The fail-open this pins: a CDP reply that carries NO result envelope at all — {id, error:{...}},
// which is what Chrome sends when the execution context is destroyed by a navigation mid-evaluate.
// The old mapper read that as {value: null}, and a caller checking `.value` before acting fell
// straight through it: the walk kept measuring, under the previous route's name.
//
// Pinned here rather than in a browser because the shape is Chrome's wire format, not a rendering:
// a test that needs a headless Chrome to prove a null cannot run when the browser is the thing that
// broke.
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateResult, locationReadFailure } from './cdp-evaluate-result.mjs';

const DESTROYED = 'Cannot find context with specified id';
const protocolError = { id: 7, error: { code: -32000, message: DESTROYED } };
const okNull = { id: 7, result: { result: { type: 'object', subtype: 'null', value: null } } };
const okPath = { id: 7, result: { result: { type: 'string', value: '/game/short-stick/play/' } } };

test('a reply with no result envelope is an error, never a value', () => {
  const r = evaluateResult(protocolError);
  assert.equal(r.value, undefined, 'a failed call must not hand back a value key at all');
  assert.match(r.error, new RegExp(DESTROYED));
});

test('an envelope with neither result nor error still fails closed', () => {
  assert.match(evaluateResult({ id: 7 }).error, /no result envelope/);
  assert.match(evaluateResult(undefined).error, /no result envelope/);
});

test('a legitimate null is still a value, and is distinguishable from the error', () => {
  const r = evaluateResult(okNull);
  assert.deepEqual(r, { value: null }, 'an expression that really evaluated to null carries no error');
  assert.equal(r.error, undefined);
  // The distinction the whole fix turns on, asserted as one comparison rather than two shapes.
  assert.notDeepEqual(evaluateResult(protocolError), r);
});

test('a thrown expression keeps reporting as an error', () => {
  const thrown = { id: 7, result: { exceptionDetails: { text: 'Uncaught', exception: { description: 'TypeError: x' } } } };
  assert.match(evaluateResult(thrown).error, /TypeError: x/);
});

// The connector: the mapper's output is what the walking probes' location check consumes. Pinning
// the two halves separately would leave the case where each is right and the pair is wrong.
test('a destroyed context reaches the probes as a failure naming the protocol message', () => {
  const why = locationReadFailure(evaluateResult(protocolError));
  assert.ok(why, 'a protocol error must never be usable as a location');
  assert.match(why, new RegExp(DESTROYED), 'the probe row has to carry what Chrome said, not a generic null');
});

test('a real pathname passes the location check, and a missing one does not', () => {
  assert.equal(locationReadFailure(evaluateResult(okPath)), null);
  assert.match(locationReadFailure(evaluateResult(okNull)), /no pathname at all/);
});
