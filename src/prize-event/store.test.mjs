// node --test — the prize-draw event store (store.ts) on the in-memory IndexedDB double (fake-idb.mjs):
// compare-and-set, commit-before-resolve, aborted transactions, refused browsers, the localStorage
// migration, and the cross-tab notice. The double's own semantics are pinned at the bottom, so a double
// that stopped modelling a behaviour the store relies on fails here rather than passing everything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, createEvent, drawNext, encodeEvent, revealDrawn } from './event.ts';
import { DB, REFUSED_BROWSER, SEALED, openEventStore } from './store.ts';
import { fakeOrigin } from './fake-idb.mjs';
import { proposeSchedule } from '../prize-draw/schedule.ts';

function seeded(seed) {
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
const ev = (seed = 1, n = 12) =>
  createEvent({ eventName: 'Party', names: Array.from({ length: n }, (_, i) => `P${i + 1}`), schedule: proposeSchedule(n), prizes: ['A'] }, seeded(seed));
const stored = (o) => o.get(DB.name, DB.store, DB.key);
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function open(o, name = 'A') {
  const p = openEventStore(o.tab(name));
  if (o.manual) while (o.step()) await tick();
  else await o.idle();
  return p;
}

// Literal on purpose: this pins the owner-approved wording (gh#313), not the constant.
test('the refused-browser message is the owner-approved copy', () => {
  assert.equal(REFUSED_BROWSER, 'เบราว์เซอร์นี้บันทึกงานจับรางวัลไม่ได้ ลองเปิดด้วยเบราว์เซอร์รุ่นใหม่');
});

test('compare-and-set: a write lands only on the text it expected; otherwise nothing is written and the stored state comes back', async () => {
  const o = fakeOrigin();
  const s = await open(o);
  const first = ev(1);
  const second = ev(2);
  assert.deepEqual(await s.load(), { raw: null, state: null });
  const a = await s.put(null, first);
  assert.deepEqual(a, { ok: true, raw: encodeEvent(first) });
  assert.equal(stored(o), encodeEvent(first));
  const b = await s.put(null, second);
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'stale');
  assert.equal(b.now.raw, encodeEvent(first));
  assert.equal(stored(o), encodeEvent(first), 'a stale write landed');
  const c = await s.put(encodeEvent(first), second);
  assert.equal(c.ok, true);
  assert.deepEqual((await s.load()).state, second);
});

test('put resolves only after its transaction committed', async () => {
  const o = fakeOrigin({ manual: true });
  const s = await open(o);
  let result = null;
  void s.put(null, ev(1)).then((r) => (result = r));
  await tick();
  let steps = 0;
  while (result === null) {
    assert.ok(o.step(), 'the put never resolved');
    steps++;
    await tick();
  }
  assert.equal(result.ok, true);
  assert.equal(o.log.length, 1, 'resolved ok without a committed write');
  assert.ok(steps >= 3, `resolved after ${steps} tasks: get, put and commit are three`);
});

test('an aborted commit resolves failed, and nothing of it is stored', async () => {
  const o = fakeOrigin();
  const s = await open(o);
  const first = ev(1);
  await s.put(null, first);
  o.faults.abortCommits = 1;
  const r = await s.put(encodeEvent(first), revealDrawn(drawNext(first, seeded(3))));
  assert.deepEqual(r, { ok: false, reason: 'failed' });
  assert.equal(stored(o), encodeEvent(first));
  assert.equal(o.faults.abortCommits, 0, 'the fault was never consumed: this test measured nothing');
});

test('two tabs writing from the same stored text: exactly one lands, the other is stale and gets the winner back, in both creation orders', async () => {
  for (const order of [['A', 'B'], ['B', 'A']]) {
    const o = fakeOrigin({ manual: true });
    const stores = { A: await open(o, 'A'), B: await open(o, 'B') };
    const base = ev(1);
    o.put(DB.name, DB.version, DB.store, DB.key, encodeEvent(base));
    const next = { A: revealDrawn(drawNext(base, seeded(10))), B: revealDrawn(drawNext(base, seeded(20))) };
    assert.notDeepEqual(next.A.rounds, next.B.rounds, 'both draws are equal: a lost draw could hide');
    const results = {};
    for (const t of order) void stores[t].put(encodeEvent(base), next[t]).then((r) => (results[t] = r));
    while (o.step()) await tick();
    await tick();
    const [winner, loser] = order;
    assert.equal(results[winner].ok, true, `${order}: the first writer lost`);
    assert.equal(results[loser].reason, 'stale', `${order}: the second writer was not refused`);
    assert.equal(results[loser].now.raw, encodeEvent(next[winner]));
    assert.equal(stored(o), encodeEvent(next[winner]));
    assert.deepEqual(o.log.map((w) => w.by), [winner], `${order}: more than one write landed`);
  }
});

