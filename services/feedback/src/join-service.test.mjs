// gh#308: the QR-join contract (ADR-0076), driven end to end through the registered HTTP handler and
// the real Blob adapter in functions/join.mjs. Storage is a container client that keeps the service's
// conditional semantics (If-None-Match, If-Match, ETags, ASCII-only metadata), with the status codes
// Azurite answered for each case (evidence README). So the adapter's conditions are under test, not
// supplied by the test.
//
// Every storage call yields, and can be paused per request, so the races between a join, a removal, a
// start and a purge are replayed deterministically at each storage step of the paused request.
//
// The Azure packages are not installed in this repo (ADR-0074); a module hook resolves them to stubs.
// With DRAW_TEST_AZURITE set to a connection string, the same tests run against Azurite with the real
// storage SDK instead (a scratch copy with the packages installed; never inside the repo).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { LIVE_AFTER_START_MS, LIVE_UNSTARTED_MS, MAX_NAMES, RECLAIM_AFTER_MS, routeDraw, tooLarge } from './join.mjs';

const AZURITE = process.env.DRAW_TEST_AZURITE ?? '';
const RealSdk = AZURITE ? await import('@azure/storage-blob') : null;

const STUBS = {
  '@azure/functions': `export const app = { http(name, options) { globalThis.__drawHandlers.push({ name, ...options }); }, setup() {} };`,
  '@azure/identity': `export class DefaultAzureCredential {}`,
  '@azure/storage-blob': `export class BlobServiceClient {
    constructor(url) { new URL(url); }
    getContainerClient() { return globalThis.__drawContainer; }
  }`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier in STUBS) return { url: `stub:${specifier}`, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
    return next(url, context);
  },
});

// The function module caches its container client, so it gets one forwarder and each test swaps
// the storage behind it.
let current = null;
globalThis.__drawContainer = {
  getBlockBlobClient: (name) => current.getBlockBlobClient(name),
  listBlobsFlat: (options) => current.listBlobsFlat(options),
};
globalThis.__drawHandlers = [];
process.env.FEEDBACK_ACCOUNT_URL ??= 'https://account.blob.core.windows.net';
await import('./functions/join.mjs');
const handler = globalThis.__drawHandlers.find((h) => h.name === 'draw').handler;

// The handler reads the wall clock; the tests own it. Each answer advances it 1 ms, so two joins
// never share a timestamp and list order is fixed.
const EPOCH = Date.parse('2026-12-31T12:00:00Z');
mock.timers.enable({ apis: ['Date'], now: EPOCH });
const HOUR = 3600 * 1000;

const rest = (statusCode, code) => Object.assign(new Error(code ?? `status ${statusCode}`), { name: 'RestError', statusCode, code, details: { errorCode: code } });

/**
 * In-memory container client. Each answer is the one Azurite gave through the real SDK (evidence
 * README): 409 BlobAlreadyExists for If-None-Match on an existing blob; 412 ConditionNotMet for an
 * If-Match that does not match, including on a missing blob; 404 for a plain read or delete of a
 * missing blob, with no code on a HEAD; listings spell the ETag without quotes and carry metadata
 * only when asked; metadata keys come back lower-case and a non-ASCII value is refused by the client.
 */
function memoryContainer({ exists = true } = {}) {
  const blobs = new Map();
  // With no container, every call answers 404 ContainerNotFound (Azurite, evidence README).
  const container = () => {
    if (!exists) throw rest(404, 'ContainerNotFound');
  };
  let seq = 0;
  const nextEtag = () => `"0x8DE${(++seq).toString(16).toUpperCase().padStart(11, '0')}"`;
  const metadataOf = (metadata = {}) => {
    const out = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (/[^\x20-\x7e]/.test(String(value))) throw Object.assign(new TypeError(`Invalid character in header content ["x-ms-meta-${key}"]`), { code: 'ERR_INVALID_CHAR' });
      out[key.toLowerCase()] = String(value);
    }
    return out;
  };
  const failsMatch = (cur, ifMatch) => ifMatch !== undefined && (!cur || cur.etag !== ifMatch);
  return {
    blobs,
    getBlockBlobClient(name) {
      return {
        async upload(body, _length, options = {}) {
          container();
          const cur = blobs.get(name);
          const c = options.conditions ?? {};
          if (c.ifNoneMatch === '*' && cur) throw rest(409, 'BlobAlreadyExists');
          if (failsMatch(cur, c.ifMatch)) throw rest(412, 'ConditionNotMet');
          const etag = nextEtag();
          blobs.set(name, { body: Buffer.from(body), metadata: metadataOf(options.metadata), etag });
          return { etag };
        },
        async download() {
          container();
          const cur = blobs.get(name);
          if (!cur) throw rest(404, 'BlobNotFound');
          return { etag: cur.etag, metadata: { ...cur.metadata }, readableStreamBody: Readable.from([Buffer.from(cur.body)]) };
        },
        async downloadToBuffer() {
          container();
          const cur = blobs.get(name);
          if (!cur) throw rest(404, 'BlobNotFound');
          return Buffer.from(cur.body);
        },
        async setMetadata(metadata, options = {}) {
          container();
          const cur = blobs.get(name);
          if (failsMatch(cur, options.conditions?.ifMatch)) throw rest(412, 'ConditionNotMet');
          if (!cur) throw rest(404, 'BlobNotFound');
          const etag = nextEtag();
          blobs.set(name, { ...cur, metadata: metadataOf(metadata), etag });
          return { etag };
        },
        async getProperties() {
          if (!exists) throw Object.assign(rest(404, undefined), { details: { errorCode: 'ContainerNotFound' } });
          const cur = blobs.get(name);
          if (!cur) throw rest(404, undefined);
          return { etag: cur.etag, metadata: { ...cur.metadata } };
        },
        async delete(options = {}) {
          container();
          const cur = blobs.get(name);
          const ifMatch = options.conditions?.ifMatch;
          if (failsMatch(cur, ifMatch)) throw rest(412, 'ConditionNotMet');
          if (!cur) throw rest(404, 'BlobNotFound');
          blobs.delete(name);
          return {};
        },
        async deleteIfExists(options) {
          try {
            await this.delete(options);
            return { succeeded: true };
          } catch (error) {
            if (error.code === 'BlobNotFound') return { succeeded: false };
            throw error;
          }
        },
      };
    },
    async *listBlobsFlat({ prefix = '', includeMetadata = false } = {}) {
      container();
      for (const name of [...blobs.keys()].filter((n) => n.startsWith(prefix)).sort()) {
        const cur = blobs.get(name);
        if (cur) yield { name, properties: { etag: cur.etag.replaceAll('"', '') }, metadata: includeMetadata ? { ...cur.metadata } : undefined };
      }
    },
  };
}

async function azuriteContainer(exists) {
  const container = RealSdk.BlobServiceClient.fromConnectionString(AZURITE).getContainerClient(`t${randomBytes(8).toString('hex')}`);
  if (exists) await container.create();
  return container;
}

const tags = new AsyncLocalStorage();
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

/** Storage calls that change state. A trace holds every call, so a write that is later undone still shows. */
const WRITES = new Set(['upload', 'setMetadata', 'delete', 'deleteIfExists']);

/**
 * Wrap a container client so every storage call yields, is counted per request tag, is recorded in
 * an ordered trace, and can be paused (before it reaches storage) or failed. A request is tagged by
 * running it inside `as(tag)`.
 */
function instrument(backend) {
  const counts = new Map();
  const pauses = [];
  let failure = null;
  const rules = [];
  const calls = { total: 0 };
  const trace = [];
  async function gate(op, path) {
    const tag = tags.getStore() ?? null;
    const n = counts.get(tag) ?? 0;
    counts.set(tag, n + 1);
    calls.total += 1;
    trace.push({ tag, op, path });
    await new Promise(setImmediate);
    const p = pauses.find((x) => !x.hit && x.tag === tag && x.match(op, path, n));
    if (p) {
      p.hit = true;
      clearTimeout(p.timer);
      p.reached.resolve();
      await p.release.promise;
    }
    const rule = rules.find((r) => r.match(op, path));
    if (rule) throw rule.error;
    if (failure) {
      const { error, applied } = failure;
      failure = null;
      // An applied failure reaches storage first: the write commits, and only the answer is lost.
      if (!applied) throw error;
      return error;
    }
    return null;
  }
  const OPS = ['upload', 'setMetadata', 'download', 'downloadToBuffer', 'getProperties', 'delete', 'deleteIfExists'];
  return {
    calls,
    /** Every call a tagged request made, in order, whether or not its effect survived. */
    callsOf: (tag) => trace.filter((c) => c.tag === tag).map(({ op, path }) => ({ op, path })),
    count: (tag) => counts.get(tag) ?? 0,
    /** Fail every call that matches, before it reaches storage, from now on. */
    failOn(match, error) {
      rules.push({ match, error });
    },
    /** Fail the next call: before it reaches storage, or with `applied`, after it has taken effect. */
    failNext(error, { applied = false } = {}) {
      failure = { error, applied };
    },
    pause(tag, match) {
      const p = { tag, match, hit: false, reached: deferred(), release: deferred() };
      // A request that never makes the paused call is a failure, not a hang (real timers: only Date is mocked).
      p.timer = setTimeout(() => p.reached.reject(new Error(`the ${tag} request never made the call it was to pause at`)), 2000);
      p.reached.promise.catch(() => {});
      pauses.push(p);
      return { reached: p.reached.promise, release: () => p.release.resolve(), hit: () => p.hit };
    },
    container: {
      getBlockBlobClient(name) {
        const inner = backend.getBlockBlobClient(name);
        return Object.fromEntries(
          OPS.map((op) => [
            op,
            async (...args) => {
              const late = await gate(op, name);
              if (!late) return inner[op](...args);
              // The call takes effect, whatever it answers; the caller gets the injected failure instead.
              await inner[op](...args).catch(() => {});
              throw late;
            },
          ]),
        );
      },
      listBlobsFlat(options) {
        const it = backend.listBlobsFlat(options);
        let first = true;
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          async next() {
            if (first) {
              first = false;
              const late = await gate('list', options?.prefix ?? '');
              if (late) throw late;
            }
            return it.next();
          },
        };
      },
    },
  };
}

