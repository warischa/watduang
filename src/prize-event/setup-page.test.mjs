// node --test — the prize-draw setup page script on the prize fake DOM: the setup screen's hostile-name
// case (its name sink is the error list), schedule validation as the MC sees it, and the start contract
// (store first, then open the projector route; nothing stored means no navigation; a saved event is replaced
// only after the MC confirms; a refused browser says why). The store is the real one (store.ts) over the
// in-memory IndexedDB double (fake-idb.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from './fake-dom.mjs';
import { createEvent, decodeEvent, encodeEvent } from './event.ts';
import { CONFIRM_REPLACE, STORAGE_FAILED, mountSetup } from './setup-page.ts';
import { DB, REFUSED_BROWSER } from './store.ts';
import { nameIssue, parseRoster } from './names.ts';
import { fakeOrigin } from './fake-idb.mjs';
import { proposeSchedule } from '../prize-draw/schedule.ts';

const PAGE = fs.readFileSync(path.join(import.meta.dirname, '../pages/game/prize-draw/index.astro'), 'utf8');

/** The setup page on the fake DOM over one origin. `env` is the window's storage side (a tab of the origin
 *  by default; a plain object for a browser without IndexedDB); `confirm` answers the replace question. */
function page({ origin = fakeOrigin(), env = origin.tab('setup'), confirm = () => true } = {}) {
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
  const visits = [];
  const asked = [];
  const win = { ...env, location: { assign: (u) => visits.push(u) }, confirm: (q) => (asked.push(q), confirm(q)) };
  mountSetup(doc, win);
  const $ = (id) => doc.getElementById(id);
  const type = (id, value) => {
    $(id).value = value;
    $(id).dispatch('input');
  };
  const submit = () => form.dispatch('submit');
  /** The stored event's text, or undefined. */
  const stored = () => origin.get(DB.name, DB.store, DB.key);
  return { doc, $, type, submit, stored, visits, asked, origin, idle: () => origin.idle() };
}

const roster = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

test('every element the script needs is in the page', () => {
  for (const id of ['pd-setup', 'pd-event', 'pd-names', 'pd-count', 'pd-names-msg', 'pd-s0', 'pd-sched-msg', 'pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus', 'pd-prize-count', 'pd-start-msg']) {
    assert.ok(PAGE.includes(`id="${id}"`), `#${id} is not in index.astro`);
  }
  assert.ok(PAGE.includes('id={`pd-s${i}`}') && PAGE.includes('id={`pd-l${i}`}') && PAGE.includes('id={`pd-prize-${i}`}'));
});

test('setup screen, hostile names: each is listed in the error rows as its own text, never parsed, and blocks the start', async () => {
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
  await p.idle();
  assert.equal(p.stored(), undefined, 'an event with refused names was stored');
  assert.deepEqual(p.visits, []);
});

