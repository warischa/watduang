// gh#272: the render hold the shared player screen raises. On a slow device a WebGL route that keeps
// drawing behind this screen starves the roster lock's grant, so the migration at mount and every
// save the screen starts wait seconds for a callback. The screen therefore holds rendering, and each
// WebGL route's adapter stops drawing while it is held (owner ruling 2026-10-17: a frozen background
// is acceptable).
//
// This file pins the SIGNAL's state machine on the real screen over the real template, with a lock
// stub this file controls so every write can be held mid-flight:
//   - held from BEFORE the migration's first lock request, at mount, before any open;
//   - held through the pending open and the open screen, on the first open AND on every reopen the
//     edit control makes mid-round;
//   - held until every roster write the screen started has settled AND the screen has closed or
//     handed over -- a removal committed by the close itself included;
//   - one mount's release never ends another mount's hold, and a failed open leaks no hold.
// The adapters that read it are pinned per route (croc-bite, one-bomb, pinocchio-luck).
//
// ponytail: node, not a browser. What the signal says is proven here; that a held route really
// stops the GPU, and how long a grant then takes, is the latency measurement's (gh#272 DoD).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage, installStorage, settle } from './screen-harness.mjs';

const ps = await import('./player-screen.ts');
const store = await import('../../shell/roster.ts');

const SURFACE = '<div id="app"><section id="root" hidden></section></div>';
const LEGACY_KEY = ps.LEGACY_LISTS[0].key;
const QUIET = 401;

/** Node's navigator has no locks: install one whose grants this file releases by hand. Each request
 *  records whether rendering was held at the moment it was made. */
function withLocks(t) {
  const queue = [];
  const real = globalThis.navigator;
  const request = (_name, fn) => new Promise((resolve) => {
    queue.push({ heldAtRequest: ps.isRenderHeld(), grant: () => resolve(fn()) });
  });
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true, writable: true });
  t.after(() => Object.defineProperty(globalThis, 'navigator', { value: real, configurable: true, writable: true }));
  return queue;
}

/** Grants every queued request, including any a granted one queues next. */
async function grantAll(queue) {
  while (queue.length) {
    queue.shift().grant();
    await settle();
  }
}

/** The real screen on a fresh page, a legacy list seeded so the migration really reaches the lock.
 *  The roster is seeded BEFORE the lock stub goes in, so seeding runs unlocked and queues nothing. */
async function mountScreen(t, { roster = [], onOpen, onStart, surface = SURFACE } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(ps.isRenderHeld(), false, 'precondition: a hold leaked out of the previous case');
  const storage = installStorage();
  for (const name of roster) await store.loadRoster().add(name);
  storage.set(LEGACY_KEY, 'not json');
  const doc = makePage(surface);
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const locks = withLocks(t);
  const live = { round: false, started: [], heldAtStart: [] };
  const root = doc.getElementById('root');
  const screen = ps.mountPlayerScreen({
    root,
    range: [2, 10],
    onStart: (players) => {
      live.started.push(players);
      live.heldAtStart.push(ps.isRenderHeld());
      return onStart?.(players);
    },
    roundActive: () => live.round,
    abortRound() {},
    onOpen,
  });
  // Subscribed after the mount, so it records every change from the mount's hold on.
  const seen = [];
  t.after(ps.onRenderHold((held) => seen.push(held)));
  const part = (name) => root.querySelector(`[data-ps="${name}"]`);
  return { doc, root, screen, locks, seen, live, part, byId: (id) => doc.getElementById(id) };
}

/** Opens the screen and lets its migration and its arm window both finish. */
async function openFully(t, page) {
  const opening = page.screen.open();
  await grantAll(page.locks);
  await opening;
  t.mock.timers.tick(QUIET);
}

/** Presses start with its save held at the lock; returns the grant. */
async function startHeld(page) {
  assert.equal(page.part('start').click(), true, 'start was not live -- this case presses nothing');
  await settle();
  assert.ok(page.locks.length > 0, 'the start save never reached the lock -- this case holds nothing');
  return () => grantAll(page.locks);
}

test('gh#272: rendering is held from BEFORE the migration asks for the lock, at mount, before any open', async (t) => {
  const page = await mountScreen(t);
  assert.equal(ps.isRenderHeld(), true, 'the mount started its migration with rendering still running');
  assert.ok(page.locks.length > 0, 'the migration never reached the lock -- this case measures nothing');
  assert.deepEqual(page.locks.map((r) => r.heldAtRequest), page.locks.map(() => true),
    'a migration lock request was made while rendering was still running');
  await openFully(t, page);
  assert.equal(page.root.hidden, false, 'the screen did not open');
  assert.equal(ps.isRenderHeld(), true, 'the open screen let rendering run');
  const grant = await startHeld(page);
  await grant();
  assert.equal(ps.isRenderHeld(), false, 'the handover left rendering held');
});

