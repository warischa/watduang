// The shared pick final (gh#317 envelopes, gh#318 flipcards): every object opens to the prize its picker drew,
// whatever the picks are. Exhaustive over the whole space: 120 drawn orders x 1 to 5 prizes x 120 pick
// assignments. Every expectation is derived here from the record (order.indexOf of the picker), never from
// the module's own arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFinalPickPlan, BEATS, finalPickPlan, STEP } from './plan.ts';

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

const IDS = ['a', 'b', 'c', 'd', 'e'];
const ARRANGEMENTS = permutations(IDS);

/** The reveal order the boards draw: the objects that win nothing left to right, then prize N down to prize 1. */
function expectedRevealOrder(picks, order, n) {
  const rankOf = (i) => order.indexOf(picks[i]);
  const idx = [0, 1, 2, 3, 4];
  const none = idx.filter((i) => rankOf(i) >= n);
  const prizes = idx.filter((i) => rankOf(i) < n).sort((x, y) => rankOf(y) - rankOf(x));
  return [...none, ...prizes];
}

test('120 orders x 1 to 5 prizes x 120 picks: each finalist\'s object shows their drawn prize; prize 1 opens last', () => {
  let cases = 0;
  let objects = 0;
  let noPrize = 0;
  for (const order of ARRANGEMENTS) {
    for (let n = 1; n <= 5; n++) {
      for (const picks of ARRANGEMENTS) {
        const plan = finalPickPlan(picks, order, n);
        cases++;
        assert.equal(plan.objects.length, 5);
        plan.objects.forEach((o, i) => {
          const rank = order.indexOf(picks[i]);
          assert.equal(o.index, i);
          assert.equal(o.id, picks[i], `object ${i} names someone other than its picker`);
          assert.equal(o.rank, rank);
          assert.equal(o.prize, rank < n ? rank : null, `order ${order} picks ${picks} n ${n} object ${i}`);
          if (o.prize === null) noPrize++;
          objects++;
        });
        assert.deepEqual(plan.revealOrder, expectedRevealOrder(picks, order, n));
        const last = plan.objects[plan.revealOrder[4]];
        assert.equal(last.prize, 0, 'the last object to open is not prize 1');
        assert.equal(last.id, order[0]);
        // The objects that win nothing open before any object that wins.
        const firstPrize = plan.revealOrder.findIndex((i) => plan.objects[i].prize !== null);
        assert.equal(firstPrize, 5 - n);
        assertFinalPickPlan(plan, picks, order, n);
      }
    }
  }
  assert.equal(cases, 72000);
  assert.equal(objects, 360000);
  // Per order and picks, 5 - n objects win nothing: (4+3+2+1+0) x 14400.
  assert.equal(noPrize, 144000);
});

test('the pick never changes the odds: for fixed picks, each object lands on each rank 24 times in 120 orders', () => {
  for (const picks of [IDS, [...IDS].reverse(), ['c', 'a', 'e', 'b', 'd']]) {
    const tally = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]);
    for (const order of ARRANGEMENTS) {
      for (const o of finalPickPlan(picks, order, 3).objects) tally[o.index][o.rank]++;
    }
    for (const row of tally) assert.deepEqual(row, [24, 24, 24, 24, 24], `picks ${picks}`);
  }
});

test('an incomplete, duplicate or foreign pick, a bad order or a prize count outside 1..5 is refused', () => {
  const order = ['b', 'd', 'a', 'e', 'c'];
  const picks = ['a', 'b', 'c', 'd', 'e'];
  assert.doesNotThrow(() => finalPickPlan(picks, order, 3));
  const refused = {
    'an empty object': [['a', null, 'c', 'd', 'e'], order, 3, /pick/],
    'four picks': [['a', 'b', 'c', 'd'], order, 3, /pick/],
    'six picks': [[...picks, 'f'], order, 3, /pick/],
    'a finalist twice': [['a', 'a', 'c', 'd', 'e'], order, 3, /pick/],
    'a stranger': [['a', 'b', 'c', 'd', 'x'], order, 3, /pick/],
    'a non-string pick': [['a', 'b', 'c', 'd', 5], order, 3, /pick/],
    'not an array': ['abcde', order, 3, /pick/],
    'a short order': [picks, order.slice(0, 4), 3, /order/],
    'an order with a repeat': [picks, ['b', 'b', 'a', 'e', 'c'], 3, /order/],
    'a sparse order': [picks, [, 'd', 'a', 'e', 'c'], 3, /order/],
    'no prize': [picks, order, 0, /prize count/],
    'six prizes': [picks, order, 6, /prize count/],
    'a fractional count': [picks, order, 2.5, /prize count/],
  };
  for (const [label, [p, o, n, re]] of Object.entries(refused)) assert.throws(() => finalPickPlan(p, o, n), re, label);
});

test('a mutated plan is refused, never repaired', () => {
  const order = ['b', 'd', 'a', 'e', 'c'];
  const picks = ['a', 'b', 'c', 'd', 'e'];
  const good = finalPickPlan(picks, order, 3);
  const mutants = {
    'two prizes swapped': (p) => ([p.objects[0].prize, p.objects[1].prize] = [p.objects[1].prize, p.objects[0].prize]),
    'a picker renamed': (p) => (p.objects[2].id = 'b'),
    'a rank moved': (p) => (p.objects[3].rank = 0),
    'a no-prize object given a prize': (p) => (p.objects.find((o) => o.prize === null).prize = 4),
    'prize 1 opened first': (p) => p.revealOrder.reverse(),
    'an object opened twice': (p) => (p.revealOrder[0] = p.revealOrder[1]),
    'an object dropped': (p) => p.objects.pop(),
    'objects out of place': (p) => p.objects.reverse(),
  };
  for (const [label, mutate] of Object.entries(mutants)) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => assertFinalPickPlan(bad, picks, order, 3), /plan/, label);
  }
  assert.doesNotThrow(() => assertFinalPickPlan(structuredClone(good), picks, order, 3));
});

test('the shared pace: one object is 600 + 6400 = 7000ms, so five objects and the result make 36700', () => {
  // The MC names each object as it opens, about 7 s each (owner ruling 2026-11-17): the hold is the beat that
  // carries the naming, and a renderer that copies its own shorter hold drifts off this pace.
  assert.equal(BEATS.idle, 1500);
  assert.equal(BEATS.turn, 600);
  assert.equal(BEATS.hold, 6400);
  assert.equal(BEATS.result, 200);
  assert.equal(STEP, BEATS.turn + BEATS.hold);
  assert.equal(STEP, 7000);
  assert.equal(BEATS.idle + 5 * STEP + BEATS.result, 36700);
});
