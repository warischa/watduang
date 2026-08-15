// node --test src/games/short-stick.test.mjs — no framework, no dependency
// checks only the pure round helpers exported from short-stick.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRound, draw } from './short-stick.ts';

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const roster = (size) => Array.from({ length: size }, (_, i) => `คนที่ ${i + 1}`);

/** Drives the real tap loop the DOM drives: draw one stick per turn, stop the instant a short
 *  one surfaces. Nothing here reimplements the rule — every answer comes from draw(). */
function playOut(round) {
  const drawn = [];
  for (let turn = 0; turn < round.order.length; turn++) {
    const result = draw(round, turn);
    drawn.push(result.player);
    if (result.isShort) return drawn;
  }
  throw new Error('round never ended — no short stick surfaced');
}

test('exactly one stick in the bundle is short, at every roster size 2..10', () => {
  for (const size of SIZES) {
    // midpoint rand, one per index — probes every possible shortAt, not just one
    for (let i = 0; i < size; i++) {
      const round = startRound(roster(size), () => (i + 0.5) / size);
      const shorts = round.order.filter((_, turn) => draw(round, turn).isShort);
      assert.equal(shorts.length, 1, `size ${size}, shortAt ${round.shortAt}: ${shorts.length} short sticks`);
    }
  }
});

test('the drawn sequence is a prefix of the pass order — nobody draws twice, nobody is skipped', () => {
  for (const size of SIZES) {
    for (let i = 0; i < size; i++) {
      const players = roster(size);
      const round = startRound(players, () => (i + 0.5) / size);
      const drawn = playOut(round);
      // Pin the pass order to the roster as entered. Without this every other assertion
      // compares round.order against itself, and a reordered bundle ships green.
      assert.deepEqual(round.order, players, `size ${size}: pass order is not the roster as entered`);
      assert.deepEqual(drawn, round.order.slice(0, drawn.length), `size ${size}: drew out of pass order`);
      assert.equal(new Set(drawn).size, drawn.length, `size ${size}: a player drew twice`);
    }
  }
});

test('the round ends AT the short stick — never a draw more, never a draw less', () => {
  for (const size of SIZES) {
    for (let i = 0; i < size; i++) {
      const round = startRound(roster(size), () => (i + 0.5) / size);
      const drawn = playOut(round);
      assert.equal(drawn.length, round.shortAt + 1, `size ${size}, shortAt ${round.shortAt}`);
      assert.equal(drawn.at(-1), round.order[round.shortAt]);
      // every earlier draw was a long stick — otherwise the round should already have ended
      for (let turn = 0; turn < round.shortAt; turn++) {
        assert.equal(draw(round, turn).isShort, false, `size ${size}: short stick surfaced early at ${turn}`);
      }
    }
  }
});

test('the short stick reaches every player — no index is unreachable', () => {
  for (const size of SIZES) {
    const players = roster(size);

    // deterministic: each injected value must land on its own index — an off-by-one that
    // excludes the last player (or the first) fails here
    for (let i = 0; i < size; i++) {
      assert.equal(startRound(players, () => (i + 0.5) / size).shortAt, i, `size ${size}: index ${i} unreachable`);
    }
    assert.equal(startRound(players, () => 0).shortAt, 0);
    assert.equal(startRound(players, () => 1 - Number.EPSILON).shortAt, size - 1);

    // and with real randomness, coverage equals the roster
    const seen = new Set();
    for (let n = 0; n < 500; n++) seen.add(startRound(players).shortAt);
    assert.equal(seen.size, size, `size ${size}: coverage ${seen.size}/${size}`);
  }
});

test('the players bounds both work — a round of 2 and a round of 10', () => {
  for (const size of [2, 10]) {
    const round = startRound(roster(size));
    assert.equal(round.order.length, size);
    assert.ok(round.shortAt >= 0 && round.shortAt < size, `shortAt ${round.shortAt} out of set`);
    const drawn = playOut(round);
    assert.ok(drawn.length >= 1 && drawn.length <= size);
    assert.deepEqual(drawn, round.order.slice(0, drawn.length));
  }
});

test('the round is keyed on turn, not on name — duplicate names stay distinguishable', () => {
  const round = startRound(['เอ', 'เอ', 'เอ'], () => 2.5 / 3);
  assert.equal(round.shortAt, 2);
  assert.equal(playOut(round).length, 3);
});

test('drawing outside the bundle throws instead of returning an undefined player', () => {
  const round = startRound(roster(3), () => 0);
  assert.throws(() => draw(round, 3), /นอกกำ/);
  assert.throws(() => draw(round, -1), /นอกกำ/);
});

test('an empty roster must throw, not start a round nobody can lose', () => {
  assert.throws(() => startRound([]), /ว่างเปล่า/);
});
