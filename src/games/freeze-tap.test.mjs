// node --test src/games/freeze-tap.test.mjs — no framework, no dependency
// The pure block below needs no DOM. The screen tests at the bottom use the hand-rolled fake
// `document`/`window` pattern from short-stick.test.mjs / timebomb.test.mjs (no jsdom/happy-dom in
// this repo), widened only where this game needs it: pointerdown carries an event object, and
// performance.now() is a clock the test owns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, {
  SIGNALS,
  WAIT_MIN_MS,
  WAIT_MAX_MS,
  DECOY_HOLD_MS,
  DECOY_CLEAR_MS,
  MAX_DECOYS,
  REACT_CAP_MS,
  startRound,
  pickSignal,
  pickDecoy,
  pickDelay,
  padSchedule,
  displayMs,
  verdict,
  ranking,
  signalToken,
} from './freeze-tap.ts';

// ---- The loss rule: displayed ms, false start first, keyed on the turn ----

// The tie tolerance in the mockup's result comparison is applied to raw performance.now() floats,
// so two attempts that BOTH print "380 ms" resolve as a unique loser there and the sudden-death path
// is unreachable. Both inputs here round to the same displayed number and differ as raw floats, which
// is the only shape where a raw-float implementation and this one disagree.
test('a tie is decided on the DISPLAYED ms, never on the raw float', () => {
  const v = verdict([
    { player: 'เอ', turn: 0, ms: 210 },
    { player: 'บี', turn: 1, ms: 380.4 },
    { player: 'ซี', turn: 2, ms: 380.2 },
  ]);
  assert.deepEqual(v, { kind: 'tie', turns: [1, 2] });
  // and the two rows really do print the same number — otherwise the tie above is a lie on screen
  assert.equal(displayMs(380.4), displayMs(380.2));
});

// ms: null is the false-start shape on purpose. An implementation that stores Infinity instead
// passes a slowest-first sort by accident; null cannot be max-sorted into the loser slot.
test('a false start loses whatever anyone else scored — it is not the slowest valid time', () => {
  const v = verdict([
    { player: 'เอ', turn: 0, ms: 120 },
    { player: 'บี', turn: 1, ms: 900 },
    { player: 'ซี', turn: 2, ms: null },
  ]);
  assert.deepEqual(v, { kind: 'false-start', turn: 2 });
});

test('identity is the turn, never the name — two players may enter the same name', () => {
  const round = startRound(['เมย์', 'เมย์'], () => 0);
  assert.deepEqual(round.order, ['เมย์', 'เมย์']);
  const v = verdict([
    { player: 'เมย์', turn: 0, ms: 200 },
    { player: 'เมย์', turn: 1, ms: 500 },
  ]);
  assert.deepEqual(v, { kind: 'loser', turn: 1 });
});

// A capped attempt is an ordinary slow time. An implementation that treats the cap as a sentinel
// (a false start, or "no answer") gets both the loser and the kind wrong here.
test('the reaction cap ties like any other time', () => {
  const v = verdict([
    { player: 'เอ', turn: 0, ms: REACT_CAP_MS },
    { player: 'บี', turn: 1, ms: REACT_CAP_MS },
    { player: 'ซี', turn: 2, ms: 250 },
  ]);
  assert.deepEqual(v, { kind: 'tie', turns: [0, 1] });
});

test('ranking puts valid times ascending and false starts last', () => {
  const rows = ranking([
    { player: 'เอ', turn: 0, ms: 500 },
    { player: 'บี', turn: 1, ms: null },
    { player: 'ซี', turn: 2, ms: 100 },
  ]);
  assert.deepEqual(rows.map((r) => r.turn), [2, 0, 1]);
});

test('an empty attempt list throws instead of naming a loser nobody played for', () => {
  assert.throws(() => verdict([]), /ว่างเปล่า/);
});

test('an empty roster throws instead of starting a round nobody can lose', () => {
  assert.throws(() => startRound([]), /ว่างเปล่า/);
});

// ---- The signal and the decoys ----

