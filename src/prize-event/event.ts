// The prize-draw event (CONTEXT.md: event, elimination round, final, finalist, cut schedule), DOM-free.
// The setup page builds an event here and stores it; the projector screen reads it back and walks it.
// Every later prize-draw ticket builds on these shapes: the 3D games (gh#305-gh#307) replace only the
// reveal's picture, QR join (gh#308) replaces only where `people` come from, and the phone results
// (gh#309) read the stored round codes.
//
// Identity (ADR-0076). An admin-mode event draws its own hex ids and hex key. A QR-mode event takes the join
// server's frozen roster as it is, each person under their server join id, and the event's 6-digit PIN as
// the key: a phone holds exactly those two, so its own result from the round codes is the projector's. The
// decoder accepts each pair and nothing looser, never one shape mixed with the other.
//
// The state machine. One event is a fixed walk: rounds 1-4, then the final. Each step goes
//   ready -> drawn -> revealed
// and only `ready` may draw. A draw is committed to the store (store.ts) BEFORE anything of it is shown
// (drawAndSave), so a refresh in the middle of a reveal comes back to the same draw instead of drawing
// again (gh#304). After a round is revealed, `advance` moves to the next step's `ready`; the final has no
// step after it.
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
//
// Games (gh#305, payload v2). The MC's picks (`setup.games`) are frozen when the event starts; each step
// records the game it was played with, and every fact a game draws is committed before it animates. A card
// round takes two commits: prepareCards stores the complete deal in `prepared` (the step stays ready), then
// drawNext draws the rule from that stored deal, so a refresh never redeals. A ladder final's slot layout is
// on screen while the finalists pick lanes, so the step into that final draws it and stores it in `prepared`;
// the final then locks the five lane picks and only then draws its permutation, which stays hidden until the
// reveal. A stored v1 event is read by its own rules and
// normalised to v2 (no games, nothing prepared); the store keeps the stored text, so the next
// compare-and-set still compares against the original bytes.

import { ELIMINATION_ROUNDS, FINAL_SIZE } from '../prize-draw/schedule.ts';
import { canonicalIdentity, hostCutRound, parseCode, type ParsedCode } from '../prize-draw/round-code.ts';
import { ID as SERVER_ID } from '../prize-join/join.ts';
import { PIN as EVENT_PIN } from './qr-event.ts';
import { hostDealRound, pairFor, phoneCard, satisfies } from '../prize-draw/cards.ts';
import { isCleanName, nameKey, parseRoster, type NameIssue } from './names.ts';
import {
  NO_GAMES,
  isFiveLanes,
  isGameChoices,
  ladderConsistent,
  ladderOrder,
  type CardsPrepared,
  type Deal,
  type FinalRecord,
  type Five,
  type GameChoices,
  type Lane,
  type RoundRecord,
} from './game-contract.ts';

export type { FinalRecord, RoundRecord };

/** The smallest roster a 4-round schedule down to 5 can hold: one distinct count per step. */
export const MIN_HEADS = FINAL_SIZE + ELIMINATION_ROUNDS;
/** The largest roster: the projector's name field is sized for 200 names (design/Gh302Projector.dc.html). */
export const MAX_HEADS = 200;
export const MIN_PRIZES = 1;
export const MAX_PRIZES = 5;
/** The localStorage key events were stored under before gh#313. store.ts migrates it into IndexedDB and
 *  names its cross-tab channel after it; nothing writes it any more. One stored event per browser. */
export const STORAGE_KEY = 'watduang:prize-draw:event';
const VERSION = 2;
/** An admin-mode event's own ids and key, as createEvent draws them (rng.hex(8)). */
const LOCAL_ID = /^[0-9a-f]{16}$/;
const LOCAL_KEY = /^[0-9a-f]{16,}$/;
/** The gh#304 payload: no games. Still read (decodeEvent), never written. */
const V1 = 1;

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
  /** The game of each elimination round and of the final, frozen at the start. */
  games: GameChoices;
};
export type Phase = 'ready' | 'drawn' | 'revealed';
/** A ladder final while the finalists pick: its slot layout (`slotRanks[exitLane] = rank`), drawn as the
 *  final opens and never changed after, and the lane picks so far (`picks[lane]` is the finalist on that start
 *  lane, or null), stored one assignment at a time so a reload or a second screen reads the same picks. */
