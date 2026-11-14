// node --test — gh#308: the phone join page against every answer of the join route, driven through its
// real DOM code on the prize-draw fake DOM. Covers: the link (event id and PIN), the device token, each
// answer's screen, and one name per device (a stored join shows the device screen; a send whose answer was
// lost is settled before a second name is ever sent).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { makeDoc } from '../prize-event/fake-dom.mjs';
import { REFUSAL_COPY } from '../prize-event/setup-page.ts';
import { COPY, ANSWER_COPY, mountJoin, takenRuns } from './join-page.ts';
import { DEVICE_TOKEN, TOKEN_CHARS, classify, newDeviceToken, readJoinLink, storageKey } from './join.ts';

const EV = 'AbCdEfGhIjKlMnOpQrStUv';
const JOIN_ID = 'j0j1j2j3j4j5j6j7j8j9jA';
const GAME_NAME = 'จับรางวัลปีใหม่';
const OTHER_ID = 'k0k1k2k3k4k5k6k7k8k9kA';

function page({ hash = `#event=${EV}&pin=123456`, query = '', stored, seed = [], session = new Map(), answers = [], storage = true, gate = null } = {}) {
  const doc = makeDoc();
  const root = doc.createElement('main');
  root.id = 'pj';
  doc.body.append(root);
  const kv = new Map();
  if (stored) kv.set(storageKey(EV), JSON.stringify(stored));
  for (const [k, v] of seed) kv.set(k, v);
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    if (gate) await gate;
    const a = answers.shift();
    if (!a) throw new Error('the test gave no answer for this send');
    if (a === 'network') throw new TypeError('network down');
    return { status: a.status, json: async () => a.body };
  };
  let randomCalls = 0;
  const location = { pathname: '/game/prize-draw/join/', search: query, hash };
  const replaced = [];
  const env = {
    gameName: GAME_NAME,
    location,
    history: {
      replaceState: (_data, _unused, url) => {
        replaced.push(url);
        const at = url.indexOf('#');
        location.hash = at < 0 ? '' : url.slice(at);
      },
    },
    session: session ? { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, String(v)) } : null,
    storage: storage ? { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => kv.set(k, String(v)) } : null,
    fetch,
    getRandomValues: (a) => {
      randomCalls += 1;
      return webcrypto.getRandomValues(a);
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  const h = mountJoin(root, env);
  const $ = (sel) => root.querySelector(sel);
  return {
    root,
    location,
    replaced,
    session,
    calls,
    kv,
    h,
    $,
    randomCalls: () => randomCalls,
    heading: () => $('h1')?.textContent,
    notFoundWords: () => $('.pj-emsg')?.querySelector('span')?.textContent,
    record: () => JSON.parse(kv.get(storageKey(EV)) ?? 'null'),
    async name(text) {
      const field = $('#pj-name');
      assert.ok(field, 'the name form is on screen');
      field.value = text;
      $('#pj-name-form').dispatch('submit');
      await h.settled();
    },
  };
}

const joined = (name, id = JOIN_ID, status = 201) => ({ status, body: { id, name, eventKey: '123456' } });
const refused = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

test('the link: an event id of the server shape and the PIN are read from the fragment; anything else is no event', () => {
  assert.deepEqual(readJoinLink(`#event=${EV}&pin=%20123456%20`), { eventId: EV, pin: '123456' });
  assert.deepEqual(readJoinLink(`#event=${EV}`), { eventId: EV, pin: '' });
  for (const bad of ['', '#', '#pin=1', '#event=short', `#event=${EV}x`, `#event=../${EV.slice(3)}`, `#event=${EV.slice(1)}%2F`]) {
    assert.equal(readJoinLink(bad).eventId, null, bad);
  }
});

test('the link travels in the fragment only: a query-string event and PIN are ignored', () => {
  const p = page({ hash: '', query: `?event=${EV}&pin=123456` });
  assert.equal(p.notFoundWords(), ANSWER_COPY.noEvent);
  assert.equal(p.calls.length, 0);
});

test('the fragment is read, then removed from the visible URL; the query and path stay', async () => {
  const p = page({ query: '?utm=x', answers: [joined('ต้น')] });
  assert.equal(p.heading(), COPY.nameHeading);
  assert.equal(p.location.hash, '', 'the PIN is no longer in the URL');
  assert.deepEqual(p.replaced, ['/game/prize-draw/join/?utm=x']);
  await p.name('ต้น');
  assert.equal(p.calls[0].body.pin, '123456', 'the PIN read before the strip is the one sent');
});

