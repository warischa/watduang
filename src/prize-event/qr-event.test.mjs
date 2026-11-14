// node --test — gh#308: the admin side of a QR-mode prize draw (qr-event.ts), on a fake fetch. No network.
// Pins: every answer of every admin route maps to exactly one state; the admin token travels only in the
// X-Draw-Admin header, never in a URL; names out of contract never reach the review list; a frozen roster
// is taken only when it is clean, and a roster holding a name this page removed is refused; the lobby
// record the projector reads carries no admin token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_HEADER,
  ADMIN_KEY,
  LOBBY_KEY,
  classifyCreate,
  classifyNames,
  classifyPurge,
  classifyRemove,
  classifyStart,
  encodeLobby,
  encodeSession,
  frozenNames,
  joinLink,
  parseLobby,
  parseSession,
  qrApi,
} from './qr-event.ts';
import { HOSTILE } from './fake-dom.mjs';

const EV = 'AbCdEfGhIjKlMnOpQrStUv';
const TOKEN = 'T'.repeat(43);
const ID1 = 'a0a1a2a3a4a5a6a7a8a9aA';
const ID2 = 'b0b1b2b3b4b5b6b7b8b9bB';
const ID3 = 'c0c1c2c3c4c5c6c7c8c9cC';
// Removals in the fixture: a session that forgot them would let a stale listing bring a removed name back.
const SESSION = { eventId: EV, pin: '048213', adminToken: TOKEN, expiresAt: '2026-11-16T00:00:00.000Z', removed: [ID1, ID3], gen: null };

/** A fetch double: answers from `script` (a function of url and init), records every call. */
function fakeFetch(script) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const a = await script(url, init);
    if (a instanceof Error) throw a;
    return { status: a.status, json: async () => (a.body === undefined ? JSON.parse('<') : a.body) };
  };
  return { fetch, calls };
}
const api = (script) => {
  const f = fakeFetch(script);
  return { ...f, client: qrApi({ fetch: f.fetch, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) }) };
};

const FAILS = [
  [null, null, 'unavailable'],
  [500, {}, 'unavailable'],
  [503, { error: 'unavailable' }, 'unavailable'],
  [401, { error: 'admin' }, 'admin'],
  [404, { error: 'gone' }, 'gone'],
  [404, { error: 'no-route' }, 'bad'],
  [405, { error: 'method' }, 'bad'],
  [400, { error: 'bad-request' }, 'bad'],
  [413, { error: 'too-large' }, 'bad'],
  [418, {}, 'bad'],
];

test('create: every answer maps to one state', () => {
  const ok = { eventId: EV, pin: '048213', adminToken: TOKEN, expiresAt: '2026-11-16T00:00:00.000Z' };
  assert.deepEqual(classifyCreate(201, ok), { kind: 'created', event: ok });
  for (const bad of [{ ...ok, eventId: 'short' }, { ...ok, pin: '12' }, { ...ok, adminToken: 'x' }, { ...ok, expiresAt: 'soon' }, null]) {
    assert.deepEqual(classifyCreate(201, bad), { kind: 'bad' }, JSON.stringify(bad));
  }
  assert.deepEqual(classifyCreate(200, ok), { kind: 'bad' }, 'only 201 creates');
  for (const [s, b, kind] of FAILS) {
    // create carries no token, so a 401 or a 404 gone is not one of its answers: out of contract is bad.
    const want = kind === 'admin' || kind === 'gone' ? 'bad' : kind;
    assert.deepEqual(classifyCreate(s, b), { kind: want }, `${s} ${JSON.stringify(b)}`);
  }
});

test('names: open and started lists, every failure; names out of contract are dropped, never shown', () => {
  const names = [
    { id: ID1, name: 'ออม ท.', joined: 'x' },
    { id: ID2, name: "O'Neil", joined: 'x' },
  ];
  assert.deepEqual(classifyNames(200, { state: 'open', names }), { kind: 'names', state: 'open', names: names.map(({ id, name }) => ({ id, name })) });
  assert.equal(classifyNames(200, { state: 'started', names }).state, 'started');
  assert.deepEqual(classifyNames(200, { state: 'closed', names }), { kind: 'bad' });
  assert.deepEqual(classifyNames(200, { state: 'open' }), { kind: 'bad' });
  const hostile = [
    ...Object.values(HOSTILE).map((name, i) => ({ id: `h${i}h1h2h3h4h5h6h7h8h9hAh`.slice(0, 22), name })),
    { id: ID3, name: 'W'.repeat(5000) },
    { id: 'not an id', name: 'ok' },
    { id: ID1, name: 7 },
    { id: ID3, name: 'ออม ท.' }, // a second name with a key already listed
  ];
  const got = classifyNames(200, { state: 'open', names: [...names, ...hostile] });
  assert.deepEqual(got.names.map((n) => n.name), ['ออม ท.', "O'Neil"]);
  for (const [s, b, kind] of FAILS) assert.deepEqual(classifyNames(s, b), { kind }, `${s}`);
});

