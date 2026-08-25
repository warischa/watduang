// node --test src/games/ — no framework, no dependency
// checks only the pure helper exported from pick-loser.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import game, { pickLoser } from './pick-loser.ts';
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
const fakeDocument = {
  createElement: (tag) => new FakeElement(tag),
  // records every document.dispatchEvent() call so tests can assert what the game asked the page for
  dispatched: [],
  dispatchEvent(ev) {
    this.dispatched.push(ev);
  },
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

test('pick is always a member of the roster, at minimum legal roster size (2)', () => {
  const players = ['เอ', 'บี'];
  for (let i = 0; i < 50; i++) {
    const idx = pickLoser(players);
    assert.ok(players[idx] !== undefined, `index ${idx} is out of set`);
    assert.ok(players.includes(players[idx]));
  }
});

test('pick is always a member of the roster at max size (10)', () => {
  const players = Array.from({ length: 10 }, (_, i) => `คนที่ ${i + 1}`);
  for (let i = 0; i < 50; i++) {
    const idx = pickLoser(players);
    assert.ok(players[idx] !== undefined, `index ${idx} is out of set`);
  }
});

// rand is [0,1) in practice (Math.random never returns 1) — 0.999999 stands in for the top edge
test('injected rand maps deterministically to every index — a stuck picker fails this', () => {
  const players = ['เอ', 'บี', 'ซี', 'ดี', 'อี'];
  for (let i = 0; i < players.length; i++) {
    const idx = pickLoser(players, () => i / players.length);
    assert.equal(idx, i);
  }
  assert.equal(pickLoser(players, () => 0.999999), players.length - 1);
  assert.equal(pickLoser(players, () => 0), 0);
});

test('over enough draws, every roster member is reachable — coverage equals the roster', () => {
  for (const size of [2, 10]) {
    const players = Array.from({ length: size }, (_, i) => `คนที่ ${i + 1}`);
    const seen = new Set();
    for (let i = 0; i < 500; i++) {
      seen.add(pickLoser(players, Math.random));
    }
    assert.equal(seen.size, size, `coverage ${seen.size}/${size} — a stuck picker never reaches every index`);
  }
});

test('an empty roster must throw, not silently return an out-of-set index', () => {
  assert.throws(() => pickLoser([]), /ว่างเปล่า/);
});

// #42: the ghost-tap gate — a rapid double-tap on a game-page transition must not steal an action.
test('#42: ghost-tap gate — pl-pick stays live (documented exception), pl-again disables at reveal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  const players = ['เอ', 'บี', 'ซี'];
  game.mount(stage, makeCtx(players));

  // pl-pick is the documented exception: no hand-off exists between "เล่นอีกรอบ" and this button, so
  // the same hand taps both — gating it would delay a real, single-user action. It must work at t0,
  // before any tick — that is what "exception" means, not "arms sooner than everything else".
  const pickBtn = stage.children.find((c) => c.id === 'pl-pick');
  assert.ok(pickBtn, 'pl-pick missing');
  assert.equal(pickBtn.disabled, false, 'pl-pick must stay live — the documented same-hand exception');

  pickBtn.click(); // draws a loser, same as a real un-gated tap

  // children[1] is the result screen's burst box (gh#76); the picked name is the span inside it, and
  // this fake's textContent is own-text only, so the name must be read from the span, not the box.
  const pickedName = stage.children[1].children[0].textContent;
  assert.ok(players.includes(pickedName), `picked name "${pickedName}" is not a roster member`);

  const again = stage.children.find((c) => c.id === 'pl-again');
  assert.ok(again, 'pl-again missing after reveal');
  assert.equal(again.disabled, true,
    'pl-again must be disabled the instant the result screen renders — a ghost tap must not restart the round before the pick was read');

  // before arming: a ghost tap on "pl-again" must not restart the round
  again.click();
  assert.equal(stage.children[1].children[0].textContent, pickedName,
    'a disabled "pl-again" fired anyway — the picked name changed without a real re-render');
  assert.ok(!stage.children.some((c) => c.id === 'pl-pick'),
    'a disabled "pl-again" fired anyway — the round restarted before the window elapsed');

  // and one window later the same press really does restart the round
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(again.disabled, false, '"pl-again" never armed');
  again.click();
  assert.ok(stage.children.some((c) => c.id === 'pl-pick'), '"pl-again" did not restart the round once armed');

  game.dispose();
});

// gh#76 — the result screen widened to the approved design: the result label, the name in the
// burst, the footnote, the primary and secondary controls, and the inert-window hint,
// all as direct #stage children (the #42 test above finds pl-again with stage.children.find).
// pl-change joins pl-again under the SAME armAllButtons(stage) call — no second gate mechanism —
// and, once armed, asks the page for the setup panel by dispatching watduang:change-players.
test('gh#76 result screen: design copy is byte-exact, pl-change is gated by armAllButtons and dispatches change-players when armed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stage = fakeDocument.createElement('div');
  game.mount(stage, makeCtx(['เอ', 'บี', 'ซี']));
  stage.children.find((c) => c.id === 'pl-pick').click();

  // design copy, byte-for-byte, in document order ([1] is the burst, its first child the picked name)
  assert.equal(stage.children[0].textContent, 'คนโดนคือ');
  assert.ok(['เอ', 'บี', 'ซี'].includes(stage.children[1].children[0].textContent), 'the picked name must sit inside the burst');
  assert.equal(stage.children[2].textContent, 'วงตกลงกันเองว่าคนโดนต้องทำอะไร');
  const again = stage.children.find((c) => c.id === 'pl-again');
  assert.equal(again.textContent, 'เล่นอีกรอบ');
  const change = stage.children.find((c) => c.id === 'pl-change');
  assert.ok(change, 'pl-change missing after reveal');
  assert.equal(change.textContent, 'เปลี่ยนคนเล่น');
  assert.equal(stage.children[5].textContent, 'ปุ่มรองจะกดได้หลังผลออก 0.4 วินาที กันนิ้วลั่น');

  // the gate that arms pl-again also arms pl-change — same call, no second timer
  assert.equal(again.disabled, true, '"pl-again" must be disabled at reveal');
  assert.equal(change.disabled, true, '"pl-change" must be disabled the instant the result renders');

  // a ghost second contact inside the window must neither restart the round nor ask for the panel
  const eventsBefore = fakeDocument.dispatched.filter((ev) => ev.type === 'watduang:change-players').length;
  change.click(); // the fake swallows activation on a disabled control, same as the platform
  again.click();
  assert.equal(fakeDocument.dispatched.filter((ev) => ev.type === 'watduang:change-players').length, eventsBefore,
    'a ghost tap on pl-change must not dispatch while inert');
  assert.ok(!stage.children.some((c) => c.id === 'pl-pick'),
    'a disabled control fired anyway — the round restarted before the window elapsed');

  // one window later the secondary control arms and really does ask for the panel
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(change.disabled, false, '"pl-change" never armed');
  change.click();
  assert.equal(fakeDocument.dispatched.filter((ev) => ev.type === 'watduang:change-players').length, eventsBefore + 1,
    'an armed pl-change must dispatch watduang:change-players exactly once');
  assert.equal(stage.children.length, 0, 'the stage must be emptied when the group goes back to the panel');

  game.dispose();
});
