// Pure round-code logic for the prize draw in QR mode: never touches DOM, storage or the network.
//
// The protocol. At join the server hands each phone two strings: the event key (the PIN the QR carries) and the
// phone's join identity (an opaque id the server issues). From then on, no server call happens at reveal time.
// At each reveal the main screen shows a short all-digit code; the phone types it in and works out its own fate
// from (event key, identity, the codes so far). The host computes the same fates from the reviewed roster.
//
// Why the cut travels in the code. Every identity gets a fate value v = H(event, round, seed, identity) on a
// fixed scale. The host draws a seed, ranks the live roster by v, and ships the seed plus the cut: the value of
// the first identity that is NOT kept. A phone survives when its v is below the cut. So the code alone fixes
// the exact kept count, and the phone needs no head count, keep count or roster. The runner-up design kept the
// cut implicit (threshold = keep / alive) and re-drew seeds until the count landed: it needs the phone to learn
// both counts, and only about one seed in eighteen lands at 200 -> 100, so the same digits buy fewer outcomes.
//
// Why each round gets a fresh seed. One seed for the whole event with shrinking cuts would make the final
// ranking knowable from the first code. A fresh seed per round keeps each round's odds independent, at the
// cost that the phone must fold its own result over every code so far: once out, it stays out.
//
// Code layout, digits only (a Thai keyboard has no handy Latin letters; a numeric pad is universal):
//   cut round : seed (5) + cut (3) + check (1)                = 9 digits
//   deal round: seed (5) + low cut (3) + high cut (3) + check (1) = 12 digits (the dealt-card game, cards.ts)
//   final     : seed (5) + check (1)                          = 6 digits (round FINAL_ROUND, hostFinalCode)
// The seed is 5 digits by owner ruling (2026-11-11).
//
// Fairness. Ex ante the odds are EXACTLY equal, by exchangeability: identities are random strings from a
// CSPRNG (server-issued in QR mode), and the survivor set ignores roster order, so no identity is favoured
// before the ids exist. Once one event's key and ids are fixed, each identity's chance over all seeds is a
// fixed number that drifts from keep / alive: a disclosed spread with SD sqrt(p (1 - p) / valid seeds), not a
// bound. With random ids, 5 SD is crossed in about 1 event in 5,000; a hand-picked roster has reached 0.0106.
// The gh300 evidence script gates the spread with a seeded sweep of random rosters.
//
// The check digit is a Damm digit over the round number followed by the code, so a single-digit typo, an
// adjacent swap, or a code typed into the wrong round is refused instead of yielding a confident wrong fate.
// That wrong-round guarantee holds because every round number is one digit: round 10 would share Damm state
// with round 2. ROUNDS is the 4 elimination rounds (cut or deal codes, 9 or 12 digits); FINAL_ROUND admits a
// 6-digit final code only. Lengths never overlap, so a code typed into the wrong kind of round is refused too.
//
// The final code encodes an order the caller already drew (the tracer's final record): hostFinalCode scans
// seeds from zero for the first one whose final hash sends every finalist to its own index, and never draws.
//
// Membership. A name removed at the admin review still has a phone, and its code math alone may say "in".
// So the phone verdict takes an explicit membership input, filled by one non-blocking status fetch after the
// host starts the event and before any reveal (built by the join and phone tickets, not here): 'removed'
// yields 'removed' for every round, never 'in'; 'unconfirmed' computes the fates but marks them provisional,
// and the UI then says the main screen decides.

import { ELIMINATION_ROUNDS, FINAL_SIZE } from './schedule.ts';