test('gh#272: first open -- held through the pending open, the open screen and the start save; released once, at handover', async (t) => {
  const page = await mountScreen(t);
  const opening = page.screen.open();
  await settle();
  assert.equal(ps.isRenderHeld(), true, 'rendering ran while the open was still waiting on its migration');
  await grantAll(page.locks);
  await opening;
  t.mock.timers.tick(QUIET);
  assert.equal(ps.isRenderHeld(), true);
  const grant = await startHeld(page);
  assert.equal(ps.isRenderHeld(), true, 'rendering ran while the start save was waiting on the lock');
  assert.equal(page.live.started.length, 0, 'the players were handed over before the save settled');
  await grant();
  assert.equal(page.live.started.length, 1, 'the save settled and nobody was handed over');
  assert.deepEqual(page.live.heldAtStart, [false], 'the route was handed its players with rendering still held');
  assert.deepEqual(page.seen, [false], 'the hold changed more than once after mount, or repeated a value');
});

test('gh#272: a mid-round reopen through the edit control holds again, from the confirm until the next handover', async (t) => {
  const page = await mountScreen(t);
  await openFully(t, page);
  await (await startHeld(page))();
  assert.equal(ps.isRenderHeld(), false, 'precondition: the first handover released the hold');

  page.live.round = true;
  page.doc.dispatchEvent(new CustomEvent(ps.EDIT_EVENT));
  assert.equal(page.byId('ps-edit-dialog').open, true, 'a live round did not ask first');
  assert.equal(ps.isRenderHeld(), false, 'the question alone held rendering -- cancel would leave the round frozen for nothing');
  t.mock.timers.tick(QUIET);
  page.byId('ps-edit-confirm').click();
  assert.equal(ps.isRenderHeld(), true, 'the confirmed reopen let rendering run');
  await settle();
  assert.equal(page.root.hidden, false, 'the reopen did not open the screen');
  assert.equal(ps.isRenderHeld(), true, 'the reopened screen let rendering run');
  t.mock.timers.tick(QUIET);
  const grant = await startHeld(page);
  assert.equal(ps.isRenderHeld(), true, 'the second start save ran with rendering live');
  await grant();
  assert.equal(ps.isRenderHeld(), false, 'the second handover left rendering held');
  assert.deepEqual(page.seen, [false, true, false]);
});

test('gh#272: an edit with no live round reopens at once, and holds at once', async (t) => {
  const page = await mountScreen(t);
  await openFully(t, page);
  await (await startHeld(page))();
  page.doc.dispatchEvent(new CustomEvent(ps.EDIT_EVENT));
  assert.equal(ps.isRenderHeld(), true, 'the reopen with nothing to lose let rendering run');
  await settle();
  t.mock.timers.tick(QUIET);
  await (await startHeld(page))();
  assert.equal(ps.isRenderHeld(), false);
});

test('gh#272: a removal the close commits keeps rendering held until that write settles', async (t) => {
  const page = await mountScreen(t, { roster: ['A', 'B', 'C'] });
  await openFully(t, page);
  page.root.querySelectorAll('.ps-rm')[0].click();
  assert.equal(page.part('toast').hidden, false, 'the x did not put the undo bar up -- nothing is pending');
  assert.equal(page.locks.length, 0, 'the x wrote at once -- the close below commits nothing');
  page.screen.close();
  assert.equal(page.root.hidden, true, 'the close did not close');
  assert.ok(page.locks.length > 0, 'the close committed no removal -- this case measures nothing');
  assert.equal(ps.isRenderHeld(), true, 'rendering resumed while the removal was still waiting on the lock');
  await grantAll(page.locks);
  assert.equal(ps.isRenderHeld(), false, 'the removal settled and rendering stayed held');
  assert.deepEqual(store.loadRoster().names(), ['B', 'C'], 'the removal never landed');
});

test('gh#272: one screen releasing never ends another screen\'s hold; a later close does', async (t) => {
  const first = await mountScreen(t);
  const otherRoot = first.doc.createElement('section');
  otherRoot.setAttribute('id', 'second-root');
  first.doc.body.append(otherRoot);
  const second = ps.mountPlayerScreen({ root: otherRoot, range: [2, 10], onStart() {}, roundActive: () => false, abortRound() {} });
  const openingSecond = second.open();
  await openFully(t, first);
  await openingSecond;
  await (await startHeld(first))();
  assert.equal(first.live.started.length, 1, 'precondition: the first screen handed over');
  assert.equal(ps.isRenderHeld(), true, 'the first screen\'s handover released the hold the open second screen still has');
  second.close();
  assert.equal(ps.isRenderHeld(), false, 'both screens are closed and rendering is still held');
});