export type LadderPrepared = { game: 'ladder'; slotRanks: Five<Lane>; picks: Five<string | null> };
export type EventState = {
  v: typeof VERSION;
  eventKey: string;
  setup: EventSetup;
  rounds: RoundRecord[];
  final: FinalRecord | null;
  /** What a ready step stored before its draw: a card round's deal, while its rule is not drawn yet, or a
   *  ladder final's slot layout, while the finalists pick. Null on every other step. */
  prepared: CardsPrepared | LadderPrepared | null;
  at: Phase;
};
export type Position = { kind: 'round'; round: number; at: Phase } | { kind: 'final'; at: Phase };

export type EventInput = {
  eventName: string;
  names: string[];
  schedule: number[];
  prizes: string[];
  /** The MC's game picks; absent means every step reveals in plain 2D (NO_GAMES). */
  games?: GameChoices;
  /**
   * QR mode (gh#308, ADR-0076 Identity): the roster the join server froze, each person under their server
   * join id, and the event's PIN as the event key. A phone holds exactly those two, so its own result from
   * the round codes is the projector's. `names` must be the roster's names, in its order.
   */
  qr?: { pin: string; roster: Person[] };
};

export type ScheduleIssue = { index: number; kind: 'locked' | 'not-integer' | 'not-less' };
export type SetupIssue =
  | { kind: 'head-count'; count: number }
  | { kind: 'prize-count'; count: number }
  | { kind: 'name-refused'; name: string; issue: NameIssue }
  | { kind: 'name-duplicate'; name: string }
  | { kind: 'schedule'; issue: ScheduleIssue }
  | { kind: 'games' }
  | { kind: 'cards-not-half'; round: number }
  | { kind: 'qr' };

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
  if (input.qr !== undefined && !isServerRoster(input.qr, input.names)) issues.push({ kind: 'qr' });
  if (input.games !== undefined && !isGameChoices(input.games)) issues.push({ kind: 'games' });
  else if (input.games !== undefined) {
    input.games.rounds.forEach((g, i) => {
      if (g === 'cards' && !cutsInHalf(input.schedule, i + 1)) issues.push({ kind: 'cards-not-half', round: i + 1 });
    });
  }
  return issues;
}

/** A frozen QR roster as the join server issues one: the 6-digit PIN, unique server join ids, every name
 *  exactly as the event's name rule stores it, and `names` its names in its order. */
function isServerRoster(qr: unknown, names: readonly string[]): boolean {
  if (!qr || typeof qr !== 'object') return false;
  const { pin, roster } = qr as Record<string, unknown>;
  if (!isStr(pin) || !EVENT_PIN.test(pin) || !isPlainArray(roster) || roster.length !== names.length) return false;
  const ids = new Set<string>();
  return roster.every((p, i) => {
    if (!p || typeof p !== 'object') return false;
    const { id, name } = p as Record<string, unknown>;
    if (!isStr(id) || !SERVER_ID.test(id) || ids.has(id) || !isCleanName(name) || name !== names[i]) return false;
    ids.add(id);
    return true;
  });
}

/**
 * Does `round` cut exactly in half (live count = 2 x keep)? Only such a round may play cards (owner ruling
 * 2026-11-13, gh#306): with any other cut, some dealt cards are certain to survive or fall before the rule
 * is drawn, and each phone shows its holder the card first.
 */
export function cutsInHalf(schedule: readonly number[], round: number): boolean {
  const keep = schedule[round];
  return typeof keep === 'number' && Number.isInteger(keep) && schedule[round - 1] === 2 * keep;
}

/**
 * The one stored form of a round code: ASCII digits exactly as round-code.ts produces them, a code of the
 * kind its round plays. parseCode also forgives spaces, hyphens and Thai numerals, because a person types
 * it; a stored code never leans on that, or a forgiven form is kept and the next record fails to read back.
 */
function storedCode<K extends ParsedCode['kind']>(code: unknown, round: number, kind: K): Extract<ParsedCode, { kind: K }> | null {
  if (typeof code !== 'string' || !/^[0-9]+$/.test(code)) return null;
  const parsed = parseCode(code, round);
  return parsed?.kind === kind ? (parsed as Extract<ParsedCode, { kind: K }>) : null;
}

// ---- building and walking the event

