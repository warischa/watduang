// The mockup's own `game-rules` and `game-state` tests, re-pointed at the collapsed engine.
//
// The mockup ships ten ES modules and two node test files that import them. This route ships those
// modules concatenated into one main.js with no exports at all, so the mockup's two test files
// cannot survive as imports — they survive as THESE assertions, run against the same bytes.
//
// It runs the REAL bytes. main.js imports `three` and its boot touches the DOM, so it cannot be
// imported here; the pure rules section and `class GameState` are cut out of the source text by
// their own markers and evaluated. A rename or a rewrite of either fails this file loudly rather
// than silently testing nothing.
//
// EVERY EXPECTED NUMBER IS WRITTEN OUT, never computed from the function under test. A tooth total
// derived from getToothConfig would agree with any getToothConfig, which is the shape that passes on
// a broken table. The five totals come from the mockup's own tests/game-rules.test.js; the odds
// strings are the ones markup.html ships in #tension-odds-text.
//
// ponytail: no DOM, no scene, no audio. The seat range, the tooth table, the single losing tooth, the
// scoring and the resolution token are all state-side and settle without a frame. What that costs is
// stated: this proves the state machine, never that a 3D tooth press reaches it (that is
// webgl-context-loss.test.mjs on the DOM path, and only a browser on the 3D one).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';
// The declared range, from the module the route itself declares it in: a retyped 2 and 6 here would
// go on agreeing with a game whose range had moved (ADR-0065 makes the range per game).
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/croc-bite.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `main.js no longer contains ${from} — this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.js no longer contains ${to} after ${from} — the slice would run past its section`);
  return source.slice(start, end);
}

// Two contiguous regions rather than one slice per symbol: the rules section is a run of `const`
// arrays and pure functions, and a brace-matching slicer walks out of an array declaration into
// whatever follows it (a hazard _dom-stub.mjs and name-escaping.test.mjs both record). Marker to
// marker cannot do that.
const RULES = region('const SAFE_ACTIONS = {', 'const PHASES = {');
const PHASE_CONSTS = region('const PHASES = {', 'class GameState ');
const STATE = sliceBlock(source, 'class GameState ');
assert.ok(STATE, 'main.js no longer declares class GameState — this test is measuring nothing');

const EXPORTS = [
  'GameState', 'PHASES', 'SAFE_ACTIONS', 'MASCOT_PLAYERS',
  'getToothConfig', 'calculateBiteOdds', 'pickStartingPlayer', 'pickLosingTooth',
  'pickSafeOutcome', 'shouldCryTears', 'sanitizePlayerName',
];

/** Fresh engine per call, so one test's round cannot leak into the next. `localStorage` is a real
 *  map because GameState reads two motion preferences at construction; `window` has no matchMedia,
 *  which is the "no preference expressed" branch. */
function loadEngine() {
  const store = new Map();
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const factory = new Function(
    'localStorage', 'window', 'document',
    `${RULES}${PHASE_CONSTS}${STATE}\n;return { ${EXPORTS.join(', ')} };`,
  );
  return factory(
    { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    {},
    {},
  );
}

/** One round in progress, `count` seats, ready for a press. */
function inRound(count) {
  const api = loadEngine();
  const state = new api.GameState();
  state.setPlayerCount(count);
  state.startNewRound();
  state.beginPlayerTurn();
  return { api, state };
}

const losingCount = (state) => [...state.teeth.values()].filter((t) => t.isLosing).length;
const firstSafeToothId = (state) => [...state.teeth.values()].find((t) => !t.isLosing)?.id;

// ---- the seat range, and the tooth table that follows from it -----------------------------------

// From the mockup's tests/game-rules.test.js, seat for seat. Written out because a total computed
// from getToothConfig shares the table it is meant to check.
const TOOTH_TOTALS = { 2: 16, 3: 18, 4: 16, 5: 20, 6: 18 };

test('the declared range is 2 to 6, and this file covers every seat in it', () => {
  assert.equal(MIN_PLAYERS, 2);
  assert.equal(MAX_PLAYERS, 6);
  assert.deepEqual(
    Object.keys(TOOTH_TOTALS).map(Number),
    Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i),
    'the tooth table and the declared seat range have drifted apart — a seat the game offers is untested',
  );
});