test('no fragment, nothing to strip: the URL is left alone', () => {
  const p = page({ hash: '' });
  assert.deepEqual(p.replaced, []);
});

test('a reload after the strip finds the event again in this tab, and a new fragment wins', async () => {
  const session = new Map();
  page({ session });
  const reload = page({ hash: '', session, answers: [joined('ต้น')] });
  assert.equal(reload.heading(), COPY.nameHeading);
  await reload.name('ต้น');
  assert.equal(reload.calls[0].url, `/api/draw/events/${EV}/join`);
  assert.equal(reload.calls[0].body.pin, '123456');
  const other = page({ hash: `#event=${OTHER_ID}&pin=999999`, session, answers: [joined('ต้น')] });
  await other.name('ต้น');
  assert.equal(other.calls[0].url, `/api/draw/events/${OTHER_ID}/join`);
  assert.equal(other.calls[0].body.pin, '999999');
  assert.equal(page({ hash: '', session: null }).notFoundWords(), ANSWER_COPY.noEvent, 'no tab store, no memory');
  assert.equal(page({ hash: '#event=nope&pin=1', session }).notFoundWords(), ANSWER_COPY.noEvent, 'a bad new scan never falls back to an old event');
});

test('every answer the board does not draw shows its owner-approved string, byte for byte', () => {
  assert.deepEqual(ANSWER_COPY, {
    noEvent: 'ไม่พบงานนี้ ลองสแกน QR บนจออีกครั้ง',
    full: 'งานนี้รับคนครบแล้ว ติดต่อผู้จัด',
    removed: 'ผู้จัดนำชื่อนี้ออกจากรายชื่อแล้ว',
    started: 'งานเริ่มแล้ว เข้าร่วมเพิ่มไม่ได้',
    gone: 'งานนี้หมดเวลาแล้ว',
    unavailable: 'ระบบไม่ว่าง ลองกดส่งอีกครั้ง',
    bad: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง',
    pin: 'รหัสงานไม่ถูกต้อง ลองสแกน QR บนจออีกครั้ง',
    emptyName: 'พิมพ์ชื่อเล่นก่อนกดเข้าร่วม',
  });
  assert.ok(Object.values(ANSWER_COPY).every((v) => !v.includes('[copy')), 'no placeholder left');
});

test('no event in the link: the page says so and sends nothing', async () => {
  for (const hash of ['', '#event=nope&pin=1']) {
    const p = page({ hash });
    assert.equal(p.notFoundWords(), ANSWER_COPY.noEvent);
    assert.equal(p.$('form'), null);
    assert.equal(p.calls.length, 0);
  }
});

test('the device token: from getRandomValues, the server shape, unbiased alphabet mapping', () => {
  let asked = 0;
  const token = newDeviceToken((a) => {
    asked += 1;
    for (let i = 0; i < a.length; i++) a[i] = i * 8 + 3;
    return a;
  });
  assert.equal(asked, 1);
  assert.equal(token.length, TOKEN_CHARS);
  assert.match(token, DEVICE_TOKEN);
  assert.equal(newDeviceToken((a) => a.fill(255)), '_'.repeat(TOKEN_CHARS));
  assert.equal(newDeviceToken((a) => a.fill(64)), 'A'.repeat(TOKEN_CHARS));
});

test('PIN in the link: straight to the name form, the board copy, nothing sent yet', () => {
  const p = page();
  assert.equal(p.heading(), COPY.nameHeading);
  assert.equal(p.$('label').textContent, COPY.nameLabel);
  assert.equal(p.$('.pj-note').textContent, COPY.deletionNote);
  assert.equal(p.$('button').textContent, COPY.join);
  assert.equal(p.calls.length, 0);
  assert.equal(p.randomCalls(), 1, 'the token comes from getRandomValues');
});

test('no PIN in the link: the PIN screen first, and the typed PIN is what the join sends', async () => {
  const p = page({ hash: `#event=${EV}`, answers: [joined('ต้น')] });
  assert.equal(p.heading(), COPY.pinHeading);
  assert.equal(p.$('.pj-sub').textContent, COPY.pinHint);
  p.$('#pj-pin-form').dispatch('submit');
  assert.equal(p.heading(), COPY.pinHeading, 'an empty PIN does not move on');
  p.$('#pj-pin').value = ' 654321 ';
  p.$('#pj-pin-form').dispatch('submit');
  assert.equal(p.heading(), COPY.nameHeading);
  await p.name('ต้น');
  assert.equal(p.calls[0].body.pin, '654321');
});

