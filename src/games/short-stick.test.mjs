// node --test src/games/short-stick.test.mjs — no framework, no dependency
// Mostly checks the pure round helpers exported from short-stick.ts (no DOM needed).
// The ghost-tap tests at the bottom use a hand-rolled fake `document`/`window` (no jsdom/happy-dom
// in this repo) that implements only what short-stick.ts's el()/on() actually touch — see
// timebomb.test.mjs and love-match.test.mjs for the same pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { startRound, draw } from './short-stick.ts';

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

// ---- Ghost tap on the draw screen (#37): the pass screen the finger was aiming at is already gone,
// and the bundle that replaced it sits under the second contact. A stolen draw ends the turn of a
// player who never held the phone — and this game keeps no checkpoint, so the round is gone. ----

const ARM_WINDOW_MS = 400; // the contracted quiet window — see _arm-gate.ts

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this.disabled = false;
  }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  dispatch(type) { (this._listeners[type] || []).forEach((fn) => fn()); }
  // A disabled control dispatches no activation — the platform swallows the click before any
  // listener runs. The fake models that on purpose: without it every gate assertion passes vacuously.
  click() { if (!this.disabled) this.dispatch('click'); }
}

const fakeDocument = { createElement: (tag) => new FakeElement(tag) };
globalThis.document = fakeDocument;
// reduced-motion = true → animateReveal() returns before touching node.animate(), which the fake has no need to model
globalThis.window = { matchMedia: () => ({ matches: true }) };

function makeCtx(players) {
  return {
    roster: { names: () => [], add() {} },
    session: {
      players,
      setPlayers() {},
      played: [],
      markPlayed() {},
      checkpoint: null,
      saveCheckpoint() {},
      clear() {},
    },
  };
}

/** All text currently in the stage — enough to assert whose turn it is without caring about structure. */
const stageText = (stage) => stage.children.map((c) => c.textContent).join(' ');
/** The bundle's sticks, found the way a player finds them: by their label. Count = sticks left = turns left. */
const sticks = (stage) =>
  stage.children.flatMap((c) => c.children).filter((c) => c.getAttribute('aria-label') === 'จับไม้');
const byId = (stage, id) => stage.children.find((c) => c.id === id);

test('a ghost tap on the bundle cannot draw for the player who just received the phone', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');

  try {
    Math.random = () => 1 - Number.EPSILON; // short stick lands on the last turn → turns 0..2 are all long
    game.mount(stage, makeCtx(['เอ', 'บี', 'ซี', 'ดี']));

    // mount is an entry into the draw screen too, so the bundle starts inert there as well
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    sticks(stage)[0].click(); // the first player draws long → the pass screen
    byId(stage, 'ss-pass').click(); // phone handed to the second → a fresh bundle lands under the finger

    assert.ok(stageText(stage).includes('ตาของ บี'), `setup: the pass tap should open บี's draw screen — got: ${stageText(stage)}`);
    assert.equal(sticks(stage).length, 3, 'setup: 3 sticks left on บี\'s turn');

    // the ghost: second contact of the double-tap that hit "ส่งต่อ", landing on a stick
    sticks(stage)[0].click();
    assert.ok(stageText(stage).includes('ตาของ บี'), `a ghost tap drew for บี — the round moved on without them: ${stageText(stage)}`);
    assert.equal(sticks(stage).length, 3, 'a ghost tap consumed a stick from the bundle');

    // and the same tap, one window later, is a real draw that advances exactly one turn
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    sticks(stage)[0].click();
    assert.ok(stageText(stage).includes('ส่งมือถือให้ ซี'), `บี's deliberate draw did not advance the round: ${stageText(stage)}`);
    byId(stage, 'ss-pass').click();
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    assert.ok(stageText(stage).includes('ตาของ ซี'), `the round did not land on ซี: ${stageText(stage)}`);
    assert.equal(sticks(stage).length, 2, 'the round advanced by more than one turn');

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

test('a ghost tap on "เล่นอีกรอบ" cannot erase the result the round just produced', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');

  try {
    Math.random = () => 0; // short stick on the very first turn → the bundle swaps straight to the result
    game.mount(stage, makeCtx(['เอ', 'บี', 'ซี', 'ดี']));

    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    sticks(stage)[0].click(); // a deliberate draw — the result screen lands under the finger that drew
    assert.ok(stageText(stage).includes('ไม้สั้น'), `setup: expected the result screen — got: ${stageText(stage)}`);
    assert.ok(byId(stage, 'ss-again'), 'setup: no "เล่นอีกรอบ" button on the result screen');

    // the ghost: second contact of the double-tap that drew the stick, landing on "เล่นอีกรอบ"
    byId(stage, 'ss-again').click();
    const after = stageText(stage);
    assert.ok(after.includes('ไม้สั้น'), `a ghost tap erased the round's result — there is no checkpoint to get it back: ${after}`);
    assert.ok(after.includes('เอ โดน'), `a ghost tap erased who lost the round: ${after}`);

    // and one window later the same press really does start a new round
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'ss-again').click();
    assert.ok(stageText(stage).includes('ตาของ'), `"เล่นอีกรอบ" never armed — the round cannot be restarted: ${stageText(stage)}`);
    assert.equal(sticks(stage).length, 4, 'a new round should re-bundle a stick for every player');

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

test('a contact during the window restarts it — the gate fails closed, it never opens early', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');

  try {
    Math.random = () => 1 - Number.EPSILON;
    game.mount(stage, makeCtx(['เอ', 'บี', 'ซี', 'ดี']));

    t.mock.timers.tick(ARM_WINDOW_MS - 1);
    stage.dispatch('pointerdown'); // a finger touches down just before the bundle would have armed
    t.mock.timers.tick(ARM_WINDOW_MS - 1);

    sticks(stage)[0].click();
    assert.ok(stageText(stage).includes('ตาของ เอ'), `the window did not restart on contact — เอ's turn was drawn for them: ${stageText(stage)}`);
    assert.equal(sticks(stage).length, 4, 'a stick was consumed inside the restarted window');

    t.mock.timers.tick(2); // the restarted window closes here, and only here
    sticks(stage)[0].click();
    assert.ok(stageText(stage).includes('ไม้ยาว'), `the bundle never armed after the restarted window: ${stageText(stage)}`);

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});
