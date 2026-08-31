// The losing rule of wire-snip-panic, stated once and falsifiably:
//
//   the player who loses is the one whose turn it was when the bomb went off -- the seat holding the
//   phone. Detonation ends the round, so it never applies the survivor advance; the next seat is a
//   bystander and must not be blamed.
//
// This is the shape that goes wrong silently. A round ends in exactly two ways -- the sequence is
// cleared (advance) or a wire is cut wrong / the clock runs out (detonate) -- and an implementation
// that treats the detonation as just another turn ending blames seat+1. Nothing in the DOM, the
// types, the build or the layout probes can see that: the modal still names A player, with a real
// avatar and a real score row.
//
// THE DIVERGENT INPUT, chosen because most inputs measure nothing here:
//   playerCount 3, four survived turns, then a detonation -> the correct rule says seat 1, the
//   off-by-one says seat 2. Inputs that CANNOT tell them apart, and are therefore useless as the
//   only case: playerCount 1 (every rule answers 0), and any run where the seat happens to sit one
//   below the wrap point (2 survived turns of 3 -> correct 2, mutant 0 -- different, but a third
//   wrong rule "always the last seat" also answers 2).
//
// Calibration is built in, so this file cannot pass while measuring nothing:
//   * `mutantLoserOf` below is that off-by-one. Test 3 asserts it FAILS the invariant -- if a future
//     edit made the mutant agree with the shipped rule, the assertion here is what goes red.
//   * WSP_LOSER_MUTANT=1 feeds the mutant into test 1, the real assertion, which then fails. That is
//     the must-red run:
//     `WSP_LOSER_MUTANT=1 node --test src/play/wire-snip-panic/turn-rules.test.mjs`
//
//   node --test src/play/wire-snip-panic/turn-rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterSurvivedTurn, loserOf, INITIAL_TURN_STATE } from './turn-rules.ts';

const PLAYERS = 3;

/** The mutant: the detonation is treated as an ordinary turn ending, so the seat advances first and
 *  the round is lost by the player who never touched a wire. */
const mutantLoserOf = (state, playerCount) => (state.currentPlayerIndex + 1) % playerCount;

const activeLoserOf = process.env.WSP_LOSER_MUTANT === '1' ? mutantLoserOf : (s) => loserOf(s);

/** Plays `survived` clean turns from a fresh match and returns the state the bomb goes off in. */
const playSurvivedTurns = (survived, playerCount) => {
  let state = INITIAL_TURN_STATE;
  for (let i = 0; i < survived; i++) state = afterSurvivedTurn(state, playerCount);
  return state;
};

test('the loser is the seat holding the bomb, not the next one', () => {
  const state = playSurvivedTurns(4, PLAYERS);
  // Seats 0,1,2,0 each survived; seat 1 is holding it now and is the one who cut wrong.
  assert.equal(state.currentPlayerIndex, 1);
  assert.equal(activeLoserOf(state, PLAYERS), 1);
});

test('every seat in a full rotation is blamed exactly once, and never a bystander', () => {
  const blamed = [];
  for (let survived = 0; survived < PLAYERS * 2; survived++) {
    blamed.push(activeLoserOf(playSurvivedTurns(survived, PLAYERS), PLAYERS));
  }
  assert.deepEqual(blamed, [0, 1, 2, 0, 1, 2]);
});

test('the mutant really does disagree -- this file is calibrated', () => {
  const state = playSurvivedTurns(4, PLAYERS);
  assert.notEqual(mutantLoserOf(state, PLAYERS), loserOf(state));
});

test('a survived turn escalates the round only on a completed rotation', () => {
  // Round level drives the time limit, so an escalation one turn early shortens a player's clock.
  const levels = [];
  let state = INITIAL_TURN_STATE;
  for (let i = 0; i < PLAYERS * 2; i++) {
    state = afterSurvivedTurn(state, PLAYERS);
    levels.push(state.roundLevel);
  }
  assert.deepEqual(levels, [1, 1, 2, 2, 2, 3]);
});
