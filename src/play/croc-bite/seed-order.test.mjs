// What a returning group's saved names become on this route, end to end: the shared player screen
// (ADR-0071, gh#264) opens on the saved roster, the players it starts with are handed to the engine,
// and the engine seats them -- in roster order, every one of them.
//
// This file used to drive roster-bridge.ts, which seeded the engine's own seat pills and name fields
// after the engine's boot. Both are gone: the count and the names are the shared screen's now, and
// the bridge went with the controls it drove. The invariant it guarded survives unchanged -- a group
// that typed its names once never types them again, and the round is played by the names they typed
// -- so it is driven here through the parts that carry it today.
//
// THE ONE 2-6 GAME. Every other party route declares a ceiling of at least ten, so this is the route
// where a saved roster most often outgrows the game. ADR-0071 ruling 4 decides that case: the first
// `max` rows start ticked, the rest sit out, nobody is dropped from the roster, and the group chooses.
// STORED below is eight names on purpose, two over this game's six.
//
// BOTH SIDES ARE REAL. The screen is the shared one, run by the shared harness over THIS route's
// markup.html with THIS game's declared range; the engine side is startWithPlayers, sliced out of
// main.js and run against the engine's own GameState, sliced out of the same file. Nothing here is
// a re-implementation of either.
//
// ponytail: not a browser -- the harness's own stated ceiling. What a player sees on a 320px phone
// with eight rows is the fit probe's question, not this file's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mountOnPage, settle } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game, { MAX_PLAYERS } from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const MARKUP = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');
const ENGINE = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

