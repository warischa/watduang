// node --test src/games/power-meter.test.mjs — no framework, no dependency.
// One assertion per rule that can break silently, each on the input where a correct and an incorrect
// implementation VISIBLY diverge (the diverging input is named in every test's comment). Nothing
// here is a smoke test: an input where right and wrong agree measures nothing.
// The DOM tests use a hand-rolled fake document/window/navigator (no jsdom in this repo) that
// implements only what power-meter.ts actually touches — same pattern as timebomb.test.mjs and
// freeze-tap.test.mjs. style writes and classList calls are RECORDED, because two of the
// reduced-motion assertions are about writes that must not happen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import game, {
  ATTEMPTS_PER_PLAYER,
  DURATION_DOWN_MS,
  DURATION_UP_MS,
  LOCK_FLOOR_HUNDREDTHS,
  MAX_HUNDREDTHS,
  NATURAL_PERFECT_WINDOW_MS,
  PERFECT_WINDOW_MS,
  STOP_GUARD_MS,
  evaluateRound,
  formatScore,
  lockedScoreAt,
  meterValueAt,
  sumAttempts,
} from './power-meter.ts';

// ---------------------------------------------------------------------------
// Fake DOM
// ---------------------------------------------------------------------------

const styleWrites = []; // { el, prop, value } for every inline style write in the whole run
const classCalls = []; // { el, op, name, force } for every classList call

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.set = new Set();
  }
  add(name) {
    classCalls.push({ el: this.owner, op: 'add', name });
    this.set.add(name);
  }
  remove(name) {
    classCalls.push({ el: this.owner, op: 'remove', name });
    this.set.delete(name);
  }
  toggle(name, force) {
    classCalls.push({ el: this.owner, op: 'toggle', name, force });
    if (force) this.set.add(name);
    else this.set.delete(name);
  }
  contains(name) {
    return this.set.has(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this._text = '';
    this._attrs = {};
    this._listeners = {};
    this.className = '';
    this.id = '';
    this.disabled = false;
    this.innerHTML = '';
    this.clientWidth = 0; // never laid out: attachSparkCanvas bails, which is its documented path
    this.clientHeight = 0;
    this.classList = new FakeClassList(this);
    const self = this;
    this.style = new Proxy(
      {},
      {
        set(target, prop, value) {
          styleWrites.push({ el: self, prop, value });
          target[prop] = value;
          return true;
        },
      },
    );
  }
  set textContent(v) {
    this._text = v;
  }
  get textContent() {
    return this._text;
  }
  setAttribute(k, v) {
    this._attrs[k] = String(v);
  }
  getAttribute(k) {
    return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren() {
    this.children = [];
  }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  // A disabled control dispatches no activation — the platform swallows the click before any
  // listener runs. Modelled on purpose: without it every arm-gate assertion passes vacuously.
  click() {
    if (this.disabled) return;
    (this._listeners.click || []).forEach((fn) => fn());
  }
}

const fakeDocument = {
  hidden: false,
  _listeners: {},
  createElement: (tag) => new FakeElement(tag),
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  },
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  },
  dispatchEvent() {
    return true;
  },
};
globalThis.document = fakeDocument;
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init ?? {});
  }
};

let reduceMotion = false; // flipped by the reduced-motion tests BEFORE mount
globalThis.window = {
  matchMedia: (q) => ({ media: q, matches: reduceMotion, addEventListener() {}, removeEventListener() {} }),
  devicePixelRatio: 1,
};
// no window.AudioContext -> unlockAudio() returns null, so every audio path is a no-op here
const vibrations = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  writable: true,
  value: { vibrate: (pattern) => vibrations.push(pattern) },
});

function makeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
}
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();

let rafQueue = [];
let nextRafId = 1;
globalThis.requestAnimationFrame = (fn) => {
  const id = nextRafId++;
  rafQueue.push({ id, fn });
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  rafQueue = rafQueue.filter((f) => f.id !== id);
};

let nowMs = 0;
Object.defineProperty(globalThis, 'performance', {
  configurable: true,
  writable: true,
  value: { now: () => nowMs },
});

const ARM_WINDOW_MS = 400; // the contracted quiet window — see _arm-gate.ts

function makeCtx(players) {
  return {
    roster: { names: () => [], add() {} },
    session: {
      players,
      setPlayers() {},
      played: [],
      markPlayed(id) {
        this.played.push(id);
      },
      checkpoint: null,
      saveCheckpoint() {
        throw new Error('saveCheckpoint must never be called by this module');
      },
      clear() {},
    },
  };
}

const descendants = (node) => [node, ...(node.children || []).flatMap(descendants)];
const byId = (stage, id) => descendants(stage).find((e) => e.id === id);
const stageText = (stage) =>
  descendants(stage)
    .map((e) => e.textContent)
    .filter(Boolean)
    .join(' ');
const byClass = (stage, cls) =>
  descendants(stage).filter((e) => String(e.className).split(' ').includes(cls));
const buttons = (stage) => descendants(stage).filter((e) => e.tagName === 'button');

