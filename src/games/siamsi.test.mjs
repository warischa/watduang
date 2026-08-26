// node --test src/games/ — no framework, no dependency
// checks only the pure helpers exported from siamsi.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { buildDeck, draw, nextTurn, toCheckpoint, resumeFrom, FORTUNES, isShake, SHAKE_KICK, HINT_SHAKE, HINT_TAP_ONLY, HINT_ENABLE_SHAKE } from './siamsi.ts';
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
  // gh#78 — the turn screen sets className on wrappers/dots and renders the barrel via innerHTML.
  // className uses the same attr store as setAttribute. gh#83 needs one more surface: the sensor
  // path writes the wobble transform onto the barrel's svg, so innerHTML now forks off an svg
  // child node whenever the payload opens one — the string alone gives the tilt path nothing to
  // write onto.
  get className() { return this._attrs['class'] ?? ''; }
  set className(v) { this._attrs['class'] = String(v); }
  set innerHTML(v) {
    this._innerHTML = v;
    if (String(v).includes('<svg') && !this.children.some((c) => c.tagName === 'svg')) {
      this.children.push(new FakeElement('svg'));
    }
  }
  // gh#83 — only the barrel's svg child is ever looked up; everything else resolves to null.
  querySelector(sel) {
    return sel === 'svg' ? (this.children.find((c) => c.tagName === 'svg') ?? null) : null;
  }
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

/** Recursive first match by a single class token over the fake DOM — gh#78's turn screen nests the
    holder name and dot row inside wrapper divs, so the gate test can no longer read stage.children[0]. */
function q(node, cls) {
  if ((node.className || '').split(/\s+/).includes(cls)) return node;
  for (const c of node.children || []) {
    const hit = q(c, cls);
    if (hit) return hit;
  }
  return null;
}

/** ADR-0014 — no navigation target may render inside #stage. Walk the whole stage tree and fail on any
    anchor, whatever screen produced it. */
function assertNoAnchors(node) {
  assert.notEqual(String(node.tagName).toLowerCase(), 'a', 'an <a> rendered inside #stage');
  for (const c of node.children || []) assertNoAnchors(c);
}

/** Filled-dot count: a dot carries `sm-dot--drawn` once its player has drawn, `sm-dot` alone before. */
function countDrawn(dots) {
  return dots.children.filter((c) => (c.className || '').split(/\s+/).includes('sm-dot--drawn')).length;
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
  const holderLine1 = q(stage, 'sm-holder-name').textContent;
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

// gh#78 — the progress dots derive from the live roster and the draw count, never a hardcoded six.
test('gh#78: dot row = one dot per player, filled per person who has drawn (roster of 4, not 6)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี', 'ซี', 'ดี'];
  game.mount(stage, makeCtx(players));

  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click(); // renderTurn for holder 0 — nobody has drawn yet

  let dots = q(stage, 'sm-dots');
  assert.ok(dots, 'the turn screen rendered no dot row');
  assert.equal(dots.children.length, 4, 'one dot per player — not a hardcoded 6');
  assert.equal(countDrawn(dots), 0, 'no dots filled before the first draw');

  const draw = stage.children.find((c) => c.id === 'ss-draw');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  draw.click(); // holder 0 draws
  const pass = stage.children.find((c) => c.id === 'ss-pass');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  pass.click(); // renderTurn for holder 1

  dots = q(stage, 'sm-dots');
  assert.equal(dots.children.length, 4);
  assert.equal(countDrawn(dots), 1, 'one dot filled after one person has drawn');

  game.dispose();
});

// gh#78 — tapping the control alone advances the round; no gesture path is exercised on the way there.
test('gh#78: the draw control alone advances the round — no shake/gesture required', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี']));

  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();

  const draw = stage.children.find((c) => c.id === 'ss-draw');
  assert.ok(draw, 'no draw control rendered on the turn screen');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  draw.click(); // a tap alone — no devicemotion/shake anywhere on this path

  assert.ok(stage.children.some((c) => c.id === 'ss-pass'),
    'tapping ss-draw did not advance the round to the drawn screen');

  game.dispose();
});

