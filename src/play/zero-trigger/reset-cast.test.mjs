// gh#177, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, every
// seat holds BOTH halves of its cast identity again -- the animal name and the animal emoji -- the
// roster holds exactly as many seats as before, and neither a typed name nor a picked emoji survives.
//
// Both halves are asserted because this is the one route of the eleven with a player-facing emoji
// picker, and the owner ruled (2026-08-31, on ADR-0054 rulings 1-2) that reset returns the whole
// identity, not the name half of it. A test that checked names only would stay green on a reset that
// left a hand-picked emoji sitting beside a restored animal name.
//
// It runs the REAL bytes. main.js is a lifted IIFE with no exports, so resetPlayerCast is sliced out by
// source text and evaluated over a `state` object this file supplies -- the same technique, and the
// same brace matcher, that short-stick/reset-names.test.mjs uses on resetPlayerNames. A rename or a
// rewrite of resetPlayerCast fails this file loudly instead of silently testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly -- resetPlayerCast owns the
// state move, its handler owns saveStorage/renderPlayerRoster. What that costs is stated: this proves
// the WIPE, and (by source match, below) that the confirm button is wired to it -- never that a real
// tap on the confirm reaches the handler. The arming of what the redraw reveals is
// ./arm-reveal-paths.test.mjs's job, and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here -- a stand-in would test this file's idea of the
// baseline instead of the one that ships.
import { MASCOTS } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices the class method `<name>() { ... }` out of main.js by matching braces from its first `{`. */
function sliceMethod(name) {
  const start = source.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `main.js no longer declares ${name}() — this test is measuring nothing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while slicing ${name}`);
}

// Applied, not returned: resetPlayerCast is a method reading `this.state` and closing over main.js's
// MASCOTS import, so the wrapper hangs it on a host object, supplies the cast, and CALLS it.
const body = sliceMethod('resetPlayerCast');
const applyReset = new Function(
  'MASCOTS',
  'state',
  `const host = { state, ${body} }; host.resetPlayerCast(); return host.state;`,
);

/** The screen a player is looking at when they press reset: names typed over, emoji picked by hand. */
const typedRoster = () => [
  { id: 1, name: 'พี่โต้ง', avatar: '🦄', score: 3 },
  { id: 2, name: 'ชิบะ', avatar: '🐲', score: 0 },
  { id: 3, name: 'น้องหมวย', avatar: '🦁', score: 1 },
];

test('reset restores name AND emoji, keeps the count, and loses everything typed or picked', () => {
  const state = { players: typedRoster() };
  applyReset(MASCOTS, state);

  assert.equal(state.players.length, 3, 'the party changed size — reset must keep the count');
  assert.deepEqual(
    state.players.map((p) => p.name),
    MASCOTS.slice(0, 3).map((m) => m.name),
  );
  assert.deepEqual(
    state.players.map((p) => p.avatar),
    MASCOTS.slice(0, 3).map((m) => m.emoji),
    'the emoji half of the identity did not come back — the owner ruling covers both halves',
  );
  assert.ok(!state.players.some((p) => p.name === 'พี่โต้ง'), 'a typed name survived the reset');
  assert.ok(!state.players.some((p) => p.name === 'น้องหมวย'), 'a typed name survived the reset');
  assert.ok(!state.players.some((p) => p.avatar === '🦄'), 'a hand-picked emoji survived the reset');
});

test('reset keeps the count at both ends of the 2-10 range, and pairs every seat', () => {
  for (const n of [2, 10]) {
    const state = {
      players: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `typed ${i}`, avatar: '❓', score: 0 })),
    };
    applyReset(MASCOTS, state);
    assert.equal(state.players.length, n);
    state.players.forEach((p, i) => {
      assert.equal(p.name, MASCOTS[i % MASCOTS.length].name);
      assert.equal(p.avatar, MASCOTS[i % MASCOTS.length].emoji, `seat ${i} got a name and emoji from different rows`);
    });
  }
});

// Calibration, in the shape that can actually fail: the roster handed in matches the cast on NEITHER
// half, so a resetPlayerCast that did nothing at all leaves the assertions above red. Asserted here
// rather than left implicit, because a fixture that already satisfies the expectation is how a reset
// test passes on a no-op. Seat 2 deliberately already carries the cast's own seat-2 name (asserted
// below, so it stays that way), which leaves the emoji as the only thing telling that row from its
// baseline -- exactly the case a name-only reset would get away with.
test('RED CALIBRATION: the fixture is off-baseline on both halves', () => {
  const before = typedRoster();
  assert.notDeepEqual(
    before.map((p) => p.name),
    MASCOTS.slice(0, 3).map((m) => m.name),
  );
  assert.notDeepEqual(
    before.map((p) => p.avatar),
    MASCOTS.slice(0, 3).map((m) => m.emoji),
  );
  assert.equal(before[1].name, MASCOTS[1].name, 'seat 2 must already match by name, or it proves nothing');
  assert.notEqual(before[1].avatar, MASCOTS[1].emoji);
});

