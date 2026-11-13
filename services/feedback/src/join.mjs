// gh#308 / ADR-0076: the pure half of the prize-draw QR join. It routes a request, validates names,
// decides every outcome and shapes every response; storage is a small injected port, so this file
// imports no Azure SDK and the site's own `npm test` runs it with nothing installed (ADR-0074).
// Nothing here runs at import beyond constant definitions: the function module that imports this
// file shares a Function App with the live feedback endpoint, and a throw at load takes both down.
//
// Concurrency: the event record is the one point of truth for an event's state. Every state change
// (open -> started -> closed) and every removal is a write to it conditional on the ETag that was read,
// so two admin operations that race cannot both act on the same view. Joins never write the record
// (a crowd would contend on it); a join re-reads it after writing its name and undoes its own write
// if admission had closed in between.
//
// Invariants. Model: a storage call either takes effect before the request's next call or never; a
// request may stall, or be terminated at any point, but the platform ends every request within its
// function timeout (at most 10 minutes on Consumption), which RECLAIM_AFTER_MS exceeds.
// - Admission. A name counts only through `admission`: the event is live, its id is not in `removed`,
//   a numbered slot (1 to the cap) holds its id, its name key and its owner, and the event is open or
//   the id is in the frozen roster. The slot is read before the final record read. The admin list,
//   the frozen roster, every retry answer and the cap all go through it. Name blobs are a payload and a
//   uniqueness index; how many of them exist decides nothing. Every ADMITTED name has a slot.
// - Slots. MAX_NAMES numbered slot blobs are the cap. A slot carries its join id, its owner (one
//   device token and one name: every send of one join shares the slot and its id), its name key, the
//   time of its last claim or touch, and the write that put it there. A send that shares a slot
//   rewrites it conditionally (a touch), so the slot's ETag moves whenever a second request may rely
//   on it.
// - Names. A name blob is written only while its join holds a slot; the join then checks its slot
//   and reads the record before it answers 201 or 200. A blob that does not count (its writer was
//   terminated, failed, or lost its slot or its id) is garbage: collected best-effort, a bounded number
//   at a time, by admin reads and by joins that meet it, each delete conditional on the ETag just read,
//   and by purge. A join may also take its name over with a write conditional on that ETag. Nothing
//   correct depends on collection succeeding or on any writer finishing.
// - Removals. A removed id is fenced for the life of the event: `removed` only grows.
// - Reservations. A slot is freed by a removal (fence first), by a join's undo after a fence or a
//   closed admission, by the request that created it while no other request has touched it (a delete
//   conditional on its creating ETag), by a purge, or by the next claimer once it is RECLAIM_AFTER_MS
//   past its last claim or touch with no name holding its id. A slot found already absent may be
//   created (create-only); a delete whose answer was lost is settled by reading the slot back.
//
// A create refused with 409 or 412 may be this request's own write, landed on an attempt whose answer
// was lost and retried by the SDK. Each written blob carries who owns it, and a refused write reads
// it back: ours is used, never treated as someone else's.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** A name is at most this many clusters (owner ruling 2026-11-11). */
export const NAME_MAX_GRAPHEMES = 12;
/** Size ceiling in UTF-16 code units, checked before anything is segmented. */
export const NAME_MAX_UNITS = 64;
/** Code points in one cluster: a Thai consonant and at most two marks on it. */
export const NAME_MAX_CLUSTER = 3;
/** Slots per event, so names one event holds at once. The draw is sized for 50-200 people (gh#299); the slack is for re-joins. */
export const MAX_NAMES = 300;
const HOUR_MS = 60 * 60 * 1000;
/** A started event answers for this long after its start, then reads as gone even before it is deleted. */
export const LIVE_AFTER_START_MS = 24 * HOUR_MS;
/** An event never started answers for this long after it is created (owner ruling 2026-11-11). */
export const LIVE_UNSTARTED_MS = 72 * HOUR_MS;
export const PIN_DIGITS = 6;
/** Body caps in bytes, per operation. A start carries up to MAX_NAMES ids of 22 characters. */
export const BODY_CAP = { create: 256, join: 1024, status: 0, names: 0, remove: 256, start: 16384, purge: 256 };
/** The blob container the Function App writes join data to; the deploy creates it (ADR-0076). */
export const DRAW_CONTAINER = 'prize-draw-join';
/** Conditional writes to one blob retry this many times before the request answers 503. */
const WRITE_ATTEMPTS = 5;
/**
 * A slot this long past its last claim or touch, with no name holding its id, is reclaimable by the
 * next claimer. Above the longest a request can run (the Consumption function timeout is at most 10
 * minutes), so every writer that could still use the slot has ended.
 */
export const RECLAIM_AFTER_MS = 15 * 60 * 1000;
/** Garbage name blobs one admin read deletes at most, so collection never makes a request unbounded. */
const COLLECT_AT_MOST = 16;

const ID = /^[A-Za-z0-9_-]{22}$/;
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