async function harness({ exists = true } = {}) {
  const backend = AZURITE ? await azuriteContainer(exists) : memoryContainer({ exists });
  const io = instrument(backend);
  current = io.container;
  const logs = [];
  const call = async (method, path, { body, admin, bodyText } = {}) => {
    const text = bodyText ?? (body === undefined ? '' : JSON.stringify(body));
    const bytes = Buffer.from(text, 'utf8');
    const headers = new Map([['content-length', String(bytes.length)]]);
    if (admin) headers.set('x-draw-admin', admin);
    const request = { method, params: { path }, headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null }, body: bytes.length ? [bytes] : null };
    const res = await handler(request, { log: (...parts) => logs.push(parts.join(' ')) });
    mock.timers.tick(1);
    return { ...res, json: res.body ? JSON.parse(res.body) : null };
  };
  /** Blob names under a prefix, read straight from storage. */
  const list = async (prefix) => {
    const out = [];
    for await (const b of backend.listBlobsFlat({ prefix, includeMetadata: true })) out.push({ name: b.name, metadata: b.metadata ?? {} });
    return out;
  };
  const readJson = async (name) => {
    const res = await backend.getBlockBlobClient(name).download();
    const chunks = [];
    for await (const c of res.readableStreamBody) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  /** Delete a blob straight from storage, outside any request: a fixture for state no request leaves. */
  const drop = (name) => backend.getBlockBlobClient(name).delete();
  return { io, logs, call, list, readJson, drop, as: (tag, fn) => tags.run(tag, fn) };
}

async function openEvent(h) {
  const res = await h.call('POST', 'events');
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const ev = res.json;
  ev.join = (name, n, extra = {}) => h.call('POST', `events/${ev.eventId}/join`, { body: { pin: ev.pin, name, token: token(n), ...extra } });
  ev.status = async (id) => (await h.call('GET', `events/${ev.eventId}/status/${id}`)).json;
  ev.names = async () => (await h.call('GET', `events/${ev.eventId}/names`, { admin: ev.adminToken })).json;
  ev.remove = (id) => h.call('POST', `events/${ev.eventId}/names/${id}/remove`, { admin: ev.adminToken });
  ev.start = (ids) => h.call('POST', `events/${ev.eventId}/start`, { admin: ev.adminToken, body: { ids } });
  ev.purge = () => h.call('POST', `events/${ev.eventId}/purge`, { admin: ev.adminToken });
  ev.blobs = async () => (await h.list(`${ev.eventId}/`)).map((b) => b.name);
  ev.nameBlobs = async () => h.list(`${ev.eventId}/names/`);
  ev.slotBlobs = async () => h.list(`${ev.eventId}/slots/`);
  return ev;
}

const token = (n) => `device-token-${String(n).padStart(4, '0')}`;
const wrongPin = (pin) => String((Number(pin) + 1) % 1e6).padStart(6, '0');
const isName = (op, path) => path.includes('/names/');

/** How many storage calls a request makes when nothing races it. */
async function stepsOf(scenario, tag) {
  const h = await harness();
  const ctx = await scenario.setup(h);
  await h.as(tag, () => scenario.paused(h, ctx));
  return h.io.count(tag);
}

/**
 * Replay a race at every storage step: pause the tagged request before its step i, run the rival to
 * completion, release, and hand both answers to the check.
 */
async function everyStep(scenario) {
  const tag = 'paused';
  const steps = await stepsOf(scenario, tag);
  assert.ok(steps > 0, 'the paused request made no storage call');
  for (let i = 0; i < steps; i++) {
    const h = await harness();
    const ctx = await scenario.setup(h);
    const gate = h.io.pause(tag, (_op, _path, n) => n === i);
    const paused = h.as(tag, () => scenario.paused(h, ctx));
    await gate.reached;
    const rival = await scenario.rival(h, ctx);
    gate.release();
    await scenario.check(h, ctx, await paused, rival, `paused before storage step ${i} of ${steps}`, i);
  }
}

test('routing: every route of the contract, and nothing else', () => {
  const e = 'A'.repeat(22);
  const id = 'b'.repeat(22);
  assert.deepEqual(routeDraw('POST', 'events'), { op: 'create', params: {} });
  assert.deepEqual(routeDraw('POST', `events/${e}/join`), { op: 'join', params: { eventId: e } });
  assert.deepEqual(routeDraw('GET', `events/${e}/status/${id}`), { op: 'status', params: { eventId: e, id } });
  assert.deepEqual(routeDraw('GET', `events/${e}/names`), { op: 'names', params: { eventId: e } });
  assert.deepEqual(routeDraw('POST', `events/${e}/names/${id}/remove`), { op: 'remove', params: { eventId: e, id } });
  assert.deepEqual(routeDraw('POST', `events/${e}/start`), { op: 'start', params: { eventId: e } });
  assert.deepEqual(routeDraw('POST', `events/${e}/purge`), { op: 'purge', params: { eventId: e } });
  assert.equal(routeDraw('GET', `events/${e}/join`).op, 'method');
  assert.equal(routeDraw('POST', `events/../join`), null);
  assert.equal(routeDraw('POST', `events/${e}x/join`), null, 'an event id is exactly 22 base64url characters');
});

test('the whole flow: create, join, review, start, status, purge', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  assert.match(ev.eventId, /^[A-Za-z0-9_-]{22}$/);
  assert.match(ev.pin, /^[0-9]{6}$/);
  assert.match(ev.adminToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(ev.expiresAt, '2027-01-03T12:00:00.000Z', 'created now and never started: 72 hours');

  const a = await ev.join('ต้น', 1);
  assert.equal(a.status, 201);
  assert.match(a.json.id, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual({ name: a.json.name, eventKey: a.json.eventKey }, { name: 'ต้น', eventKey: ev.pin });
  const b = await ev.join('ข้าว', 2);
  assert.notEqual(b.json.id, a.json.id);

  assert.deepEqual(await ev.status(a.json.id), { state: 'open' });

  const list = await ev.names();
  assert.deepEqual(list.names.map((n) => n.name), ['ต้น', 'ข้าว'], 'Thai names survive the trip through blob metadata');
  assert.equal(list.state, 'open');

  const start = await ev.start([a.json.id, b.json.id]);
  assert.equal(start.status, 200);
  assert.deepEqual(start.json.roster, [{ id: a.json.id, name: 'ต้น' }, { id: b.json.id, name: 'ข้าว' }]);

  assert.deepEqual(await ev.status(a.json.id), { state: 'started', member: true });
  assert.deepEqual(await ev.status('z'.repeat(22)), { state: 'started', member: false });

  const purge = await ev.purge();
  assert.equal(purge.status, 200);
  assert.deepEqual(await ev.blobs(), [], 'purge leaves nothing of the event behind');
  assert.deepEqual(await ev.status(a.json.id), { state: 'gone' });
  const again = await ev.purge();
  assert.deepEqual([again.status, again.json], [200, { purged: true }], 'a retried purge is answered 200, never 404');
});

test('the PIN is required and must match', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  for (const pin of [wrongPin(ev.pin), '', undefined]) {
    const res = await ev.join('ต้น', 1, { pin });
    assert.equal(res.status, 403, `pin ${pin}`);
    assert.deepEqual(res.json, { error: 'pin' });
  }
  const thaiDigits = [...ev.pin].map((d) => String.fromCodePoint(0x0e50 + Number(d))).join('');
  const typed = await ev.join('ต้น', 1, { pin: ` ${thaiDigits.slice(0, 3)}-${thaiDigits.slice(3)} ` });
  assert.equal(typed.status, 201, 'Thai numerals, spaces and a dash are accepted, as the round code accepts them');
  assert.equal((await ev.nameBlobs()).length, 1);
});

test('a name already taken is refused; the same device retrying gets its own id back', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const first = await ev.join('Ton', 1);
  assert.equal(first.status, 201);
  for (const variant of ['TON', ' ton ', 'T on']) {
    const res = await ev.join(variant, 2);
    assert.equal(res.status, 409, variant);
    assert.deepEqual(res.json, { error: 'taken' });
  }
  const retry = await ev.join('ton', 1);
  assert.equal(retry.status, 200, 'a lost response retried from the same device is not "taken"');
  assert.equal(retry.json.id, first.json.id);
  assert.equal(retry.json.name, 'Ton', 'the name returned is the one stored, not the retry spelling');
  assert.equal((await ev.nameBlobs()).length, 1);
});

test('names reach the review list verbatim, as JSON that a browser will not sniff as HTML', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const res = await ev.join("O'Neil_1", 1);
  assert.equal(res.status, 201);
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  const list = await h.call('GET', `events/${ev.eventId}/names`, { admin: ev.adminToken });
  assert.equal(list.json.names[0].name, "O'Neil_1");
  assert.ok(!list.body.includes('&#'), "the server never pre-escapes: escaping is the sink's job");
  const markup = await ev.join('<img src=x>', 2);
  assert.deepEqual([markup.status, markup.json], [422, { error: 'name', reason: 'charset' }]);
});

