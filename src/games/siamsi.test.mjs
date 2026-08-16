// node --test src/games/ — no framework, no dependency
// checks only the pure helpers exported from siamsi.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, draw, nextTurn, toCheckpoint, resumeFrom, FORTUNES } from './siamsi.ts';

test('deck has 24 cards, numbers do not repeat', () => {
  assert.equal(FORTUNES.length, 24);
  const numbers = new Set(FORTUNES.map((f) => f.number));
  assert.equal(numbers.size, 24);
});

test('no repeat draws across a round — buildDeck then draw to empty for every player count', () => {
  for (const playerCount of [2, 5, 10]) {
    let deck = buildDeck(playerCount, Math.random);
    assert.equal(deck.length, playerCount);
    const seen = new Set();
    for (let i = 0; i < playerCount; i++) {
      const { fortune, remaining } = draw(deck);
      assert.ok(!seen.has(fortune.number), `card ${fortune.number} drawn twice`);
      seen.add(fortune.number);
      deck = remaining;
    }
    assert.equal(deck.length, 0); // deck must be exactly empty once everyone has drawn
    assert.equal(seen.size, playerCount);
  }
});

test('drawing from an empty deck must throw', () => {
  assert.throws(() => draw([]), /empty/);
});

test('round ends exactly after N players', () => {
  const playerCount = 4;
  let current = 0;
  let turns = 0;
  let roundOver = false;
  while (!roundOver) {
    const result = nextTurn(current, playerCount);
    turns += 1;
    current = result.index;
    roundOver = result.roundOver;
  }
  assert.equal(turns, playerCount);
  assert.equal(current, 0); // wraps back to the first player with a fresh round
});

test('reshuffle returns a full deck every time — buildDeck(24) must yield all 24 cards, no repeats, on every call', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const deck = buildDeck(24, Math.random);
    assert.equal(deck.length, 24);
    const numbers = new Set(deck.map((i) => FORTUNES[i].number));
    assert.equal(numbers.size, 24); // every card present, none left over from a prior round
  }
});

// REFUTE flagged that the first test suite didn't force a real shuffle — swapping buildDeck for a
// plain slice still passed, even though "play another round" must yield a new order. This test
// pins a controllable rand so the result is actually checkable.
test('buildDeck really shuffles, not just returns the original order', () => {
  // rand fixed at 0 → Fisher-Yates swaps order[i] with order[0] every round = a precomputable result
  const expected = (() => {
    const order = FORTUNES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) [order[i], order[0]] = [order[0], order[i]];
    return order.slice(0, 5);
  })();
  assert.deepEqual(buildDeck(5, () => 0), expected);
  assert.notDeepEqual(buildDeck(5, () => 0), [0, 1, 2, 3, 4], 'buildDeck returned the original order = not shuffled');

  // different rand must give a different order, otherwise rand isn't being used at all
  assert.notDeepEqual(buildDeck(8, () => 0), buildDeck(8, () => 0.99));
});

test('more players than cards must throw, not silently return a short deck', () => {
  assert.throws(() => buildDeck(FORTUNES.length + 1), /มากกว่าใบเซียมซี/);
  assert.equal(buildDeck(FORTUNES.length).length, FORTUNES.length);
});

// ---- guard against a mid-round refresh ----
// every test sends the checkpoint through JSON first, because localStorage does exactly that —
// a test sending the raw object would miss fields that don't survive serialize
const store = (cp) => JSON.parse(JSON.stringify(cp));

/** real mid-round state: 3 players, 1 card drawn already, sitting in front of the next draw */
function midRound(players = ['เอ', 'บี', 'ซี']) {
  const { fortune, remaining } = draw(buildDeck(players.length, () => 0.5));
  return {
    players,
    deck: remaining,
    holder: 0,
    results: [{ player: players[0], fortune }],
    phase: 'drawn',
    drawn: fortune,
  };
}

test('saved to storage and restored gives back the exact same state', () => {
  const s = midRound();
  assert.deepEqual(resumeFrom(store(toCheckpoint(s)), s.players), s);
});

test('an unusable blob must return null in every case, not resume in a corrupted state', () => {
  const s = midRound();
  const ok = store(toCheckpoint(s));
  const cases = [
    ['no checkpoint', null, s.players],
    ['another game (storage slot is shared across games)', { ...ok, game: 'timebomb' }, s.players],
    // A roster that disagrees with the blob is no longer a rejection reason (#23) — the two cases
    // that used to live here (the roster-changed and roster-shrank cases) are now the two resume tests below.
    // Only a blob that is structurally unusable may return null; a live round must never be dropped.
    // The roster now leaves this function and becomes session.players (#23), so it is validated here:
    // a non-string name used to survive every other check and end up in storage and on screen.
    ['blob players are not strings', { ...ok, players: ['เอ', 42, 'ซี'] }, s.players],
    ['empty players list', { ...ok, players: [] }, s.players],
    ['card number does not exist', { ...ok, deck: [999, ...ok.deck.slice(1)] }, s.players],
    ['card count does not match player count', { ...ok, deck: ok.deck.slice(1) }, s.players],
    ['card already drawn appears again', { ...ok, deck: [ok.results[0].n, ...ok.deck.slice(1)] }, s.players],
    ['holder exceeds player count', { ...ok, holder: 99 }, s.players],
    ['holder does not match phase turn (should equal results.length)', { ...ok, phase: 'turn', drawn: null, holder: 0 }, s.players],
    ['holder does not match phase drawn (should equal results.length - 1)', { ...ok, holder: 1 }, s.players],
    ['phase drawn but no card', { ...ok, drawn: null }, s.players],
    ['phase that should never be resumed', { ...ok, phase: 'summary' }, s.players],
  ];
  for (const [name, blob, players] of cases) {
    assert.equal(resumeFrom(blob, players), null, `should return null: ${name}`);
  }
});

test('a session with no roster (fallback names) must still resume, not silently drop the round', () => {
  const s = midRound();
  assert.deepEqual(resumeFrom(store(toCheckpoint(s)), []), s);
});

// #23 — the checkpoint owns its roster. Both inputs below are the ones the null-case table above
// used to reject, so a re-introduced name gate turns these red instead of losing a round in silence.
test('a numbered round resumes even when the panel hands back a different saved group', () => {
  const s = midRound(['คนที่ 1', 'คนที่ 2', 'คนที่ 3']);
  const resumed = resumeFrom(store(toCheckpoint(s)), ['เอ', 'บี']);
  assert.deepEqual(resumed, s);
  // the restored roster is the checkpoint's, never the panel's — mountInto pushes it back into session
  assert.deepEqual(resumed.players, ['คนที่ 1', 'คนที่ 2', 'คนที่ 3']);
});

test('untick then re-tick the same names — order changed, round still resumes', () => {
  const s = midRound();
  const reTicked = [...s.players].reverse(); // Set iteration order after un/re-ticking
  assert.deepEqual(resumeFrom(store(toCheckpoint(s)), reTicked), s);
});