// A name is checked against a set this file owns, never against a set of bad characters: Unicode
// keeps adding invisible and look-alike code points, and a deny-list cannot enumerate them.
// Control, format and separator characters are named first only to give them a clearer reason.
const FORBIDDEN = /[\p{C}\p{Zl}\p{Zp}]/u;
/** Thai consonants, vowels, marks and digits; ASCII letters and digits; space and . - ' _ */
const ALLOWED = /^[\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59A-Za-z0-9 .'_-]*$/u;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
/** The Thai combining marks (general category Mn) inside the allowed set. */
const THAI_MARK = /^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]$/u;
/** SARA AM is a spacing letter, but it joins the cluster before it, so it stacks like a mark. */
const SARA_AM = '\u0E33';
const isConsonant = (c) => c >= '\u0E01' && c <= '\u0E2E';
const isToneMark = (c) => c >= '\u0E48' && c <= '\u0E4B';
const attaches = (c) => c === SARA_AM || THAI_MARK.test(c);

/**
 * Split allowed text into clusters by a rule this file owns: every code point that attaches (a Thai
 * mark or SARA AM) joins the cluster before it; anything else starts one. On the allowed set this
 * equals the UAX #29 count, but it does not depend on the runtime's ICU version.
 * @param {string} text
 * @returns {string[][]}
 */
function clusters(text) {
  const out = [];
  for (const c of text) {
    if (attaches(c) && out.length > 0) out[out.length - 1].push(c);
    else out.push([c]);
  }
  return out;
}

/**
 * Validate and normalise one typed name.
 * @param {unknown} raw
 * @returns {{ ok: true, name: string } | { ok: false, reason: 'empty' | 'lone-surrogate' | 'control' | 'emoji' | 'charset' | 'too-long' | 'leading-mark' | 'stacked-marks' }}
 */
export function checkName(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  if (!raw.isWellFormed()) return { ok: false, reason: 'lone-surrogate' };
  const nfc = raw.normalize('NFC');
  if (FORBIDDEN.test(nfc)) return { ok: false, reason: 'control' };
  const name = nfc.replace(/\s+/gu, ' ').trim();
  if (name === '') return { ok: false, reason: 'empty' };
  if (name.length > NAME_MAX_UNITS) return { ok: false, reason: 'too-long' };
  if (!ALLOWED.test(name)) return { ok: false, reason: EMOJI.test(name) ? 'emoji' : 'charset' };
  const parts = clusters(name);
  if (parts.length > NAME_MAX_GRAPHEMES) return { ok: false, reason: 'too-long' };
  for (const cluster of parts) {
    // A mark needs a Thai consonant under it: not the start of the name, a space, a Latin letter, a
    // digit or a vowel letter.
    if (attaches(cluster[0]) || (cluster.length > 1 && !isConsonant(cluster[0]))) return { ok: false, reason: 'leading-mark' };
    if (cluster.length > NAME_MAX_CLUSTER) return { ok: false, reason: 'stacked-marks' };
    // The same mark twice prints on top of itself and reads as one.
    if (new Set(cluster).size !== cluster.length) return { ok: false, reason: 'stacked-marks' };
    const am = cluster.indexOf(SARA_AM);
    if (am > 0 && !isConsonant(cluster[am - 1]) && !isToneMark(cluster[am - 1])) return { ok: false, reason: 'stacked-marks' };
  }
  return { ok: true, name };
}

/**
 * The uniqueness key: two names with one key read the same on a projector, so the second is "taken".
 * It works on a name checkName accepted. NFKC splits SARA AM into NIKHAHIT + SARA AA, so the two
 * spellings of one syllable meet; two SARA E read as SARA AE; the obsolete KHO KHUAT and KHO KHON
 * read as KHO KHAI and KHO KHWAI; marks on one consonant are sorted, so their typing order is lost;
 * case folds and spaces drop. Hashed so the key is always a safe blob name.
 */
export function nameKey(name) {
  const folded = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ /g, '')
    .replace(/\u0E40\u0E40/g, '\u0E41')
    .replace(/\u0E03/g, '\u0E02')
    .replace(/\u0E05/g, '\u0E04');
  const canonical = clusters(folded).map(([base, ...marks]) => base + marks.sort().join('')).join('');
  return sha256(canonical);
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const newId = () => randomBytes(16).toString('base64url');

/** Equal-length, constant-time comparison of two strings. */
function sameSecret(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A PIN as typed: Thai numerals become ASCII, spaces and dashes drop out (the round code does the same). */
export function normalizePin(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0E50-\u0E59]/g, (d) => String(d.codePointAt(0) - 0x0e50)).replace(/[\s-]/g, '');
}

/**
 * Map a request to an operation. Only GET and POST are used.
 * @param {string} method
 * @param {string} path the part after `/api/draw/`
 * @returns {{ op: string, params: Record<string, string> } | null} op 'method' means the path exists but not for this method
 */