test('every seat count in range gets the mockup\'s own tooth layout', () => {
  const api = loadEngine();
  for (const [seats, total] of Object.entries(TOOTH_TOTALS)) {
    const cfg = api.getToothConfig(Number(seats));
    assert.equal(cfg.totalCount, total, `${seats} seats no longer lay out ${total} teeth`);
    assert.equal(cfg.upperCount, total / 2);
    assert.equal(cfg.lowerCount, total / 2);
    assert.equal(cfg.toothIds.length, total);
    assert.equal(new Set(cfg.toothIds).size, total, 'a tooth id is repeated: two board buttons would share one tooth');
  }
});

test('a started round holds exactly the teeth its seat count calls for', () => {
  for (const [seats, total] of Object.entries(TOOTH_TOTALS)) {
    const { state } = inRound(Number(seats));
    assert.equal(state.teeth.size, total, `${seats} seats started a round with ${state.teeth.size} teeth`);
    assert.equal(state.players.length, Number(seats));
  }
});

test('the range is enforced at the state, above and below', () => {
  const api = loadEngine();
  const state = new api.GameState();
  state.setPlayerCount(MAX_PLAYERS + 4);
  assert.equal(state.players.length, MAX_PLAYERS, 'a seat count above the range was accepted');
  state.setPlayerCount(MIN_PLAYERS - 1);
  assert.equal(state.players.length, MIN_PLAYERS, 'a seat count below the range was accepted');
});

// ---- exactly one losing tooth ------------------------------------------------------------------

test('a round hides exactly one losing tooth, at every seat count', () => {
  for (const seats of Object.keys(TOOTH_TOTALS).map(Number)) {
    const { state } = inRound(seats);
    assert.equal(losingCount(state), 1, `${seats} seats: ${losingCount(state)} losing teeth in one round`);
    assert.equal(state.teeth.get(state.losingToothId).isLosing, true);
  }
});

test('the losing tooth is re-picked per round and stays a single tooth', () => {
  // Thirty rounds on one state object: the round that matters is the one AFTER a round already ran,
  // because that is where a stale flag from the previous round would survive as a second loser.
  const { state } = inRound(6);
  for (let i = 0; i < 30; i += 1) {
    state.startNewRound(true);
    assert.equal(losingCount(state), 1, `round ${i + 2} carried ${losingCount(state)} losing teeth`);
  }
});

test('pressing every safe tooth never ends the round, and the losing one always does', () => {
  const { api, state } = inRound(4);
  const safeIds = [...state.teeth.values()].filter((t) => !t.isLosing).map((t) => t.id);
  for (const id of safeIds) {
    const payload = state.pressTooth(id);
    assert.equal(payload.isLosing, false, `${id} bit, and it is not the losing tooth`);
    state.completeSafeResolution(payload.token);
    state.beginPlayerTurn();
  }
  const last = state.pressTooth(state.losingToothId);
  assert.equal(last.isLosing, true);
  assert.equal(state.phase, api.PHASES.RESOLVING_LOSS);
});

// ---- the live bite odds ------------------------------------------------------------------------

test('the bite odds read as the fraction and the percentage the HUD ships', () => {
  const api = loadEngine();
  // Both strings are copied from markup.html's #tension-odds-text, which opens on `1 ใน 16 (6.3%)`,
  // and from the mockup's own tests/game-rules.test.js.
  const opening = api.calculateBiteOdds(16);
  assert.equal(opening.fraction, '1 ใน 16');
  assert.equal(opening.percent, 6.3);
  assert.equal(opening.isCritical, false);
  assert.equal(opening.isHigh, false);

  const two = api.calculateBiteOdds(2);
  assert.equal(two.fraction, '1 ใน 2');
  assert.equal(two.percent, 50);
  assert.equal(two.isCritical, true);
  assert.equal(two.isHigh, true);
});