function advance(t, ms) {
  nowMs += ms;
  t.mock.timers.tick(ms);
}

/** Runs the frames pending when the drain starts, advancing the shared clock with them. */
function drainFrames(count, msPerFrame = 16) {
  for (let i = 0; i < count; i++) {
    const frame = rafQueue.shift();
    if (!frame) return i;
    nowMs += msPerFrame;
    frame.fn(nowMs);
  }
  return count;
}

/** Waits out the arm gate, then activates the control. A click before the gate arms is swallowed by
 *  `disabled`, so skipping the wait would silently no-op every step of a drive. */
function armedClick(t, stage, id) {
  advance(t, ARM_WINDOW_MS + 10);
  const btn = byId(stage, id);
  assert.ok(btn, `control #${id} is not on screen — text was: ${stageText(stage)}`);
  assert.equal(btn.disabled, false, `#${id} still inert after the arm window`);
  btn.click();
}

/** The elapsed time at which the climb rounds to exactly `target` hundredths, found by search so a
 *  wrong closed form here cannot silently pick an off-by-one input. */
function elapsedFor(target) {
  let e = DURATION_UP_MS * Math.sqrt(target / MAX_HUNDREDTHS);
  for (let k = 0; k < 200; k++) {
    const v = meterValueAt(e);
    if (v === target) {
      assert.ok(
        Math.abs(e - DURATION_UP_MS) > PERFECT_WINDOW_MS / 2,
        `elapsed ${e} for ${target} falls inside the perfect window — the drive would record 10.00`,
      );
      return e;
    }
    e += v < target ? 0.01 : -0.01;
  }
  throw new Error(`no elapsed time climbs to exactly ${target}`);
}

/** One attempt scored at exactly `value` hundredths, then the continue tap. */
function scoreAttempt(t, stage, value) {
  armedClick(t, stage, 'pm-tap'); // start
  nowMs += elapsedFor(value);
  drainFrames(1, 0); // one painted frame, so the gauge write is exercised on every attempt
  byId(stage, 'pm-tap').click(); // stop — already armed, so the clock must NOT move here
  armedClick(t, stage, 'pm-next');
}

/** A whole turn: three attempts, then the player-total tap. */
function playTurn(t, stage, values) {
  armedClick(t, stage, 'pm-start');
  for (const v of values) scoreAttempt(t, stage, v);
  armedClick(t, stage, 'pm-after-total');
}

// Two tests mount twice (test 21 walks need-more then a real game; test 26 runs both motion modes),
// and MockTimers throws on a second enable in the same context — so the enable is per test context,
// not per mount.
let timersFor = null;
function setup(t, players) {
  if (timersFor !== t) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    timersFor = t;
    t.after(() => {
      timersFor = null;
      reduceMotion = false;
    });
  }
  rafQueue = [];
  nowMs = 1000;
  styleWrites.length = 0;
  classCalls.length = 0;
  vibrations.length = 0;
  localStorage.map.clear();
  sessionStorage.map.clear();
  const stage = fakeDocument.createElement('div');
  const ctx = makeCtx(players);
  game.mount(stage, ctx);
  t.after(() => game.dispose());
  return { stage, ctx };
}

