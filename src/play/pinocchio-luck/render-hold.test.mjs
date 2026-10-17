// gh#272 on pinocchio-luck: the stage loop stops while the shared player screen holds rendering, and a
// release resumes one chain with its clock reset.
//
// The loop and its adapter are sliced out of main.js and executed over stubs: drawScene counts what a
// frame draws, and the shared harness drives the REAL player screen's hold through first open,
// mid-round reopen and save settlement (src/play/_player-screen/render-hold-harness.mjs).
// No lost-context case: this route has no context-loss handler, and its loop also carries the stage
// shake and the particles, so a release resumes the loop it had before the hold -- nothing on this
// route restores a context, then or now.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';
import { loopHoldCases } from '../_player-screen/render-hold-harness.mjs';

const ENGINE = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const FRAME = sliceBlock(ENGINE, 'function frame(now)');
const HOLD = sliceBlock(ENGINE, 'function holdRendering(held)');
assert.ok(FRAME && HOLD, 'main.js no longer declares frame(now) and holdRendering(held) -- this test is measuring nothing');

loopHoldCases({
  test,
  assert,
  label: 'pinocchio-luck',
  lostContextStaysLost: false,
  build({ raf, caf, clock }) {
    let drawn = 0;
    const dts = [];
    const visual = { particles: [], trauma: 0 };
    // eslint-disable-next-line no-new-func -- executing main.js's own loop is the whole point.
    const holdRendering = new Function(
      'requestAnimationFrame', 'cancelAnimationFrame', 'visual', 'stageFrame', 'fxRng', 'drawScene', 'start',
      `let last = start, frameId = 0;\n${FRAME}\n${HOLD}\nreturn holdRendering;`,
    )(raf, caf, visual, { style: {} }, { next: () => 0.5 }, (_time, dt) => { drawn += 1; dts.push(dt); }, clock.now);
    return { holdRendering, draws: () => drawn, dts };
  },
});
