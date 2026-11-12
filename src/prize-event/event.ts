// The prize-draw event (CONTEXT.md: event, elimination round, final, finalist, cut schedule), DOM-free.
// The setup page builds an event here and stores it; the projector screen reads it back and walks it.
// Every later prize-draw ticket builds on these shapes: the 3D games (gh#305-gh#307) replace only the
// reveal's picture, QR join (gh#308) replaces only where `people` come from, and the phone results
// (gh#309) read the stored round codes.
//
// The state machine. One event is a fixed walk: rounds 1-4, then the final. Each step goes
//   ready -> drawn -> revealed
// and only `ready` may draw. `drawn` is persisted BEFORE anything is shown (drawAndSave), so a refresh
// in the middle of a reveal comes back to the same draw instead of drawing again (gh#304). After a round
// is revealed, `advance` moves to the next step's `ready`; the final has no step after it.
//
// The draw. A round never runs its own random pick: it calls gh#300's hostCutRound over the live
// roster's opaque ids with the scheduled keep, the same call QR mode makes, so there is one draw
// mechanism and its equal-odds proof covers both modes. The survivors are stored in ROSTER order, never
// in the fate-rank order hostCutRound returns them in: rank is the draw's internal ordering and would
// tell a reader who came closest to the cut. The final is not a cut: 5 finalists are dealt to the prize
// slots by a uniform permutation (Fisher-Yates over an unbiased integer source).
//
// Positions are derived, not stored as a second field: `rounds.length`, `final` and `at` determine
// where the event is, so they cannot disagree with each other (decodeEvent checks they are consistent).

import { ELIMINATION_ROUNDS, FINAL_SIZE } from '../prize-draw/schedule.ts';
import { canonicalIdentity, hostCutRound } from '../prize-draw/round-code.ts';
import { isCleanName, nameKey, parseRoster, type NameIssue } from './names.ts';

/** The smallest roster a 4-round schedule down to 5 can hold: one distinct count per step. */
export const MIN_HEADS = FINAL_SIZE + ELIMINATION_ROUNDS;
/** The largest roster: the projector's name field is sized for 200 names (design/Gh302Projector.dc.html). */
export const MAX_HEADS = 200;
export const MIN_PRIZES = 1;
export const MAX_PRIZES = 5;
/** One stored event per browser; starting a new event replaces it. */
export const STORAGE_KEY = 'watduang:prize-draw:event';
const VERSION = 1;

/** A random source. The page passes cryptoRng(); tests pass a seeded one. */
export type Rng = {
  /** Uniform in [0, 1). */
  float(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** `bytes` random bytes as lowercase hex. */
  hex(bytes: number): string;
};

export type Person = { id: string; name: string };
export type EventSetup = {
  eventName: string;
  people: Person[];
  /** [head count, after round 1, ..., after round 4 = FINAL_SIZE]. */
  schedule: number[];
  /** 1-5 prize names, first prize first; a name may be empty. */
  prizes: string[];
};
export type RoundRecord = { round: number; code: string; survivors: string[] };
export type FinalRecord = { order: string[] };
export type Phase = 'ready' | 'drawn' | 'revealed';
export type EventState = {
  v: typeof VERSION;
  eventKey: string;
  setup: EventSetup;
  rounds: RoundRecord[];
  final: FinalRecord | null;
  at: Phase;
};
export type Position = { kind: 'round'; round: number; at: Phase } | { kind: 'final'; at: Phase };

export type EventInput = { eventName: string; names: string[]; schedule: number[]; prizes: string[] };

export type ScheduleIssue = { index: number; kind: 'locked' | 'not-integer' | 'not-less' };
export type SetupIssue =
  | { kind: 'head-count'; count: number }
  | { kind: 'prize-count'; count: number }
  | { kind: 'name-refused'; name: string; issue: NameIssue }
  | { kind: 'name-duplicate'; name: string }
  | { kind: 'schedule'; issue: ScheduleIssue };

// ---- validation

/**
 * Problems with a cut schedule for `heads` people, at most one per step, in step order. Step 0 is locked
 * to the head count and the last step to FINAL_SIZE; every step between must be an integer below the one
 * before it. A step at or below FINAL_SIZE before the end makes the next step fail to shrink, so the
 * lower bound needs no rule of its own.
 */
export function scheduleIssues(schedule: readonly number[], heads: number): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const last = ELIMINATION_ROUNDS;
  if (schedule[0] !== heads) issues.push({ index: 0, kind: 'locked' });
  for (let i = 1; i < last; i++) {
    const v = schedule[i];
    if (typeof v !== 'number' || !Number.isInteger(v)) issues.push({ index: i, kind: 'not-integer' });
    // A step after a broken one is not blamed for it: the MC fixes one box at a time.
    else if (Number.isInteger(schedule[i - 1]) && !(v < schedule[i - 1]!)) issues.push({ index: i, kind: 'not-less' });
  }
  if (schedule.length !== last + 1 || schedule[last] !== FINAL_SIZE) issues.push({ index: last, kind: 'locked' });
  else if (Number.isInteger(schedule[last - 1]) && !(FINAL_SIZE < schedule[last - 1]!)) {
    issues.push({ index: last, kind: 'not-less' });
  }
  return issues;
}