// gh#78 / ADR-0014 — no navigation target anywhere inside #stage, on any screen the game renders.
test('gh#78: no <a> element renders inside #stage on any screen', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี', 'ซี']));
  assertNoAnchors(stage); // idle

  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();
  assertNoAnchors(stage); // turn

  const draw = stage.children.find((c) => c.id === 'ss-draw');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  draw.click();
  assertNoAnchors(stage); // drawn

  const pass = stage.children.find((c) => c.id === 'ss-pass');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  pass.click();
  assertNoAnchors(stage); // next turn

  game.dispose();
});

// ---- gh#83: the shake-to-draw sensor path ----

/** Minimal window stand-in for the sensor tests. The module only reads DeviceMotionEvent,
 *  matchMedia, addEventListener and removeEventListener off it. motion() drives the captured
 *  devicemotion listeners directly with the pair of sample objects a real event carries;
 *  requestPermission, when configured, returns whatever promise factory the test supplies. */
function makeMotionWindow({ permission = null, reduced = false } = {}) {
  const listeners = {};
  const calls = [];
  const DME = permission
    ? class FakeDeviceMotionEvent {
        static requestPermission() {
          calls.push('requestPermission');
          return permission();
        }
      }
    : class FakeDeviceMotionEvent {};
  return {
    DeviceMotionEvent: DME,
    matchMedia: () => ({ matches: reduced }),
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) {
      const list = listeners[type] ?? [];
      listeners[type] = list.filter((f) => f !== fn);
    },
    motion(accel, inclGravity = accel) {
      for (const fn of listeners.devicemotion ?? []) {
        fn({ acceleration: accel, accelerationIncludingGravity: inclGravity });
      }
    },
    motionListeners() { return (listeners.devicemotion ?? []).length; },
    permissionCalls: calls,
  };
}

// sample vocabulary: a resting reading, and hard kicks in both directions (16 m/s^2 of change,
// well past SHAKE_KICK)
const STILL = { x: 0, y: 0, z: 0 };
const KICK_UP = { x: 16, y: 0, z: 0 };
const KICK_DOWN = { x: -16, y: 0, z: 0 };

