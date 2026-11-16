// node --test — a reveal name is fitted at the weight it finally renders in, bold included. The field
// renders marked (pd-marked), where a passed chip (.pd-chip.in) is font-weight 700 (reveal.css); the wave
// shows it unmarked (400) first and re-marks on the next frame. The bold-face refit (whenBoldLoaded ->
// fitFrameNames) can land in that unmarked window: with the face cached it resolves before the re-mark
// frame. A fit there measures regular weight, so the name keeps a size its bold width overflows and clips
// when the mark returns. The refit must fit at the render weight, never at the wave's regular start.
//
// The fake DOM has no layout and no style engine, so this file models the two rules the fit reads:
//   - width: a name run measures fontSize x clusters x a per-weight factor; the bold factor applies only
//     once the bold face has loaded (before that a 700 run measures in the fallback, regular width);
//   - weight: a passed chip is 700 iff its field carries pd-marked, mirroring `.pd-marked .pd-chip.in`.
// The face "arrives" when the test flips face.loaded and runs the whenBoldLoaded callback, exactly the
// order main.ts wires (document.fonts.load(...).then(refit)). Stated ceiling: the model is the fit rule's
// width/weight inputs, not Chrome; real glyph metrics are a browser's to measure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeElement } from '../../prize-event/fake-dom.mjs';
import { FIT_SLACK } from '../_prize-reveal/names-dom.ts';
import { fakeOrigin, mount, press, storedEvent } from './stage-harness.mjs';

// A box room and name length where the regular-width fit stays at the surface size (20) but the loaded
// bold width overflows it by one fit step: bold fits at 19, not 20. Every name is 9 clusters, so every
// passed chip measures the same whatever the draw keeps.
const ROOM = 124;
const PER_PX = 0.6;
const BOLD = 1.15;
const SURFACE = 20;
const roster = Array.from({ length: 9 }, (_, i) => `WWWWWWWW${i + 1}`);

/** The width model: a run's offsetWidth from its box's fitted size, its render weight and the face state. */
function widthModel(face) {
  const markedField = (box) => {
    for (let n = box; n; n = n.parentNode) {
      if (n.classList?.contains('pd-field')) return n.classList.contains('pd-marked');
    }
    return false;
  };
  const bold = (box) => box.classList.contains('in') && markedField(box);
  const sizeOf = (box) => parseFloat(box.style.fontSize) || Number(box.getAttribute('data-fit-size'));
  const width = (run) => {
    const box = run.parentNode;
    const factor = bold(box) && face.loaded ? BOLD : 1;
    return sizeOf(box) * run.textContent.length * PER_PX * factor;
  };
  const saved = {
    gcs: globalThis.getComputedStyle,
    ow: Object.getOwnPropertyDescriptor(FakeElement.prototype, 'offsetWidth'),
    cw: Object.getOwnPropertyDescriptor(FakeElement.prototype, 'clientWidth'),
  };
  globalThis.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', getPropertyValue: () => '' });
  Object.defineProperty(FakeElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return this.classList.contains('nm') ? width(this) : 0;
    },
  });
  Object.defineProperty(FakeElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList.contains('pd-chip') ? ROOM : 0;
    },
  });
  return {
    /** The loaded bold width of a chip's name at its fitted size, with the slack the fit rule requires. */
    boldDemand: (box) => sizeOf(box) * box.firstElementChild.textContent.length * PER_PX * BOLD * FIT_SLACK,
    restore() {
      if (saved.gcs) globalThis.getComputedStyle = saved.gcs;
      else delete globalThis.getComputedStyle;
      for (const [k, d] of [['offsetWidth', saved.ow], ['clientWidth', saved.cw]]) {
        if (d) Object.defineProperty(FakeElement.prototype, k, d);
        else delete FakeElement.prototype[k];
      }
    },
  };
}

/** Press reveal on round 1, then run what the browser runs after it: the bold face arrives and its refit
 *  fires (a resolved promise, before the next frame), then the frame's re-mark callback. */
async function reveal({ reducedMotion = false } = {}) {
  const face = { loaded: false };
  const model = widthModel(face);
  try {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 9, list: roster, games: { rounds: [null, null, null, null], final: null } });
    const bolds = [];
    const s = await mount({ origin, reducedMotion, whenBoldLoaded: (cb) => bolds.push(cb) });
    press(s);
    await origin.idle();
    assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
    face.loaded = true; // the bold face arrives after the first fit
    for (const cb of bolds.splice(0)) cb(); // the refit it triggers
    for (const cb of s.frames.splice(0)) cb(); // the next frame: the wave's re-mark
    const field = s.frame.querySelector('.pd-field');
    const passed = [...field.querySelectorAll('.pd-chip.in')];
    assert.ok(passed.length > 0, 'round 1 keeps at least one name');
    return { field, passed, model };
  } finally {
    model.restore();
  }
}

test('the bold-face refit fits a reveal name at its render weight: its loaded bold width fits the box', async () => {
  const { field, passed, model } = await reveal();
  assert.equal(field.classList.contains('pd-marked'), true, 'the wave ended marked');
  for (const box of passed) {
    assert.ok(
      model.boldDemand(box) <= ROOM,
      `name ${box.textContent} fitted at ${box.style.fontSize}: bold width ${model.boldDemand(box)} overflows ${ROOM}`,
    );
    assert.ok(parseFloat(box.style.fontSize) < SURFACE, 'the name shrank below the regular-weight fit size');
  }
});

test('positive control: with no wave (reduced motion) the refit still fits the marked field bold', async () => {
  const { field, passed, model } = await reveal({ reducedMotion: true });
  assert.equal(field.classList.contains('pd-marked'), true);
  assert.equal(field.classList.contains('pd-fade'), true);
  for (const box of passed) {
    assert.ok(model.boldDemand(box) <= ROOM, `name ${box.textContent} must fit bold`);
    assert.ok(parseFloat(box.style.fontSize) < SURFACE);
  }
});