export const SEED_DIGITS = 5;
export const CUT_DIGITS = 3;
/** Fate values live in [0, CUT_SCALE); a cut is one such value, so it prints in CUT_DIGITS digits. */
export const CUT_SCALE = 1000;
/** A seed is re-drawn only when two identities tie on a boundary value; this cap is never reached in practice. */
export const MAX_TRIES = 1000;
export const CUT_CODE_LENGTH = SEED_DIGITS + CUT_DIGITS + 1;
export const DEAL_CODE_LENGTH = SEED_DIGITS + 2 * CUT_DIGITS + 1;
/** The rounds a code may belong to. Every entry must stay one digit, or the wrong-round check weakens. */
export const ROUNDS: readonly number[] = Array.from({ length: ELIMINATION_ROUNDS }, (_, i) => i + 1);
/** The final's round number; its code is a seed plus a check digit. */
export const FINAL_ROUND = ELIMINATION_ROUNDS + 1;
export const FINAL_CODE_LENGTH = SEED_DIGITS + 1;

export type FateValue = (eventKey: string, round: number, seed: string, identity: string) => number;
export type ParsedCode =
  | { kind: 'cut'; seed: string; cut: number }
  | { kind: 'deal'; seed: string; low: number; high: number }
  | { kind: 'final'; seed: string };
/** One typed code; a deal round also needs which of its two rules the main screen drew (0 or 1). */
export type PhoneEntry = { code: string; rule?: 0 | 1 };
export type PhoneVerdict = 'in' | 'out' | 'removed' | 'bad-code' | 'awaiting-rule' | 'unknown';
/** What the post-start status fetch said about this identity; 'unconfirmed' when it has not answered. */
export type Membership = 'confirmed' | 'removed' | 'unconfirmed';
/** provisional: the fates were computed without confirmed membership, so the main screen decides. */
export type PhoneResult = { verdicts: PhoneVerdict[]; provisional: boolean };
/** A finalist's index in the encoded order; slot is null unless the verdict is 'in'. */
export type FinalResult = { verdict: PhoneVerdict; slot: number | null; provisional: boolean };

// ---- hash: FNV-1a over UTF-8, then the MurmurHash3 32-bit finaliser for avalanche. Synchronous and tiny,
// because crypto.subtle is async-only. FNV is a stream, so the hash of "f1 SEP f2 ... SEP last" is the state
// after the prefix fields, continued over the last field. hashToScale and fateValue both go through
// hashPrefixState + hashFromPrefixBytes: one implementation, so a check that runs fateValue runs the real path.

const encoder = new TextEncoder();
const FIELD = '\u001f';
const FNV_OFFSET = 0x811c9dc5;

function fnvBytes(h: number, bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** FNV-1a state after the given fields, each followed by the field separator. */
export function hashPrefixState(fields: ReadonlyArray<string | number>): number {
  let h = FNV_OFFSET | 0;
  for (const f of fields) h = fnvBytes(h, encoder.encode(String(f) + FIELD));
  return h;
}

/** Continue a prefix state over the last field's UTF-8 bytes, finalise, and scale to [0, scale). */
export function hashFromPrefixBytes(state: number, lastField: Uint8Array, scale: number): number {
  return Math.floor((fmix32(fnvBytes(state, lastField)) * scale) / 4294967296);
}

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Uniform integer in [0, scale) for a tagged tuple. Scales the full 32-bit word, never a modulo of it. */
export function hashToScale(tag: string, parts: ReadonlyArray<string | number>, scale: number): number {
  const fields = [tag, ...parts];
  const last = String(fields.pop());
  return hashFromPrefixBytes(hashPrefixState(fields), encoder.encode(last), scale);
}

// A lone surrogate is not text: UTF-8 encodes every one of them as the same replacement character, so two
// distinct malformed identities would hash identically.
const LONE_SURROGATE = /\p{Cs}/u;

/** NFC form of a well-formed identity; throws RangeError on a malformed one (a lone surrogate). */
export function canonicalIdentity(identity: string): string {
  if (LONE_SURROGATE.test(identity)) throw new RangeError('malformed identity: lone UTF-16 surrogate');
  return identity.normalize('NFC');
}

// Speed caches for fateValue, which a host or an exhaustive check calls once per identity per seed. Neither
// changes a result: the prefix state is keyed on all three prefix fields, and only well-formed identities
// are cached (canonicalIdentity throws before anything is stored). The identity cache is bounded.
let cachedEvent = '';
let cachedRound = Number.NaN;
let cachedSeed = '';
let cachedPrefix = 0;
const identityBytesCache = new Map<string, Uint8Array>();
const IDENTITY_CACHE_LIMIT = 4096;

function identityBytes(identity: string): Uint8Array {
  let bytes = identityBytesCache.get(identity);
  if (bytes === undefined) {
    bytes = encoder.encode(canonicalIdentity(identity));
    if (identityBytesCache.size >= IDENTITY_CACHE_LIMIT) identityBytesCache.clear();
    identityBytesCache.set(identity, bytes);
  }
  return bytes;
}

/** The fate value of one identity in one round. Identities are NFC-normalised so two keyboards agree. */
export function fateValue(eventKey: string, round: number, seed: string, identity: string): number {
  if (eventKey !== cachedEvent || round !== cachedRound || seed !== cachedSeed) {
    cachedPrefix = hashPrefixState(['fate', eventKey, round, seed]);
    cachedEvent = eventKey;
    cachedRound = round;
    cachedSeed = seed;
  }
  return hashFromPrefixBytes(cachedPrefix, identityBytes(identity), CUT_SCALE);
}

// ---- Damm check digit (a weakly totally anti-symmetric quasigroup of order 10): catches every single-digit
// error and every adjacent transposition.

const DAMM = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];

