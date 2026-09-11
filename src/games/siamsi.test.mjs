// node --test src/games/ — no framework, no dependency.
// gh#97's four screens and the accumulator behind them. The deck's own seam (28 slips, the grade
// proportions, the content rules) is _siamsi-deck.test.mjs and is deliberately not re-tested here.
//
// This file used to carry its own FakeElement copy. It now uses the shared one, because the slip
// screen nests four reading rows inside a panel and the old copy could not walk into an innerHTML
// payload at all — an <a> inside a markup constant was invisible to its ADR-0014 sweep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, {
  isShake,
  SHAKE_KICK,
  SHAKE_TARGET,
  HOLD_STEP_MS,
  chargeRatio,
  isReleased,
  HINT_SHAKE,
  HINT_TAP_ONLY,
  HINT_ENABLE_SHAKE,
  BTN_INTENT_DONE,
  BTN_HOLD,
  BTN_OPEN_SLIP,
  BTN_KEEP,
  BTN_TIE,
  DONE_KEEP,
  DONE_TIE,
  BTN_AGAIN,
} from './siamsi.ts';
import { ASPECT_LABEL, INTENT_LABEL, SLIPS } from './_siamsi-deck.ts';
import { ARM_DELAY_MS } from './_arm-gate.ts';
import { makeDocument } from './_fake-dom.mjs';

const fakeDocument = makeDocument();
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

/** Recursive first match by a single class token. */
function q(node, cls) {
  if ((node.className || '').split(/\s+/).includes(cls)) return node;
  for (const c of node.children || []) {
    const hit = q(c, cls);
    if (hit) return hit;
  }
  return null;
}

/** Recursive lookup by id — the screens nest their controls inside panels now. */
function byId(node, id) {
  if (node.id === id) return node;
  for (const c of node.children || []) {
    const hit = byId(c, id);
    if (hit) return hit;
  }
  return null;
}

/** ADR-0014 — no navigation target may render inside #stage. Walk the whole stage tree and fail on
 *  any anchor, whatever screen or markup constant produced it. */
function assertNoAnchors(node) {
  assert.notEqual(String(node.tagName).toLowerCase(), 'a', 'an <a> rendered inside #stage');
  for (const c of node.children || []) assertNoAnchors(c);
}

/** Every text node under a subtree, flattened — used to assert that a word is or is not on screen. */
function allText(node, out = []) {
  if (node.textContent) out.push(node.textContent);
  for (const c of node.children || []) allText(c, out);
  return out;
}

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

/** One armed kick. Each call alternates direction so consecutive samples always differ by more than
 *  SHAKE_KICK — the accumulator counts kicks, so the caller counts calls. */
function kick(win, i) {
  win.motion(i % 2 === 0 ? KICK_UP : KICK_DOWN);
}

const timers = { apis: ['setTimeout', 'setInterval'] };

// ---- the accumulator, as pure functions ----

test('gh#97: the release threshold is above one kick, so a single jolt can never reach it', () => {
  assert.ok(SHAKE_TARGET > 1, 'a target of one is a single-kick release, which is the shipped bug');
  assert.equal(isReleased(1), false);
  assert.equal(isReleased(SHAKE_TARGET - 1), false);
  assert.equal(isReleased(SHAKE_TARGET), true);
  assert.equal(chargeRatio(0), 0);
  assert.equal(chargeRatio(SHAKE_TARGET), 1);
  assert.equal(chargeRatio(SHAKE_TARGET * 2), 1, 'the meter must clamp, not overflow its track');
  assert.ok(chargeRatio(1) > 0 && chargeRatio(1) < 1, 'one kick must move the meter without filling it');
});

test('gh#83: isShake — a kick below SHAKE_KICK never shakes, at or past it always does', () => {
  assert.equal(isShake(STILL, STILL), false);
  assert.equal(isShake(STILL, { x: SHAKE_KICK - 0.1, y: 0, z: 0 }), false);
  assert.equal(isShake(STILL, { x: SHAKE_KICK, y: 0, z: 0 }), true);
  assert.equal(isShake(KICK_UP, KICK_DOWN), true);
});

// ---- the four screens ----