test('refused browsers: no IndexedDB, IndexedDB that throws on access or on open, an open that errors', async () => {
  const cases = {
    'no IndexedDB': () => ({ localStorage: null }),
    'null IndexedDB': () => ({ indexedDB: null }),
    'IndexedDB throws on access': () => ({ get indexedDB() { throw new Error('SecurityError'); } }),
    'open throws': (o) => ((o.faults.open = 'throw'), o.tab('A')),
    'open errors': (o) => ((o.faults.open = 'error'), o.tab('A')),
  };
  for (const [label, env] of Object.entries(cases)) {
    const o = fakeOrigin();
    const p = openEventStore(env(o));
    await o.idle();
    assert.equal(await p, null, label);
  }
  const o = fakeOrigin();
  assert.notEqual(await open(o), null, 'positive control: a working origin opens');
});

test('migration: an event saved in localStorage moves into IndexedDB once, and the old key is sealed only after the commit', async () => {
  const o = fakeOrigin({ manual: true });
  const legacy = encodeEvent(revealDrawn(drawNext(ev(5), seeded(6))));
  o.localStorage.set(STORAGE_KEY, legacy);
  const p = openEventStore(o.tab('A'));
  let removedBeforeCommit = false;
  while (o.step()) {
    if (o.localStorage.get(STORAGE_KEY) !== legacy && o.log.length === 0) removedBeforeCommit = true;
    await tick();
  }
  const s = await p;
  assert.equal(removedBeforeCommit, false, 'the old key was removed before the copy committed');
  assert.equal(stored(o), legacy);
  assert.equal(o.localStorage.get(STORAGE_KEY), SEALED, 'the old key was not sealed');
  assert.equal((await Promise.all([s.load(), (async () => { while (o.step()) await tick(); })()]))[0].raw, legacy);
});

test('migration interrupted: an aborted copy keeps the old key, and the next open copies it', async () => {
  const o = fakeOrigin();
  const legacy = encodeEvent(ev(7));
  o.localStorage.set(STORAGE_KEY, legacy);
  o.faults.abortCommits = 1;
  await open(o);
  assert.equal(stored(o), undefined);
  assert.equal(o.localStorage.get(STORAGE_KEY), legacy, 'the old key went although nothing was copied');
  const s = await open(o, 'reload');
  assert.equal((await s.load()).raw, legacy);
  assert.equal(o.localStorage.get(STORAGE_KEY), SEALED);
});

test('migration interrupted after the commit (the seal could not be written): the open refuses, and the next open accepts the identical record and seals', async () => {
  const o = fakeOrigin();
  const legacy = encodeEvent(ev(8));
  o.localStorage.set(STORAGE_KEY, legacy);
  o.faults.setItemThrows = true;
  assert.equal(await open(o), null, 'a store opened without its seal');
  assert.equal(stored(o), legacy, 'precondition: the copy committed');
  assert.equal(o.localStorage.get(STORAGE_KEY), legacy, 'the old key changed although the seal failed');
  o.faults.setItemThrows = false;
  const s = await open(o, 'reload');
  assert.equal(s.status(), 'open');
  assert.equal(o.localStorage.get(STORAGE_KEY), SEALED);
  assert.deepEqual(o.log.map((w) => w.by), ['A'], 'the reload copied the old event again');
  // The event walks on in IndexedDB; a later open finds the seal and leaves the record alone.
  const moved = revealDrawn(drawNext(ev(8), seeded(9)));
  assert.equal((await s.put(legacy, moved)).ok, true);
  assert.equal((await open(o, 'later')).status(), 'open');
  assert.equal(stored(o), encodeEvent(moved));
});