test('201: the device screen, the name in the header pill and the name card; the join is kept', async () => {
  const p = page({ answers: [joined('ต้น ส.')] });
  await p.name('  ต้น   ส.  ');
  const [call] = p.calls;
  assert.equal(call.url, `/api/draw/events/${EV}/join`);
  assert.equal(call.method, 'POST');
  assert.deepEqual(Object.keys(call.body).sort(), ['name', 'pin', 'token']);
  assert.equal(call.body.name, 'ต้น ส.', 'the normalised name is sent');
  assert.match(call.body.token, DEVICE_TOKEN);
  assert.equal(p.heading(), COPY.deviceHeading);
  assert.equal(p.$('.pj-sub').textContent, COPY.onePerDevice);
  assert.equal(p.$('.pj-me').textContent, 'ต้น ส.');
  assert.equal(p.$('.pj-who').textContent, 'ต้น ส.');
  assert.equal(p.$('.pj-note').textContent, COPY.keepOpen);
  assert.equal(p.$('#pj-name'), null, 'no form once joined');
  assert.deepEqual(p.record(), { token: call.body.token, id: JOIN_ID, name: 'ต้น ส.' });
});

test('200 (a retry of a join that landed): the same id, the device screen', async () => {
  const p = page({ answers: [joined('ต้น', JOIN_ID, 200)] });
  await p.name('ต้น');
  assert.equal(p.heading(), COPY.deviceHeading);
  assert.equal(p.record().id, JOIN_ID);
});

test('one name per device: a stored join opens on the device screen and sends nothing', () => {
  const p = page({ stored: { token: 'T'.repeat(32), id: JOIN_ID, name: 'บีม ก.' } });
  assert.equal(p.heading(), COPY.deviceHeading);
  assert.equal(p.$('.pj-who').textContent, 'บีม ก.');
  assert.equal(p.$('#pj-name'), null);
  assert.equal(p.calls.length, 0);
  assert.equal(p.randomCalls(), 0, 'the stored token is kept');
});

test('a stored join of ANOTHER event does not stop this one', () => {
  const other = [storageKey(OTHER_ID), JSON.stringify({ token: 'T'.repeat(32), id: JOIN_ID, name: 'x' })];
  assert.equal(page({ seed: [other] }).heading(), COPY.nameHeading);
  // Positive control: the same record under this event's key does stop it.
  assert.equal(page({ seed: [[storageKey(EV), other[1]]] }).heading(), COPY.deviceHeading);
});

test('409 taken: back on the form, the name kept, the board error naming it, the field marked', async () => {
  const p = page({ answers: [refused(409, 'taken')] });
  await p.name('ต้น');
  assert.equal(p.heading(), COPY.nameHeading);
  const field = p.$('#pj-name');
  assert.equal(field.value, 'ต้น');
  const msg = p.$('#pj-name-msg');
  assert.equal(msg.textContent, 'ชื่อ “ต้น” มีคนใช้แล้ว ลองเติมอักษรย่อ เช่น “ต้น ส.”', 'the board string, byte for byte, for the board sample');
  assert.equal(msg.getAttribute('role'), 'alert');
  assert.equal(msg.hidden, false);
  assert.ok(field.classList.contains('pj-err'));
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.equal(field.getAttribute('aria-describedby'), 'pj-name-msg');
  assert.ok(msg.querySelector('svg'), 'an icon carries the error, not colour alone');
  assert.equal(p.record().pending, undefined, 'a definite answer settles the send');
  assert.equal(takenRuns('x').length, 5);
});

test('a changed name after taken is a new send, with the same device token', async () => {
  const p = page({ answers: [refused(409, 'taken'), joined('ต้น ส.')] });
  await p.name('ต้น');
  await p.name('ต้น ส.');
  assert.equal(p.calls.length, 2);
  assert.equal(p.calls[0].body.token, p.calls[1].body.token);
  assert.equal(p.calls[1].body.name, 'ต้น ส.');
  assert.equal(p.heading(), COPY.deviceHeading);
});

test('409 full, removed, started and 404 gone: an end screen with the answer, no form', async () => {
  for (const [answer, copy] of [
    [refused(409, 'full'), ANSWER_COPY.full],
    [refused(409, 'removed'), ANSWER_COPY.removed],
    [refused(409, 'started'), ANSWER_COPY.started],
    [refused(404, 'gone'), ANSWER_COPY.gone],
  ]) {
    const p = page({ answers: [answer] });
    await p.name('ต้น');
    assert.equal(p.heading(), copy, JSON.stringify(answer));
    assert.equal(p.$('form'), null);
    assert.equal(p.record().id, undefined, 'not joined');
  }
});

