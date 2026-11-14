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
import { CARDS_HALF_NOTE, CONFIRM_REPLACE, NO_GAME_LABEL, NO_WEBGL_NOTE, STORAGE_FAILED, hasWebGL2, mountSetup } from './setup-page.ts';
import { DB, REFUSED_BROWSER } from './store.ts';
import { nameIssue, parseRoster } from './names.ts';
import { fakeOrigin } from './fake-idb.mjs';
import { proposeSchedule } from '../prize-draw/schedule.ts';

const PAGE = fs.readFileSync(path.join(import.meta.dirname, '../pages/game/prize-draw/index.astro'), 'utf8');

/** The setup page on the fake DOM over one origin. `env` is the window's storage side (a tab of the origin
 *  by default; a plain object for a browser without IndexedDB); `confirm` answers the replace question. */
function page({ origin = fakeOrigin(), env = origin.tab('setup'), confirm = () => true, games, webgl = true, rogue = false } = {}) {
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
  // Step 3's game rows, as the page renders them: one button group per step, no game first. `rogue` adds
  // a button per group for a game that step may not play, and one for a game that does not exist.
  add('p', 'pd-games-line', form);
  add('div', 'pd-games-note', form);
  for (const [id, offered, foreign] of GAME_ROWS) {
    const group = add('div', id, form);
    for (const game of ['', ...offered, ...(rogue ? [foreign, 'bogus'] : [])]) {
      const b = doc.createElement('button');
      b.setAttribute('data-game', game);
      group.append(b);
    }
    // A cut round's row has the slot for the cards reason line under it.
    if (offered.includes('cards')) add('div', `${id}-note`, form);
  }
  for (let r = 1; r <= 4; r++) {
    add('span', `pd-game-r${r}-from`, form);
    add('span', `pd-game-r${r}-to`, form);
  }
  const visits = [];
  const asked = [];
  const listeners = {};
  const win = {
    ...env, location: { assign: (u) => visits.push(u) }, confirm: (q) => (asked.push(q), confirm(q)),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
  };
  /** Dispatch a window event to what the script registered. */
  const fire = (type, event) => (listeners[type] ?? []).forEach((fn) => fn(event));
  mountSetup(doc, win, { ...(games ? { games } : {}), webgl2: () => webgl });
  const $ = (id) => doc.getElementById(id);
  const type = (id, value) => {
    $(id).value = value;
    $(id).dispatch('input');
  };
  const submit = () => form.dispatch('submit');
  /** The stored event's text, or undefined. */
  const stored = () => origin.get(DB.name, DB.store, DB.key);
  /** Press the button for `game` ('' is no game) in the group `id`. */
  const choose = (id, game) => buttons(id).find((b) => b.getAttribute('data-game') === game).click();
  /** Which button of group `id` is pressed, by its game; every other one must say it is not. */
  const pressed = (id) => {
    const on = buttons(id).filter((b) => b.getAttribute('aria-pressed') === 'true');
    assert.equal(on.length, 1, `${id}: exactly one choice is pressed`);
    for (const b of buttons(id)) if (b !== on[0] && !b.hidden) assert.equal(b.getAttribute('aria-pressed'), 'false');
    return on[0].getAttribute('data-game');
  };
  const buttons = (id) => $(id).querySelectorAll('button');
  return { doc, $, type, submit, stored, visits, asked, origin, idle: () => origin.idle(), choose, pressed, buttons, fire };
}

/** The game rows: group id, the games the step offers (registry order), a game it may not play. */
const GAME_ROWS = [
  ['pd-game-r1', ['fireworks', 'cards'], 'ladder'],
  ['pd-game-r2', ['fireworks', 'cards'], 'ladder'],
  ['pd-game-r3', ['fireworks', 'cards'], 'ladder'],
  ['pd-game-r4', ['fireworks', 'cards'], 'ladder'],
  ['pd-game-final', ['fireworks', 'ladder'], 'cards'],
];

const roster = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