test('gh#272: an open that fails leaks no hold, and the failure stays loud', async (t) => {
  const page = await mountScreen(t, { onOpen: () => { throw new Error('route hook failed'); } });
  const failed = assert.rejects(page.screen.open(), /route hook failed/);
  await grantAll(page.locks);
  await failed;
  assert.equal(ps.isRenderHeld(), false, 'a failed open left rendering held for good');
});

test('gh#272: a late subscriber reads the current state; unsubscribing stops the calls; a throwing listener stops nobody', async (t) => {
  const thrown = [];
  const runner = process.listeners('uncaughtException');
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (e) => thrown.push(e.message));
  t.after(() => {
    process.removeAllListeners('uncaughtException');
    for (const l of runner) process.on('uncaughtException', l);
  });
  const bad = ps.onRenderHold(() => { throw new Error('listener failed'); });
  t.after(bad);
  const page = await mountScreen(t);
  assert.equal(ps.isRenderHeld(), true, 'a subscriber arriving after the mount cannot see the hold');
  const late = [];
  const stop = ps.onRenderHold((held) => late.push(held));
  stop();
  await openFully(t, page);
  await (await startHeld(page))();
  assert.deepEqual(late, [], 'an unsubscribed listener was still called');
  assert.equal(page.live.started.length, 1, 'a throwing listener stopped the handover');
  assert.deepEqual(page.seen, [false], 'a throwing listener stopped the listeners after it');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(thrown.includes('listener failed'), 'the listener\'s failure was swallowed');
});

// ---- what a probe in the page reads (gh#272 REFUTE round 1) -------------------------------------

const attr = (page, name) => page.doc.documentElement.getAttribute(name);

test('gh#272: <html> carries the hold on every change, from the same value isRenderHeld returns', async (t) => {
  const page = await mountScreen(t);
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'held', 'the mount held rendering and the page cannot see it');
  await openFully(t, page);
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'held');
  const grant = await startHeld(page);
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'held', 'the page reads free while the start save is still waiting');
  await grant();
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'the handover released the hold and the page still reads held');
  assert.equal(ps.isRenderHeld(), false);
});

test('gh#272: the handover is acknowledged only after onStart returns -- a throw leaves it unacknowledged', async (t) => {
  const page = await mountScreen(t);
  await openFully(t, page);
  await (await startHeld(page))();
  await settle();
  assert.equal(attr(page, ps.HANDOVER_ATTR), '1', 'a route that took its players was not acknowledged');
});

test('gh#272: an onStart that throws leaves the handover unacknowledged, and the failure stays loud', async (t) => {
  const failing = await mountScreen(t, { onStart: () => { throw new Error('engine refused the players'); } });
  await openFully(t, failing);
  const runner = process.listeners('unhandledRejection');
  const seen = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => seen.push(e.message));
  try {
    await (await startHeld(failing))();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (const l of runner) process.on('unhandledRejection', l);
  }
  assert.equal(failing.root.hidden, true, 'precondition: the screen closed before the route threw');
  assert.deepEqual(seen, ['engine refused the players'], 'the route failure was swallowed');
  assert.equal(attr(failing, ps.HANDOVER_ATTR), null, 'a route whose onStart threw was acknowledged as handed over');
});

test('gh#272: a route that returns a promise is acknowledged when it resolves, not before', async (t) => {
  let resolve;
  const page = await mountScreen(t, { onStart: () => new Promise((r) => { resolve = r; }) });
  await openFully(t, page);
  await (await startHeld(page))();
  await settle();
  assert.equal(attr(page, ps.HANDOVER_ATTR), null, 'acknowledged before the route finished taking its players');
  resolve();
  await settle();
  assert.equal(attr(page, ps.HANDOVER_ATTR), '1');
});

// ---- the release is a reveal (gh#269, ADR-0057) ---------------------------------------------------
//
// PlayerScreen.astro hides every `data-first-screen-root="gameplay"` root until the hold reads `free`,
// so the flip to `free` uncovers that gameplay. A route arms its gameplay inside onStart; when the
// release lands LATER than that arm window -- a removal the close commits keeps the hold until its
// write settles -- the reveal meets controls whose window expired long ago. The screen arms every
// gameplay root at the LATER of the flip and the route's handover settling, so no release path
// depends on its caller, and the route's own gate (built inside onStart, after an await or not) is
// always built before the release gate and keeps the controls the route disabled for its own reason.
//
// Every case that builds a release gate ticks its window out before it ends: a timer still pending
// at the end would be cancelled by the next case's release arm, under that case's mock clock.
//
// ponytail: this file imports the screen before any document exists, so the arm gate's input-stamp
// seed never attaches here; the gate's timer is the only guard these cases see, and `disabled` (a
// click on a disabled control dispatches nothing) is the observable they pin.

