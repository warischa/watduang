// gh#272 on croc-bite: while the shared player screen holds rendering, this route builds no scene and
// draws no frame, and a release resumes exactly one loop.
//
// RUN, NOT READ. The page's own boot (main.js's DOMContentLoaded body) and the whole GameApp class are
// sliced out of main.js and executed over the route's real markup, with the REAL shared player screen
// mounted by GameApp.mountPlayers -- so the hold the engine obeys is the one that screen really raises.
// Only what needs a GPU is stubbed: GameScene counts its constructions and its render() calls, and a
// hand-run frame queue stands in for requestAnimationFrame, so "nothing scheduled" is a queue length.
// The lock is a stub this file grants by hand, so a save can be held mid-flight.
//
// Cases: the first boot waits for the handover (and is not read as a failed one); a mid-round reopen
// through the edit control cancels the loop until the next handover's save has settled; a release
// resumes ONE chain with its clock reset; a context cut to 2D during a hold stays cut; and a device
// with no context takes its fallback at the handover.
//
// ponytail: the engine's real UIManager and GameState are not built here (no-3d-round.test.mjs and
// setup-held-for-players.test.mjs run those); this file stubs them to the members the boot, the mount
// and the handover touch. That the GPU really idles is the latency measurement's (gh#272 DoD).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { sliceBlock } from '../_dom-stub.mjs';
import { makePage, installStorage, settle } from '../_player-screen/screen-harness.mjs';
import crocBite from '../../games/croc-bite.ts';

const ps = await import('../_player-screen/player-screen.ts');

const here = import.meta.dirname;
const ENGINE = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const GLUE = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');
const MARKUP = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');
const QUIET = 401;

function region(source, from, to, label) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `${label} no longer contains ${from} -- this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${label} no longer contains ${to} after ${from}`);
  return source.slice(start, end);
}
const PHASES_SRC = region(ENGINE, 'const PHASES = {', 'class GameState ', 'main.js');
const APP_SRC = sliceBlock(ENGINE, 'class GameApp ');
assert.ok(APP_SRC, 'main.js no longer declares class GameApp -- this test is measuring nothing');
const BOOT_HEADER = "window.addEventListener('DOMContentLoaded', () =>";
const BOOT_BLOCK = sliceBlock(ENGINE, BOOT_HEADER);
assert.ok(BOOT_BLOCK, 'main.js no longer boots on DOMContentLoaded -- this test is measuring nothing');
const BOOT_BODY = BOOT_BLOCK.slice(BOOT_BLOCK.indexOf('{') + 1, -1);

/** Node's navigator has no locks: one whose grants this file releases by hand. */
function withLocks(t) {
  const queue = [];
  const real = globalThis.navigator;
  const request = (_name, fn) => new Promise((resolve) => { queue.push(() => resolve(fn())); });
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true, writable: true });
  t.after(() => Object.defineProperty(globalThis, 'navigator', { value: real, configurable: true, writable: true }));
  return queue;
}
async function grantAll(queue) {
  while (queue.length) {
    queue.shift()();
    await settle();
  }
}

/** The page's boot, run: main.js's own DOMContentLoaded body over the route markup. */
async function bootPage(t, { rendererThrows = false } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(ps.isRenderHeld(), false, 'precondition: a hold leaked out of the previous case');
  installStorage();
  const doc = makePage(MARKUP);
  globalThis.document = doc;
  const win = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = win;
  const locks = withLocks(t);

  const gpu = { scenes: 0, renders: 0, deltas: [] };
  // A clock on a time this file moves, so a held interval is visible to the first resumed frame.
  const time = { now: 0 };
  class Clock {
    constructor() { this.last = time.now; }
    getDelta() { const d = time.now - this.last; this.last = time.now; return d; }
  }
  class GameScene {
    constructor() {
      gpu.scenes += 1;
      if (rendererThrows) throw new Error('WEBGL_NOT_SUPPORTED');
      this.scene = {};
    }
    onResize() {}
    update() {}
    render() { gpu.renders += 1; }
  }
  class Component {
    constructor() { this.lookTarget = {}; }
    update() {}
    setupTeeth() {}
    resetAll() {}
    reset() {}
  }
  // Only the crocodile records its step, so one frame is one entry in gpu.deltas.
  class Crocodile extends Component {
    update(delta) { gpu.deltas.push(delta); }
  }
  class GameState {
    constructor() {
      Object.assign(this, { phase: 'SETUP', players: [], playerCount: 0, currentRound: 1, maxRounds: 3 });
      Object.assign(this, { audioEnabled: true, isPaused: false, reducedMotion: false, shakeEnabled: true });
    }
    on() { return () => {}; }
    setPlayerCount(n) { this.playerCount = n; this.players = Array.from({ length: n }, () => ({})); }
    updatePlayerName() {}
    returnToSetup() { this.phase = 'SETUP'; }
  }
  const notices = [];
  class UIManager {
    constructor() { this.elSetup = doc.getElementById('screen-setup'); }
    showWebGLError() { notices.push('no-3d'); }
    updateTeethDescription() {}
  }
  const frames = new Map();
  let nextId = 1;
  const raf = (fn) => { frames.set(nextId, fn); return nextId++; };
  const caf = (id) => { frames.delete(id); };
  /** One frame: every callback queued before it runs, once. */
  const runFrame = () => { const due = [...frames.values()]; frames.clear(); for (const fn of due) fn(); };

  // eslint-disable-next-line no-new-func -- executing main.js's own boot is the whole point.
  const GameApp = new Function(
    'document', 'window', 'THREE', 'GameState', 'UIManager', 'GameScene', 'Crocodile', 'PlayerHand',
    'InputHandler', 'audio', 'console', 'requestAnimationFrame', 'cancelAnimationFrame',
    'mountPlayerScreen', 'crocBite', 'EDIT_EVENT', 'isRenderHeld', 'onRenderHold',
    `${PHASES_SRC}\n${APP_SRC}\n${BOOT_BODY}\nreturn GameApp;`,
  )(
    doc, win, { Clock }, GameState, UIManager, GameScene, Crocodile, Component, Component,
    new Proxy({}, { get: () => () => {} }), { error() {}, warn() {}, log() {} }, raf, caf,
    ps.mountPlayerScreen, crocBite, ps.EDIT_EVENT, ps.isRenderHeld, ps.onRenderHold,
  );
  t.after(() => { GameApp.defer3D = false; });
  const app = win.__khengApp;
  assert.ok(app, 'the boot built no app -- this case measures nothing');
  // What main.ts's mount installs; recorded here rather than run (afterDeferredBoot has its own case).
  const afterBoots = [];
  app.after3DBoot = () => afterBoots.push(app.animationFrameId);
  const part = (name) => doc.getElementById('croc-players').querySelector(`[data-ps="${name}"]`);
  return { doc, app, gpu, time, frames, runFrame, locks, notices, afterBoots, part };
}

