// Every reveal on the marble race's own page arms what it reveals (ADR-0017), including the paths that come
// back after a reveal ends (ADR-0057: the host's exit uncovers the controls). The page is the shared demo
// controller (../_prize-reveal/demo.ts) mounted for 'marbles', walked with the real arm gate: the first screen,
// every step's exit, the replay, and every mode the page offers. The close path gets its own case: the 3D
// layer closing over the bar is a reveal, and a contact landing inside the window re-holds the bar from that
// contact (the region's gate, the one ADR-0059's input clock feeds).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_MODES, demoRun } from '../_prize-reveal/demo.ts';
import { allArmed, mountFake } from '../_prize-reveal/demo-harness.mjs';
import { ARM_DELAY_MS } from '../../games/_arm-gate.ts';

const GAME = 'marbles';

test('the page offers a demo at all: an empty mode list would walk nothing below', () => {
  assert.ok(DEMO_MODES[GAME].length > 0, `DEMO_MODES.${GAME} is empty: the page has no demo to arm`);
});

test('every reveal path on this page arms its controls', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake(GAME);
    allArmed(s, 'first screen');
    for (const mode of DEMO_MODES[GAME]) {
      const pick = s.chips()[DEMO_MODES[GAME].indexOf(mode)];
      if (DEMO_MODES[GAME].length > 1) {
        pick.click();
        allArmed(s, `mode ${mode} picked`);
      }
      const steps = demoRun(GAME, mode).steps.length;
      assert.ok(steps > 0, `mode ${mode}: no step to reveal`);
      for (let i = 0; i < steps; i++) {
        s.go().click();
        assert.equal(s.go(), null, `step ${i + 1}: a control stayed live while the reveal plays`);
        s.hosts.started.at(-1).exit();
        allArmed(s, `step ${i + 1} exit`);
      }
      s.go().click(); // the replay
      allArmed(s, 'replay');
    }
  } finally {
    mock.timers.reset();
  }
});

test('ADR-0057 close path: the reveal closing over the bar arms it, and a contact inside the window re-holds it', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake(GAME);
    mock.timers.tick(ARM_DELAY_MS);
    s.go().click();
    const host = s.hosts.started.at(-1);
    // The host's exit is the close: it draws the committed 2D view and brings the bar back.
    host.exit();
    const buttons = s.bar.querySelectorAll('button');
    assert.ok(buttons.length > 0, 'the close brought back no control, so nothing was checked');
    for (const b of buttons) assert.equal(b.disabled, true, `"${b.textContent}" is live the moment the reveal closed`);
    // A second contact of the tap that ended the reveal lands inside the window: the bar holds from it.
    mock.timers.tick(ARM_DELAY_MS - 100);
    s.bar.dispatch('pointerdown', { timeStamp: ARM_DELAY_MS - 100 });
    mock.timers.tick(100);
    for (const b of buttons) assert.equal(b.disabled, true, `"${b.textContent}" armed on the old window despite a contact inside it`);
    mock.timers.tick(ARM_DELAY_MS - 100);
    for (const b of buttons) assert.equal(b.disabled, false, `"${b.textContent}" never armed after the contact`);
    // The torn-down path: disposing the host a second time draws nothing more and leaves the bar as it is.
    host.dispose();
    for (const b of buttons) assert.equal(b.disabled, false, `"${b.textContent}" was taken back by a second exit`);
  } finally {
    mock.timers.reset();
  }
});