export function routeDraw(method, path) {
  const parts = String(path ?? '').split('/').filter((p) => p !== '');
  const table = [
    ['POST', ['events'], 'create'],
    ['POST', ['events', ':eventId', 'join'], 'join'],
    ['GET', ['events', ':eventId', 'status', ':id'], 'status'],
    ['GET', ['events', ':eventId', 'names'], 'names'],
    ['POST', ['events', ':eventId', 'names', ':id', 'remove'], 'remove'],
    ['POST', ['events', ':eventId', 'start'], 'start'],
    ['POST', ['events', ':eventId', 'purge'], 'purge'],
  ];
  let wrongMethod = false;
  for (const [verb, pattern, op] of table) {
    if (pattern.length !== parts.length) continue;
    const params = {};
    const hit = pattern.every((seg, i) => {
      if (!seg.startsWith(':')) return seg === parts[i];
      params[seg.slice(1)] = parts[i];
      return ID.test(parts[i]);
    });
    if (!hit) continue;
    if (verb === String(method).toUpperCase()) return { op, params };
    wrongMethod = true;
  }
  return wrongMethod ? { op: 'method', params: {} } : null;
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};
const reply = (status, json) => ({ status, headers: { ...HEADERS }, body: JSON.stringify(json) });

/** The answer to a body over its cap; the function module sends it before join logic runs. */
export const tooLarge = () => reply(413, { error: 'too-large' });

/**
 * The request header that carries the admin token. Not `Authorization`: the SWA `/api` proxy may
 * replace that header on its way to a linked backend, so a custom header is the one that survives.
 */
export const ADMIN_HEADER = 'x-draw-admin';

/** Blob metadata holds ASCII only, so a name travels base64url-encoded; the other fields are ASCII already. */
export function encodeNameRecord(record) {
  return { id: record.id, name: Buffer.from(record.name, 'utf8').toString('base64url'), joined: record.joined, token: record.token };
}
export function decodeNameRecord(meta) {
  return { id: meta.id, name: Buffer.from(meta.name ?? '', 'base64url').toString('utf8'), joined: meta.joined, token: meta.token };
}

/** Blob paths inside DRAW_CONTAINER. Every blob of an event sits under its id, so purge is one prefix. */
export const paths = {
  record: (eventId) => `${eventId}/event.json`,
  namesPrefix: (eventId) => `${eventId}/names/`,
  name: (eventId, key) => `${eventId}/names/${key}`,
  slotsPrefix: (eventId) => `${eventId}/slots/`,
  slot: (eventId, n) => `${eventId}/slots/${String(n).padStart(4, '0')}`,
  event: (eventId) => `${eventId}/`,
};