const { armAllButtons } = await import('../../games/_arm-gate.ts');

const GAMEPLAY_SURFACE = '<div id="app"><section id="root" hidden></section>'
  + '<section id="play" data-first-screen-root="gameplay">'
  + '<button id="go" type="button">go</button><button id="keep" type="button">keep</button>'
  + '</section></div>';

test('gh#269: a release that lands after the route armed its gameplay arms that gameplay again', async (t) => {
  let page;
  // The route's own arm, as every converted route's onStart makes it.
  page = await mountScreen(t, {
    roster: ['A', 'B', 'C'],
    surface: GAMEPLAY_SURFACE,
    onStart: () => { armAllButtons(page.byId('play')); },
  });
  await openFully(t, page);
  const go = page.byId('go');
  assert.equal(go.disabled, false, 'precondition: the gameplay control is live before start');
  assert.equal(page.part('start').click(), true, 'start was not live -- this case presses nothing');
  await settle();
  assert.equal(page.locks.length, 1, 'precondition: the start save is the one request at the lock');
  // An x pressed while the start save waits: the removal it leaves pending is what the close commits.
  page.root.querySelectorAll('.ps-rm')[0].click();
  assert.equal(page.part('toast').hidden, false, 'precondition: the x left no removal pending');
  page.locks.shift().grant();
  await settle();
  assert.equal(page.live.started.length, 1, 'the start save settled and nobody was handed over');
  assert.equal(page.locks.length, 1, 'the close committed no removal -- nothing delays the release');
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'held', 'precondition: the removal write keeps the gameplay hidden');
  t.mock.timers.tick(QUIET);
  assert.equal(go.disabled, false, 'precondition: the route\'s own window passed while the gameplay was still hidden');
  page.locks.shift().grant();
  await settle();
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the removal settled and the gameplay is still hidden');
  page.byId('play').dispatchEvent({ type: 'pointerdown', timeStamp: 1e6 });
  assert.equal(go.click(), false, 'the release uncovered a live gameplay control: a second contact on it acts');
  t.mock.timers.tick(QUIET);
  assert.equal(go.click(), true, 'the gameplay never came back once the window passed');
});

test('gh#269: the release arm leaves a control the route disabled at handover disabled', async (t) => {
  let page;
  page = await mountScreen(t, {
    surface: GAMEPLAY_SURFACE,
    onStart: () => {
      page.byId('keep').disabled = true; // the route's own reason, set before it arms
      armAllButtons(page.byId('play'));
    },
  });
  await openFully(t, page);
  await (await startHeld(page))();
  await settle();
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the handover released the hold');
  assert.equal(page.byId('go').disabled, true, 'precondition: the handover armed the gameplay');
  t.mock.timers.tick(QUIET);
  assert.equal(page.byId('go').disabled, false, 'the gameplay never came back once the window passed');
  assert.equal(page.byId('keep').disabled, true, 'a release arm handed back a control the route disabled for its own reason');
});

/** A promise this file resolves by hand, for an onStart that awaits something before its body. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** Runs `fn` with the runner's unhandled-rejection listeners swapped for a recorder (the technique
 *  of the throwing-onStart case above); returns the messages seen. */
async function recordRejections(fn) {
  const runner = process.listeners('unhandledRejection');
  const seen = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => seen.push(e.message));
  try {
    await fn();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (const l of runner) process.on('unhandledRejection', l);
  }
  return seen;
}

test('gh#269: an async onStart that disables a control after an await keeps it disabled through the release arm', async (t) => {
  let page;
  page = await mountScreen(t, {
    surface: GAMEPLAY_SURFACE,
    onStart: async () => {
      await Promise.resolve();
      page.byId('keep').disabled = true;
      armAllButtons(page.byId('play'));
    },
  });
  await openFully(t, page);
  await (await startHeld(page))();
  await settle();
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the handover released the hold');
  assert.equal(page.byId('go').disabled, true, 'precondition: the handover armed the gameplay');
  t.mock.timers.tick(QUIET);
  assert.equal(page.byId('go').disabled, false, 'the gameplay never came back once the window passed');
  assert.equal(page.byId('keep').disabled, true, 'the release arm ran before the async route took its players and handed its control back');
});