test('remove: removed (true or already), started, every failure', () => {
  assert.deepEqual(classifyRemove(200, { removed: true }), { kind: 'removed' });
  assert.deepEqual(classifyRemove(200, { removed: false }), { kind: 'removed' }, 'a repeat is still removed');
  assert.deepEqual(classifyRemove(200, {}), { kind: 'bad' });
  assert.deepEqual(classifyRemove(409, { error: 'started' }), { kind: 'started' });
  assert.deepEqual(classifyRemove(409, { error: 'taken' }), { kind: 'bad' });
  for (const [s, b, kind] of FAILS) assert.deepEqual(classifyRemove(s, b), { kind }, `${s}`);
});

test('start: a clean roster, empty, every failure; a roster out of contract is bad, never repaired', () => {
  const roster = [
    { id: ID1, name: 'ออม ท.' },
    { id: ID2, name: 'บีม' },
  ];
  assert.deepEqual(classifyStart(200, { roster }), { kind: 'roster', roster });
  assert.deepEqual(classifyStart(409, { error: 'empty' }), { kind: 'empty' });
  assert.deepEqual(classifyStart(409, { error: 'started' }), { kind: 'bad' });
  for (const bad of [
    [{ id: ID1, name: HOSTILE.markup }],
    [{ id: ID1, name: 'W'.repeat(13) }],
    [{ id: 'x', name: 'ok' }],
    [roster[0], { id: ID1, name: 'อื่น' }],
    [roster[0], { id: ID2, name: 'ออม ท.' }],
    [],
    'nope',
  ]) {
    assert.deepEqual(classifyStart(200, { roster: bad }), { kind: 'bad' }, JSON.stringify(bad));
  }
  for (const [s, b, kind] of FAILS) assert.deepEqual(classifyStart(s, b), { kind }, `${s}`);
});

test('purge: purged, every failure', () => {
  assert.deepEqual(classifyPurge(200, { purged: true }), { kind: 'purged' });
  assert.deepEqual(classifyPurge(200, {}), { kind: 'bad' });
  for (const [s, b, kind] of FAILS) assert.deepEqual(classifyPurge(s, b), { kind }, `${s}`);
});

test('the client: routes and methods, the admin token only in its header, never in any URL', async () => {
  const { client, calls } = api((url) => {
    if (url.endsWith('/events')) return { status: 201, body: { eventId: EV, pin: '048213', adminToken: TOKEN, expiresAt: '2026-11-16T00:00:00.000Z' } };
    if (url.endsWith('/names')) return { status: 200, body: { state: 'open', names: [] } };
    if (url.endsWith('/remove')) return { status: 200, body: { removed: true } };
    if (url.endsWith('/start')) return { status: 200, body: { roster: [{ id: ID1, name: 'บีม' }] } };
    if (url.endsWith('/purge')) return { status: 200, body: { purged: true } };
    return { status: 404, body: { error: 'no-route' } };
  });
  assert.equal((await client.create()).kind, 'created');
  assert.equal((await client.names(SESSION)).kind, 'names');
  assert.equal((await client.remove(SESSION, ID2)).kind, 'removed');
  assert.equal((await client.start(SESSION, [ID1])).kind, 'roster');
  assert.equal((await client.purge(SESSION)).kind, 'purged');
  assert.deepEqual(
    calls.map((c) => `${c.init.method} ${c.url}`),
    [
      'POST /api/draw/events',
      `GET /api/draw/events/${EV}/names`,
      `POST /api/draw/events/${EV}/names/${ID2}/remove`,
      `POST /api/draw/events/${EV}/start`,
      `POST /api/draw/events/${EV}/purge`,
    ],
  );
  assert.equal(calls[0].init.headers[ADMIN_HEADER], undefined, 'create sends no token');
  for (const c of calls.slice(1)) assert.equal(c.init.headers[ADMIN_HEADER], TOKEN);
  for (const c of calls) {
    assert.ok(!c.url.includes(TOKEN), `token in a URL: ${c.url}`);
    assert.ok(!c.url.includes(SESSION.pin), `PIN in a URL: ${c.url}`);
    assert.equal(c.init.cache, 'no-store');
  }
  assert.deepEqual(JSON.parse(calls[3].init.body), { ids: [ID1] }, 'start sends exactly the reviewed ids');
});