test('every element the script needs is in the page', () => {
  for (const id of ['pd-setup', 'pd-event', 'pd-names', 'pd-count', 'pd-names-msg', 'pd-s0', 'pd-sched-msg', 'pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus', 'pd-prize-count', 'pd-start-msg', 'pd-games-line', 'pd-games-note']) {
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

test('the game picks reach the stored event: none picked is every step in 2D, and the picker seam carries what it returns', async () => {
  const plain = page();
  plain.type('pd-names', roster(50).join('\n'));
  plain.submit();
  await plain.idle();
  assert.deepEqual(decodeEvent(plain.stored()).setup.games, { rounds: [null, null, null, null], final: null });
  const picks = { rounds: ['fireworks', 'cards', null, 'fireworks'], final: 'ladder' };
  const picked = page({ games: () => picks });
  picked.type('pd-names', roster(50).join('\n'));
  picked.submit();
  await picked.idle();
  assert.deepEqual(decodeEvent(picked.stored()).setup.games, picks);
  assert.equal(picked.visits.length, 1);
});

// gh#305 item 1a (option A) and 1b (option A): the per-round game rows inside step 3.

test('the game picks the MC presses are the ones stored with the event, and each group shows one pressed choice', async () => {
  const p = page();
  p.type('pd-names', roster(50).join('\n'));
  for (const [id] of GAME_ROWS) assert.equal(p.pressed(id), '', `${id} starts on no game`);
  p.choose('pd-game-r1', 'fireworks');
  p.choose('pd-game-r2', 'cards');
  p.choose('pd-game-r4', 'cards');
  p.choose('pd-game-r4', 'fireworks');
  p.choose('pd-game-final', 'ladder');
  assert.equal(p.pressed('pd-game-r2'), 'cards');
  assert.equal(p.pressed('pd-game-r3'), '');
  assert.equal(p.pressed('pd-game-r4'), 'fireworks', 'a second press moves the choice');
  p.choose('pd-game-r2', '');
  assert.equal(p.pressed('pd-game-r2'), '', 'no game can be chosen again');
  p.submit();
  await p.idle();
  assert.deepEqual(decodeEvent(p.stored()).setup.games, { rounds: ['fireworks', null, null, 'fireworks'], final: 'ladder' });
  assert.equal(p.visits.length, 1);
});

test('a game a step may not play cannot be chosen there, even when its click fires', async () => {
  const p = page({ rogue: true });
  p.type('pd-names', roster(50).join('\n'));
  for (const [id, , foreign] of GAME_ROWS) {
    for (const game of [foreign, 'bogus']) {
      const b = p.buttons(id).find((x) => x.getAttribute('data-game') === game);
      assert.ok(b.hidden && b.disabled, `${id}: ${game} is not offered`);
      b.dispatch('click');
      assert.equal(p.pressed(id), '', `${id}: ${game} was taken`);
    }
  }
  p.submit();
  await p.idle();
  assert.deepEqual(decodeEvent(p.stored()).setup.games, { rounds: [null, null, null, null], final: null });
});

test('each round row names the cut it plays, from the schedule above it', () => {
  const p = page();
  p.type('pd-names', roster(200).join('\n'));
  const s = proposeSchedule(200);
  for (let r = 1; r <= 4; r++) {
    assert.equal(p.$(`pd-game-r${r}-from`).textContent, String(s[r - 1]));
    assert.equal(p.$(`pd-game-r${r}-to`).textContent, `${s[r]} คน`);
  }
  p.type('pd-s1', '120');
  assert.equal(p.$('pd-game-r1-to').textContent, '120 คน');
  assert.equal(p.$('pd-game-r2-from').textContent, '120');
});

test('no WebGL2: the note shows in place of the line over the rows, and the picks stay and are stored', async () => {
  const off = page({ webgl: false });
  assert.equal(off.$('pd-games-note').textContent, NO_WEBGL_NOTE);
  assert.equal(off.$('pd-games-line').hidden, true);
  off.type('pd-names', roster(50).join('\n'));
  // Round 2 (20 -> 10) is the round of 50 that cuts in half, the only one cards may play.
  off.choose('pd-game-r2', 'cards');
  off.choose('pd-game-final', 'fireworks');
  assert.equal(off.pressed('pd-game-r2'), 'cards');
  off.submit();
  await off.idle();
  assert.deepEqual(decodeEvent(off.stored()).setup.games, { rounds: [null, 'cards', null, null], final: 'fireworks' });
  const on = page({ webgl: true });
  assert.equal(on.$('pd-games-note').textContent, '');
  assert.equal(on.$('pd-games-line').hidden, false);
});

// Owner ruling 2026-11-13 (gh#306): cards only on a round that cuts exactly in half.
test('a round offers cards only while it cuts exactly in half, recomputed as the schedule changes; a pick it loses is cleared', async () => {
  const p = page();
  const cards = (r) => p.buttons(`pd-game-r${r}`).find((b) => b.getAttribute('data-game') === 'cards');
  const fireworks = (r) => p.buttons(`pd-game-r${r}`).find((b) => b.getAttribute('data-game') === 'fireworks');
  const offered = () => [1, 2, 3, 4].map((r) => !cards(r).disabled);
  assert.deepEqual(offered(), [false, false, false, false], 'no roster, no schedule: no round halves');
  p.type('pd-names', roster(50).join('\n'));
  assert.deepEqual(offered(), [false, true, false, false], '50 -> 20 -> 10 -> 7 -> 5 halves only round 2');
  for (const r of [1, 2, 3, 4]) assert.equal(fireworks(r).disabled, false, `round ${r}: fireworks is never held back`);
  p.choose('pd-game-r2', 'cards');
  assert.equal(p.pressed('pd-game-r2'), 'cards');
  cards(1).dispatch('click');
  assert.equal(p.pressed('pd-game-r1'), '', 'a disabled cards button never picks, even when its click fires');
  // Round 2 stops halving: its cards pick is cleared, not kept.
  p.type('pd-s1', '25');
  assert.deepEqual(offered(), [true, false, false, false], '50 -> 25 halves round 1 now, and round 2 (25 -> 10) no longer');
  assert.equal(p.pressed('pd-game-r2'), '', 'the cards pick on a round that stopped halving is cleared');
  p.type('pd-s1', '20');
  assert.equal(p.pressed('pd-game-r2'), '', 'halving again does not bring a cleared pick back');
  // A roster change re-proposes the schedule and is checked the same way.
  p.$('pd-sched-reset').dispatch('click');
  p.choose('pd-game-r2', 'cards');
  p.type('pd-names', roster(200).join('\n'));
  assert.deepEqual(offered(), [true, true, false, false], '200 -> 100 -> 50 -> 20 -> 5');
  assert.equal(p.pressed('pd-game-r2'), 'cards', 'a pick on a round that still halves is kept');
  p.type('pd-names', roster(60).join('\n'));
  assert.equal(p.pressed('pd-game-r2'), '', '60 -> 50 -> 20: round 2 stopped halving');
  p.choose('pd-game-r3', 'cards');
  p.submit();
  await p.idle();
  assert.deepEqual(decodeEvent(p.stored()).setup.games, { rounds: [null, null, 'cards', null], final: null });
});

// PD-305-01: a disabled cards button says why, once for the page, under the first round that holds it back.
test('while any round holds cards back, one reason line shows under the first such round; none when every round halves', () => {
  assert.equal(CARDS_HALF_NOTE, 'เกมไพ่ใช้ได้เฉพาะรอบที่คัดออกครึ่งหนึ่งพอดี');
  const p = page();
  const notes = () => [1, 2, 3, 4].map((r) => p.$(`pd-game-r${r}-note`).textContent);
  const rows = () => [1, 2, 3, 4].reduce((n, r) => n + p.$(`pd-game-r${r}-note`).querySelectorAll('div.emsg').length, 0);
  assert.deepEqual(notes(), [CARDS_HALF_NOTE, '', '', ''], 'no roster: every round holds cards back; the line sits under round 1');
  p.type('pd-names', roster(200).join('\n'));
  assert.deepEqual(notes(), ['', '', CARDS_HALF_NOTE, ''], '200 -> 100 -> 50 -> 20 -> 5: rounds 3 and 4 hold back; one line, under round 3');
  assert.equal(rows(), 1, 'one line for the page, not one per round');
  p.type('pd-names', roster(80).join('\n'));
  for (const [id, v] of [['pd-s1', '40'], ['pd-s2', '20'], ['pd-s3', '10']]) p.type(id, v);
  assert.deepEqual(notes(), ['', '', '', ''], '80 -> 40 -> 20 -> 10 -> 5 halves every round: no line');
  assert.equal(rows(), 0);
  p.type('pd-s3', '9');
  assert.deepEqual(notes(), ['', '', CARDS_HALF_NOTE, ''], 'a round stops halving: the line comes back under it');
});

test('a disabled game button paints the locked-choice look (Gh305GamePick: dashed, cream, muted); each cut row has its reason slot', () => {
  const rule = PAGE.match(/\.segb:disabled \{([^}]*)\}/);
  assert.ok(rule, 'the page styles a disabled game button');
  assert.match(rule[1], /border-style: dashed;/);
  assert.match(rule[1], /background: var\(--color-ground-warm\);/);
  assert.match(rule[1], /color: var\(--color-muted\);/);
  assert.match(PAGE, /\{row\.cut && <div id=\{`\$\{row\.id\}-note`\} class="msgs games-note"><\/div>\}/);
});

test('the WebGL2 probe: a detached canvas, its context released; no context or a throw is no WebGL2', () => {
  const made = [];
  const docWith = (getContext) => ({
    createElement(tag) {
      const c = { tag, getContext, width: 300, height: 150 };
      made.push(c);
      return c;
    },
  });
  let lost = 0;
  const ctx = { getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext: () => lost++ } : null) };
  assert.equal(hasWebGL2(docWith((kind) => (kind === 'webgl2' ? ctx : null))), true);
  assert.equal(lost, 1, 'the probe context is released');
  assert.equal(made.at(-1).tag, 'canvas');
  assert.equal(made.at(-1).width, 0, 'the probe canvas is shrunk to nothing');
  assert.equal(hasWebGL2(docWith(() => null)), false);
  assert.equal(
    hasWebGL2(
      docWith(() => {
        throw new Error('blocked');
      }),
    ),
    false,
  );
  assert.equal(hasWebGL2(docWith(undefined)), false, 'a canvas without getContext');
});