test('gh#97: ตั้งจิต to a read slip, four screens, without ever asking who is playing', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  // A multi-player session is the divergence input: a page that still reads the roster would show
  // it. Mounting with an empty roster would make a solo and a party build agree and measure nothing.
  game.mount(stage, makeCtx(['ก', 'ข', 'ค']));

  // screen one — "ตั้งจิต"
  const done = byId(stage, 'ss-intent-done');
  assert.ok(done, 'the ตั้งจิต screen has no way forward');
  assert.equal(done.textContent, BTN_INTENT_DONE);
  assert.ok(q(stage, 'sm-chips'), 'the ตั้งจิต screen offers no subject to ask about');
  for (const text of allText(stage)) {
    assert.ok(!/ผู้เล่น|คนที่|ส่งมือถือ|วง/.test(text), `the page asked about players: "${text}"`);
  }
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  done.click();

  // screen two — "เขย่า"
  const hold = byId(stage, 'ss-hold');
  assert.ok(hold, 'the เขย่า screen has no press-and-hold control');
  assert.equal(hold.textContent, BTN_HOLD);
  assert.ok(q(stage, 'sm-meter-fill'), 'the เขย่า screen shows no accumulation meter');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  hold.dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);

  // screen three — "ไม้ติ้วตก". The number is here and the "คำทำนาย" is not: that separation is the
  // point of the screen, so assert the absence too.
  const open = byId(stage, 'ss-open-slip');
  assert.ok(open, 'the ไม้ติ้วตก screen never rendered');
  assert.equal(open.textContent, BTN_OPEN_SLIP);
  const numeral = q(stage, 'sm-number-thai');
  assert.ok(numeral && /^[๐-๙]+$/.test(numeral.textContent), 'no Thai numeral on the landing screen');
  assert.equal(q(stage, 'sm-verse'), null, 'the กลอน appeared before the number had its own screen');
  assert.equal(q(stage, 'sm-slip'), null, 'the slip appeared before the number had its own screen');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  open.click();

  // screen four — "ใบเซียมซี"
  const slip = q(stage, 'sm-slip');
  assert.ok(slip, 'the ใบเซียมซี screen never rendered');
  assert.ok(q(stage, 'sm-verse'), 'the slip carries no กลอน');
  assert.equal(q(stage, 'sm-rows').children.length, 4, 'the slip must carry all four readings');
  assert.ok(q(stage, 'sm-closing'), 'the slip carries no closing thought');
  // the number on the stick and the number on the slip are the same draw
  assert.equal(q(stage, 'sm-slip-number').textContent, numeral.textContent);

  // the two closing actions end in place, not on a fifth screen
  const keep = byId(stage, 'ss-keep');
  assert.equal(keep.textContent, BTN_KEEP);
  assert.equal(byId(stage, 'ss-tie').textContent, BTN_TIE);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  keep.click();
  assert.ok(allText(stage).includes(DONE_KEEP), 'keeping the slip said nothing');
  const again = byId(stage, 'ss-again');
  assert.equal(again.textContent, BTN_AGAIN);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  again.click();
  assert.ok(byId(stage, 'ss-intent-done'), 'the restart did not land back on ตั้งจิต');

  game.dispose();
});

test('gh#97: the other closing action ties the slip away, and also ends in place', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-hold').dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-open-slip').click();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-tie').click();
  assert.ok(allText(stage).includes(DONE_TIE), 'tying the slip away said nothing');
  assert.ok(byId(stage, 'ss-again'), 'tying the slip away offered no restart');
  game.dispose();
});

// ---- the accumulation, through the real screens ----

