// node --test — the prize-draw setup page script on the prize fake DOM: the setup screen's hostile-name
// case (its name sink is the error list), schedule validation as the MC sees it, and the start contract
// (store first, then open the projector route; nothing stored means no navigation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from './fake-dom.mjs';
import { STORAGE_KEY, decodeEvent } from './event.ts';
import { STORAGE_FAILED, mountSetup } from './setup-page.ts';
import { nameIssue, parseRoster } from './names.ts';
import { fakeLocks, grantingLocks } from '../play/prize-draw/stage-harness.mjs';

const PAGE = fs.readFileSync(path.join(import.meta.dirname, '../pages/game/prize-draw/index.astro'), 'utf8');

/** The setup page on the fake DOM. `locks` reaches it as `navigator.locks`, as the browser's window hands it
 *  over: one that grants at once by default; null for a browser without Web Locks. */
function page({ failStore = false, locks = grantingLocks() } = {}) {
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
  add('textarea', 'pd-names', form);
  for (const id of ['pd-count', 'pd-names-msg', 'pd-s0', 'pd-l0', 'pd-l1', 'pd-l2', 'pd-l3', 'pd-sched-msg', 'pd-prize-count', 'pd-start-msg']) add('div', id, form);
  for (const id of ['pd-s1', 'pd-s2', 'pd-s3']) add('input', id, form);
  for (const id of ['pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus']) add('button', id, form);
  for (let i = 1; i <= 5; i++) {
    const row = doc.createElement('div');
    row.setAttribute('data-prize-row', String(i));
    form.append(row);
    add('input', `pd-prize-${i}`, row);
  }
  const store = new Map();
  const visits = [];
  const win = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        if (failStore) throw new Error('denied');
        store.set(k, v);
      },
    },
    location: { assign: (u) => visits.push(u) },
    ...(locks ? { navigator: { locks } } : {}),
  };
  mountSetup(doc, win);
  const $ = (id) => doc.getElementById(id);
  const type = (id, value) => {
    $(id).value = value;
    $(id).dispatch('input');
  };
  const submit = () => form.dispatch('submit');
  return { doc, $, type, submit, store, visits };
}

const roster = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

test('every element the script needs is in the page', () => {
  for (const id of ['pd-setup', 'pd-event', 'pd-names', 'pd-count', 'pd-names-msg', 'pd-s0', 'pd-sched-msg', 'pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus', 'pd-prize-count', 'pd-start-msg']) {
    assert.ok(PAGE.includes(`id="${id}"`), `#${id} is not in index.astro`);
  }
  assert.ok(PAGE.includes('id={`pd-s${i}`}') && PAGE.includes('id={`pd-l${i}`}') && PAGE.includes('id={`pd-prize-${i}`}'));
});

test('setup screen, hostile names: each is listed in the error rows as its own text, never parsed, and blocks the start', () => {
  const p = page();
  const hostile = Object.values(HOSTILE);
  p.type('pd-names', [...roster(49), ...hostile].join('\n'));
  const shown = p.$('pd-names-msg').querySelectorAll('span.emsg-name').map((s) => s.textContent);
  assert.deepEqual(shown, hostile, 'each refused name is listed exactly as typed');
  assert.ok(p.$('pd-names-msg').querySelectorAll('span.emsg-name').every((s) => s.getAttribute('dir') === 'auto'));
  assert.deepEqual(p.doc.htmlWrites, []);
  // The page's own form is the one FORM; nothing a name produced may be an element of an active kind.
  assert.deepEqual(p.$('pd-names-msg').all().filter((el) => ACTIVE_TAGS.includes(el.tagName)).map((el) => el.tagName), []);
  p.submit();
  assert.equal(p.store.size, 0, 'an event with refused names was stored');
  assert.deepEqual(p.visits, []);
});

test('a duplicate (case and spaces folded) is listed and blocks the start', () => {
  const p = page();
  p.type('pd-names', [...roster(50), 'p 1'].join('\n'));
  assert.deepEqual(p.$('pd-names-msg').querySelectorAll('span.emsg-name').map((s) => s.textContent), ['p 1']);
  p.submit();
  assert.equal(p.store.size, 0);
});

