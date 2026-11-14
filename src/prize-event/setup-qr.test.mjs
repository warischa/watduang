// node --test — gh#308: the setup page's QR mode on the prize fake DOM, over a fake join server reached
// through a fake fetch (no network), the real client (qr-event.ts) and the real event store (fake-idb.mjs).
// Pins the flow end to end on the page side: the open control opens the projector and creates one remote
// event; the admin token stays in the page's own storage and in a header, never in a URL or the lobby
// record; the review list polls on a bounded interval, stops while the page is hidden, and writes names
// through the text sink only (ADR-0026: names out of contract never reach the DOM at all); a removed name
// never reaches the start or the event; the start freezes the roster on the server and the stored event is
// exactly that roster; every other start answer stores nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from './fake-dom.mjs';
import { fakeOrigin } from './fake-idb.mjs';
import { decodeEvent } from './event.ts';
import { DB } from './store.ts';
import { HEAD_RANGE, QR_COPY, QR_PENDING, mountSetup } from './setup-page.ts';
import { ADMIN_HEADER, ADMIN_KEY, LOBBY_KEY, POLL_MS, parseLobby, qrApi } from './qr-event.ts';

const PAGE = fs.readFileSync(path.join(import.meta.dirname, '../pages/game/prize-draw/index.astro'), 'utf8');
const EV = 'AbCdEfGhIjKlMnOpQrStUv';
const TOKEN = 'k'.repeat(43);
const PIN = '048213';
const QR_IDS = ['pd-mode', 'pd-mode-admin', 'pd-mode-qr', 'pd-qr-heads', 'pd-qr-open', 'pd-qr-joined', 'pd-qr-fill', 'pd-qr-list', 'pd-qr-more', 'pd-qr-msg', 'pd-start'];

const idOf = (i) => `m${String(i).padStart(3, '0')}`.padEnd(22, 'x');
const member = (i, name = `P${i}`) => ({ id: idOf(i), name, joined: `2026-11-13T10:00:${String(i % 60).padStart(2, '0')}.000Z` });

/** A join server double behind a fetch double: the admin routes of the protocol doc, in memory. `answer[op]`
 *  overrides one route's answer; `down` makes every send fail. */