function parseBody(text) {
  if (text === '' || text == null) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Live: not closed by a purge, and within LIVE_AFTER_START_MS of its start, or, never started,
 * within LIVE_UNSTARTED_MS of its creation. An organiser can set up the day before; the clock that
 * matters is the party's.
 */
function isLive(event, now) {
  if (!event || event.state === 'closed') return false;
  const age = event.started ? now.getTime() - Date.parse(event.started) : now.getTime() - Date.parse(event.created);
  return age <= (event.started ? LIVE_AFTER_START_MS : LIVE_UNSTARTED_MS);
}
const adminToken = (header) => /^[A-Za-z0-9_-]{43}$/.exec(String(header ?? '').trim())?.[0] ?? null;
const contended = () => Object.assign(new Error('conditional write lost every attempt'), { code: 'Contended' });

/**
 * Handle one request. The function module passes exactly these fields and nothing else from the
 * HTTP request, so no header (client IP included) can reach storage or a log.
 *
 * The store port; every write in it is conditional, so nothing here can overwrite blindly:
 * - read(path) -> { doc, etag } | null
 * - put(path, { json?, metadata?, ifMatch? }) -> etag | null. Without ifMatch it only creates.
 *   null means the condition failed: the blob exists, or its ETag moved, or it is gone. That may be
 *   this very write, landed on an attempt whose answer was lost; the caller reads the owner back.
 * - head(path) -> { metadata, etag } | null
 * - del(path, ifMatch?) -> boolean. True when the blob is gone (deleted by this call, or already
 *   absent: the retry of a delete that landed). False only when its ETag moved, which some services
 *   also answer for a blob that is gone; a caller that must know reads it back. Without ifMatch it
 *   deletes whatever is there; only purge does that.
 * - list(prefix) -> [{ path, metadata }]. No ETag: a listing spells it differently from a header.
 * @param {{ method: string, path: string, admin: string | null, bodyText: string }} request
 * @param {{ store: object, now: () => Date, log: (...parts: unknown[]) => void, limits?: { names?: number } }} deps
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
 */
export async function handleDraw(request, deps) {
  const route = routeDraw(request.method, request.path);
  if (!route) return reply(404, { error: 'no-route' });
  if (route.op === 'method') return reply(405, { error: 'method' });
  const body = parseBody(request.bodyText);
  if (body === null) return reply(400, { error: 'bad-request' });
  const limits = { names: MAX_NAMES, ...deps.limits };
  try {
    return await OPS[route.op]({ ...route.params, body, admin: adminToken(request.admin) }, { ...deps, limits });
  } catch (error) {
    // Status and code only: an error object can carry request detail, and logs outlive the purge.
    deps.log('draw store failed', route.op, error?.statusCode ?? '', error?.code ?? '');
    return reply(503, { error: 'unavailable' });
  }
}

/** Read the event record and check the admin token. Returns the record and its ETag, or the reply to send. */
async function adminEvent({ eventId, admin }, { store, now }, { allowExpired = false } = {}) {
  const read = await store.read(paths.record(eventId));
  if (!read) return { reply: reply(404, { error: 'gone' }) };
  if (!admin || !sameSecret(sha256(admin), read.doc.admin)) return { reply: reply(401, { error: 'admin' }) };
  if (!allowExpired && !isLive(read.doc, now())) return { reply: reply(404, { error: 'gone' }) };
  return { event: read.doc, etag: read.etag };
}

/** Every joined name of an event, decoded, with its blob path. */
async function listNames(store, eventId) {
  return (await store.list(paths.namesPrefix(eventId))).map(({ path, metadata }) => ({ path, ...decodeNameRecord(metadata ?? {}) }));
}

/** A slot path inside the numbered set, 1 to `count`. Anything else under `slots/` never backs a name. */
function numbered(eventId, path, count) {
  const n = Number(path.slice(paths.slotsPrefix(eventId).length));
  return Number.isInteger(n) && n >= 1 && n <= count && path === paths.slot(eventId, n);
}

/** The slot metadata that backs this name: its id, its name key, and its owner from its token hash and key. */
function backs(name) {
  const key = nameKey(String(name.name ?? ''));
  const owner = sha256(`${name.token}/${key}`);
  return (metadata) => metadata?.id === name.id && metadata.key === key && metadata.owner === owner;
}

/**
 * The admission verdict for one name, given whether a numbered slot backs it and the event record read
 * after that slot. Reasons, in order: gone, removed, started (not in the frozen roster), unbacked.
 */
function verdictOf(event, id, backed, at) {
  if (!isLive(event, at)) return { admitted: false, reason: 'gone' };
  if (event.removed?.includes(id)) return { admitted: false, reason: 'removed' };
  if (event.state !== 'open' && !event.roster?.some((m) => m.id === id)) return { admitted: false, reason: 'started' };
  if (!backed) return { admitted: false, reason: 'unbacked' };
  return { admitted: true, reason: null };
}

/** Whether one stored name counts (see the invariants): its slot is read first, the record last. */
async function admission(store, eventId, name, count, now) {
  const match = backs(name);
  const slot = (await store.list(paths.slotsPrefix(eventId))).find(({ path, metadata }) => numbered(eventId, path, count) && match(metadata));
  const backing = slot ? await store.head(slot.path) : null;
  const event = (await store.read(paths.record(eventId)))?.doc;
  return { ...verdictOf(event, name.id, Boolean(backing && match(backing.metadata)), now()), event };
}

/**
 * Every stored name, each with whether a numbered slot backs it. Names are listed before slots: a
 * writer claims its slot before it writes its name, so a listed name whose slot is missing from the
 * later slot listing has lost it for good (an id is never given a new slot).
 */
async function storedNames(store, eventId, count) {
  const names = await listNames(store, eventId);
  const byPath = new Map(names.map((n) => [n.path, n]));
  const backed = new Set();
  for (const { path, metadata } of await store.list(paths.slotsPrefix(eventId))) {
    if (!numbered(eventId, path, count) || typeof metadata?.key !== 'string') continue;
    const name = byPath.get(paths.name(eventId, metadata.key));
    if (name && backs(name)(metadata)) backed.add(name.path);
  }
  return names.map((n) => ({ ...n, backed: backed.has(n.path) }));
}

/**
 * Split stored names into the admitted and the garbage, against one record read and one time. Names
 * of an event that is gone are neither: purge and the lifecycle rule take the whole prefix, and a read
 * of a gone event writes nothing.
 */
function sortNames(stored, event, at) {
  const admitted = [];
  const garbage = [];
  for (const n of stored) {
    const verdict = verdictOf(event, n.id, n.backed, at);
    if (verdict.admitted) admitted.push(n);
    else if (verdict.reason !== 'gone') garbage.push(n);
  }
  return { admitted, garbage };
}

/**
 * Delete garbage names, best-effort and at most COLLECT_AT_MOST: each only if a HEAD still shows the
 * same id, with the delete conditional on that ETag, so a name that replaced it is never touched. A
 * verdict of garbage is final (gone, removed and not-in-roster never revert, and an id never gets a
 * slot back), so a later read cannot make it count. Failures are ignored: garbage never counts.
 */
async function collect(store, garbage) {
  for (const n of garbage.slice(0, COLLECT_AT_MOST)) {
    try {
      const held = await store.head(n.path);
      if (held?.metadata.id === n.id) await store.del(n.path, held.etag);
    } catch {
      // Collection is hygiene, never correctness.
    }
  }
}

/**
 * Claim a slot for `owner` (one device token and one name). A slot the owner already holds is shared:
 * its id becomes this send's id, and the share is a touch (see `touchSlot`). Otherwise the free slots
 * are tried with a create-only write, in an order seeded by the owner: sends of one owner walk the same
 * order and meet on one slot, while distinct owners spread over the set. A refused or failed create
 * reads the slot back: this send's own write is used, a send of the same owner is shared, and only
 * another owner's slot moves on. With no free slot left, a stale one is reclaimed (`reclaimSlot`).
 * `created` is true only while the slot is still exactly this send's create, untouched since.
 * @returns {Promise<{ path: string, etag: string, id: string, created: boolean } | null>}
 */
async function claimSlot(store, eventId, { owner, key, id, count, now }) {
  const mine = (metadata) => metadata?.owner === owner;
  const listed = await store.list(paths.slotsPrefix(eventId));
  for (const { path, metadata } of listed) {
    if (!mine(metadata) || !numbered(eventId, path, count)) continue;
    const shared = await touchSlot(store, path, owner, now);
    if (shared) return shared;
  }
  const seeded = (list) => list.map((path) => [sha256(`${owner}/${path}`), path]).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, path]) => path);
  const taken = new Set(listed.map(({ path }) => path));
  const free = [];
  for (let n = 1; n <= count; n++) if (!taken.has(paths.slot(eventId, n))) free.push(paths.slot(eventId, n));
  for (const path of seeded(free)) {
    const got = await create(path);
    if (got) return got;
  }
  const stale = listed.filter(
    ({ path, metadata }) => numbered(eventId, path, count) && !mine(metadata) && Date.parse(metadata?.at ?? '') + RECLAIM_AFTER_MS < now.getTime(),
  );
  for (const path of seeded(stale.map(({ path }) => path))) {
    if (!(await reclaimSlot(store, eventId, path, now))) continue;
    const got = await create(path);
    if (got) return got;
  }
  return null;

  async function create(path) {
    const metadata = { id, owner, key, at: now.toISOString(), w: newId() };
    let etag = null;
    let failure = null;
    try {
      etag = await store.put(path, { metadata });
    } catch (error) {
      failure = error;
    }
    if (etag) return { path, etag, id, created: true };
    const held = failure ? await store.head(path).catch(() => null) : await store.head(path);
    // This send's own create landed and nobody has touched it since.
    if (held?.metadata.w === metadata.w) return { path, etag: held.etag, id, created: true };
    if (mine(held?.metadata)) {
      const shared = await touchSlot(store, path, owner, now);
      if (shared) return shared;
    }
    if (failure) throw failure;
    return null;
  }
}