/** Damm interim digit of a digit string: the check digit to append, or 0 when the string already ends in a valid one. */
export function dammCheck(digits: string): number {
  let interim = 0;
  for (const c of digits) interim = DAMM[interim]![c.charCodeAt(0) - 48]!;
  return interim;
}

function withCheck(round: number, payload: string): string {
  return payload + dammCheck(String(round) + payload);
}

const THAI_ZERO = 0x0e50;

/** Accepts ASCII or Thai numerals, ignores spaces and dashes; anything else is not a code. */
function normaliseDigits(raw: string): string | null {
  let out = '';
  for (const c of raw) {
    const cp = c.codePointAt(0)!;
    if (cp >= 48 && cp <= 57) out += c;
    else if (cp >= THAI_ZERO && cp <= THAI_ZERO + 9) out += String(cp - THAI_ZERO);
    else if (c === ' ' || c === '-') continue;
    else return null;
  }
  return out;
}

/** Parse a code typed for `round`; null when it is malformed, mistyped, or belongs to another round. */
export function parseCode(raw: string, round: number): ParsedCode | null {
  const final = round === FINAL_ROUND;
  if (!final && !ROUNDS.includes(round)) return null;
  const digits = normaliseDigits(raw);
  if (digits === null) return null;
  if (final) {
    if (digits.length !== FINAL_CODE_LENGTH || dammCheck(String(round) + digits) !== 0) return null;
    return { kind: 'final', seed: digits.slice(0, SEED_DIGITS) };
  }
  if (digits.length !== CUT_CODE_LENGTH && digits.length !== DEAL_CODE_LENGTH) return null;
  if (dammCheck(String(round) + digits) !== 0) return null;
  const seed = digits.slice(0, SEED_DIGITS);
  const first = Number(digits.slice(SEED_DIGITS, SEED_DIGITS + CUT_DIGITS));
  if (digits.length === CUT_CODE_LENGTH) return { kind: 'cut', seed, cut: first };
  const high = Number(digits.slice(SEED_DIGITS + CUT_DIGITS, SEED_DIGITS + 2 * CUT_DIGITS));
  return { kind: 'deal', seed, low: first, high };
}

// ---- host side

function drawSeed(random: () => number): string {
  const space = 10 ** SEED_DIGITS;
  return String(Math.min(space - 1, Math.floor(random() * space))).padStart(SEED_DIGITS, '0');
}