test('invalid names are refused with a reason, including escapes that only JSON can carry', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const raw = (nameJson) =>
    h
      .call('POST', `events/${ev.eventId}/join`, { bodyText: `{"pin":"${ev.pin}","token":"${token(1)}","name":${nameJson}}` })
      .then((r) => ({ status: r.status, json: r.json }));
  assert.deepEqual(await raw('"\\ud800ab"'), { status: 422, json: { error: 'name', reason: 'lone-surrogate' } });
  assert.deepEqual(await raw('"ab\\u202ecd"'), { status: 422, json: { error: 'name', reason: 'control' } });
  assert.deepEqual(await raw('"T\\u034fon"'), { status: 422, json: { error: 'name', reason: 'charset' } });
  assert.deepEqual(await raw('"\\ud83d\\ude00"'), { status: 422, json: { error: 'name', reason: 'emoji' } });
  assert.deepEqual(await raw(JSON.stringify('\u0E12' + '\u0E33'.repeat(23))), { status: 422, json: { error: 'name', reason: 'stacked-marks' } });
  assert.deepEqual(await raw(JSON.stringify('ก'.repeat(13))), { status: 422, json: { error: 'name', reason: 'too-long' } });
  assert.equal((await ev.nameBlobs()).length, 0);
});

test('a same-device retry still gets its id after the start; a new device gets "started"', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  await ev.start([a.json.id]);
  const retry = await ev.join('ต้น', 1);
  assert.deepEqual([retry.status, retry.json.id], [200, a.json.id], 'a lost join response is recoverable after the start');
  assert.deepEqual((await ev.join('ต้น', 2)).json, { error: 'started' });
});

test('a missing container is a 503 on every route, never an event read as gone', async () => {
  const h = await harness({ exists: false });
  const e = 'A'.repeat(22);
  const answers = [
    await h.call('POST', 'events'),
    await h.call('GET', `events/${e}/status/${'b'.repeat(22)}`),
    await h.call('POST', `events/${e}/join`, { body: { pin: '123456', name: 'ต้น', token: token(1) } }),
  ];
  for (const res of answers) assert.deepEqual([res.status, res.json], [503, { error: 'unavailable' }]);
});

test('a start body is validated before the frozen roster is returned', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  await ev.start([a.json.id]);
  const bad = await h.call('POST', `events/${ev.eventId}/start`, { admin: ev.adminToken, body: { ids: 'x' } });
  assert.deepEqual([bad.status, bad.json], [400, { error: 'bad-request' }]);
});

test('joining closes when the admin starts; names cannot be removed after', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  await ev.start([a.json.id]);
  const late = await ev.join('ข้าว', 2);
  assert.deepEqual([late.status, late.json], [409, { error: 'started' }]);
  const rm = await ev.remove(a.json.id);
  assert.deepEqual([rm.status, rm.json], [409, { error: 'started' }]);
});

test('the admin removes a name before the start, and the name is free again', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  const rm = await ev.remove(a.json.id);
  assert.deepEqual([rm.status, rm.json], [200, { removed: true }]);
  assert.deepEqual((await ev.names()).names, []);
  const again = await ev.remove(a.json.id);
  assert.deepEqual(again.json, { removed: false });
  const b = await ev.join('ต้น', 2);
  assert.equal(b.status, 201);
  assert.notEqual(b.json.id, a.json.id);
});

test('start freezes exactly the reviewed ids: a join after the review is not in the roster', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  const reviewed = (await ev.names()).names.map((n) => n.id);
  const b = await ev.join('ข้าว', 2); // lands between the admin's last look and the start
  const start = await ev.start([...reviewed, 'q'.repeat(22)]);
  assert.deepEqual(start.json.roster.map((m) => m.id), [a.json.id], 'unreviewed and unknown ids are not frozen in');
  assert.deepEqual(await ev.status(b.json.id), { state: 'started', member: false });
  const again = await ev.start([a.json.id, b.json.id]);
  assert.deepEqual(again.json.roster, start.json.roster, 'a second start returns the frozen roster unchanged');
});

test('an empty roster is never frozen: start refuses it and joining stays open', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  for (const ids of [[], ['q'.repeat(22)]]) {
    const res = await ev.start(ids);
    assert.deepEqual([res.status, res.json], [409, { error: 'empty' }], JSON.stringify(ids));
  }
  assert.deepEqual(await ev.status(a.json.id), { state: 'open' });
  const start = await ev.start([a.json.id]);
  assert.equal(start.json.roster.length, 1);
});

test('an oversize body gets a JSON 413 with the same headers as every other answer', () => {
  const res = tooLarge();
  assert.equal(res.status, 413);
  assert.deepEqual(JSON.parse(res.body), { error: 'too-large' });
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
});

test('admin routes need the admin token, never the PIN', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  assert.equal((await ev.join('ต้น', 1)).status, 201);
  for (const admin of [undefined, ev.pin, ev.adminToken.slice(0, -1) + (ev.adminToken.endsWith('A') ? 'B' : 'A')]) {
    for (const [method, path] of [
      ['GET', `events/${ev.eventId}/names`],
      ['POST', `events/${ev.eventId}/start`],
      ['POST', `events/${ev.eventId}/purge`],
      ['POST', `events/${ev.eventId}/names/${'a'.repeat(22)}/remove`],
    ]) {
      // GET carries no body: through the real handler, a body on a route capped at 0 bytes is a 413.
      const res = await h.call(method, path, { admin, body: method === 'GET' ? undefined : { ids: [] } });
      assert.deepEqual([res.status, res.json], [401, { error: 'admin' }], `${method} ${path} with ${admin}`);
    }
  }
  assert.ok((await ev.blobs()).includes(`${ev.eventId}/event.json`), 'a refused purge deleted the record');
  assert.equal((await ev.nameBlobs()).length, 1, 'a refused purge deleted a name');
});

// The start comes 60 hours after the create: inside that band a clock from creation (24 or 72 hours)
// or the shorter of the two disagrees with the start clock on the live leg, and a longer start clock
// or none disagrees on the gone leg.
test('a started event expires 24 hours after its start: live at 23h59m, gone at 24h01m', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  mock.timers.tick(60 * HOUR);
  const start = await ev.start([a.json.id]);
  assert.equal(start.status, 200, `a start 60 hours after the create: ${JSON.stringify(start.json)}`);
  mock.timers.tick(24 * HOUR - 60 * 1000);
  assert.deepEqual(await ev.status(a.json.id), { state: 'started', member: true }, 'started 23h59m ago reads as gone');
  assert.equal((await ev.join('ต้น', 1)).status, 200, 'started 23h59m ago refuses a same-device retry');
  mock.timers.tick(2 * 60 * 1000);
  assert.deepEqual(await ev.status(a.json.id), { state: 'gone' }, 'started 24h01m ago is still live');
  assert.deepEqual((await ev.join('ต้น', 1)).json, { error: 'gone' });
  assert.equal((await ev.names()).error, 'gone');
  assert.equal((await ev.purge()).status, 200, 'an expired event can still be purged by its admin');
  assert.deepEqual(await ev.blobs(), []);
});

test('an event never started expires 72 hours after it is created: live at 71h, gone at 73h', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = await ev.join('ต้น', 1);
  mock.timers.tick(71 * HOUR);
  assert.deepEqual(await ev.status(a.json.id), { state: 'open' }, 'created 71h ago and never started reads as gone');
  assert.equal((await ev.join('ข้าว', 2)).status, 201, 'created 71h ago refuses a join');
  assert.equal((await ev.names()).names.length, 2);
  mock.timers.tick(2 * HOUR);
  assert.deepEqual(await ev.status(a.json.id), { state: 'gone' }, 'created 73h ago is still live');
  assert.deepEqual((await ev.join('ส้ม', 3)).json, { error: 'gone' });
  assert.equal((await ev.start([a.json.id])).status, 404, 'an expired event can still be started');
  assert.equal((await ev.purge()).status, 200);
  assert.deepEqual(await ev.blobs(), []);
});

test('an event holds at most MAX_NAMES joins', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  for (let i = 0; i < MAX_NAMES; i++) assert.equal((await ev.join(`n${i}`, i)).status, 201, `join ${i}`);
  assert.deepEqual((await ev.join('late', 9999)).json, { error: 'full' });
});

test('stored records hold an allow-listed key set; nothing from the request beyond the fields leaks in', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const ip = '203.0.113.77';
  await h.call('POST', `events/${ev.eventId}/join`, { body: { pin: ev.pin, name: 'ต้น', token: token(1), ip, extra: ip } });
  const [blob] = await ev.nameBlobs();
  assert.deepEqual(Object.keys(blob.metadata).sort(), ['id', 'joined', 'name', 'token']);
  assert.notEqual(blob.metadata.token, token(1), 'the device token is stored hashed');
  const slots = await ev.slotBlobs();
  assert.deepEqual(slots.map((b) => Object.keys(b.metadata).sort()), [['at', 'id', 'key', 'owner', 'w']], 'a slot holds its join id, owner, name key, claim time and write mark, nothing else');
  assert.equal(`${ev.eventId}/names/${slots[0].metadata.key}`, blob.name, 'the slot key is its name blob key');
  assert.match(slots[0].metadata.w, /^[A-Za-z0-9_-]{22}$/, 'the write mark is a random id');
  assert.match(slots[0].metadata.owner, /^[0-9a-f]{64}$/, 'the slot owner is a hash');
  assert.ok(![token(1), blob.metadata.token].includes(slots[0].metadata.owner), 'the slot owner is neither the device token nor its stored hash');
  const record = await h.readJson(`${ev.eventId}/event.json`);
  assert.deepEqual(Object.keys(record).sort(), ['admin', 'created', 'pin', 'removed', 'state', 'v']);
  assert.notEqual(record.admin, ev.adminToken, 'the admin token is stored hashed');
  const everything = JSON.stringify([record, ...(await h.list('')).map((b) => b.metadata)]);
  assert.ok(!everything.includes(ip), 'no IP address is stored');
});