function fakeServer(list = []) {
  const srv = { list: [...list], state: 'open', roster: null, calls: [], answer: {}, down: false, created: 0 };
  srv.fetch = async (url, init) => {
    srv.calls.push({ url, method: init.method, headers: { ...init.headers }, body: init.body ? JSON.parse(init.body) : undefined });
    if (srv.down) throw new Error('offline');
    const reply = (status, body) => ({ status, json: async () => body });
    const parts = url.replace(/^\/api\/draw\//, '').split('/');
    const op = url === '/api/draw/events' ? 'create' : parts.at(-1);
    if (srv.answer[op]) return reply(srv.answer[op].status, srv.answer[op].body);
    if (op === 'create') {
      srv.created++;
      return reply(201, { eventId: EV, pin: PIN, adminToken: TOKEN, expiresAt: '2999-01-01T00:00:00.000Z' });
    }
    if (init.headers[ADMIN_HEADER] !== TOKEN) return reply(401, { error: 'admin' });
    if (op === 'names') return reply(200, { state: srv.state, names: srv.list });
    if (op === 'remove') {
      if (srv.state !== 'open') return reply(409, { error: 'started' });
      srv.list = srv.list.filter((m) => m.id !== parts[3]);
      return reply(200, { removed: true });
    }
    if (op === 'start') {
      if (srv.roster) return reply(200, { roster: srv.roster });
      const ids = new Set(JSON.parse(init.body).ids);
      const roster = srv.list.filter((m) => ids.has(m.id)).map(({ id, name }) => ({ id, name }));
      if (!roster.length) return reply(409, { error: 'empty' });
      srv.state = 'started';
      srv.roster = roster;
      return reply(200, { roster });
    }
    if (op === 'purge') return reply(200, { purged: true });
    return reply(404, { error: 'no-route' });
  };
  return srv;
}

/** The setup page with its QR elements, as index.astro renders them, on one origin. */
function page({ server = fakeServer(), origin = fakeOrigin(), seed, phone, view } = {}) {
  const doc = makeDoc();
  // `phone`: a window whose width query answers the page's phone rule (true) or not (false).
  if (phone !== undefined) doc.defaultView = { matchMedia: (q) => ({ matches: phone && q === '(max-width: 639px)' }) };
  if (view) doc.defaultView = view;
  const docListeners = {};
  doc.addEventListener = (type, fn) => (docListeners[type] ??= []).push(fn);
  let hidden = false;
  const add = (tag, id, parent = doc.body) => {
    const el = doc.createElement(tag);
    if (id) el.id = id;
    parent.append(el);
    return el;
  };
  const form = add('form', 'pd-setup');
  form.setAttribute('data-play', '/game/prize-draw/play/');
  add('input', 'pd-event', form);
  const mode = add('div', 'pd-mode', form);
  for (const m of ['admin', 'qr']) add('button', null, mode).setAttribute('data-mode', m);
  const adminBlock = add('div', 'pd-mode-admin', form);
  add('textarea', 'pd-names', adminBlock);
  for (const id of ['pd-count', 'pd-names-msg']) add('div', id, adminBlock);
  const qrBlock = add('div', 'pd-mode-qr', form);
  qrBlock.hidden = true;
  add('input', 'pd-qr-heads', qrBlock);
  add('button', 'pd-qr-open', qrBlock);
  add('div', 'pd-qr-joined', qrBlock);
  add('i', 'pd-qr-fill', add('div', null, qrBlock));
  for (const id of ['pd-qr-list', 'pd-qr-more', 'pd-qr-msg']) add('div', id, qrBlock);
  for (const id of ['pd-s0', 'pd-l0', 'pd-l1', 'pd-l2', 'pd-l3', 'pd-sched-msg', 'pd-prize-count', 'pd-start-msg']) add('div', id, form);
  for (const id of ['pd-s1', 'pd-s2', 'pd-s3']) add('input', id, form);
  for (const id of ['pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus']) add('button', id, form);
  for (let i = 1; i <= 5; i++) {
    const row = add('div', null, form);
    row.setAttribute('data-prize-row', String(i));
    add('input', `pd-prize-${i}`, row);
  }
  add('p', 'pd-games-line', form);
  add('div', 'pd-games-note', form);
  for (let r = 1; r <= 4; r++) for (const end of ['from', 'to']) add('span', `pd-game-r${r}-${end}`, form);
  for (const id of ['pd-game-r1', 'pd-game-r2', 'pd-game-r3', 'pd-game-r4', 'pd-game-final']) add('button', null, add('div', id, form)).setAttribute('data-game', '');
  add('button', 'pd-start', form).textContent = 'เริ่มงาน';

  const env = origin.tab('setup');
  if (seed) for (const [k, v] of Object.entries(seed)) env.localStorage.setItem(k, v);
  const timers = [];
  const visits = [];
  const opened = [];
  const win = { ...env, location: { assign: (u) => visits.push(u) }, confirm: () => true, addEventListener: () => {} };
  const later = (fn, ms) => {
    const t = { fn, ms, live: true };
    timers.push(t);
    return t;
  };
  const cancel = (t) => t && (t.live = false);
  mountSetup(doc, win, {
    webgl2: () => true,
    qr: {
      api: qrApi({ fetch: server.fetch, setTimeout: later, clearTimeout: cancel }),
      open: (u) => opened.push(u),
      setTimeout: later,
      clearTimeout: cancel,
      hidden: () => hidden,
    },
  });
  const $ = (id) => doc.getElementById(id);
  const kv = () => Object.fromEntries(origin.localStorage);
  /** Live poll timers (request timeouts ride on the same double: only POLL_MS ones are polls). */
  const polls = () => timers.filter((t) => t.live && t.ms === POLL_MS);
  /** Run every live poll timer once. */
  const tick = async () => {
    for (const t of polls()) {
      t.live = false;
      t.fn();
    }
    await origin.idle();
    await new Promise((r) => setImmediate(r));
  };
  const setHidden = (h) => {
    hidden = h;
    for (const fn of docListeners.visibilitychange ?? []) fn({});
  };
  const rows = () => $('pd-qr-list').querySelectorAll('div.jrow');
  const shownNames = () => rows().map((r) => r.querySelector('span.nm').textContent);
  const removeButton = (name) => rows().find((r) => r.querySelector('span.nm').textContent === name).querySelector('button');
  const qrMode = () => mode.querySelectorAll('button').find((b) => b.getAttribute('data-mode') === 'qr').click();
  const stored = () => decodeEvent(origin.get(DB.name, DB.store, DB.key) ?? null);
  const idle = async () => {
    await origin.idle();
    await new Promise((r) => setImmediate(r));
    await origin.idle();
  };
  return { doc, $, server, origin, kv, polls, tick, setHidden, rows, shownNames, removeButton, qrMode, visits, opened, stored, idle, submit: () => form.dispatch('submit') };
}

/** QR mode, the QR screen opened, the first list read. */
async function opened(names, opts = {}) {
  const p = page({ server: fakeServer(names), ...opts });
  p.qrMode();
  p.$('pd-qr-open').click();
  await p.idle();
  return p;
}

const everyUrl = (p) => [...p.server.calls.map((c) => c.url), ...p.opened, ...p.visits];

test('every QR element the script needs is in the page', () => {
  for (const id of QR_IDS) assert.ok(PAGE.includes(`id="${id}"`), `#${id} is not in index.astro`);
});

test('the open control opens the projector and creates ONE remote event; the token stays in the page storage and the header', async () => {
  const p = page({ server: fakeServer([member(1)]) });
  assert.equal(p.$('pd-mode-qr').hidden, true);
  p.qrMode();
  assert.equal(p.$('pd-mode-qr').hidden, false);
  assert.equal(p.$('pd-mode-admin').hidden, true);
  assert.equal(p.server.calls.length, 0, 'QR mode alone creates nothing');
  p.$('pd-qr-open').click();
  await p.idle();
  p.$('pd-qr-open').click();
  await p.idle();
  assert.deepEqual(p.opened, ['/game/prize-draw/play/', '/game/prize-draw/play/']);
  assert.equal(p.server.created, 1, 'a second open made a second event');
  const kv = p.kv();
  assert.equal(JSON.parse(kv[ADMIN_KEY]).adminToken, TOKEN, 'the token is not in the page storage');
  assert.ok(!kv[LOBBY_KEY].includes(TOKEN), 'the lobby record carries the token');
  assert.equal(parseLobby(kv[LOBBY_KEY], Date.now()).pin, PIN);
  for (const url of everyUrl(p)) assert.ok(!url.includes(TOKEN) && !url.includes(PIN), `secret in a URL: ${url}`);
  for (const c of p.server.calls.filter((c) => c.url !== '/api/draw/events')) assert.equal(c.headers[ADMIN_HEADER], TOKEN);
});

test('the review list: polled on a bounded interval, names as text only (hostile ones never reach the DOM), stopped while hidden', async () => {
  const hostile = [...Object.values(HOSTILE), '"><img src=x onerror=alert(1)>', `<b>${'W'.repeat(300)}</b>`, 'ฒำ'.repeat(200)];
  const names = [member(1, 'ออม ท.'), member(2, "O'Neil"), member(3, 'บีม'), ...hostile.map((n, i) => member(100 + i, n))];
  const writes = [];
  const p = page({ server: fakeServer(names) });
  p.doc.onWrite = (s) => writes.push(s);
  p.qrMode();
  p.$('pd-qr-heads').value = '10';
  p.$('pd-qr-heads').dispatch('input');
  p.$('pd-qr-open').click();
  await p.idle();
  assert.deepEqual(p.shownNames(), ['ออม ท.', "O'Neil", 'บีม']);
  assert.ok(p.rows().every((r) => r.querySelector('span.nm').getAttribute('dir') === 'auto'), 'a name was written without the name sink');
  assert.deepEqual(p.doc.htmlWrites, []);
  assert.deepEqual(p.$('pd-qr-list').all().filter((el) => ACTIVE_TAGS.includes(el.tagName)).map((el) => el.tagName), []);
  for (const h of hostile) assert.ok(!writes.some((w) => w.includes(h)), `a name out of contract reached the DOM: ${h.slice(0, 20)}`);
  assert.equal(p.$('pd-qr-joined').textContent, 'เข้าร่วมแล้ว 3 / 10 คน · ยังขาด 7 คน');
  assert.equal(p.$('pd-start').textContent, 'เริ่มด้วย 3 คน');
  assert.equal(parseLobby(p.kv()[LOBBY_KEY], Date.now()).joined, 3, 'the projector count is not the list');

  // One poll pending at a time, at the bounded interval; each tick reads the list again.
  assert.equal(p.polls().length, 1);
  const before = p.server.calls.length;
  p.server.list.push(member(4, 'นุ่น'));
  await p.tick();
  assert.equal(p.server.calls.length, before + 1);
  assert.deepEqual(p.shownNames(), ['ออม ท.', "O'Neil", 'บีม', 'นุ่น']);
  assert.equal(p.polls().length, 1);
  // Hidden: the pending poll is cancelled and nothing more is read; visible again: read at once.
  p.setHidden(true);
  assert.equal(p.polls().length, 0);
  const asleep = p.server.calls.length;
  await p.tick();
  assert.equal(p.server.calls.length, asleep);
  p.setHidden(false);
  await p.idle();
  assert.equal(p.server.calls.length, asleep + 1);
  assert.equal(p.polls().length, 1);
});

test('remove: the name leaves the list, and its id reaches neither the start nor the stored event', async () => {
  const names = Array.from({ length: 12 }, (_, i) => member(i + 1));
  const p = await opened(names);
  p.removeButton('P3').click();
  await p.idle();
  assert.ok(!p.shownNames().includes('P3'));
  assert.deepEqual(JSON.parse(p.kv()[ADMIN_KEY]).removed, [idOf(3)]);
  // A list read that still holds it (a stale listing) does not bring it back.
  p.server.list.push(member(3));
  await p.tick();
  assert.ok(!p.shownNames().includes('P3'));
  p.server.list = p.server.list.filter((m) => m.id !== idOf(3));
  p.submit();
  await p.idle();
  const start = p.server.calls.find((c) => c.url.endsWith('/start'));
  assert.ok(start, 'no start was sent');
  assert.ok(!start.body.ids.includes(idOf(3)), 'the removed id was sent to start');
  const ev = p.stored();
  assert.ok(ev, 'no event stored');
  assert.ok(!ev.setup.people.some((x) => x.name === 'P3'), 'the removed name is in the event');
});

test('start: the server freezes the roster and the stored event is exactly it; the lobby and the token go; the projector opens', async () => {
  const names = Array.from({ length: 14 }, (_, i) => member(i + 1));
  const p = await opened(names);
  p.$('pd-event').value = 'Party';
  // The server freezes fewer than the page reviewed (one name was fenced meanwhile): the event follows the
  // server, and the untouched schedule is proposed again for its size.
  p.server.roster = names.slice(0, 13).map(({ id, name }) => ({ id, name }));
  p.submit();
  await p.idle();
  const start = p.server.calls.find((c) => c.url.endsWith('/start'));
  assert.deepEqual(start.body.ids, names.map((m) => m.id), 'start did not send exactly the reviewed ids');
  const ev = p.stored();
  assert.ok(ev, 'no event stored');
  assert.deepEqual(ev.setup.people.map((x) => x.name), p.server.roster.map((m) => m.name));
  // ADR-0076 Identity: each person under their server join id, the PIN as the event key.
  assert.deepEqual(ev.setup.people, p.server.roster);
  assert.equal(ev.eventKey, PIN);
  assert.equal(ev.setup.schedule[0], 13);
  assert.equal(ev.setup.eventName, 'Party');
  assert.deepEqual(p.visits, ['/game/prize-draw/play/']);
  assert.equal(p.kv()[LOBBY_KEY], undefined, 'the lobby is still up after the start');
  assert.equal(p.kv()[ADMIN_KEY], undefined, 'the admin token outlived the start');
  assert.equal(p.polls().length, 0, 'the list is still polled after the start');
});

test('every start answer that is not a clean roster stores nothing, opens nothing, and says so', async () => {
  const names = Array.from({ length: 12 }, (_, i) => member(i + 1));
  const cases = [
    ['empty', { status: 409, body: { error: 'empty' } }, true],
    ['gone', { status: 404, body: { error: 'gone' } }, false],
    ['admin', { status: 401, body: { error: 'admin' } }, false],
    ['unavailable', { status: 503, body: { error: 'unavailable' } }, true],
    ['bad', { status: 200, body: { roster: [{ id: idOf(1), name: HOSTILE.markup }] } }, true],
  ];
  for (const [label, answer, keeps] of cases) {
    const p = await opened(names);
    p.server.answer.start = answer;
    p.submit();
    await p.idle();
    assert.equal(p.stored(), null, `${label}: an event was stored`);
    assert.deepEqual(p.visits, [], `${label}: the projector opened`);
    // Each answer shows its own entry, never another's: a page that says one thing for all of them fails.
    assert.equal(p.$('pd-start-msg').textContent, QR_PENDING[label], `${label}: not its own message`);
    assert.equal(ADMIN_KEY in p.kv(), keeps, `${label}: the session ${keeps ? 'was dropped' : 'outlived a dead event'}`);
  }
  // A roster holding a name this page removed is not the roster it reviewed.
  const p = await opened(names);
  p.removeButton('P2').click();
  await p.idle();
  p.server.answer.start = { status: 200, body: { roster: names.map(({ id, name }) => ({ id, name })) } };
  p.submit();
  await p.idle();
  assert.equal(p.stored(), null, 'a roster with a removed name was stored');
  assert.equal(p.$('pd-start-msg').textContent, QR_PENDING.bad, 'a roster with a removed name: not the bad-answer message');
});

test('a head count outside the event range never sends the start: a frozen roster cannot be undone', async () => {
  const p = await opened([member(1), member(2), member(3)]);
  p.submit();
  await p.idle();
  assert.equal(p.server.calls.filter((c) => c.url.endsWith('/start')).length, 0);
  assert.equal(p.stored(), null);
  assert.match(p.$('pd-start-msg').textContent, /ใส่ได้ 9 ถึง 200 ชื่อ/);
});

test('a reload finds its session: QR mode, the list polled again; an event already started finishes from its frozen roster', async () => {
  const names = Array.from({ length: 10 }, (_, i) => member(i + 1));
  const first = await opened(names);
  const kv = first.kv();
  const server = fakeServer(names);
  server.state = 'started';
  server.roster = names.map(({ id, name }) => ({ id, name }));
  const p = page({ server, seed: { [ADMIN_KEY]: kv[ADMIN_KEY], [LOBBY_KEY]: kv[LOBBY_KEY] } });
  await p.idle();
  assert.equal(p.$('pd-mode-qr').hidden, false, 'a stored session did not bring QR mode back');
  assert.equal(server.created, 0, 'a reload created another event');
  assert.deepEqual(p.shownNames(), names.map((m) => m.name));
  assert.equal(p.polls().length, 0, 'a started event is still polled');
  p.submit();
  await p.idle();
  assert.deepEqual(p.stored()?.setup.people.map((x) => x.name), names.map((m) => m.name));
});

test('an admin-mode start over an open QR event purges it and drops the lobby', async () => {
  const p = await opened([member(1)]);
  p.doc.body.querySelector('#pd-mode').querySelectorAll('button').find((b) => b.getAttribute('data-mode') === 'admin').click();
  p.$('pd-names').value = Array.from({ length: 9 }, (_, i) => `N${i}`).join('\n');
  p.$('pd-names').dispatch('input');
  p.submit();
  await p.idle();
  assert.ok(p.stored(), 'the admin-mode event was not stored');
  assert.ok(p.server.calls.some((c) => c.url.endsWith('/purge') && c.headers[ADMIN_HEADER] === TOKEN), 'the abandoned QR event was not purged');
  assert.equal(p.kv()[LOBBY_KEY], undefined);
  assert.equal(p.kv()[ADMIN_KEY], undefined);
});

const toAdmin = (p) => p.$('pd-mode').querySelectorAll('button').find((b) => b.getAttribute('data-mode') === 'admin').click();
const typeNames = (p, n) => {
  p.$('pd-names').value = Array.from({ length: n }, (_, i) => `N${i}`).join('\n');
  p.$('pd-names').dispatch('input');
};

test('a stale setup tab never brings the lobby back once another tab has started the event', async () => {
  const origin = fakeOrigin();
  const a = await opened(Array.from({ length: 12 }, (_, i) => member(i + 1)), { origin });
  // Tab B was opened on the same QR event (it finds the session at mount), then left polling.
  const b = page({ server: a.server, origin });
  await b.idle();
  assert.ok(b.kv()[LOBBY_KEY], 'tab B never took the session up: this test proves nothing');
  a.submit();
  await a.idle();
  const started = a.stored();
  assert.equal(started?.eventKey, PIN, 'tab A did not store its event');
  assert.equal(a.kv()[LOBBY_KEY], undefined);
  // Its start, pressed before any poll of its own has come back, does not replace the stored event.
  b.submit();
  await b.idle();
  assert.deepEqual(b.stored(), started, 'the stale tab replaced the started event');
  assert.deepEqual(b.visits, []);
  assert.equal(b.$('pd-start-msg').textContent, QR_PENDING.noEvent);
  await b.tick();
  await b.idle();
  assert.equal(b.kv()[LOBBY_KEY], undefined, 'the stale tab wrote the lobby over the started event');
  assert.equal(b.kv()[ADMIN_KEY], undefined, 'the stale tab wrote the session back');
  assert.equal(b.polls().length, 0, 'the stale tab still polls an event that has started');
});

test('a stale tab whose poll comes back before its start still never replaces the started event', async () => {
  const origin = fakeOrigin();
  const a = await opened(Array.from({ length: 12 }, (_, i) => member(i + 1)), { origin });
  const b = page({ server: a.server, origin });
  await b.idle();
  a.submit();
  await a.idle();
  const started = a.stored();
  await b.tick();
  await b.idle();
  b.submit();
  await b.idle();
  assert.deepEqual(b.stored(), started, 'the stale tab replaced the started event');
  assert.equal(b.kv()[LOBBY_KEY], undefined);
});

test('a session whose event was stored after it was opened writes no lobby, even with its key still in storage', async () => {
  // The start stored the event, then the tab died before it dropped the session: the key is still there.
  const origin = fakeOrigin();
  const a = await opened(Array.from({ length: 12 }, (_, i) => member(i + 1)), { origin });
  const left = a.kv()[ADMIN_KEY];
  a.submit();
  await a.idle();
  assert.equal(a.stored()?.eventKey, PIN);
  const b = page({ server: a.server, origin, seed: { [ADMIN_KEY]: left } });
  await b.idle();
  assert.equal(b.kv()[LOBBY_KEY], undefined, 'a lobby went up over the stored event');
  assert.equal(b.kv()[ADMIN_KEY], undefined, 'the dead session was kept');
  assert.equal(b.polls().length, 0);
});

test('an admin-mode start in another tab ends the open QR event there too: purged, and its tab writes nothing more', async () => {
  const origin = fakeOrigin();
  const server = fakeServer(Array.from({ length: 12 }, (_, i) => member(i + 1)));
  // Tab C was opened before the QR event existed, so it holds no session of its own.
  const c = page({ server, origin });
  const a = page({ server, origin });
  a.qrMode();
  a.$('pd-qr-open').click();
  await a.idle();
  assert.ok(a.kv()[LOBBY_KEY]);
  typeNames(c, 9);
  c.submit();
  await c.idle();
  const ev = c.stored();
  assert.ok(ev && ev.eventKey !== PIN, 'the admin-mode event was not stored');
  assert.ok(server.calls.some((x) => x.url.endsWith('/purge') && x.headers[ADMIN_HEADER] === TOKEN), 'the QR event was not purged');
  assert.equal(c.kv()[LOBBY_KEY], undefined);
  await a.tick();
  await a.idle();
  assert.equal(a.kv()[LOBBY_KEY], undefined, 'the QR tab wrote its lobby over the admin-mode event');
  assert.equal(a.kv()[ADMIN_KEY], undefined);
});

test('a create answered after the QR mode ended is dropped: no session, no lobby over the stored event, the remote event purged', async () => {
  for (const startAdmin of [true, false]) {
    const server = fakeServer([]);
    const real = server.fetch;
    let release;
    server.fetch = (url, init) => (url === '/api/draw/events' ? new Promise((r) => (release = () => r(real(url, init)))) : real(url, init));
    const p = page({ server });
    p.qrMode();
    p.$('pd-qr-open').click();
    toAdmin(p);
    // The create goes out after one store read; it is still unanswered here.
    await p.idle();
    assert.ok(release, 'the create was never sent');
    if (startAdmin) {
      typeNames(p, 9);
      p.submit();
      await p.idle();
      assert.ok(p.stored(), 'the admin-mode event was not stored');
    }
    release();
    await p.idle();
    const label = startAdmin ? 'after an admin-mode start' : 'while in admin mode';
    assert.equal(p.kv()[LOBBY_KEY], undefined, `${label}: the late create put a lobby up`);
    assert.equal(p.kv()[ADMIN_KEY], undefined, `${label}: the late create kept a session`);
    assert.equal(p.polls().length, 0, `${label}: the late create started polling`);
    assert.ok(server.calls.some((x) => x.url.endsWith('/purge')), `${label}: the orphaned remote event was not purged`);
  }
});

test('a frozen roster below the event range ends that QR event, and the open control makes a new one', async () => {
  const names = Array.from({ length: 9 }, (_, i) => member(i + 1));
  const p = await opened(names);
  // One name leaves after the review: the server freezes eight, which no event can start with.
  p.server.list = p.server.list.slice(0, 8);
  p.submit();
  await p.idle();
  assert.equal(p.server.state, 'started');
  assert.equal(p.stored(), null, 'an event was stored from a roster outside the range');
  assert.equal(p.$('pd-start-msg').textContent, HEAD_RANGE);
  assert.ok(p.server.calls.some((c) => c.url.endsWith('/purge')), 'the frozen remote event was left for the phones to wait on');
  assert.equal(p.kv()[ADMIN_KEY], undefined);
  assert.equal(p.kv()[LOBBY_KEY], undefined);
  // Recovery: a new QR event, joined by nine, starts.
  Object.assign(p.server, { state: 'open', roster: null, list: [...names] });
  p.$('pd-qr-open').click();
  await p.idle();
  assert.equal(p.server.created, 2, 'the open control could not make a new event');
  assert.ok(p.kv()[LOBBY_KEY]);
  p.submit();
  await p.idle();
  assert.deepEqual(p.stored()?.setup.people.map((x) => x.name), names.map((m) => m.name));
});

test('the line under the review list counts past the rows in view: 15 at 640px and up, 5 below (Gh308Gaps gap 2 B)', async () => {
  const names = Array.from({ length: 20 }, (_, i) => member(i + 1));
  const wide = await opened(names, { phone: false });
  assert.equal(wide.$('pd-qr-more').textContent, QR_COPY.more(5));
  const phone = await opened(names, { phone: true });
  assert.equal(phone.$('pd-qr-more').textContent, QR_COPY.more(15));
  const few = await opened(names.slice(0, 5), { phone: true });
  assert.equal(few.$('pd-qr-more').textContent, '', 'five names fill the phone window: nothing to scroll to');
  // The page keeps the board's 312px window at every width and its phone rule is the query the script asks.
  const phoneRule = PAGE.slice(PAGE.indexOf('@media (max-width: 639px)'));
  assert.ok(PAGE.includes('@media (max-width: 639px)'), 'the phone media rule moved');
  assert.match(PAGE, /\.jlist \{[^}]*max-block-size: 312px;/);
  assert.doesNotMatch(phoneRule, /max-block-size: 952px/);

  // The width changes between polls: the line follows the query's own change, not the next poll, and still
  // does once polling has stopped.
  const listeners = new Set();
  let narrow = false;
  const query = {
    get matches() {
      return narrow;
    },
    addEventListener: (type, fn) => type === 'change' && listeners.add(fn),
    removeEventListener: (type, fn) => type === 'change' && listeners.delete(fn),
  };
  const turn = (to) => {
    narrow = to;
    for (const fn of [...listeners]) fn({ matches: to });
  };
  const live = await opened(names, { view: { matchMedia: (q) => (q === '(max-width: 639px)' ? query : { matches: false }) } });
  assert.equal(live.$('pd-qr-more').textContent, QR_COPY.more(5));
  turn(true);
  assert.equal(live.$('pd-qr-more').textContent, QR_COPY.more(15), 'a narrowing window kept the wide count');
  live.server.state = 'started';
  await live.tick();
  assert.equal(live.polls().length, 0);
  turn(false);
  assert.equal(live.$('pd-qr-more').textContent, QR_COPY.more(5), 'once polling stopped, the count stayed stale');
  // Leaving QR mode lets go of the query; coming back takes it up once.
  toAdmin(live);
  assert.equal(listeners.size, 0, 'the width listener outlived QR mode');
  live.qrMode();
  assert.equal(listeners.size, 1);

  // No matchMedia: the window's own width decides, and a resize re-renders; a window with neither is wide.
  const resizes = new Set();
  const bare = { innerWidth: 375, addEventListener: (t, fn) => t === 'resize' && resizes.add(fn), removeEventListener: (t, fn) => t === 'resize' && resizes.delete(fn) };
  const old = await opened(names, { view: bare });
  assert.equal(old.$('pd-qr-more').textContent, QR_COPY.more(15), 'a 375px window without matchMedia counted as wide');
  bare.innerWidth = 1024;
  for (const fn of [...resizes]) fn({});
  assert.equal(old.$('pd-qr-more').textContent, QR_COPY.more(5));
  const none = await opened(names, { view: {} });
  assert.equal(none.$('pd-qr-more').textContent, QR_COPY.more(5));
});

test('a create answered after another tab stored an event is dropped: the generation is read before the create is sent', async () => {
  const origin = fakeOrigin();
  const names = Array.from({ length: 12 }, (_, i) => member(i + 1));
  const server = fakeServer(names);
  const real = server.fetch;
  let release;
  server.fetch = (url, init) => (url === '/api/draw/events' ? new Promise((r) => (release = () => r(real(url, init)))) : real(url, init));
  const admin = page({ origin, server });
  const qr = page({ origin, server });
  qr.qrMode();
  qr.$('pd-qr-open').click();
  await qr.idle();
  assert.ok(release, 'the create was never sent');
  typeNames(admin, 12);
  admin.submit();
  await admin.idle();
  const committed = admin.stored();
  assert.ok(committed, 'the admin-mode event was not stored');
  release();
  await qr.idle();
  assert.equal(qr.kv()[LOBBY_KEY], undefined, 'the late create put a lobby over the stored event');
  assert.equal(qr.kv()[ADMIN_KEY], undefined, 'the late create kept a session');
  assert.deepEqual(qr.stored(), committed);
  assert.ok(server.calls.some((c) => c.url.endsWith('/purge')), 'the orphaned remote event was not purged');
});

test('a list read still out for a dropped session never stops the next session from being polled', async () => {
  const origin = fakeOrigin();
  const names = Array.from({ length: 12 }, (_, i) => member(i + 1));
  const server = fakeServer(names);
  const real = server.fetch;
  let hold = false;
  let release;
  // Every create answers a new event id, so the second session is not the first.
  server.fetch = async (url, init) => {
    if (hold && url.endsWith('/names')) {
      const answer = real(url, init);
      return new Promise((r) => (release = () => r(answer)));
    }
    const res = await real(url, init);
    if (url !== '/api/draw/events') return res;
    const body = await res.json();
    return { status: res.status, json: async () => ({ ...body, eventId: `E${server.created}`.padEnd(22, 'x') }) };
  };
  const admin = page({ origin, server });
  const qr = page({ origin, server });
  qr.qrMode();
  qr.$('pd-qr-open').click();
  await qr.idle();
  const first = JSON.parse(qr.kv()[ADMIN_KEY]).eventId;
  hold = true;
  await qr.tick();
  assert.ok(release, 'no list read was held');
  // Another tab stores an event: the first session ends at its next write.
  typeNames(admin, 12);
  admin.submit();
  await admin.idle();
  qr.$('pd-event').dispatch('input');
  await qr.idle();
  assert.equal(qr.kv()[ADMIN_KEY], undefined, 'the first session outlived the stored event');
  hold = false;
  qr.$('pd-qr-open').click();
  await qr.idle();
  assert.notEqual(JSON.parse(qr.kv()[ADMIN_KEY]).eventId, first);
  assert.deepEqual(qr.shownNames(), names.map((m) => m.name), 'the new session was never read');
  assert.equal(qr.polls().length, 1, 'the new session is not polled');
  release();
  await qr.idle();
  assert.deepEqual(qr.shownNames(), names.map((m) => m.name), 'the old answer reached the new session');
  assert.equal(qr.polls().length, 1, 'the old answer cancelled or doubled the new poll');
});
