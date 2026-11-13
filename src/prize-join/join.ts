// gh#308: the pure half of the phone join page (the page is src/pages/game/prize-draw/join.astro, its DOM
// half join-page.ts). DOM-free, so node --test runs it as is.
//
// What it owns:
//   - the join link: the QR on the main screen opens this page with `#event=<eventId>&pin=<pin>`. The
//     fragment, never the query: a fragment is not sent to the server, so the PIN stays out of server
//     logs, the Referer header and any ad request (orchestrator decision, gh#308). The protocol doc
//     docs/design/prize-draw-qr-join-protocol.md records the format for the QR that builds it;
//   - the device record kept in localStorage per event: a random device token, the name of a send whose
//     answer never came (`pending`), and, once joined, the join id and the name the server stored;
//   - the mapping from every answer of POST /api/draw/events/<eventId>/join to one outcome the page shows.
//
// Name rules: the page validates with names.ts checkName, the event rule, which name-parity.test.mjs
// holds to the server rule case by case. One rule file for every name a prize-draw screen takes.
//
// One name per device is held here, on the client (owner ruling): the server counts a device token and a
// name as one join, so the same token with a second name would be a second join. The page never sends a
// second name while a first may have landed: a send whose answer was lost stays `pending`, and the next
// submit settles it first (join-page.ts).

import { checkName, nameKey, type NameIssue } from '../prize-event/names.ts';

/** The page's validator: exactly the event's rule (see the header). */
export const validateJoinName = checkName;
/** The uniqueness key, unhashed (the server hashes the same text). */
export const joinNameKey = nameKey;

/** A server id: 128 bits, base64url, 22 characters (event ids and join ids alike). */
export const ID = /^[A-Za-z0-9_-]{22}$/;
/** The server's device-token shape. */
export const DEVICE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
/** Characters in a token this page makes: 32 x 6 bits. */
export const TOKEN_CHARS = 32;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export type JoinLink = { eventId: string | null; pin: string };

/** The event id and PIN from the page's URL fragment. An id of any other shape is no event at all. */
export function readJoinLink(fragment: string): JoinLink {
  const q = new URLSearchParams(fragment.replace(/^#/, ''));
  const id = q.get('event') ?? '';
  return { eventId: ID.test(id) ? id : null, pin: (q.get('pin') ?? '').trim() };
}

/** A fresh device token. 64 divides 256, so masking a random byte to 6 bits is unbiased. */
export function newDeviceToken(getRandomValues: (a: Uint8Array) => Uint8Array): string {
  const bytes = getRandomValues(new Uint8Array(TOKEN_CHARS));
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 63];
  return out;
}

export type DeviceRecord = {
  token: string;
  /** A name sent whose answer never came: it may have joined. */
  pending?: string;
  /** Set once the server answered 200 or 201: this device has joined, under `name`. */
  id?: string;
  name?: string;
};

export const storageKey = (eventId: string): string => `watduang:prize-draw:join:${eventId}`;

/** The tab-scoped key that keeps the link once it is stripped from the URL, so a reload finds the event. */
export const LINK_KEY = 'watduang:prize-draw:join-link';

/** A link kept under LINK_KEY, or no event when none is kept or it does not parse into one. */
export function parseLink(text: string | null): JoinLink {
  try {
    const v = JSON.parse(text ?? 'null') as Record<string, unknown> | null;
    if (v && typeof v.eventId === 'string' && ID.test(v.eventId) && typeof v.pin === 'string') return { eventId: v.eventId, pin: v.pin };
  } catch {
    // Unreadable: no event.
  }
  return { eventId: null, pin: '' };
}

/** The record kept for one event, or null when none is stored or it does not parse into one. */
export function parseRecord(text: string | null): DeviceRecord | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.token !== 'string' || !DEVICE_TOKEN.test(o.token)) return null;
  const rec: DeviceRecord = { token: o.token };
  if (typeof o.pending === 'string') rec.pending = o.pending;
  if (typeof o.id === 'string' && ID.test(o.id) && typeof o.name === 'string') {
    rec.id = o.id;
    rec.name = o.name;
  }
  return rec;
}

export type Outcome =
  | { kind: 'joined'; id: string; name: string }
  | { kind: 'taken' }
  | { kind: 'full' }
  | { kind: 'removed' }
  | { kind: 'started' }
  | { kind: 'gone' }
  | { kind: 'pin' }
  | { kind: 'name'; reason: NameIssue }
  | { kind: 'unavailable' }
  | { kind: 'bad' };

const NAME_ISSUES: readonly NameIssue[] = ['empty', 'lone-surrogate', 'control', 'emoji', 'charset', 'too-long', 'leading-mark', 'stacked-marks'];

/**
 * One answer of the join route, as the outcome the page shows. `status` null means no answer at all (the
 * network failed or timed out). `unavailable` is the one outcome that leaves a send unsettled: the name
 * may or may not have joined, and a resend of the same name and token answers which.
 */
export function classify(status: number | null, body: unknown): Outcome {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (status === null || status >= 500) return { kind: 'unavailable' };
  if (status === 200 || status === 201) {
    // A success without a usable id or name is not one the page can keep; a resend gets it again.
    if (typeof b.id === 'string' && ID.test(b.id) && typeof b.name === 'string' && b.name !== '') return { kind: 'joined', id: b.id, name: b.name };
    return { kind: 'unavailable' };
  }
  if (status === 409) {
    if (b.error === 'taken' || b.error === 'full' || b.error === 'removed' || b.error === 'started') return { kind: b.error };
    return { kind: 'bad' };
  }
  if (status === 404 && b.error === 'gone') return { kind: 'gone' };
  if (status === 403 && b.error === 'pin') return { kind: 'pin' };
  if (status === 422 && b.error === 'name' && NAME_ISSUES.includes(b.reason as NameIssue)) return { kind: 'name', reason: b.reason as NameIssue };
  return { kind: 'bad' };
}

/** The join route of one event. The id was checked against ID, so it cannot leave the path. */
export const joinUrl = (eventId: string): string => `/api/draw/events/${eventId}/join`;