test('a storage failure answers 503 and logs no name, PIN or token', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  h.io.failNext(rest(500, 'InternalError'));
  const res = await ev.join('ต้นข้าว', 1);
  assert.deepEqual([res.status, res.json], [503, { error: 'unavailable' }]);
  assert.equal(h.logs.length, 1);
  for (const secret of ['ต้นข้าว', ev.pin, token(1), ev.adminToken]) assert.ok(!h.logs[0].includes(secret), `log leaks ${secret}`);
});

test('malformed requests are refused before any storage call', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const before = h.io.calls.total;
  for (const bodyText of ['not json', '[]', '{"pin":"1"}', `{"pin":"${ev.pin}","name":"ต้น","token":"short"}`]) {
    const res = await h.call('POST', `events/${ev.eventId}/join`, { bodyText });
    assert.equal(res.status, 400, bodyText);
  }
  assert.equal((await h.call('GET', 'nowhere')).status, 404);
  assert.equal((await h.call('GET', `events/${ev.eventId}/join`)).status, 405);
  assert.equal(h.io.calls.total, before, 'no storage call was made');
});

// ---- Races: each is replayed at every storage step of the paused request ----

test('a removal racing a start: a removal answered "removed" is never in the frozen roster', async () => {
  await everyStep({
    async setup(h) {
      const ev = await openEvent(h);
      const a = (await ev.join('ต้น', 1)).json;
      const b = (await ev.join('ข้าว', 2)).json;
      return { ev, a, b };
    },
    paused: (h, { ev, a }) => ev.remove(a.id),
    rival: (h, { ev, a, b }) => ev.start([a.id, b.id]),
    async check(h, { ev, a }, rm, start, step) {
      assert.equal(start.status, 200, step);
      const member = (await ev.status(a.id)).member;
      if (rm.status === 200) {
        assert.deepEqual(rm.json, { removed: true }, step);
        assert.equal(member, false, `${step}: answered removed, yet the start froze it in`);
      } else {
        assert.deepEqual([rm.status, rm.json, member], [409, { error: 'started' }, true], step);
      }
    },
  });
});

test('a start racing a removal: the start re-reads, and a name answered "removed" stays out', async () => {
  await everyStep({
    async setup(h) {
      const ev = await openEvent(h);
      const a = (await ev.join('ต้น', 1)).json;
      const b = (await ev.join('ข้าว', 2)).json;
      return { ev, a, b };
    },
    paused: (h, { ev, a, b }) => ev.start([a.id, b.id]),
    rival: (h, { ev, a }) => ev.remove(a.id),
    async check(h, { ev, a }, start, rm, step) {
      assert.equal(start.status, 200, step);
      const member = (await ev.status(a.id)).member;
      if (rm.status === 200) assert.equal(member, false, `${step}: answered removed, yet the start froze it in`);
      else assert.deepEqual([rm.status, member], [409, true], step);
    },
  });
});

test('a purge racing a start: the purge re-reads and still leaves nothing', async () => {
  await everyStep({
    async setup(h) {
      const ev = await openEvent(h);
      const a = (await ev.join('ต้น', 1)).json;
      return { ev, a };
    },
    paused: (h, { ev }) => ev.purge(),
    rival: (h, { ev, a }) => ev.start([a.id]),
    async check(h, { ev }, purge, start, step) {
      assert.equal(purge.status, 200, step);
      assert.ok([200, 404].includes(start.status), `${step}: start answered ${start.status}`);
      assert.deepEqual(await ev.blobs(), [], `${step}: blobs left after the purge`);
    },
  });
});

test('a removal paused before its delete, then a start: the start leaves the removed name out', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = (await ev.join('ต้น', 1)).json;
  const b = (await ev.join('ข้าว', 2)).json;
  const gate = h.io.pause('remove', (op, path) => op.startsWith('delete') && isName(op, path));
  const rm = h.as('remove', () => ev.remove(a.id));
  await gate.reached;
  const start = await ev.start([a.id, b.id]);
  gate.release();
  assert.deepEqual([(await rm).status, (await rm).json], [200, { removed: true }]);
  assert.deepEqual(start.json.roster.map((m) => m.id), [b.id]);
  assert.deepEqual(await ev.status(a.id), { state: 'started', member: false });
});

test('a join racing a purge: the purge leaves no name behind, and a retried purge is 200', async () => {
  await everyStep({
    setup: async (h) => ({ ev: await openEvent(h) }),
    paused: (h, { ev }) => ev.join('ต้น', 1),
    rival: (h, { ev }) => ev.purge(),
    async check(h, { ev }, join, purge, step) {
      assert.equal(purge.status, 200, step);
      assert.deepEqual([join.status, join.json], [404, { error: 'gone' }], `${step}: the join outlived the purge`);
      assert.deepEqual(await ev.blobs(), [], `${step}: blobs left after the purge`);
      const again = await ev.purge();
      assert.deepEqual([again.status, again.json], [200, { purged: true }], `${step}: retried purge`);
    },
  });
});

test('a join paused before its upload, then a purge: the join undoes itself and answers gone', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const gate = h.io.pause('join', (op, path) => op === 'upload' && isName(op, path));
  const join = h.as('join', () => ev.join('ต้น', 1));
  await gate.reached;
  assert.equal((await ev.purge()).status, 200);
  gate.release();
  assert.deepEqual([(await join).status, (await join).json], [404, { error: 'gone' }]);
  assert.deepEqual(await ev.blobs(), []);
  assert.equal((await ev.purge()).status, 200);
});

test('a purge paused after it closed the event: a join in that window is refused, not admitted', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const gate = h.io.pause('purge', (op) => op === 'list');
  const purge = h.as('purge', () => ev.purge());
  await gate.reached;
  const join = await ev.join('ต้น', 1);
  assert.deepEqual([join.status, join.json], [404, { error: 'gone' }], 'a join was admitted while the purge was running');
  gate.release();
  assert.equal((await purge).status, 200);
  assert.deepEqual(await ev.blobs(), []);
});

test('a join racing a start it was not reviewed for: it answers started and keeps no name', async () => {
  await everyStep({
    async setup(h) {
      const ev = await openEvent(h);
      const a = (await ev.join('ต้น', 1)).json;
      return { ev, a };
    },
    paused: (h, { ev }) => ev.join('ข้าว', 2),
    rival: (h, { ev, a }) => ev.start([a.id]),
    async check(h, { ev, a }, join, start, step) {
      assert.equal(start.status, 200, step);
      assert.deepEqual([join.status, join.json], [409, { error: 'started' }], step);
      assert.deepEqual((await ev.nameBlobs()).map((b) => b.metadata.id), [a.id], `${step}: a name kept after admission closed`);
      assert.deepEqual((await ev.slotBlobs()).map((b) => b.metadata.id), [a.id], `${step}: a slot kept after admission closed`);
    },
  });
});

test('a delayed removal of a name never deletes the person who joined under that name later', async () => {
  await everyStep({
    async setup(h) {
      const ev = await openEvent(h);
      const first = (await ev.join('ต้น', 1)).json;
      return { ev, first };
    },
    paused: (h, { ev, first }) => ev.remove(first.id),
    async rival(h, ctx) {
      assert.equal((await ctx.ev.remove(ctx.first.id)).status, 200);
      const second = await ctx.ev.join('ต้น', 2);
      assert.equal(second.status, 201);
      ctx.second = second.json;
    },
    async check(h, { ev, second }, rm, _rival, step) {
      assert.equal(rm.status, 200, step);
      assert.deepEqual((await ev.names()).names.map((n) => n.id), [second.id], `${step}: the later joiner was deleted`);
      assert.deepEqual((await ev.join('ต้น', 2)).json.id, second.id, step);
    },
  });
});

test('two devices racing for one name: the conditional create lets exactly one in', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const gate = h.io.pause('slow', (op, path) => op === 'upload' && isName(op, path));
  const slow = h.as('slow', () => ev.join('ต้น', 1));
  await gate.reached;
  const fast = await ev.join('ต้น', 2);
  assert.equal(fast.status, 201);
  gate.release();
  assert.deepEqual([(await slow).status, (await slow).json], [409, { error: 'taken' }]);
  assert.deepEqual((await ev.nameBlobs()).map((b) => b.metadata.id), [fast.json.id], 'the first name was overwritten');
  assert.deepEqual((await ev.slotBlobs()).map((b) => b.metadata.id), [fast.json.id], 'the device that lost the name kept a slot');
});

// ---- No abuse budget: nothing a stranger can spend to shut a party out (ADR-0076) ----

/** Move the clock to the start of a later UTC hour, so a test's requests share one hour. */
const freshHour = () => mock.timers.setTime((Math.floor(Date.now() / HOUR) + 1) * HOUR);

