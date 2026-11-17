// Every reveal on the flipcards game's own page arms what it reveals (ADR-0017), including the paths that come
// back after a reveal ends (ADR-0057: the host's exit uncovers the controls). The page is the shared demo
// controller (../_prize-reveal/demo.ts) mounted for 'flipcards', walked with the real arm gate: the first
// screen, every step's exit, the replay, and every mode and prize-count pick the page offers.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The gate anchors its window to the stamp of the last press the document saw (ADR-0059), recorded by a
// document-capture listener it registers when it loads. Node has no document, so a minimal one stands in
// before the gate is imported; `press` plays a press the browser stamped at `stamp`.
const pressListeners = [];
globalThis.document ??= { addEventListener: (_type, fn) => pressListeners.push(fn) };
const press = (stamp) => {
  for (const fn of pressListeners) fn({ timeStamp: stamp });
};
const { DEMO_MODES, demoRun } = await import('../_prize-reveal/demo.ts');
const { allArmed, mountFake } = await import('../_prize-reveal/demo-harness.mjs');
const { ARM_DELAY_MS } = await import('../../games/_arm-gate.ts');

const GAME = 'flipcards';

test('the page has a final demo to walk (an empty mode list would make every walk below vacuous)', () => {
  assert.ok(DEMO_MODES[GAME].includes('final'), `${GAME} has no final demo mode: ${JSON.stringify(DEMO_MODES[GAME])}`);
});

test('every reveal path on this page arms its controls', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake(GAME);
    allArmed(s, 'first screen');
    let walked = 0;
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
        walked++;
      }
      s.go().click(); // the replay
      allArmed(s, 'replay');
    }
    assert.ok(walked > 0, 'no reveal was walked');
  } finally {
    mock.timers.reset();
  }
});

test('close path (ADR-0057): the reveal\'s exit uncovers the bar armed; a contact inside the window, even one delivered late, holds it (ADR-0059)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = mountFake(GAME);
    allArmed(s, 'first screen');
    s.go().click();
    assert.equal(s.go(), null, 'the go control stayed live while the reveal plays');
    // The last press the browser stamped before the close: the window runs from here.
    const pressedAt = 10_000;
    press(pressedAt);
    // The host's first exit is the close: it draws the step's 2D view and brings the controls back.
    s.hosts.started.at(-1).exit();
    const buttons = s.bar.querySelectorAll('button');
    assert.ok(buttons.length > 0, 'the close uncovered no control, so nothing was checked');
    for (const b of buttons) assert.equal(b.disabled, true, `"${b.textContent}" is live at once after the close`);

    // A contact before the timer arms restarts the window.
    mock.timers.tick(ARM_DELAY_MS - 1);
    s.bar.dispatch('pointerdown', { timeStamp: pressedAt + ARM_DELAY_MS - 1 });
    mock.timers.tick(1);
    for (const b of buttons) assert.equal(b.disabled, true, `"${b.textContent}" armed under a contact inside the window`);
    mock.timers.tick(ARM_DELAY_MS);
    for (const b of buttons) assert.equal(b.disabled, false, `"${b.textContent}" never armed after the window went quiet`);

    // The timer has armed the bar, but a ghost queued behind a long task arrives now, stamped inside the
    // window that contact opened: the input clock, not the handler's time, decides, and it is held again.
    const heldFrom = pressedAt + ARM_DELAY_MS - 1;
    s.bar.dispatch('pointerdown', { timeStamp: heldFrom + ARM_DELAY_MS - 1 });
    for (const b of buttons) assert.equal(b.disabled, true, `"${b.textContent}" stayed live under a late contact stamped inside the window`);
    mock.timers.tick(ARM_DELAY_MS);
    for (const b of buttons) assert.equal(b.disabled, false, `"${b.textContent}" never re-armed`);
    // A deliberate tap, stamped past the window, is let through: nothing is held under it.
    const lastHold = heldFrom + ARM_DELAY_MS - 1;
    s.bar.dispatch('pointerdown', { timeStamp: lastHold + ARM_DELAY_MS });
    for (const b of buttons) assert.equal(b.disabled, false, `"${b.textContent}" was held under a tap stamped past the window`);
  } finally {
    mock.timers.reset();
  }
});
