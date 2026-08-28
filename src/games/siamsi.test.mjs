// node --test src/games/ — no framework, no dependency
// checks only the pure helpers exported from siamsi.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { buildDeck, draw, FORTUNES, isShake, SHAKE_KICK, HINT_SHAKE, HINT_TAP_ONLY, HINT_ENABLE_SHAKE } from './siamsi.ts';
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
// gh#106 — the leave-confirm's arming signal is a document event (watduang:round-started), so the fake
// document has to be able to carry one: with no dispatchEvent here the announcement throws and every
// screen test below fails on the harness instead of on the code. `dispatchedTypes` is what the
// round-started test reads; reset it per test, it is shared with every mount in this file.
const dispatchedTypes = [];
const fakeDocument = {
  createElement: (tag) => new FakeElement(tag),
  dispatchEvent: (event) => { dispatchedTypes.push(event.type); return true; },
};
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

test('deck has 24 cards, numbers do not repeat', () => {
  assert.equal(FORTUNES.length, 24);
  const numbers = new Set(FORTUNES.map((f) => f.number));
  assert.equal(numbers.size, 24);
});

// buildDeck no longer slices to a player count — a solo round draws the top card of the whole deck,
// so every reshuffle must still be the complete 24 with nothing lost or duplicated.
test('buildDeck returns the whole 24-card deck every time, no repeats', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const deck = buildDeck(Math.random);
    assert.equal(deck.length, 24);
    assert.equal(new Set(deck.map((i) => FORTUNES[i].number)).size, 24);
  }
});

test('drawing from an empty deck must throw', () => {
  assert.throws(() => draw([]), /empty/);
});

// REFUTE flagged that the first test suite didn't force a real shuffle — swapping buildDeck for a
// plain slice still passed, even though "เล่นอีกรอบ" must yield a new order. This test pins a
// controllable rand so the result is actually checkable.
test('buildDeck really shuffles, not just returns the original order', () => {
  // rand fixed at 0 -> Fisher-Yates swaps order[i] with order[0] every round = a precomputable result
  const expected = (() => {
    const order = FORTUNES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) [order[i], order[0]] = [order[0], order[i]];
    return order;
  })();
  assert.deepEqual(buildDeck(() => 0), expected);
  assert.notDeepEqual(buildDeck(() => 0), FORTUNES.map((_, i) => i), 'buildDeck returned the original order = not shuffled');

  // different rand must give a different order, otherwise rand isn't being used at all
  assert.notDeepEqual(buildDeck(() => 0), buildDeck(() => 0.99));

  // the drawn card follows the shuffle, so two different rands must be able to hand back different cards
  assert.notEqual(draw(buildDeck(() => 0)).fortune.number, draw(buildDeck(() => 0.99)).fortune.number);
});

// gh#106 — this game's page declares [1, 1] (ADR-0040), so it renders no #player-setup and the shell
// has no `hidden` bit to read. ADR-0015's predicate is that the guard arms "when the page has started
// a round", and on a solo page this module is the only thing that knows — the announcement below is
// what arms the leave-confirm. Both directions in one test, because the shipped defect was the arming
// half: the idle screen must announce NOTHING (a reader who has touched nothing navigates freely,
// which is what daily-fortune and love-match rely on by never announcing at all), and a started round
// must announce exactly once.
test('gh#106: startRound announces watduang:round-started — and the idle screen announces nothing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  dispatchedTypes.length = 0;
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี']));
  assert.deepEqual(dispatchedTypes, [], 'the idle screen must announce no round — nothing has started yet');

  const start = stage.children.find((c) => c.id === 'ss-start');
  assert.ok(start, 'ss-start missing — the idle half of this test would pass vacuously');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();
  assert.ok(stage.children.some((c) => c.id === 'ss-draw'), 'positive control: the click really did start the round');
  assert.deepEqual(dispatchedTypes, ['watduang:round-started'], 'a started round must announce exactly once');
  game.dispose();
});

// The resume path is gone with the party round: this page writes no checkpoint, and the site-wide
// slot may still hold a live party round from another game. Mounting must ignore it outright — no
// resume, and no announcement, because nothing has started here.
test('gh#106: a checkpoint in the shared slot resumes nothing and announces nothing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  dispatchedTypes.length = 0;
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(['ก', 'ข', 'ค']);
  ctx.session.checkpoint = { game: 'siamsi', players: ['ก', 'ข', 'ค'], deck: [1, 2], holder: 0, results: [{ player: 'ก', n: 3 }], phase: 'drawn', drawn: 3 };
  game.mount(stage, ctx);

  assert.ok(stage.children.some((c) => c.id === 'ss-start'), 'a checkpoint pulled the mount off the idle screen');
  assert.deepEqual(dispatchedTypes, [], 'nothing started, so nothing may announce');
  game.dispose();
});

