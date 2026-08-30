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

// The ticking screen nests its blocks (holder, fuse) in wrapper divs the shallow stageText/querySelector
// above miss. These reach into the fake tree: deepText for "no seconds readout anywhere", findByIdDeep
// for the nested fuse fill, hasAnchor for ADR-0014 (no <a> on any screen).
const deepText = (node) => [node._text ?? '', ...(node.children ?? []).map(deepText)].join(' ').trim();
const findByIdDeep = (node, id) => {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = findByIdDeep(child, id);
    if (hit) return hit;
  }
  return null;
};
const hasAnchor = (node) => node.tagName === 'a' || (node.children ?? []).some(hasAnchor);

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

// ---- gh#77 acceptance criteria, pinned before the screen was rebuilt (fail today). Since gh#151 the
// bar's width is a fixed wall-clock cycle rather than the remaining fuse, so what these three tests
// pin is that the bar is ALIVE and carries no readout — how much is left is pinned by the gh#151
// tests at the bottom of this file. ----

test('the fuse bar is alive: its width changes as the round runs, and never as a seconds readout', (t) => {
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

    const fuse = findByIdDeep(stage, 'tb-fuse');
    assert.ok(fuse, 'the ticking screen carries no fuse bar');
    const before = fuse.style.width;
    assert.ok(before, 'the fuse bar carries no width before the round ticks');

    fakeNow += 100; // 100ms into the round
    assert.ok(pendingFrame, 'setup: arm() did not schedule a frame');
    pendingFrame();
    const after = fuse.style.width;
    assert.notEqual(after, before, `the fuse bar did not change as the round ran: ${before} -> ${after}`);

    assert.ok(!/\d+\s*วินาที/.test(deepText(stage)), `the stage leaks a remaining-seconds readout: ${deepText(stage)}`);

    game.dispose();
  } finally {
    Date.now = realDateNow;
  }
});

test('the pass-on control is the primary control and carries game-btn-primary', (t) => {
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

    const pass = byId(stage, 'tb-pass');
    assert.ok(pass, 'the ticking screen carries no pass-on control');
    const classes = (pass.className ?? '').split(/\s+/);
    assert.ok(classes.includes('game-btn'), `tb-pass is not a shared game-btn: ${pass.className}`);
    assert.ok(classes.includes('game-btn-primary'), `tb-pass is not the primary control: ${pass.className}`);
    assert.equal(pass.textContent, 'ส่งต่อ');

    game.dispose();
  } finally {
    Date.now = realDateNow;
  }
});

test('no navigation target (no <a>) renders inside #stage on any screen', (t) => {
  const realDateNow = Date.now;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(['เอ', 'บี', 'ซี']);
  try {
    let fakeNow = 1_700_000_000_000;
    Date.now = () => fakeNow;

    game.mount(stage, ctx);
    assert.ok(!hasAnchor(stage), 'the idle screen renders an anchor inside #stage');

    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'tb-start').click();
    assert.ok(!hasAnchor(stage), 'the ticking screen renders an anchor inside #stage');

    fakeNow += FUSE_MAX_MS + 1;
    assert.ok(pendingFrame, 'setup: arm() did not schedule a frame');
    pendingFrame(); // one frame past the deadline → detonate() → renderBoom()
    assert.ok(!hasAnchor(stage), 'the boom screen renders an anchor inside #stage');

    game.dispose();
  } finally {
    Date.now = realDateNow;
  }
});

// ---- gh#77 box7: prefers-reduced-motion — the fuse's information must survive, the per-frame
// style write must not. `window.matchMedia` is swapped per-test (restored in `finally`), since the
// module-level stub above always reports `matches: false`. ----

test('gh#77: prefers-reduced-motion reduces the fuse write to coarse steps, not once per frame', (t) => {
  const realDateNow = Date.now;
  const realMatchMedia = window.matchMedia;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(['เอ', 'บี', 'ซี']);
  try {
    let fakeNow = 1_700_000_000_000;
    Date.now = () => fakeNow;

    game.mount(stage, ctx);
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'tb-start').click();

    const fuse = findByIdDeep(stage, 'tb-fuse');
    assert.ok(fuse, 'the ticking screen carries no fuse bar');

    assert.ok(pendingFrame, 'setup: arm() did not schedule a frame');
    pendingFrame(); // primes the coarse-step clock at the round's start time
    const primed = fuse.style.width;

    fakeNow += 60; // well inside one coarse step
    pendingFrame();
    assert.equal(fuse.style.width, primed, `reduced motion wrote the fuse on a frame 60ms after the last coarse step: ${primed} -> ${fuse.style.width}`);

    fakeNow += 300; // past one coarse step (a few updates per second)
    pendingFrame();
    assert.notEqual(fuse.style.width, primed, 'reduced motion never updated the fuse — the round stops looking live');

    game.dispose();
  } finally {
    Date.now = realDateNow;
    window.matchMedia = realMatchMedia;
  }
});