function pad(value: number): string {
  return String(value).padStart(CUT_DIGITS, '0');
}

function checkRound(round: number): void {
  if (!ROUNDS.includes(round)) throw new RangeError(`round must be one of ${ROUNDS.join(', ')}, got ${round}`);
}

function checkRoster(roster: readonly string[], keep: number): void {
  if (!Number.isInteger(keep) || keep < 1 || keep >= roster.length) {
    throw new RangeError(`keep must be between 1 and ${roster.length - 1}, got ${keep}`);
  }
  if (new Set(roster.map(canonicalIdentity)).size !== roster.length) {
    throw new RangeError('roster identities must be unique');
  }
}

type Ranked = { ids: string[]; values: number[] };

function rank(eventKey: string, round: number, seed: string, roster: readonly string[], value: FateValue): Ranked {
  const scored = roster.map((id) => ({ id, v: value(eventKey, round, seed, id) }));
  scored.sort((a, b) => a.v - b.v);
  return { ids: scored.map((s) => s.id), values: scored.map((s) => s.v) };
}

// A boundary between rank i-1 and rank i is printable only when the two values differ.
const separable = (values: number[], i: number): boolean => values[i - 1]! < values[i]!;

/**
 * Elimination round: keep exactly `keep` of the live roster. `random` must return [0, 1), and the page passes a
 * crypto-backed source. `value` exists so the fairness test can run a deliberately biased variant through the
 * same host path; production callers leave it at the default.
 */
export function hostCutRound(
  eventKey: string,
  round: number,
  roster: string[],
  keep: number,
  random: () => number,
  value: FateValue = fateValue,
): { code: string; survivors: string[]; tries: number } {
  checkRound(round);
  checkRoster(roster, keep);
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const seed = drawSeed(random);
    const { ids, values } = rank(eventKey, round, seed, roster, value);
    if (!separable(values, keep)) continue;
    return { code: withCheck(round, seed + pad(values[keep]!)), survivors: ids.slice(0, keep), tries };
  }
  throw new Error(`no separable seed in ${MAX_TRIES} tries`);
}

/**
 * Deal round: two cuts, so either of two rules keeps exactly `keep`. Rule 0 keeps the lowest `keep` values,
 * rule 1 the highest `keep`. Neither depends on which rule is drawn later, so the draw can happen after the deal.
 */
export function hostDealCuts(
  eventKey: string,
  round: number,
  roster: string[],
  keep: number,
  random: () => number,
): { code: string; seed: string; survivors: [string[], string[]]; tries: number } {
  checkRound(round);
  checkRoster(roster, keep);
  const n = roster.length;
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const seed = drawSeed(random);
    const { ids, values } = rank(eventKey, round, seed, roster, fateValue);
    if (!separable(values, keep) || !separable(values, n - keep)) continue;
    const code = withCheck(round, seed + pad(values[keep]!) + pad(values[n - keep]!));
    return { code, seed, survivors: [ids.slice(0, keep), ids.slice(n - keep)], tries };
  }
  throw new Error(`no separable seed in ${MAX_TRIES} tries`);
}

// ---- phone side

/** Whether an identity is in or out of a deal round under the drawn rule, from its fate value and the two cuts. */
export function dealFate(v: number, parsed: { low: number; high: number }, rule: 0 | 1): boolean {
  return rule === 0 ? v < parsed.low : v >= parsed.high;
}

/**
 * The phone's verdicts, one per typed code in round order (entry i is round i + 1). Once out, every later
 * round is out. A malformed code, or a deal round whose drawn rule is not entered yet, stops the fold: the
 * phone says so instead of guessing, and every later round is 'unknown'. Membership has no default on
 * purpose: a caller must say what the status fetch returned. 'removed' never computes a fate.
 */
