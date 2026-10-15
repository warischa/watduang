// gh#264 browser pass, 2026-10-16: the window-level touchend listener that ends a power charge called
// preventDefault on EVERY touchend, charging or not. Cancelling a touchend cancels the click that
// follows it, so every click-driven control on the route -- the shared player screen's stepper and
// start included -- never activated under touch (measured through CDP touch: pointerup and touchend
// fired, click never did). The charge release still needs its preventDefault: the fire button's
// touchstart already cancelled its own press, and the release must not turn into a click on whatever
// sits under the finger. Every other touchend must reach its click.
//
// The handler's own bytes are executed; the free names it reads are supplied per case.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';

const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const RELEASE = sliceBlock(MAIN, 'function releasePowerCharging(e)');

function release({ charging, locked = false }) {
  assert.ok(RELEASE, 'main.js no longer declares releasePowerCharging(e) -- this test measures nothing');
  const state = { isChargingPower: charging, isAimingLocked: locked, shots: 0 };
  const env = {
    DOM: { btnFireCannon: { classList: { remove() {} } } },
    sound: { stopChargeHum() {} },
    executeShot: () => { state.shots += 1; },
  };
  // eslint-disable-next-line no-new-func -- the handler's own bytes.
  const fn = new Function('state', 'env', `with (env) { with (state) { return ${RELEASE}; } }`)(state, env);
  let prevented = 0;
  fn({ type: 'touchend', preventDefault: () => { prevented += 1; } });
  return { prevented, shots: state.shots, stillCharging: state.isChargingPower };
}

test('a touchend that ends a power charge is cancelled and fires the shot', () => {
  const r = release({ charging: true });
  assert.equal(r.prevented, 1, 'the charge release must cancel its touchend');
  assert.equal(r.shots, 1);
  assert.equal(r.stillCharging, false);
});

test('a touchend on anything else is left alone, so its click still fires', () => {
  const r = release({ charging: false });
  assert.equal(r.prevented, 0, 'a touchend outside a charge was cancelled -- every click-driven control on the route dies under touch');
  assert.equal(r.shots, 0);
});

test('a touchend while aiming is locked is left alone too', () => {
  const r = release({ charging: true, locked: true });
  assert.equal(r.prevented, 0);
  assert.equal(r.shots, 0);
});