test('creation has no app-wide budget: create number 101 in one hour answers 201', async () => {
  const h = await harness();
  freshHour();
  for (let i = 1; i <= 101; i++) {
    const res = await h.call('POST', 'events');
    assert.equal(res.status, 201, `create number ${i} in one hour: ${JSON.stringify(res.json)}`);
  }
});

test('wrong PINs lock nothing: 301 wrong PINs, then the right PIN in the same hour answers 201', async () => {
  const h = await harness();
  freshHour();
  const ev = await openEvent(h);
  const guesses = [];
  for (let i = 0; i < 301; i++) guesses.push((await ev.join('ต้น', 1, { pin: wrongPin(ev.pin) })).status);
  const right = await ev.join('ต้น', 1);
  assert.deepEqual([right.status, right.json.name], [201, 'ต้น'], `the right PIN after 301 wrong ones: ${JSON.stringify(right.json)}`);
  assert.deepEqual(new Set(guesses), new Set([403]), 'every wrong PIN answers 403');
});

test("a wrong PIN answers 403 and leaves the container's blob set unchanged", async () => {
  const h = await harness();
  const ev = await openEvent(h);
  assert.equal((await ev.join('ต้น', 1)).status, 201);
  const snapshot = async () => ({ blobs: await h.list(''), record: await h.readJson(`${ev.eventId}/event.json`) });
  const before = await snapshot();
  for (const pin of [wrongPin(ev.pin), '', undefined, '12345']) {
    const res = await ev.join('ข้าว', 2, { pin });
    assert.deepEqual([res.status, res.json], [403, { error: 'pin' }], `pin ${pin}`);
  }
  assert.deepEqual(await snapshot(), before, 'a wrong PIN changed storage');
});

test('200 phones, each with one overlapping retry: no refusal, 200 names, each phone keeps one id', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const phones = 200;
  // Both sends of every phone start before any answer lands: 400 joins in flight at once.
  const sends = [];
  for (let i = 0; i < phones; i++) sends.push(ev.join(`p${i}`, i), ev.join(`p${i}`, i));
  const answers = await Promise.all(sends);
  const tally = {};
  for (const r of answers) tally[r.status] = (tally[r.status] ?? 0) + 1;
  assert.deepEqual(tally, { 200: phones, 201: phones }, 'every phone ends on 201 for one send and 200 for its retry');
  for (let i = 0; i < phones; i++) assert.equal(answers[2 * i].json.id, answers[2 * i + 1].json.id, `phone ${i} got two ids`);
  assert.equal((await ev.nameBlobs()).length, phones);
  assert.equal((await ev.slotBlobs()).length, phones, 'a phone holds a slot per send, not per name');
});

test('a storage failure at any step of a join never costs the phone its retry, across a full room', async () => {
  const steps = await stepsOf({ setup: openEvent, paused: (h, ev) => ev.join('ต้น', 1) }, 'join');
  // Both kinds of failure: the call never reached storage, or it took effect and only its answer was lost.
  for (const applied of [false, true])
  for (let i = 0; i < steps; i++) {
    const at = `${applied ? 'applied ' : ''}failure at step ${i} of ${steps}`;
    const h = await harness();
    const ev = await openEvent(h);
    // As many phones as the event admits, in one hour, each failing at the same step once.
    for (let p = 0; p < MAX_NAMES; p++) {
      const tag = `phone ${p}`;
      const gate = h.io.pause(tag, (_op, _path, n) => n === i);
      const failed = h.as(tag, () => ev.join(`n${p}`, p));
      await gate.reached;
      h.io.failNext(rest(500, 'InternalError'), { applied });
      gate.release();
      // A slot create that committed but answered an error is recovered by the join (the slot holds
      // its id), so that one step answers 201; every other injected failure answers 503.
      const failedCall = h.io.callsOf(tag)[i];
      const recovers = applied && failedCall.op === 'upload' && failedCall.path.includes('/slots/');
      assert.equal((await failed).status, recovers ? 201 : 503, `${at}, phone ${p}: the injected failure at ${failedCall.op} ${failedCall.path}`);
      const retry = await ev.join(`n${p}`, p);
      assert.ok([200, 201].includes(retry.status), `${at}, phone ${p}: the retry on healthy storage answered ${retry.status} ${JSON.stringify(retry.json)}`);
      if (p === 0) assert.equal((await ev.slotBlobs()).length, 1, `${at}: one phone holds more than one slot`);
    }
    assert.equal((await ev.nameBlobs()).length, MAX_NAMES, at);
    assert.equal((await ev.slotBlobs()).length, MAX_NAMES, `${at}: slots held`);
    assert.deepEqual((await ev.join('late', 9999)).json, { error: 'full' }, at);
  }
});

// ---- REFUTE round 3 (gh#308): expiry at the commit, an owned name cap, and a write trace ----

test('a start whose commit comes after the never-started expiry answers gone, at every storage step', async () => {
  // Positive control: the same start, just before the expiry and not paused, goes through.
  {
    const h = await harness();
    const ev = await openEvent(h);
    const a = (await ev.join('ต้น', 1)).json;
    mock.timers.setTime(Date.parse((await h.readJson(`${ev.eventId}/event.json`)).created) + LIVE_UNSTARTED_MS - 1000);
    assert.equal((await ev.start([a.id])).status, 200, 'a start one second before the never-started expiry');
  }
  await everyStep({
    async setup(h) {
      const ev = await openEvent(h);
      const a = (await ev.join('ต้น', 1)).json;
      const created = Date.parse((await h.readJson(`${ev.eventId}/event.json`)).created);
      mock.timers.setTime(created + LIVE_UNSTARTED_MS - 1000);
      return { ev, a, created };
    },
    paused: (h, { ev, a }) => ev.start([a.id]),
    async rival(h, { ev, a, created }) {
      // The never-started expiry passes while the start is paused, and a phone sees it.
      mock.timers.setTime(created + LIVE_UNSTARTED_MS + 1000);
      assert.deepEqual(await ev.status(a.id), { state: 'gone' });
    },
    async check(h, { ev, a, created }, start, _rival, step, i) {
      const record = await h.readJson(`${ev.eventId}/event.json`);
      assert.deepEqual([start.status, start.json, record.state, record.started], [404, { error: 'gone' }, 'open', undefined], `${step}: the start went through`);
      // Expired before its write: no write at all. Expired while its write was in flight: the write
      // and the write that puts the record back.
      const calls = h.io.callsOf('paused');
      const writes = calls.filter((c) => WRITES.has(c.op)).length;
      assert.equal(writes, calls[i].op === 'upload' ? 2 : 0, `${step}: the start wrote ${writes} times`);
      assert.deepEqual(await ev.status(a.id), { state: 'gone' }, `${step}: the start revived the event`);
      // The latest expiry ADR-0076's lifecycle rule is sized on: creation + 72 h + 24 h.
      mock.timers.setTime(created + LIVE_UNSTARTED_MS + LIVE_AFTER_START_MS + 1000);
      assert.deepEqual(await ev.status(a.id), { state: 'gone' }, `${step}: live past creation + 96 hours`);
    },
  });
});

test('the name cap is owned: 200 concurrent joins with one slot left admit exactly one, 199 answer full', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  for (let i = 0; i < MAX_NAMES - 1; i++) assert.equal((await ev.join(`seed${i}`, i)).status, 201, `seed ${i}`);
  const answers = await Promise.all(Array.from({ length: 200 }, (_, i) => ev.join(`burst${i}`, 1000 + i)));
  const tally = {};
  for (const r of answers) tally[`${r.status} ${r.json.error ?? ''}`.trim()] = (tally[`${r.status} ${r.json.error ?? ''}`.trim()] ?? 0) + 1;
  assert.deepEqual(tally, { 201: 1, '409 full': 199 });
  assert.equal((await ev.nameBlobs()).length, MAX_NAMES);
  assert.equal((await ev.slotBlobs()).length, MAX_NAMES);
  const review = await ev.names();
  const start = await ev.start(review.names.map((n) => n.id));
  assert.deepEqual([start.status, start.json.roster?.length], [200, MAX_NAMES], 'the reviewed list of a full event starts');
});

test('a removal frees its slot: a new join takes it, and the next one is full', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const ids = [];
  for (let i = 0; i < MAX_NAMES; i++) ids.push((await ev.join(`n${i}`, i)).json.id);
  assert.deepEqual((await ev.join('late', 9999)).json, { error: 'full' });
  assert.deepEqual((await ev.remove(ids[7])).json, { removed: true });
  assert.equal((await ev.slotBlobs()).length, MAX_NAMES - 1, 'the removed name kept its slot');
  assert.equal((await ev.join('late', 9999)).status, 201, 'the freed slot was not taken');
  assert.deepEqual((await ev.join('later', 9998)).json, { error: 'full' });
  assert.equal((await ev.nameBlobs()).length, MAX_NAMES);
  assert.equal((await ev.slotBlobs()).length, MAX_NAMES);
  assert.equal((await ev.purge()).status, 200);
  assert.deepEqual(await ev.blobs(), [], 'purge leaves no slot behind');
});