test('the client: a refused fetch, an unreadable body and a timeout are each one state; a bad id never leaves the page', async () => {
  const down = api(() => new Error('offline'));
  assert.equal((await down.client.names(SESSION)).kind, 'unavailable');
  const garbled = api(() => ({ status: 200 }));
  assert.equal((await garbled.client.names(SESSION)).kind, 'bad');
  // A send that never answers is aborted at the timeout: unavailable, not a hang.
  let aborted = false;
  const timers = [];
  const hang = fakeFetch((_u, init) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => ((aborted = true), reject(new Error('abort'))))));
  const slow = qrApi({ fetch: hang.fetch, setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearTimeout: () => {} });
  const pending = slow.names(SESSION);
  await Promise.resolve();
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal((await pending).kind, 'unavailable');
  assert.ok(aborted);
  const none = api(() => ({ status: 200, body: {} }));
  assert.equal((await none.client.remove(SESSION, '../../x')).kind, 'bad');
  assert.equal((await none.client.names({ ...SESSION, eventId: '../x' })).kind, 'bad');
  assert.equal(none.calls.length, 0, 'a malformed id is never sent');
});

test('frozenNames: exactly the roster, in its order; a roster holding a removed id is refused', () => {
  const roster = [
    { id: ID2, name: 'บีม' },
    { id: ID1, name: 'ออม ท.' },
  ];
  assert.deepEqual(frozenNames(roster, []), ['บีม', 'ออม ท.']);
  assert.equal(frozenNames(roster, [ID1]), null);
});

test('session and lobby records: round trip, expiry, and the lobby never carries the admin token', () => {
  const now = Date.parse('2026-11-14T00:00:00Z');
  assert.deepEqual(parseSession(encodeSession(SESSION), now), SESSION);
  assert.deepEqual(parseSession(encodeSession(SESSION), now).removed, [ID1, ID3], 'the removals did not survive');
  // The generation it was opened over: the stored event's key, or null for none.
  const over = { ...SESSION, gen: '0123456789abcdef' };
  assert.deepEqual(parseSession(encodeSession(over), now), over);
  for (const gen of [undefined, 7, 'x'.repeat(65)]) {
    assert.equal(parseSession(JSON.stringify({ ...SESSION, gen }), now), null, `a session with gen ${JSON.stringify(gen)} was read`);
  }
  assert.equal(parseSession(encodeSession(SESSION), Date.parse('2026-11-17T00:00:00Z')), null, 'an expired session is dropped');
  assert.equal(parseSession('{', now), null);
  assert.equal(parseSession(JSON.stringify({ ...SESSION, adminToken: 'x' }), now), null);
  const lobby = encodeLobby(SESSION, 'Party 2570', 12);
  assert.ok(!lobby.includes(TOKEN), 'the lobby record holds the admin token');
  assert.deepEqual(Object.keys(JSON.parse(lobby)).sort(), ['eventId', 'eventName', 'expiresAt', 'joined', 'pin']);
  assert.deepEqual(parseLobby(lobby, now), { eventId: EV, pin: '048213', eventName: 'Party 2570', joined: 12, expiresAt: SESSION.expiresAt });
  assert.equal(parseLobby(lobby, Date.parse('2026-11-17T00:00:00Z')), null);
  assert.equal(parseLobby(JSON.stringify({ ...JSON.parse(lobby), eventId: '../x' }), now), null);
  assert.notEqual(ADMIN_KEY, LOBBY_KEY);
});

test('joinLink: the event id and PIN in the fragment, never the query', () => {
  const link = joinLink('https://watduang.com', EV, '048213');
  assert.equal(link, `https://watduang.com/game/prize-draw/join/#event=${EV}&pin=048213`);
  assert.equal(new URL(link).search, '');
});