const SOURCE = fs.readFileSync(new URL('./power-meter.ts', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Scoring and elimination
// ---------------------------------------------------------------------------

// 1. Integer hundredths, never floats. Both sums are 2430 in hundredths, so the answer is a TIE.
// In floats 8.10+8.10+8.10 = 24.299999999999997 and 7.30+9.00+8.00 = 24.3 are NOT equal, so a float
// implementation names A the unique loser and skips the tiebreak entirely. A [873, 955, 620] vector
// would not diverge: toFixed(2) hides the float error and both print 24.48.
test('1 — scores are integer hundredths, so 810x3 ties 730+900+800', () => {
  const a = sumAttempts([810, 810, 810]);
  const b = sumAttempts([730, 900, 800]);
  assert.equal(a, 2430);
  assert.equal(b, 2430);
  assert.equal(evaluateRound([a, b]).tiedIdx.length, 2);
});

// 2. A tenths implementation (the handoff doc's model) returns "87.50" or "8.8".
test('2 — two decimals, not one', () => {
  assert.equal(formatScore(875), '8.75');
  assert.equal(formatScore(2430), '24.30');
});

// 3. An implementation comparing highest returns 0.
test('3 — a unique lowest total loses outright', () => {
  const v = evaluateRound([2420, 1980, 2330]);
  assert.equal(v.loserIdx, 1);
  assert.deepEqual(v.tiedIdx, []);
  assert.equal(v.minTotal, 1980);
});

// 4. Sum says A loses (900 < 1000); mean-of-non-zero-attempts says B loses (333 vs 500). Opposite
// verdicts on one input.
test('4 — ranking is by sum, not by average', () => {
  const a = sumAttempts([300, 300, 300]);
  const b = sumAttempts([0, 0, 1000]);
  assert.equal(evaluateRound([a, b]).loserIdx, 0);
});

// 5. An implementation that sorts and takes the first two returns [1, 2].
test('5 — a 3-way tie sends exactly the 3, and the safe player is excluded', () => {
  const v = evaluateRound([2100, 1900, 1900, 1900]);
  assert.deepEqual(v.tiedIdx, [1, 2, 3]);
  assert.equal(v.loserIdx, null);
});

// 6. An implementation treating "no unique minimum" as game-over reaches result with loserIdx null
// and renders undefined as a name.
test('6 — everyone tied is a legal tiebreak, not a no-loser end state', () => {
  const v = evaluateRound([2200, 2200, 2200]);
  assert.equal(v.loserIdx, null);
  assert.equal(v.tiedIdx.length, 3);
});

// 7. An implementation special-casing two players as `a < b ? 0 : 1` returns loserIdx 1 and names a
// loser who did not lose. Totals [1500, 1600] would agree in both, so that input measures nothing.
test('7 — two players with identical totals tie', () => {
  assert.equal(evaluateRound([1500, 1500]).tiedIdx.length, 2);
  assert.equal(evaluateRound([1500, 1500]).loserIdx, null);
  assert.equal(evaluateRound([1500, 1600]).loserIdx, 0); // control: the near input still resolves
});

/** Round 1 is 1980/1980 (a tie), the tiebreak is 2500 for the first player and 2600 for the second.
 *  Returns the stage after the first tiebreak player's player-total screen is on it. */
function driveTiebreak(t) {
  const { stage } = setup(t, ['เอ', 'บี']);
  playTurn(t, stage, [660, 660, 660]);
  playTurn(t, stage, [660, 660, 660]);
  armedClick(t, stage, 'pm-after-summary'); // summary -> tiebreak
  armedClick(t, stage, 'pm-start-tiebreak');
  armedClick(t, stage, 'pm-start'); // handoff -> ready, first tied player
  for (const v of [900, 800, 800]) scoreAttempt(t, stage, v);
  return stage;
}

// 8. An accumulating implementation renders "44.80" (1980 + 2500). The loser identity is identical
// under both — tied players carry equal history, so accumulation adds the same constant to each —
// so asserting on loserIdx here would measure nothing. Assert on the displayed total.
test('8 — a tiebreak resets scores and does not accumulate', (t) => {
  const stage = driveTiebreak(t);
  const text = stageText(stage);
  assert.match(text, /25\.00/, `player-total should show 25.00, got: ${text}`);
  assert.doesNotMatch(text, /44\.80/, 'the tiebreak total accumulated round 1');
});

// 9. An implementation that resets to the full roster runs 12 attempts instead of 6 and can name
// index 0 (a safe player) the loser.
test('9 — safe players never re-enter a later tiebreak', (t) => {
  const { stage } = setup(t, ['เอ', 'บี', 'ซี', 'ดี']);
  playTurn(t, stage, [810, 810, 800]); // 2420
  playTurn(t, stage, [660, 660, 660]); // 1980
  playTurn(t, stage, [660, 660, 660]); // 1980
  playTurn(t, stage, [900, 810, 800]); // 2510
  armedClick(t, stage, 'pm-after-summary');
  armedClick(t, stage, 'pm-start-tiebreak');

  // The active set, read off the screens the tiebreak actually renders.
  const seen = [];
  for (let turn = 0; turn < 2; turn++) {
    seen.push(byClass(stage, 'pm-holder-name')[0].textContent);
    armedClick(t, stage, 'pm-start');
    for (const v of [700, 700, 700]) scoreAttempt(t, stage, v + turn * 10);
    armedClick(t, stage, 'pm-after-total');
  }
  assert.deepEqual(seen, ['ตาของ บี', 'ตาของ ซี'], 'the tiebreak ran the wrong players');
  // 2 x 3 = 6 attempts ends the round; 4 x 3 = 12 would still be mid-round here.
  assert.match(stageText(stage), /สรุปคะแนน/, 'six attempts did not finish the tiebreak round');
});

// 10. An implementation reading a stale results map shows "19.80" (round 1) instead of the final
// round's total.
test('10 — the loser total shown is the final round\'s, not round 1\'s', (t) => {
  const stage = driveTiebreak(t);
  armedClick(t, stage, 'pm-after-total');
  armedClick(t, stage, 'pm-start');
  for (const v of [900, 900, 800]) scoreAttempt(t, stage, v); // 2600
  armedClick(t, stage, 'pm-after-total');
  armedClick(t, stage, 'pm-after-summary'); // summary -> result
  const text = stageText(stage);
  assert.match(text, /คะแนนรอบสุดท้าย: 25\.00 \/ 30\.00/, `result total wrong: ${text}`);
  assert.doesNotMatch(text, /19\.80/);
});

// 11. A name-keyed implementation collapses both players into one map entry and marks row 0, or
// crashes with one entry for two players. A roster of ["เอ", "บี"] would agree in both — the
// scripts/thai-comments.mjs blanker strips double quotes and backticks, never single ones.
test('11 — duplicate names resolve by index', (t) => {
  assert.equal(evaluateRound([2500, 2000]).loserIdx, 1);
  const { stage } = setup(t, ['เอ', 'เอ']);
  playTurn(t, stage, [900, 800, 800]); // 2500
  playTurn(t, stage, [700, 700, 600]); // 2000
  const rows = descendants(stage).filter((e) => String(e.className).startsWith('pm-row '));
  assert.equal(rows.length, 2, 'two players must render two rows, not one collapsed entry');
  assert.ok(!rows[0].className.includes('pm-row--lowest'), 'row 0 was marked lowest');
  assert.ok(rows[1].className.includes('pm-row--lowest'), 'row 1 (the real minimum) was not marked');
});

// ---------------------------------------------------------------------------
// Meter engine
// ---------------------------------------------------------------------------

// 12. A linear implementation returns 500 at the half-way point — a clean 2x gap at one input.
test('12 — the climb is squared, not linear', () => {
  assert.equal(meterValueAt(DURATION_UP_MS / 2), 250);
});

// 13. A linear fall returns 500 at +280ms instead of 580.
test('13 — the fall uses EASE_DOWN_POW = 1.25, not linear', () => {
  assert.equal(meterValueAt(DURATION_UP_MS + 280), 580);
  assert.equal(meterValueAt(DURATION_UP_MS + 5), 997); // the soft shoulder, not a cliff
  assert.equal(meterValueAt(DURATION_UP_MS + 140), 823);
});

// 14. An off-by-one `<` in the phase switch drops the peak to 999; a missing clamp lets the value
// exceed 1000. meterValueAt(1000) would agree in both, so that input measures nothing.
// The spec's own 1461.28 row is 999 under the stated formula (the true boundary is 1461.2795, and
// the table rounded it up), so the reachability of 10.00 just past the peak is asserted through
// lockedScoreAt — which is where a perfect score is actually decided.
test('14 — 10.00 is reachable and clamped', () => {
  assert.equal(meterValueAt(DURATION_UP_MS), MAX_HUNDREDTHS);
  assert.equal(meterValueAt(1459.635), MAX_HUNDREDTHS); // the first instant the climb rounds to 1000
  assert.equal(meterValueAt(1459.6), 999); // one hundredth of a ms earlier it is NOT yet 1000
  assert.equal(lockedScoreAt(1461.28), MAX_HUNDREDTHS);
  let max = -1;
  for (let e = -50; e <= DURATION_UP_MS + DURATION_DOWN_MS + 500; e += 0.37) {
    max = Math.max(max, meterValueAt(e));
    assert.ok(meterValueAt(e) >= 0 && meterValueAt(e) <= MAX_HUNDREDTHS, `out of range at ${e}`);
  }
  assert.equal(max, MAX_HUNDREDTHS);
});

// 15. An implementation without the `down >= 1` auto-lock stays in `running` for ever and the
// attempt can never end. Run under reduce so no effect frames exist: then "the queue is empty" is an
// assertion about the METER loop and nothing else.
test('15 — no tap auto-locks at exactly 0 and the loop stops', (t) => {
  reduceMotion = true;
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap');
  drainFrames(200, 16); // well past DURATION_UP_MS + DURATION_DOWN_MS = 2020
  const text = stageText(stage);
  assert.match(text, /ผลครั้งที่ 1/, `did not reach the locked screen: ${text}`);
  assert.match(text, /0\.00/);
  assert.ok(byId(stage, 'pm-next'), 'locked screen has no continue control');
  assert.equal(rafQueue.length, 0, 'the meter loop kept scheduling frames after the auto-lock');
});

// 16. An unguarded implementation records meterValueAt(100) = 0 on the first call and treats the
// second as a no-op — the player scores 0.00 for a tap nobody made.
test('16 — the stop guard swallows a ghost second tap', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap');
  const tap = byId(stage, 'pm-tap');
  nowMs += 100;
  tap.click(); // inside STOP_GUARD_MS — must be ignored
  assert.ok(byId(stage, 'pm-tap'), 'the guarded tap ended the attempt anyway');
  assert.equal(byId(stage, 'pm-next'), undefined, 'a score was recorded inside the stop guard');
  nowMs += 300; // elapsed 400
  tap.click();
  assert.equal(meterValueAt(400), 75);
  const text = stageText(stage);
  assert.match(text, /ผลครั้งที่ 1/);
  assert.match(text, /0\.75/, `expected the score at elapsed 400, got: ${text}`);
  assert.ok(100 < STOP_GUARD_MS && 400 > STOP_GUARD_MS, 'the two inputs must straddle the guard');
});

// 17. A missing `phase !== 'running'` return records a second score into the next slot, so a player
// finishes three attempts in two taps.
test('17 — a duplicate tap after the lock records nothing', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap');
  const tap = byId(stage, 'pm-tap'); // the detached node a ghost second contact still lands on
  nowMs += 1000;
  tap.click();
  assert.equal(meterValueAt(1000), 469);
  tap.click(); // the ghost
  const text = stageText(stage);
  assert.match(text, /ผลครั้งที่ 1/, `the attempt counter advanced past 1: ${text}`);
  assert.match(text, /4\.69/);
  armedClick(t, stage, 'pm-next');
  assert.match(stageText(stage), /ครั้งที่ 2/); // attempt 2, not 3
});

