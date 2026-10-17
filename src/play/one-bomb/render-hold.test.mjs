// gh#272 on one-bomb: the engine's backdrop loop stops while the shared player screen holds rendering,
// and a release resumes one chain -- never on a lost context, whose canvas main.ts has removed.
//
// The engine is a sealed IIFE, so its own loop and adapter are sliced out of main.js and executed over
// stubs: update/renderScene count what a frame would do, and the shared harness drives the REAL player
// screen's hold through first open, mid-round reopen and save settlement
// (src/play/_player-screen/render-hold-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';
import { loopHoldCases } from '../_player-screen/render-hold-harness.mjs';

const ENGINE = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const LOOP = sliceBlock(ENGINE, 'function loop(now)');
const HOLD = sliceBlock(ENGINE, 'function holdRendering(held)');
assert.ok(LOOP && HOLD, 'main.js no longer declares loop(now) and holdRendering(held) -- this test is measuring nothing');

loopHoldCases({
  test,
  assert,
  label: 'one-bomb',
  lostContextStaysLost: true,
  build({ raf, caf, clock, gl }) {
    let drawn = 0;
    const dts = [];
    const game = { lastTime: clock.now };
    // eslint-disable-next-line no-new-func -- executing main.js's own loop is the whole point.
    const holdRendering = new Function(
      'requestAnimationFrame', 'cancelAnimationFrame', 'gl', 'game', 'clamp', 'update', 'renderScene',
      `let frameId = 0;\n${LOOP}\n${HOLD}\nreturn holdRendering;`,
    )(raf, caf, gl, game, (v, lo, hi) => Math.min(hi, Math.max(lo, v)), (dt) => dts.push(dt), () => { drawn += 1; });
    return { holdRendering, draws: () => drawn, dts };
  },
});