test('the game rows carry the approved copy and are rendered from the registry, every choice a button', () => {
  assert.equal(NO_GAME_LABEL, 'แบบปกติ');
  assert.equal(NO_WEBGL_NOTE, 'เครื่องนี้แสดงเกม 3D ไม่ได้ ถ้าวันงานก็แสดงไม่ได้ ระบบจะเปิดผลแบบปกติให้เอง');
  assert.ok(PAGE.includes('เลือกเกมให้แต่ละรอบ ไม่เลือกก็เปิดผลแบบปกติ'));
  assert.match(PAGE, /eligible\(g, 'round'\) && isAvailable\(g\)/);
  assert.match(PAGE, /eligible\(g, 'final'\) && isAvailable\(g\)/);
  assert.match(PAGE, /<button type="button" class="segb" data-game=""[^>]*aria-pressed="true">\{NO_GAME_LABEL\}<\/button>/);
  assert.match(PAGE, /<div class="seg" role="group" id=\{row\.id\} aria-labelledby=/);
  assert.match(PAGE, /\.segb:focus-visible/);
  assert.ok(!/from 'three'|import\('three'\)/.test(PAGE), 'the setup page never imports three');
});

// gh#314 items 1b, 1c and 1e (option B each), as far as the page source shows them without a browser.

