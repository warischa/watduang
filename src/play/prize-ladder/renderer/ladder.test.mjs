// The ladder is built from the committed permutation, never drawn at random and accepted (gh#307). Checked
// exhaustively: every one of the 120 permutations of five lanes, under many reveal keys (the key only picks
// among legal ladders and spreads their rows; it never changes where a lane ends).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, MIN_RUNGS, ROWS, buildLadder, follow } from './ladder.ts';

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

const PERMS = permutations([0, 1, 2, 3, 4]);
const KEYS = Array.from({ length: 40 }, (_, i) => `event|final|K${i}`);

test('there are 120 permutations under test', () => {
  assert.equal(PERMS.length, 120);
  assert.equal(new Set(PERMS.map((p) => p.join(''))).size, 120);
});

test('every start lane, followed through the built rungs, ends at permutation[start]: 120 permutations x 40 keys', () => {
  let ladders = 0;
  let starts = 0;
  for (const perm of PERMS) {
    for (const key of KEYS) {
      const rungs = buildLadder(perm, key);
      ladders++;
      for (let start = 0; start < LANES; start++) {
        assert.equal(follow(rungs, start).exit, perm[start], `perm ${perm} key ${key} start ${start}`);
        starts++;
      }
    }
  }
  assert.equal(ladders, 4800);
  assert.equal(starts, 24000);
});

test('rungs join adjacent lanes only, one rung per row, rows strictly increasing, inside the grid', () => {
  for (const perm of PERMS) {
    for (const key of KEYS) {
      const rungs = buildLadder(perm, key);
      assert.ok(rungs.length >= MIN_RUNGS && rungs.length <= ROWS, `perm ${perm}: ${rungs.length} rungs`);
      rungs.forEach((r, i) => {
        assert.ok(Number.isInteger(r.left) && r.left >= 0 && r.left + 1 < LANES, `rung joins ${r.left} and ${r.left + 1}`);
        assert.ok(Number.isInteger(r.row) && r.row >= 0 && r.row < ROWS, `row ${r.row}`);
        if (i > 0) assert.ok(r.row > rungs[i - 1].row, `perm ${perm} key ${key}: rows not strictly increasing`);
        // Two identical rungs back to back undo each other: a path that bounces across and straight back.
        if (i > 0) assert.notEqual(r.left, rungs[i - 1].left, `perm ${perm} key ${key}: a rung repeats the one before it`);
      });
      assert.equal(new Set(rungs.map((r) => r.row)).size, rungs.length, 'two rungs share a row');
    }
  }
});

test('the ladder is a function of (permutation, key): a refresh redraws the same one', () => {
  for (const perm of PERMS) {
    assert.deepEqual(buildLadder(perm, 'same'), buildLadder(perm, 'same'));
  }
});

test('the paths are a bijection: no two starts end in one slot', () => {
  for (const perm of PERMS) {
    const rungs = buildLadder(perm, 'k');
    const exits = [0, 1, 2, 3, 4].map((s) => follow(rungs, s).exit);
    assert.equal(new Set(exits).size, 5);
  }
});

test('a permutation that is not a five-lane bijection is refused, never repaired', () => {
  for (const bad of [[0, 0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3, 5], [0, 1, 2, 3, 4, 0]]) {
    assert.throws(() => buildLadder(bad, 'k'), /bijection/);
  }
});

test('follow records each crossing in row order, and a path with no crossing runs straight', () => {
  const rungs = [
    { row: 1, left: 0 },
    { row: 4, left: 1 },
    { row: 7, left: 3 },
  ];
  assert.deepEqual(follow(rungs, 0), { exit: 2, crossings: [{ row: 1, from: 0, to: 1 }, { row: 4, from: 1, to: 2 }] });
  assert.deepEqual(follow(rungs, 2), { exit: 1, crossings: [{ row: 4, from: 2, to: 1 }] });
  assert.deepEqual(follow([], 3), { exit: 3, crossings: [] });
});
