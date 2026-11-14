// gh#308: the admin side of a QR-mode prize draw, DOM-free (node --test runs it as is). The setup page
// (setup-page.ts) drives it; the projector (src/play/prize-draw/stage.ts) reads only the lobby half.
//
// Lives here, not in src/prize-join/: that directory is the phone's page. This module is the organiser's
// half of the same event (the setup page and the projector), and it shares the event's name rule
// (names.ts) with createEvent, which is what a frozen roster must pass to become the local event.
//
// What it owns:
//   - the client for the admin routes of the join server (docs/design/prize-draw-qr-join-protocol.md,
//     section Contract): create, names, remove, start, purge, each answer mapped to exactly one state.
//     The admin token travels only in the X-Draw-Admin header; no URL this module builds holds it or the
//     PIN, and an id of any shape but the server's is never sent;
//   - the admin session, kept in the setup page's own localStorage (ADMIN_KEY): event id, PIN, admin
//     token, expiry, the ids this page removed, and the store generation it was opened over. It survives
//     a reload or a crash of the setup tab, because a lost token is an event nobody can start;
//   - the lobby record (LOBBY_KEY) the projector reads to show the join QR before the start: event id,
//     PIN, event name, joined count, expiry. Never the token;
//   - the join link the QR encodes: the event id and PIN in the fragment (protocol doc, The QR link).
//
// Names from the server are attacker-owned (ADR-0026). A listed name that breaks the event's name rule,
// or repeats a key already listed, is out of contract and dropped here: the review list never shows it,
// so its id is never sent to start. A start roster out of contract is refused whole, never repaired. The
// one DOM sink for what survives is writeName (setup page). No IP, no device data: the only personal
// datum here is the nickname.

import { ID } from '../prize-join/join.ts';
import { isCleanName, nameKey } from './names.ts';

/** The join server's admin routes, through the site's own /api (ADR-0074, ADR-0076). */
export const DRAW_API = '/api/draw/events';
/** The header the admin token travels in (protocol doc: not Authorization, which the SWA proxy may replace). */
export const ADMIN_HEADER = 'X-Draw-Admin';
/** A send with no answer by then is aborted and reads as unavailable. The join page waits as long. */
export const REQUEST_TIMEOUT_MS = 15000;
/** The review list's poll interval while the setup page is visible. */
export const POLL_MS = 4000;
/** The server's PIN: 6 digits. */
export const PIN = /^[0-9]{6}$/;
/** The server's admin token: 32 random bytes, base64url. */
export const ADMIN_TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** The phone join page (src/pages/game/prize-draw/join.astro). */
export const JOIN_PATH = '/game/prize-draw/join/';
/** The setup page's own record of its QR event, admin token included. */
export const ADMIN_KEY = 'watduang:prize-draw:qr-admin';
/** What the projector reads to show the join QR: never the admin token. */
export const LOBBY_KEY = 'watduang:prize-draw:qr-lobby';

export type Member = { id: string; name: string };
export type Failure = { kind: 'gone' } | { kind: 'admin' } | { kind: 'unavailable' } | { kind: 'bad' };
export type CreatedEvent = { eventId: string; pin: string; adminToken: string; expiresAt: string };
export type CreateAnswer = { kind: 'created'; event: CreatedEvent } | { kind: 'unavailable' } | { kind: 'bad' };
export type NamesAnswer = { kind: 'names'; state: 'open' | 'started'; names: Member[] } | Failure;
export type RemoveAnswer = { kind: 'removed' } | { kind: 'started' } | Failure;
export type StartAnswer = { kind: 'roster'; roster: Member[] } | { kind: 'empty' } | Failure;
export type PurgeAnswer = { kind: 'purged' } | Failure;

export type AdminSession = CreatedEvent & {
  /** Ids this page removed: a start roster holding one is refused (frozenNames). */
  removed: string[];
  /** The generation it was opened over: the key of the event the store held then, null for none. A store
   *  holding any other key means an event was stored since, so this session may write nothing more. */
  gen: string | null;
};

const obj = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});
const isTime = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

/** The answers every admin route shares: no answer or a server failure, a wrong token, an expired event. */
function failure(status: number | null, body: unknown): Failure | null {
  const b = obj(body);
  if (status === null || status >= 500) return { kind: 'unavailable' };
  if (status === 401 && b.error === 'admin') return { kind: 'admin' };
  if (status === 404 && b.error === 'gone') return { kind: 'gone' };
  return null;
}

