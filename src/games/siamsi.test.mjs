// node --test src/games/ — no framework, no dependency
// checks only the pure helpers exported from siamsi.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { buildDeck, draw, nextTurn, toCheckpoint, resumeFrom, FORTUNES } from './siamsi.ts';
import { ARM_DELAY_MS } from './_arm-gate.ts';

// ---- Minimal fake DOM for the #42 gate test below — lifted from short-stick.test.mjs's harness
// (the reference DOM harness in this repo, no jsdom/happy-dom dependency) rather than inventing a second one.
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this.disabled = false;
    this.hidden = false;
  }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
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

// #42: the ghost-tap gate — a rapid double-tap on a game-page transition must not steal an action.
test('#42: ghost-tap gate — start/draw/pass/again all disable at render across a full 2-player round', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี'];
  game.mount(stage, makeCtx(players));

  const start = stage.children.find((c) => c.id === 'ss-start');
  assert.ok(start, 'ss-start missing');
  assert.equal(start.disabled, true, 'ss-start must be disabled at mount');

  // before arming: a ghost tap must not start the round
  start.click();
  assert.ok(!stage.children.some((c) => c.id === 'ss-draw'),
    'a disabled "ss-start" fired anyway — the round started before the window elapsed');

  // one window later the same tap really does start it — every later click in this test also waits
  // out its own control's window, since a disabled control now dispatches nothing (real gate is live)
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(start.disabled, false, '"ss-start" never armed');
  start.click(); // startRound()

  const draw1 = stage.children.find((c) => c.id === 'ss-draw');
  assert.ok(draw1, 'ss-draw missing for turn 1');
  assert.equal(draw1.disabled, true,
    'ss-draw must be disabled the instant the turn screen renders — a ghost tap must not draw for the next player before the phone changed hands');
  const holderLine1 = stage.children[0].textContent;
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(draw1.disabled, false, '"ss-draw" never armed for turn 1');
  draw1.click(); // drawForHolder() for holder 0

  const pass1 = stage.children.find((c) => c.id === 'ss-pass');
  assert.ok(pass1, 'ss-pass missing for turn 1');
  assert.equal(pass1.disabled, true,
    'ss-pass must be disabled immediately after a draw — a ghost tap must not pass the phone before the card was read');
  const drawnLine1 = stage.children[1].textContent;
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(pass1.disabled, false, '"ss-pass" never armed for turn 1');
  pass1.click(); // passToNext() -> holder 1's turn (2 players, round not over yet)

  const draw2 = stage.children.find((c) => c.id === 'ss-draw');
  assert.ok(draw2, 'ss-draw missing for turn 2');
  assert.equal(draw2.disabled, true, 'ss-draw must disable again on the next player\'s turn screen too');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(draw2.disabled, false, '"ss-draw" never armed for turn 2');
  draw2.click();

  const pass2 = stage.children.find((c) => c.id === 'ss-pass');
  assert.equal(pass2.disabled, true, 'ss-pass must disable again on the second draw too');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(pass2.disabled, false, '"ss-pass" never armed for turn 2');
  pass2.click(); // roundOver -> renderSummary

  const again = stage.children.find((c) => c.id === 'ss-again');
  assert.ok(again, 'ss-again missing at summary');
  assert.equal(again.disabled, true,
    'ss-again must be disabled at the summary screen — a ghost tap must not restart the round before it was read');

  // before arming: a ghost tap on "ss-again" must not restart the round
  again.click();
  assert.ok(!stage.children.some((c) => c.id === 'ss-start'),
    'a disabled "ss-again" fired anyway — the round restarted before the summary was read');

  // one window later the same press really does restart the round
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(again.disabled, false, '"ss-again" never armed');
  again.click();
  assert.ok(stage.children.some((c) => c.id === 'ss-start'), '"ss-again" did not restart the round once armed');

  // Every intermediate click in this test only ever fired once its own control was actually enabled —
  // the turn/holder line and the drawn card text captured along the way must still be exactly what
  // those real clicks produced.
  assert.ok(holderLine1.includes(players[0]), 'turn 1 did not announce the first holder');
  assert.ok(drawnLine1.length > 0, 'turn 1 drew no card text');

  game.dispose();
});
