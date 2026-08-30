// node --test src/games/pinocchio-luck.test.mjs — no framework, no dependency.
//
// Covers the round rule only: nose growth, the round-ending condition, and who loses. The rule lives
// in pinocchio-luck.ts and NOTHING re-implements it here — src/play/pinocchio-luck/main.js imports
// the same functions, so a green here is a green for the page. Every draw goes through an injected
// rng, so no assertion depends on Math.random.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE,
  QUESTIONS,
  makeSeq,
  makeMatch,
  assignRound,
  currentPlayer,
  resolveChoice,
  advanceTurn,
  finishRound,
  getLoser,
} from './pinocchio-luck.ts';

const roster = (n) => Array.from({ length: n }, (_, i) => `คนที่ ${i + 1}`);

/** A match whose shuffles are fixed. 0.5 walks every Fisher-Yates and every randomChoice down the
 *  same branch on every run, so the state below is byte-identical between runs and between machines. */
const fixedMatch = (n) => makeMatch(roster(n), makeSeq([], 0.5));

/** Answers the current player's question, `correct` deciding whether the pick matches the assigned
 *  answer. The assigned answer is READ, never assumed — resolveChoice owns the comparison.
 *  The phase step mirrors the page: a round opens in PASS and the "พร้อมแล้ว" tap reveals the
 *  question, so a test that skipped it would be answering a question nobody had been shown. */
function answerAs(state, correct) {
  state.phase = PHASE.QUESTION;
  const p = currentPlayer(state);
  const wrong = ['A', 'B', 'C'].find((c) => c !== p.assignedCorrectChoice);
  return resolveChoice(state, correct ? p.assignedCorrectChoice : wrong);
}

/** Plays a whole round, `correctness[i]` deciding the i-th player in turn order. Returns the loser
 *  finishRound named (null when nobody grew a nose). */
function playRound(state, correctness) {
  for (const ok of correctness) {
    answerAs(state, ok);
    state.phase = PHASE.TURN_RESULT;
    var ended = advanceTurn(state);
  }
  return ended;
}

test('a wrong answer grows the nose and a correct one does not', () => {
  const state = fixedMatch(4);
  playRound(state, [true, false, true, false]);
  const order = state.turnOrder.map((id) => state.players.find((p) => p.id === id));
  assert.equal(order[0].nose, 0, 'answered correctly, nose must stay 0');
  assert.equal(order[2].nose, 0, 'answered correctly, nose must stay 0');
  assert.ok(order[1].nose > 0, 'answered wrong, nose must grow');
  assert.ok(order[3].nose > 0, 'answered wrong, nose must grow');
});

test('growth values are drawn from the 1..10 pool without replacement', () => {
  const state = fixedMatch(10);
  playRound(state, Array(10).fill(false));
  const grown = state.players.map((p) => p.nose).sort((a, b) => a - b);
  assert.deepEqual(grown, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// THE DIVERGENCE INPUT. Everyone answers correctly, so every nose is 0. A rule that ends the round by
// simply naming the highest nose is indistinguishable from the right one on every other input: it
// still returns a player, and that player still has the largest nose. Only here do the two answers
// split — right says "nobody lost, play again", wrong crowns a loser whose nose never grew.
test('a round where everyone answers correctly ends in ALL_SAFE with no loser', () => {
  const state = fixedMatch(5);
  const loser = playRound(state, Array(5).fill(true));
  assert.equal(loser, null, 'no nose grew, so no player may be named the loser');
  assert.equal(state.phase, PHASE.ALL_SAFE);
  assert.ok(state.players.every((p) => p.nose === 0));
});

test('a round with at least one wrong answer ends in RESULTS naming the longest nose', () => {
  const state = fixedMatch(4);
  const loser = playRound(state, [true, false, true, true]);
  assert.equal(state.phase, PHASE.RESULTS);
  assert.ok(loser, 'a grown nose must produce a loser');
  assert.equal(loser.nose, Math.max(...state.players.map((p) => p.nose)));
});

test('the round does not end while players are still to answer', () => {
  const state = fixedMatch(3);
  answerAs(state, false);
  state.phase = PHASE.TURN_RESULT;
  assert.equal(advanceTurn(state), null);
  assert.equal(state.phase, PHASE.PASS, 'the phone passes on, the round is not over');
  assert.equal(state.currentTurnIndex, 1);
});

// getLoser scans with a strict >, which keeps the FIRST maximum. Ties cannot arise from the pool
// (the draws are distinct), so this pins the comparison directly — a >= would silently return
// the later player and no gameplay input would ever show it.
test('a tie on nose length keeps the earlier player as the loser', () => {
  const state = fixedMatch(3);
  state.players[0].nose = 4;
  state.players[1].nose = 7;
  state.players[2].nose = 7;
  assert.equal(getLoser(state).id, state.players[1].id);
});

test('a player cannot answer twice, and a bad choice is rejected', () => {
  const state = fixedMatch(2);
  assert.equal(state.phase, PHASE.PASS, 'a round opens waiting to be handed over');
  state.phase = PHASE.QUESTION;
  assert.equal(resolveChoice(state, 'D'), false, 'D is not an option');
  assert.equal(state.phase, PHASE.QUESTION, 'a rejected tap must not advance the phase');
  assert.equal(answerAs(state, true), true);
  assert.equal(resolveChoice(state, 'A'), false, 'phase left QUESTION, so no second answer lands');
});

test('every player gets a question and nobody repeats their previous one', () => {
  const state = fixedMatch(6);
  const first = state.players.map((p) => p.assignedQuestionId);
  assert.equal(new Set(first).size, 6, 'six players, six distinct questions');
  assignRound(state);
  for (const [i, p] of state.players.entries()) {
    assert.notEqual(p.assignedQuestionId, first[i], 'a player must not be re-asked their last question');
  }
});

test('the question bank is well formed', () => {
  assert.equal(QUESTIONS.length, 40);
  for (const q of QUESTIONS) {
    assert.ok(q.prompt && q.optionA && q.optionB && q.optionC, `${q.id} is missing copy`);
  }
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 40);
});

test('a blank name falls back rather than rendering an empty player', () => {
  const state = makeMatch(['', '  ', 'ต้น'], makeSeq([], 0.5));
  assert.deepEqual(
    state.players.map((p) => p.name),
    ['ผู้เล่น 1', 'ผู้เล่น 2', 'ต้น'],
  );
});