// The owner-approved refusal copy (gh#304 evidence README, approved 2026-11-11), one per reason code of
// checkName plus a taken name. Literals on purpose: this pins the approved wording, not the constant.
const WHY = {
  charset: ['A<b>', "ใช้ได้เฉพาะตัวอักษรไทย อังกฤษ ตัวเลข เว้นวรรค และ . - ' _"],
  emoji: ['\u{1F600}', 'ชื่อใส่อีโมจิไม่ได้'],
  'too-long': ['W'.repeat(13), 'ชื่อยาวเกิน 12 ตัว'],
  'stacked-marks': ['ก่่', 'สระหรือวรรณยุกต์ซ้อนกันเกินไป'],
  'leading-mark': ['ิก', 'สระหรือวรรณยุกต์ต้องตามหลังพยัญชนะ'],
  control: ['Ab\u0007c', 'ชื่อนี้มีตัวอักษรที่มองไม่เห็น ลบแล้วพิมพ์ใหม่'],
  'lone-surrogate': ['Ab\uD800', 'ชื่อนี้มีตัวอักษรที่อ่านไม่ได้'],
};
const TAKEN = 'ชื่อนี้ซ้ำกับชื่อที่มีแล้ว';

const rows = (p) =>
  p.$('pd-names-msg').querySelectorAll('div.emsg').map((r) => ({
    name: r.querySelectorAll('span.emsg-name').map((s) => s.textContent),
    why: r.querySelectorAll('span.emsg-why').map((s) => s.textContent),
  }));

test('each refusal reason shows its approved message beside the refused name', () => {
  for (const [reason, [input, copy]] of Object.entries(WHY)) {
    assert.equal(nameIssue(input), reason, `fixture for ${reason} no longer refuses for that reason`);
    const p = page();
    p.type('pd-names', [...roster(20), input].join('\n'));
    assert.deepEqual(rows(p), [{ name: [parseRoster(input).refused[0].name], why: [copy] }], reason);
  }
  const p = page();
  p.type('pd-names', [...roster(20), ' p  2 '].join('\n'));
  assert.deepEqual(rows(p), [{ name: ['p 2'], why: [TAKEN] }], 'taken');
});

test('hostile names: the message is the fixed copy for the reason and never carries the name', () => {
  const p = page();
  const hostile = Object.values(HOSTILE);
  p.type('pd-names', [...roster(20), ...hostile].join('\n'));
  const got = rows(p);
  assert.equal(got.length, hostile.length);
  got.forEach((row, i) => {
    const copy = WHY[nameIssue(hostile[i])]?.[1];
    assert.ok(copy, `no approved copy for ${nameIssue(hostile[i])}`);
    assert.deepEqual(row.why, [copy]);
    assert.ok(!row.why[0].includes(hostile[i]) && !row.why[0].includes('<'), 'the message echoes the name');
  });
  assert.deepEqual(p.doc.htmlWrites, []);
  assert.deepEqual(p.$('pd-names-msg').all().filter((el) => ACTIVE_TAGS.includes(el.tagName)).map((el) => el.tagName), []);
});

test('head count outside 9..200: the approved range message shows, and only then', () => {
  const RANGE = 'ใส่ได้ 9 ถึง 200 ชื่อ';
  const msg = (p) => p.$('pd-names-msg').querySelectorAll('div.emsg').map((r) => r.textContent);
  for (const n of [8, 201]) {
    const p = page();
    p.type('pd-names', roster(n).join('\n'));
    assert.deepEqual(msg(p), [RANGE], `n=${n}`);
  }
  for (const n of [9, 200]) {
    const p = page();
    p.type('pd-names', roster(n).join('\n'));
    assert.deepEqual(msg(p), [], `n=${n}`);
  }
  const empty = page();
  assert.deepEqual(msg(empty), [], 'an untouched empty list is not an error yet');
  empty.submit();
  assert.deepEqual(msg(empty), [RANGE], 'a start with no names says why');
  assert.ok(empty.$('pd-count').classList.contains('err'));
});

test('the prize stepper buttons carry the approved aria-labels', () => {
  assert.match(PAGE, /<button id="pd-prize-minus"[^>]*\saria-label="ลดจำนวนรางวัล"/);
  assert.match(PAGE, /<button id="pd-prize-plus"[^>]*\saria-label="เพิ่มจำนวนรางวัล"/);
});

test('the schedule is proposed from the head count and an edit that does not shrink shows the board sentence', () => {
  const p = page();
  p.type('pd-names', roster(200).join('\n'));
  assert.deepEqual(['pd-s1', 'pd-s2', 'pd-s3'].map((id) => p.$(id).value), ['100', '50', '20']);
  p.type('pd-s2', '120');
  assert.equal(p.$('pd-sched-msg').textContent, 'หลังรอบ 2 ต้องน้อยกว่าหลังรอบ 1 (100 คน)');
  assert.ok(p.$('pd-s2').classList.contains('err'));
  p.submit();
  assert.equal(p.$('pd-start-msg').textContent, 'แก้ตารางคัดออกก่อน แล้วจึงเริ่มงานได้');
  assert.equal(p.store.size, 0);
  p.$('pd-sched-reset').dispatch('click');
  assert.equal(p.$('pd-s2').value, '50');
  assert.equal(p.$('pd-sched-msg').textContent, '');
});