/**
 * Share a slot the owner holds: rewrite it conditionally on the version read, with a fresh `at` and
 * write mark. The ETag moves, so the request that created it can no longer give it back, and the
 * reclamation clock restarts. Null when the slot is gone or another owner's; a refused touch that
 * landed (an SDK retry) is recognised by its write mark.
 */
async function touchSlot(store, path, owner, now) {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const held = await store.head(path);
    if (held?.metadata.owner !== owner) return null;
    const metadata = { ...held.metadata, at: now.toISOString(), w: newId() };
    let etag = null;
    let failure = null;
    try {
      etag = await store.put(path, { metadata, ifMatch: held.etag });
    } catch (error) {
      failure = error;
    }
    if (etag) return { path, etag, id: metadata.id, created: false };
    const after = failure ? await store.head(path).catch(() => null) : await store.head(path);
    if (after?.metadata.w === metadata.w) return { path, etag: after.etag, id: metadata.id, created: false };
    if (failure) throw failure;
  }
  throw contended();
}

/**
 * Clear a slot nobody can still use: RECLAIM_AFTER_MS past its last claim or touch, so every request
 * that claimed or touched it has ended, and no name holds its id. Conditional on the version read, so
 * a touch in between keeps it. True when the path is now absent, so the caller may create it (still
 * create-only: a replacement made meanwhile refuses that create and stays). A slot already absent is
 * true at once; a delete answered false or with an error is settled by reading the slot back, since
 * the retry of a delete that landed is refused by the blob's absence.
 */
async function reclaimSlot(store, eventId, path, now) {
  const held = await store.head(path);
  if (!held) return true;
  if (!(Date.parse(held.metadata.at ?? '') + RECLAIM_AFTER_MS < now.getTime())) return false;
  const name = await store.head(paths.name(eventId, held.metadata.key));
  if (name && name.metadata.id === held.metadata.id) return false;
  try {
    if (await store.del(path, held.etag)) return true;
  } catch (error) {
    if (!(await store.head(path))) return true;
    throw error;
  }
  return !(await store.head(path));
}

/**
 * Free the slot a join id holds. Only once its name blob is gone: an id is created once, so nothing
 * else can rely on that slot. The delete is conditional on the version just read.
 */
