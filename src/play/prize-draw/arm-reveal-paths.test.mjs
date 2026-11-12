// Every reveal on the prize-draw projector route arms what it reveals (ADR-0017), including the close path
// (ADR-0057): closing the storage notice uncovers the MC's button, which is a reveal like any other.
//
// Two halves, the shape the other play routes use:
//   1. SOURCE: stage.ts routes every un-hide through ONE helper, show(), which calls armAllButtons on the
//      region it shows. The set this test enumerates is show()'s call sites, which stage.ts owns; a new
//      un-hide written outside show() fails here on the day it is added, and a stale expectation fails too.
//   2. BEHAVIOUR: the route is mounted for real on the prize fake DOM with the real arm gate
//      (src/games/_arm-gate.ts) and walked through every transition. After each one, the button the room
//      now sees is disabled (inside its 400ms window); after the window it is live. The notice's close path
//      is driven the same way.
// Stated ceiling: half 2 proves the window is opened on every path; the input-clock half of the gate
// (ADR-0059) is the shared gate's own, tested in src/games/_arm-gate.test.mjs.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { STORAGE_KEY } from '../../prize-event/event.ts';
import { memoryStorage, mount, seeded, sharedStorage, storedEvent } from './stage-harness.mjs';

const SOURCE = fs
  .readFileSync(path.join(import.meta.dirname, 'stage.ts'), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

test('show() is the only un-hide, and it arms the region it shows', () => {
  const unhides = [...SOURCE.matchAll(/(\w+)\.hidden\s*=\s*false/g)].map((m) => m[1]);
  assert.deepEqual(unhides, ['region'], `un-hide outside show(): ${unhides.join(', ')}`);
  assert.match(SOURCE, /const show = \(region: HTMLElement\): void => \{\s*region\.hidden = false;\s*armAllButtons\(region\);\s*\};/);
});

// receiver -> why it is shown. Every entry is a decision.
const EXPECTED_SHOWS = new Map([
  ['viewport', 'every render (cold, round, reveal, final, result) rebuilds the frame and the MC bar inside the viewport and arms it, including a follower render (another tab moved the event: taken up on a storage event or on this screen\'s own press); and the notice close path uncovers it again (ADR-0057)'],
  ['notice', 'the storage-failure notice, which carries its own close button'],
]);

test('every show() call site is a known reveal', () => {
  const calls = [...SOURCE.matchAll(/\bshow\((\w+)\)/g)].map((m) => m[1]);
  assert.ok(calls.length > 0, 'no show() calls: this test would pass vacuously');
  const unknown = [...new Set(calls)].filter((c) => !EXPECTED_SHOWS.has(c));
  assert.deepEqual(unknown, [], `new reveal(s) ${unknown.join(', ')}: arm them through show() and add them here with the reason`);
  const stale = [...EXPECTED_SHOWS.keys()].filter((k) => !calls.includes(k));
  assert.deepEqual(stale, [], `expected reveals that no longer exist: ${stale.join(', ')}`);
  // The frame is rebuilt by renderScreen; the arm must follow it in the same render.
  assert.match(SOURCE, /renderScreen\(frame,[^;]*\);[\s\S]*?show\(viewport\);\s*\};/);
});

test('the close handler shows the frame again (the close path is armed at its own site)', () => {
  const at = SOURCE.indexOf("close.addEventListener('click'");
  assert.ok(at > -1, 'no close handler: this test measures nothing');
  const body = SOURCE.slice(at, SOURCE.indexOf('});', at));
  assert.match(body, /notice\.hidden = true;[\s\S]*show\(viewport\);/);
});

function armedThenLive(button, label) {
  assert.ok(button, `${label}: no button on screen`);
  assert.equal(button.disabled, true, `${label}: the revealed button is live at once; a double tap would land on it`);
  mock.timers.tick(ARM_DELAY_MS);
  assert.equal(button.disabled, false, `${label}: the button never armed`);
}

test('every transition arms the button it reveals, round 1 to the result', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const storage = memoryStorage();
    storedEvent(storage, { n: 50 });
    const s = mount({ storage, rng: seeded(9) });
    armedThenLive(s.go(), 'first screen');
    for (let r = 1; r <= 4; r++) {
      s.go().click(); // reveal
      assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
      armedThenLive(s.go(), `round ${r} reveal`);
      s.go().click(); // next
      armedThenLive(s.go(), `after round ${r}`);
    }
    assert.equal(s.frame.getAttribute('data-screen'), 'final');
    s.go().click();
    assert.equal(s.frame.getAttribute('data-screen'), 'result');
    assert.equal(s.go(), null, 'the result ends the event: no MC button');
  } finally {
    mock.timers.reset();
  }
});

test('close path: a failed store opens the notice armed, and closing it re-arms the MC button (ADR-0057)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const storage = memoryStorage();
    storedEvent(storage, { n: 50 });
    const s = mount({ storage, rng: seeded(3) });
    mock.timers.tick(ARM_DELAY_MS);
    storage.failWrites = true;
    s.go().click();
    assert.equal(s.notice.hidden, false, 'the notice did not open on a failed store');
    assert.equal(s.frame.getAttribute('data-screen'), 'round', 'a draw that was not stored was revealed');
    const close = s.notice.querySelector('button');
    armedThenLive(close, 'notice close');
    close.click();
    assert.equal(s.notice.hidden, true);
    armedThenLive(s.go(), 'MC button uncovered by the close');
  } finally {
    mock.timers.reset();
  }
});

/** Two tabs on one stored event, past their first arm window. */
function twoTabs() {
  const shared = sharedStorage();
  const storage = memoryStorage();
  storedEvent(storage, { n: 50 });
  shared.map.set(STORAGE_KEY, storage.map.get(STORAGE_KEY));
  const tab = (name, seed) => {
    const t = shared.tab(name);
    return { ...mount({ storage: t.storage, rng: seeded(seed), onStorage: t.onStorage }), deliver: t.deliver };
  };
  const tabs = { A: tab('A', 21), B: tab('B', 22) };
  mock.timers.tick(ARM_DELAY_MS);
  tabs.A.go().click();
  return tabs;
}

test('follower path, storage event: a tab that follows another tab\'s reveal arms the button it reveals', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { A, B } = twoTabs();
    assert.equal(A.frame.getAttribute('data-screen'), 'reveal');
    B.deliver();
    assert.equal(B.frame.getAttribute('data-screen'), 'reveal', 'the follower did not re-render the stored reveal');
    armedThenLive(B.go(), 'follower, on the storage event');
  } finally {
    mock.timers.reset();
  }
});

test('follower path, own press: a tab that was behind takes the stored step up on its tap, and the button under that finger is armed', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { A, B } = twoTabs();
    const behind = B.go();
    assert.equal(behind.disabled, false, 'precondition: the stale button is live');
    behind.click(); // no storage event delivered: B learns of the reveal from its own re-read
    assert.equal(B.frame.getAttribute('data-screen'), 'reveal', 'the stale tab did not take up the stored reveal');
    assert.deepEqual(B.stage.current().rounds, A.stage.current().rounds, 'the stale tab drew its own round instead of taking up the stored one');
    armedThenLive(B.go(), 'follower, on its own press');
  } finally {
    mock.timers.reset();
  }
});
