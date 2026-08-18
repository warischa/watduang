// node --test src/games/ — no framework, no dependency
// Mostly checks the pure time numbers exported from timebomb.ts (no DOM needed).
// The one DOM test near the bottom (ghost-tap-on-boom) uses a hand-rolled fake `document`/`window`/
// `navigator` (no jsdom/happy-dom in this repo) that implements only what timebomb.ts's el()/on()/
// frame() actually touch — see love-match.test.mjs's #36 tests for the same pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { urgencyAt, pickDeadline, FUSE_MIN_MS, FUSE_MAX_MS } from './timebomb.ts';

const START = 1_700_000_000_000;
const DEADLINE = START + 30_000;

test('urgency = 0 ตอนเริ่ม และ = 1 ตอนถึงกำหนด', () => {
  assert.equal(urgencyAt(START, START, DEADLINE), 0);
  assert.equal(urgencyAt(DEADLINE, START, DEADLINE), 1);
  assert.equal(urgencyAt(START + 15_000, START, DEADLINE), 0.5);
});

// the long-tab-switch-away case: an unclamped elapsed/total would return > 1 — this is the bug this test exists to catch
test('urgency ค้างที่ 1 เมื่อเลยกำหนดไปไกลแล้ว', () => {
  assert.equal(urgencyAt(DEADLINE + 10 * 60_000, START, DEADLINE), 1);
  assert.equal(urgencyAt(START - 5_000, START, DEADLINE), 0);
  assert.equal(urgencyAt(START, START, START), 1); // total = 0 must never divide by zero
});

test('urgency ไม่ลดลงเลยตลอดช่วงที่สุ่มตัวอย่าง', () => {
  let prev = -1;
  for (let t = START - 5_000; t <= DEADLINE + 60_000; t += 250) {
    const u = urgencyAt(t, START, DEADLINE);
    assert.ok(u >= prev, `urgency ลดลงที่ t=${t}: ${u} < ${prev}`);
    assert.ok(u >= 0 && u <= 1, `urgency หลุดช่วง 0..1 ที่ t=${t}: ${u}`);
    prev = u;
  }
  assert.equal(prev, 1);
});

test('pickDeadline คืนเวลาสัมบูรณ์ที่อยู่ในช่วงฟิวส์', () => {
  for (const r of [0, 0.5, 0.999999]) {
    const fuse = pickDeadline(START, () => r) - START;
    assert.ok(fuse >= FUSE_MIN_MS && fuse <= FUSE_MAX_MS, `ฟิวส์ ${fuse} ms หลุดช่วง`);
  }
});

// ---- Ghost-tap-on-boom (#37's single-tap sibling): a tap on "เล่นอีกรอบ" tears down and remounts —
// the idle screen it lands on must still name who lost, not silently drop it. ----

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this.hidden = false;
    this.disabled = false;
  }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  // Only supports the '#id' form paintWakeWarning() actually uses — not a real CSS engine.
  querySelector(sel) {
    const id = sel.replace(/^#/, '');
    return this.children.find((c) => c.id === id) ?? null;
  }
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  // A disabled control dispatches no activation — the platform swallows the click before any
  // listener runs. The fake models that on purpose: without it every gate assertion passes vacuously.
  click() {
    if (this.disabled) return;
    (this._listeners.click || []).forEach((fn) => fn());
  }
}
const fakeDocument = {
  hidden: false,
  _listeners: {},
  createElement: (tag) => new FakeElement(tag),
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  },
};
globalThis.document = fakeDocument;
globalThis.window = { matchMedia: () => ({ matches: false }) }; // no AudioContext → unlockAudio() returns null
// Node >=21 defines a getter-only global `navigator` — plain assignment throws, defineProperty overrides it.
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true }); // no vibrate, no wakeLock → both optional paths no-op

// rAF is captured, not auto-run — the test drives frame() itself once the fake clock has passed deadline
let pendingFrame = null;
globalThis.requestAnimationFrame = (cb) => { pendingFrame = cb; return 1; };
globalThis.cancelAnimationFrame = () => { pendingFrame = null; };

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

