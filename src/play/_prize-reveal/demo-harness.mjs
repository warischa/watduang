// Test-only harness for the prize-draw games' own pages (gh#305-gh#307). Not a *.test.mjs file, so the runner
// does not collect it. Mounts demo.ts on the prize fake DOM with the real arm gate and a recording fake of
// the reveal host, so a test drives the real controller: every reveal it starts, and each one's exit.
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { mountDemo } from './demo.ts';

/** A fake host per reveal: it records the options it was started with and exits only when told to. */
export function fakeHosts() {
  const started = [];
  const startReveal = (options) => {
    let exited = false;
    const host = {
      options,
      disposed: false,
      state: 'running',
      reason: null,
      done: Promise.resolve('settled'),
      command() {},
      /** The host's first exit: it draws the committed 2D view once. */
      exit() {
        if (exited) return;
        exited = true;
        options.render2D(options.input.outcome);
      },
      dispose() {
        host.disposed = true;
        host.exit();
      },
    };
    started.push(host);
    return host;
  };
  return { started, startReveal };
}

/**
 * Stubbed boxes for the placement decision (the fake DOM has no layout). `layout` is read on every
 * measurement, so a test changes it to model a resize: `width` the screen width, `exitRight` the exit
 * control's right edge, `band` the play band's height (where the viewport starts), `barBottom` the bar's
 * bottom edge in the band, `badge` and `button` the content widths that make up the bar's one-row width.
 */
export function stubLayout(doc, layout) {
  const exit = doc.createElement('button');
  exit.id = 'play-exit';
  exit.getBoundingClientRect = () => ({ left: 6, right: layout.exitRight, top: 6, bottom: 50 });
  doc.body.append(exit);
  const create = doc.createElement;
  doc.createElement = (tag) => {
    const el = create(tag);
    el.getBoundingClientRect = function () {
      if (this.className === 'pr-viewport') return { left: 0, right: layout.width, top: layout.band, bottom: 800 };
      if (this.className === 'pr-bar') return { left: 0, right: layout.width - 24, top: 2, bottom: layout.barBottom };
      return { left: 0, right: 0, top: 0, bottom: 0 };
    };
    Object.defineProperty(el, 'scrollWidth', {
      get() {
        return this.className === 'pr-bar' ? layout.badge + layout.button * this.querySelectorAll('button').length : 0;
      },
    });
    return el;
  };
}

export function mountFake(game, layout = null) {
  const doc = makeDoc();
  if (layout) stubLayout(doc, layout);
  const root = doc.createElement('div');
  root.id = 'app';
  const live = doc.createElement('p');
  live.id = 'pr-live';
  doc.body.append(live, root);
  const hosts = fakeHosts();
  const demo = mountDemo({ doc, root, live, game, startReveal: hosts.startReveal });
  const bar = root.querySelector('.pr-bar');
  const go = () => bar.querySelector('.pr-go');
  const chips = () => bar.querySelectorAll('.pr-chip');
  const chip = (text) => chips().find((b) => b.textContent === text) ?? null;
  return { doc, root, live, demo, bar, go, chips, chip, hosts };
}

/** The button the room now sees is disabled inside its arm window, then live after it. */
export function armedThenLive(button, label) {
  assert.ok(button, `${label}: no button on screen`);
  assert.equal(button.disabled, true, `${label}: the revealed button is live at once; a double tap would land on it`);
  mock.timers.tick(ARM_DELAY_MS);
  assert.equal(button.disabled, false, `${label}: the button never armed`);
}

/** Every control in the bar, armed then live, after a reveal of the bar. */
export function allArmed(s, label) {
  const buttons = s.bar.querySelectorAll('button');
  assert.ok(buttons.length > 0, `${label}: the bar holds no control, so nothing was checked`);
  for (const b of buttons) assert.equal(b.disabled, true, `${label}: "${b.textContent}" is live at once`);
  mock.timers.tick(ARM_DELAY_MS);
  for (const b of buttons) assert.equal(b.disabled, false, `${label}: "${b.textContent}" never armed`);
}
