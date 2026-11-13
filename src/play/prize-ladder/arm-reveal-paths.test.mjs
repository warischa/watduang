// Every reveal on the ladder game's own page arms what it reveals (ADR-0017), including the paths that come
// back after a reveal ends (ADR-0057: the host's exit uncovers the controls). The page is the shared demo
// controller (../_prize-reveal/demo.ts) mounted for 'ladder', walked with the real arm gate: the first screen,
// every step's exit, the replay, and every mode and prize-count pick the page offers.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_MODES, demoRun } from '../_prize-reveal/demo.ts';
import { allArmed, mountFake } from '../_prize-reveal/demo-harness.mjs';

const GAME = 'ladder';

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
      if (mode === 'final') {
        s.chips().find((b) => b.textContent === '1').click();
        allArmed(s, 'prize count picked');
      }
      const steps = demoRun(GAME, mode, mode === 'final' ? 1 : undefined).steps.length;
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
