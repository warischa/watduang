// The persisted game contract (gh#305): game eligibility and the ladder equation every final record must
// satisfy. The ladder's fairness rests on one fact checked here exhaustively: for any fixed picks and slot
// layout, a uniform permutation gives every finalist every rank equally often.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as gc from './game-contract.ts';

const PICKS = ['a', 'b', 'c', 'd', 'e'];

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

test('no game anywhere is the default for an event that picked none', () => {
  assert.deepEqual(gc.NO_GAMES, { rounds: [null, null, null, null], final: null });
});

test('eligibility: elimination takes fireworks or cards; the final takes fireworks or ladder; null is always fine', () => {
  for (const g of [null, 'fireworks', 'cards']) assert.equal(gc.isCutGame(g), true, String(g));
  for (const g of ['ladder', 'nope', undefined, 1]) assert.equal(gc.isCutGame(g), false, String(g));
  for (const g of [null, 'fireworks', 'ladder']) assert.equal(gc.isFinalGame(g), true, String(g));
  for (const g of ['cards', 'nope', undefined]) assert.equal(gc.isFinalGame(g), false, String(g));
  assert.equal(gc.isGameChoices({ rounds: [null, 'cards', 'fireworks', null], final: 'ladder' }), true);
  assert.equal(gc.isGameChoices({ rounds: [null, 'ladder', null, null], final: null }), false, 'ladder is no cut game');
  assert.equal(gc.isGameChoices({ rounds: [null, null, null], final: null }), false, 'three rounds');
  assert.equal(gc.isGameChoices({ rounds: [null, null, null, null], final: 'cards' }), false, 'cards is no final game');
});

test('a five-lane permutation is a bijection of 0..4, nothing else', () => {
  assert.equal(gc.isFiveLanes([4, 3, 2, 1, 0]), true);
  assert.equal(gc.isFiveLanes([0, 0, 2, 3, 4]), false, 'a repeated lane');
  assert.equal(gc.isFiveLanes([0, 1, 2, 3]), false, 'four lanes');
  assert.equal(gc.isFiveLanes([0, 1, 2, 3, 5]), false, 'a lane out of range');
  assert.equal(gc.isFiveLanes([0, 1, 2, 3, 3.5]), false, 'a fractional lane');
});

test('the ladder equation: order[slotRanks[permutation[lane]]] = picks[lane]', () => {
  assert.deepEqual(gc.ladderOrder(PICKS, [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]), PICKS);
  // lane 0 exits at 2, slot 2 holds rank 4 -> 'a' is fifth; lane 4 exits at 0, slot 0 holds rank 1 -> 'e' is second.
  const order = gc.ladderOrder(PICKS, [2, 3, 4, 1, 0], [1, 3, 4, 0, 2]);
  assert.deepEqual(order, ['b', 'e', 'c', 'd', 'a']);
  assert.equal(gc.ladderConsistent({ order, picks: PICKS, permutation: [2, 3, 4, 1, 0], slotRanks: [1, 3, 4, 0, 2] }), true);
  assert.equal(
    gc.ladderConsistent({ order: ['a', 'e', 'c', 'd', 'b'], picks: PICKS, permutation: [2, 3, 4, 1, 0], slotRanks: [1, 3, 4, 0, 2] }),
    false,
    'an order that the ladder does not produce passed',
  );
  assert.equal(
    gc.ladderConsistent({ order, picks: ['b', 'e', 'c', 'd', 'b'], permutation: [2, 3, 4, 1, 0], slotRanks: [1, 3, 4, 0, 2] }),
    false,
    'repeated picks passed',
  );
  assert.throws(() => gc.ladderOrder(PICKS, [0, 0, 1, 2, 3], [0, 1, 2, 3, 4]), /permutation/);
  assert.throws(() => gc.ladderOrder(PICKS, [0, 1, 2, 3, 4], [0, 1, 2, 3, 3]), /slotRanks/);
});

test('equal chances: for every slot layout, the 120 permutations give each finalist each rank 24 times', () => {
  const lanes = [0, 1, 2, 3, 4];
  const all = permutations(lanes);
  assert.equal(all.length, 120);
  for (const slotRanks of all) {
    const tally = new Map(PICKS.map((p) => [p, [0, 0, 0, 0, 0]]));
    for (const permutation of all) {
      gc.ladderOrder(PICKS, permutation, slotRanks).forEach((id, rank) => tally.get(id)[rank]++);
    }
    for (const [id, ranks] of tally) assert.deepEqual(ranks, [24, 24, 24, 24, 24], `${id} under ${slotRanks}`);
  }
});

test('a round record for cards carries its deal and its rule; fireworks and null carry neither', () => {
  const base = { round: 1, code: 'x', survivors: ['a'] };
  assert.equal(gc.recordGame({ ...base, game: null }), null);
  assert.equal(gc.recordGame({ ...base, game: 'fireworks' }), 'fireworks');
  const deal = { pair: ['black', 'face'], cards: [{ id: 'a', card: { suit: 'S', rank: 1 } }] };
  assert.equal(gc.recordGame({ ...base, game: 'cards', deal, rule: 0 }), 'cards');
});