test('every signal index is reachable and the token is built in one place', () => {
  // The mockup has exactly three word triggers. A fourth entry here is copy nobody wrote for this
  // product, so the count is pinned, not just the reachability of whatever count is present.
  assert.equal(SIGNALS.length, 3, 'SIGNALS no longer matches the mockup\'s three word triggers');
  // Byte-exact against the mockup's targetText, exclamation mark included, and paired with the
  // targetSymbol the mockup pairs it with (U+1F680, U+26A1, U+1F3AF — all single-codepoint, no
  // variation selector). The pairing is pinned, not just the words: a symbol set silently swapped for
  // some other three glyphs is the departure that shipped once already.
  assert.deepEqual(SIGNALS.map((s) => s.word), ['\u0e25\u0e38\u0e22\u0e40\u0e25\u0e22!', '\u0e01\u0e14\u0e40\u0e25\u0e22!', '\u0e40\u0e14\u0e35\u0e4b\u0e22\u0e27\u0e19\u0e35\u0e49!']);
  assert.deepEqual(SIGNALS.map((s) => s.symbol), ['🚀', '⚡', '🎯']);
  for (const sig of SIGNALS) {
    assert.equal([...sig.symbol].length, 1, `${sig.symbol} is multi-codepoint and must be written as an escape`);
  }
  const seen = new Set();
  for (let i = 0; i < SIGNALS.length; i++) {
    assert.equal(pickSignal(() => (i + 0.5) / SIGNALS.length), i);
    seen.add(i);
  }
  assert.equal(pickSignal(() => 0), 0);
  assert.equal(pickSignal(() => 1 - Number.EPSILON), SIGNALS.length - 1);
  assert.equal(seen.size, SIGNALS.length);
  assert.equal(signalToken(SIGNALS[0]), `${SIGNALS[0].symbol} ${SIGNALS[0].word}`);
});

// The rand value 0.5 maps straight onto index 1 under a naive `floor(rand() * SIGNALS.length)`, so a
// decoy generator without the exclusion returns the trigger itself — a decoy the player is supposed
// to tap on. Recompute this input if SIGNALS ever changes length: an input where the naive and the
// correct generator agree measures nothing.
test('a decoy can never be the active trigger, and every other index is reachable', () => {
  assert.equal(Math.floor(0.5 * SIGNALS.length), 1, 'the seed below no longer hits the naive collision');
  const events = padSchedule(6000, 1, () => 0.5);
  assert.ok(events.length > 0, 'no pad events at all — nothing was measured');
  for (const e of events) assert.notEqual(e.signal, 1, 'a decoy is identical to the trigger');

  for (let trigger = 0; trigger < SIGNALS.length; trigger++) {
    const seen = new Set();
    for (let i = 0; i < SIGNALS.length - 1; i++) {
      seen.add(pickDecoy(trigger, () => (i + 0.5) / (SIGNALS.length - 1)));
    }
    assert.equal(seen.has(trigger), false, `trigger ${trigger} was offered as its own decoy`);
    assert.equal(seen.size, SIGNALS.length - 1, `trigger ${trigger}: some non-trigger index is unreachable`);
  }
});

test('the delay never dips below the floor a player needs to read the pad', () => {
  assert.equal(pickDelay(() => 0), WAIT_MIN_MS);
  assert.ok(pickDelay(() => 0.999999) <= WAIT_MAX_MS);
  for (let i = 0; i < 500; i++) {
    const d = pickDelay();
    assert.ok(d >= WAIT_MIN_MS && d <= WAIT_MAX_MS, `delay ${d} out of range`);
  }
});

// The MINIMUM delay is the one that matters: an implementation that only clamps at long delays
// passes at 6000ms and fails here, which is exactly the mockup's shape.
test('the pad is resting for the last clearance window before every trigger, at the minimum delay', () => {
  for (let seed = 0; seed < 500; seed++) {
    const events = padSchedule(WAIT_MIN_MS, 0, Math.random);
    const latest = Math.max(...events.map((e) => e.at));
    assert.ok(
      latest <= WAIT_MIN_MS - DECOY_CLEAR_MS,
      `seed ${seed}: last pad event at ${latest}ms, past the ${WAIT_MIN_MS - DECOY_CLEAR_MS}ms clearance bound`,
    );
  }
});

// The mockup's decoy generator picks times first and post-filters the ones out of range, so at a
// short delay a share of them vanish and the run has no decoy at all. Slots are in range by construction
// here, so nothing is ever dropped.
test('no decoy is silently dropped, and shows and hides strictly alternate', () => {
  for (let seed = 0; seed < 500; seed++) {
    const events = padSchedule(WAIT_MIN_MS, 1, Math.random);
    assert.ok(events.length >= 2, `seed ${seed}: ${events.length} pad event(s) — a decoy was dropped`);
    assert.equal(events.length % 2, 0, `seed ${seed}: a show with no hide`);
    for (let i = 0; i < events.length; i++) {
      const isShow = i % 2 === 0;
      assert.equal(events[i].signal === null, !isShow, `seed ${seed}: event ${i} breaks show/hide alternation`);
      if (i > 0) assert.ok(events[i].at >= events[i - 1].at, `seed ${seed}: events out of ascending order`);
      if (isShow) assert.equal(events[i + 1].at - events[i].at, DECOY_HOLD_MS, `seed ${seed}: decoy hold is not ${DECOY_HOLD_MS}ms`);
    }
    assert.ok(events.length / 2 <= MAX_DECOYS, `seed ${seed}: more than ${MAX_DECOYS} decoys`);
  }
});

