// Test-only harness for the prize-draw projector route: mounts stage.ts on the prize fake DOM with an
// in-memory storage, so the route's tests drive the real walk, the real arm gate and the real 2D reveal.
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { mountStage } from './stage.ts';
import { STORAGE_KEY, createEvent } from '../../prize-event/event.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { mountSetup } from '../../prize-event/setup-page.ts';

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

export function memoryStorage({ failWrites = false } = {}) {
  const map = new Map();
  return {
    map,
    failWrites,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (this.failWrites) throw new Error('quota');
      map.set(k, String(v));
    },
  };
}

export const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

export function storedEvent(storage, { n = 50, prizes = ['TV', 'Bike'], rng = seeded(1), list } = {}) {
  const ev = createEvent({ eventName: 'Party 2570', names: list ?? names(n), schedule: proposeSchedule(n), prizes }, rng);
  storage.map.set(STORAGE_KEY, JSON.stringify(ev));
  return ev;
}

/**
 * Mounts the projector. `locks` defaults to one lock manager shared by every default mount, as a browser's is,
 * that grants at once (grantingLocks): the screen fails closed without one, so a test that passes nothing would
 * otherwise measure the cold screen. Pass `locks: null` for a browser without Web Locks.
 */
export function mount({ storage, rng = seeded(2), reducedMotion = false, locks, onStorage, doc = makeDoc() } = {}) {
  if (locks === undefined) locks = BROWSER_LOCKS;
  const root = doc.createElement('div');
  root.id = 'app';
  const live = doc.createElement('p');
  live.id = 'pd-live';
  doc.body.append(live, root);
  const frames = [];
  const stage = mountStage({ doc, root, live, storage, rng, reducedMotion, locks, onStorage, nextFrame: (cb) => frames.push(cb) });
  const frame = doc.getElementById('pd-frame');
  const notice = root.querySelector('.pd-notice');
  const go = () => root.querySelector('.pd-mc').querySelector('button');
  return { doc, root, live, stage, frame, notice, go, frames };
}

/**
 * Two or more tabs on one origin: one shared map behind a Storage object per tab, the way a browser gives
 * each tab its own localStorage onto the same data. Every write is logged with the tab that made it and
 * the value it replaced, and queues a storage event for every OTHER tab; a test delivers those when it
 * chooses, since a real browser delivers them later and in no promised order.
 */
export function sharedStorage() {
  const map = new Map();
  const writes = [];
  const listeners = new Map();
  const pending = new Map();
  /** Runs inside a tab's getItem or setItem before it touches the map: lets a test interleave there. */
  let hook = null;
  const tab = (name) => {
    pending.set(name, []);
    return {
      storage: {
        getItem(k) {
          hook?.('get', name);
          return map.has(k) ? map.get(k) : null;
        },
        setItem(k, v) {
          hook?.('set', name);
          writes.push({ by: name, key: k, before: map.has(k) ? map.get(k) : null, raw: String(v) });
          map.set(k, String(v));
          for (const [other, queue] of pending) if (other !== name) queue.push(k);
        },
      },
      onStorage: (cb) => listeners.set(name, cb),
      deliver() {
        const queue = pending.get(name).splice(0);
        for (const k of queue) listeners.get(name)?.(k);
      },
    };
  };
  return {
    map,
    writes,
    tab,
    setHook: (fn) => (hook = fn),
    /** A raw write from outside this project's code (another script on the origin, devtools), which takes no
     *  lock: every tab gets an event. The setup page is never simulated with this; drive mountSetupPage. */
    put(k, v) {
      map.set(k, String(v));
      for (const queue of pending.values()) queue.push(k);
    },
  };
}

/**
 * Web Locks, as far as the stage uses them: request(name, cb) runs cb once the lock is granted, and only
 * one callback runs at a time. Real grants are never synchronous, so this fake never grants on its own:
 * requests queue until the test calls grant(), which is how a test interleaves two tabs at the lock.
 * One instance is shared by every tab, as the browser's lock manager is.
 */
export function fakeLocks() {
  const queue = [];
  const request = (by) => (name, cb) =>
    new Promise((resolve, reject) => {
      queue.push({
        name,
        by,
        run() {
          try {
            resolve(cb({ name, mode: 'exclusive' }));
          } catch (err) {
            reject(err);
          }
        },
      });
    });
  return {
    queue,
    request: request(null),
    /** The same manager, with every request this view makes tagged `by` in the queue. */
    as: (by) => ({ request: request(by) }),
    grant() {
      const next = queue.shift();
      if (next) next.run();
      return Boolean(next);
    },
  };
}

/**
 * A lock manager with no other holder: a request is granted at once, inside request(), so a single-screen
 * test reads its result right after the click. Still exclusive: a request made while a callback runs waits
 * until that callback has returned.
 */
export function grantingLocks() {
  let held = false;
  const waiting = [];
  const run = (name, cb) => {
    held = true;
    try {
      return cb({ name, mode: 'exclusive' });
    } finally {
      held = false;
      waiting.shift()?.();
    }
  };
  return {
    requests: 0,
    request(name, cb) {
      this.requests++;
      if (!held) {
        try {
          return Promise.resolve(run(name, cb));
        } catch (err) {
          return Promise.reject(err);
        }
      }
      return new Promise((resolve, reject) =>
        waiting.push(() => {
          try {
            resolve(run(name, cb));
          } catch (err) {
            reject(err);
          }
        }),
      );
    },
  };
}

/**
 * The real setup page (src/prize-event/setup-page.ts) on the prize fake DOM, filled with a valid roster, so a
 * test replaces the stored event the way the MC does. `locks` reaches the page as `navigator.locks`, the way
 * the browser's window hands it over; leave it out for a browser without Web Locks.
 */
const BROWSER_LOCKS = grantingLocks();

export function mountSetupPage({ storage, locks, title = 'Replacement', n = 9 } = {}) {
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
  mountSetup(doc, { localStorage: storage, location: { assign: (u) => visits.push(u) }, ...(locks ? { navigator: { locks } } : {}) });
  doc.getElementById('pd-event').value = title;
  box.value = names(n).join('\n');
  box.dispatch('input');
  return { doc, visits, submit: () => form.dispatch('submit'), message: () => doc.getElementById('pd-start-msg').textContent };
}