export function classifyCreate(status: number | null, body: unknown): CreateAnswer {
  if (status === null || status >= 500) return { kind: 'unavailable' };
  const b = obj(body);
  if (
    status === 201 &&
    typeof b.eventId === 'string' &&
    ID.test(b.eventId) &&
    typeof b.pin === 'string' &&
    PIN.test(b.pin) &&
    typeof b.adminToken === 'string' &&
    ADMIN_TOKEN.test(b.adminToken) &&
    isTime(b.expiresAt)
  ) {
    return { kind: 'created', event: { eventId: b.eventId, pin: b.pin, adminToken: b.adminToken, expiresAt: b.expiresAt } };
  }
  return { kind: 'bad' };
}

/** Listed names in contract, first of each key: the server's id shape and the event's name rule. */
function members(list: unknown[]): Member[] {
  const out: Member[] = [];
  const keys = new Set<string>();
  for (const item of list) {
    const m = obj(item);
    if (typeof m.id !== 'string' || !ID.test(m.id) || !isCleanName(m.name)) continue;
    const key = nameKey(m.name);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push({ id: m.id, name: m.name });
  }
  return out;
}

export function classifyNames(status: number | null, body: unknown): NamesAnswer {
  const failed = failure(status, body);
  if (failed) return failed;
  const b = obj(body);
  if (status === 200 && (b.state === 'open' || b.state === 'started') && Array.isArray(b.names)) {
    return { kind: 'names', state: b.state, names: members(b.names) };
  }
  return { kind: 'bad' };
}

export function classifyRemove(status: number | null, body: unknown): RemoveAnswer {
  const failed = failure(status, body);
  if (failed) return failed;
  const b = obj(body);
  // removed: false is a repeat of a removal that already landed: the name is gone either way.
  if (status === 200 && typeof b.removed === 'boolean') return { kind: 'removed' };
  if (status === 409 && b.error === 'started') return { kind: 'started' };
  return { kind: 'bad' };
}

export function classifyStart(status: number | null, body: unknown): StartAnswer {
  const failed = failure(status, body);
  if (failed) return failed;
  const b = obj(body);
  if (status === 409 && b.error === 'empty') return { kind: 'empty' };
  if (status === 200 && Array.isArray(b.roster) && b.roster.length > 0) {
    // Frozen on the server: taken whole or not at all. Every member must pass what members() keeps, and
    // keep every one: a member dropped here would leave the room a roster the server does not hold.
    const kept = members(b.roster);
    const ids = new Set(kept.map((m) => m.id));
    if (kept.length === b.roster.length && ids.size === kept.length) return { kind: 'roster', roster: kept };
  }
  return { kind: 'bad' };
}

export function classifyPurge(status: number | null, body: unknown): PurgeAnswer {
  const failed = failure(status, body);
  if (failed) return failed;
  if (status === 200 && obj(body).purged === true) return { kind: 'purged' };
  return { kind: 'bad' };
}

/** The names of a frozen roster, in its order: the local event's people. Null when it holds an id this page
 *  removed, which the server's start never does; such a roster is not one this page reviewed. */
export function frozenNames(roster: readonly Member[], removed: readonly string[]): string[] | null {
  const gone = new Set(removed);
  if (roster.some((m) => gone.has(m.id))) return null;
  return roster.map((m) => m.name);
}