test('503 and a network failure: retry on the form; the resend uses the same name and token', async () => {
  for (const first of [refused(503, 'unavailable'), 'network', { status: 502, body: null }, { status: 201, body: { name: 'x' } }]) {
    const p = page({ answers: [first, joined('ต้น', JOIN_ID, 200)] });
    await p.name('ต้น');
    assert.equal(p.heading(), COPY.nameHeading);
    assert.equal(p.$('#pj-name-msg').textContent, ANSWER_COPY.unavailable);
    assert.equal(p.$('#pj-name').value, 'ต้น');
    assert.equal(p.record().pending, 'ต้น', 'the send is unsettled');
    await p.name('ต้น');
    assert.equal(p.calls.length, 2);
    assert.deepEqual(p.calls[1].body, p.calls[0].body);
    assert.equal(p.heading(), COPY.deviceHeading);
  }
});

test('one name per device across a lost answer: the unsettled name is settled before another is sent', async () => {
  // It had landed: the resend of the first name answers 200, the second name is never sent.
  const landed = page({ answers: [refused(503, 'unavailable'), joined('ต้น', JOIN_ID, 200)] });
  await landed.name('ต้น');
  await landed.name('บีม');
  assert.deepEqual(landed.calls.map((c) => c.body.name), ['ต้น', 'ต้น']);
  assert.equal(landed.$('.pj-who').textContent, 'ต้น', 'the name that joined is the one shown');

  // It had not: the resend answers taken (someone else's), so the second name goes next.
  const lost = page({ answers: ['network', refused(409, 'taken'), joined('บีม')] });
  await lost.name('ต้น');
  await lost.name('บีม');
  assert.deepEqual(lost.calls.map((c) => c.body.name), ['ต้น', 'ต้น', 'บีม']);
  assert.equal(lost.$('.pj-who').textContent, 'บีม');

  // Still no answer: nothing else is sent, and the form says to retry.
  const still = page({ answers: ['network', 'network'] });
  await still.name('ต้น');
  await still.name('บีม');
  assert.deepEqual(still.calls.map((c) => c.body.name), ['ต้น', 'ต้น']);
  assert.equal(still.record().pending, 'ต้น');

  // Across a reload: the record keeps the unsettled name.
  const reload = page({ stored: { token: 'T'.repeat(32), pending: 'ต้น' }, answers: [joined('ต้น', JOIN_ID, 200)] });
  await reload.name('บีม');
  assert.deepEqual(reload.calls.map((c) => [c.body.name, c.body.token]), [['ต้น', 'T'.repeat(32)]]);
});

test('a second tap while a send is running sends nothing more', async () => {
  const p = page({ answers: [joined('ต้น')] });
  p.$('#pj-name').value = 'ต้น';
  p.$('#pj-name-form').dispatch('submit');
  p.$('#pj-name-form').dispatch('submit');
  await p.h.settled();
  assert.equal(p.calls.length, 1);
});

test('403 pin: the PIN screen with the error; a new PIN goes on the next send', async () => {
  const p = page({ answers: [refused(403, 'pin'), joined('ต้น')] });
  await p.name('ต้น');
  assert.equal(p.heading(), COPY.pinHeading);
  assert.equal(p.$('#pj-pin-msg').textContent, ANSWER_COPY.pin);
  assert.equal(p.$('#pj-pin').getAttribute('aria-invalid'), 'true');
  p.$('#pj-pin').value = '111111';
  p.$('#pj-pin-form').dispatch('submit');
  await p.name('ต้น');
  assert.equal(p.calls[1].body.pin, '111111');
  assert.equal(p.heading(), COPY.deviceHeading);
});

test('422 name: the refusal for its reason; 400 and other answers: the bad-request message', async () => {
  const p = page({ answers: [refused(422, 'name', { reason: 'charset' })] });
  await p.name('ต้น');
  assert.equal(p.$('#pj-name-msg').textContent, REFUSAL_COPY.charset);
  for (const answer of [refused(400, 'bad-request'), refused(413, 'too-large'), refused(404, 'no-route'), refused(409, 'empty')]) {
    const q = page({ answers: [answer] });
    await q.name('ต้น');
    assert.equal(q.$('#pj-name-msg').textContent, ANSWER_COPY.bad, JSON.stringify(answer));
    assert.equal(q.record().pending, undefined);
  }
});