// #42: the ghost-tap gate — a rapid double-tap on a game-page transition must not steal an action.
test('#42: ghost-tap gate — start/draw/again all disable at render across a full solo round', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['ก', 'ข']));

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

  const drawBtn = stage.children.find((c) => c.id === 'ss-draw');
  assert.ok(drawBtn, 'ss-draw missing on the turn screen');
  assert.equal(drawBtn.disabled, true,
    'ss-draw must be disabled the instant the turn screen renders — a ghost tap must not draw the card before the barrel is on screen');
  drawBtn.click();
  assert.ok(!stage.children.some((c) => c.id === 'ss-again'),
    'a disabled "ss-draw" fired anyway — the card was drawn before the window elapsed');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(drawBtn.disabled, false, '"ss-draw" never armed');
  drawBtn.click(); // drawFortune()

  const drawnLine = stage.children[1].textContent;
  const again = stage.children.find((c) => c.id === 'ss-again');
  assert.ok(again, 'ss-again missing on the drawn screen');
  assert.equal(again.disabled, true,
    'ss-again must be disabled at the drawn screen — a ghost tap must not throw the card away before it was read');

  // before arming: a ghost tap on "ss-again" must not restart the round
  again.click();
  assert.ok(!stage.children.some((c) => c.id === 'ss-start'),
    'a disabled "ss-again" fired anyway — the round restarted before the card was read');

  // one window later the same press really does restart the round
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(again.disabled, false, '"ss-again" never armed');
  again.click();
  assert.ok(stage.children.some((c) => c.id === 'ss-start'), '"ss-again" did not restart the round once armed');

  // Every intermediate click above only ever fired once its own control was actually enabled — the
  // card text captured along the way must still be what that real click produced.
  assert.ok(drawnLine.length > 0, 'the round drew no card text');

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

  assert.ok(stage.children.some((c) => c.id === 'ss-again'),
    'tapping ss-draw did not advance the round to the drawn screen');

  game.dispose();
});

// gh#78 / ADR-0014 — no navigation target anywhere inside #stage, on any screen the game renders.
test('gh#78: no <a> element renders inside #stage on any screen', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['ก', 'ข', 'ค']));
  assertNoAnchors(stage); // idle

  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();
  assertNoAnchors(stage); // turn

  const draw = stage.children.find((c) => c.id === 'ss-draw');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  draw.click();
  assertNoAnchors(stage); // drawn — the screen that took over the summary's restart button

  const again = stage.children.find((c) => c.id === 'ss-again');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  again.click();
  assertNoAnchors(stage); // idle again

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
  const ssPass = () => stage.children.find((c) => c.id === 'ss-again');

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

test('gh#83: the tail of a double-shake is swallowed by the drawn screen, and by the next round\u2019s arm window', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = makeMotionWindow();
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['ก', 'ข']));
  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click(); // the turn renders, shake disarmed
  t.mock.timers.tick(ARM_DELAY_MS + 1); // the shake gate arms
  globalThis.window.motion(STILL);
  globalThis.window.motion(KICK_UP); // the draw — the screen swaps to drawn
  const again = stage.children.find((c) => c.id === 'ss-again');
  assert.ok(again, 'the armed shake did not draw');

  // the tail of the double-shake lands on the drawn screen — the phase gate must swallow it
  globalThis.window.motion(KICK_DOWN);
  globalThis.window.motion(KICK_UP);
  assert.ok(stage.children.some((c) => c.id === 'ss-again') && !stage.children.some((c) => c.id === 'ss-draw'),
    'a shake on the drawn screen advanced the round');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  again.click(); // back to idle, then start a second round
  const start2 = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start2.click();
  assert.ok(stage.children.some((c) => c.id === 'ss-draw'), 'the second round never rendered its turn screen');

  // a shake inside the new round's arm window must not draw for it either
  globalThis.window.motion(STILL);
  globalThis.window.motion(KICK_UP);
  globalThis.window.motion(KICK_DOWN);
  globalThis.window.motion(KICK_UP);
  assert.ok(stage.children.some((c) => c.id === 'ss-draw') && !stage.children.some((c) => c.id === 'ss-again'),
    'a shake inside the second round\u2019s arm window drew a card');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  globalThis.window.motion(KICK_DOWN); // armed now — a deliberate shake
  assert.ok(stage.children.some((c) => c.id === 'ss-again'), 'the armed shake in the second round did not draw');

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
  assert.ok(stage.children.some((c) => c.id === 'ss-draw') && !stage.children.some((c) => c.id === 'ss-again'),
    'a shake drew before the granted path had armed');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  globalThis.window.motion(KICK_DOWN);
  assert.ok(stage.children.some((c) => c.id === 'ss-again'), 'the armed shake on a granted device did not draw');

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
  const again = stage.children.find((c) => c.id === 'ss-again');
  assert.ok(again, 'the tap-only path broke after a refusal');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  again.click(); // teardown + remount — the refusal must survive it

  const start2 = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start2.click();

  // the refusal is sticky for the page, not the round: the next round advertises nothing again
  assert.equal(q(stage, 'sm-hint').textContent, mod.HINT_TAP_ONLY, 'a later round re-advertised the shake after a refusal');
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
  assert.ok(stage.children.some((c) => c.id === 'ss-again'), 'the shake could not draw under reduced motion');

  game.dispose();
  delete globalThis.window;
});

// ADR-0040 — this page declares [1, 1] and the shell mounts it with a session that has no roster.
// A multi-player session is the divergence input: a solo build must ignore it outright. Mounting
// with players: [] would make a solo and a party build agree, so it would measure nothing.
test('solo: a multi-player session is ignored — one draw, no holder line, no dots, no summary', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['ก', 'ข', 'ค']));

  const start = stage.children.find((c) => c.id === 'ss-start');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  start.click();

  assert.equal(q(stage, 'sm-holder-name'), null, 'the turn screen still names a phone holder');
  assert.equal(q(stage, 'sm-dots'), null, 'the turn screen still renders per-player progress dots');

  const draw = stage.children.find((c) => c.id === 'ss-draw');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  draw.click();

  // one draw ends the round: the drawn card screen offers a restart, never a hand-off to a next player
  assert.equal(stage.children.find((c) => c.id === 'ss-pass'), undefined, 'the drawn screen still passes the phone on');
  assert.ok(stage.children.some((c) => c.id === 'ss-again'), 'the drawn screen offers no way to draw again');

  game.dispose();
});