test('gh#97: a single jolt does not release a ติ้ว; a sustained shake does', (t) => {
  t.mock.timers.enable(timers);
  globalThis.window = makeMotionWindow();
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  assert.equal(q(stage, 'sm-hint').textContent, HINT_SHAKE, 'a device with a sensor lost the shake line');

  // arm the sensor path the same way every control on this site arms
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  const fill = q(stage, 'sm-meter-fill');
  assert.equal(fill.style.width, '0%');
  // the first sample only seeds the delta — a fresh screen never kicks on arrival
  globalThis.window.motion(STILL);

  // ONE jolt. The meter moves and nothing else does — this is the assertion that fails the instant
  // the accumulation is removed and the first kick releases again.
  kick(globalThis.window, 0);
  assert.equal(byId(stage, 'ss-open-slip'), null, 'a single jolt released a ติ้ว');
  assert.equal(fill.style.width, `${Math.round(chargeRatio(1) * 100)}%`, 'the single jolt did not move the meter');

  // the rest of a sustained shake, stopping one kick short
  for (let i = 1; i < SHAKE_TARGET - 1; i++) kick(globalThis.window, i);
  assert.equal(byId(stage, 'ss-open-slip'), null, 'the ติ้ว came out one kick early');

  kick(globalThis.window, SHAKE_TARGET - 1);
  assert.ok(byId(stage, 'ss-open-slip'), 'a sustained shake never released the ติ้ว');

  game.dispose();
  assert.equal(globalThis.window.motionListeners(), 0, 'dispose() leaked the devicemotion listener');
  delete globalThis.window;
});

test('gh#83: a shake inside the arm window cannot charge, and every kick re-defers arming', (t) => {
  t.mock.timers.enable(timers);
  globalThis.window = makeMotionWindow();
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click(); // the shake path starts disarmed

  const fill = q(stage, 'sm-meter-fill');
  // wobble positive control: the barrel's svg receives a 3d transform from the tilt source
  const barrelSvg = q(stage, 'sm-barrel').querySelector('svg');
  globalThis.window.motion(STILL, { x: 2, y: 0, z: 0 });
  assert.ok(barrelSvg && barrelSvg.style.transform, 'no wobble transform reached the barrel svg');

  t.mock.timers.tick(200); // still inside the window
  kick(globalThis.window, 0);
  assert.equal(fill.style.width, '0%', 'a kick inside the arm window charged the meter');
  t.mock.timers.tick(201); // the ORIGINAL window has now elapsed
  kick(globalThis.window, 1);
  assert.equal(fill.style.width, '0%', 'arming was not re-deferred by the earlier kick');

  t.mock.timers.tick(ARM_DELAY_MS + 1); // a full quiet window after the last kick
  kick(globalThis.window, 2);
  assert.notEqual(fill.style.width, '0%', 'the armed kick never charged');

  game.dispose();
  delete globalThis.window;
});

// ---- the press-and-hold fallback ----

test('gh#97: with no motion sensor the press-and-hold reaches the same ติ้ว, and a tap does not', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();

  const hint = q(stage, 'sm-hint');
  assert.equal(hint.textContent, HINT_TAP_ONLY, 'a sensor-less device still ships the shake line');
  assert.ok(!(hint.className || '').split(/\s+/).includes('sm-hint--tap'),
    'a sensor-less device must not render the opt-in affordance');

  const hold = byId(stage, 'ss-hold');
  t.mock.timers.tick(ARM_DELAY_MS + 1);

  // a TAP — press and let go. It must leave the meter exactly where it was.
  hold.dispatch('pointerdown');
  hold.dispatch('pointerup');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET * 2);
  assert.equal(q(stage, 'sm-meter-fill').style.width, '0%', 'a tap charged the meter');
  assert.equal(byId(stage, 'ss-open-slip'), null, 'a tap released a ติ้ว');

  // a HOLD, released one step short
  hold.dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * (SHAKE_TARGET - 1) + 1);
  assert.equal(byId(stage, 'ss-open-slip'), null, 'the hold released the ติ้ว early');
  t.mock.timers.tick(HOLD_STEP_MS);
  assert.ok(byId(stage, 'ss-open-slip'), 'a full hold never released the ติ้ว');

  game.dispose();
});

test('gh#97: the hold interval stops when the screen is replaced under the finger', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  const hold = byId(stage, 'ss-hold');
  t.mock.timers.tick(ARM_DELAY_MS + 1);

  // The finger never lifts: the release swaps the screen away, so no pointerup is ever delivered.
  // If the interval outlived the transition it would keep firing into the next screen.
  hold.dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET * 4);
  assert.ok(byId(stage, 'ss-open-slip'), 'the hold never released');
  assert.equal(byId(stage, 'ss-intent-done'), null, 'a runaway hold interval drove past the landing screen');

  game.dispose();
});