test('head count outside 9..200: the count is marked and the start refused', () => {
  for (const n of [8, 201]) {
    const p = page();
    p.type('pd-names', roster(n).join('\n'));
    assert.ok(p.$('pd-count').classList.contains('err'), `n=${n}`);
    p.submit();
    assert.equal(p.store.size, 0, `n=${n}`);
  }
});

test('a valid setup is stored, then the projector route opens; the stored event is the typed one', () => {
  const p = page();
  p.type('pd-event', 'Party 2570');
  p.type('pd-names', roster(60).join('\n'));
  p.$('pd-prize-minus').dispatch('click');
  p.$('pd-prize-minus').dispatch('click');
  p.type('pd-prize-1', 'TV');
  p.submit();
  const ev = decodeEvent(p.store.get(STORAGE_KEY));
  assert.ok(ev, 'nothing valid was stored');
  assert.equal(ev.setup.eventName, 'Party 2570');
  assert.deepEqual(ev.setup.people.map((x) => x.name), roster(60));
  assert.deepEqual(ev.setup.prizes, ['TV', '', '']);
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
});

test('a refused store shows the message and does not navigate', () => {
  const p = page({ failStore: true });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  assert.equal(p.$('pd-start-msg').textContent, STORAGE_FAILED);
  assert.deepEqual(p.visits, []);
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('without Web Locks the start stores nothing, does not navigate, and says storage failed', async () => {
  const p = page({ locks: null });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await tick();
  assert.equal(p.store.size, 0, 'a start without the event lock wrote the event');
  assert.deepEqual(p.visits, [], 'a start without the event lock opened the projector');
  assert.equal(p.$('pd-start-msg').textContent, STORAGE_FAILED);
});

test('the start waits for the event lock: nothing is stored or opened before the grant, both after it', () => {
  const locks = fakeLocks();
  const p = page({ locks });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  assert.equal(locks.queue.length, 1, 'the start never asked for the event lock');
  assert.equal(locks.queue[0].name, STORAGE_KEY);
  assert.equal(p.store.size, 0, 'the event was stored before the lock was granted');
  assert.deepEqual(p.visits, [], 'the projector opened before the lock was granted');
  locks.grant();
  assert.ok(decodeEvent(p.store.get(STORAGE_KEY)), 'nothing valid was stored once granted');
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
});

test('a second start while the first waits on the lock is dropped: one event stored, one navigation', () => {
  const locks = fakeLocks();
  const p = page({ locks });
  p.type('pd-names', roster(60).join('\n'));
  let writes = 0;
  const set = p.store.set.bind(p.store);
  p.store.set = (k, v) => (writes++, set(k, v));
  p.submit();
  p.submit();
  while (locks.grant());
  assert.equal(writes, 1, 'a double submit stored two events');
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
});

test('a refused lock request stores nothing and leaves the start button usable', async () => {
  let refuse = true;
  const inner = grantingLocks();
  const locks = { request: (name, cb) => (refuse ? Promise.reject(new Error('SecurityError')) : inner.request(name, cb)) };
  const p = page({ locks });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await tick();
  assert.equal(p.store.size, 0);
  assert.deepEqual(p.visits, []);
  assert.equal(p.$('pd-start-msg').textContent, STORAGE_FAILED);
  refuse = false;
  p.submit();
  assert.ok(decodeEvent(p.store.get(STORAGE_KEY)), 'the start stayed dead after a refused request');
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
});

test('Enter in a one-line field does not submit (only the start button starts the event)', () => {
  const p = page();
  p.type('pd-names', roster(60).join('\n'));
  let prevented = false;
  p.$('pd-setup').dispatch('keydown', { key: 'Enter', target: p.$('pd-event'), preventDefault: () => (prevented = true) });
  assert.equal(prevented, true, 'Enter in the event name field was not stopped');
  let textarea = false;
  p.$('pd-setup').dispatch('keydown', { key: 'Enter', target: p.$('pd-names'), preventDefault: () => (textarea = true) });
  assert.equal(textarea, false, 'Enter in the roster must still make a new line');
});