test('a wrong PIN issues no storage write; a correct join issues none before its PIN compare', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  assert.equal((await ev.join('ต้น', 1)).status, 201);
  const record = `${ev.eventId}/event.json`;
  for (const [i, pin] of [wrongPin(ev.pin), '', undefined, '12345'].entries()) {
    const res = await h.as(`wrong ${i}`, () => ev.join('ข้าว', 2, { pin }));
    assert.deepEqual([res.status, res.json], [403, { error: 'pin' }], `pin ${pin}`);
    // The trace, not a snapshot: a write undone before the answer leaves no blob, but leaves its call.
    assert.deepEqual(h.io.callsOf(`wrong ${i}`), [{ op: 'download', path: record }], `pin ${pin}: a call besides the record read`);
  }
  // A wrong PIN stops at the compare, so the calls a correct join makes before its compare are the
  // wrong PIN's calls: the correct trace starts with them, and they hold no write.
  const before = h.io.callsOf('wrong 0');
  const right = await h.as('right', () => ev.join('ข้าว', 2));
  assert.equal(right.status, 201);
  const calls = h.io.callsOf('right');
  assert.deepEqual(calls.slice(0, before.length), before, 'a correct join called storage before its PIN compare');
  assert.deepEqual(calls.filter((c) => WRITES.has(c.op)).length, 2);
  assert.deepEqual(
    calls.map((c) => c.op),
    ['download', 'getProperties', 'list', 'upload', 'upload', 'getProperties', 'download'],
    'a correct join: record, its name, the slot listing, claim a slot, write the name, check the slot, re-read the record',
  );
  assert.equal(calls[5].path, calls[3].path, 'the final slot check reads the slot this join claimed');
  assert.match(calls[3].path, new RegExp(`^${ev.eventId}/slots/\\d{4}$`));
  assert.match(calls[4].path, new RegExp(`^${ev.eventId}/names/[0-9a-f]{64}$`));
});

test('a storage failure at any step of a removal never strands the slot: the retried removal frees it', async () => {
  const setup = async (h) => {
    const ev = await openEvent(h);
    return { ev, a: (await ev.join('ต้น', 1)).json };
  };
  const steps = await stepsOf({ setup, paused: (h, { ev, a }) => ev.remove(a.id) }, 'remove');
  for (const applied of [false, true])
  for (let i = 0; i < steps; i++) {
    const at = `${applied ? 'applied ' : ''}failure at step ${i} of ${steps}`;
    const h = await harness();
    const { ev, a } = await setup(h);
    const gate = h.io.pause('remove', (_op, _path, n) => n === i);
    const failed = h.as('remove', () => ev.remove(a.id));
    await gate.reached;
    h.io.failNext(rest(500, 'InternalError'), { applied });
    gate.release();
    assert.equal((await failed).status, 503, `${at}: the injected failure`);
    assert.equal((await ev.remove(a.id)).status, 200, `${at}: the retried removal`);
    assert.deepEqual([(await ev.nameBlobs()).length, (await ev.slotBlobs()).length], [0, 0], `${at}: name and slot left`);
  }
});

// ---- REFUTE round 4 (gh#308): a put-back that tells the truth, creates reconciled by owner, one slot per device and name ----

test('a start whose put-back is refused never answers gone over a record left started', async () => {
  for (const applied of [false, true]) {
    const label = applied ? 'put-back landed, then answered 412' : 'put-back refused with 412';
    const h = await harness();
    const ev = await openEvent(h);
    const a = (await ev.join('ต้น', 1)).json;
    const created = Date.parse((await h.readJson(`${ev.eventId}/event.json`)).created);
    mock.timers.setTime(created + LIVE_UNSTARTED_MS - 1000);
    // Pauses match in order: the first upload is the commit, the second the put-back.
    const commit = h.io.pause('start', (op) => op === 'upload');
    const putBack = h.io.pause('start', (op) => op === 'upload');
    const start = h.as('start', () => ev.start([a.id]));
    await commit.reached;
    mock.timers.setTime(created + LIVE_UNSTARTED_MS + 1000);
    commit.release();
    await putBack.reached;
    // Refused: an ETag that moved, with nothing written. Applied: an SDK retry of a put-back that landed.
    h.io.failNext(rest(412, 'ConditionNotMet'), { applied });
    putBack.release();
    const res = await start;
    const record = await h.readJson(`${ev.eventId}/event.json`);
    assert.deepEqual([res.status, res.json, record.state, record.started], [404, { error: 'gone' }, 'open', undefined], `${label}: answered ${res.status} over a ${record.state} record`);
    assert.deepEqual(await ev.status(a.id), { state: 'gone' }, `${label}: the event reads live`);
  }
});

test('a create answered 409 or 412 after it landed is reconciled by its owner: one slot, and the cap holds', async () => {
  for (const code of [409, 412])
  for (const target of ['slots', 'names']) {
    const at = `${code} after the ${target} create landed`;
    const h = await harness();
    const ev = await openEvent(h);
    for (let i = 0; i < MAX_NAMES - 1; i++) assert.equal((await ev.join(`seed${i}`, i)).status, 201, `${at}: seed ${i}`);
    const gate = h.io.pause('retried', (op, path) => op === 'upload' && path.includes(`/${target}/`));
    const join = h.as('retried', () => ev.join('last', 5000));
    await gate.reached;
    h.io.failNext(rest(code, code === 409 ? 'BlobAlreadyExists' : 'ConditionNotMet'), { applied: true });
    gate.release();
    const res = await join;
    assert.ok([200, 201].includes(res.status), `${at}: answered ${res.status} ${JSON.stringify(res.json)}`);
    const names = await ev.nameBlobs();
    const slots = await ev.slotBlobs();
    assert.deepEqual([names.length, slots.length], [MAX_NAMES, MAX_NAMES], `${at}: names and slots held`);
    const stored = names.find((b) => Buffer.from(b.metadata.name, 'base64url').toString('utf8') === 'last');
    assert.equal(stored?.metadata.id, res.json.id, `${at}: the id answered is not the id stored`);
    assert.deepEqual(slots.filter((b) => b.metadata.id === res.json.id).length, 1, `${at}: slots holding the answered id`);
    assert.deepEqual((await ev.join('late', 9999)).json, { error: 'full' }, `${at}: a join past the cap`);
    assert.equal((await ev.nameBlobs()).length, MAX_NAMES, `${at}: names past the cap`);
  }
});

test('200 phones whose retries land while every first send holds its slot: nobody is told full, one slot per phone', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const phones = 200;
  const gates = [];
  const firsts = [];
  for (let i = 0; i < phones; i++) {
    gates.push(h.io.pause(`first ${i}`, (op, path) => op === 'upload' && isName(op, path)));
    firsts.push(h.as(`first ${i}`, () => ev.join(`p${i}`, i)));
  }
  await Promise.all(gates.map((g) => g.reached));
  const retries = await Promise.all(Array.from({ length: phones }, (_, i) => ev.join(`p${i}`, i)));
  for (const g of gates) g.release();
  const first = await Promise.all(firsts);
  const full = [...first, ...retries].filter((r) => r.json.error === 'full').length;
  assert.equal(full, 0, `${full} sends were told the event is full`);
  for (let i = 0; i < phones; i++) {
    assert.deepEqual([first[i].status, retries[i].status].sort(), [200, 201], `phone ${i}: ${first[i].status} and ${retries[i].status}`);
    assert.equal(first[i].json.id, retries[i].json.id, `phone ${i} got two ids`);
  }
  assert.equal((await ev.nameBlobs()).length, phones);
  assert.equal((await ev.slotBlobs()).length, phones, 'a phone holds more than one slot');
});

test('400 sends from 200 phones all claim before any name lands: nobody is told full, one slot per phone', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const phones = 200;
  const gates = [];
  const sends = [];
  for (let i = 0; i < phones; i++) {
    for (const s of ['a', 'b']) {
      gates.push(h.io.pause(`p${i}${s}`, (op, path) => op === 'upload' && isName(op, path)));
      sends.push(h.as(`p${i}${s}`, () => ev.join(`p${i}`, i)));
    }
  }
  // Every send either holds a slot and waits before its name write, or has already answered: no
  // name lands, so no send gives a slot back while another is still claiming.
  await Promise.all(sends.map((send, k) => Promise.race([gates[k].reached, send])));
  for (const g of gates) g.release();
  const answers = await Promise.all(sends);
  const tally = {};
  for (const r of answers) tally[`${r.status} ${r.json.error ?? ''}`.trim()] = (tally[`${r.status} ${r.json.error ?? ''}`.trim()] ?? 0) + 1;
  assert.deepEqual(tally, { 200: phones, 201: phones }, 'every phone ends on 201 for one send and 200 for the other');
  for (let i = 0; i < phones; i++) assert.equal(answers[2 * i].json.id, answers[2 * i + 1].json.id, `phone ${i} got two ids`);
  assert.equal((await ev.nameBlobs()).length, phones);
  assert.equal((await ev.slotBlobs()).length, phones, 'a phone holds more than one slot');
});

test('a send that shares a slot its first send gave up (lost name race, winner then removed) holds a slot before it answers', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const first = h.io.pause('first', (op, path) => op === 'upload' && isName(op, path));
  const lost = h.as('first', () => ev.join('ต้น', 1));
  await first.reached;
  const second = h.io.pause('second', (op, path) => op === 'upload' && isName(op, path));
  const late = h.as('second', () => ev.join('ต้น', 1));
  await second.reached;
  const winner = await ev.join('ต้น', 2);
  assert.equal(winner.status, 201);
  first.release();
  assert.deepEqual((await lost).json, { error: 'taken' });
  assert.deepEqual((await ev.remove(winner.json.id)).json, { removed: true });
  second.release();
  const res = await late;
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.deepEqual((await ev.nameBlobs()).map((b) => b.metadata.id), [res.json.id]);
  assert.deepEqual((await ev.slotBlobs()).map((b) => b.metadata.id), [res.json.id], 'a name stands without a slot');
});