// ---- the picked subject leads the slip ----

// ADR-0059 — the gate decides from the browser's input stamp, not from when a handler ran, so a
// contact stamped inside the window can be DISPATCHED after the timer has already armed. The hold's
// own pointerdown check reads handler time and sees an enabled button, and the stage's bubble-phase
// re-disable then lands on an interval that is already running. The decision therefore has to be
// re-taken inside the interval, which is the one point the re-disable can still reach.
test('gh#97 / ADR-0059: a mid-window re-disable stops a hold that had already started', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  t.mock.timers.tick(ARM_DELAY_MS + 1);

  const hold = byId(stage, 'ss-hold');
  assert.equal(hold.disabled, false, 'the leg needs an ENABLED control to start the hold on');
  hold.dispatch('pointerdown'); // the contact starts legitimately, by handler time

  // the stamp guard re-takes the decision on the stage and re-disables the region under the finger
  stage.dispatch('pointerdown');
  assert.equal(hold.disabled, true, 'the stage-level re-disable never reached the hold control');

  // the finger stays down. Long enough to fill the meter several times over, and long enough that
  // the gate re-arms on the way — a hold that survived the re-disable would release here.
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET * 2);
  assert.equal(byId(stage, 'ss-open-slip'), null, 'a re-disabled hold ran on and released a ติ้ว');
  assert.equal(q(stage, 'sm-meter-fill').style.width, '0%', 'a re-disabled hold kept charging the meter');

  game.dispose();
});

test('gh#97: the หมวด picked on ตั้งจิต is the row that reads first on the slip', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);

  const chips = q(stage, 'sm-chips').children;
  const money = chips.find((c) => c.textContent === INTENT_LABEL.money);
  assert.ok(money, 'the การเงิน chip is missing');
  money.click();
  assert.ok(money.className.split(/\s+/).includes('sm-chip--on'), 'the picked chip does not read as picked');

  byId(stage, 'ss-intent-done').click();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-hold').dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-open-slip').click();

  const rows = q(stage, 'sm-rows').children;
  assert.equal(q(rows[0], 'sm-row-label').textContent, ASPECT_LABEL.money,
    'the slip did not lead with the subject the reader asked about');
  assert.ok(rows[0].className.split(/\s+/).includes('sm-row--asked'),
    'the asked-about row does not carry the accent bar');
  // and the other three are all still there, once each
  const labels = rows.map((r) => q(r, 'sm-row-label').textContent);
  assert.equal(new Set(labels).size, 4);

  game.dispose();
});

// ---- ADR-0014 ----

test('gh#97: no <a> element renders inside #stage on any of the four screens', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['ก', 'ข', 'ค']));
  assertNoAnchors(stage); // "ตั้งจิต"

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  assertNoAnchors(stage); // "เขย่า"

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-hold').dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);
  assertNoAnchors(stage); // "ไม้ติ้วตก"

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-open-slip').click();
  assertNoAnchors(stage); // "ใบเซียมซี"

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-keep').click();
  assertNoAnchors(stage); // the end state

  game.dispose();
});

// ---- the ghost-tap gate, across all four screens ----