// ---- Fake DOM: the screens, the ghost-tap window, teardown, and the interrupted attempt ----

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
  // The game's stage listener calls preventDefault(), so the fake must hand it an event — a bare
  // fn() would throw and every tap assertion below would pass or fail for the wrong reason.
  dispatch(type, ev = { preventDefault() {} }) {
    (this._listeners[type] || []).forEach((fn) => fn(ev));
  }
  // A disabled control dispatches no activation — the platform swallows the click before any
  // listener runs. The fake models that on purpose: without it every gate assertion passes vacuously.
  click() { if (!this.disabled) this.dispatch('click'); }
  // A laid-out box, so attachFx() has something to size its canvas from. Without this the effect
  // layer bails before it ever builds a canvas and every burst assertion below passes vacuously.
  get clientWidth() { return 300; }
  get clientHeight() { return 300; }
  getContext(kind) { return kind === '2d' ? (this._ctx2d ??= makeCtx2d()) : null; }
}

/** A recording 2d context. Only the calls drawSparks() makes are modelled; `fills` is what proves a
 *  spark was actually painted, and `fillStyles` proves the colour came from the token read rather
 *  than from a hex compiled into the module. */
function makeCtx2d() {
  return {
    fills: 0,
    clears: 0,
    fillStyles: [],
    globalAlpha: 1,
    fillStyle: '',
    scale() {},
    clearRect() { this.clears += 1; },
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() { this.fills += 1; this.fillStyles.push(this.fillStyle); },
  };
}

const fakeDocument = {
  createElement: (tag) => new FakeElement(tag),
  hidden: false,
  _listeners: {},
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  },
  dispatched: [],
  dispatchEvent(ev) { this.dispatched.push(ev); },
};
globalThis.document = fakeDocument;

// The fake OS setting. `true` is the default for every test in this file that does not say otherwise
// — the same value the single-line stub this replaced returned, so no assertion below changes
// meaning. Flip it before mount(); the module reads the query in mountInto().
let reduceMotion = true;
const mqls = [];
function makeMql(matches) {
  const mql = {
    matches,
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) {
      this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
    },
  };
  mqls.push(mql);
  return mql;
}
globalThis.window = {
  matchMedia: (query) => {
    assert.equal(query, '(prefers-reduced-motion: reduce)', 'the module queried something else');
    return makeMql(reduceMotion);
  },
  devicePixelRatio: 2,
};
// The token read attachFx() does. A sentinel, not a hex: an assertion that the sparks are painted in
// THIS string is an assertion that the colour was read from --color-line-strong at runtime.
const INK_SENTINEL = 'the-ink-token';
globalThis.getComputedStyle = () => ({ getPropertyValue: () => `  ${INK_SENTINEL}  ` });

// The frame clock. Frames are drained by hand so a burst is an exact number of redraws rather than
// however many node happened to schedule.
let rafQueue = [];
let nextRafId = 1;
const rafRequested = [];
const rafCancelled = new Set();
globalThis.requestAnimationFrame = (fn) => {
  const id = nextRafId++;
  rafQueue.push({ id, fn });
  rafRequested.push(id);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  rafCancelled.add(id);
  rafQueue = rafQueue.filter((f) => f.id !== id);
};

// The clock the reaction time is measured against. Owned by the test so a reaction is an exact
// number rather than however long node took to run the tick.
let nowMs = 0;
Object.defineProperty(globalThis, 'performance', {
  configurable: true,
  writable: true,
  value: { now: () => nowMs },
});

function makeCtx(players) {
  return {
    roster: { names: () => [], add() {} },
    session: {
      players,
      setPlayers() {},
      played: [],
      markPlayed(id) { this.played.push(id); },
      checkpoint: null,
      saveCheckpoint() {},
      clear() {},
    },
  };
}

const ARM_WINDOW_MS = 400; // the contracted quiet window — see _arm-gate.ts

/** Advances the timer queue and the reaction clock together — a tick that moved only one of the two
 *  would make every measured reaction a fiction. */
