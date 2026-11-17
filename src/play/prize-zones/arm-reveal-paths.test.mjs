// Every reveal on the zones game's own page arms what it reveals (ADR-0017), including the paths that come back
// after a reveal ends (ADR-0057: the reveal layer closing uncovers the controls, so its close is a reveal). The
// page is the shared demo controller (../_prize-reveal/demo.ts) mounted for 'zones', walked with the real arm
// gate: the first screen, every step's exit, the replay, and every mode the page offers. The zones module itself
// builds no control and no DOM (renderer/mount.test.mjs), so the host's exit is the page's only close path; the
// last test walks it on the browser's input clock (ADR-0059), not on handler time.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_MODES, demoRun } from '../_prize-reveal/demo.ts';
import { allArmed, mountFake } from '../_prize-reveal/demo-harness.mjs';
import { ARM_DELAY_MS } from '../../games/_arm-gate.ts';

const GAME = 'zones';

test('the page offers the round demo: zones play elimination rounds only', () => {
  // Without a mode the demo has nothing to play and every walk below would check nothing.
  assert.deepEqual(DEMO_MODES[GAME], ['round'], 'DEMO_MODES has no round demo for zones: the page cannot mount');
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
      assert.ok(steps > 0, `mode ${mode}: no step to reveal, so nothing was walked`);
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

test('close path (ADR-0057, ADR-0059): the reveal layer closing uncovers the bar held on the input clock', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake(GAME);
    mock.timers.tick(ARM_DELAY_MS);
    s.go().click();
    assert.equal(s.hosts.started.length, 1, 'the reveal never started');
    s.hosts.started[0].exit();
    const go = s.go();
    assert.ok(go, 'the close uncovered no control');
    assert.equal(go.disabled, true, 'the control the close uncovered is live at once: a double tap lands on it');
    // A contact on the bar inside the window holds it from that contact's own dispatch stamp.
    s.bar.dispatch('pointerdown', { timeStamp: 1000 });
    mock.timers.tick(ARM_DELAY_MS);
    assert.equal(go.disabled, false, 'the control never armed after the held window');
    // The timer has fired, but this contact was dispatched inside the window it opened: a stalled ghost.
    s.bar.dispatch('pointerdown', { timeStamp: 1000 + ARM_DELAY_MS - 1 });
    assert.equal(go.disabled, true, 'a contact stamped inside the window was let through because its timer had already fired');
    mock.timers.tick(ARM_DELAY_MS);
    // A deliberate contact stamped after the window keeps the control live.
    s.bar.dispatch('pointerdown', { timeStamp: 5000 });
    assert.equal(go.disabled, false, 'a deliberate contact after the window re-held the control');
  } finally {
    mock.timers.reset();
  }
});