/** flushes the opt-in promise resolution: a setImmediate lands after promise microtasks, and
 *  node:test's fake timers leave setImmediate alone. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('gh#83: isShake — a kick below SHAKE_KICK never shakes, at or past it always does', () => {
  assert.equal(isShake(STILL, STILL), false);
  assert.equal(isShake(STILL, { x: SHAKE_KICK - 0.1, y: 0, z: 0 }), false);
  assert.equal(isShake(STILL, { x: SHAKE_KICK, y: 0, z: 0 }), true);
  assert.equal(isShake(STILL, KICK_DOWN), true);
  assert.equal(isShake(KICK_UP, KICK_DOWN), true);
});

test('gh#83: no motion sensor — the tap-only hint renders, no shake affordance of any kind', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();

  const hint = q(stage, 'sm-hint');
  assert.ok(hint, 'turn screen rendered no hint line');
  assert.equal(hint.textContent, HINT_TAP_ONLY, 'a sensor-less device still ships the shake line');
  assert.ok(!(hint.className || '').split(/\s+/).includes('sm-hint--tap'),
    'a sensor-less device must not render the opt-in affordance');

  game.dispose();
});

test('gh#83: a shake inside the arm window cannot advance the round; the same shake after ARM_DELAY_MS draws', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = makeMotionWindow();
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click(); // renderTurn for holder 0 — the shake path starts disarmed

  const hint = q(stage, 'sm-hint');
  assert.equal(hint.textContent, HINT_SHAKE, 'a device with a sensor keeps the shipped shake line');
  assert.equal(globalThis.window.motionListeners(), 1, 'a ready sensor gets exactly one devicemotion listener');

  // wobble positive control: the barrel's svg receives a 3d transform from the tilt source
  const barrelSvg = q(stage, 'sm-barrel').querySelector('svg');
  globalThis.window.motion(STILL, { x: 2, y: 0, z: 0 });
  assert.ok(barrelSvg && barrelSvg.style.transform, 'no wobble transform reached the barrel svg');

  const ssDraw = () => stage.children.find((c) => c.id === 'ss-draw');
  const ssPass = () => stage.children.find((c) => c.id === 'ss-pass');

  // a shake pair mid-window: the kick must not draw AND must re-defer arming, so ticking out the
  // original window alone must not arm the path either
  t.mock.timers.tick(200); // T+200, still inside the 400ms window
  globalThis.window.motion(STILL);
  globalThis.window.motion(KICK_UP);
  assert.ok(ssDraw() && !ssPass(), 'a shake inside the arm window drew a card');
  t.mock.timers.tick(201); // T+401 — the original window has elapsed
  globalThis.window.motion(KICK_DOWN);
  assert.ok(ssDraw() && !ssPass(), 'a shake drew after the original window elapsed — arming was not re-deferred by the earlier kick');

  // a full quiet window after the last kick arms the path; the next kick draws
  t.mock.timers.tick(400);
  globalThis.window.motion(KICK_UP);
  assert.ok(ssPass(), 'the armed shake did not draw');

  game.dispose();
  assert.equal(globalThis.window.motionListeners(), 0, 'dispose() leaked the devicemotion listener');
  delete globalThis.window;
});

test('gh#83: a double-shake straight after a draw never reaches the next player', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = makeMotionWindow();
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click(); // turn 1 renders, shake disarmed
  t.mock.timers.tick(ARM_DELAY_MS + 1); // the shake gate arms
  globalThis.window.motion(STILL);
  globalThis.window.motion(KICK_UP); // players[0] draws — the screen swaps to drawn
  const pass1 = stage.children.find((c) => c.id === 'ss-pass');
  assert.ok(pass1, 'the armed shake did not draw');

  // the tail of the double-shake lands on the drawn screen — the phase gate must swallow it
  globalThis.window.motion(KICK_DOWN);
  globalThis.window.motion(KICK_UP);
  assert.ok(stage.children.some((c) => c.id === 'ss-pass') && !stage.children.some((c) => c.id === 'ss-draw'),
    'a shake on the drawn screen advanced the round');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  pass1.click(); // players[1]'s turn renders — the shake path must be disarmed again
  const draw2 = stage.children.find((c) => c.id === 'ss-draw');
  assert.ok(draw2, 'turn 2 never rendered');

  // the second shake of the same hand motion lands inside turn 2's arm window: no draw for players[1]
  globalThis.window.motion(STILL);
  globalThis.window.motion(KICK_UP);
  globalThis.window.motion(KICK_DOWN);
  globalThis.window.motion(KICK_UP);
  assert.ok(stage.children.some((c) => c.id === 'ss-draw') && !stage.children.some((c) => c.id === 'ss-pass'),
    'a shake inside turn 2’s arm window drew for the next player');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  globalThis.window.motion(KICK_DOWN); // armed now — players[1]'s deliberate shake
  assert.ok(stage.children.some((c) => c.id === 'ss-pass'), 'the armed shake on turn 2 did not draw');

  game.dispose();
  delete globalThis.window;
});

// The two iOS tests each import their own module instance (query-string cache-bust). The grant and
// refusal flags are page-lifetime by design — sticky across "เล่นอีกรอบ" — so a shared module would
// let one test's answer pollute the other's setup, and a mid-test failure would leak state into
// every later test. A fresh instance is a fresh page.
test('gh#83: iOS — permission is asked only on the opt-in tap, and a grant arms the shake path', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mod = await import('./siamsi.ts?gh83-grant');
  const gameFresh = mod.default;
  globalThis.window = makeMotionWindow({ permission: () => Promise.resolve('granted') });
  const stage = fakeDocument.createElement('div');
  gameFresh.mount(stage, makeCtx(['เอ', 'บี']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();

  // asked on load? never — the mount and the turn render must be silent
  assert.equal(globalThis.window.permissionCalls.length, 0, 'permission was requested on load — the opt-in must be the only trigger');
  assert.equal(globalThis.window.motionListeners(), 0, 'a pre-grant turn opened a devicemotion listener');

  const hintBtn = q(stage, 'sm-hint');
  assert.equal(hintBtn.tagName, 'button', 'the opt-in affordance must be a real control');
  assert.equal(hintBtn.textContent, mod.HINT_ENABLE_SHAKE);
  assert.ok((hintBtn.className || '').split(/\s+/).includes('sm-hint--tap'), 'the opt-in must read as tappable');

  // the tap opts in — the one and only requestPermission call
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  hintBtn.click();
  assert.equal(globalThis.window.permissionCalls.length, 1, 'the opt-in tap never reached requestPermission');
  await flush();

  const hint2 = q(stage, 'sm-hint');
  assert.equal(hint2.textContent, mod.HINT_SHAKE, 'the granted hint must switch to the shipped shake line');
  assert.ok(!(hint2.className || '').split(/\s+/).includes('sm-hint--tap'), 'the granted hint must stop reading as tappable');
  assert.equal(globalThis.window.motionListeners(), 1, 'the granted turn did not open the sensor listener');

  // the granted path arms on the same delay as everything else — a shake first waits its window
  globalThis.window.motion(STILL);
  globalThis.window.motion(KICK_UP);
  assert.ok(stage.children.some((c) => c.id === 'ss-draw') && !stage.children.some((c) => c.id === 'ss-pass'),
    'a shake drew before the granted path had armed');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  globalThis.window.motion(KICK_DOWN);
  assert.ok(stage.children.some((c) => c.id === 'ss-pass'), 'the armed shake on a granted device did not draw');

  gameFresh.dispose();
  delete globalThis.window;
});

test('gh#83: iOS — a refused permission degrades silently to tap-only, for the rest of the round', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mod = await import('./siamsi.ts?gh83-refusal');
  const gameFresh = mod.default;
  globalThis.window = makeMotionWindow({ permission: () => Promise.resolve('denied') });
  const stage = fakeDocument.createElement('div');
  gameFresh.mount(stage, makeCtx(['เอ', 'บี']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();

  const hintBtn = q(stage, 'sm-hint');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  hintBtn.click();
  await flush();

  // silent: the tap-only line replaces the opt-in, with no error text anywhere
  const hint2 = q(stage, 'sm-hint');
  assert.equal(hint2.textContent, mod.HINT_TAP_ONLY, 'a refusal left the shake line behind');
  assert.ok(!(hint2.className || '').split(/\s+/).includes('sm-hint--tap'), 'a refusal left the tappable affordance behind');
  assert.equal(globalThis.window.motionListeners(), 0, 'a refusal still opened a sensor listener');

  // the tap-only path carries the round exactly as before
  const draw = stage.children.find((c) => c.id === 'ss-draw');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  draw.click();
  const pass = stage.children.find((c) => c.id === 'ss-pass');
  assert.ok(pass, 'the tap-only path broke after a refusal');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  pass.click();

  // the refusal is sticky for the page: the next turn advertises nothing again
  assert.equal(q(stage, 'sm-hint').textContent, mod.HINT_TAP_ONLY, 'a later turn re-advertised the shake after a refusal');
  assert.equal(globalThis.window.motionListeners(), 0);
  assert.equal(globalThis.window.permissionCalls.length, 1, 'permission was asked again on a later turn');

  gameFresh.dispose();
  delete globalThis.window;
});

test('gh#83: prefers-reduced-motion — a shake still draws, but the barrel never moves', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = makeMotionWindow({ reduced: true });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();

  // tilt arrives, but under reduced motion no transform may reach the svg
  const barrelSvg = q(stage, 'sm-barrel').querySelector('svg');
  globalThis.window.motion(STILL, { x: 6, y: 0, z: 0 });
  globalThis.window.motion(STILL, { x: 9, y: 0, z: 0 });
  assert.ok(barrelSvg, 'the barrel svg is missing');
  assert.equal(barrelSvg.style.transform, undefined, 'a transform was written under prefers-reduced-motion: reduce');

  // the input path is not the movement: the shake still draws under reduced motion
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  globalThis.window.motion(KICK_UP);
  assert.ok(stage.children.some((c) => c.id === 'ss-pass'), 'the shake could not draw under reduced motion');

  game.dispose();
  delete globalThis.window;
});