function advance(t, ms) {
  nowMs += ms;
  t.mock.timers.tick(ms);
}
/** Runs the frames the effect layer has asked for, advancing the shared clock with them. Only the
 *  frames pending when the drain starts are run, so a loop that re-schedules itself cannot spin here. */
function drainFrames(count, msPerFrame = 16) {
  for (let i = 0; i < count; i++) {
    const frame = rafQueue.shift();
    if (!frame) return i;
    nowMs += msPerFrame;
    frame.fn(nowMs);
  }
  return count;
}

const descendants = (node) => [node, ...(node.children || []).flatMap((c) => descendants(c))];
const buttons = (stage) => descendants(stage).filter((e) => e.tagName === 'button');
const byId = (stage, id) => descendants(stage).find((e) => e.id === id);
const stageText = (stage) => descendants(stage).map((e) => e.textContent).filter(Boolean).join(' ');

/** A screen is gated only if it HAS buttons and all of them are inert — `every` over an empty list
 *  is true, so without the non-empty leg this assertion passes on a screen that built nothing. */
function assertGated(stage, screen) {
  const found = buttons(stage);
  assert.ok(found.length > 0, `the ${screen} screen built no button at all — nothing was measured`);
  assert.ok(found.every((b) => b.disabled), `a ${screen}-screen button is live at t0`);
}

// Math.random = 0.5 fixes the whole schedule: signal index 2, delay 3750ms, three decoys at
// 725/1725/2725ms. Every drive below leans on that delay, so the trigger fires when it says it does.
const FIXED_DELAY_MS = 3750;

/** handoff -> waiting -> triggered, then a tap `reactionMs` after the trigger. Leaves the stage on
 *  the attempt screen (or on results, if this was the last turn). */
function playTurn(t, stage, reactionMs) {
  advance(t, ARM_WINDOW_MS + 1);
  byId(stage, 'ft-ready').click();
  advance(t, FIXED_DELAY_MS);
  advance(t, reactionMs);
  stage.dispatch('pointerdown');
}

test('every screen that builds a button hands it to the arm gate — no screen ships live at t0', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['เอ', 'บี']));

    // handoff, straight out of mount
    assertGated(stage, 'handoff');

    // void: the tab hid mid-attempt
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    game.onVisibility(true);
    assert.ok(byId(stage, 'ft-retry'), 'the interrupted attempt did not reach the void screen');
    assertGated(stage, 'void');

    // attempt: retry the same turn and tap on the real signal
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-retry').click();
    playTurn(t, stage, 200);
    assert.ok(byId(stage, 'ft-next'), 'a valid tap did not reach the attempt screen');
    assertGated(stage, 'attempt');

    // showdown: the second player matches the first exactly
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    playTurn(t, stage, 200);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    assert.ok(byId(stage, 'ft-showdown'), 'two equal times did not reach the showdown screen');
    assertGated(stage, 'showdown');

    // results: the showdown resolves on a unique slowest
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-showdown').click();
    playTurn(t, stage, 150);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    playTurn(t, stage, 400);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    assert.ok(byId(stage, 'ft-again'), 'the showdown never resolved to a result');
    assertGated(stage, 'results');
    assert.ok(stageText(stage).includes('บี'), `the slowest player is not named: ${stageText(stage)}`);
    assert.ok(stageText(stage).includes('400 ms'), `the slowest time is not shown: ${stageText(stage)}`);

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

// The ready tap swaps the pad in under the same finger, so the hand-off's own ghost contact lands on
// the attempt surface. Without the window it costs that player the round before they ever saw the pad.
test('the ghost-tap window swallows the second contact instead of losing the round', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['เอ', 'บี']));
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click(); // -> waiting, armed at now + ARM_DELAY_MS

    advance(t, ARM_WINDOW_MS - 1);
    stage.dispatch('pointerdown'); // the ghost, one millisecond inside the window
    assert.equal(byId(stage, 'ft-again'), undefined, 'a ghost tap ended the round as a false start');
    assert.ok(stageText(stage).includes('รอสัญญาณ'), `the pad left the waiting state: ${stageText(stage)}`);

    advance(t, 2); // the window has closed; the same tap is now a deliberate one
    stage.dispatch('pointerdown');
    assert.ok(byId(stage, 'ft-again'), 'a deliberate early tap did not end the round');
    assert.ok(stageText(stage).includes('มือลั่น'), `the loss reason is not the false start: ${stageText(stage)}`);
    assert.ok(stageText(stage).includes('เอ'), `the false starter is not named: ${stageText(stage)}`);

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