// The wiring this file's evaluation cannot see: the destructive button, and only that button, calls the
// wipe. Pinned by source so a confirm rewired to a no-op, or a wipe moved onto the cancel branch, fails
// here rather than in a browser.
test('only the confirm button runs the wipe, and the cancel branch does not', () => {
  const confirm = source.slice(source.indexOf("getElementById('btn-confirm-reset-cast')"));
  const confirmHandler = confirm.slice(0, confirm.indexOf('});'));
  assert.match(confirmHandler, /this\.resetPlayerCast\(\)/);
  assert.match(confirmHandler, /this\.saveStorage\(\)/);
  assert.match(confirmHandler, /this\.renderPlayerRoster\(\)/);

  const cancel = source.slice(source.indexOf("getElementById('btn-cancel-reset-cast')"));
  const cancelHandler = cancel.slice(0, cancel.indexOf('});'));
  assert.doesNotMatch(cancelHandler, /resetPlayerCast/, 'the cancel branch must lose nothing');

  // The trigger opens the question; it must never do the wipe itself.
  const trigger = source.slice(source.indexOf("getElementById('btn-open-reset-cast')"));
  const triggerHandler = trigger.slice(0, trigger.indexOf('});'));
  assert.match(triggerHandler, /openModal\('modal-reset-cast'\)/);
  assert.doesNotMatch(triggerHandler, /resetPlayerCast/, 'reset must be confirmed before it runs');
});

// gh#177 box: "their visible cast is unchanged when nobody presses reset — this ticket must not alter
// what a player sees on open". Proved as a set claim rather than a spot check: resetPlayerCast(
// appears exactly twice in the whole file -- its own declaration and the one call site the test above
// already showed sits inside btn-confirm-reset-cast's click handler, and NOT inside the trigger, the
// cancel branch, or the constructor's own loadStorage()/renderPlayerRoster() startup path.
test('gh#177 box: resetPlayerCast has exactly one call site, and it is the confirm click', () => {
  const occurrences = source.split('resetPlayerCast(').length - 1;
  assert.equal(occurrences, 2, `resetPlayerCast( appears ${occurrences} time(s) — expected exactly 2 (the declaration and the one call inside the confirm handler)`);
});

// gh#177 box: "renaming still persists as it does today, on all four". saveStorage/loadStorage are
// this route's whole persistence layer. Sliced the same way resetPlayerCast is above: real bytes, a
// fake localStorage, no DOM.
const saveMethod = sliceMethod('saveStorage');
const loadMethod = sliceMethod('loadStorage');
const applySave = new Function(
  'localStorage',
  'state',
  `const host = { state, localStorage, ${saveMethod} }; host.saveStorage(); return localStorage;`,
);
const applyLoad = new Function(
  'localStorage',
  'state',
  `const host = { state, localStorage, ${loadMethod} }; host.loadStorage(); return host.state;`,
);

test('gh#177 box: a typed name persists across a save/load round trip', () => {
  const store = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const typed = { players: [...typedRoster(), { id: 4, name: 'ฟร็อกกี้', avatar: '🐰', score: 0 }], penaltyMode: 'none' };
  applySave(fakeLocalStorage, typed);

  // A fresh load, into state that starts off the typed values — a loadStorage that does nothing would
  // leave this exactly as it starts, which is why the fixture is deliberately NOT the saved shape.
  const reloaded = applyLoad(fakeLocalStorage, { players: [{ id: 1, name: 'SHOULD NOT SURVIVE', avatar: '❓', score: 0 }], penaltyMode: 'none' });
  assert.equal(reloaded.players[0].name, 'พี่โต้ง', 'a typed name did not survive the save/load round trip');
});

// The three ids this route's markup owes main.js. A dialog whose confirm button is missing throws on
// addEventListener at startup and takes the whole route down, so the markup half is pinned too.
test('markup.html carries the confirm dialog the handlers bind to', () => {
  const markup = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
  for (const id of ['modal-reset-cast', 'btn-open-reset-cast', 'btn-cancel-reset-cast', 'btn-confirm-reset-cast']) {
    assert.ok(markup.includes(`id="${id}"`), `markup.html is missing #${id}`);
  }
  // The copy names the emoji loss, not just the typed-name loss: this route is the only one where a
  // player can pick their own, and under-naming a loss is what src-edit-rules.md forbids.
  const body = markup.slice(markup.indexOf('id="modal-reset-cast"'), markup.indexOf('id="btn-cancel-reset-cast"'));
  assert.match(body, /รูปสัตว์ที่เลือกไว้/, 'the confirm copy does not name the emoji loss');
  assert.match(body, /ชื่อผู้เล่นที่พิมพ์ไว้/, 'the confirm copy does not name the typed-name loss');
  assert.match(body, /จำนวนผู้เล่น/, 'the confirm copy does not say the player count survives');
});
