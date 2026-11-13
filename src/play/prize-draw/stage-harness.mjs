// Test-only harness for the prize-draw projector route: mounts stage.ts on the prize fake DOM over an
// in-memory browser origin (src/prize-event/fake-idb.mjs: IndexedDB, BroadcastChannel, localStorage), so the
// route's tests drive the real walk, the real store, the real arm gate and the real 2D reveal.
//
// The store is asynchronous: a press, a mount or a setup start changes the screen only once its transaction
// has answered. On an auto origin (the default) `await origin.idle()` lets everything finish; a manual
// origin runs one IndexedDB task per origin.step(), which is how a test interleaves two tabs.
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { fakeOrigin } from '../../prize-event/fake-idb.mjs';
import { mountStage } from './stage.ts';
import { createEvent, encodeEvent } from '../../prize-event/event.ts';
import { DB, REFUSED_BROWSER, openEventStore } from '../../prize-event/store.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { CONFIRM_REPLACE, mountSetup } from '../../prize-event/setup-page.ts';

export { CONFIRM_REPLACE, DB, REFUSED_BROWSER, fakeOrigin };

export function seeded(seed) {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    int: (n) => Math.floor(float() * n),
    hex: (bytes) => Array.from({ length: bytes }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join(''),
  };
}

export const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
export const tick = () => new Promise((resolve) => setImmediate(resolve));

/** The stored event's text on `origin`, or undefined when none is stored. */
export const storedRaw = (origin) => origin.get(DB.name, DB.store, DB.key);
/** Committed data put straight into the store: a profile that already holds it, or a write from outside
 *  this code (another script on the origin, devtools), which announces nothing to any tab. */
export const seedRaw = (origin, raw) => origin.put(DB.name, DB.version, DB.store, DB.key, raw);
/** Committed writes of the event record, in order: { by, before, after }. */
export const eventWrites = (origin) => origin.log.filter((w) => w.db === DB.name && w.key === DB.key);

export function makeEvent({ n = 50, prizes = ['TV', 'Bike'], rng = seeded(1), list } = {}) {
  return createEvent({ eventName: 'Party 2570', names: list ?? names(n), schedule: proposeSchedule(n), prizes }, rng);
}

export function storedEvent(origin, opts) {
  const ev = makeEvent(opts);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

/** A manual origin: run every queued task, draining promise continuations between them. */
export async function settle(origin) {
  for (;;) {
    await tick();
    if (!origin.step()) {
      await tick();
      if (!origin.tasks.length) return;
    }
  }
}

/** What a projector gets from its tab (the one place the route meets the browser's storage). */
export const stageDeps = (env) => ({ store: openEventStore(env) });
/** What the setup page gets as its window. */
export const setupWin = (env, rest) => ({ ...env, ...rest });

/**
 * Mounts the projector on `env` (a tab of `origin`; a plain object for a browser without IndexedDB) and
 * returns at once; nothing is on screen until the store has opened and been read.
 */
export function mountNow({ origin, env = origin.tab('A'), rng = seeded(2), reducedMotion = false, doc = makeDoc(), reload }) {
  const root = doc.createElement('div');
  root.id = 'app';
  const live = doc.createElement('p');
  live.id = 'pd-live';
  doc.body.append(live, root);
  const frames = [];
  const stage = mountStage({ doc, root, live, rng, reducedMotion, nextFrame: (cb) => frames.push(cb), reload, ...stageDeps(env) });
  const frame = doc.getElementById('pd-frame');
  const notice = root.querySelector('.pd-notice');
  const go = () => root.querySelector('.pd-mc').querySelector('button');
  return { doc, root, live, stage, frame, notice, go, frames, env, deliver: () => env.deliver?.() };
}

/** mountNow on an auto origin, once the first screen is up. */
export async function mount(opts) {
  const s = mountNow(opts);
  await opts.origin.idle();
  return s;
}

/** The MC's tap on the mounted button, past its arm window (the gate is tested in arm-reveal-paths). */
export function press(s) {
  const b = s.go();
  if (!b) return false;
  b.disabled = false;
  b.click();
  return true;
}

/**
 * The real setup page (src/prize-event/setup-page.ts) on the prize fake DOM, filled with a valid roster, so a
 * test replaces the stored event the way the MC does. `confirm` answers the replace question; every question
 * asked is recorded in `asked`.
 */
export function mountSetupPage({ origin, env = origin.tab('setup'), confirm = () => true, title = 'Replacement', n = 9 } = {}) {
  const doc = makeDoc();
  const add = (tag, id, parent = doc.body) => {
    const el = doc.createElement(tag);
    el.id = id;
    parent.append(el);
    return el;
  };
  const form = add('form', 'pd-setup');
  form.setAttribute('data-play', '/game/prize-draw/play/');
  add('input', 'pd-event', form);
  const box = add('textarea', 'pd-names', form);
  for (const id of ['pd-count', 'pd-names-msg', 'pd-s0', 'pd-l0', 'pd-l1', 'pd-l2', 'pd-l3', 'pd-sched-msg', 'pd-prize-count', 'pd-start-msg']) add('div', id, form);
  for (const id of ['pd-s1', 'pd-s2', 'pd-s3']) add('input', id, form);
  for (const id of ['pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus']) add('button', id, form);
  for (let i = 1; i <= 5; i++) {
    const row = add('div', `row${i}`, form);
    row.setAttribute('data-prize-row', String(i));
    add('input', `pd-prize-${i}`, row);
  }
  const visits = [];
  const asked = [];
  const win = setupWin(env, {
    location: { assign: (u) => visits.push(u) },
    confirm: (q) => (asked.push(q), confirm(q)),
  });
  mountSetup(doc, win);
  doc.getElementById('pd-event').value = title;
  box.value = names(n).join('\n');
  box.dispatch('input');
  return { doc, visits, asked, submit: () => form.dispatch('submit'), message: () => doc.getElementById('pd-start-msg').textContent };
}