/** Everything that stops an event from starting. Names are taken as typed lines and normalised here. */
export function setupIssues(input: EventInput): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const roster = parseRoster(input.names.join('\n'));
  for (const { name, issue } of roster.refused) issues.push({ kind: 'name-refused', name, issue });
  for (const name of roster.duplicates) issues.push({ kind: 'name-duplicate', name });
  const heads = roster.names.length + roster.refused.length + roster.duplicates.length;
  if (heads < MIN_HEADS || heads > MAX_HEADS) issues.push({ kind: 'head-count', count: heads });
  else for (const issue of scheduleIssues(input.schedule, heads)) issues.push({ kind: 'schedule', issue });
  if (input.prizes.length < MIN_PRIZES || input.prizes.length > MAX_PRIZES) {
    issues.push({ kind: 'prize-count', count: input.prizes.length });
  }
  return issues;
}

// ---- building and walking the event

const oneLine = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** A new event at round 1, ready. Throws RangeError when setupIssues is not empty. */
export function createEvent(input: EventInput, rng: Rng): EventState {
  const issues = setupIssues(input);
  if (issues.length) throw new RangeError(`event cannot start: ${issues.map((i) => i.kind).join(', ')}`);
  const { names } = parseRoster(input.names.join('\n'));
  const ids = new Set<string>();
  const people = names.map((name) => {
    // Opaque, random and never derived from the name, like the id the QR join server issues (gh#300).
    let id = rng.hex(8);
    while (ids.has(id)) id = rng.hex(8);
    ids.add(id);
    return { id, name };
  });
  return {
    v: VERSION,
    eventKey: rng.hex(8),
    setup: {
      eventName: oneLine(input.eventName),
      people,
      schedule: [...input.schedule],
      prizes: input.prizes.map(oneLine),
    },
    rounds: [],
    final: null,
    at: 'ready',
  };
}

export function position(state: EventState): Position {
  if (state.final) return { kind: 'final', at: state.at };
  if (state.rounds.length === ELIMINATION_ROUNDS && state.at === 'ready') return { kind: 'final', at: 'ready' };
  const round = state.at === 'ready' ? state.rounds.length + 1 : state.rounds.length;
  return { kind: 'round', round, at: state.at };
}

/** Ids still in, in roster order, BEFORE the current step's draw (for a drawn step: the ones it drew from). */
export function liveIds(state: EventState): string[] {
  const done = state.at === 'ready' ? state.rounds.length : state.rounds.length - 1;
  const all = state.setup.people.map((p) => p.id);
  if (state.final) return state.rounds[ELIMINATION_ROUNDS - 1]!.survivors;
  return done === 0 ? all : state.rounds[done - 1]!.survivors;
}

/** Draw the current step. Only a `ready` step draws; anything else throws. */
export function drawNext(state: EventState, rng: Rng): EventState {
  if (state.at !== 'ready') throw new Error(`only a ready step draws, this one is ${state.at}`);
  const live = liveIds(state);
  const pos = position(state);
  if (pos.kind === 'final') {
    return { ...state, final: { order: uniformPermutation(live, rng.int) }, at: 'drawn' };
  }
  const keep = state.setup.schedule[pos.round]!;
  const { code, survivors } = hostCutRound(state.eventKey, pos.round, live, keep, rng.float);
  const kept = new Set(survivors);
  const record: RoundRecord = { round: pos.round, code, survivors: live.filter((id) => kept.has(id)) };
  return { ...state, rounds: [...state.rounds, record], at: 'drawn' };
}