// 18. An implementation without the `attempt < ATTEMPTS_PER_PLAYER` branch renders a 4th ready screen.
test('18 — attempt 4 is impossible', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  scoreAttempt(t, stage, 660);
  scoreAttempt(t, stage, 660);
  armedClick(t, stage, 'pm-tap');
  nowMs += elapsedFor(660);
  byId(stage, 'pm-tap').click();
  const third = byId(stage, 'pm-next');
  advance(t, ARM_WINDOW_MS + 10);
  third.click(); // -> player-total
  third.click(); // the 4th fire, on the same detached control
  const text = stageText(stage);
  assert.match(text, /สรุปผลคะแนน 3 ครั้งของคุณ/, `left player-total: ${text}`);
  assert.equal(byClass(stage, 'pm-attempt-cell').length, ATTEMPTS_PER_PLAYER);
  assert.match(text, /19\.80/);
});

// ---------------------------------------------------------------------------
// Tab visibility
// ---------------------------------------------------------------------------

// 19. An implementation that locks on hide records 3.00; one that advances the counter skips a turn.
// Hiding at elapsed 0 would agree in both, because the value is already 0.
test('19 — hiding mid-attempt records nothing and replays the same attempt', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap');
  nowMs += 800;
  drainFrames(1, 0);
  assert.equal(meterValueAt(800), 300); // the value that a lock-on-hide would have recorded
  game.onVisibility(true);
  const text = stageText(stage);
  assert.equal(byId(stage, 'pm-next'), undefined, 'an attempt was recorded on hide');
  assert.equal(byId(stage, 'pm-tap').textContent, '🚀 แตะเพื่อเริ่ม', 'not back on the ready screen');
  assert.match(text, /สลับหน้าจอ/, 'no in-stage notice explained the reset');
  assert.doesNotMatch(text, /3\.00/, 'the thrown-away value was recorded anyway');
  assert.equal(byClass(stage, 'pm-dot--active').length, 1);
  assert.match(byClass(stage, 'pm-dot--active')[0].getAttribute('aria-label'), /ครั้งที่ 1/);
  // and the replay still scores into slot 1
  scoreAttempt(t, stage, 660);
  assert.match(stageText(stage), /ครั้งที่ 2/);
});