test('gh#77: without prefers-reduced-motion, the fuse still writes on every frame', (t) => {
  const realDateNow = Date.now;
  // matches: false is what the module-level stub already reports — no override needed, this pins
  // the unchanged path against the same reduced-motion code that gates it above.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(['เอ', 'บี', 'ซี']);
  try {
    let fakeNow = 1_700_000_000_000;
    Date.now = () => fakeNow;

    game.mount(stage, ctx);
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'tb-start').click();

    const fuse = findByIdDeep(stage, 'tb-fuse');
    pendingFrame();
    const w1 = fuse.style.width;

    fakeNow += 60; // well under the reduced-motion coarse step — must still update here
    pendingFrame();
    assert.notEqual(fuse.style.width, w1, `full motion should write every frame, not just every coarse step: ${w1} -> ${fuse.style.width}`);

    game.dispose();
  } finally {
    Date.now = realDateNow;
  }
});

// ---- gh#151: a fuse of 30-90s that a player cannot time ------------------------------------------
// The hazard is a CLASS, not one element: ANY observable channel carrying a value derived from the
// deadline (text, an inline style, an attribute, a data-* field) lets a player who counts elapsed
// seconds solve for the total, because every such value is a ratio of elapsed to total. So the test
// below does not name the fuse bar — it serialises the WHOLE ticking screen and asserts two rounds
// with different fuse lengths are indistinguishable at the same elapsed time.
// Ceiling, stated rather than hidden: this covers the DOM. The tick SOUND's cadence is still
// urgency-paced (tickIntervalMs) and is deliberately left that way — it is the game's tension
// mechanic and the ticking screen's own hint line advertises it, and gh#151 enumerates screen,
// announcements and drawing. Removing it is a product decision, not this ticket's.

/** Every channel the fake DOM can carry, recursively — deliberately not a list of ids. */
function snapshot(node) {
  return {
    tag: node.tagName ?? null,
    id: node.id ?? null,
    className: node.className ?? null,
    text: node._text ?? '',
    html: node.innerHTML ?? null,
    hidden: node.hidden ?? null,
    disabled: node.disabled ?? null,
    style: { ...node.style },
    attrs: { ...node._attrs },
    children: (node.children ?? []).map(snapshot),
  };
}

/** Runs one round with a FIXED fuse draw and returns the ticking screen after `elapsedMs`. */
function tickingSnapshot(t, fuseRand, elapsedMs) {
  const realDateNow = Date.now;
  const realRandom = Math.random;
  const stage = fakeDocument.createElement('div');
  try {
    let fakeNow = START;
    Date.now = () => fakeNow;
    Math.random = () => fuseRand;
    game.mount(stage, makeCtx(['เอ', 'บี', 'ซี']));
    t.mock.timers.tick(ARM_WINDOW_MS + 1);
    byId(stage, 'tb-start').click();
    fakeNow += elapsedMs;
    assert.ok(pendingFrame, 'setup: arm() did not schedule a frame');
    pendingFrame();
    assert.ok(byId(stage, 'tb-pass'), 'setup: the round already left the ticking screen');
    return snapshot(stage);
  } finally {
    game.dispose();
    Date.now = realDateNow;
    Math.random = realRandom;
  }
}

test('gh#151: the fuse is drawn from 30-90 seconds, both bounds pinned', () => {
  assert.equal(FUSE_MIN_MS, 30_000);
  assert.equal(FUSE_MAX_MS, 90_000);
  assert.equal(pickDeadline(START, () => 0) - START, 30_000);
  assert.equal(pickDeadline(START, () => 0.999_999_9) - START, 90_000);

  // Seeded (mulberry32) so the spread below is reproducible rather than a flake waiting to happen.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 5_000; i += 1) {
    const fuse = pickDeadline(START, rand) - START;
    assert.ok(fuse >= 30_000 && fuse <= 90_000, `fuse ${fuse} ms is outside 30-90s`);
    min = Math.min(min, fuse);
    max = Math.max(max, fuse);
  }
  assert.ok(min < 31_000, `5000 draws never came near the 30s floor (min ${min})`);
  assert.ok(max > 89_000, `5000 draws never came near the 90s ceiling (max ${max})`);
});

test('gh#151: no observable channel on the ticking screen tells the two fuse lengths apart', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const elapsed of [5_000, 20_000]) {
    const shortFuse = tickingSnapshot(t, 0, elapsed); // 30s
    const longFuse = tickingSnapshot(t, 0.999_999_9, elapsed); // 90s
    assert.deepEqual(
      shortFuse,
      longFuse,
      `after ${elapsed}ms the ticking screen differs between a 30s and a 90s fuse — some channel is deadline-derived`,
    );
  }
});

test('gh#151: the fuse bar still animates, and its animation is a fixed cycle of the wall clock', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // Same round, one frame later: the bar must still move (it is the "fuse is burning" signal), and
  // it must move identically whatever the fuse length is (asserted by the deep-equal test above).
  const a = tickingSnapshot(t, 0.5, 5_000);
  // 300ms, not 400: the wave is a symmetric triangle, and 400ms lands on the mirrored point of the
  // same cycle — an interval where a right and a wrong version agree measures nothing.
  const b = tickingSnapshot(t, 0.5, 5_300);
  const widthOf = (snap) => JSON.stringify(snap).match(/"width":"[^"]*"/g);
  assert.ok(widthOf(a), 'the ticking screen carries no fuse bar at all');
  assert.notDeepEqual(widthOf(a), widthOf(b), 'the fuse bar is frozen — the screen no longer shows a live round');
});
