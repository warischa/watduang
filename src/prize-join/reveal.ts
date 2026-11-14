// gh#309: the pure half of the phone's result flow in QR mode (the DOM half is join-page.ts). DOM-free, so
// node --test runs it as is.
//
// What it owns:
//   - the reveal record kept in localStorage per event: the event key (the PIN the join was accepted under),
//     what the status route said about this join id, and every round code typed so far, with the drawn rule
//     of a card round as the person tapped it;
//   - which screen the phone shows for that record, computed from the round-code protocol alone
//     (src/prize-draw/round-code.ts, cards.ts). Nothing here reaches the network: the one status call is
//     the page's, made before any reveal, and a typed code never triggers one (gh#299 decision 5);
//   - the mapping from every answer of GET /api/draw/events/<eventId>/status/<id> to one status outcome.
//
// Membership (gh#300 membership contract): 'confirmed' or 'removed' only once the status route answered
// `started`; until then 'unconfirmed', so every result is provisional and the page says the main screen decides.

import { ELIMINATION_ROUNDS } from '../prize-draw/schedule.ts';
import { FINAL_ROUND, parseCode, phoneFinalSlot, phoneVerdicts, type Membership, type PhoneEntry } from '../prize-draw/round-code.ts';
import { pairFor, phoneCard, type Card, type RuleId } from '../prize-draw/cards.ts';
import { PIN } from '../prize-event/qr-event.ts';
import { ID } from './join.ts';

export type RevealRecord = {
  /** The PIN the join was accepted under: the event key of every fate (ADR-0076 Identity). */
  eventKey: string;
  /** What the status route answered once the event started; null until it has. */
  member: 'confirmed' | 'removed' | null;
  /** True once the phone has left the device screen for the result flow (an answer, or no answer at all). */
  started: boolean;
  /** One entry per elimination round typed so far, round 1 first. */
  entries: PhoneEntry[];
  /** The final's code once typed. */
  final: string | null;
  /** Set at the first code interaction (a character typed into the code field, or any submit, accepted or
   *  not): from then on the status route is never asked again (gh#299 decision 5). */
  typed?: true;
};

export const revealKey = (eventId: string): string => `watduang:prize-draw:reveal:${eventId}`;

/** A fresh record for a join accepted under `pin`, or null when the PIN is not the server's shape. */
export function freshReveal(pin: string): RevealRecord | null {
  return PIN.test(pin) ? { eventKey: pin, member: null, started: false, entries: [], final: null } : null;
}

/** The record kept for one event, or null when none is stored or it does not parse into one. */
export function parseReveal(text: string | null): RevealRecord | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.eventKey !== 'string' || !PIN.test(o.eventKey)) return null;
  if (o.member !== null && o.member !== 'confirmed' && o.member !== 'removed') return null;
  if (typeof o.started !== 'boolean') return null;
  if (!Array.isArray(o.entries) || o.entries.length > ELIMINATION_ROUNDS) return null;
  const entries: PhoneEntry[] = [];
  for (const e of o.entries as unknown[]) {
    if (!e || typeof e !== 'object') return null;
    const { code, rule } = e as Record<string, unknown>;
    if (typeof code !== 'string') return null;
    if (rule !== undefined && rule !== 0 && rule !== 1) return null;
    entries.push(rule === undefined ? { code } : { code, rule });
  }
  if (o.final !== null && typeof o.final !== 'string') return null;
  if (o.typed !== undefined && o.typed !== true) return null;
  const rec: RevealRecord = { eventKey: o.eventKey, member: o.member, started: o.started, entries, final: o.final };
  if (o.typed === true) rec.typed = true;
  return rec;
}

// ---- status

export type StatusOutcome = { kind: 'open' } | { kind: 'member'; member: boolean } | { kind: 'gone' } | { kind: 'none' };

/** One answer of the status route. `status` null means no answer at all (network failure or timeout). */
export function classifyStatus(status: number | null, body: unknown): StatusOutcome {
  if (status !== 200 || !body || typeof body !== 'object') return { kind: 'none' };
  const b = body as Record<string, unknown>;
  if (b.state === 'open') return { kind: 'open' };
  if (b.state === 'gone') return { kind: 'gone' };
  if (b.state === 'started' && typeof b.member === 'boolean') return { kind: 'member', member: b.member };
  return { kind: 'none' };
}

/** The status route of one join. Both ids were checked against ID, so neither can leave the path. */
export function statusUrl(eventId: string, id: string): string {
  if (!ID.test(eventId) || !ID.test(id)) throw new RangeError('status ids must be server ids');
  return `/api/draw/events/${eventId}/status/${id}`;
}