// 20. Without a run token the stale frame runs, sees down >= 1 and auto-locks 0.00 — the player is
// punished for taking a phone call.
test('20 — returning from hidden must not auto-lock 0.00', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap');
  const startedAt = nowMs;
  nowMs += 800;
  const stale = rafQueue[rafQueue.length - 1];
  assert.ok(stale, 'the meter never scheduled a frame');
  game.onVisibility(true);
  game.onVisibility(false);
  nowMs = startedAt + 3000; // the elapsed a paused-then-resumed rAF would compute
  stale.fn(nowMs);
  assert.equal(byId(stage, 'pm-next'), undefined, 'the stale frame locked a score');
  assert.equal(byId(stage, 'pm-tap').textContent, '🚀 แตะเพื่อเริ่ม');
  assert.doesNotMatch(stageText(stage), /ผลครั้งที่/);
});

// ---------------------------------------------------------------------------
// House rules
// ---------------------------------------------------------------------------

// 21. `result` is the phase where a "back to the category" link gets added. A test that only checks
// `handoff` measures nothing — that screen has no reason to carry a link.
test('21 — no anchor and no navigation target in the stage, on all nine phases', (t) => {
  const seen = [];
  const check = (stage, phase) => {
    seen.push(phase);
    const anchors = descendants(stage).filter((e) => e.tagName === 'a');
    assert.equal(anchors.length, 0, `phase ${phase} rendered ${anchors.length} anchor(s)`);
    for (const node of descendants(stage)) {
      assert.equal(node.getAttribute('href'), null, `phase ${phase} carries an href`);
    }
  };

  const solo = setup(t, ['เอ']);
  check(solo.stage, 'need-more');
  assert.match(stageText(solo.stage), /อย่างน้อย 2 คน/);
  game.dispose();

  const { stage } = setup(t, ['เอ', 'บี', 'ซี']);
  check(stage, 'handoff');
  armedClick(t, stage, 'pm-start');
  check(stage, 'ready');
  armedClick(t, stage, 'pm-tap');
  nowMs += elapsedFor(810);
  check(stage, 'running');
  byId(stage, 'pm-tap').click();
  check(stage, 'locked');
  armedClick(t, stage, 'pm-next');
  scoreAttempt(t, stage, 810);
  scoreAttempt(t, stage, 800);
  check(stage, 'player-total'); // 2420
  armedClick(t, stage, 'pm-after-total');
  playTurn(t, stage, [660, 660, 660]);
  armedClick(t, stage, 'pm-start');
  for (const v of [660, 660, 660]) scoreAttempt(t, stage, v);
  check(stage, 'player-total');
  armedClick(t, stage, 'pm-after-total');
  check(stage, 'summary');
  armedClick(t, stage, 'pm-after-summary');
  check(stage, 'tiebreak');
  armedClick(t, stage, 'pm-start-tiebreak');
  playTurn(t, stage, [900, 800, 800]);
  armedClick(t, stage, 'pm-start');
  for (const v of [900, 900, 800]) scoreAttempt(t, stage, v);
  armedClick(t, stage, 'pm-after-total');
  armedClick(t, stage, 'pm-after-summary');
  check(stage, 'result');
  assert.deepEqual(
    [...new Set(seen)].sort(),
    [
      'handoff',
      'locked',
      'need-more',
      'player-total',
      'ready',
      'result',
      'running',
      'summary',
      'tiebreak',
    ],
    `not every phase was rendered: ${seen.join(', ')}`,
  );
});