/** The body of the page's one phone-width media block. */
function phoneBlock() {
  const at = PAGE.indexOf('@media (max-width: 639px)');
  assert.ok(at > 0, 'the page has its phone block');
  let depth = 0;
  for (let i = PAGE.indexOf('{', at); i < PAGE.length; i++) {
    if (PAGE[i] === '{') depth++;
    else if (PAGE[i] === '}' && --depth === 0) return PAGE.slice(at, i + 1);
  }
  throw new Error('unbalanced phone block');
}

test('gh#314 1b: below 640px the schedule is a vertical list, stage name left, box right, an arrow down between', () => {
  const css = phoneBlock().replace(/\s+/g, ' ');
  // The frame's list (.vs) is a flex column at the default stretch: every row is the schedule's full width, so
  // the 118px value column sits at one x. The wide row's flex-start would shrink each row to its own label.
  assert.match(css, /\.sched \{ flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 0; \}/);
  assert.match(css, /\.box \{ display: grid; grid-template-columns: 1fr 118px; gap: 12px; align-items: center; inline-size: auto; text-align: start; \}/);
  assert.match(css, /\.arr \{ display: grid; grid-template-columns: 1fr 118px; gap: 12px; block-size: 26px; \}/);
  assert.match(css, /\.arr svg \{ grid-column: 2; justify-self: center; transform: rotate\(90deg\); \}/);
  assert.match(css, /\.lab-n \{ display: none; \}/);
  // The count line under each stage name is the one thing the list drops, and it is marked to be.
  assert.ok(PAGE.includes('<br class="lab-n" /><span class="lab-n" id="pd-l0">'));
});