test('dispose() clears every pending timer, and a stale callback changes nothing', (t) => {
  const realRandom = Math.random;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  nowMs = 0;
  const scheduled = [];
  const cleared = new Set();
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    let nextId = 1;
    globalThis.setTimeout = (fn, ms) => {
      const id = nextId++;
      scheduled.push({ id, fn, ms });
      return id;
    };
    globalThis.clearTimeout = (id) => { cleared.add(id); };
    const rafBaseline = rafRequested.length;

    game.mount(stage, makeCtx(['เอ', 'บี']));
    // The only timer scheduled so far is the arm gate's quiet window. Fire it by hand — with
    // setTimeout stubbed there is no queue to tick, and a disabled ready button swallows the click.
    // NOT spliced out: dropping it here is what made this test blind to a render function that
    // forgets to push its arm-gate disposer, which leaks both this timer and a stage listener.
    scheduled.forEach((s) => s.fn());
    byId(stage, 'ft-ready').click(); // -> waiting: decoy shows/hides plus the trigger

    const pending = scheduled.filter((s) => !cleared.has(s.id));
    assert.ok(pending.length >= 3, `only ${pending.length} timer(s) pending in the waiting phase`);

    // Light the pad by hand (setTimeout is stubbed, so the decoy timers never fire on their own) and
    // let the effect layer start its frame chain, so dispose() has a live rAF loop to tear down.
    scheduled.filter((s) => !cleared.has(s.id)).forEach((s) => s.fn());
    drainFrames(2);
    const framesAsked = rafRequested.slice(rafBaseline);

    game.dispose();
    // Every timer mount() and every render function created, the arm gate's included — contract rule
    // 11 is "EVERY timer", so the set this loop walks has to be the whole scheduled set.
    assert.ok(scheduled.length >= 4, `only ${scheduled.length} timer(s) were ever scheduled`);
    for (const s of scheduled) {
      assert.ok(cleared.has(s.id), `timer ${s.id} (${s.ms}ms) survived dispose()`);
    }
    // and the listeners with them — a leaked arm-gate disposer leaves a live pointerdown on the stage
    const liveOnStage = Object.entries(stage._listeners).filter(([, fns]) => fns.length > 0);
    assert.deepEqual(liveOnStage.map(([type]) => type), [], 'a stage listener survived dispose()');
    const liveOnDoc = Object.entries(fakeDocument._listeners).filter(([, fns]) => fns.length > 0);
    assert.deepEqual(liveOnDoc.map(([type]) => type), [], 'a document listener survived dispose()');
    // The effect layer's own two resources. The burst runs off rAF, not setTimeout, so the loop above
    // is blind to it: an uncancelled frame keeps writing pad.style.transform after the game is gone.
    assert.ok(framesAsked.length > 0, 'the pad light asked for no animation frame — nothing was measured');
    for (const id of framesAsked) {
      assert.ok(rafCancelled.has(id) || !rafQueue.some((f) => f.id === id), `animation frame ${id} survived dispose()`);
    }
    assert.equal(rafQueue.length, 0, 'a queued animation frame survived dispose()');
    const liveOnMql = mqls.flatMap((m) => Object.entries(m._listeners)).filter(([, fns]) => fns.length > 0);
    assert.deepEqual(liveOnMql.map(([type]) => type), [], 'the reduced-motion change listener survived dispose()');

    // firing every torn-down callback by hand must be inert — no throw, and nothing painted back
    for (const s of scheduled) s.fn();
    assert.equal(stage.children.length, 0, 'a stale callback painted into a torn-down stage');
  } finally {
    Math.random = realRandom;
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});

// A pause-and-resume implementation records the throttled trigger's ~20s gap as that player's
// "reaction" and hands them the round. Voiding the attempt is the only answer that cannot punish
// someone for a notification arriving.
test('hiding the tab voids the attempt, never loses it', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['เอ', 'บี']));
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();

    game.onVisibility(true);
    assert.ok(stageText(stage).includes('หลุดการโฟกัสเกม'), `the attempt was not voided: ${stageText(stage)}`);
    assert.equal(byId(stage, 'ft-again'), undefined, 'hiding the tab ended the round');

    // whatever the timer queue still held must not paint a trigger or record a reaction
    advance(t, FIXED_DELAY_MS + REACT_CAP_MS + 1);
    assert.ok(byId(stage, 'ft-retry'), `a stale timer left the void screen: ${stageText(stage)}`);

    // the same player replays their own turn
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-retry').click();
    assert.ok(stageText(stage).includes('เอ'), `the retry moved to a different player: ${stageText(stage)}`);

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