test('a duplicate (case and spaces folded) is listed and blocks the start', async () => {
  const p = page();
  p.type('pd-names', [...roster(50), 'p 1'].join('\n'));
  assert.deepEqual(p.$('pd-names-msg').querySelectorAll('span.emsg-name').map((s) => s.textContent), ['p 1']);
  p.submit();
  await p.idle();
  assert.equal(p.stored(), undefined);
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

test('the schedule is proposed from the head count and an edit that does not shrink shows the board sentence', async () => {
  const p = page();
  p.type('pd-names', roster(200).join('\n'));
  assert.deepEqual(['pd-s1', 'pd-s2', 'pd-s3'].map((id) => p.$(id).value), ['100', '50', '20']);
  p.type('pd-s2', '120');
  assert.equal(p.$('pd-sched-msg').textContent, 'หลังรอบ 2 ต้องน้อยกว่าหลังรอบ 1 (100 คน)');
  assert.ok(p.$('pd-s2').classList.contains('err'));
  p.submit();
  assert.equal(p.$('pd-start-msg').textContent, 'แก้ตารางคัดออกก่อน แล้วจึงเริ่มงานได้');
  await p.idle();
  assert.equal(p.stored(), undefined);
  p.$('pd-sched-reset').dispatch('click');
  assert.equal(p.$('pd-s2').value, '50');
  assert.equal(p.$('pd-sched-msg').textContent, '');
});

test('head count outside 9..200: the count is marked and the start refused', async () => {
  for (const n of [8, 201]) {
    const p = page();
    p.type('pd-names', roster(n).join('\n'));
    assert.ok(p.$('pd-count').classList.contains('err'), `n=${n}`);
    p.submit();
    await p.idle();
    assert.equal(p.stored(), undefined, `n=${n}`);
  }
});

test('a valid setup is stored, then the projector route opens; the stored event is the typed one; nothing is asked when none is saved', async () => {
  const p = page();
  p.type('pd-event', 'Party 2570');
  p.type('pd-names', roster(60).join('\n'));
  p.$('pd-prize-minus').dispatch('click');
  p.$('pd-prize-minus').dispatch('click');
  p.type('pd-prize-1', 'TV');
  p.submit();
  await p.idle();
  const ev = decodeEvent(p.stored());
  assert.ok(ev, 'nothing valid was stored');
  assert.equal(ev.setup.eventName, 'Party 2570');
  assert.deepEqual(ev.setup.people.map((x) => x.name), roster(60));
  assert.deepEqual(ev.setup.prizes, ['TV', '', '']);
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
  assert.deepEqual(p.asked, [], 'asked to replace an event that was never saved');
});

// Literal on purpose: this pins the owner-approved wording (gh#313), not the constant.
test('the replace question is the owner-approved copy', () => {
  assert.equal(CONFIRM_REPLACE, 'มีงานที่บันทึกไว้แล้ว ถ้าเริ่มงานใหม่ งานเดิมจะหายไป เริ่มใหม่เลยไหม?');
});

/** A seeded source, enough for createEvent: distinct ids per seed. */
function seededHex(seed) {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { float, int: (n) => Math.floor(float() * n), hex: (b) => Array.from({ length: b }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join('') };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('confirm before replace: cancel leaves the saved event byte-identical, writes nothing and opens nothing', async () => {
  const origin = fakeOrigin();
  const saved = encodeEvent(createEvent({ eventName: 'Saved', names: roster(30), schedule: proposeSchedule(30), prizes: ['A'] }, seededHex(7)));
  origin.put(DB.name, DB.version, DB.store, DB.key, saved);
  const p = page({ origin, confirm: () => false });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await p.idle();
  assert.deepEqual(p.asked, [CONFIRM_REPLACE]);
  assert.equal(p.stored(), saved, 'cancel changed the saved event');
  assert.deepEqual(origin.log, [], 'cancel wrote');
  assert.deepEqual(p.visits, []);
  assert.equal(p.$('pd-start-msg').textContent, '', 'cancel is not a failure');
  // and the start is usable again: confirming now replaces it
  const yes = page({ origin, confirm: () => true });
  yes.type('pd-names', roster(60).join('\n'));
  yes.submit();
  await yes.idle();
  assert.equal(decodeEvent(yes.stored()).setup.people.length, 60);
  assert.deepEqual(origin.log.map((w) => w.before), [saved], 'the replacement did not land on the text that was asked about');
  assert.deepEqual(yes.visits, ['/game/prize-draw/play/']);
});

test('a stored text that does not decode is no event: the start replaces it without asking', async () => {
  const origin = fakeOrigin();
  origin.put(DB.name, DB.version, DB.store, DB.key, '{"v":1');
  const p = page({ origin, confirm: () => false });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await p.idle();
  assert.deepEqual(p.asked, []);
  assert.ok(decodeEvent(p.stored()));
});

test('the saved event moves while the question is open: nothing is replaced, and the MC is asked again about what is stored now', async () => {
  const origin = fakeOrigin();
  const first = encodeEvent(createEvent({ eventName: 'Saved', names: roster(30), schedule: proposeSchedule(30), prizes: ['A'] }, seededHex(7)));
  const moved = encodeEvent(createEvent({ eventName: 'Moved', names: roster(30), schedule: proposeSchedule(30), prizes: ['A'] }, seededHex(8)));
  origin.put(DB.name, DB.version, DB.store, DB.key, first);
  let questions = 0;
  const p = page({
    origin,
    confirm: () => {
      // While the first question is open, a projector moves the saved event.
      if (++questions === 1) origin.put(DB.name, DB.version, DB.store, DB.key, moved);
      return true;
    },
  });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await p.idle();
  assert.equal(questions, 2, 'the MC was not asked again about the event that is stored now');
  assert.deepEqual(origin.log.map((w) => w.before), [moved], 'the replacement landed on a text the MC was not asked about');
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
});

test('an aborted transaction shows the storage message and does not navigate', async () => {
  const origin = fakeOrigin();
  const p = page({ origin });
  await p.idle();
  origin.faults.abortCommits = 1;
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await p.idle();
  assert.equal(origin.faults.abortCommits, 0, 'nothing was aborted: this test measured nothing');
  assert.equal(p.$('pd-start-msg').textContent, STORAGE_FAILED);
  assert.equal(p.stored(), undefined);
  assert.deepEqual(p.visits, []);
});

test('a refused browser says why at once and again on start, stores nothing and does not navigate', async () => {
  for (const [label, make] of [
    ['no IndexedDB', (o) => ({})],
    ['open errors', (o) => ((o.faults.open = 'error'), o.tab('setup'))],
    ['open throws', (o) => ((o.faults.open = 'throw'), o.tab('setup'))],
  ]) {
    const origin = fakeOrigin();
    const p = page({ origin, env: make(origin) });
    await p.idle();
    assert.equal(p.$('pd-start-msg').textContent, REFUSED_BROWSER, `${label}: nothing said before a start`);
    p.type('pd-names', roster(60).join('\n'));
    p.submit();
    await p.idle();
    assert.equal(p.$('pd-start-msg').textContent, REFUSED_BROWSER, `${label}: nothing said on start`);
    assert.equal(p.stored(), undefined, label);
    assert.deepEqual(p.visits, [], label);
  }
});

test('the start waits for the commit: nothing is opened before it, the projector after it', async () => {
  const origin = fakeOrigin({ manual: true });
  const p = page({ origin });
  while (origin.step()) await tick();
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  await tick();
  let steps = 0;
  while (origin.step()) {
    steps++;
    if (!origin.log.length) assert.deepEqual(p.visits, [], 'the projector opened before the write committed');
    await tick();
  }
  assert.ok(steps >= 4, `only ${steps} tasks: a load and a compare-and-set are at least four`);
  assert.ok(decodeEvent(p.stored()), 'nothing valid was stored once committed');
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
});

test('a second start while the first waits on the store is dropped: one event stored, one navigation', async () => {
  const origin = fakeOrigin();
  const p = page({ origin });
  p.type('pd-names', roster(60).join('\n'));
  p.submit();
  p.submit();
  await p.idle();
  assert.equal(origin.log.length, 1, 'a double submit stored two events');
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
