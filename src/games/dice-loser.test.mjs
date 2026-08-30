// node --test src/games/dice-loser.test.mjs — no framework, no dependency.
// Covers the pure round rule exported from dice-loser.ts: three dice per player, the group picks up
// front whether the HIGH or the LOW total loses, and a tie AT THE LOSING SCORE sends exactly the tied
// players into a tiebreak round. No DOM is needed — the play route drives these same two functions.
//
// The input that separates a right implementation from a wrong one is a TIE, and specifically a tie
// that is NOT at the losing end: HIGH_LOSES over [10, 10, 18] has one loser (18) even though two
// players are level. A version that reads "any tie -> tiebreak" passes every non-tied case and fails
// only here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { rollDice, resolveRound } from './dice-loser.ts';

/** mulberry32 — seeded, so every roll assertion below is deterministic across machines and runs. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('HIGH_LOSES picks the single highest total', () => {
  const r = resolveRound([9, 14, 7], 'HIGH_LOSES');
  assert.equal(r.status, 'FINAL_LOSER');
  assert.equal(r.loserIndex, 1);
  assert.equal(r.losingScore, 14);
  assert.deepEqual([...r.tiedIndexes], []);
});

test('LOW_LOSES picks the single lowest total', () => {
  const r = resolveRound([9, 14, 7], 'LOW_LOSES');
  assert.equal(r.status, 'FINAL_LOSER');
  assert.equal(r.loserIndex, 2);
  assert.equal(r.losingScore, 7);
});

test('the two conditions disagree on the same totals — the choice is load-bearing', () => {
  const totals = [3, 11, 18];
  assert.equal(resolveRound(totals, 'HIGH_LOSES').loserIndex, 2);
  assert.equal(resolveRound(totals, 'LOW_LOSES').loserIndex, 0);
});

// ---- ties: the divergent input ----

test('a tie AT the losing score sends exactly the tied players to a tiebreak', () => {
  const r = resolveRound([18, 11, 18], 'HIGH_LOSES');
  assert.equal(r.status, 'TIEBREAK');
  assert.equal(r.loserIndex, null);
  assert.equal(r.losingScore, 18);
  assert.deepEqual([...r.tiedIndexes], [0, 2]);
});

test('a tie AWAY from the losing score is not a tiebreak — one loser still stands', () => {
  // HIGH_LOSES: 10 and 10 are level but irrelevant; 18 loses outright.
  const high = resolveRound([10, 10, 18], 'HIGH_LOSES');
  assert.equal(high.status, 'FINAL_LOSER');
  assert.equal(high.loserIndex, 2);
  // LOW_LOSES over the same totals: now the level pair IS the losing score.
  const low = resolveRound([10, 10, 18], 'LOW_LOSES');
  assert.equal(low.status, 'TIEBREAK');
  assert.deepEqual([...low.tiedIndexes], [0, 1]);
});

test('every player level = every player in the tiebreak, under either condition', () => {
  for (const condition of ['HIGH_LOSES', 'LOW_LOSES']) {
    const r = resolveRound([12, 12, 12, 12], condition);
    assert.equal(r.status, 'TIEBREAK');
    assert.deepEqual([...r.tiedIndexes], [0, 1, 2, 3]);
  }
});

test('indexes returned are positions in the totals handed in, so a tiebreak subset resolves too', () => {
  // Round 1: seats 0 and 2 tie at 18. Round 2 is played by those two ALONE, so resolveRound is
  // handed two totals and returns 0 or 1 — the caller maps them back to the seats it sent.
  const first = resolveRound([18, 11, 18], 'HIGH_LOSES');
  const tiedSeats = [...first.tiedIndexes];
  const second = resolveRound([13, 16], 'HIGH_LOSES');
  assert.equal(second.status, 'FINAL_LOSER');
  assert.equal(tiedSeats[second.loserIndex], 2);
});

test('a tiebreak can tie again, and the subset only ever shrinks or holds', () => {
  let active = [0, 1, 2, 3];
  let totals = [15, 15, 15, 9];
  let guard = 0;
  let loser = null;
  while (loser === null) {
    assert.ok(guard++ < 10, 'tiebreak did not converge');
    const r = resolveRound(totals, 'HIGH_LOSES');
    if (r.status === 'FINAL_LOSER') {
      loser = active[r.loserIndex];
      break;
    }
    const next = [...r.tiedIndexes].map((i) => active[i]);
    assert.ok(next.length >= 2, 'a TIEBREAK must name at least two players');
    assert.ok(next.length <= active.length, 'a tiebreak round must never grow the field');
    active = next;
    // Round 2: the three tied at 15 roll again and one of them rolls high alone.
    totals = [12, 17, 12];
  }
  assert.equal(loser, 1);
});

test('an empty field is a programming error, not a silent zero', () => {
  assert.throws(() => resolveRound([], 'HIGH_LOSES'), /dice-loser/);
});

test('an unknown lose condition is rejected rather than defaulting', () => {
  assert.throws(() => resolveRound([5, 6], 'CURSED'), /dice-loser/);
});

// ---- the dice themselves ----

test('rollDice returns three faces in 1..6 and a total that is their sum', () => {
  const rand = seeded(12345);
  for (let i = 0; i < 500; i += 1) {
    const roll = rollDice(rand);
    assert.equal(roll.dice.length, 3);
    for (const face of roll.dice) {
      assert.ok(Number.isInteger(face), `face ${face} is not an integer`);
      assert.ok(face >= 1 && face <= 6, `face ${face} is outside 1..6`);
    }
    assert.equal(roll.total, roll.dice[0] + roll.dice[1] + roll.dice[2]);
    assert.ok(roll.total >= 3 && roll.total <= 18);
  }
});

test('rollDice is a pure function of the rand it is given — same seed, same rolls', () => {
  const a = Array.from({ length: 20 }, (() => { const r = seeded(7); return () => rollDice(r); })());
  const b = Array.from({ length: 20 }, (() => { const r = seeded(7); return () => rollDice(r); })());
  assert.deepEqual(a, b);
});

test('both boundary faces are reachable — rand at 0 and just under 1', () => {
  assert.deepEqual(rollDice(() => 0).dice, [1, 1, 1]);
  assert.deepEqual(rollDice(() => 0.999999).dice, [6, 6, 6]);
});

// ---- the module contract ----

test('the module declares the play route and the party shape', () => {
  assert.equal(game.id, 'dice-loser');
  assert.equal(game.category, 'party');
  assert.equal(game.playRoute, '/game/dice-loser/play/');
  assert.deepEqual(game.players, [2, 10]);
  assert.equal(game.startsRound, true);
});