export function phoneVerdicts(
  eventKey: string,
  identity: string,
  entries: PhoneEntry[],
  membership: Membership,
): PhoneResult {
  if (membership !== 'confirmed' && membership !== 'removed' && membership !== 'unconfirmed') {
    throw new RangeError(`unknown membership ${String(membership)}`);
  }
  canonicalIdentity(identity);
  if (membership === 'removed') return { verdicts: entries.map(() => 'removed'), provisional: false };
  const verdicts: PhoneVerdict[] = [];
  let alive = true;
  let stopped = false;
  entries.forEach((entry, i) => {
    const round = i + 1;
    if (stopped) return void verdicts.push('unknown');
    if (!alive) return void verdicts.push('out');
    const parsed = parseCode(entry.code, round);
    // The final code is read by phoneFinalSlot, never folded here: a fifth entry stays a bad code.
    if (!parsed || parsed.kind === 'final') {
      stopped = true;
      return void verdicts.push('bad-code');
    }
    const v = fateValue(eventKey, round, parsed.seed, identity);
    if (parsed.kind === 'cut') {
      alive = v < parsed.cut;
    } else {
      if (entry.rule === undefined) {
        stopped = true;
        return void verdicts.push('awaiting-rule');
      }
      alive = dealFate(v, parsed, entry.rule);
    }
    verdicts.push(alive ? 'in' : 'out');
  });
  return { verdicts, provisional: membership === 'unconfirmed' };
}

// ---- the final: a code that encodes an order drawn elsewhere

function finalSlot(eventKey: string, seed: string, identity: string): number {
  return hashToScale('final', [eventKey, FINAL_ROUND, seed, canonicalIdentity(identity)], FINAL_SIZE);
}

/**
 * The final code for an order the caller already drew (index = slot). Scans 5-digit seeds from zero for the
 * first whose final hash sends every finalist to its own index; null when no seed does, and the caller then
 * shows no final code. It draws nothing, so it can never change the order it encodes.
 */
export function hostFinalCode(eventKey: string, order: readonly string[]): string | null {
  if (order.length !== FINAL_SIZE) throw new RangeError(`the final order must hold ${FINAL_SIZE} identities, got ${order.length}`);
  // A hole is skipped by every() and map(), so a sparse array would encode a slot for nobody.
  for (let i = 0; i < order.length; i++) {
    if (!(i in order) || typeof order[i] !== 'string') throw new RangeError(`final order slot ${i} holds no identity`);
  }
  if (new Set(order.map(canonicalIdentity)).size !== order.length) throw new RangeError('final identities must be unique');
  const space = 10 ** SEED_DIGITS;
  for (let s = 0; s < space; s++) {
    const seed = String(s).padStart(SEED_DIGITS, '0');
    if (order.every((id, i) => finalSlot(eventKey, seed, id) === i)) return withCheck(FINAL_ROUND, seed);
  }
  return null;
}

/**
 * The phone's place in the final: its index in the encoded order, given only when the fold over all
 * elimination rounds reads 'in'. 'removed' stays 'removed'; 'unconfirmed' marks the result provisional.
 */
export function phoneFinalSlot(
  eventKey: string,
  identity: string,
  entries: PhoneEntry[],
  finalCode: string,
  membership: Membership,
): FinalResult {
  const { verdicts, provisional } = phoneVerdicts(eventKey, identity, entries, membership);
  if (membership === 'removed') return { verdict: 'removed', slot: null, provisional };
  if (verdicts.length !== ELIMINATION_ROUNDS) return { verdict: 'unknown', slot: null, provisional };
  const last = verdicts[verdicts.length - 1]!;
  if (last !== 'in') return { verdict: last, slot: null, provisional };
  const parsed = parseCode(finalCode, FINAL_ROUND);
  if (!parsed || parsed.kind !== 'final') return { verdict: 'bad-code', slot: null, provisional };
  return { verdict: 'in', slot: finalSlot(eventKey, parsed.seed, identity), provisional };
}