// The trigger has already lit when the tab hides (a notification swipe). The cap timer is still
// pending, a hidden tab throttles it, and on resume it would record REACT_CAP_MS as that player's
// reaction — the very thing voiding exists to prevent. The 'waiting' leg above cannot catch this.
test('hiding the tab after the trigger lights voids it too — the cap never becomes a reaction', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['เอ', 'บี']));
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    advance(t, FIXED_DELAY_MS); // the real signal is lit — phase is 'triggered', nobody has tapped
    assert.ok(
      SIGNALS.some((sig) => stageText(stage).includes(signalToken(sig))),
      `the trigger never lit — nothing was measured: ${stageText(stage)}`,
    );

    game.onVisibility(true);
    assert.ok(
      stageText(stage).includes('หลุดการโฟกัสเกม'),
      `hiding the tab in the triggered phase did not void the attempt: ${stageText(stage)}`,
    );

    // and the pending cap must be dead: on resume it may not record a reaction for the hidden tab
    advance(t, REACT_CAP_MS + 1);
    assert.ok(byId(stage, 'ft-retry'), `the throttled cap timer left the void screen: ${stageText(stage)}`);
    assert.ok(
      stageText(stage).includes(`${REACT_CAP_MS} ms`) === false,
      `the hidden tab was recorded as a ${REACT_CAP_MS} ms reaction: ${stageText(stage)}`,
    );
  } finally {
    game.dispose(); // in finally: a failing assert here must not leave the module mounted for the next test
    Math.random = realRandom;
  }
});

// The only session write this game makes (see the file header). Without it the round never counts as
// played, and nothing else in this file observes it.
test('the round end writes markPlayed exactly once, and not before the result', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(['เอ', 'บี']);
  try {
    Math.random = () => 0.5;
    game.mount(stage, ctx);
    playTurn(t, stage, 150);
    assert.deepEqual(ctx.session.played, [], 'a mid-round turn already marked the game played');

    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    playTurn(t, stage, 400);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    assert.ok(byId(stage, 'ft-again'), `the round never reached a result: ${stageText(stage)}`);
    assert.deepEqual(ctx.session.played, ['freeze-tap'], 'the round ended without writing markPlayed once');

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

test('no <a> element renders anywhere inside the stage, on any screen', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  const hasLink = () => descendants(stage).some((e) => e.tagName === 'a');
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['เอ', 'บี']));
    assert.equal(hasLink(), false, 'the handoff screen holds a navigation target');

    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    assert.equal(hasLink(), false, 'the waiting screen holds a navigation target');

    game.onVisibility(true);
    assert.equal(hasLink(), false, 'the void screen holds a navigation target');

    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-retry').click();
    playTurn(t, stage, 200);
    assert.equal(hasLink(), false, 'the attempt screen holds a navigation target');

    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    playTurn(t, stage, 200);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    assert.equal(hasLink(), false, 'the showdown screen holds a navigation target');

    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-showdown').click();
    playTurn(t, stage, 150);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    playTurn(t, stage, 400);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    assert.equal(hasLink(), false, 'the results screen holds a navigation target');

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

// The reaction cap closes the branch the mockup leaves hanging: TRIGGERED with nobody tapping is a
// dead end there — no timer, no button, the screen sits forever.
test('a triggered attempt nobody taps is capped and recorded, not left hanging', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['เอ', 'บี']));
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    advance(t, FIXED_DELAY_MS); // the trigger lights, and nobody touches the pad
    advance(t, REACT_CAP_MS + 1);

    assert.ok(byId(stage, 'ft-next'), `the triggered screen never resolved: ${stageText(stage)}`);
    assert.ok(
      stageText(stage).includes(`${REACT_CAP_MS} ms`),
      `the capped reaction was not recorded as ${REACT_CAP_MS} ms: ${stageText(stage)}`,
    );

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

// The escape hatch. Without the dispatch the button still runs teardown(), which empties #stage and
// leaves the player on a blank screen with no setup panel and no way back but a page reload — and
// src/pages/game/[id].astro is the only place that puts the panel back, on this event.
test('the secondary control is gated at t0 and then really does ask for the setup panel', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  const asked = () => fakeDocument.dispatched.filter((ev) => ev.type === 'watduang:change-players').length;
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['\u0e40\u0e2d', '\u0e1a\u0e35']));
    playTurn(t, stage, 200);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    playTurn(t, stage, 400);
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();

    const change = byId(stage, 'ft-change');
    assert.ok(change, 'the results screen built no ft-change control');
    const before = asked();
    assert.equal(change.disabled, true, 'ft-change must be inert the instant the result renders');
    change.click(); // the fake swallows activation on a disabled control, same as the platform
    assert.equal(asked(), before, 'a ghost tap on ft-change asked for the panel');
    assert.ok(byId(stage, 'ft-again'), 'a disabled control fired anyway — the results screen went away');

    advance(t, ARM_WINDOW_MS + 1);
    assert.equal(change.disabled, false, 'ft-change never armed');
    change.click();
    assert.equal(asked(), before + 1, 'an armed ft-change must dispatch watduang:change-players exactly once');
    assert.equal(stage.children.length, 0, 'the stage must be emptied when the group goes back to the panel');
  } finally {
    Math.random = realRandom;
  }
});