test('#42: every screen disables its controls at render and arms one window later', (t) => {
  t.mock.timers.enable(timers);
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));

  const done = byId(stage, 'ss-intent-done');
  assert.equal(done.disabled, true, 'ตั้งจิต must be disabled at mount');
  done.click();
  assert.equal(byId(stage, 'ss-hold'), null, 'a disabled ตั้งจิต button fired anyway');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(done.disabled, false, 'ตั้งจิต never armed');
  done.click();

  const hold = byId(stage, 'ss-hold');
  assert.equal(hold.disabled, true, 'the hold control must be disabled the instant เขย่า renders');
  // The hold does not fire on click, so `disabled` alone does not gate it: whether a browser
  // delivers pointerdown to a disabled button's own listener is the runtime fact this repo's
  // arm-gate header says nothing in CI measures. A ghost contact that lands and stays down would
  // run the interval all the way to a release, and re-disabling the button mid-window does not
  // stop an interval that has already started.
  hold.dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET * 2);
  assert.equal(byId(stage, 'ss-open-slip'), null, 'a hold inside the arm window released a ติ้ว');
  assert.equal(q(stage, 'sm-meter-fill').style.width, '0%', 'a hold inside the arm window charged the meter');
  hold.dispatch('pointerup');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(hold.disabled, false, 'the hold control never armed');
  hold.dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);

  const open = byId(stage, 'ss-open-slip');
  assert.equal(open.disabled, true, 'the slip must not open before the number has been read');
  open.click();
  assert.equal(q(stage, 'sm-slip'), null, 'a disabled open-slip button fired anyway');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  open.click();

  const keep = byId(stage, 'ss-keep');
  const tie = byId(stage, 'ss-tie');
  assert.equal(keep.disabled, true, 'keeping the slip must be gated — it throws the read away');
  assert.equal(tie.disabled, true, 'tying the slip away must be gated — it throws the read away');
  keep.click();
  assert.ok(q(stage, 'sm-slip'), 'a disabled keep button fired anyway');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  keep.click();

  const again = byId(stage, 'ss-again');
  assert.equal(again.disabled, true, 'the restart must be gated at the end state');
  again.click();
  assert.equal(byId(stage, 'ss-intent-done'), null, 'a disabled restart fired anyway');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  again.click();
  assert.ok(byId(stage, 'ss-intent-done'), 'the armed restart did not restart');

  game.dispose();
});

// ---- reduced motion ----

test('gh#97: under reduced motion the barrel never moves, and the shake still lands on the number', (t) => {
  t.mock.timers.enable(timers);
  globalThis.window = makeMotionWindow({ reduced: true });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();

  // tilt arrives, but under reduced motion no transform may reach the svg
  const barrelSvg = q(stage, 'sm-barrel').querySelector('svg');
  globalThis.window.motion(STILL, { x: 6, y: 0, z: 0 });
  globalThis.window.motion(STILL, { x: 9, y: 0, z: 0 });
  assert.ok(barrelSvg, 'the barrel svg is missing');
  assert.equal(barrelSvg.style.transform, undefined, 'a transform was written under prefers-reduced-motion: reduce');

  // reduce, not remove: the meter — the mechanic — keeps reporting, and the "ติ้ว" still lands
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  const fill = q(stage, 'sm-meter-fill');
  kick(globalThis.window, 0);
  assert.notEqual(fill.style.width, '0%', 'the meter stopped reporting under reduced motion');
  for (let i = 1; i < SHAKE_TARGET; i++) kick(globalThis.window, i);
  assert.ok(byId(stage, 'ss-open-slip'), 'the shake could not land on the number under reduced motion');

  game.dispose();
  delete globalThis.window;
});

// ---- iOS, carried forward unchanged in behaviour (gh#97 box 3: "as it does today") ----

test('gh#83: iOS — permission is asked only on the opt-in tap, and a grant arms the shake path', async (t) => {
  t.mock.timers.enable(timers);
  const mod = await import('./siamsi.ts?gh83-grant');
  const gameFresh = mod.default;
  globalThis.window = makeMotionWindow({ permission: () => Promise.resolve('granted') });
  const stage = fakeDocument.createElement('div');
  gameFresh.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();

  // asked on load? never — the mount and the "เขย่า" render must be silent
  assert.equal(globalThis.window.permissionCalls.length, 0, 'permission was requested on load — the opt-in must be the only trigger');
  assert.equal(globalThis.window.motionListeners(), 0, 'a pre-grant screen opened a devicemotion listener');

  const hintBtn = q(stage, 'sm-hint');
  assert.equal(hintBtn.tagName, 'button', 'the opt-in affordance must be a real control');
  assert.equal(hintBtn.textContent, HINT_ENABLE_SHAKE);
  assert.ok((hintBtn.className || '').split(/\s+/).includes('sm-hint--tap'), 'the opt-in must read as tappable');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  hintBtn.click();
  assert.equal(globalThis.window.permissionCalls.length, 1, 'the opt-in tap never reached requestPermission');
  await flush();

  const hint2 = q(stage, 'sm-hint');
  assert.equal(hint2.textContent, HINT_SHAKE, 'the granted hint must switch to the shake line');
  assert.ok(!(hint2.className || '').split(/\s+/).includes('sm-hint--tap'), 'the granted hint must stop reading as tappable');
  assert.equal(globalThis.window.motionListeners(), 1, 'the granted screen did not open the sensor listener');

  // the granted path arms on the same delay as everything else
  const fill = q(stage, 'sm-meter-fill');
  globalThis.window.motion(STILL); // seeds the delta
  kick(globalThis.window, 0);
  assert.equal(fill.style.width, '0%', 'a kick charged before the granted path had armed');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  for (let i = 1; i <= SHAKE_TARGET; i++) kick(globalThis.window, i);
  assert.ok(byId(stage, 'ss-open-slip'), 'the armed shake on a granted device never released');

  gameFresh.dispose();
  delete globalThis.window;
});