test('a send whose shared join the admin removed while it was in flight takes its late write back', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const first = h.io.pause('first', (op, path) => op === 'upload' && isName(op, path));
  const joined = h.as('first', () => ev.join('ต้น', 1));
  await first.reached;
  const second = h.io.pause('second', (op, path) => op === 'upload' && isName(op, path));
  const late = h.as('second', () => ev.join('ต้น', 1));
  await second.reached;
  first.release();
  const a = await joined;
  assert.equal(a.status, 201);
  assert.deepEqual((await ev.remove(a.json.id)).json, { removed: true });
  second.release();
  await late;
  assert.deepEqual([(await ev.nameBlobs()).length, (await ev.slotBlobs()).length], [0, 0], 'a removed join came back');
  assert.equal((await ev.join('ต้น', 2)).status, 201, 'the name of a removed join stays taken');
});

// ---- Conditional record writes that landed and then answered 412 or 409 (gh#308, REFUTE round 5 prep) ----

test('a removal whose record write landed and answered 412, with a start before its re-read, answers removed and stays out', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = (await ev.join('ต้น', 1)).json;
  const b = (await ev.join('ข้าว', 2)).json;
  const write = h.io.pause('remove', (op) => op === 'upload');
  const reread = h.io.pause('remove', (op) => op === 'download' && write.hit());
  const rm = h.as('remove', () => ev.remove(a.id));
  await write.reached;
  h.io.failNext(rest(412, 'ConditionNotMet'), { applied: true });
  write.release();
  await reread.reached;
  const start = await ev.start([a.id, b.id]);
  reread.release();
  const res = await rm;
  assert.equal(start.status, 200);
  const member = (await ev.status(a.id)).member;
  assert.deepEqual([res.status, res.json, member], [200, { removed: true }, false], `answered ${res.status} ${JSON.stringify(res.json)}; member ${member}`);
  assert.deepEqual((await ev.nameBlobs()).map((n) => n.metadata.id), [b.id], 'the removed name is still stored');
});

test('a start whose commit landed after the never-started expiry and answered 412 still answers gone and puts the record back', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = (await ev.join('ต้น', 1)).json;
  const created = Date.parse((await h.readJson(`${ev.eventId}/event.json`)).created);
  mock.timers.setTime(created + LIVE_UNSTARTED_MS - 1000);
  const commit = h.io.pause('start', (op) => op === 'upload');
  const start = h.as('start', () => ev.start([a.id]));
  await commit.reached;
  mock.timers.setTime(created + LIVE_UNSTARTED_MS + 1000);
  h.io.failNext(rest(412, 'ConditionNotMet'), { applied: true });
  commit.release();
  const res = await start;
  const record = await h.readJson(`${ev.eventId}/event.json`);
  assert.deepEqual([res.status, res.json, record.state, record.started], [404, { error: 'gone' }, 'open', undefined], `answered ${res.status} over a ${record.state} record`);
  assert.deepEqual(await ev.status(a.id), { state: 'gone' }, 'the start revived the event');
});

test('a create whose record landed and answered 409 answers that event and leaves no second record', async () => {
  const h = await harness();
  h.io.failNext(rest(409, 'BlobAlreadyExists'), { applied: true });
  const res = await h.call('POST', 'events');
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const records = (await h.list('')).map((b) => b.name).filter((n) => n.endsWith('/event.json'));
  assert.deepEqual(records, [`${res.json.eventId}/event.json`], 'an orphan event record was left, or the answered one is missing');
  const names = await h.call('GET', `events/${res.json.eventId}/names`, { admin: res.json.adminToken });
  assert.deepEqual([names.status, names.json], [200, { state: 'open', names: [] }], 'the answered admin token does not open the answered event');
});

// ---- Cross-lineage REFUTE round 1 (gh#308): removal fences, revalidation after the last write, slot reclamation ----

const named = (blob) => Buffer.from(blob.metadata.name ?? '', 'base64url').toString('utf8');

test('a removed id stays fenced: a stalled send of it, resumed after a later removal, never comes back', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  for (let i = 0; i < MAX_NAMES - 2; i++) assert.equal((await ev.join(`f${i}`, i)).status, 201, `filler ${i}`);
  const c = (await ev.join('C', 5001)).json;
  const stall = h.io.pause('A1', (op, path) => op === 'upload' && isName(op, path));
  const a1 = h.as('A1', () => ev.join('A', 5000));
  await stall.reached;
  const a2 = await ev.join('A', 5000);
  assert.equal(a2.status, 201);
  assert.deepEqual((await ev.remove(a2.json.id)).json, { removed: true });
  assert.deepEqual((await ev.remove(c.id)).json, { removed: true });
  stall.release();
  const late = await a1;
  await ev.join('D', 5002);
  await ev.join('E', 5003);
  const names = await ev.nameBlobs();
  const slots = await ev.slotBlobs();
  assert.ok(![200, 201].includes(late.status), `the removed join answered ${late.status} ${JSON.stringify(late.json)}`);
  assert.ok(!names.some((b) => b.metadata.id === a2.json.id), 'the removed id is stored again');
  // 298 fillers, less C, plus D and E: the room is full again, and every name holds a slot.
  assert.deepEqual([names.length, slots.length], [MAX_NAMES, MAX_NAMES], 'names and slots after the fills');
});

test('a shared send stalled before its final checks, resumed after its id was removed, leaves no slot and answers no join', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const fillers = new Set();
  for (let i = 0; i < MAX_NAMES - 1; i++) fillers.add((await ev.join(`f${i}`, i)).json.id);
  const stallA = h.io.pause('A', (op, path) => op === 'upload' && isName(op, path));
  const a = h.as('A', () => ev.join('A', 5000));
  await stallA.reached;
  const slot = (await ev.slotBlobs()).find((b) => !fillers.has(b.metadata.id));
  let heads = 0;
  const stallB = h.io.pause('B', (op, path) => op === 'getProperties' && path === slot.name && ++heads === 2);
  const b = h.as('B', () => ev.join('A', 5000));
  await stallB.reached;
  stallA.release();
  await a;
  assert.deepEqual((await ev.remove(slot.metadata.id)).json, { removed: true });
  stallB.release();
  const late = await b;
  assert.ok(![200, 201].includes(late.status), `the removed join answered ${late.status} ${JSON.stringify(late.json)}`);
  assert.deepEqual([(await ev.nameBlobs()).length, (await ev.slotBlobs()).length], [MAX_NAMES - 1, MAX_NAMES - 1], 'names and slots');
  assert.equal((await ev.join('C', 5001)).status, 201, 'the next phone was refused');
});

test('joins abandoned after a failed name write leave no hidden slots: a full room of them, then a healthy join is admitted', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  for (let i = 0; i < MAX_NAMES; i++) {
    const gate = h.io.pause(`failed ${i}`, (op, path) => op === 'upload' && isName(op, path));
    const failed = h.as(`failed ${i}`, () => ev.join(`bad${i}`, i));
    await gate.reached;
    h.io.failNext(rest(500, 'InternalError'));
    gate.release();
    assert.equal((await failed).status, 503, `failed ${i}`);
  }
  assert.deepEqual([(await ev.nameBlobs()).length, (await ev.slotBlobs()).length], [0, 0], 'names and slots after the abandoned joins');
  assert.equal((await ev.join('B', 9000)).status, 201);
});

test('slots of dead joins are reclaimed by the next claimer after RECLAIM_AFTER_MS, and a late original writer fails cleanly', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  // Each dead join holds its slot and never runs again (a host that died mid-request), until released below.
  const dead = [];
  for (let i = 0; i < MAX_NAMES; i++) {
    const gate = h.io.pause(`dead ${i}`, (op, path) => op === 'upload' && isName(op, path));
    dead.push({ gate, join: h.as(`dead ${i}`, () => ev.join(`dead${i}`, i)) });
    await gate.reached;
  }
  assert.deepEqual((await ev.join('early', 9000)).json, { error: 'full' }, 'reclaimed before the bound');
  mock.timers.tick(RECLAIM_AFTER_MS + 1000);
  const healthy = await ev.join('B', 9001);
  assert.equal(healthy.status, 201, JSON.stringify(healthy.json));
  // Every dead join now resumes: one has lost its slot to the healthy join and must not also win.
  for (const d of dead) d.gate.release();
  const answers = await Promise.all(dead.map((d) => d.join));
  const tally = {};
  for (const r of answers) tally[r.status] = (tally[r.status] ?? 0) + 1;
  assert.deepEqual(tally, { 201: MAX_NAMES - 1, 503: 1 }, 'the robbed writer did not fail cleanly');
  const names = await ev.nameBlobs();
  const slots = await ev.slotBlobs();
  assert.deepEqual([names.length, slots.length], [MAX_NAMES, MAX_NAMES], 'names and slots');
  const backed = new Set(slots.map((s) => s.metadata.id));
  assert.deepEqual(names.filter((n) => !backed.has(n.metadata.id)).map(named), [], 'names without a slot');
});


// ---- REFUTE round 2 (gh#308): admission is the record plus the numbered slots, never the name blobs ----

const withName = async (ev, name) => (await ev.nameBlobs()).find((b) => named(b) === name);
const atSlot = (op, path) => op === 'upload' && path.includes('/slots/');

