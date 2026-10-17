// Test-only harness (gh#272): drives a route's render-hold adapter with the REAL shared player screen's
// hold. Not a *.test.mjs file, so the runner does not collect it on its own; a route whose engine runs
// a plain requestAnimationFrame chain calls loopHoldCases() with a builder that executes its own
// sliced loop and adapter over stubs.
//
// The builder gets a hand-run frame queue and a clock, and returns the adapter plus what the loop drew:
//   build({ raf, caf, clock, gl }) -> { holdRendering, draws() , dts }
// `raf`/`caf` stand in for requestAnimationFrame/cancelAnimationFrame, so "nothing scheduled" is a
// queue length; `clock.now` is the time a frame callback receives; `gl.isContextLost()` answers what
// `gl.lost` holds.
//
// ponytail: node, not a browser. That the GPU idles while held is the latency measurement's.
import { makePage, installStorage, settle } from './screen-harness.mjs';

const SURFACE = '<div id="app"><section id="root" hidden></section></div>';
const LEGACY_KEY = 'watduang:timebomb-players';
const QUIET = 401;

export function loopHoldCases({ test, assert, label, build, lostContextStaysLost }) {
  async function setup(t, { roster = [] } = {}) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ps = await import('./player-screen.ts');
    const store = await import('../../shell/roster.ts');
    assert.equal(ps.isRenderHeld(), false, 'precondition: a hold leaked out of the previous case');
    const storage = installStorage();
    for (const name of roster) await store.loadRoster().add(name);
    storage.set(LEGACY_KEY, 'not json');
    const doc = makePage(SURFACE);
    globalThis.document = doc;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };

    const locks = [];
    const real = globalThis.navigator;
    const request = (_name, fn) => new Promise((resolve) => { locks.push(() => resolve(fn())); });
    Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true, writable: true });
    t.after(() => Object.defineProperty(globalThis, 'navigator', { value: real, configurable: true, writable: true }));

    const frames = new Map();
    let nextId = 1;
    const clock = { now: 1000 };
    const gl = { lost: false, isContextLost: () => gl.lost };
    const loop = build({
      raf: (fn) => { frames.set(nextId, fn); return nextId++; },
      caf: (id) => { frames.delete(id); },
      clock,
      gl,
    });
    const runFrame = () => {
      clock.now += 16;
      const due = [...frames.values()];
      frames.clear();
      for (const fn of due) fn(clock.now);
    };
    // The route's own order: the adapter follows the hold first, then the screen is mounted.
    t.after(ps.onRenderHold(loop.holdRendering));
    loop.holdRendering(ps.isRenderHeld());
    assert.equal(frames.size, 1, 'precondition: the loop starts one chain before the screen mounts');

    const live = { round: false };
    const root = doc.getElementById('root');
    const screen = ps.mountPlayerScreen({ root, range: [2, 10], onStart() {}, roundActive: () => live.round, abortRound() {} });
    const part = (name) => root.querySelector(`[data-ps="${name}"]`);
    const grantAll = async () => {
      await settle();
      while (locks.length) {
        locks.shift()();
        await settle();
      }
    };
    const landOpen = async () => {
      await grantAll();
      t.mock.timers.tick(QUIET);
      assert.equal(root.hidden, false, 'the player screen did not open');
    };
    const pressStart = async () => {
      assert.equal(part('start').click(), true, 'start was not live -- this case presses nothing');
      await settle();
      assert.ok(locks.length > 0, 'the start save never reached the lock -- this case holds nothing');
    };
    return { ps, store, doc, root, screen, live, loop, frames, runFrame, clock, gl, grantAll, landOpen, pressStart };
  }

  test(`${label} gh#272: zero draws while held -- from the mount, through the open, until the start save settles`, async (t) => {
    const page = await setup(t);
    assert.equal(page.ps.isRenderHeld(), true, 'the mount raised no hold -- this case measures nothing');
    assert.equal(page.frames.size, 0, 'the mount left the first frame queued');
    page.screen.open();
    await page.landOpen();
    page.runFrame();
    await page.pressStart();
    page.runFrame();
    assert.equal(page.loop.draws(), 0, 'a frame was drawn while the player screen held rendering');
    page.clock.now += 10000;
    await page.grantAll();
    assert.equal(page.ps.isRenderHeld(), false, 'precondition: the handover released the hold');
    assert.equal(page.frames.size, 1, 'the release did not queue exactly one chain');
    page.runFrame();
    page.runFrame();
    page.runFrame();
    assert.equal(page.loop.draws(), 3, 'the resumed loop draws other than one frame per frame -- a duplicate chain');
    assert.equal(page.loop.dts[0], 0, 'the first resumed frame stepped by the time rendering was held');
    page.loop.holdRendering(false);
    assert.equal(page.frames.size, 1, 'a second release started a second chain');
  });

  test(`${label} gh#272: a mid-round reopen through the edit control stops the loop until its save settles`, async (t) => {
    const page = await setup(t);
    page.screen.open();
    await page.landOpen();
    await page.pressStart();
    await page.grantAll();
    page.runFrame();
    const before = page.loop.draws();
    assert.equal(before, 1, 'precondition: the loop runs after the first handover');

    page.live.round = true;
    page.doc.dispatchEvent(new CustomEvent(page.ps.EDIT_EVENT));
    t.mock.timers.tick(QUIET);
    page.doc.getElementById('ps-edit-confirm').click();
    assert.equal(page.frames.size, 0, 'the confirmed reopen left a frame queued');
    await page.landOpen();
    await page.pressStart();
    page.runFrame();
    assert.equal(page.loop.draws(), before, 'a frame was drawn while the reopened screen or its save held rendering');
    await page.grantAll();
    page.runFrame();
    assert.equal(page.loop.draws(), before + 1);
  });

  test(`${label} gh#272: a removal the close commits keeps the loop stopped until that write settles`, async (t) => {
    const page = await setup(t, { roster: ['A', 'B', 'C'] });
    page.screen.open();
    await page.landOpen();
    page.root.querySelectorAll('.ps-rm')[0].click();
    page.screen.close();
    await settle();
    page.runFrame();
    assert.equal(page.loop.draws(), 0, 'the loop drew while the removal was still waiting on the lock');
    assert.equal(page.frames.size, 0);
    await page.grantAll();
    page.runFrame();
    assert.equal(page.loop.draws(), 1, 'the removal settled and the loop never came back');
  });

  if (lostContextStaysLost) {
    test(`${label} gh#272: a context lost during a hold stays lost -- the release starts no loop`, async (t) => {
      const page = await setup(t);
      page.screen.open();
      await page.landOpen();
      page.gl.lost = true;
      await page.pressStart();
      await page.grantAll();
      assert.equal(page.ps.isRenderHeld(), false, 'precondition: the hold released');
      page.runFrame();
      assert.equal(page.frames.size, 0, 'the release queued a frame on a lost context');
      assert.equal(page.loop.draws(), 0);
    });
  }
}
