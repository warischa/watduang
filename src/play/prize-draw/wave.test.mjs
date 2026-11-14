// node --test — the reveal wave plays (gh#314 1d B, design/Gh314Frames.dc.html i1-wave B): after the reveal
// press the field's names go from unmarked to marked as ONE style change, so every chip's transition runs to
// its end on its own delay.
//
// Measured in Chrome (docs/verification/evidence/gh305-audit-measure-2026-11-14, 1d): the wave never played.
// Every chip ran a transition, then all were cancelled ~44ms later and showed their end colour at once. The
// cause is the order of style change events on the field. A CSS transition starts only when a style change
// event finds a property changed from the element's previous computed style, and is cancelled when a later
// one reverses it during its delay. The field is rendered and fitted marked (a forced style flush, so the
// marked style is computed), then unmarked, then re-marked on the next frame. Either no style change event
// sees the unmarked state (marked -> marked: nothing runs), or one does (the bold-face refit forces it), and
// then marked -> unmarked runs 196 transitions that the re-mark reverses during their delays (all cancelled).
//
// The fake DOM has no style engine, so this file models the one rule above: a style change event happens at
// every forced flush (getComputedStyle, offsetWidth) and at each frame after its callbacks; an element that
// was not rendered (display: none) at the previous event starts no transition. The model records each
// transition of the field's marking. The wave plays iff that record is exactly [marked]: one change, unmarked
// to marked, and nothing before it to reverse.
// Stated ceiling: the model is the CSS Transitions rule, not Chrome; the timing is the browser's to measure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement } from '../../prize-event/fake-dom.mjs';
import { fakeOrigin, mount, press, storedEvent } from './stage-harness.mjs';

/** The style engine model over the current `.pd-field` under `s.frame`. */
function engine() {
  let s = null;
  let field = null;
  let computed = null;
  const changes = [];
  const flush = () => {
    const now = s?.frame.querySelector('.pd-field') ?? null;
    if (now !== field) {
      field = now;
      computed = null; // a new element has no previous computed style
    }
    if (!field) return;
    const state = { shown: field.style.getPropertyValue('display') !== 'none', marked: field.classList.contains('pd-marked') };
    if (computed && computed.shown && state.shown && computed.marked !== state.marked) changes.push(state.marked ? 'marked' : 'unmarked');
    computed = state;
  };
  const saved = { gcs: globalThis.getComputedStyle, ow: Object.getOwnPropertyDescriptor(FakeElement.prototype, 'offsetWidth') };
  globalThis.getComputedStyle = () => {
    flush();
    return { paddingLeft: '0', paddingRight: '0', display: '', getPropertyValue: () => '' };
  };
  Object.defineProperty(FakeElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      flush();
      return 0;
    },
  });
  return {
    attach: (mounted) => (s = mounted),
    flush,
    changes,
    restore() {
      if (saved.gcs) globalThis.getComputedStyle = saved.gcs;
      else delete globalThis.getComputedStyle;
      if (saved.ow) Object.defineProperty(FakeElement.prototype, 'offsetWidth', saved.ow);
      else delete FakeElement.prototype.offsetWidth;
    },
  };
}

/** Press reveal on round 1 of a 196-name event, then run what the browser runs after it: the bold face's
 *  refit (a resolved promise, before the next frame), then the frame's callbacks and its style change. */
async function revealRound1({ reducedMotion = false, bold = true } = {}) {
  const e = engine();
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 196, games: { rounds: [null, null, null, null], final: null } });
    const bolds = [];
    const s = await mount({ origin, reducedMotion, ...(bold ? { whenBoldLoaded: (cb) => bolds.push(cb) } : {}) });
    e.attach(s);
    for (const cb of s.frames.splice(0)) cb();
    e.flush();
    press(s);
    await origin.idle();
    assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
    for (const cb of bolds.splice(0)) cb();
    for (const cb of s.frames.splice(0)) cb();
    e.flush();
    const field = s.frame.querySelector('.pd-field');
    return { changes: e.changes, field };
  } finally {
    e.restore();
  }
}

test('1d B: the reveal press runs the wave: one style change, unmarked to marked, nothing reversed (bold face refit included)', async () => {
  const { changes, field } = await revealRound1();
  assert.deepEqual(changes, ['marked'], 'the field\'s marking must change once, to marked, after an unmarked style was computed');
  assert.equal(field.classList.contains('pd-marked'), true);
  assert.equal(field.style.getPropertyValue('display'), '', 'the field is shown');
});

test('1d B: the wave runs when no bold-face refit comes either', async () => {
  const { changes } = await revealRound1({ bold: false });
  assert.deepEqual(changes, ['marked']);
});

test('reduced motion: the end state is there at once, never unmarked, and the field fades (ADR-0046)', async () => {
  const { changes, field } = await revealRound1({ reducedMotion: true });
  assert.deepEqual(changes, [], 'no marking change at all: the names never pass through the unmarked state');
  assert.equal(field.classList.contains('pd-marked'), true);
  assert.equal(field.classList.contains('pd-fade'), true);
});