test('gh#314 1c: the back link is the category page crumb trail, both parts linked', () => {
  assert.match(
    PAGE,
    /<p class="crumb"><a href="\/">หน้าแรก<\/a><span class="sep" aria-hidden="true">·<\/span><a href=\{`\/c\/\$\{game\.category\}\/`\}>\{category\.label\}<\/a><\/p>/,
  );
  assert.match(PAGE.replace(/\s+/g, ' '), /\.crumb \.sep \{ margin: 0 6px; \}/);
});

test('gh#314 1e: a refused name reason is regular weight in the muted colour; the name keeps the row weight', () => {
  const css = PAGE.replace(/\s+/g, ' ');
  assert.match(css, /\.msgs :global\(\.emsg-why\) \{ font-weight: 400; color: var\(--color-muted\); \}/);
  const p = page();
  p.type('pd-names', [...roster(20), 'a<b'].join('\n'));
  const row = p.$('pd-names-msg').querySelector('div.emsg-body');
  assert.ok(row.querySelector('span.emsg-name') && row.querySelector('span.emsg-why'), 'the reason has its own element to style');
});

// The site's cross-document fade (web.css) is on for this page and never for the projector route, so
// Chrome aborts the fade it began for the start's navigation and raises the abort as an uncaught
// InvalidStateError. The script skips that one transition itself, before the projector decides, and
// handles every promise the transition carries. The double rejects ready the way the browser does when
// a transition is skipped.
function transition() {
  let reject;
  const vt = { skipped: false, finished: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  vt.ready = new Promise((_, r) => (reject = r));
  vt.skipTransition = () => {
    vt.skipped = true;
    reject(new Error('InvalidStateError: Transition was aborted because of invalid state'));
  };
  return vt;
}
const swap = (url, viewTransition) => ({ activation: url === null ? null : { entry: { url } }, viewTransition });
/** Let every settled promise run its handlers. The test runner fails the test on any rejection left
 *  unhandled by then (failureType unhandledRejection), so that is the instrument for "handled". */
const settle = async () => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

test('the navigation to the projector skips the page fade, and nothing it rejects goes unhandled', async () => {
  const p = page();
  const vt = transition();
  p.fire('pageswap', swap('https://watduang.com/game/prize-draw/play/', vt));
  await settle();
  assert.equal(vt.skipped, true, 'the fade into the projector route is skipped');
});

test('a navigation anywhere else keeps the page fade', async () => {
  const p = page();
  for (const url of ['https://watduang.com/c/party/', 'https://watduang.com/', 'https://watduang.com/game/prize-draw/play/x']) {
    const vt = transition();
    p.fire('pageswap', swap(url, vt));
    assert.equal(vt.skipped, false, url);
  }
});

test('no transition, or no destination, is left alone without throwing', () => {
  const p = page();
  assert.doesNotThrow(() => p.fire('pageswap', swap('https://watduang.com/game/prize-draw/play/', null)));
  const vt = transition();
  assert.doesNotThrow(() => p.fire('pageswap', swap(null, vt)));
  assert.equal(vt.skipped, false);
});