// The pad is a div[role=button][tabindex=0], so the keydown handler is the ENTIRE keyboard path to
// the game's only real action. A pointer-only implementation passes every other test in this file.
test('a keyboard activation records a reaction exactly as a pointer tap does', (t) => {
  const realRandom = Math.random;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  const stage = fakeDocument.createElement('div');
  const key = (k) => stage.dispatch('keydown', { key: k, preventDefault() {} });
  try {
    Math.random = () => 0.5;
    game.mount(stage, makeCtx(['\u0e40\u0e2d', '\u0e1a\u0e35']));
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    advance(t, FIXED_DELAY_MS); // the real signal is lit
    advance(t, 250);

    // calibration: a key the pad does not own must change nothing, or the assertion below would pass
    // on a handler that reacts to any key at all
    key('a');
    assert.equal(byId(stage, 'ft-next'), undefined, 'an unrelated key registered a reaction');

    key('Enter');
    assert.ok(byId(stage, 'ft-next'), `Enter on the pad registered no reaction: ${stageText(stage)}`);
    assert.ok(stageText(stage).includes('250 ms'), `the keyboard reaction was not measured: ${stageText(stage)}`);

    // and Space is the other activation key a role=button owes its user, in the phase where an early
    // press is a false start
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-next').click();
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    advance(t, ARM_WINDOW_MS + 1); // past the ghost-tap window, still before the trigger
    key(' ');
    assert.ok(byId(stage, 'ft-again'), 'Space before the signal did not end the round');
    assert.ok(stageText(stage).includes('\u0e21\u0e37\u0e2d\u0e25\u0e31\u0e48\u0e19'), `the loss reason is not the false start: ${stageText(stage)}`);

    game.dispose();
  } finally {
    Math.random = realRandom;
  }
});

// ---- The feel layer, calibrated both ways (ADR-0046) ----
// The static gate (scripts/js-motion-guard-check.mjs) proves the matchMedia call is PRESENT. It stays
// green if the guard's value is pinned to a constant, which is exactly what these two tests catch:
// one asserts the shake happens, the other asserts it does not, and no single implementation of
// `prefersReducedMotion` satisfies both unless the query is really read.

/** mount -> ready -> the first decoy lights. Returns the pad. The decoy, not the trigger, is the
 *  moment under test: an effect that fired only on the real signal would tell a player when to tap
 *  without reading the word. */
function driveToFirstLight(t, stage, reduced) {
  reduceMotion = reduced;
  rafQueue = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  nowMs = 0;
  game.mount(stage, makeCtx(['เอ', 'บี']));
  advance(t, ARM_WINDOW_MS + 1);
  byId(stage, 'ft-ready').click();
  const pad = descendants(stage).find((e) => (e.className || '').startsWith('ft-pad'));
  assert.ok(pad, 'the waiting screen built no pad');
  advance(t, 725); // Math.random = 0.5 puts the first decoy here — see FIXED_DELAY_MS
  assert.ok(stageText(stage).includes('รอสัญญาณ') === false, 'the pad never lit — nothing was measured');
  return pad;
}

test('a pad light shakes the pad and paints a spark burst — on the decoy, not only the trigger', (t) => {
  const realRandom = Math.random;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    const pad = driveToFirstLight(t, stage, false);
    const canvas = descendants(pad).find((e) => e.tagName === 'canvas');
    assert.ok(canvas, 'the pad built no spark canvas');
    assert.equal(canvas.getAttribute('aria-hidden'), 'true', 'the decorative canvas is exposed to a screen reader');

    assert.equal(pad.style.transform, undefined, 'the shake wrote before a single frame ran');
    drainFrames(3);
    assert.match(pad.style.transform, /^translate\(-?\d/, `no shake after three frames: ${pad.style.transform}`);
    const ctx2d = canvas.getContext('2d');
    assert.ok(ctx2d.fills > 0, 'three frames painted no spark at all');
    assert.deepEqual([...new Set(ctx2d.fillStyles)], [INK_SENTINEL], 'the sparks are not painted in the token colour read at runtime');

    // and it settles: the shake must not leave the pad parked off-centre once the trauma has decayed
    drainFrames(80, 40);
    assert.equal(pad.style.transform, 'none', `the pad never returned to rest: ${pad.style.transform}`);

    game.dispose();
  } finally {
    Math.random = realRandom;
    reduceMotion = true;
  }
});