/** Lets the open land and its arm window pass. */
async function landOpen(t, page) {
  await settle();
  await grantAll(page.locks);
  await settle();
  t.mock.timers.tick(QUIET);
  assert.equal(page.doc.getElementById('croc-players').hidden, false, 'the player screen did not open');
}

/** Presses start with its save held at the lock; returns the grant. */
async function pressStart(page) {
  assert.equal(page.part('start').click(), true, 'start was not live -- this case presses nothing');
  await settle();
  assert.ok(page.locks.length > 0, 'the start save never reached the lock -- this case holds nothing');
  return () => grantAll(page.locks);
}

test('gh#272: the first 3D boot waits for the handover -- no scene, no frame, nothing queued while the screen is up', async (t) => {
  const page = await bootPage(t);
  assert.equal(ps.isRenderHeld(), true, 'the mount raised no hold -- this case measures nothing');
  assert.equal(page.app.render3D, 'deferred');
  assert.equal(page.gpu.scenes, 0, 'the scene was built before the player screen handed over');
  assert.equal(page.frames.size, 0, 'a frame was queued before the player screen handed over');
  await landOpen(t, page);
  page.runFrame();
  assert.equal(page.gpu.scenes + page.gpu.renders, 0, 'the open screen let the 3D boot or draw');
  const grant = await pressStart(page);
  assert.equal(page.gpu.scenes + page.gpu.renders, 0, 'the 3D booted while the start save was still waiting on the lock');
  await grant();
  assert.equal(ps.isRenderHeld(), false, 'precondition: the handover released the hold');
  assert.equal(page.gpu.scenes, 1, 'the handover did not boot the 3D');
  assert.equal(page.gpu.renders, 1, 'the boot did not draw its first frame');
  assert.equal(page.app.render3D, 'live');
  assert.deepEqual(page.afterBoots, [page.app.animationFrameId], 'main.ts was not told, once, that the deferred boot ran');
  assert.equal(page.frames.size, 1, 'the boot left other than one chain queued');
  assert.ok(!page.doc.getElementById('screen-setup').classList.contains('hidden'), 'the handover did not bring the setup screen up');
});

test('gh#272: a mid-round reopen cancels the loop until the next handover settles; the release resumes ONE chain, clock reset', async (t) => {
  const page = await bootPage(t);
  await landOpen(t, page);
  await (await pressStart(page))();
  page.runFrame();
  page.runFrame();
  assert.equal(page.gpu.renders, 3, 'precondition: the loop runs one frame per frame');

  page.app.state.phase = 'PLAYER_TURN';
  page.doc.dispatchEvent(new CustomEvent(ps.EDIT_EVENT));
  assert.equal(page.doc.getElementById('ps-edit-dialog').open, true, 'a live round did not ask first');
  assert.equal(page.frames.size, 1, 'the question alone stopped the round drawing');
  t.mock.timers.tick(QUIET);
  page.doc.getElementById('ps-edit-confirm').click();
  assert.equal(page.frames.size, 0, 'the reopen left a frame queued');
  const held = page.gpu.renders;
  page.time.now += 10;
  await landOpen(t, page);
  page.runFrame();
  const grant = await pressStart(page);
  page.runFrame();
  assert.equal(page.gpu.renders, held, 'a frame was drawn while the reopened screen was up or its save was waiting');
  await grant();
  assert.equal(page.frames.size, 1, 'the release did not queue exactly one chain');
  assert.equal(page.gpu.renders, held, 'the release drew inside the handover instead of on the next frame');
  page.runFrame();
  page.runFrame();
  page.runFrame();
  assert.equal(page.gpu.renders, held + 3, 'the resumed loop draws other than one frame per frame -- a duplicate chain');
  assert.equal(page.frames.size, 1);
  assert.equal(page.gpu.deltas.at(-3), 0, 'the first resumed frame stepped the scene by the time it was held');
  assert.equal(page.gpu.scenes, 1, 'the release built the scene again');
});