async function freeSlot(store, eventId, id) {
  for (const { path, metadata } of await store.list(paths.slotsPrefix(eventId))) {
    if (metadata?.id !== id) continue;
    const held = await store.head(path);
    if (held && held.metadata.id === id) await store.del(path, held.etag);
  }
}

/**
 * The ETag of a start's own commit, when its write landed and answered 412 (an SDK retry): the record
 * holds this start's `started` stamp and roster. A start that wrote the same stamp and roster wrote
 * the same record, so either counts. Null when the record holds anything else: a lost race, decided
 * again on the next read.
 */
async function ownStart(store, path, next) {
  const now = await store.read(path);
  const same = now?.doc.state === 'started' && now.doc.started === next.started && JSON.stringify(now.doc.roster) === JSON.stringify(next.roster);
  return same ? now.etag : null;
}

/**
 * Put back the record a start wrote after the expiry, and return only once the record no longer
 * holds that start. A refused put-back re-reads: still this start (same `started`), it tries again on
 * the new version; anything else (put back already by a retried write that landed, closed, purged)
 * holds no start to undo. A record that stays started is never answered as gone: the attempts run
 * out into Contended, a 503.
 */
async function putBack(store, path, before, started, etag) {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    if (await store.put(path, { json: before, ifMatch: etag })) return;
    const now = await store.read(path);
    if (!(now && now.doc.state === 'started' && now.doc.started === started)) return;
    etag = now.etag;
  }
  throw contended();
}

const byJoinOrder = (a, b) => a.joined.localeCompare(b.joined) || a.id.localeCompare(b.id);

/** Delete every blob of an event except its record. */
async function sweep(store, eventId) {
  const keep = paths.record(eventId);
  for (const { path } of await store.list(paths.event(eventId))) if (path !== keep) await store.del(path);
}