test('prefers-reduced-motion drops the shake and coarsens the burst, and the signal is untouched', (t) => {
  const realRandom = Math.random;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    const pad = driveToFirstLight(t, stage, true);
    const canvas = descendants(pad).find((e) => e.tagName === 'canvas');
    const ctx2d = canvas.getContext('2d');

    drainFrames(6, 16); // ~96ms — well inside one coarse step
    assert.equal(
      pad.style.transform,
      undefined,
      `reduced motion still translated the pad: ${pad.style.transform}`,
    );
    // reduce, not remove: the burst is still painted, once per coarse step instead of once per frame
    assert.equal(ctx2d.clears, 1, `reduced motion redrew ${ctx2d.clears} times inside one coarse step`);
    assert.ok(ctx2d.fills > 0, 'reduced motion painted no burst at all — that is remove, not reduce');

    // and the thing a player actually reacts to is byte-identical under the query
    assert.ok(
      SIGNALS.some((sig) => stageText(stage).includes(signalToken(sig))),
      `the lit token is not a signal token under reduced motion: ${stageText(stage)}`,
    );
    assert.ok(pad.className.includes('ft-pad--flash'), 'the lit pad lost its flash under reduced motion');

    game.dispose();
  } finally {
    Math.random = realRandom;
    reduceMotion = true;
  }
});

// The flip the other two tests cannot see: the shake has already written a transform, then the OS
// setting turns on mid-decay. The reduce branch never writes transform again, so without a settle
// the pad stays parked up to SHAKE_MAX_PX off-centre until the next renderWaiting().
test('flipping to reduced motion mid-decay settles the pad instead of parking it off-centre', (t) => {
  const realRandom = Math.random;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    const pad = driveToFirstLight(t, stage, false);
    Math.random = () => 0.9; // 0.5 centres every shake offset on 0px — a parked pad would look settled
    drainFrames(3);
    assert.match(pad.style.transform, /^translate\(-?\d*\.?\d*[1-9]/, `no real offset to settle: ${pad.style.transform}`);

    const mql = mqls[mqls.length - 1];
    mql.matches = true;
    mql._listeners.change.forEach((fn) => fn({ matches: true }));
    assert.equal(pad.style.transform, 'none', `the pad stayed parked off-centre: ${pad.style.transform}`);

    drainFrames(2, 250); // and the reduced loop must not put it back
    assert.equal(pad.style.transform, 'none', `a reduced frame re-shook the pad: ${pad.style.transform}`);
  } finally {
    game.dispose();
    Math.random = realRandom;
    reduceMotion = true;
  }
});

// The old-Safari leg of watchReducedMotion(): a MediaQueryList with no addEventListener must still
// yield a usable `matches` rather than throwing mount() apart.
test('a matchMedia without addEventListener still guards, and still mounts', (t) => {
  const realRandom = Math.random;
  const realMatchMedia = window.matchMedia;
  const stage = fakeDocument.createElement('div');
  try {
    Math.random = () => 0.5;
    window.matchMedia = () => ({ matches: true });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    nowMs = 0;
    rafQueue = [];
    game.mount(stage, makeCtx(['เอ', 'บี']));
    advance(t, ARM_WINDOW_MS + 1);
    byId(stage, 'ft-ready').click();
    advance(t, 725);
    const pad = descendants(stage).find((e) => e.tagName === 'div' && (e.className || '').startsWith('ft-pad'));
    drainFrames(4);
    assert.equal(pad.style.transform, undefined, 'the listener-less MediaQueryList lost its matches value');
    game.dispose();
  } finally {
    Math.random = realRandom;
    window.matchMedia = realMatchMedia;
  }
});

test('the manifest entry says what the party category and the contract require', () => {
  assert.equal(game.id, 'freeze-tap');
  assert.deepEqual(game.players, [2, 10]);
  assert.equal(game.category, 'party');
  assert.equal(game.startsRound, true);
  assert.equal(game.ads, true);
  assert.equal(game.og, 'freeze-tap.png');
  assert.equal(typeof game.mount, 'function');
  assert.equal(typeof game.dispose, 'function');
});
