// gh#264 / ADR-0071 ruling 6: the edit control mid-round asks first, and its confirm ENDS the round
// before the shared player screen opens. On this route "ends" is not just hiding screens: a round
// owns three intervals on `game` and three one-shot timers that were never tracked -- the 200ms scan
// starter, the 850ms detonation modal and the 1200ms turn advance. Left alone, each one fires after
// the player screen has opened and puts a game screen or the round-over modal back over it.
//
// So this runs the REAL bytes: putAwayRound (the route's abortRound and onOpen) and the three round
// steps that schedule those timers, sliced out of main.js over a tolerant DOM stand-in, under mocked
// timers. Every case has a control leg -- the same step with no abort -- so a timer that never fires
// at all cannot pass as one that was cancelled.
//
// ponytail: no layout and no real DOM; the stand-in answers every element lookup with one inert
// node. What is measured is which round step runs after the abort, nothing it paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';

const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

const HEADERS = [
  'function putAwayRound()',
  'function roundActive()',
  'function handleSequenceCleared()',
  "function handleDetonation(wireIndex, reasonText = 'ตัดผิดลำดับสายไฟ!')",
  'function triggerScanSequence()',
];
const bodies = HEADERS.map((h) => {
  const b = sliceBlock(MAIN, h);
  assert.ok(b, `main.js no longer declares ${h} — this test is measuring nothing`);
  return b;
});
// The real enum, sliced to its closing `});` -- the states are what the guards compare against.
const enumAt = MAIN.indexOf('const GameState = Object.freeze({');
assert.notEqual(enumAt, -1, 'main.js no longer declares GameState');
const enumDecl = MAIN.slice(enumAt, MAIN.indexOf('});', enumAt) + 3);

function node() {
  const n = {
    style: {},
    textContent: '',
    disabled: false,
    classList: { add() {}, remove() {}, contains: () => false },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  };
  return n;
}

/** One route instance: the sliced functions over a fresh `game`, with every collaborator a spy. */
function route() {
  const calls = { advanceTurn: 0, showDetonationModal: 0, flashWire: 0, enterCutDecision: 0 };
  const hidden = [];
  const document = {
    getElementById: () => node(),
    querySelectorAll: (sel) => [{ classList: { add() {}, remove: (c) => hidden.push([sel, c]) } }],
  };
  const game = {
    state: 'MENU', players: ['a', 'b'], scores: [0, 0], flashSequence: [0, 1], flashDelay: 520,
    scanInterval: null, heartbeatTimer: null, countdownInterval: null,
  };
  const noop = () => {};
  const api = new Function(
    'game', 'document', 'soundSynth', 'triggerHaptics', 'triggerShake', 'renderWiresBay',
    'particleCanvasBox', 'spawnExplosionParticles', 'advanceTurn', 'showDetonationModal', 'flashWire',
    'enterCutDecision',
    `${enumDecl}\n${bodies.join('\n')}\nreturn { GameState, putAwayRound, roundActive, handleSequenceCleared, handleDetonation, triggerScanSequence };`,
  )(
    game, document, { playClick: noop, playDefuseSafe: noop, playExplosion: noop }, noop, noop, noop,
    () => ({ left: 0, top: 0 }), noop,
    () => { calls.advanceTurn += 1; }, () => { calls.showDetonationModal += 1; },
    () => { calls.flashWire += 1; }, () => { calls.enterCutDecision += 1; },
  );
  return { api, game, calls, hidden };
}

test('the turn advance after a cleared sequence does not fire once the round is put away', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const control = route();
  control.api.handleSequenceCleared();
  t.mock.timers.tick(1200);
  assert.equal(control.calls.advanceTurn, 1, 'CONTROL: with no abort the turn advances');

  const aborted = route();
  aborted.api.handleSequenceCleared();
  aborted.api.putAwayRound();
  t.mock.timers.tick(1200);
  assert.equal(aborted.calls.advanceTurn, 0, 'the turn advanced over the player screen after the round was ended');
});

test('the round-over modal after a detonation does not open once the round is put away', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const control = route();
  control.api.handleDetonation(0, 'x');
  t.mock.timers.tick(850);
  assert.equal(control.calls.showDetonationModal, 1, 'CONTROL: with no abort the modal opens');

  const aborted = route();
  aborted.api.handleDetonation(0, 'x');
  aborted.api.putAwayRound();
  t.mock.timers.tick(850);
  assert.equal(aborted.calls.showDetonationModal, 0, 'the round-over modal opened over the player screen');
});

// The mock clock does not fire a timer that another timer scheduled inside the same tick() call --
// measured: a 50ms timeout that starts a 100ms interval shows 0 runs after tick(400). The scan
// chains three such hand-offs (timeout -> interval -> timeout), so the clock is stepped 1ms at a
// time. The control leg below is what caught this: with one big tick it saw no flash at all.
const advance = (t, ms) => {
  for (let i = 0; i < ms; i += 1) t.mock.timers.tick(1);
};

test('a scan put away before or during its flashes never reaches the cut decision', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const whole = 200 + 520 * 3 + 260;

  const control = route();
  control.game.state = control.api.GameState.TURN_WAIT;
  control.api.triggerScanSequence();
  advance(t, whole);
  assert.equal(control.calls.flashWire, 2, 'CONTROL: both wires flash');
  assert.equal(control.calls.enterCutDecision, 1, 'CONTROL: with no abort the cut decision starts');

  const early = route();
  early.game.state = early.api.GameState.TURN_WAIT;
  early.api.triggerScanSequence();
  early.api.putAwayRound(); // inside the 200ms before the first flash
  advance(t, whole);
  assert.equal(early.calls.flashWire, 0, 'a wire flashed on a put-away round');
  assert.equal(early.calls.enterCutDecision, 0, 'the cut decision started on a put-away round');

  const late = route();
  late.game.state = late.api.GameState.TURN_WAIT;
  late.api.triggerScanSequence();
  advance(t, 200 + 520 * 3 + 1); // the last flash is done; the 260ms hand-off is pending
  assert.equal(late.calls.flashWire, 2, 'the late abort must land after both flashes, or it measures the early case again');
  late.api.putAwayRound();
  advance(t, 260);
  assert.equal(late.calls.enterCutDecision, 0, 'the cut decision started after the round was ended');
});

test('putAwayRound leaves the engine idle and every game surface down', () => {
  const r = route();
  r.game.state = r.api.GameState.CUT_DECISION;
  r.api.putAwayRound();
  assert.equal(r.game.state, r.api.GameState.SETUP);
  assert.equal(r.api.roundActive(), false);
  assert.ok(r.hidden.some(([sel, c]) => sel === '.screen' && c === 'active'), 'the game screens were left up');
});

// Ruling 6: the edit control asks only while a round is really running. Read as an EXCLUSION list --
// the three idle states -- so a state added later is asked about rather than silently discarded.
test('roundActive is true on every in-round state and false on the three idle ones', () => {
  const r = route();
  const { GameState } = r.api;
  for (const s of Object.values(GameState)) {
    r.game.state = s;
    const idle = s === GameState.MENU || s === GameState.SETUP || s === GameState.ROUND_OVER;
    assert.equal(r.api.roundActive(), !idle, `roundActive() is wrong on ${s}`);
  }
});