// No abuse budget on create or on a PIN (owner ruling 2026-11-11, ADR-0076): with no client identity,
// a counter is a lock a stranger can hold shut. The cost bound is a billing alert; admin review is
// the guard on who joins.
const OPS = {
  async create(_input, { store, now }) {
    const created = now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const eventId = newId();
      const adminToken = randomBytes(32).toString('base64url');
      const pin = String(randomInt(0, 10 ** PIN_DIGITS)).padStart(PIN_DIGITS, '0');
      const doc = { v: '2', state: 'open', pin, admin: sha256(adminToken), created: created.toISOString(), removed: [] };
      // A refused create may be this one, landed on an attempt whose answer was lost: the admin hash
      // is this attempt's own (256 random bits), so a record holding it is ours, not a collision.
      const path = paths.record(eventId);
      if ((await store.put(path, { json: doc })) || (await store.read(path))?.doc.admin === doc.admin) {
        // The expiry if the event is never started; a start moves it to LIVE_AFTER_START_MS after the start.
        const expiresAt = new Date(created.getTime() + LIVE_UNSTARTED_MS).toISOString();
        return reply(201, { eventId, pin, adminToken, expiresAt });
      }
    }
    throw Object.assign(new Error('event id collided three times'), { code: 'IdCollision' });
  },

  async join({ eventId, body }, { store, now, limits }) {
    if (typeof body.token !== 'string' || !DEVICE_TOKEN.test(body.token)) return reply(400, { error: 'bad-request' });
    const at = now();
    const event = (await store.read(paths.record(eventId)))?.doc;
    if (!isLive(event, at)) return reply(404, { error: 'gone' });
    // A wrong PIN writes nothing, so neither a guesser nor a phone's retry can leave state behind.
    const pin = normalizePin(body.pin);
    if (pin === '' || !sameSecret(pin, event.pin)) return reply(403, { error: 'pin' });
    const checked = checkName(body.name);
    if (!checked.ok) return reply(422, { error: 'name', reason: checked.reason });
    const key = nameKey(checked.name);
    const path = paths.name(eventId, key);
    const token = sha256(body.token);
    const owner = sha256(`${token}/${key}`);
    // The name blob only indexes the name. Whether one already there counts is `admission`'s call.
    let replace;
    const existing = await holder(path);
    if (existing) {
      const verdict = await admission(store, eventId, existing, limits.names, now);
      const mine = sameSecret(existing.token, token);
      if (verdict.admitted) {
        // Answered before the started check: a join that committed but lost its response must still
        // learn its id after the start, or the phone never can.
        if (mine) return reply(200, { id: existing.id, name: existing.name, eventKey: event.pin });
        return reply(409, { error: verdict.event.state === 'started' ? 'started' : 'taken' });
      }
      // It does not count: garbage. Collect it; if that fails, this join takes the name over with a write
      // conditional on its ETag.
      replace = (await discard(existing)) ? undefined : existing.etag;
      if (verdict.reason === 'gone') return reply(404, { error: 'gone' });
      if (mine && verdict.reason === 'removed') return reply(409, { error: 'removed' });
      if (verdict.reason === 'started') return reply(409, { error: 'started' });
    }
    if (event.state === 'started') return reply(409, { error: 'started' });
    // The name is written only while a slot is held. The slot belongs to this device and this name, so a
    // retry or a second send of the same join shares it and its id.
    const slot = await claimSlot(store, eventId, { owner, key, id: newId(), count: limits.names, now: now() });
    if (!slot) return reply(409, { error: 'full' });
    const record = { id: slot.id, name: checked.name, joined: now().toISOString(), token };
    try {
      let etag = null;
      let wrote = false;
      let stored = record;
      for (let attempt = 0; ; attempt++) {
        etag = await store.put(path, { metadata: encodeNameRecord(record), ifMatch: replace });
        if (etag) {
          wrote = true;
          break;
        }
        const held = await holder(path);
        // This join's name: this send's own write whose answer was lost, or another send of the join.
        if (held && held.id === slot.id) {
          etag = held.etag;
          stored = held;
          break;
        }
        const verdict = held ? await admission(store, eventId, held, limits.names, now) : null;
        if (verdict?.admitted || (held && sameSecret(held.token, token) && verdict.reason === 'removed') || attempt >= 2) {
          // Another join holds the name, or this device's removed one does. A slot still exactly this send's
          // create serves nothing now and goes back; once another send has touched it, it stays.
          if (slot.created) await store.del(slot.path, slot.etag);
          if (!verdict?.admitted) return reply(verdict?.reason === 'removed' ? 409 : 503, { error: verdict?.reason === 'removed' ? 'removed' : 'unavailable' });
          if (sameSecret(held.token, token)) return reply(200, { id: held.id, name: held.name, eventKey: event.pin });
          return reply(409, { error: verdict.event.state === 'started' ? 'started' : 'taken' });
        }
        // Gone since, or garbage: create it, or take the garbage over on its ETag.
        replace = held?.etag;
      }
      // The final checks, after the last write: the slot first (it must still back this name), the
      // record last. Any failure undoes the name.
      const backing = await store.head(slot.path);
      const backed = Boolean(backing && backs({ ...stored, id: slot.id, token })(backing.metadata));
      const after = (await store.read(paths.record(eventId)))?.doc;
      const verdict = verdictOf(after, slot.id, backed, now());
      if (verdict.admitted) return reply(wrote ? 201 : 200, { id: slot.id, name: stored.name, eventKey: event.pin });
      await store.del(path, etag);
      // No name may rely on a fenced or closed slot. A slot no longer this id's is someone else's.
      if (backed) await store.del(slot.path, backing.etag);
      if (verdict.reason === 'gone') return reply(404, { error: 'gone' });
      if (verdict.reason === 'started') return reply(409, { error: 'started' });
      if (verdict.reason === 'removed') return reply(409, { error: 'removed' });
      // The slot was taken from under a stalled send: it fails cleanly, and the phone retries.
      return reply(503, { error: 'unavailable' });
    } catch (error) {
      // A send that fails gives back a slot that is still exactly its own create, unless its name was
      // written. Once another send has touched it, the delete is refused and that send owns the outcome.
      // If this cleanup fails too, the slot is reclaimed after RECLAIM_AFTER_MS.
      if (slot.created) {
        try {
          const held = await holder(path);
          if (!(held && held.id === slot.id)) await store.del(slot.path, slot.etag);
        } catch {
          // The original failure is the one to report.
        }
      }
      throw error;
    }

    /** Delete a name blob that does not count, on its ETag. True when it is gone. */
    async function discard(found) {
      try {
        return await store.del(path, found.etag);
      } catch {
        return false;
      }
    }
    async function holder(blob) {
      const found = await store.head(blob);
      return found && { ...decodeNameRecord(found.metadata ?? {}), etag: found.etag };
    }
  },

  async status({ eventId, id }, { store, now }) {
    const event = (await store.read(paths.record(eventId)))?.doc;
    if (!isLive(event, now())) return reply(200, { state: 'gone' });
    if (event.state === 'open') return reply(200, { state: 'open' });
    return reply(200, { state: 'started', member: event.roster.some((m) => m.id === id) });
  },

  async names(input, deps) {
    const { store, now, limits } = deps;
    const { reply: refused } = await adminEvent(input, deps);
    if (refused) return refused;
    // Only admitted names are listed: names, then slots, then the record, read last.
    const stored = await storedNames(store, input.eventId, limits.names);
    const event = (await store.read(paths.record(input.eventId)))?.doc;
    if (!isLive(event, now())) return reply(404, { error: 'gone' });
    const { admitted, garbage } = sortNames(stored, event, now());
    await collect(store, garbage);
    const names = admitted.map(({ id, name, joined }) => ({ id, name, joined })).sort(byJoinOrder);
    return reply(200, { state: event.state, names });
  },

  async remove(input, deps) {
    const { store } = deps;
    let fencedBefore = null;
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const { reply: refused, event, etag } = await adminEvent(input, deps);
      if (refused) return refused;
      // An id already in `removed` is removed: a start subtracts it, and `removed` only grows. That is
      // this removal's own write when it landed and answered 412 (an SDK retry), so it is finished, not
      // refused, even if a start has frozen the roster since.
      const recorded = event.removed?.includes(input.id) ?? false;
      fencedBefore ??= recorded;
      if (event.state !== 'open' && !recorded) return reply(409, { error: 'started' });
      const listed = await listNames(store, input.eventId);
      const target = listed.find((r) => r.id === input.id);
      if (!target) {
        // Its name is gone for good. A removal that failed before freeing the slot is retried here. The
        // fence appearing during this request is this removal's own write (or a twin's): removed. A
        // fence there before it began is a repeat: nothing was removed now.
        await freeSlot(store, input.eventId, input.id);
        return reply(200, { removed: recorded && !fencedBefore });
      }
      // The fence is kept for the life of the event: a listing shows stored names, not the ids a stalled
      // send still holds, so no entry is ever dropped.
      const removed = [...event.removed, target.id];
      if (!recorded && !(await store.put(paths.record(input.eventId), { json: { ...event, removed }, ifMatch: etag }))) continue;
      // The removal is now in the record, and a start subtracts it whether or not the blob below is
      // deleted yet. Free the name only if its blob still holds this id: the same name may have been
      // removed and joined again by someone else since the listing.
      const held = await store.head(target.path);
      if (held && decodeNameRecord(held.metadata ?? {}).id === target.id) await store.del(target.path, held.etag);
      // The name blob of this id is gone now (deleted here, or replaced by a later joiner), so its slot is free.
      await freeSlot(store, input.eventId, target.id);
      return reply(200, { removed: true });
    }
    throw contended();
  },

  async start(input, deps) {
    const { store } = deps;
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const { reply: refused, event, etag } = await adminEvent(input, deps);
      if (refused) return refused;
      const ids = input.body.ids;
      if (!Array.isArray(ids) || ids.length > MAX_NAMES || !ids.every((id) => typeof id === 'string' && ID.test(id))) {
        return reply(400, { error: 'bad-request' });
      }
      if (event.state === 'started') return reply(200, { roster: event.roster });
      // The roster is exactly the reviewed ids that are admitted against the record just read: a name
      // that joined after the last look is out, and so is one removed or unbacked. The slots are listed
      // after that read, and the commit below is conditional on its ETag, so a removal in between makes
      // this start read again.
      const reviewed = new Set(ids);
      const { admitted, garbage } = sortNames(await storedNames(store, input.eventId, deps.limits.names), event, deps.now());
      await collect(store, garbage);
      const members = admitted
        .filter((r) => reviewed.has(r.id))
        .sort(byJoinOrder)
        .map(({ id, name }) => ({ id, name }));
      // A frozen roster cannot be undone, so an empty one is refused rather than written.
      // Liveness is decided again at the commit, on the record version this write is conditional on, and
      // the start is stamped with that same time: a start that began before the never-started expiry
      // cannot revive the event after it, and no event is ever started later than LIVE_UNSTARTED_MS
      // after its creation.
      const at = deps.now();
      if (!isLive(event, at)) return reply(404, { error: 'gone' });
      if (members.length === 0) return reply(409, { error: 'empty' });
      const next = { ...event, state: 'started', started: at.toISOString(), roster: members };
      const committed =
        (await store.put(paths.record(input.eventId), { json: next, ifMatch: etag })) ?? (await ownStart(store, paths.record(input.eventId), next));
      if (!committed) continue;
      // The write may land after the expiry it was checked against. Checked again once it has landed:
      // a start that cannot show it committed while the event was live puts the record back as it
      // was read and answers gone, so a start never revives an expired event.
      if (!isLive(event, deps.now())) {
        await putBack(store, paths.record(input.eventId), event, next.started, committed);
        return reply(404, { error: 'gone' });
      }
      return reply(200, { roster: members });
    }
    throw contended();
  },

  async purge(input, deps) {
    const { store } = deps;
    const recordPath = paths.record(input.eventId);
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const read = await store.read(recordPath);
      // No record: purged already (or never created). There is no token left to check and nothing
      // left to protect, so a retry is answered 200 and only sweeps what a straggler left behind.
      if (!read) {
        await sweep(store, input.eventId);
        return reply(200, { purged: true });
      }
      if (!input.admin || !sameSecret(sha256(input.admin), read.doc.admin)) return reply(401, { error: 'admin' });
      let etag = read.etag;
      if (read.doc.state !== 'closed') {
        // Closing first stops admission: a join that writes after this undoes itself on its re-read.
        const closed = { v: read.doc.v, state: 'closed', admin: read.doc.admin, created: read.doc.created };
        etag = await store.put(recordPath, { json: closed, ifMatch: read.etag });
        if (!etag) continue;
      }
      await sweep(store, input.eventId);
      await store.del(recordPath, etag);
      await sweep(store, input.eventId);
      return reply(200, { purged: true });
    }
    throw contended();
  },
};