// 22. An unarmed render reads false immediately, and a ghost tap on "เล่นอีกรอบ" erases the result.
// Reading only AFTER the delay would agree in both, so that timing measures nothing.
test('22 — every render arms its buttons via the shared gate', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  playTurn(t, stage, [900, 800, 800]); // 2500
  armedClick(t, stage, 'pm-start');
  for (const v of [700, 700, 600] /* 2000 */) scoreAttempt(t, stage, v);
  armedClick(t, stage, 'pm-after-total');
  armedClick(t, stage, 'pm-after-summary'); // -> result, rendered just now
  const controls = buttons(stage);
  assert.equal(controls.length, 2, 'the result screen must carry exactly two controls');
  for (const btn of controls) assert.equal(btn.disabled, true, `#${btn.id} was live on render`);
  advance(t, ARM_WINDOW_MS + 50);
  for (const btn of controls) assert.equal(btn.disabled, false, `#${btn.id} never armed`);
});

// 23. A separate `running` render calling armAllButtons leaves the stop button disabled for 400 of a
// 1460 ms climb, so every score is unreachably low or 0.00 while every CI gate stays green.
test('23 — the stop control is NOT inert while the meter runs', (t) => {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap'); // this is the tap that starts the meter
  const tap = byId(stage, 'pm-tap');
  assert.equal(tap.disabled, false, 'the stop control is inert while the meter is running');
  assert.equal(tap.textContent, '🛑 แตะเพื่อหยุด!', 'the label did not swap in place');
  assert.equal(tap.getAttribute('aria-label'), 'แตะเพื่อหยุดเกจ');
  assert.ok(tap.classList.contains('pm-tap--running'));
});

// 24. Owner override of the spec's blanket ban: localStorage is allowed for the audio preference,
// saveCheckpoint is not. So the assertion is scoped, not dropped — playing a whole game writes
// NOTHING, the toggle writes exactly one namespaced key, and the checkpoint stays null throughout
// (makeCtx's saveCheckpoint throws, so any call fails this test loudly).
test('24 — no persistence except the namespaced audio preference', (t) => {
  const { stage, ctx } = setup(t, ['เอ', 'บี']);
  playTurn(t, stage, [660, 660, 660]);
  playTurn(t, stage, [660, 660, 660]);
  armedClick(t, stage, 'pm-after-summary');
  armedClick(t, stage, 'pm-start-tiebreak');
  playTurn(t, stage, [900, 800, 800]);
  armedClick(t, stage, 'pm-start');
  for (const v of [900, 900, 800]) scoreAttempt(t, stage, v);
  armedClick(t, stage, 'pm-after-total');
  armedClick(t, stage, 'pm-after-summary');
  assert.deepEqual([...localStorage.map.keys()], [], 'playing a round wrote a storage key');
  assert.deepEqual([...sessionStorage.map.keys()], []);
  assert.equal(ctx.session.checkpoint, null);

  armedClick(t, stage, 'pm-again'); // back to handoff, where the toggle lives
  armedClick(t, stage, 'pm-sound');
  assert.deepEqual([...localStorage.map.keys()], ['watduang:power-meter-audio']);
  assert.equal(localStorage.getItem('watduang:power-meter-audio'), 'on');
  assert.equal(ctx.session.checkpoint, null);
});

/** Locks an attempt at exactly MAX_HUNDREDTHS, then drives `frames` effect frames. */
function lockPerfectAndDrive(t, frames) {
  const { stage } = setup(t, ['เอ', 'บี']);
  armedClick(t, stage, 'pm-start');
  armedClick(t, stage, 'pm-tap');
  nowMs += DURATION_UP_MS;
  drainFrames(1, 0);
  byId(stage, 'pm-tap').click();
  assert.match(stageText(stage), /10\.00/, 'the perfect lock did not record 10.00');
  drainFrames(frames, 16);
  return stage;
}