/** The record after a status answer. Only `started` fixes membership; every answer but `open` starts the flow. */
export function applyStatus(rec: RevealRecord, out: StatusOutcome): RevealRecord {
  if (out.kind === 'member') return { ...rec, member: out.member ? 'confirmed' : 'removed', started: true };
  if (out.kind === 'open') return rec;
  return { ...rec, started: true };
}

// ---- screens

export type RevealScreen =
  /** Type the code of `round` (FINAL_ROUND for the final). */
  | { kind: 'code'; round: number }
  /** In after `round`; the form under it takes the code of `next`. */
  | { kind: 'pass'; round: number; next: number }
  | { kind: 'out'; round: number }
  /** A card round dealt, its rule not tapped yet. */
  | { kind: 'card'; round: number; card: Card; pair: readonly [RuleId, RuleId] }
  /** A finalist's place in the final's order: index 0 is the first prize, and every claim's place holds one. */
  | { kind: 'claim'; slot: number }
  | { kind: 'removed' };
export type RevealView = { screen: RevealScreen; provisional: boolean };

const membership = (rec: RevealRecord): Membership => rec.member ?? 'unconfirmed';

/** The screen for a record and this phone's join id. Every fact on it comes from the codes typed. */
export function revealView(rec: RevealRecord, identity: string): RevealView {
  const member = membership(rec);
  const { verdicts, provisional } = phoneVerdicts(rec.eventKey, identity, rec.entries, member);
  if (member === 'removed') return { screen: { kind: 'removed' }, provisional };
  const out = verdicts.indexOf('out');
  if (out !== -1) return { screen: { kind: 'out', round: out + 1 }, provisional };
  const n = verdicts.length;
  const last = verdicts[n - 1];
  if (last === 'awaiting-rule') {
    const code = rec.entries[n - 1]!.code;
    const parsed = parseCode(code, n);
    const card = phoneCard(rec.eventKey, identity, n, code);
    if (parsed && card) return { screen: { kind: 'card', round: n, card, pair: pairFor(rec.eventKey, n, parsed.seed) }, provisional };
  }
  // A stored entry that no longer reads (edited storage): its round is typed again.
  const stop = verdicts.findIndex((v) => v !== 'in');
  if (stop !== -1) return { screen: { kind: 'code', round: stop + 1 }, provisional };
  if (n === 0) return { screen: { kind: 'code', round: 1 }, provisional };
  if (n === ELIMINATION_ROUNDS && rec.final !== null) {
    const fin = phoneFinalSlot(rec.eventKey, identity, rec.entries, rec.final, member);
    if (fin.verdict === 'in' && fin.slot !== null && fin.prizes !== null) {
      // The code carries the prize count (ADR-0079): a place at or past it holds no prize, so it reads out.
      const screen: RevealScreen = fin.slot < fin.prizes ? { kind: 'claim', slot: fin.slot } : { kind: 'out', round: FINAL_ROUND };
      return { screen, provisional };
    }
  }
  return { screen: { kind: 'pass', round: n, next: n + 1 }, provisional };
}

/** The round the screen's form takes, or null when it has none. */
export function formRound(screen: RevealScreen): number | null {
  return screen.kind === 'code' ? screen.round : screen.kind === 'pass' ? screen.next : null;
}

/**
 * A code typed into the form of `rec`'s screen. Refused (null) when the screen has no form or the code is
 * not one of that round's: malformed, mistyped, or another round's (the check digit catches all three).
 */
export function enterCode(rec: RevealRecord, identity: string, raw: string): RevealRecord | null {
  const round = formRound(revealView(rec, identity).screen);
  if (round === null) return null;
  const parsed = parseCode(raw, round);
  if (!parsed) return null;
  if (round === FINAL_ROUND) return parsed.kind === 'final' ? { ...rec, final: raw.trim() } : null;
  if (parsed.kind === 'final') return null;
  // A stored entry for this round that did not read is replaced, never appended after.
  return { ...rec, entries: [...rec.entries.slice(0, round - 1), { code: raw.trim() }], final: null };
}

/** The drawn rule of the card round on screen, as tapped: 0 is the pair's first rule, 1 its second. */
export function chooseRule(rec: RevealRecord, identity: string, rule: 0 | 1): RevealRecord | null {
  const { screen } = revealView(rec, identity);
  if (screen.kind !== 'card') return null;
  const entries = rec.entries.slice();
  entries[screen.round - 1] = { code: entries[screen.round - 1]!.code, rule };
  return { ...rec, entries };
}