test('migration copies nothing from text that does not decode, and seals over it (it is no event anywhere)', async () => {
  const o = fakeOrigin();
  o.localStorage.set(STORAGE_KEY, '{"v":1,');
  assert.equal((await open(o)).status(), 'open');
  assert.equal(o.localStorage.get(STORAGE_KEY), SEALED);
  assert.deepEqual(o.log, []);
});

test('migration with localStorage refused: the old key cannot be read or sealed, so the open refuses and nothing is copied', async () => {
  const o = fakeOrigin();
  o.localStorage.set(STORAGE_KEY, encodeEvent(ev(9)));
  o.faults.localStorageThrows = true;
  assert.equal(await open(o), null);
  assert.deepEqual(o.log, []);
});

test('the notice: a commit in one tab reaches the other tab, never the writer itself; a stale or failed write sends none', async () => {
  const o = fakeOrigin();
  const a = await open(o, 'A');
  const b = await open(o, 'B');
  const heard = { A: 0, B: 0 };
  a.subscribe(() => heard.A++);
  const off = b.subscribe(() => heard.B++);
  await a.put(null, ev(1));
  await o.idle();
  assert.deepEqual(heard, { A: 0, B: 1 });
  await a.put(null, ev(2)); // stale
  o.faults.abortCommits = 1;
  await a.put(encodeEvent(ev(1)), ev(3)); // aborted
  await o.idle();
  assert.deepEqual(heard, { A: 0, B: 1 });
  off();
  await a.put(encodeEvent(ev(1)), ev(4));
  await o.idle();
  assert.deepEqual(heard, { A: 0, B: 1 }, 'an unsubscribed listener was called');
});

test('without BroadcastChannel the store still opens and the compare-and-set still refuses a stale write', async () => {
  const o = fakeOrigin();
  const env = { ...o.tab('A'), BroadcastChannel: undefined };
  const p = openEventStore(env);
  await o.idle();
  const s = await p;
  assert.ok(s);
  await s.put(null, ev(1));
  assert.equal((await s.put(null, ev(2))).reason, 'stale');
});

// ---- the double itself: what store.ts relies on, pinned