test('gh#272: a context cut to 2D during a hold stays cut when the hold releases', async (t) => {
  const page = await bootPage(t);
  await landOpen(t, page);
  await (await pressStart(page))();
  page.doc.dispatchEvent(new CustomEvent(ps.EDIT_EVENT));
  assert.equal(ps.isRenderHeld(), true);
  // main.ts's own cutTo2D, run over an app whose container is already gone: the loop half of the cut.
  const code = stripTypeScriptTypes(region(GLUE, '// ---- the no-3D board', '// ---- mount', 'main.ts'), { mode: 'strip' });
  // eslint-disable-next-line no-new-func -- executing main.ts's own text is the whole point.
  const { cutTo2D } = new Function('document', 'window', 'cancelAnimationFrame', 'armAllButtons', '$', 'MutationObserver',
    `${code}\n;return { cutTo2D };`)(page.doc, {}, () => {}, () => () => {}, () => null, undefined);
  cutTo2D(page.app);
  const renders = page.gpu.renders;
  await landOpen(t, page);
  await (await pressStart(page))();
  assert.equal(ps.isRenderHeld(), false, 'precondition: the hold released');
  page.runFrame();
  assert.equal(page.frames.size, 0, 'the release queued a frame on a context the route cut to 2D');
  assert.equal(page.gpu.renders, renders, 'the release resurrected the lost renderer');
});

test('gh#272: with no context, the deferred boot fails at the handover and hands main.ts the fallback', async (t) => {
  const page = await bootPage(t, { rendererThrows: true });
  await landOpen(t, page);
  assert.equal(page.gpu.scenes, 0);
  await (await pressStart(page))();
  assert.equal(page.gpu.scenes, 1, 'the handover never tried the 3D boot');
  assert.deepEqual(page.notices, ['no-3d'], 'the failed boot did not raise the engine notice');
  assert.equal(page.app.render3D, 'off');
  assert.deepEqual(page.afterBoots, [null], 'main.ts was not told the deferred boot failed');
  page.doc.dispatchEvent(new CustomEvent(ps.EDIT_EVENT));
  await landOpen(t, page);
  await (await pressStart(page))();
  assert.equal(page.frames.size, 0, 'a release queued a frame with no renderer at all');
});

// ---- main.ts: a deferred boot is not a failed one -------------------------------------------------

test('gh#272: main.ts reads a DEFERRED boot as neither failed nor live; its outcome is handled when it runs', () => {
  const mountBody = region(GLUE, 'function mount(): void', "// WINDOW's DOMContentLoaded", 'main.ts');
  const condition = /\n\s*if \((.+)\) bootWithout3D\(app\);/.exec(mountBody)?.[1];
  assert.ok(condition, 'mount no longer enters the fallback from a single-line condition');
  // eslint-disable-next-line no-new-func -- evaluating main.ts's own condition is the whole point.
  const needsFallback = new Function('app', `return (${condition});`);
  assert.equal(needsFallback({ animationFrameId: null, render3D: 'deferred' }), false,
    'a boot deferred to the handover is read as a FAILED boot: the healthy route takes the 2D fallback');
  assert.equal(needsFallback({ animationFrameId: null, render3D: 'off' }), true, 'a failed boot no longer takes the fallback');
  assert.equal(needsFallback({ animationFrameId: 7, render3D: 'live' }), false);
  assert.match(mountBody, /app\.after3DBoot = \(\): void => afterDeferredBoot\(app\);/, 'mount no longer hands main.js the deferred outcome');

  const after = sliceBlock(GLUE, 'function afterDeferredBoot(app: KhengApp): void');
  assert.ok(after, 'main.ts no longer declares afterDeferredBoot');
  const calls = [];
  // eslint-disable-next-line no-new-func -- executing main.ts's own text is the whole point.
  const run = new Function('bootWithout3D', 'watchContextLoss', `${stripTypeScriptTypes(after, { mode: 'strip' })}\nreturn afterDeferredBoot;`)(
    () => calls.push('fallback'), () => calls.push('watch'));
  run({ animationFrameId: null });
  run({ animationFrameId: 3 });
  assert.deepEqual(calls, ['fallback', 'watch'], 'a deferred boot that failed did not take the fallback, or a live one is not watched for loss');
});