/** Fill all but the last slot, then park a join that claims the last one and never writes its name. */
async function deadOnLastSlot(h, ev) {
  for (let i = 0; i < MAX_NAMES - 1; i++) assert.equal((await ev.join(`f${i}`, i)).status, 201, `filler ${i}`);
  const gate = h.io.pause('dead', (op, path) => op === 'upload' && isName(op, path));
  const dead = h.as('dead', () => ev.join('A', 5000));
  await gate.reached;
  const fillers = new Set((await ev.nameBlobs()).map((b) => b.metadata.id));
  const slot = (await ev.slotBlobs()).find((b) => !fillers.has(b.metadata.id)).name;
  return { gate, dead, slot };
}

test('a late name that landed and then threw leaves 300 admitted names in 300 slots, and its retry answers removed', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  for (let i = 0; i < MAX_NAMES - 1; i++) assert.equal((await ev.join(`f${i}`, i)).status, 201, `filler ${i}`);
  const gate = h.io.pause('A', (op, path) => op === 'upload' && isName(op, path));
  const late = h.as('A', () => ev.join('A', 5000));
  await gate.reached;
  const shared = await ev.join('A', 5000);
  assert.equal(shared.status, 201);
  assert.deepEqual((await ev.remove(shared.json.id)).json, { removed: true });
  h.io.failNext(rest(500, 'InternalError'), { applied: true });
  gate.release();
  assert.equal((await late).status, 503);
  assert.equal((await ev.join('D', 5001)).status, 201);
  mock.timers.tick(RECLAIM_AFTER_MS + 1000);
  assert.deepEqual((await ev.join('E', 5002)).json, { error: 'full' }, 'a join past the cap');
  const retry = await ev.join('A', 5000);
  assert.deepEqual([retry.status, retry.json], [409, { error: 'removed' }], 'the removed join came back on a retry');
  assert.deepEqual([(await ev.names()).names.length, (await ev.slotBlobs()).length], [MAX_NAMES, MAX_NAMES], 'admitted names and slots');
});

test('a retry through a removal fence answers removed, never the removed id', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = (await ev.join('A', 1)).json;
  const gate = h.io.pause('remove', (op, path) => op === 'delete' && isName(op, path));
  const rm = h.as('remove', () => ev.remove(a.id));
  await gate.reached;
  const retry = await ev.join('A', 1);
  gate.release();
  assert.deepEqual((await rm).json, { removed: true });
  assert.deepEqual([retry.status, retry.json], [409, { error: 'removed' }]);
});

test('a reclaim whose slot delete landed but lost its answer (404 or 412) still admits the healthy join', async () => {
  for (const code of [404, 412]) {
    const h = await harness();
    const ev = await openEvent(h);
    const { slot } = await deadOnLastSlot(h, ev);
    mock.timers.tick(RECLAIM_AFTER_MS + 1000);
    const gate = h.io.pause('healthy', (op, path) => op === 'delete' && path === slot);
    const healthy = h.as('healthy', () => ev.join('B', 5001));
    await gate.reached;
    h.io.failNext(rest(code, code === 404 ? 'BlobNotFound' : 'ConditionNotMet'), { applied: true });
    gate.release();
    const res = await healthy;
    assert.equal(res.status, 201, `${code}: ${JSON.stringify(res.json)}`);
    assert.deepEqual([(await ev.names()).names.length, (await ev.slotBlobs()).length], [MAX_NAMES, MAX_NAMES], `${code}: admitted names and slots`);
  }
});

test('two claimers racing to reclaim one slot: one is admitted, the loser is told full only while the slot is occupied', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const { slot } = await deadOnLastSlot(h, ev);
  mock.timers.tick(RECLAIM_AFTER_MS + 1000);
  const aDel = h.io.pause('reclaim-A', (op, path) => op === 'delete' && path === slot);
  const aMade = h.io.pause('reclaim-A', (op, path) => atSlot(op, path) && path === slot);
  const bDel = h.io.pause('reclaim-B', (op, path) => op === 'delete' && path === slot);
  const a = h.as('reclaim-A', () => ev.join('B', 5001));
  await aDel.reached;
  const b = h.as('reclaim-B', () => ev.join('C', 5002));
  await bDel.reached;
  aDel.release();
  await aMade.reached;
  bDel.release();
  const bRes = await b;
  const slotsAtB = (await ev.slotBlobs()).length;
  aMade.release();
  const aRes = await a;
  const answers = [aRes, bRes].map((r) => `${r.status} ${r.json.error ?? ''}`.trim()).sort();
  assert.deepEqual(answers, ['201', '409 full'], JSON.stringify(answers));
  if (bRes.status === 409) assert.equal(slotsAtB, MAX_NAMES, 'the loser was told full while the slot was empty');
  assert.deepEqual([(await ev.names()).names.length, (await ev.slotBlobs()).length], [MAX_NAMES, MAX_NAMES]);
});

/** A join whose twin completed and whose id was then removed, parked after its name PUT (a terminated writer). */
async function fencedOrphan(h, ev) {
  const valid = (await ev.join('C', 9)).json;
  const gate = h.io.pause('A', (op, path) => op === 'upload' && isName(op, path));
  void h.as('A', () => ev.join('A', 5000));
  await gate.reached;
  const shared = (await ev.join('A', 5000)).json;
  assert.deepEqual((await ev.remove(shared.id)).json, { removed: true });
  const terminated = h.io.pause('A', (op, path) => op === 'getProperties' && path.includes('/slots/'));
  gate.release();
  await terminated.reached;
  const orphan = await withName(ev, 'A');
  assert.equal(orphan?.metadata.id, shared.id, 'the fixture left no fenced orphan');
  return { valid, removedId: shared.id, orphan };
}

test('collection that fails keeps garbage but admits none of it: not listed, not frozen, its retry answers removed', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const { valid, removedId, orphan } = await fencedOrphan(h, ev);
  h.io.failOn((op, path) => op === 'delete' && path === orphan.name, rest(500, 'InternalError'));
  const list = await ev.names();
  assert.deepEqual(list.names.map((n) => n.id), [valid.id]);
  const retry = await ev.join('A', 5000);
  assert.deepEqual([retry.status, retry.json], [409, { error: 'removed' }]);
  const start = await ev.start([valid.id, removedId]);
  assert.deepEqual(start.json.roster.map((m) => m.id), [valid.id]);
  assert.ok(await withName(ev, 'A'), 'the fixture lost its garbage: collection did not fail');
});

test('an orphan left by a terminated writer is collected on admin activity, and is never listed or frozen', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const { valid, removedId } = await fencedOrphan(h, ev);
  mock.timers.tick(RECLAIM_AFTER_MS + 1000);
  const next = (await ev.join('D', 5001)).json;
  assert.deepEqual(new Set((await ev.names()).names.map((n) => n.id)), new Set([valid.id, next.id]));
  const start = await ev.start([valid.id, removedId, next.id]);
  assert.deepEqual(new Set(start.json.roster.map((m) => m.id)), new Set([valid.id, next.id]));
  assert.equal(await withName(ev, 'A'), undefined, 'the orphan was not collected');
});

test('an unfenced name with no slot is never listed nor frozen', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = (await ev.join('A', 1)).json;
  for (const b of await ev.slotBlobs()) await h.drop(b.name);
  assert.deepEqual((await ev.names()).names, []);
  const start = await ev.start([a.id]);
  assert.deepEqual([start.status, start.json], [409, { error: 'empty' }]);
});

test('a writer terminated after its name PUT, its slot reclaimed, is never listed nor frozen', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const { gate } = await deadOnLastSlot(h, ev);
  mock.timers.tick(RECLAIM_AFTER_MS + 1000);
  const healthy = await ev.join('B', 5001);
  assert.equal(healthy.status, 201);
  const terminated = h.io.pause('dead', (op, path) => op === 'getProperties' && path.includes('/slots/'));
  gate.release();
  await terminated.reached;
  const orphan = await withName(ev, 'A');
  assert.ok(orphan, 'the fixture left no orphan');
  const list = (await ev.names()).names;
  assert.equal(list.length, MAX_NAMES);
  assert.ok(!list.some((n) => n.id === orphan.metadata.id), 'the orphan is listed');
  // A start body holds at most MAX_NAMES ids: 299 reviewed names and the orphan's id.
  const start = await ev.start([...list.slice(1).map((n) => n.id), orphan.metadata.id]);
  assert.equal(start.status, 200, JSON.stringify(start.json));
  assert.equal(start.json.roster.length, MAX_NAMES - 1);
  assert.ok(!start.json.roster.some((m) => m.id === orphan.metadata.id), 'the orphan is frozen');
});

test('collection never deletes a replacement: a join that takes the name while a listing is collecting keeps it', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  await ev.join('A', 1);
  for (const b of await ev.slotBlobs()) await h.drop(b.name);
  const path = (await withName(ev, 'A')).name;
  const gate = h.io.pause('list', (op, p) => op === 'delete' && p === path);
  const listing = h.as('list', () => ev.names());
  await gate.reached;
  const replacement = await ev.join('A', 2);
  assert.equal(replacement.status, 201);
  gate.release();
  await listing;
  assert.equal((await withName(ev, 'A'))?.metadata.id, replacement.json.id, 'the replacement was deleted');
  assert.equal((await ev.join('A', 2)).status, 200);
});

test('a valid same-device retry after the start answers 200 with its frozen id', async () => {
  const h = await harness();
  const ev = await openEvent(h);
  const a = (await ev.join('A', 1)).json;
  assert.equal((await ev.start([a.id])).status, 200);
  const retry = await ev.join('A', 1);
  assert.deepEqual([retry.status, retry.json.id], [200, a.id]);
});