test('double: a request made after an await, outside any callback, throws TransactionInactiveError', async () => {
  const o = fakeOrigin();
  const req = o.tab('A').indexedDB.open(DB.name, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(DB.store);
  await o.idle();
  const tx = req.result.transaction(DB.store, 'readwrite');
  const store = tx.objectStore(DB.store);
  await tick();
  assert.throws(() => store.put('x', DB.key), /TransactionInactiveError/);
});

test('double: put on a read-only transaction throws; a write is invisible to the next transaction until it commits', async () => {
  const o = fakeOrigin({ manual: true });
  const req = o.tab('A').indexedDB.open(DB.name, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(DB.store);
  while (o.step()) await tick();
  const db = req.result;
  assert.throws(() => db.transaction(DB.store, 'readonly').objectStore(DB.store).put('x', DB.key), /ReadOnlyError/);
  while (o.step()) await tick();
  const w = db.transaction(DB.store, 'readwrite');
  w.objectStore(DB.store).put('x', DB.key);
  const r = db.transaction(DB.store, 'readonly');
  const got = r.objectStore(DB.store).get(DB.key);
  let completed = false;
  w.oncomplete = () => (completed = true);
  let readAt = null;
  got.onsuccess = () => (readAt = { value: got.result, writerDone: completed });
  while (o.step()) await tick();
  assert.deepEqual(readAt, { value: 'x', writerDone: true }, 'the later transaction ran before the earlier one committed');
});

test('a move that aborts refuses the store (open resolves null), and the old key stays', async () => {
  const o = fakeOrigin();
  const legacy = encodeEvent(ev(10));
  o.localStorage.set(STORAGE_KEY, legacy);
  o.faults.abortCommits = 1;
  assert.equal(await open(o), null, 'a store opened over a move that never committed: it would read as empty');
  assert.equal(o.localStorage.get(STORAGE_KEY), legacy);
  assert.equal(stored(o), undefined);
});

test('the old key is never removed when IndexedDB holds a different event: it was not copied, so removing it loses it', async () => {
  const o = fakeOrigin();
  const other = encodeEvent(ev(11));
  const legacy = encodeEvent(ev(12));
  o.put(DB.name, DB.version, DB.store, DB.key, other);
  o.localStorage.set(STORAGE_KEY, legacy);
  const s = await open(o);
  assert.equal(s.status(), 'revoked', 'a store opened as usual over two different records');
  assert.equal(stored(o), other, 'the record was overwritten');
  assert.equal(o.localStorage.get(STORAGE_KEY), legacy, 'a saved event that was never copied was deleted');
  assert.deepEqual(o.log, []);
});

test('versionchange: a later version opening the database is not blocked; the store steps aside and refuses further writes', async () => {
  const o = fakeOrigin();
  const s = await open(o);
  assert.ok((await s.put(null, ev(13))).ok);
  const req = o.tab('newer').indexedDB.open(DB.name, DB.version + 1);
  const seen = [];
  req.onblocked = () => seen.push('blocked');
  req.onupgradeneeded = () => seen.push('upgrade');
  req.onsuccess = () => seen.push('success');
  await o.idle();
  assert.deepEqual(seen, ['upgrade', 'success'], 'the newer version was blocked by the open store');
  assert.deepEqual(await s.put(encodeEvent(ev(13)), ev(14)), { ok: false, reason: 'failed' }, 'the store wrote after it stepped aside');
  assert.equal(stored(o), encodeEvent(ev(13)));
});

test('double: an open at a higher version tells every open connection; one that does not close blocks it until it does', async () => {
  const o = fakeOrigin();
  const first = o.tab('A').indexedDB.open(DB.name, 1);
  first.onupgradeneeded = () => first.result.createObjectStore(DB.store);
  await o.idle();
  const told = [];
  first.result.onversionchange = (e) => told.push([e.oldVersion, e.newVersion]);
  const second = o.tab('B').indexedDB.open(DB.name, 2);
  const seen = [];
  second.onblocked = () => seen.push('blocked');
  second.onsuccess = () => seen.push('success');
  await o.idle();
  assert.deepEqual(told, [[1, 2]], 'the open connection was not told');
  assert.deepEqual(seen, ['blocked'], 'the higher version went ahead past a connection that stayed open');
  first.result.close();
  await o.idle();
  assert.deepEqual(seen, ['blocked', 'success'], 'the blocked open did not go ahead once the connection closed');
  assert.throws(() => first.result.transaction(DB.store, 'readonly'), /InvalidStateError/);
});

test('the old code lock is held until the transaction has completed: an old-code writer waiting on it runs only after the commit', async () => {
  const o = fakeOrigin({ locks: true });
  const s = await open(o);
  const ran = [];
  o.hooks.transaction = (by, mode) => {
    if (by !== 'A' || mode !== 'readwrite' || ran.length) return;
    ran.push('asked');
    // An old-code tab asks for the same lock while the write is in flight.
    void o.tab('old').navigator.locks.request(STORAGE_KEY, () => ran.push(`granted after ${o.log.length} commit(s)`));
  };
  assert.ok((await s.put(null, ev(15))).ok);
  await o.idle();
  assert.deepEqual(ran, ['asked', 'granted after 1 commit(s)'], 'the lock was released before the write committed');
  assert.ok(o.lockLog.every((l) => l.name === STORAGE_KEY), 'a lock other than the old code one was taken');
});

test('without the Web Locks API the store runs on IndexedDB alone (the old code cannot write there); a lock request that fails refuses the operation', async () => {
  const o = fakeOrigin();
  const s = await open(o);
  assert.equal(o.tab('x').navigator, undefined, 'precondition: no Web Locks API on this origin');
  assert.ok((await s.put(null, ev(16))).ok);
  const l = fakeOrigin({ locks: true });
  const ls = await open(l);
  l.faults.lockRequest = 'reject';
  assert.deepEqual(await ls.put(null, ev(17)), { ok: false, reason: 'failed' });
  assert.equal(await ls.load(), null);
  assert.deepEqual(l.log, []);
  l.faults.lockRequest = null;
  assert.equal(ls.status(), 'open', 'a refused lock request is not a revocation');
  assert.ok((await ls.put(null, ev(17))).ok);
});