test('the odds a round reports follow the teeth it has left', () => {
  const { state } = inRound(2);
  assert.equal(state.getLiveBiteOdds().remaining, 16);
  assert.equal(state.getLiveBiteOdds().fraction, '1 ใน 16');
  const payload = state.pressTooth(firstSafeToothId(state));
  state.completeSafeResolution(payload.token);
  assert.equal(state.getLiveBiteOdds().remaining, 15);
  assert.equal(state.getLiveBiteOdds().fraction, '1 ใน 15');
});

// ---- a point to every non-loser ----------------------------------------------------------------

test('the loser scores nothing and every survivor scores one', () => {
  for (const seats of Object.keys(TOOTH_TOTALS).map(Number)) {
    const { api, state } = inRound(seats);
    const payload = state.pressTooth(state.losingToothId);
    state.completeLosingResolution(payload.token);
    assert.equal(state.phase, api.PHASES.RESULT);

    const loser = state.loserPlayer;
    assert.ok(loser, `${seats} seats: the round ended with nobody recorded as the loser`);
    assert.equal(state.getPlayerScore(loser.id), 0, `${seats} seats: the bitten player was awarded a point`);
    const survivors = state.players.filter((p) => p.id !== loser.id);
    assert.deepEqual(
      survivors.map((p) => state.getPlayerScore(p.id)),
      survivors.map(() => 1),
      `${seats} seats: a survivor went unrewarded`,
    );
    // The total is the second half of the same claim: scoring every survivor once is not the same
    // statement as scoring nobody twice.
    assert.equal([...state.scores.values()].reduce((a, b) => a + b, 0), seats - 1);
  }
});

// ---- the resolution token ----------------------------------------------------------------------

// THE INPUT IS THE WHOLE TEST HERE. Each completion carries TWO guards, a token and a phase, and a
// state that has left the round outright is refused by the phase guard alone — measured: dropping
// the token comparison from completeSafeResolution left an earlier version of this test green,
// because the replacement round was sitting in PLAYER_TURN and never reached the token at all. So
// the stale completion is delivered while the NEW round is itself mid-resolution: the phase matches,
// and only the token can tell the two presses apart.
test('a resolution belonging to a finished round cannot land in the round that replaced it', () => {
  const { api, state } = inRound(4);
  const staleToken = state.pressTooth(firstSafeToothId(state)).token;

  // The player restarts while that press is still resolving: the animation callback that would have
  // completed it is still queued, and it will be delivered into whatever is on screen by then.
  state.startNewRound(true);
  state.beginPlayerTurn();
  const live = state.pressTooth(firstSafeToothId(state));
  assert.equal(state.phase, api.PHASES.RESOLVING_SAFE, 'the replacement round is not mid-resolution — the phase guard would answer this');
  assert.notEqual(live.token, staleToken, 'the two presses share a token — this test cannot separate them');
  const turnBefore = state.currentPlayerIndex;

  state.completeSafeResolution(staleToken);
  assert.equal(state.phase, api.PHASES.RESOLVING_SAFE, 'a stale safe resolution settled a press the player had not made');
  assert.equal(state.currentPlayerIndex, turnBefore, 'a stale safe resolution passed the phone to the next player');
});

test('a stale losing resolution cannot end the round that replaced it', () => {
  const { api, state } = inRound(4);
  const staleToken = state.pressTooth(state.losingToothId).token;

  // Same shape, other completion: the new round is mid-BITE, so its phase matches and the token is
  // the only thing that can refuse a bite from the round before.
  state.startNewRound(true);
  state.beginPlayerTurn();
  const live = state.pressTooth(state.losingToothId);
  assert.equal(state.phase, api.PHASES.RESOLVING_LOSS);
  assert.notEqual(live.token, staleToken, 'the two presses share a token — this test cannot separate them');

  state.completeLosingResolution(staleToken);
  assert.notEqual(state.phase, api.PHASES.RESULT, 'a stale losing resolution raised the result card over a live round');
  state.completeLosingResolution(live.token);
  assert.equal(state.phase, api.PHASES.RESULT, 'the live token no longer settles its own bite');
});