/** What the client needs from the browser. `fetch` answers like window.fetch, as far as used here. */
export type ApiEnv = {
  fetch: (url: string, init: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type QrApi = {
  create(): Promise<CreateAnswer>;
  names(s: AdminSession): Promise<NamesAnswer>;
  remove(s: AdminSession, id: string): Promise<RemoveAnswer>;
  start(s: AdminSession, ids: readonly string[]): Promise<StartAnswer>;
  purge(s: AdminSession): Promise<PurgeAnswer>;
};

export function qrApi(env: ApiEnv): QrApi {
  /** One send: the answer's status and body, or status null for no answer (network, timeout, abort). */
  const call = async (method: 'GET' | 'POST', url: string, token: string | null, body?: unknown): Promise<{ status: number | null; body: unknown }> => {
    const ctl = new AbortController();
    const timer = env.setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (token !== null) headers[ADMIN_HEADER] = token;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await env.fetch(url, {
        method,
        headers,
        cache: 'no-store',
        signal: ctl.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = null;
      }
      return { status: res.status, body: parsed };
    } catch {
      return { status: null, body: null };
    } finally {
      env.clearTimeout(timer);
    }
  };
  /** An event route, or null when an id is not of the server's shape (it is then never sent). */
  const route = (s: AdminSession, ...rest: string[]): string | null =>
    ID.test(s.eventId) && ADMIN_TOKEN.test(s.adminToken) ? [DRAW_API, s.eventId, ...rest].join('/') : null;
  return {
    async create() {
      const r = await call('POST', DRAW_API, null);
      return classifyCreate(r.status, r.body);
    },
    async names(s) {
      const url = route(s, 'names');
      if (!url) return { kind: 'bad' };
      const r = await call('GET', url, s.adminToken);
      return classifyNames(r.status, r.body);
    },
    async remove(s, id) {
      const url = ID.test(id) ? route(s, 'names', id, 'remove') : null;
      if (!url) return { kind: 'bad' };
      const r = await call('POST', url, s.adminToken);
      return classifyRemove(r.status, r.body);
    },
    async start(s, ids) {
      const url = ids.every((id) => ID.test(id)) ? route(s, 'start') : null;
      if (!url) return { kind: 'bad' };
      const r = await call('POST', url, s.adminToken, { ids: [...ids] });
      return classifyStart(r.status, r.body);
    },
    async purge(s) {
      const url = route(s, 'purge');
      if (!url) return { kind: 'bad' };
      const r = await call('POST', url, s.adminToken);
      return classifyPurge(r.status, r.body);
    },
  };
}

export const encodeSession = (s: AdminSession): string =>
  JSON.stringify({ eventId: s.eventId, pin: s.pin, adminToken: s.adminToken, expiresAt: s.expiresAt, removed: s.removed, gen: s.gen });

/** The longest generation a session may carry: an event key is far shorter. */
const MAX_GEN = 64;

/** The stored session, or null when none is stored, it does not parse, it names no generation, or its event
 *  has expired by `now`. */
export function parseSession(text: string | null, now: number): AdminSession | null {
  let v: Record<string, unknown>;
  try {
    v = obj(JSON.parse(text ?? 'null'));
  } catch {
    return null;
  }
  const created = classifyCreate(201, v);
  if (created.kind !== 'created' || Date.parse(created.event.expiresAt) <= now) return null;
  const gen = v.gen;
  if (gen !== null && (typeof gen !== 'string' || gen.length > MAX_GEN)) return null;
  const removed = Array.isArray(v.removed) ? v.removed.filter((id): id is string => typeof id === 'string' && ID.test(id)) : [];
  return { ...created.event, removed, gen };
}

export type Lobby = { eventId: string; pin: string; eventName: string; joined: number; expiresAt: string };

/** The lobby record for `s`: built field by field, so the admin token cannot ride along. */
export const encodeLobby = (s: CreatedEvent, eventName: string, joined: number): string =>
  JSON.stringify({ eventId: s.eventId, pin: s.pin, eventName, joined, expiresAt: s.expiresAt });

/** The lobby to show, or null when none is stored, it does not parse, or its event has expired by `now`. */
export function parseLobby(text: string | null, now: number): Lobby | null {
  let v: Record<string, unknown>;
  try {
    v = obj(JSON.parse(text ?? 'null'));
  } catch {
    return null;
  }
  if (typeof v.eventId !== 'string' || !ID.test(v.eventId) || typeof v.pin !== 'string' || !PIN.test(v.pin)) return null;
  if (!isTime(v.expiresAt) || Date.parse(v.expiresAt) <= now) return null;
  const joined = typeof v.joined === 'number' && Number.isInteger(v.joined) && v.joined >= 0 ? v.joined : 0;
  const eventName = typeof v.eventName === 'string' ? v.eventName : '';
  return { eventId: v.eventId, pin: v.pin, eventName, joined, expiresAt: v.expiresAt };
}

/** The link the main-screen QR encodes: id and PIN in the fragment, never the query (protocol doc). */
export const joinLink = (origin: string, eventId: string, pin: string): string => `${origin}${JOIN_PATH}#event=${eventId}&pin=${pin}`;