test('the page refuses a name the server would, before sending, with the reason', async () => {
  const p = page();
  for (const [raw, copy] of [
    ['<img src=x>', REFUSAL_COPY.charset],
    ['W'.repeat(13), REFUSAL_COPY['too-long']],
    ['a​b', REFUSAL_COPY.control],
    ['Bee 🙂', REFUSAL_COPY.emoji],
    ['่ก', REFUSAL_COPY['leading-mark']],
    ['ก้้', REFUSAL_COPY['stacked-marks']],
    ['   ', ANSWER_COPY.emptyName],
  ]) {
    await p.name(raw);
    assert.equal(p.$('#pj-name-msg').textContent, copy, JSON.stringify(raw));
  }
  assert.equal(p.calls.length, 0);
});

test('a browser that refuses storage still joins', async () => {
  const p = page({ storage: false, answers: [joined('ต้น')] });
  await p.name('ต้น');
  assert.equal(p.heading(), COPY.deviceHeading);
});

test('classify: every answer the join route gives', () => {
  const cases = [
    [201, { id: JOIN_ID, name: 'a' }, 'joined'],
    [200, { id: JOIN_ID, name: 'a' }, 'joined'],
    [201, { id: 'short', name: 'a' }, 'unavailable'],
    [200, { id: JOIN_ID }, 'unavailable'],
    [409, { error: 'taken' }, 'taken'],
    [409, { error: 'full' }, 'full'],
    [409, { error: 'removed' }, 'removed'],
    [409, { error: 'started' }, 'started'],
    [409, { error: 'empty' }, 'bad'],
    [404, { error: 'gone' }, 'gone'],
    [404, { error: 'no-route' }, 'bad'],
    [403, { error: 'pin' }, 'pin'],
    [422, { error: 'name', reason: 'emoji' }, 'name'],
    [422, { error: 'name', reason: 'nope' }, 'bad'],
    [400, { error: 'bad-request' }, 'bad'],
    [405, { error: 'method' }, 'bad'],
    [413, { error: 'too-large' }, 'bad'],
    [503, { error: 'unavailable' }, 'unavailable'],
    [500, null, 'unavailable'],
    [null, null, 'unavailable'],
  ];
  for (const [status, body, kind] of cases) assert.equal(classify(status, body).kind, kind, `${status} ${JSON.stringify(body)}`);
});

test('while a name is being sent the button reads the sending label, and its own label returns after', async () => {
  assert.equal(COPY.sending, 'กำลังส่ง\u2026', 'the owner-approved label, with the ellipsis character U+2026');
  let release;
  const gate = new Promise((r) => (release = r));
  const p = page({ answers: [refused(503, 'unavailable')], gate });
  const btn = p.$('.pj-btn');
  assert.equal(btn.textContent, COPY.join);
  p.$('#pj-name').value = 'ต้น';
  p.$('#pj-name-form').dispatch('submit');
  await new Promise((r) => setImmediate(r));
  assert.equal(p.calls.length, 1, 'the send is in flight');
  assert.equal(btn.disabled, true);
  assert.equal(btn.textContent, COPY.sending);
  release();
  await p.h.settled();
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, COPY.join, 'the button is back to its own label');
  assert.equal(p.$('.pj-btn').textContent, COPY.join, 'the rebuilt form shows its own label too');
});

test('the disabled button visibly dims: the page stylesheet gives .pj-btn:disabled opacity 0.55', () => {
  const src = readFileSync(new URL('../pages/game/prize-draw/join.astro', import.meta.url), 'utf8');
  const rule = src.match(/\.pj :global\(\.pj-btn:disabled\) \{([^}]*)\}/);
  assert.ok(rule, 'the disabled rule exists');
  assert.match(rule[1], /opacity:\s*0\.55\s*;/);
});

test('event not found: the game name as the heading, then the error row with the unchanged answer', () => {
  const p = page({ hash: '' });
  assert.equal(p.heading(), 'จับรางวัลปีใหม่');
  const row = p.$('.pj-emsg');
  assert.ok(row, 'the error row is on screen');
  assert.equal(row.getAttribute('role'), 'alert');
  assert.ok(row.querySelector('svg'), 'the punch-disc icon is in the row');
  assert.equal(row.querySelector('span').textContent, 'ไม่พบงานนี้ ลองสแกน QR บนจออีกครั้ง');
  assert.equal(p.$('form'), null);
  assert.equal(p.calls.length, 0);
});