test('a resolution for the wrong phase is refused even with the current token', () => {
  const { api, state } = inRound(4);
  const payload = state.pressTooth(state.losingToothId);
  assert.equal(state.phase, api.PHASES.RESOLVING_LOSS);
  // The safe completion carries the LIVE token; only the phase guard can refuse it. Without that
  // half, a losing press would pass the phone on instead of ending the round.
  state.completeSafeResolution(payload.token);
  assert.equal(state.phase, api.PHASES.RESOLVING_LOSS, 'a safe resolution was accepted while a bite was resolving');
  state.completeLosingResolution(payload.token);
  assert.equal(state.phase, api.PHASES.RESULT);
});

test('a second press during a resolution is refused, so one turn spends one tooth', () => {
  const { state } = inRound(4);
  const first = firstSafeToothId(state);
  assert.ok(state.pressTooth(first));
  assert.equal(state.pressTooth(state.losingToothId), null, 'the input lock let a second tooth be pressed mid-resolution');
  assert.equal(losingCount(state), 1);
});

// ---- the remaining rules the mockup's own file covered ------------------------------------------

test('the safe outcomes and the tear roll split where the mockup says they do', () => {
  const api = loadEngine();
  assert.equal(api.pickSafeOutcome(() => 0.1), api.SAFE_ACTIONS.BREAK_TILT);
  assert.equal(api.pickSafeOutcome(() => 0.5), api.SAFE_ACTIONS.SINK);
  assert.equal(api.pickSafeOutcome(() => 0.9), api.SAFE_ACTIONS.WOBBLE_FALL);
  assert.equal(api.shouldCryTears(() => 0.29), true);
  assert.equal(api.shouldCryTears(() => 0.31), false);
  assert.equal(api.pickLosingTooth(['upper_0', 'upper_1', 'lower_0', 'lower_1'], () => 0.75), 'lower_1');
  assert.throws(() => api.pickLosingTooth([]), /empty tooth list/);
  for (let seats = MIN_PLAYERS; seats <= MAX_PLAYERS; seats += 1) {
    const starter = api.pickStartingPlayer(seats, () => 0.5);
    assert.ok(starter >= 0 && starter < seats, `starting seat ${starter} is outside a party of ${seats}`);
  }
});

test('an empty name falls back to that seat mascot, and a long one is cut to the field cap', () => {
  const api = loadEngine();
  // The fallbacks are read off the engine's own cast rather than retyped: the cast is what a player
  // sees, and a copy here would go on agreeing with a cast that had changed.
  assert.equal(api.sanitizePlayerName('', 1), api.MASCOT_PLAYERS[0].defaultName);
  assert.equal(api.sanitizePlayerName('   ', 2), api.MASCOT_PLAYERS[1].defaultName);
  assert.equal(api.sanitizePlayerName('A very long name that exceeds maximum allowed length', 4), 'A very long name');
  assert.equal(api.sanitizePlayerName('A very long name that exceeds maximum allowed length', 4).length, 16);
});

// ---- calibration -------------------------------------------------------------------------------

test('RED CALIBRATION: the fixtures can tell a right answer from a wrong one', () => {
  // The tooth table would be unfalsifiable if every seat count expected the same total.
  assert.ok(new Set(Object.values(TOOTH_TOTALS)).size > 1, 'the tooth table expects one total for every seat count');
  // The scoring test would be unfalsifiable at two seats only, where "every survivor" is one player.
  assert.ok(MAX_PLAYERS - MIN_PLAYERS >= 1, 'the range holds one seat count, so the survivor loop proves nothing');
  // The token test would be unfalsifiable if a new round did not move the token.
  const { state } = inRound(4);
  const before = state.resolutionToken;
  state.startNewRound(true);
  assert.notEqual(state.resolutionToken, before, 'a new round reuses the resolution token — the stale-token test measures nothing');
});