const oneLine = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** A new event at round 1, ready. Throws RangeError when setupIssues is not empty. */
export function createEvent(input: EventInput, rng: Rng): EventState {
  const issues = setupIssues(input);
  if (issues.length) throw new RangeError(`event cannot start: ${issues.map((i) => i.kind).join(', ')}`);
  const { names } = parseRoster(input.names.join('\n'));
  const ids = new Set<string>();
  // QR mode takes the server's ids and PIN as they are; admin mode draws its own.
  const people = input.qr
    ? input.qr.roster.map((p) => ({ id: p.id, name: p.name }))
    : names.map((name) => {
        // Opaque, random and never derived from the name, like the id the QR join server issues (gh#300).
        let id = rng.hex(8);
        while (ids.has(id)) id = rng.hex(8);
        ids.add(id);
        return { id, name };
      });
  const games = input.games ?? NO_GAMES;
  return {
    v: VERSION,
    eventKey: input.qr ? input.qr.pin : rng.hex(8),
    setup: {
      eventName: oneLine(input.eventName),
      people,
      schedule: [...input.schedule],
      prizes: input.prizes.map(oneLine),
      games: copyGames(games),
    },
    rounds: [],
    final: null,
    prepared: null,
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

const copyGames = (g: GameChoices): GameChoices => ({ rounds: [g.rounds[0], g.rounds[1], g.rounds[2], g.rounds[3]], final: g.final });
const LANES: Five<Lane> = [0, 1, 2, 3, 4];

/**
 * Deal the current card round and hand back the state holding the deal, still ready: the caller stores it
 * before anything of it is shown. Only a ready card round with nothing prepared deals, so a stored deal is
 * never dealt again; anything else throws. The deal is gh#300's hostDealRound over the live roster: either
 * rule of its pair keeps exactly the scheduled count, counted off the faces.
 */
export function prepareCards(state: EventState, rng: Rng): EventState {
  if (state.at !== 'ready') throw new Error(`only a ready step deals, this one is ${state.at}`);
  if (state.prepared) throw new Error('this round is already prepared: a stored deal is never dealt again');
  const pos = position(state);
  if (pos.kind !== 'round' || state.setup.games.rounds[pos.round - 1] !== 'cards') throw new Error('only a card round deals');
  const live = liveIds(state);
  const dealt = hostDealRound(state.eventKey, pos.round, live, state.setup.schedule[pos.round]!, rng.float);
  const deal: Deal = {
    pair: [dealt.pair[0], dealt.pair[1]],
    cards: live.map((id) => {
      const card = dealt.cards.get(id)!;
      return { id, card: { suit: card.suit, rank: card.rank } };
    }),
  };
  return { ...state, prepared: { game: 'cards', round: pos.round, code: dealt.code, deal } };
}

/**
 * Draw the current step. Only a `ready` step draws; anything else throws. A card round draws only its rule,
 * from the stored deal (prepareCards first). A ladder final takes the five lane picks (`picks[lane]`, each
 * finalist once), locked before anything is drawn; every other step takes none.
 */
export function drawNext(state: EventState, rng: Rng, picks?: readonly string[]): EventState {
  if (state.at !== 'ready') throw new Error(`only a ready step draws, this one is ${state.at}`);
  const live = liveIds(state);
  const pos = position(state);
  if (pos.kind === 'final') {
    const game = state.setup.games.final;
    if (game !== 'ladder') {
      if (picks !== undefined) throw new RangeError('lane picks are for a ladder final only');
      return { ...state, final: { order: uniformPermutation(live, rng.int), game }, at: 'drawn' };
    }
    const prepared = state.prepared;
    if (prepared?.game !== 'ladder') throw new Error('a ladder final draws only once its slot layout is stored');
    // The lock is the stored picks unless a caller hands its own; either way all five, each finalist once.
    const chosen = picks ?? prepared.picks;
    if (!sameMembers(chosen, live)) throw new RangeError('a ladder final needs five lane picks, each finalist once');
    const locked = [...chosen] as unknown as Five<string>;
    // The slots are the stored ones, shown since the final opened; only the permutation is drawn here.
    const slotRanks = [...prepared.slotRanks] as unknown as Five<Lane>;
    const permutation = uniformPermutation(LANES, rng.int) as unknown as Five<Lane>;
    const order = ladderOrder(locked, permutation, slotRanks);
    return { ...state, final: { order, game, picks: locked, permutation, slotRanks }, prepared: null, at: 'drawn' };
  }
  if (picks !== undefined) throw new RangeError('lane picks are for a ladder final only');
  const game = state.setup.games.rounds[pos.round - 1]!;
  let record: RoundRecord;
  if (game === 'cards') {
    const prepared = state.prepared;
    if (prepared?.game !== 'cards' || prepared.round !== pos.round) throw new Error('a card round draws its rule only after its deal is stored');
    if (!storedCode(prepared.code, pos.round, 'deal')) throw new Error('the stored deal code is not in its one stored form');
    const rule = rng.int(2) === 0 ? 0 : 1;
    const by = new Map(prepared.deal.cards.map((c) => [c.id, c.card]));
    const passes = prepared.deal.pair[rule];
    const survivors = live.filter((id) => satisfies(passes, by.get(id)!));
    record = { round: pos.round, code: prepared.code, survivors, game, deal: prepared.deal, rule };
  } else {
    const keep = state.setup.schedule[pos.round]!;
    const { code, survivors } = hostCutRound(state.eventKey, pos.round, live, keep, rng.float);
    const kept = new Set(survivors);
    record = { round: pos.round, code, survivors: live.filter((id) => kept.has(id)), game };
  }
  return { ...state, rounds: [...state.rounds, record], prepared: null, at: 'drawn' };
}

/** Same members, each once: `a` is an ordering of `b`. */
function sameMembers(a: readonly unknown[], b: readonly string[]): boolean {
  if (a.length !== b.length || new Set(a).size !== a.length) return false;
  const want = new Set<unknown>(b);
  return a.every((x) => want.has(x));
}

/** Show what is drawn. Never draws. */
export function revealDrawn(state: EventState): EventState {
  if (state.at !== 'drawn') throw new Error(`only a drawn step reveals, this one is ${state.at}`);
  return { ...state, at: 'revealed' };
}

/**
 * From a revealed round to the next step. The final is the last step and has nowhere to go. The step into a
 * ladder final also draws that final's slot layout from `rng` and stores it with the step, so the slots the
 * room sees while the finalists pick are the slots the draw uses; every other step draws nothing.
 */
export function advance(state: EventState, rng?: Rng): EventState {
  if (state.at !== 'revealed') throw new Error(`only a revealed step advances, this one is ${state.at}`);
  if (state.final) throw new Error('the final is the last step of an event');
  const next: EventState = { ...state, at: 'ready' };
  if (position(next).kind !== 'final' || state.setup.games.final !== 'ladder') return next;
  if (!rng) throw new Error('the step into a ladder final draws its slot layout: it needs the random source');
  const slotRanks = uniformPermutation(LANES, rng.int) as unknown as Five<Lane>;
  return { ...next, prepared: { game: 'ladder', slotRanks, picks: [null, null, null, null, null] } };
}

/**
 * One lane assignment on a ready ladder final: `id` onto start lane `lane` (leaving any lane it was on), or
 * null to empty that lane. Draws nothing and keeps the slot layout as stored; the caller stores the result
 * (compare-and-set) before showing it. Throws on any other step, a lane off the five, or a non-finalist.
 */
export function pickLane(state: EventState, lane: number, id: string | null): EventState {
  const prepared = state.prepared;
  const pos = position(state);
  if (pos.kind !== 'final' || pos.at !== 'ready' || prepared?.game !== 'ladder') throw new Error('lane picks are for a ready ladder final only');
  if (!Number.isInteger(lane) || lane < 0 || lane >= FINAL_SIZE) throw new RangeError(`no start lane ${lane}`);
  if (id !== null && !liveIds(state).includes(id)) throw new RangeError('only a finalist picks a lane');
  const picks = prepared.picks.map((at, i) => (i === lane ? id : at === id ? null : at)) as unknown as Five<string | null>;
  return { ...state, prepared: { game: 'ladder', slotRanks: prepared.slotRanks, picks } };
}

/**
 * Draw, then store, then hand back the drawn state. `save` resolves true only once the write is committed
 * (store.ts put). When it fails the draw is thrown away and the old state comes back with ok: false: nothing
 * of it was shown, so the room has not seen a result that a refresh could later contradict. The caller shows
 * the failure and keeps the step ready.
 */
export async function drawAndSave(
  state: EventState,
  rng: Rng,
  save: (next: EventState) => boolean | Promise<boolean>,
  picks?: readonly string[],
): Promise<{ ok: boolean; state: EventState }> {
  const next = drawNext(state, rng, picks);
  return (await save(next)) ? { ok: true, state: next } : { ok: false, state };
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
 *
 * A v1 text (gh#304) is checked by v1's rules alone and handed back normalised to v2: no games, nothing
 * prepared, every round and the final played with no game. Every stored code, in either version, is in its
 * one stored form (storedCode). A v2 text is checked in full, games included:
 * each step's game is the one picked, cards only on a round that cuts in half, a card round's every card is re-derived from its code (gh#300
 * phoneCard) and both rules keep exactly the scheduled count, its survivors are the drawn rule's, and a
 * ladder final's picks are the finalists and its order follows its permutation and slot layout. Any other
 * version is no event; the store keeps its text untouched.
 */
export function decodeEvent(raw: string | null): EventState | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const version = (v as Record<string, unknown>).v;
  if (version === V1) return isStoredEvent(v, V1) ? normaliseV1(v as Record<string, unknown>) : null;
  if (version === VERSION) return isStoredEvent(v, VERSION) ? (v as EventState) : null;
  return null;
}

/** A checked v1 event as v2, rebuilt field by field so nothing v1 never had rides along. */
function normaliseV1(s: Record<string, unknown>): EventState {
  const setup = s.setup as { eventName: string; people: Person[]; schedule: number[]; prizes: string[] };
  const rounds = s.rounds as { round: number; code: string; survivors: string[] }[];
  const final = s.final as { order: string[] } | null;
  return {
    v: VERSION,
    eventKey: s.eventKey as string,
    setup: {
      eventName: setup.eventName,
      people: setup.people.map((p) => ({ id: p.id, name: p.name })),
      schedule: [...setup.schedule],
      prizes: [...setup.prizes],
      games: copyGames(NO_GAMES),
    },
    rounds: rounds.map((r) => ({ round: r.round, code: r.code, survivors: [...r.survivors], game: null })),
    final: final ? { order: [...final.order], game: null } : null,
    prepared: null,
    at: s.at as Phase,
  };
}

/** Is `deal` exactly what `code` deals the live roster, in roster order, with both rules keeping `keep`? */
function isDeal(eventKey: string, round: number, code: unknown, deal: unknown, live: readonly string[], keep: number): deal is Deal {
  const parsed = storedCode(code, round, 'deal');
  if (!parsed || !deal || typeof deal !== 'object') return false;
  const { pair, cards } = deal as Record<string, unknown>;
  const want = pairFor(eventKey, round, parsed.seed);
  if (!isPlainArray(pair) || pair.length !== 2 || pair[0] !== want[0] || pair[1] !== want[1]) return false;
  if (!isPlainArray(cards) || cards.length !== live.length) return false;
  for (const [i, c] of cards.entries()) {
    if (!c || typeof c !== 'object') return false;
    const { id, card } = c as Record<string, unknown>;
    if (id !== live[i] || !card || typeof card !== 'object') return false;
    const dealt = phoneCard(eventKey, id as string, round, code as string);
    const { suit, rank } = card as Record<string, unknown>;
    if (!dealt || suit !== dealt.suit || rank !== dealt.rank) return false;
  }
  const faces = (cards as { card: { suit: string; rank: number } }[]).map((c) => c.card as Parameters<typeof satisfies>[1]);
  return want.every((rule) => faces.filter((f) => satisfies(rule, f)).length === keep);
}

function isStoredEvent(v: unknown, version: typeof V1 | typeof VERSION): boolean {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const v2 = version === VERSION;
  if (s.v !== version || !isStr(s.eventKey)) return false;
  // Two shapes, never mixed: an admin-mode event's own hex key and ids, or (v2 only, since v1 predates QR
  // mode) a QR-mode event's 6-digit PIN and server join ids (ADR-0076 Identity).
  const qrMode = v2 && EVENT_PIN.test(s.eventKey);
  if (!qrMode && !LOCAL_KEY.test(s.eventKey)) return false;
  const idShape = qrMode ? SERVER_ID : LOCAL_ID;
  if (s.at !== 'ready' && s.at !== 'drawn' && s.at !== 'revealed') return false;
  const setup = s.setup as Record<string, unknown> | undefined;
  if (!setup || typeof setup !== 'object' || !isStr(setup.eventName)) return false;
  if (!isPlainArray(setup.people) || !isPlainArray(setup.schedule) || !isPlainArray(setup.prizes)) return false;
  const games = setup.games as GameChoices;
  if (v2 && !isGameChoices(games)) return false;
  const people = setup.people as unknown[];
  if (people.length < MIN_HEADS || people.length > MAX_HEADS) return false;
  const ids = new Set<string>();
  // Uniqueness by nameKey, the key setup refuses a second name on: two names that read the same on a
  // projector are one name, however they are spelled.
  const keys = new Set<string>();
  for (const p of people) {
    if (!p || typeof p !== 'object') return false;
    const { id, name } = p as Record<string, unknown>;
    if (!isStr(id) || !idShape.test(id) || ids.has(id) || !isCleanName(name) || keys.has(nameKey(name))) return false;
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
  if (v2 && games.rounds.some((g, i) => g === 'cards' && !cutsInHalf(schedule as number[], i + 1))) return false;
  const prizes = setup.prizes as unknown[];
  if (prizes.length < MIN_PRIZES || prizes.length > MAX_PRIZES || !prizes.every(isStr)) return false;
  if (!isPlainArray(s.rounds) || s.rounds.length > ELIMINATION_ROUNDS) return false;
  const eventKey = s.eventKey;
  let live = [...ids];
  for (const [i, r] of (s.rounds as unknown[]).entries()) {
    if (!r || typeof r !== 'object') return false;
    const rec = r as Record<string, unknown>;
    const { round, code, survivors } = rec;
    if (round !== i + 1 || !storedCode(code, i + 1, v2 && rec.game === 'cards' ? 'deal' : 'cut') || !isPlainArray(survivors)) return false;
    if (survivors.length !== (schedule[i + 1] as number)) return false;
    const liveSet = new Set(live);
    if (!survivors.every((id) => isStr(id) && liveSet.has(id)) || new Set(survivors).size !== survivors.length) return false;
    // Roster order, as drawNext writes it.
    const kept = new Set(survivors as string[]);
    if (live.filter((id) => kept.has(id)).join() !== (survivors as string[]).join()) return false;
    if (v2) {
      if (rec.game !== games.rounds[i]) return false;
      if (rec.game === 'cards') {
        if (rec.rule !== 0 && rec.rule !== 1) return false;
        if (!isDeal(eventKey, i + 1, code, rec.deal, live, schedule[i + 1] as number)) return false;
        const deal = rec.deal as Deal;
        const passes = deal.pair[rec.rule];
        const drawn = deal.cards.filter((c) => satisfies(passes, c.card)).map((c) => c.id);
        if (drawn.join() !== (survivors as string[]).join()) return false;
      }
    }
    live = survivors as string[];
  }
  const done = (s.rounds as unknown[]).length;
  if (s.final !== null) {
    if (done !== ELIMINATION_ROUNDS || s.at === 'ready') return false;
    const f = s.final as Record<string, unknown> | undefined;
    const order = f?.order;
    if (!isPlainArray(order) || order.length !== live.length) return false;
    if ([...order].sort().join() !== [...live].sort().join()) return false;
    if (v2) {
      if (f!.game !== games.final) return false;
      if (f!.game === 'ladder') {
        const { picks, permutation, slotRanks } = f!;
        if (!isPlainArray(picks) || !sameMembers(picks, live) || !isFiveLanes(permutation) || !isFiveLanes(slotRanks)) return false;
        if (!ladderConsistent({ order: order as string[], picks: picks as string[], permutation, slotRanks })) return false;
      }
    }
  } else if (s.at !== 'ready' && done === 0) {
    return false;
  }
  if (v2) {
    const prepared = s.prepared as Record<string, unknown> | null | undefined;
    if (prepared === undefined) return false;
    // A ready ladder final holds its slot layout (advance stores it), and nothing else holds one.
    const ladderReady = s.at === 'ready' && s.final === null && done === ELIMINATION_ROUNDS && games.final === 'ladder';
    if (ladderReady) {
      if (!prepared || typeof prepared !== 'object' || prepared.game !== 'ladder' || !isFiveLanes(prepared.slotRanks)) return false;
      // The picks so far: one entry per start lane, each empty or a finalist, no finalist twice.
      const picks = prepared.picks;
      if (!isPlainArray(picks) || picks.length !== FINAL_SIZE) return false;
      const finalists = new Set(live);
      const taken = picks.filter((id) => id !== null);
      return taken.every((id) => isStr(id) && finalists.has(id)) && new Set(taken).size === taken.length;
    }
    if (prepared !== null) {
      // Only on a ready card round, for that round, holding the deal its code gives the live roster.
      const round = done + 1;
      if (typeof prepared !== 'object' || s.at !== 'ready' || s.final !== null || done >= ELIMINATION_ROUNDS) return false;
      if (prepared.game !== 'cards' || prepared.round !== round || games.rounds[round - 1] !== 'cards') return false;
      if (!isDeal(eventKey, round, prepared.code, prepared.deal, live, schedule[round] as number)) return false;
    }
  }
  return true;
}