test('gh#269: a release that lands while onStart is still awaiting arms only once the route has taken its players', async (t) => {
  const gate = deferred();
  let page;
  page = await mountScreen(t, {
    surface: GAMEPLAY_SURFACE,
    onStart: async () => {
      await gate.promise;
      page.byId('keep').disabled = true;
      armAllButtons(page.byId('play'));
    },
  });
  await openFully(t, page);
  await (await startHeld(page))();
  await settle();
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the hold released while the route still awaits');
  assert.equal(attr(page, ps.HANDOVER_ATTR), null, 'precondition: the route has not taken its players yet');
  gate.resolve();
  await settle();
  assert.equal(attr(page, ps.HANDOVER_ATTR), '1', 'precondition: the route took its players');
  assert.equal(page.byId('go').disabled, true, 'precondition: the handover armed the gameplay');
  t.mock.timers.tick(QUIET);
  assert.equal(page.byId('go').disabled, false, 'the gameplay never came back once the window passed');
  assert.equal(page.byId('keep').disabled, true, 'a release arm built mid-await handed back the control the route disabled');
});

test('gh#269: a hold raised again before the handover settles waits for ITS release, not the earlier one', async (t) => {
  const gate = deferred();
  let page;
  page = await mountScreen(t, {
    surface: GAMEPLAY_SURFACE,
    onStart: async () => {
      await gate.promise;
      page.byId('keep').disabled = true;
      armAllButtons(page.byId('play'));
    },
  });
  await openFully(t, page);
  await (await startHeld(page))();
  await settle();
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the first release landed');
  // The hold comes back while the route still awaits. A second mount's migration raises it with no
  // surface arm of its own, which keeps this case about the release arm alone.
  globalThis.localStorage.setItem(LEGACY_KEY, 'not json');
  const otherRoot = page.doc.createElement('section');
  page.doc.body.append(otherRoot);
  ps.mountPlayerScreen({ root: otherRoot, range: [2, 10], onStart() {}, roundActive: () => false, abortRound() {} });
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'held', 'precondition: the second mount held again');
  assert.ok(page.locks.length > 0, 'precondition: the second migration waits at the lock');
  gate.resolve();
  await settle();
  assert.equal(attr(page, ps.HANDOVER_ATTR), '1', 'precondition: the route took its players under the new hold');
  await grantAll(page.locks);
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the second hold released');
  assert.equal(page.byId('go').disabled, true, 'the later release armed nothing');
  t.mock.timers.tick(QUIET);
  assert.equal(page.byId('go').disabled, false, 'the gameplay never came back once the window passed');
  assert.equal(page.byId('keep').disabled, true, 'the first release armed before the route took its players and handed its control back');
});

test('gh#269: an onStart that throws still lets the release arm run -- and the throw stays loud', async (t) => {
  const page = await mountScreen(t, {
    surface: GAMEPLAY_SURFACE,
    onStart: () => { throw new Error('engine refused the players'); },
  });
  await openFully(t, page);
  const seen = await recordRejections(async () => { await (await startHeld(page))(); });
  assert.deepEqual(seen, ['engine refused the players'], 'the route failure was swallowed or reported twice');
  assert.equal(attr(page, ps.RENDER_HOLD_ATTR), 'free', 'precondition: the close released the hold');
  assert.equal(attr(page, ps.HANDOVER_ATTR), null, 'a route whose onStart threw was acknowledged as handed over');
  assert.equal(page.byId('go').disabled, true, 'the release arm waited on a handover that threw -- later release deferred forever');
  t.mock.timers.tick(QUIET);
  assert.equal(page.byId('go').disabled, false, 'the gameplay never came back once the window passed');
});

test('gh#269: an onStart whose promise rejects still lets the release arm run -- and the rejection stays loud', async (t) => {
  const page = await mountScreen(t, {
    surface: GAMEPLAY_SURFACE,
    onStart: async () => { throw new Error('engine refused later'); },
  });
  await openFully(t, page);
  const seen = await recordRejections(async () => { await (await startHeld(page))(); });
  assert.deepEqual(seen, ['engine refused later'], 'the route failure was swallowed or reported twice');
  assert.equal(attr(page, ps.HANDOVER_ATTR), null, 'a route whose onStart rejected was acknowledged as handed over');
  assert.equal(page.byId('go').disabled, true, 'the release arm waited on a handover that rejected -- later release deferred forever');
  t.mock.timers.tick(QUIET);
  assert.equal(page.byId('go').disabled, false, 'the gameplay never came back once the window passed');
});