// 25. ADR-0046 names the exact false green: pinning the guard to a constant false keeps
// js-motion-guard-check.mjs green. Only input A catches that. Only input B proves input A is not
// passing because the effect is dead in both modes.
test('25 — the reduced-motion guard is present AND not inert (input A: reduce)', (t) => {
  reduceMotion = true;
  lockPerfectAndDrive(t, 5);
  const transforms = styleWrites.filter((w) => w.prop === 'transform').map((w) => w.value);
  for (const v of transforms) {
    assert.ok(v === 'none' || v === '', `reduce mode wrote transform=${v}`);
  }
  const peak = classCalls.filter((c) => c.name === 'pm-gauge-peak' && c.force);
  assert.equal(peak.length, 0, 'the peak class was toggled on under reduce');
});

test('25 — input B: no reduce, so the same run DOES shake', (t) => {
  reduceMotion = false;
  lockPerfectAndDrive(t, 5);
  const moved = styleWrites.filter(
    (w) => w.prop === 'transform' && w.value !== 'none' && w.value !== '',
  );
  assert.ok(moved.length > 0, 'the shake never wrote a transform — input A proves nothing');
  const peak = classCalls.filter((c) => c.name === 'pm-gauge-peak' && c.force);
  assert.ok(peak.length > 0, 'the peak state never fired, so input A proves nothing about it');
});

// 26. An implementation that copies timebomb's 250 ms reduced cadence onto the gauge writes about 6
// distinct heights instead of about 90 — a reduced-motion player aims at a bar up to 3.4 points
// stale. Same input, opposite verdicts.
test('26 — reduced motion must not throttle the mechanic', (t) => {
  const frames = Math.ceil(DURATION_UP_MS / 16);
  const run = (reduce) => {
    reduceMotion = reduce;
    const { stage } = setup(t, ['เอ', 'บี']);
    armedClick(t, stage, 'pm-start');
    styleWrites.length = 0;
    armedClick(t, stage, 'pm-tap');
    drainFrames(frames, 16);
    const heights = new Set(
      styleWrites.filter((w) => w.prop === 'height').map((w) => String(w.value)),
    );
    game.dispose();
    return heights.size;
  };
  const reduced = run(true);
  const normal = run(false);
  assert.ok(normal > 50, `only ${normal} distinct heights in normal mode — the drive is broken`);
  assert.equal(reduced, normal, 'reduced motion writes the gauge at a coarser cadence');
});

// 27. The party category's Thai copy claims 2-10 and a gate polices that claim.
test('27 — the manifest declares the party contract', () => {
  assert.deepEqual(game.players, [2, 10]);
  assert.equal(game.id, 'power-meter');
  assert.equal(game.category, 'party');
  assert.equal(game.startsRound, true);
  assert.equal(game.ads, true);
  assert.equal(game.og, 'power-meter.png');
  assert.equal(game.keywords.length, 5);
  assert.equal(game.keywords[0], game.names.th);
  assert.equal(game.seo.steps.length, 3);
  assert.equal(typeof game.onVisibility, 'function');
  assert.match(game.seo.description, /2-10 คน/);
});

// 28. A summary row is the widest content in the game: name + total + badge. The 320px measurement
// itself belongs to scripts/narrow-overflow-probe.mjs and is NOT run here (no layout in this fake
// DOM) — what is checkable in process is that a 10-player summary stays three cells per row, with
// the wrap pair carried by the name class rather than a fixed-width breakdown column.
test('28 — the summary at 10 players stays three cells per row', (t) => {
  const roster = ['กก', 'ขข', 'คค', 'งง', 'จจ', 'ฉฉ', 'ชช', 'ซซ', 'ฌฌ', 'ญญ'];
  const { stage } = setup(t, roster);
  for (let i = 0; i < roster.length; i++) playTurn(t, stage, [660, 660, 660 + i * 10]);
  const rows = descendants(stage).filter((e) => String(e.className).startsWith('pm-row '));
  assert.equal(rows.length, 10);
  for (const row of rows) assert.equal(row.children.length, 3, 'a summary row grew a fourth cell');
  assert.equal(byClass(stage, 'pm-row--lowest').length, 1);
});