/** Show what is drawn. Never draws. */
export function revealDrawn(state: EventState): EventState {
  if (state.at !== 'drawn') throw new Error(`only a drawn step reveals, this one is ${state.at}`);
  return { ...state, at: 'revealed' };
}

/** From a revealed round to the next step. The final is the last step and has nowhere to go. */
export function advance(state: EventState): EventState {
  if (state.at !== 'revealed') throw new Error(`only a revealed step advances, this one is ${state.at}`);
  if (state.final) throw new Error('the final is the last step of an event');
  return { ...state, at: 'ready' };
}

/**
 * Draw, then store, then hand back the drawn state. When the write fails the draw is thrown away and the
 * old state comes back with ok: false: nothing of it was shown, so the room has not seen a result that a
 * refresh could later contradict. The caller shows the failure and keeps the step ready.
 */
export function drawAndSave(
  state: EventState,
  rng: Rng,
  save: (next: EventState) => boolean,
): { ok: boolean; state: EventState } {
  const next = drawNext(state, rng);
  return save(next) ? { ok: true, state: next } : { ok: false, state };
}

/** Fisher-Yates with an unbiased integer source: every one of the n! orders equally likely. */
export function uniformPermutation<T>(items: readonly T[], int: (n: number) => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Prize holders after the final, first prize first. Finalists beyond the prize count hold none. */
export function winners(state: EventState): { prize: string; index: number; person: Person }[] {
  if (!state.final) return [];
  const byId = new Map(state.setup.people.map((p) => [p.id, p]));
  return state.setup.prizes.map((prize, index) => ({ prize, index, person: byId.get(state.final!.order[index]!)! }));
}

// ---- the random source the page uses

/** crypto.getRandomValues-backed source. Integers by rejection sampling, so no value is favoured. */
export function cryptoRng(crypto: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): Rng {
  const word = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;
  return {
    float: () => word() / 4294967296,
    int(n: number): number {
      if (!Number.isInteger(n) || n < 1 || n > 4294967296) throw new RangeError(`int(${n})`);
      const limit = 4294967296 - (4294967296 % n);
      for (;;) {
        const w = word();
        if (w < limit) return w % n;
      }
    },
    hex: (bytes: number) =>
      Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
}

// ---- persistence

export function encodeEvent(state: EventState): string {
  return JSON.stringify(state);
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isPlainArray = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * Read a stored event back, re-checking everything a screen relies on: the names (cap, cleanliness), the
 * schedule rules, the prize count, unique well-formed ids, and that every stored draw is consistent with
 * the roster and the schedule. Anything off reads as no event at all: a screen with no event says so,
 * while a screen with a half-trusted one could show a name that never passed the setup checks.
 */
export function decodeEvent(raw: string | null): EventState | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  return isEventState(v) ? v : null;
}

function isEventState(v: unknown): v is EventState {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (s.v !== VERSION || !isStr(s.eventKey) || !/^[0-9a-f]{16,}$/.test(s.eventKey)) return false;
  if (s.at !== 'ready' && s.at !== 'drawn' && s.at !== 'revealed') return false;
  const setup = s.setup as Record<string, unknown> | undefined;
  if (!setup || typeof setup !== 'object' || !isStr(setup.eventName)) return false;
  if (!isPlainArray(setup.people) || !isPlainArray(setup.schedule) || !isPlainArray(setup.prizes)) return false;
  const people = setup.people as unknown[];
  if (people.length < MIN_HEADS || people.length > MAX_HEADS) return false;
  const ids = new Set<string>();
  // Uniqueness by nameKey, the key setup refuses a second name on: two names that read the same on a
  // projector are one name, however they are spelled.
  const keys = new Set<string>();
  for (const p of people) {
    if (!p || typeof p !== 'object') return false;
    const { id, name } = p as Record<string, unknown>;
    if (!isStr(id) || !/^[0-9a-f]{16}$/.test(id) || ids.has(id) || !isCleanName(name) || keys.has(nameKey(name))) return false;
    try {
      canonicalIdentity(id);
    } catch {
      return false;
    }
    ids.add(id);
    keys.add(nameKey(name));
  }
  const schedule = setup.schedule as unknown[];
  if (!schedule.every((n) => typeof n === 'number') || scheduleIssues(schedule as number[], people.length).length) return false;
  const prizes = setup.prizes as unknown[];
  if (prizes.length < MIN_PRIZES || prizes.length > MAX_PRIZES || !prizes.every(isStr)) return false;
  if (!isPlainArray(s.rounds) || s.rounds.length > ELIMINATION_ROUNDS) return false;
  let live = [...ids];
  for (const [i, r] of (s.rounds as unknown[]).entries()) {
    if (!r || typeof r !== 'object') return false;
    const { round, code, survivors } = r as Record<string, unknown>;
    if (round !== i + 1 || !isStr(code) || !/^\d+$/.test(code) || !isPlainArray(survivors)) return false;
    if (survivors.length !== (schedule[i + 1] as number)) return false;
    const liveSet = new Set(live);
    if (!survivors.every((id) => isStr(id) && liveSet.has(id)) || new Set(survivors).size !== survivors.length) return false;
    // Roster order, as drawNext writes it.
    const kept = new Set(survivors as string[]);
    if (live.filter((id) => kept.has(id)).join() !== (survivors as string[]).join()) return false;
    live = survivors as string[];
  }
  const done = (s.rounds as unknown[]).length;
  if (s.final !== null) {
    if (done !== ELIMINATION_ROUNDS || s.at === 'ready') return false;
    const order = (s.final as Record<string, unknown> | undefined)?.order;
    if (!isPlainArray(order) || order.length !== live.length) return false;
    if ([...order].sort().join() !== [...live].sort().join()) return false;
  } else if (s.at !== 'ready' && done === 0) {
    return false;
  }
  return true;
}

export function loadEvent(storage: Pick<Storage, 'getItem'>): EventState | null {
  return readEvent(storage).state;
}

/**
 * The stored event and the exact text it was read from. On a screen that shares storage with others (two
 * tabs, a duplicated projector tab), that text is the event's version stamp: a screen may write only while
 * the stored text is still the one it last read or wrote. It carries the event key and the walk's position,
 * and within one event the walk only moves forward while a new event gets a fresh random key, so a stored
 * text never comes back once replaced, and a changed text always means someone else moved the event.
 * A storage that throws reads as no event.
 */
export function readEvent(storage: Pick<Storage, 'getItem'>): { raw: string | null; state: EventState | null } {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { raw: null, state: null };
  }
  return { raw, state: decodeEvent(raw) };
}

/** What a writer may do with the stored event while it holds the event lock. */
export type EventTx = {
  /** The stored event and its exact text, read now. */
  read(): { raw: string | null; state: EventState | null };
  /** Store `state`. False on any storage failure (private mode, quota, denied), and once the lock is gone. */
  write(state: EventState): boolean;
};

/**
 * The one way to write the stored event: `fn` runs inside the exclusive Web Lock named after the storage key,
 * which every writer of the key (the setup page, every projector tab) takes, and `tx.write` is the only
 * setItem of that key in this codebase (scripts/roster-lock-structure-check.mjs holds it to that). So no
 * writer can land between another's read and its write.
 *
 * Fails closed: with no lock manager, no storage, or a request the browser refuses, `fn` never runs and
 * nothing is written; the promise resolves false. There is no unlocked fallback (unlike src/shell/lock.ts):
 * localStorage has no compare-and-set, so an unlocked writer can lose a draw the room already saw. `fn` must
 * stay synchronous; `tx` refuses to write once `fn` has returned. Resolves true when `fn` ran; a throw
 * inside `fn` rejects.
 */
export function withEventLock(
  locks: Pick<LockManager, 'request'> | null | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  fn: (tx: EventTx) => void,
): Promise<boolean> {
  if (!locks || !storage) return Promise.resolve(false);
  let entered = false;
  const body = (): true => {
    entered = true;
    let open = true;
    const tx: EventTx = {
      read: () => readEvent(storage),
      write(state) {
        if (!open) return false;
        try {
          storage.setItem(STORAGE_KEY, encodeEvent(state));
          return true;
        } catch {
          return false;
        }
      },
    };
    try {
      fn(tx);
    } finally {
      open = false;
    }
    return true;
  };
  let pending: Promise<unknown>;
  try {
    pending = locks.request(STORAGE_KEY, body);
  } catch {
    return Promise.resolve(false);
  }
  return Promise.resolve(pending).then(
    () => entered,
    (err: unknown) => {
      if (entered) throw err;
      return false;
    },
  );
}