/** All text currently in the stage, concatenated — enough to assert "contains the loser's name" without caring about node structure. */
function stageText(stage) {
  return stage.children.map((c) => c.textContent).join(' ');
}

const byId = (stage, id) => stage.children.find((c) => c.id === id);
const ARM_WINDOW_MS = 400; // the contracted quiet window — see _arm-gate.ts

test('ghost tap on "เล่นอีกรอบ": the idle screen it lands on still names last round\'s loser', (t) => {
  const realDateNow = Date.now;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี', 'ซี'];
  const ctx = makeCtx(players);

  try {
    let fakeNow = 1_700_000_000_000;
    Date.now = () => fakeNow;

    game.mount(stage, ctx);
    const startBtn = stage.children.find((c) => c.id === 'tb-start');
    assert.ok(startBtn, 'setup: no start button on the idle screen');
    t.mock.timers.tick(ARM_WINDOW_MS + 1); // the start button is gated on mount — this is a deliberate press
    startBtn.click(); // arm(): holder = players[0] = "เอ"

    fakeNow += FUSE_MAX_MS + 1; // guaranteed past the deadline, whatever the random fuse picked
    assert.ok(pendingFrame, 'setup: arm() did not schedule a frame');
    pendingFrame(); // one frame past the deadline → detonate() → renderBoom()

    const boomText = stageText(stage);
    assert.ok(boomText.includes('เอ'), `setup: boom screen should name the loser — got: ${boomText}`);

    const againBtn = stage.children.find((c) => c.id === 'tb-again');
    assert.ok(againBtn, 'setup: no "เล่นอีกรอบ" button on the boom screen');
    againBtn.click(); // ghost tap: tears down and remounts into the idle screen

    const idleText = stageText(stage);
    assert.ok(idleText.includes('เอ'), `idle screen after a ghost tap dropped the loser's name — got: ${idleText}`);

    game.dispose();
  } finally {
    Date.now = realDateNow;
  }
});

// ---- The ghost-tap chain (#37): renderBoom swaps the stage with no warning, "เล่นอีกรอบ" lands where
// the previous control was, and the idle screen puts "เริ่มจับเวลา" where "เล่นอีกรอบ" just was. Two
// stale contacts in a row and the fuse is live with nobody aware it is running. ----

test('a ghost tap on "เริ่มจับเวลา" right after the remount cannot start a live fuse', (t) => {
  const realDateNow = Date.now;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(['เอ', 'บี', 'ซี']);

  try {
    let fakeNow = 1_700_000_000_000;
    Date.now = () => fakeNow;

    game.mount(stage, ctx);
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'tb-start').click();
    fakeNow += FUSE_MAX_MS + 1;
    assert.ok(pendingFrame, 'setup: arm() did not schedule a frame');
    pendingFrame(); // one frame past the deadline → detonate() → the boom screen
    pendingFrame = null;
    assert.ok(byId(stage, 'tb-again'), 'setup: no "เล่นอีกรอบ" button on the boom screen');

    byId(stage, 'tb-again').click(); // the tap the finger meant for the ticking screen — remounts to idle
    byId(stage, 'tb-start').click(); // ...and the second contact of that same double-tap lands here

    assert.equal(pendingFrame, null, 'a ghost tap started a fuse — it is now running and nobody knows');
    assert.ok(!byId(stage, 'tb-pass'), `a ghost tap swapped the stage to the ticking screen: ${stageText(stage)}`);
    assert.ok(byId(stage, 'tb-start'), `the idle screen should still be up: ${stageText(stage)}`);

    // one window later the very same press is a deliberate start, and it must work
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'tb-start').click();
    assert.ok(byId(stage, 'tb-pass'), `"เริ่มจับเวลา" never armed — the game cannot be started: ${stageText(stage)}`);
    assert.ok(pendingFrame, 'the fuse is not running after a deliberate start');

    game.dispose();
  } finally {
    Date.now = realDateNow;
  }
});