test('gh#83: iOS — a refused permission degrades silently to the hold, for the rest of the page load', async (t) => {
  t.mock.timers.enable(timers);
  const mod = await import('./siamsi.ts?gh83-refusal');
  const gameFresh = mod.default;
  globalThis.window = makeMotionWindow({ permission: () => Promise.resolve('denied') });
  const stage = fakeDocument.createElement('div');
  gameFresh.mount(stage, makeCtx([]));
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();

  const hintBtn = q(stage, 'sm-hint');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  hintBtn.click();
  await flush();

  // silent: the hold line replaces the opt-in, with no error text anywhere
  const hint2 = q(stage, 'sm-hint');
  assert.equal(hint2.textContent, mod.HINT_TAP_ONLY, 'a refusal left the shake line behind');
  assert.ok(!(hint2.className || '').split(/\s+/).includes('sm-hint--tap'), 'a refusal left the tappable affordance behind');
  assert.equal(globalThis.window.motionListeners(), 0, 'a refusal still opened a sensor listener');

  // the hold carries the round exactly as it would on a device with no sensor at all
  const hold = byId(stage, 'ss-hold');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  hold.dispatch('pointerdown');
  t.mock.timers.tick(HOLD_STEP_MS * SHAKE_TARGET + 1);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-open-slip').click();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-keep').click();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-again').click(); // teardown + remount — the refusal must survive it

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  assert.equal(q(stage, 'sm-hint').textContent, mod.HINT_TAP_ONLY, 'a later round re-advertised the shake after a refusal');
  assert.equal(globalThis.window.permissionCalls.length, 1, 'permission was asked again on a later round');

  gameFresh.dispose();
  delete globalThis.window;
});

// ---- the shell contract ----

test('gh#106: leaving ตั้งจิต announces watduang:round-started — the ตั้งจิต screen itself announces nothing', (t) => {
  t.mock.timers.enable(timers);
  fakeDocument.dispatched.length = 0;
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  assert.deepEqual(fakeDocument.dispatchedTypes(), [], 'the ตั้งจิต screen announced a round nobody started');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  byId(stage, 'ss-intent-done').click();
  assert.deepEqual(fakeDocument.dispatchedTypes(), ['watduang:round-started']);

  game.dispose();
});

test('gh#106: a checkpoint in the shared slot resumes nothing and announces nothing', (t) => {
  t.mock.timers.enable(timers);
  fakeDocument.dispatched.length = 0;
  const ctx = makeCtx(['ก', 'ข']);
  ctx.session.checkpoint = { game: 'siamsi', players: ['ก', 'ข'], holder: 1 };
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx([]));
  assert.ok(byId(stage, 'ss-intent-done'), 'a stranded checkpoint moved the page off ตั้งจิต');
  assert.deepEqual(fakeDocument.dispatchedTypes(), []);
  game.dispose();
});

test('the module declares itself a one-person fortune page and draws from the full deck', () => {
  assert.deepEqual(game.players, [1, 1]);
  assert.equal(game.category, 'fortune');
  assert.equal(SLIPS.length, 28);
});
