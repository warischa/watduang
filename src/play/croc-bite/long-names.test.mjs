// gh#266: croc-bite cut every seated name to 16 characters, so two names the shared player screen
// accepted as distinct -- sharing their first 16 characters -- were seated as two players with one
// name. Scores are keyed by seat, so the round still ran, but the turn line, the toasts and the
// result table named both players identically. The engine no longer cuts at all: the shared screen
// is the one owner of the cap (its NAME_MAX, ADR-0071), so whatever it admits as two names stays two.
//
// The engine's own bytes are executed (the rules block plus GameState plus the handoff), the same
// way seed-order.test.mjs runs them; NAME_MAX comes from the real shared module.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';
import { NAME_MAX } from '../_player-screen/player-screen.ts';

const here = import.meta.dirname;
const ENGINE = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

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

function seatThrough(players) {
  assert.ok(STATE, 'main.js no longer declares GameState — this test is measuring nothing');
  assert.ok(HANDOFF, 'main.js no longer declares startWithPlayers(players) — the handoff is unmeasured');
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const GameState = new Function('localStorage', 'window', `${RULES}${STATE}\n;return GameState;`)(
    { getItem: () => null, setItem() {} },
    {},
  );
  const state = new GameState();
  const ui = {
    updateTeethDescription() {},
    elSetup: { classList: { add() {}, remove() {} } },
  };
  // eslint-disable-next-line no-new-func -- the method's own bytes, as a plain function.
  const run = new Function(`return function ${HANDOFF};`)();
  run.call({ state, ui }, players);
  return state;
}

const player = (name, mascot) => ({ name, emoji: '?', mascot });

test('two names the shared screen accepts as distinct are seated as two distinct names', () => {
  const a = 'abcdefghijklmnopA';
  const b = 'abcdefghijklmnopB';
  assert.ok(a.length <= NAME_MAX && b.length <= NAME_MAX, 'fixture: both names fit the shared screen cap');
  const state = seatThrough([player(a, 0), player(b, 1)]);
  const names = state.players.map((p) => p.name);
  assert.deepEqual(names, [a, b], 'each seat carries the full name it was handed');
});

test('a name at the shared screen cap is seated whole', () => {
  const full = 'x'.repeat(NAME_MAX);
  const state = seatThrough([player(full, 0), player('y', 1)]);
  assert.equal(state.players[0].name, full);
});

test('the engine adds no second cap of its own', () => {
  const body = RULES.slice(RULES.indexOf('function sanitizePlayerName'));
  assert.doesNotMatch(body.slice(0, body.indexOf('\n}')), /\.slice\(|\.substring\(|\.substr\(/, 'sanitizePlayerName must not cut the name');
});