// 29. A retyped Thai string differs in a combining vowel or a decomposed sara-am while looking
// identical on screen. This is the check that catches a rewrite that "looks right".
test('29 — every ported Thai string is byte-identical to the spec', () => {
  const required = [
    'รอบที่ ',
    'รอบ Tiebreak ที่ ',
    '⚡ รอบ Tiebreak',
    'คุณจะได้รับโอกาสวัดพลัง 3 ครั้ง เพื่อสะสมคะแนนเต็ม 30.00',
    'แตะเพื่อเริ่มตาของฉัน ➔',
    'ครั้งที่ ',
    '🚀 แตะเพื่อเริ่ม',
    'แตะเพื่อปล่อยเกจวัดพลัง',
    'แตะเพื่อเริ่มปล่อยเกจ',
    '🛑 แตะเพื่อหยุด!',
    'หยุดที่จุดสูงสุด 10.00 ให้ได้!',
    'แตะเพื่อหยุดเกจ',
    '10.00 (PEAK)',
    '5.00',
    '0.00',
    'ผลครั้งที่ ',
    '🌟 PERFECT 10.00 เต็มหลอด!',
    '🔥 พลังสูงมาก สุดยอด!',
    '👍 ยอดเยี่ยม!',
    '⚡ ปานกลาง',
    '💥 วืดไปนิด สู้ต่อ!',
    'ดูผลคะแนนรวม ➔',
    'ไปต่อครั้งที่ ',
    ': ได้ ',
    ' คะแนน',
    'สรุปผลคะแนน 3 ครั้งของคุณ',
    'คะแนนรวม (เต็ม 30.00)',
    '📊 ดูผลสรุปของรอบนี้ ➔',
    ' ได้คะแนนรวม ',
    ' จาก 30.00',
    '📊 สรุปคะแนน',
    '⚡ คะแนนต่ำสุดเท่ากัน (',
    '🛡️ รอด',
    '⚡ เข้า Tiebreak',
    'หน้าสรุปคะแนนประจำรอบ',
    '⚡ รอบ Tiebreak ตัดสิน',
    'ศึกชิงหนีความพ่ายแพ้!',
    'ผู้เล่นต่อไปนี้มีคะแนนรวมต่ำสุดเท่ากัน (',
    ') จึงต้องแข่งขันใหม่คนละ 3 ครั้ง',
    '🛡️ ผู้เล่นคนอื่นที่คะแนนสูงกว่า ปลอดภัยแล้ว ไม่ต้องแข่งรอบนี้',
    'เริ่มรอบ Tiebreak ➔',
    'เข้าสู่รอบ Tiebreak ตัดสิน ➔',
    'คะแนนรอบสุดท้าย:',
    ' / 30.00',
    'เปิด/ปิดเสียง',
    'เปิดเสียงแล้ว',
    'ปิดเสียงแล้ว',
    'คนที่ถือมือถือ',
    '⚠️ สลับหน้าจอ: รีเซ็ตครั้งนี้ใหม่เพื่อความยุติธรรม',
  ];
  const missing = required.filter((s) => !SOURCE.includes(s));
  assert.deepEqual(missing, [], `retyped or dropped Thai strings: ${missing.join(' | ')}`);
  // The register conversion the spec rules on: the mockup's word must not survive anywhere.
  assert.ok(!SOURCE.includes('ผู้แพ้'), 'the mockup register survived instead of the house one');
  assert.ok(!SOURCE.includes('อุปกรณ์'), 'the phone is มือถือ on this site, not อุปกรณ์');
  assert.ok(!SOURCE.includes('สปีด 1.5x'), 'an internal tuning label reached player-visible copy');
  assert.ok(!SOURCE.includes('Spacebar'), 'desktop keyboard instructions reached a phone-first game');
});

// 30. An implementation that ports the mockup's own "🔄 เล่นอีกครั้ง (ผู้เล่นเดิม)" and
// "⚙️ ตั้งค่าใหม่ / เปลี่ยนผู้เล่น" fails all three greps while looking perfectly reasonable on screen.
test('30 — the three shipped house strings are reused, not paraphrased', () => {
  for (const s of ['เล่นอีกรอบ', 'เปลี่ยนคนเล่น', 'วงตกลงกันเองว่าคนโดนต้องทำอะไร']) {
    assert.ok(SOURCE.includes(s), `house string missing: ${s}`);
  }
  assert.ok(SOURCE.includes('ปุ่มรองจะกดได้หลังผลออก 0.4 วินาที กันนิ้วลั่น'), 'arm-gate hint missing');
});

// ---------------------------------------------------------------------------
// The two derived constants, checked against the formulas they claim to come from
// ---------------------------------------------------------------------------

test('derived constants — the stop floor and the widened perfect window', () => {
  assert.equal(meterValueAt(STOP_GUARD_MS), LOCK_FLOOR_HUNDREDTHS);
  assert.ok(LOCK_FLOOR_HUNDREDTHS > 0, 'a zero floor makes the uncapped tiebreak non-terminating');
  assert.ok(
    NATURAL_PERFECT_WINDOW_MS > 1.6 && NATURAL_PERFECT_WINDOW_MS < 1.7,
    `the natural window drifted: ${NATURAL_PERFECT_WINDOW_MS}`,
  );
  assert.ok(PERFECT_WINDOW_MS >= 50, 'the widened window is under three frames at 60 Hz');
  assert.ok(PERFECT_WINDOW_MS / (1000 / 60) >= 3);
  // and it is a widening of the natural window, not a replacement of the curve
  assert.equal(lockedScoreAt(DURATION_UP_MS - PERFECT_WINDOW_MS / 2), MAX_HUNDREDTHS);
  assert.notEqual(lockedScoreAt(DURATION_UP_MS - PERFECT_WINDOW_MS / 2 - 1), MAX_HUNDREDTHS);
  assert.equal(meterValueAt(DURATION_UP_MS - PERFECT_WINDOW_MS / 2), 959); // the gauge is untouched
});