/** The names a returning group already told this device. More than MAX_PLAYERS on purpose. */
const STORED = ['ต้น', 'เบียร์', 'มิ้น', 'ก้อง', 'ฟ้า', 'ปอ', 'นัท', 'เอ'];

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(from, to) {
  const start = ENGINE.indexOf(from);
  assert.notEqual(start, -1, `main.js no longer contains ${from} — this test is measuring nothing`);
  const end = ENGINE.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.js no longer contains ${to} after ${from}`);
  return ENGINE.slice(start, end);
}

const RULES = region('const SAFE_ACTIONS = {', 'class GameState ');
const STATE = sliceBlock(ENGINE, 'class GameState ');
const HANDOFF = sliceBlock(ENGINE, 'startWithPlayers(players)');

/** Runs the real handoff against the real engine state. Returns the state it seated, and whether
 *  the game's own options screen came up after it (ADR-0071 ruling 1). */
function seatThrough(players) {
  assert.ok(STATE, 'main.js no longer declares GameState — this test is measuring nothing');
  assert.ok(HANDOFF, 'main.js no longer declares startWithPlayers(players) — the handoff is unmeasured');
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const GameState = new Function('localStorage', 'window', `${RULES}${STATE}\n;return GameState;`)(
    { getItem: () => null, setItem() {} },
    {},
  );
  const state = new GameState();
  const setupClasses = new Set(['hidden']);
  const ui = {
    teethFor: null,
    updateTeethDescription(count) { this.teethFor = count; },
    elSetup: { classList: { add: (c) => setupClasses.add(c), remove: (c) => setupClasses.delete(c) } },
  };
  // eslint-disable-next-line no-new-func -- the method's own bytes, as a plain function.
  const run = new Function(`return function ${HANDOFF};`)();
  run.call({ state, ui }, players);
  return { state, ui, optionsShown: !setupClasses.has('hidden') };
}

const ticked = (page) => page.root.querySelectorAll('.ps-tick').map((t) => t.getAttribute('aria-pressed') === 'true');
const rowNames = (page) => page.root.querySelectorAll('.ps-n').map((f) => f.value);
// Past the arm window, so the press is the player's and not a ghost the gate swallows.
const quiet = () => new Promise((resolve) => setTimeout(resolve, 450));

async function startWith({ roster, group = [] }) {
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'croc-players', roster, group, range: game.players });
  page.screen.open();
  await settle();
  return page;
}

test('the declared range is the one this file exercises, and STORED is over it', () => {
  assert.deepEqual(game.players, [2, MAX_PLAYERS]);
  assert.ok(STORED.length > MAX_PLAYERS, 'the fixture no longer exceeds the ceiling — ruling 4 is untested');
});

test('ADR-0071 ruling 4: a roster of eight opens with the first six ticked and the last two sitting out', async () => {
  const page = await startWith({ roster: STORED });
  assert.deepEqual(rowNames(page), STORED, 'a name was dropped from the screen: ruling 4 keeps every row');
  assert.deepEqual(ticked(page), STORED.map((_, i) => i < MAX_PLAYERS), 'the first six rows must start ticked, the rest not');
  assert.equal(page.root.querySelectorAll('.ps-out').length, STORED.length - MAX_PLAYERS);
  assert.match(page.part('limit').textContent, new RegExp(`${MAX_PLAYERS}`), 'the over-maximum line does not name this game\'s six');
  await quiet();
  assert.equal(page.part('start').disabled, false, 'six ticked of a 2-6 game must be startable');
});

test('ADR-0071 ruling 4: the six handed over are seated, in roster order, and the two sitting out stay in the roster', async () => {
  const page = await startWith({ roster: STORED });
  await quiet();
  assert.equal(page.part('start').click(), true);
  await settle();
  assert.equal(page.calls.started.length, 1, 'start handed nothing over');
  const handed = page.calls.started[0];
  assert.deepEqual(handed.map((p) => p.name), STORED.slice(0, MAX_PLAYERS));

  const { state, ui, optionsShown } = seatThrough(handed);
  assert.equal(state.playerCount, MAX_PLAYERS, 'the engine seats a different count than it was handed');
  assert.deepEqual(state.players.map((p) => p.name), STORED.slice(0, MAX_PLAYERS), 'the round is not played in roster order by the names typed');
  assert.equal(ui.teethFor, MAX_PLAYERS, 'the options screen describes a different seat count');
  assert.ok(optionsShown, 'the game\'s own options screen did not come up after the players (ruling 1)');
  assert.deepEqual(page.store.loadRoster().names(), STORED, 'a name sitting out was dropped from the roster');
});

test('the group the players last ticked wins over the wider roster, still in roster order', async () => {
  // Saved out of order on purpose: the seats follow the ROSTER's order (ruling 5), not the group's.
  const group = ['นัท', 'เบียร์', 'ฟ้า'];
  const page = await startWith({ roster: STORED, group });
  assert.deepEqual(ticked(page), STORED.map((n) => group.includes(n)));
  await quiet();
  page.part('start').click();
  await settle();
  const { state } = seatThrough(page.calls.started[0]);
  assert.deepEqual(state.players.map((p) => p.name), ['เบียร์', 'ฟ้า', 'นัท']);
});

test('every seat count this game admits is seated exactly, at both ends and between', () => {
  for (let n = game.players[0]; n <= game.players[1]; n += 1) {
    const players = STORED.slice(0, n).map((name, i) => ({ name, emoji: '?', mascot: i }));
    const { state } = seatThrough(players);
    assert.equal(state.players.length, n, `handed ${n} players, the engine seated ${state.players.length}`);
    assert.equal(state.playerCount, n);
  }
});

test('RED CALIBRATION: the engine seats four before any handoff, so a no-op handoff fails above', () => {
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const GameState = new Function('localStorage', 'window', `${RULES}${STATE}\n;return GameState;`)(
    { getItem: () => null, setItem() {} },
    {},
  );
  const state = new GameState();
  assert.notEqual(state.playerCount, MAX_PLAYERS, 'the engine boots at six — a no-op handoff would pass the six-seat case');
  assert.notDeepEqual(state.players.map((p) => p.name), STORED.slice(0, state.playerCount));
});
