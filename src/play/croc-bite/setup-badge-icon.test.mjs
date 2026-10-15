// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// The assertion is POSITIVE and it is an equality: a badge's own text must equal the glyph the shared
// cast holds for that seat. Nothing here scans for digits, deliberately -- the name field beside the
// badge carries a legitimate positional label, and a digit-scanning check would red on it.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #croc-players.
// The first half runs that real screen over THIS route's markup.html at THIS game's declared 2-6
// range (ADR-0065) and reads the badges back off the rows it built -- the top of the range included.
//
// The second half is the engine. main.js is a lifted mockup and keeps its OWN six-seat cast, which it
// boots with; the shared cast is a separate list, so the drift test below pins the two together over
// the seats this game uses. And startWithPlayers, the entry the screen starts, is sliced out and run
// against the engine's own GameState: with someone sitting out, a seat's index and its mascot differ,
// and the seat must wear the mascot the screen gave it -- exactly the case a positional default gets
// wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { sliceBlock } from '../_dom-stub.mjs';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import game, { MAX_PLAYERS, MIN_PLAYERS } from '../../games/croc-bite.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'croc-players', range: game.players, mascots: MASCOTS, label: 'croc-bite' });

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `main.js no longer contains ${from} — this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.js no longer contains ${to} after ${from}`);
  return source.slice(start, end);
}

// Marker to marker, not symbol by symbol: the rules section is a run of `const` arrays, and a
// brace-matching slicer walks out of an array declaration into whatever follows it.
const RULES = region('const SAFE_ACTIONS = {', 'const PHASES = {');
const PHASE_CONSTS = region('const PHASES = {', 'class GameState ');
const STATE = sliceBlock(source, 'class GameState ');
assert.ok(STATE, 'main.js no longer declares class GameState — the seats read here would be a fixture, not the route\'s');
const HANDOFF = sliceBlock(source, 'startWithPlayers(players)');
assert.ok(HANDOFF, 'main.js no longer declares startWithPlayers(players) — the seats the round is played with are unmeasured');

/** A fresh engine state, built by the shipped GameState. */
function engineState() {
  const store = new Map();
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const GameState = new Function(
    'localStorage', 'window', 'document',
    `${RULES}${PHASE_CONSTS}${STATE}\n;return GameState;`,
  )(
    { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    {},
    {},
  );
  return new GameState();
}

/** The engine's own seat roster for `count` players, as its own clamp sizes it. */
function seats(count) {
  const state = engineState();
  state.setPlayerCount(count);
  return state;
}

/** Runs the real handoff on a fresh engine and returns the state it seated. */
function seatThrough(players) {
  const state = engineState();
  const ui = { updateTeethDescription() {}, elSetup: { classList: { add() {}, remove() {} } } };
  // eslint-disable-next-line no-new-func -- the method's own bytes, as a plain function.
  new Function(`return function ${HANDOFF};`)().call({ state, ui }, players);
  return state;
}

test('the engine\'s own cast has not drifted from the shared one over the seats it uses', () => {
  // main.js cannot import _mascots.ts, so the two lists are independent copies and this is what pins
  // them: the engine boots on its own cast and falls back to it for a blank name.
  const state = seats(MAX_PLAYERS);
  assert.deepEqual(state.players.map((p) => p.emoji), MASCOTS.slice(0, MAX_PLAYERS).map((m) => m.emoji));
  assert.deepEqual(state.players.map((p) => p.name), MASCOTS.slice(0, MAX_PLAYERS).map((m) => m.name));
});

test('gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 7: the second roster row and the fourth to seventh sat out, and the last one
  // is a mascot past the engine's own six -- its glyph can only have come from the screen.
  const players = [0, 2, 7].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const state = seatThrough(players);
  assert.deepEqual(state.players.map((p) => p.emoji), players.map((p) => p.emoji), 'a seat wears its index\'s mascot, not its player\'s');
  assert.deepEqual(state.players.map((p) => p.name), ['p0', 'p1', 'p2']);
  // Six sleeves for twenty mascots: the sleeve stays the seat's own, so no two seats ever share one.
  assert.equal(new Set(state.players.map((p) => p.sleeveColor)).size, players.length, 'two seats share a sleeve');
});

test('ADR-0065: every seat count in this game\'s own 2-6 range is seated, each seat with its glyph', () => {
  for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
    const players = MASCOTS.slice(0, count).map((m, i) => ({ name: m.name, emoji: m.emoji, mascot: i }));
    const state = seatThrough(players);
    assert.equal(state.players.length, count, `${count} players handed over, ${state.players.length} seated`);
    assert.deepEqual(state.players.map((p) => p.emoji), Array.from({ length: count }, (_, i) => mascotEmoji(i)));
  }
});

test('ADR-0065: the engine clamps at both ends, so no seat outside the range can exist', () => {
  assert.equal(MIN_PLAYERS, 2);
  assert.equal(MAX_PLAYERS, 6);
  assert.equal(seats(MAX_PLAYERS + 4).players.length, MAX_PLAYERS, 'a party above the range was seated');
  assert.equal(seats(MIN_PLAYERS - 1).players.length, MIN_PLAYERS, 'a party below the range seated fewer than the floor');
});

// gh#266: the seat keeps its whole name. The HUD card, drawn for the mockup's 16-character names,
// clips a longer one in CSS (overrides.css), so the data is never cut.
test('a long name is seated whole, not cut by the engine', () => {
  const long = 'ก'.repeat(20);
  const state = seatThrough([{ name: long, emoji: '🐱', mascot: 0 }, { name: 'บี', emoji: '🐶', mascot: 1 }]);
  assert.equal(state.players[0].name, long);
  assert.equal(state.players[1].name, 'บี');
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge. Asserted rather than assumed — a fixture
// that already satisfies its own expectation is how a badge test passes on a badge never fixed.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: MAX_PLAYERS }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: MAX_PLAYERS }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  // And the seats in range hold DISTINCT glyphs, which is what makes a wrapped or truncated cast
  // visible at all: a cast whose entries repeated would satisfy the equality after any wrap.
  assert.equal(new Set(icons).size, MAX_PLAYERS, 'two seats in range share a glyph — a wrapped cast would pass unnoticed');
});
