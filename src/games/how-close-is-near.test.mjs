// node --test src/games/how-close-is-near.test.mjs — no framework, no dependency.
// Pins the distance-to-target rule the whole game turns on. Every assertion here is DOM-free: the
// rule is pure and the play route (src/play/how-close-is-near/main.js) imports these same exports,
// so there is exactly one implementation of "who loses" on the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, {
  MIN_NUMBER,
  MAX_NUMBER,
  NEAREST_LOSES,
  FARTHEST_LOSES,
  distanceTo,
  isLegalNumber,
  pickConflict,
  resolveLoser,
  drawTarget,
} from './how-close-is-near.ts';

const pick = (id, number, target) => ({ id, number, distance: distanceTo(number, target) });

// ---------------------------------------------------------------------------
// The far side of the target — the input where abs() and a raw signed subtraction disagree.
// A wrong version computing `number - target` (no abs) ranks a guess BELOW the target as the
// smallest value, so it names the opposite loser in BOTH modes. 55 is 5 away, 30 is 20 away.
// ---------------------------------------------------------------------------
test('far side of the target: a guess above the target can still be the nearest', () => {
  const target = 50;
  assert.equal(distanceTo(55, target), 5);
  assert.equal(distanceTo(30, target), 20);
  // Signed subtraction would give -20 and +5 — the two lines below would then swap answers.
  const picks = [pick('a', 30, target), pick('b', 55, target)];
  assert.equal(resolveLoser(picks, NEAREST_LOSES).id, 'b');
  assert.equal(resolveLoser(picks, FARTHEST_LOSES).id, 'a');
});

test('far side is symmetric: equal steps either way are equally far', () => {
  assert.equal(distanceTo(43, 50), distanceTo(57, 50));
  assert.equal(distanceTo(0, 100), 100);
  assert.equal(distanceTo(100, 0), 100);
});

// ---------------------------------------------------------------------------
// The exact tie. The game keeps ties out of the results screen by REFUSING the second pick at the
// same distance (that is the tie rule players meet), but resolveLoser must still be total and
// deterministic if a tie ever reaches it — first in turn order, never a coin flip.
// ---------------------------------------------------------------------------
test('a tie in distance is refused at pick time, in both directions of the target', () => {
  const target = 50;
  const taken = [pick('a', 45, target)]; // distance 5
  // 55 is the mirror of 45: a different NUMBER, the identical DISTANCE. A conflict check that only
  // compared numbers would wave this through and produce a tied results screen.
  assert.equal(pickConflict(55, target, taken), 'distance');
  assert.equal(pickConflict(45, target, taken), 'number');
  assert.equal(pickConflict(56, target, taken), null);
});

test('the target itself is a legal pick, and distance 0 is a real distance in the taken set', () => {
  const target = 50;
  assert.equal(distanceTo(50, target), 0);
  assert.equal(pickConflict(50, target, []), null);
  // ponytail: 0 is falsy — a conflict check written as `if (distance)` skips it and lets a second
  // player also land exactly on the target.
  assert.equal(pickConflict(50, target, [pick('a', 50, target)]), 'number');
});

test('resolveLoser is deterministic on a tie: earliest in turn order, both modes', () => {
  const target = 50;
  const tied = [pick('a', 45, target), pick('b', 55, target)]; // both distance 5
  assert.equal(resolveLoser(tied, NEAREST_LOSES).id, 'a');
  assert.equal(resolveLoser(tied, FARTHEST_LOSES).id, 'a');
  // Reversing the input reverses the answer — proves it reads turn order and not the id.
  const reversed = [...tied].reverse();
  assert.equal(resolveLoser(reversed, NEAREST_LOSES).id, 'b');
  assert.equal(resolveLoser(reversed, FARTHEST_LOSES).id, 'b');
});

// ---------------------------------------------------------------------------
// Both modes over a whole roster, and the mode flag actually branching.
// ---------------------------------------------------------------------------
test('both modes name opposite ends of the same roster', () => {
  const target = 40;
  const picks = [
    pick('a', 40, target), // 0
    pick('b', 39, target), // 1
    pick('c', 47, target), // 7
    pick('d', 100, target), // 60
  ];
  assert.equal(resolveLoser(picks, NEAREST_LOSES).id, 'a');
  assert.equal(resolveLoser(picks, FARTHEST_LOSES).id, 'd');
});

test('resolveLoser does not reorder its input', () => {
  const target = 50;
  const picks = [pick('a', 90, target), pick('b', 51, target)];
  const before = picks.map((p) => p.id);
  resolveLoser(picks, NEAREST_LOSES);
  assert.deepEqual(
    picks.map((p) => p.id),
    before,
  );
});

test('resolveLoser refuses an empty round rather than returning undefined', () => {
  assert.throws(() => resolveLoser([], NEAREST_LOSES));
});

// ---------------------------------------------------------------------------
// Range, at both edges — the off-by-one seam. 0 and 100 are IN, -1 and 101 are OUT.
// ---------------------------------------------------------------------------
test('the legal range is 0..100 inclusive at both ends', () => {
  assert.equal(MIN_NUMBER, 0);
  assert.equal(MAX_NUMBER, 100);
  for (const n of [MIN_NUMBER, 1, 50, MAX_NUMBER - 1, MAX_NUMBER]) {
    assert.equal(isLegalNumber(n), true, `${n} must be legal`);
  }
  for (const n of [MIN_NUMBER - 1, MAX_NUMBER + 1, 1.5, NaN, Infinity, '5', null, undefined]) {
    assert.equal(isLegalNumber(n), false, `${String(n)} must be rejected`);
  }
});

test('an out-of-range pick is a conflict of its own, never silently accepted', () => {
  assert.equal(pickConflict(101, 50, []), 'range');
  assert.equal(pickConflict(-1, 50, []), 'range');
});

// ---------------------------------------------------------------------------
// Seeded target draw — deterministic, and inside the range at both extremes of the seed.
// ---------------------------------------------------------------------------
test('drawTarget is seeded, deterministic, and covers 0..100 inclusive', () => {
  assert.equal(drawTarget(() => 0), MIN_NUMBER);
  // Just under 1 must land on MAX, not MAX + 1 — the classic floor()-range off-by-one.
  assert.equal(drawTarget(() => 0.999999), MAX_NUMBER);
  assert.equal(drawTarget(() => 0.5), 50);
  // Midpoint seeds, the idiom short-stick.test.mjs uses. A bare `i / 101` is NOT safe here: the
  // round trip loses a bit and 29/101*101 lands just under 29, collapsing three buckets — the
  // probe's own arithmetic, not the engine's. Measured: 99 distinct with i/101, 101 with midpoints.
  const seen = new Set();
  for (let i = 0; i < 101; i++) seen.add(drawTarget(() => (i + 0.5) / 101));
  assert.equal(seen.size, 101, 'every value in 0..100 must be reachable');
  assert.equal(Math.min(...seen), MIN_NUMBER);
  assert.equal(Math.max(...seen), MAX_NUMBER);
});

// ---------------------------------------------------------------------------
// The manifest entry itself — the landing page contract.
// ---------------------------------------------------------------------------
test('the module declares the full-screen play route and a party round', () => {
  assert.equal(game.id, 'how-close-is-near');
  assert.equal(game.category, 'party');
  assert.equal(game.playRoute, '/game/how-close-is-near/play/');
  assert.equal(game.startsRound, true);
  assert.deepEqual(game.players, [2, 10]);
});
