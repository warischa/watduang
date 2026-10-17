// The one player-setup screen every party play route mounts (ADR-0071, gh#264). The board it is
// built from is design/PlayerSetup.dc.html; every class, string and state below maps to a frame there.
//
// TWO HALVES IN ONE FILE, deliberately. The top half is a pure state model -- no DOM, no storage --
// so player-screen.test.mjs can drive the rulings (clamp, over-max ticks, under-min, remove + undo,
// the ceiling) with node alone. The bottom half, mountPlayerScreen, is the only part that touches the
// page, and it reaches storage ONLY through src/shell/roster.ts: that module stays the single speller
// of the roster and group keys (scripts/roster-lock-structure-check.mjs).
//
// What the route keeps: WHEN the screen opens, what runs after onStart (its own non-player options,
// then play), and how to end a round it is asked to end. What this owns: everything about players.
//
// The underscore keeps this directory out of the play-route set every gate derives from the manifest:
// it is shared code under src/play/, not a route.
import { armAllButtons } from '../../games/_arm-gate.ts';
import { applyRosterOps, loadGroup, loadRoster, migrateLegacyList, saveGroup, type RosterOp } from '../../shell/roster.ts';
import { hasVisibleChar } from '../../tools/name-list.ts';
import { MASCOTS, resetCastNames } from '../_mascots.ts';

/** ADR-0071 ruling 7 (ADR-0054 ruling 5): the roster holds at most this many names, and a game
 *  declaring a maximum above it reds the build (scripts/player-screen-mount-check.mjs). It is also
 *  the length of the mascot cast, which is what makes "one mascot per seat" always satisfiable. */
export const ROSTER_CEILING = 20;

/** Ruling 2: the first-visit stepper starts here, then clamps into the game's range. */
export const FIRST_VISIT_COUNT = 4;

/** The undo bar's life after a remove (ruling 3, board frame 8). */
export const UNDO_MS = 4000;

/** The roster's own authoring cap -- the same maxlength the shell's add-a-name field uses. */
export const NAME_MAX = 24;

/** One per-game player list that predates the shared roster. `extract` reads the stored value the
 *  way its route read it. `keep` absent: the key held only players and is deleted once imported.
 *  `keep: 'settings'`: the key is a JSON object whose `players` field is the list and whose other
 *  fields are game settings the route still keeps there -- only `players` leaves (migrateLegacyList). */
export interface LegacyList {
  key: string;
  extract: (value: unknown) => string[];
  keep?: 'settings';
}

/** Per-game player lists that predate the shared roster (ADR-0071 "Data", widened by the owner
 *  2026-10-15). Only a CONVERTED route's key is listed: an unconverted route still reads its own key,
 *  and retiring it here would empty that game's list under it. */
export const LEGACY_LISTS: readonly LegacyList[] = [
  {
    key: 'watduang:timebomb-players',
    extract: extractTimebombList,
  },
  {
    key: 'watduang:dice-loser-players',
    extract: extractDiceLoserList,
  },
  {
    key: 'watduang:one-bomb-players',
    extract: extractOneBombList,
  },
  {
    key: 'freeze_tap_players',
    extract: extractFreezeTapList,
  },
  {
    key: 'ZERO_TRIGGER_DATA_V1',
    extract: extractZeroTriggerList,
    keep: 'settings',
  },
  {
    key: 'short-stick-pro-v2',
    extract: extractShortStickList,
    keep: 'settings',
  },
  {
    key: 'wire-panic-v1',
    extract: extractWirePanicList,
    keep: 'settings',
  },
];

/** The rule the four later imports share. Those routes saved their seats whether or not anyone typed
 *  -- a count change, a penalty pick, even the first paint wrote the mascot defaults -- so a list in
 *  which no seat holds a TYPED name (visible, and not that seat's own mascot default) is an untouched
 *  default, not a list the players kept: it imports nothing, and the device sees the first-visit
 *  stepper. Otherwise every seat imports in seat order, a blank or default seat as its mascot's name
 *  (ADR-0054 order), capped at the roster ceiling. All four routes' defaults are the shared cast's,
 *  in cast order. */
function typedSeatList(seats: readonly string[]): string[] {
  const shown = seats.slice(0, ROSTER_CEILING);
  if (!shown.some((s, i) => hasVisibleChar(s) && s !== MASCOTS[i].name)) return [];
  return shown.map((s, i) => (hasVisibleChar(s) ? s : MASCOTS[i].name));
}

/** A seat's name, whether the route stored a bare string or a `{ name }` object. */
const seatName = (seat: unknown): string => {
  const raw = typeof seat === 'string' ? seat : (seat as { name?: unknown } | null)?.name;
  return typeof raw === 'string' ? raw.trim() : '';
};

/** freeze-tap's `freeze_tap_players`: an array of `{ name, emoji, ... }`, one per seat it showed. That
 *  route loaded it only with 2 to 20 seats and an emoji on the first. */
export function extractFreezeTapList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) return [];
  if (!(value[0] as { emoji?: unknown } | null)?.emoji) return [];
  return typedSeatList(value.map(seatName));
}

/** The `players` field of a settings blob, loaded only with at least two seats -- all three routes'
 *  own load did the same -- and cut to `cap` seats where the route cut it. */
function blobPlayers(value: unknown, cap: number): string[] {
  const players = (value as { players?: unknown } | null)?.players;
  if (!Array.isArray(players) || players.length < 2) return [];
  return typedSeatList(players.slice(0, cap).map(seatName));
}

/** zero-trigger's `ZERO_TRIGGER_DATA_V1`: `{ players: [{ id, name, avatar, score }], penaltyMode }`. */
export function extractZeroTriggerList(value: unknown): string[] {
  return blobPlayers(value, ROSTER_CEILING);
}

/** short-stick's `short-stick-pro-v2`: `{ players: string[], stickCount, shortCount, penaltyMode,
 *  selectedPenalty }`. Its load kept the first 10 seats. */
export function extractShortStickList(value: unknown): string[] {
  return blobPlayers(value, 10);
}

/** wire-snip-panic's `wire-panic-v1`: `{ players: string[], penaltyMode, selectedPenalty }`. */
export function extractWirePanicList(value: unknown): string[] {
  return blobPlayers(value, ROSTER_CEILING);
}

/** The timebomb route's `{ count, names }` blob, read the way that route's own load() read it, so
 *  the import is what its players last saw and nothing they typed is lost (gh#264 REFUTE finding 1).
 *  It stored ALL twenty seats -- an untouched seat holding its mascot name -- plus the count it
 *  played, and a seat past the count kept its typed name for when the count came back up.
 *    1. Seats 0 .. count-1, in seat order. A blank seat played as its mascot, so it imports as that
 *       mascot's name (ADR-0054 order) rather than vanishing and shifting every later seat.
 *    2. Then every seat at or past the count that holds a TYPED name -- visible, and not that seat's
 *       own mascot default. Hidden, not deleted, on that route; deleting the key must not delete it.
 *  Capped at the roster ceiling. Two seats with the same name become ONE roster entry: the roster is
 *  keyed by name, which is inherent to it, not to this import.
 *  The numbers below are that route's own, as it read this key: a count clamped into its [2, 10]
 *  range, 6 when absent, and a seat name cut to the 12 characters its field allowed. */
export function extractTimebombList(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const { count, names } = value as { count?: unknown; names?: unknown };
  if (!Array.isArray(names)) return [];
  const seat = (i: number): string => {
    const raw = names[i];
    return typeof raw === 'string' ? raw.slice(0, 12).trim() : '';
  };
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.min(10, Math.max(2, Math.floor(count))) : 6;
  const shown = Array.from({ length: n }, (_, i) => (hasVisibleChar(seat(i)) ? seat(i) : MASCOTS[i].name));
  const hidden: string[] = [];
  for (let i = n; i < Math.min(names.length, MASCOTS.length); i += 1) {
    const typed = seat(i);
    if (hasVisibleChar(typed) && typed !== MASCOTS[i].name) hidden.push(typed);
  }
  return [...shown, ...hidden].slice(0, ROSTER_CEILING);
}

/** The dice-loser route's `{ count, names }` blob, read the way that route's own load() read it --
 *  the same two steps as extractTimebombList above, with that route's own numbers: it stored one
 *  seat per player up to its maximum (an untouched seat holding its mascot name), a count clamped
 *  into its [2, 10] range and 3 when absent, and a seat name cut to the 12 characters its field
 *  allowed. Its default seat name was the mascot cast's, in cast order, as here. */
export function extractDiceLoserList(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const { count, names } = value as { count?: unknown; names?: unknown };
  if (!Array.isArray(names)) return [];
  const seat = (i: number): string => {
    const raw = names[i];
    return typeof raw === 'string' ? raw.slice(0, 12).trim() : '';
  };
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.min(10, Math.max(2, Math.floor(count))) : 3;
  const shown = Array.from({ length: n }, (_, i) => (hasVisibleChar(seat(i)) ? seat(i) : MASCOTS[i].name));
  const hidden: string[] = [];
  for (let i = n; i < Math.min(names.length, MASCOTS.length); i += 1) {
    const typed = seat(i);
    if (hasVisibleChar(typed) && typed !== MASCOTS[i].name) hidden.push(typed);
  }
  return [...shown, ...hidden].slice(0, ROSTER_CEILING);
}

/** The one-bomb route's `{ names }` blob, read the way that route's own load() read it. It stored
 *  ten seats -- an untouched seat holding its mascot's name -- and NO count: that route read the
 *  count off its engine's stepper, which opened at 2 on every visit. So the seats it showed are not
 *  recorded, and what is imported is the shortest run of seats that shows every typed name, never
 *  fewer than the 2 it opened on:
 *    1. A typed seat is visible and not that seat's own mascot default. None typed -> nothing is
 *       imported, and the device sees the first-visit stepper as if the list had never been kept.
 *    2. Seats 0 .. (last typed seat, at least 1), in seat order. An untouched seat in that run
 *       imports as its mascot's name (ADR-0054 order) rather than vanishing and shifting every later
 *       seat off its animal -- the same rule as the timebomb import above.
 *  The numbers below are that route's own, as it read this key: ten seats, its [2, 10] range, and a
 *  seat name cut to the 12 characters its field allowed. The default compare uses the full mascot
 *  name, which is safe only while the first ten names fit in 12 characters (all do, 4 to 9). */
export function extractOneBombList(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const { names } = value as { names?: unknown };
  if (!Array.isArray(names)) return [];
  const seat = (i: number): string => {
    const raw = names[i];
    return typeof raw === 'string' ? raw.slice(0, 12).trim() : '';
  };
  const typed = (i: number): boolean => hasVisibleChar(seat(i)) && seat(i) !== MASCOTS[i].name;
  let last = -1;
  for (let i = 0; i < Math.min(names.length, 10); i += 1) if (typed(i)) last = i;
  if (last < 0) return [];
  return Array.from({ length: Math.max(last + 1, 2) }, (_, i) => (typed(i) ? seat(i) : MASCOTS[i].name));
}

// ---- pure state ---------------------------------------------------------------------------------

export type Range = readonly [number, number];

export interface Row {
  /** What the name field holds. Blank is legal: the row plays as its mascot (ADR-0054 ruling 3). */
  name: string;
  /** Index into MASCOTS. Fixed for the life of the screen, so a remove never repaints a neighbour. */
  mascot: number;
  ticked: boolean;
  /** The roster name this row opened with, or null for a row added on this screen. The write at
   *  start is a set of edits keyed by it (applyRosterOps), never a snapshot of the whole list. */
  origin: string | null;
}

export interface ScreenState {
  /** 'first' = empty roster: stepper, no tick, no remove. 'saved' = pre-filled rows. */
  mode: 'first' | 'saved';
  min: number;
  max: number;
  /** First visit only: how many seats the stepper shows. */
  count: number;
  /** First visit: one row per mascot, the first `count` shown. Saved: the roster, in its order. */
  rows: Row[];
  /** The last removal, kept for the undo bar. One at a time: a second removal replaces it. */
  undo: { row: Row; index: number } | null;
  /** 'full': a start was refused because the roster reached the ceiling elsewhere (board frame 10). */
  notice: 'full' | null;
}

export interface Player {
  name: string;
  emoji: string;
  /** Index into MASCOTS -- the identity a route paints. */
  mascot: number;
}

/** The game's own range, checked against the ceiling. A route declaring more than the roster can
 *  hold is a build-time red elsewhere; this refuses it at run time too rather than seating ghosts. */
export function checkRange(range: Range): { min: number; max: number } {
  const [min, max] = range;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > ROSTER_CEILING) {
    throw new RangeError(`player screen: range [${String(min)}, ${String(max)}] is not inside [1, ${ROSTER_CEILING}]`);
  }
  return { min, max };
}

export function clampCount(n: number, range: Range): number {
  const { min, max } = checkRange(range);
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** The name a row plays under: what was typed, or its mascot's name when nothing visible was. */
export function displayName(row: Row): string {
  const typed = row.name.trim();
  return hasVisibleChar(typed) ? typed : MASCOTS[row.mascot % MASCOTS.length].name;
}

export function tickedCount(state: ScreenState): number {
  return state.rows.filter((r) => r.ticked).length;
}

/** Builds the screen from what storage holds. `roster` empty = first visit (ruling 2). Otherwise the
 *  saved group decides who starts ticked -- sitting out survives to the next game -- and when the
 *  roster is above the game's maximum only the first `max` of those start ticked (ruling 4). With no
 *  saved group, every name is a candidate. Nobody is dropped: an unticked name keeps its row. */
export function initialState(roster: readonly string[], group: readonly string[], range: Range): ScreenState {
  const { min, max } = checkRange(range);
  if (roster.length === 0) {
    return {
      mode: 'first',
      min,
      max,
      count: clampCount(FIRST_VISIT_COUNT, range),
      rows: MASCOTS.map((m, i) => ({ name: m.name, mascot: i, ticked: true, origin: null })),
      undo: null,
      notice: null,
    };
  }
  const names = roster.slice(0, ROSTER_CEILING);
  const wanted = group.length > 0 ? new Set(group) : null;
  let seats = 0;
  const rows = names.map((name, i) => {
    const candidate = wanted ? wanted.has(name) : true;
    const ticked = candidate && seats < max;
    if (ticked) seats += 1;
    return { name, mascot: i, ticked, origin: name };
  });
  return { mode: 'saved', min, max, count: 0, rows, undo: null, notice: null };
}

export function setCount(state: ScreenState, n: number): ScreenState {
  if (state.mode !== 'first') return state;
  return { ...state, count: clampCount(n, [state.min, state.max]) };
}

/** Ticking past the maximum is refused until another is unticked (board frame 3). */
export function toggleTick(state: ScreenState, index: number): ScreenState {
  const row = state.rows[index];
  if (state.mode !== 'saved' || !row) return state;
  if (!row.ticked && tickedCount(state) >= state.max) return state;
  const rows = state.rows.map((r, i) => (i === index ? { ...r, ticked: !r.ticked } : r));
  return { ...state, rows };
}

export function setName(state: ScreenState, index: number, name: string): ScreenState {
  if (!state.rows[index]) return state;
  const rows = state.rows.map((r, i) => (i === index ? { ...r, name: name.slice(0, NAME_MAX) } : r));
  return { ...state, rows };
}

/** Ruling 3: an x removes at once, and the row is kept for one undo. */
export function removeRow(state: ScreenState, index: number): ScreenState {
  const row = state.rows[index];
  if (state.mode !== 'saved' || !row) return state;
  const rows = state.rows.filter((_, i) => i !== index);
  return { ...state, rows, undo: { row, index } };
}

/** Puts the last removed row back in its own seat. Its tick comes back only if a seat is free. */
export function undoRemove(state: ScreenState): ScreenState {
  const { undo } = state;
  if (!undo || state.rows.length >= ROSTER_CEILING) return { ...state, undo: null };
  const ticked = undo.row.ticked && tickedCount(state) < state.max;
  const rows = [...state.rows];
  rows.splice(Math.min(undo.index, rows.length), 0, { ...undo.row, ticked });
  return { ...state, rows, undo: null };
}

export function dropUndo(state: ScreenState): ScreenState {
  return state.undo ? { ...state, undo: null } : state;
}

export function canAdd(state: ScreenState): boolean {
  return state.mode === 'saved' && state.rows.length < ROSTER_CEILING;
}

/** The add row: the lowest mascot no row is wearing, its name pre-filled, ticked if a seat is free. */
export function addRow(state: ScreenState): ScreenState {
  if (!canAdd(state)) return state;
  const worn = new Set(state.rows.map((r) => r.mascot));
  let mascot = 0;
  while (worn.has(mascot)) mascot += 1;
  const ticked = tickedCount(state) < state.max;
  const rows = [...state.rows, { name: MASCOTS[mascot].name, mascot, ticked, origin: null }];
  return { ...state, rows };
}

/** gh#177's wipe, first visit only: every seat back to its mascot name, the count untouched. */
export function resetNames(state: ScreenState): ScreenState {
  if (state.mode !== 'first') return state;
  const names = resetCastNames(state.rows);
  return { ...state, rows: state.rows.map((r, i) => ({ ...r, name: names[i] })) };
}

/** The rows on screen: the seats the stepper shows on a first visit, every row on a saved roster. */
function shownRows(state: ScreenState): Row[] {
  return state.mode === 'first' ? state.rows.slice(0, state.count) : state.rows;
}

/** The rows that play this round, in screen order. */
function seatedRows(state: ScreenState): Row[] {
  return state.mode === 'first' ? shownRows(state) : state.rows.filter((r) => r.ticked);
}

/** Who plays this round, in screen order (ruling 5). What onStart receives is committedPlayers below:
 *  the same set, in the order storage committed. */
export function playersOf(state: ScreenState): Player[] {
  return seatedRows(state).map((r) => ({ name: displayName(r), emoji: MASCOTS[r.mascot].emoji, mascot: r.mascot }));
}

/** Board frame 9 (owner ruling 2026-10-15): the indices of shown rows whose name -- trimmed, a blank
 *  read as its mascot -- another shown row also shows. The roster holds each name once, so letting
 *  such a pair through would merge two players into one; start stays off until one is changed. Every
 *  shown row counts, ticked or not -- a row sitting out is still written to the roster -- and on a
 *  first visit too, where a seat typed as the next seat's mascot is the same merge. */
export function duplicateRows(state: ScreenState): number[] {
  const shown = shownRows(state).map(displayName);
  return shown.flatMap((n, i) => (shown.indexOf(n) !== i || shown.lastIndexOf(n) !== i ? [i] : []));
}

/** The players onStart receives, derived from the COMMITTED roster (gh#264 REFUTE round 3): the
 *  seated rows' names in the order storage now holds them, so turn order is roster order (ruling 5)
 *  even when another tab moved a seat while this screen was open. Each player keeps the mascot its
 *  row wore on screen. Null when a seated name is not in the committed roster -- another tab removed
 *  a seat this screen never touched -- so the round is never seated short of what the players saw. */
export function committedPlayers(state: ScreenState, roster: readonly string[]): Player[] | null {
  const seated = new Map(seatedRows(state).map((r) => [displayName(r), r] as const));
  const players = roster
    .filter((n) => seated.has(n))
    .map((n) => {
      const mascot = (seated.get(n) as Row).mascot;
      return { name: n, emoji: MASCOTS[mascot].emoji, mascot };
    });
  return players.length === seated.size ? players : null;
}

/** A start refused for a collision re-reads the roster but keeps this screen's work, so the players
 *  see board frame 9 for the colliding rows rather than losing what they typed:
 *    - each stored name is a row, in stored order; a row this screen renamed keeps its new name and
 *      its tick, keyed by the name it opened with;
 *    - a row this screen added, or renamed from a name another tab has since removed, is still on the
 *      screen, so it follows as an add;
 *    - a row this screen left untouched whose name another tab removed is gone -- a screen that did
 *      not touch a name does not bring it back (applyRosterOps' rule);
 *    - the removal the undo bar was holding stays pending: nothing was written.
 *  Ticks past the game's maximum are dropped in order, as initialState does. */
export function rebase(state: ScreenState, roster: readonly string[], group: readonly string[]): ScreenState {
  const fresh = initialState(roster, group, [state.min, state.max]);
  if (fresh.mode === 'first') return { ...state, notice: null };
  const removed = state.undo?.row.origin ?? null;
  const shown = shownRows(state);
  const mine = new Map(shown.filter((r) => r.origin !== null).map((r) => [r.origin as string, r] as const));
  const rows: Row[] = fresh.rows
    .filter((r) => r.origin !== removed)
    .map((r) => {
      const own = mine.get(r.origin as string);
      return own ? { ...r, name: own.name, ticked: own.ticked } : r;
    });
  const stored = new Set(roster);
  let notice: ScreenState['notice'] = null;
  for (const r of shown) {
    if (r.origin !== null && stored.has(r.origin)) continue;
    if (r.origin !== null && displayName(r) === r.origin) continue; // untouched, removed elsewhere
    // An add the ceiling could never take: the roster filled elsewhere, and board frame 10 says so.
    if (rows.length >= ROSTER_CEILING) {
      notice = 'full';
      break;
    }
    // Keeps its own mascot unless a stored row now wears it; then the lowest free one, as addRow.
    const worn = new Set(rows.map((x) => x.mascot));
    let mascot = r.mascot;
    if (worn.has(mascot)) {
      mascot = 0;
      while (worn.has(mascot)) mascot += 1;
    }
    rows.push({ ...r, mascot, origin: null });
  }
  let seats = 0;
  for (const r of rows) {
    if (r.ticked && seats < state.max) seats += 1;
    else r.ticked = false;
  }
  const undo = removed !== null && stored.has(removed) ? state.undo : null;
  return { mode: 'saved', min: state.min, max: state.max, count: 0, rows, undo, notice };
}

/** The roster as this screen leaves it. A first visit writes the seats it played, blanks as their
 *  mascot name -- the board's saved frames show exactly such a roster (a mascot name in a saved row). */
export function rosterOf(state: ScreenState): string[] {
  const rows = state.mode === 'first' ? state.rows.slice(0, state.count) : state.rows;
  return rows.map(displayName);
}

/** The roster write this screen owes, as EDITS (applyRosterOps), never as a snapshot: each row that
 *  opened with a roster name and now shows another is a rename keyed by the name it opened with; a
 *  row added here is an add; the removal the undo bar still holds is a remove. A row left untouched
 *  writes nothing, which is what keeps a screen that opened before another tab's edit from undoing
 *  it (gh#264 REFUTE finding 4). Removals already committed (the bar expired or was replaced) were
 *  written when they were committed. A first visit has no roster rows, so every seat is an add. */
export function opsOf(state: ScreenState): RosterOp[] {
  const ops: RosterOp[] = [];
  if (state.undo?.row.origin) ops.push({ op: 'remove', name: state.undo.row.origin });
  const rows = state.mode === 'first' ? state.rows.slice(0, state.count) : state.rows;
  for (const row of rows) {
    const name = displayName(row);
    if (row.origin === null) ops.push({ op: 'add', name });
    else if (name !== row.origin) ops.push({ op: 'rename', from: row.origin, to: name });
  }
  return ops;
}

export function canStart(state: ScreenState): boolean {
  const n = state.mode === 'first' ? state.count : tickedCount(state);
  return n >= state.min && n <= state.max && duplicateRows(state).length === 0;
}

/** Which limit line the screen shows. A duplicate name wins (frame 9): it blocks start and names the
 *  one fix. Then a start refused at the ceiling (frame 10), while the roster is still full. Then
 *  under-minimum: it is the reason start is off. A first visit shows only the duplicate line. */
export function limitLine(state: ScreenState): { kind: 'dup' | 'full' | 'under' | 'over' | 'count'; n: number } {
  const ticked = tickedCount(state);
  if (duplicateRows(state).length > 0) return { kind: 'dup', n: 0 };
  if (state.notice === 'full' && state.rows.length >= ROSTER_CEILING) return { kind: 'full', n: ROSTER_CEILING };
  if (ticked < state.min) return { kind: 'under', n: state.min };
  if (state.rows.length > state.max) return { kind: 'over', n: ticked };
  return { kind: 'count', n: ticked };
}

// ---- the page -----------------------------------------------------------------------------------

/** Board copy, byte-exact. player-screen.test.mjs checks every one of these against the board file,
 *  so a retyped string reds there rather than shipping. */
export const COPY = {
  countUnit: ' คน',
  countLead: 'เล่นรอบนี้ ',
  overLead: 'เกมนี้เล่นได้สูงสุด ',
  overMid: ' คน · เลือกแล้ว ',
  underLead: 'เลือกอย่างน้อย ',
  sitOut: 'นั่งพัก',
  undoLead: 'เอา ',
  undoTail: ' ออกจากวงแล้ว',
  tickLabel: 'เล่นรอบนี้',
  removeLabel: 'เอาออกจากวง',
  // Frames 9 and 10 (owner rulings 2026-10-15; sentences agent-authored, on the board's copy table).
  dupLine: 'มีชื่อซ้ำกัน — แก้ชื่อให้ไม่ซ้ำก่อนเริ่ม',
  fullLead: 'วงเต็ม ',
  fullTail: ' คนแล้ว — ตรวจรายชื่อแล้วกดเริ่มอีกครั้ง',
  // Not on the board: the first-visit field label stays timebomb's positional one (gh#177).
  seatLabel: 'ชื่อผู้เล่นคนที่ ',
} as const;

export interface MountOptions {
  /** Where the screen renders. Anything already inside stays first (the host's tagline slot). */
  root: HTMLElement;
  /** The game's manifest `players` tuple. */
  range: Range;
  /** Pressed start: the ticked players, in roster order. The screen has already closed itself. A
   *  route may return a promise; the handover is acknowledged (HANDOVER_ATTR) once it resolves. */
  onStart: (players: Player[]) => void | Promise<unknown>;
  /** Is a round in progress right now? Decides whether the edit control asks first (ruling 6). */
  roundActive: () => boolean;
  /** End the round in progress. Called only after the players confirmed it. */
  abortRound: () => void;
  /** Called every time the screen opens, whoever opened it -- the route hides its own surfaces here.
   *  The contract's one addition: the edit control can open this screen while the route is showing
   *  something that is not a round (a result screen), and only the route knows how to put that away. */
  onOpen?: () => void;
}

export interface PlayerScreen {
  /** Settles when the screen is open; rejects when it could not open (gh#264 REFUTE round 2), so a
   *  route that holds its own screen for this one can put it back. A caller that ignores it leaves the
   *  failure an unhandled rejection, as every open was before. */
  open(): Promise<void>;
  close(): void;
  /** Re-arms the surface the screen sits on through the screen's OWN gate -- for a route's modal
   *  closed over the open screen (ADR-0057). A route gate over this root cannot do it: its window
   *  closing hands start back whatever the screen holds, and inside that window every keystroke's
   *  re-render enables start early; only this gate holds start and re-validates it when it arms. */
  arm(): void;
}

/** The chrome's edit control (PlayExit.astro) reads these two names to tell a converted route from an
 *  unconverted one: the attribute on <html> says "a shared screen is mounted, and whether it is open",
 *  and the events carry the request and the changes. No import either way, so the twelve routes that
 *  have not mounted this screen keep PlayExit's reload path untouched. */
export const SCREEN_ATTR = 'data-player-screen';
/** Present on <html> while an open() is in flight (gh#264). open() first waits for the legacy-list
 *  migration, which takes the roster lock, and on a slow device that gap lasts seconds with neither
 *  this screen nor the route behind it showing -- a reader that has to tell that gap from a settled
 *  page (the fit probe's fresh read) waits for this to go. Its own name, never a third SCREEN_ATTR
 *  value: the chrome and a route stylesheet read SCREEN_ATTR's two values as they are.
 *  Readers test presence only. The VALUE is the number of opens in flight across every screen on the
 *  page, because the marker is the page's and not one mount's: two screens migrate independently, and
 *  the first to land must not clear the other's (gh#264 REFUTE round 1). */
export const PENDING_ATTR = 'data-player-screen-pending';

/** Counts an open in (+1) or out (-1) on the page's marker; the attribute goes when the count does. */
function countPendingOpen(delta: 1 | -1): void {
  const html = document.documentElement;
  const n = Math.max(0, (Number(html.getAttribute(PENDING_ATTR)) || 0) + delta);
  if (n > 0) html.setAttribute(PENDING_ATTR, String(n));
  else html.removeAttribute(PENDING_ATTR);
}
export const STATE_EVENT = 'watduang:player-screen';
export const EDIT_EVENT = 'watduang:edit-players';

// ---- the render hold (gh#272) -------------------------------------------------------------------
//
// A WebGL route that keeps drawing behind this screen starves the roster lock's grant on a slow
// device: the migration at mount and every save wait seconds for their callback. So this screen
// HOLDS rendering, and every WebGL route stops drawing while it is held (owner ruling 2026-10-17: a
// frozen background is acceptable). STATE_EVENT is no substitute: the migration starts during the
// mount, well before the first announce, and the hold has to be up before that.
//
// One holder per mount, never a page-wide count: a mount releases only its own entry, so one screen
// handing over cannot end another screen's hold, and each mount's own counters (mountPlayerScreen)
// keep an older open that lands late from releasing a newer one.

/** gh#272: the hold, observable on <html> -- 'held' or 'free', written on every change, from the same
 *  value isRenderHeld() returns. A probe in the page counts draws while it reads 'held'; absent means
 *  no screen has ever held, which is not the same as 'free'. */
export const RENDER_HOLD_ATTR = 'data-render-hold';

/** gh#272: written only after a route's onStart has RETURNED -- and its promise resolved, if it gave
 *  one -- so "the screen closed" and "the route took the players" cannot be confused. The value counts
 *  the page's acknowledged handovers, so a reader can tell a new one from the last. A throwing onStart
 *  leaves it untouched. */
export const HANDOVER_ATTR = 'data-player-screen-handover';

const renderHolders = new Set<object>();
const renderListeners = new Set<(held: boolean) => void>();
let renderHeld = false;

/** Is rendering held right now? The current state, for a route that subscribes after a hold began. */
export function isRenderHeld(): boolean {
  return renderHeld;
}

/** Calls `listener` on every CHANGE of the hold, with the new value, never with a repeat. Returns the
 *  unsubscribe. Not called with the current state: read isRenderHeld() for that. */
export function onRenderHold(listener: (held: boolean) => void): () => void {
  renderListeners.add(listener);
  return () => {
    renderListeners.delete(listener);
  };
}

function setRenderHold(holder: object, on: boolean): void {
  if (on) renderHolders.add(holder);
  else renderHolders.delete(holder);
  const held = renderHolders.size > 0;
  if (held === renderHeld) return;
  renderHeld = held;
  document.documentElement.setAttribute(RENDER_HOLD_ATTR, held ? 'held' : 'free');
  for (const listener of [...renderListeners]) {
    // A listener that changed the hold itself has already told everyone the newer value.
    if (renderHeld !== held) return;
    // A failing listener must not stop the others, nor the close it runs inside -- that close is
    // followed by the handover. Rethrown on its own job, so it stays loud.
    try {
      listener(held);
    } catch (err) {
      queueMicrotask(() => {
        throw err;
      });
    }
  }
}

/** The game root the dialogs and the undo bar cover: the same id set the shared chrome probes use. */
function surfaceOf(root: HTMLElement): HTMLElement {
  return root.closest<HTMLElement>('#app, #app-container, #appRoot') ?? document.body;
}

export function mountPlayerScreen(options: MountOptions): PlayerScreen {
  const { root, range, onStart, roundActive, abortRound, onOpen } = options;
  checkRange(range);

  const template = document.getElementById('ps-template') as HTMLTemplateElement | null;
  const editDialog = document.getElementById('ps-edit-dialog') as HTMLDialogElement | null;
  const resetDialog = document.getElementById('ps-reset-dialog') as HTMLDialogElement | null;
  if (!template || !editDialog || !resetDialog) {
    throw new Error('player screen: PlayerScreen.astro is not on this page -- the route renders it beside its markup');
  }
  root.classList.add('ps');
  root.append(template.content.cloneNode(true));

  const q = <T extends HTMLElement>(name: string): T => {
    const el = root.querySelector<T>(`[data-ps="${name}"]`);
    if (!el) throw new Error(`player screen: template part "${name}" is missing`);
    return el;
  };
  const countRow = q('count');
  const countNum = q('count-num');
  const dec = q<HTMLButtonElement>('dec');
  const inc = q<HTMLButtonElement>('inc');
  const limit = q('limit');
  const list = q('list');
  const add = q<HTMLButtonElement>('add');
  const reset = q<HTMLButtonElement>('reset');
  const start = q<HTMLButtonElement>('start');
  const toast = q('toast');
  const toastText = q('toast-text');
  const undo = q<HTMLButtonElement>('undo');
  const byId = (id: string): HTMLButtonElement => {
    const el = document.getElementById(id) as HTMLButtonElement | null;
    if (!el) throw new Error(`player screen: #${id} is missing`);
    return el;
  };
  const editCancel = byId('ps-edit-cancel');
  const editConfirm = byId('ps-edit-confirm');
  const resetCancel = byId('ps-reset-cancel');
  const resetConfirm = byId('ps-reset-confirm');

  let state: ScreenState = initialState([], [], range);
  let isOpen = false;
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  // gh#272: what holds rendering on this mount. Counters, not flags: two opens in flight, or a
  // removal written while a start save is still waiting, each release only their own count.
  const renderHolder = {};
  let migrating = 0;
  let opening = 0;
  let saving = 0;
  const syncRenderHold = (): void => {
    setRenderHold(renderHolder, migrating > 0 || opening > 0 || isOpen || saving > 0);
  };

  /** Every roster write this screen starts. Holds rendering until the write settles, whichever way. */
  const writeRoster = (ops: RosterOp[]): ReturnType<typeof applyRosterOps> => {
    saving += 1;
    syncRenderHold();
    const run = applyRosterOps(ops, ROSTER_CEILING);
    const settled = (): void => {
      saving -= 1;
      syncRenderHold();
    };
    run.then(settled, settled);
    return run;
  };

  // Every legacy import runs once per mount; open() waits for them, or a timebomb-only device would
  // see the first-visit stepper on the very visit that imports its list.
  // Once per mount while it SUCCEEDS: a run that rejected is not kept, or every later open would
  // chain on the same rejection and the screen could never open on this page (gh#264 REFUTE round
  // 2). The next open runs it again; each import is safe to re-run (withLock's own contract).
  let migrationFailed = false;
  const migrate = (): Promise<unknown> => {
    // Held BEFORE the first import asks for the lock (gh#272).
    migrating += 1;
    syncRenderHold();
    const run = Promise.all(LEGACY_LISTS.map(({ key, extract, keep }) => migrateLegacyList(key, extract, keep)));
    const settled = (): void => {
      migrating -= 1;
      syncRenderHold();
    };
    // Records the failure only; the open chained on `run` still rejects and stays loud.
    run.then(settled, () => {
      migrationFailed = true;
      settled();
    });
    return run;
  };
  let migrated = migrate();

  /** The two steppers are tapped repeatedly on purpose, so no gate collects them (the premise
   *  ARM_DELAY_MS's comment says to check per control). Their `disabled` is this file's to own. */
  const steppers = (): HTMLButtonElement[] => [dec, inc];

  /** ADR-0057: every reveal, close, cancel and confirm arms the whole region it uncovers. The
   *  surface, not just this root: a dialog or the undo bar covered the route's header as well.
   *
   *  One surface gate at a time: a new one cancels the last, or the older window's timer would hand
   *  the controls back while the newer window is still open. While a window is open `surfaceHeld`
   *  keeps syncControls from enabling start or add -- a stepper tap (never gated) re-renders inside
   *  the window, and without it that render would hand start back early. The onArm hook clears it and
   *  re-asserts this file's own state, which a tap may have changed during the window. */
  let cancelSurfaceGate: (() => void) | undefined;
  let surfaceHeld = false;
  const armSurface = (): void => {
    cancelSurfaceGate?.();
    surfaceHeld = true;
    cancelSurfaceGate = armAllButtons(surfaceOf(root), steppers(), () => {
      surfaceHeld = false;
      syncControls();
    });
  };

  const announce = (open: boolean): void => {
    document.documentElement.setAttribute(SCREEN_ATTR, open ? 'open' : 'closed');
    document.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: { open } }));
  };

  function syncControls(): void {
    start.disabled = surfaceHeld || !canStart(state);
    add.disabled = surfaceHeld || !canAdd(state);
    dec.disabled = state.mode !== 'first' || state.count <= state.min;
    inc.disabled = state.mode !== 'first' || state.count >= state.max;
  }

  function renderLimit(): void {
    const line = limitLine(state);
    // A first visit has no limit line of its own; it shows only frame 9's.
    limit.hidden = state.mode === 'first' && line.kind !== 'dup';
    const b = document.createElement('b');
    b.textContent = String(line.n);
    if (line.kind === 'dup') limit.replaceChildren(COPY.dupLine);
    else if (line.kind === 'full') limit.replaceChildren(`${COPY.fullLead}${ROSTER_CEILING}${COPY.fullTail}`);
    else if (line.kind === 'under') limit.replaceChildren(COPY.underLead, b, COPY.countUnit);
    else if (line.kind === 'over') limit.replaceChildren(`${COPY.overLead}${state.max}${COPY.overMid}`, b);
    else limit.replaceChildren(COPY.countLead, b, COPY.countUnit);
  }

  /** The row's two controls are named after the player; a rename re-names them in place. */
  function nameControls(tick: HTMLElement, rm: HTMLElement, who: string): void {
    tick.setAttribute('aria-label', `${COPY.tickLabel} ${who}`);
    rm.setAttribute('aria-label', `${COPY.removeLabel} ${who}`);
  }

  function nameField(row: Row, index: number, controls?: [HTMLElement, HTMLElement]): HTMLInputElement {
    // A native field is the rename affordance: focus, caret and keyboard for free, and maxLength as
    // an ATTRIBUTE so a paste is clamped too. Written through .value, never markup, so a name is
    // never parsed as HTML (ADR-0026's sink rule).
    const input = document.createElement('input');
    input.className = 'ps-n';
    input.type = 'text';
    input.value = row.name;
    input.maxLength = NAME_MAX;
    input.placeholder = MASCOTS[row.mascot].name;
    // Positional on purpose, in both modes (gh#177): it answers "which row am I in" and never drifts
    // from the value the way a label sourced from the name would.
    input.setAttribute('aria-label', `${COPY.seatLabel}${index + 1}`);
    input.addEventListener('input', () => {
      state = setName(state, index, input.value);
      const now = state.rows[index];
      if (controls && now) nameControls(controls[0], controls[1], displayName(now));
      // Frame 9 follows the typing: marks, line and start change in place, never by a rebuild,
      // which would take the field out from under the caret.
      markDuplicates();
      renderLimit();
      syncControls();
    });
    return input;
  }

  /** Board frame 9's accent edge on every row whose name another row also shows. */
  function markDuplicates(): void {
    const dup = new Set(duplicateRows(state));
    list.querySelectorAll<HTMLLIElement>('.ps-p').forEach((li, i) => li.classList.toggle('ps-dup', dup.has(i)));
  }

  function renderRows(): void {
    const first = state.mode === 'first';
    countRow.hidden = !first;
    reset.hidden = !first;
    add.hidden = first;
    countNum.textContent = String(state.count);
    const rows: HTMLLIElement[] = [];
    const shown = first ? state.rows.slice(0, state.count) : state.rows;
    shown.forEach((row, index) => {
      const li = document.createElement('li');
      li.className = first ? 'ps-p' : `ps-p ps-saved${row.ticked ? '' : ' ps-out'}`;
      const badge = document.createElement('span');
      badge.className = 'ps-e';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = MASCOTS[row.mascot].emoji;
      if (first) {
        li.append(badge, nameField(row, index));
      } else {
        const tick = document.createElement('button');
        tick.type = 'button';
        tick.className = 'ps-tick';
        tick.setAttribute('aria-pressed', String(row.ticked));
        const box = document.createElement('i');
        box.textContent = row.ticked ? '✓' : '';
        tick.append(box);
        tick.addEventListener('click', () => {
          state = toggleTick(state, index);
          render();
          // The rebuild put a NEW tick under the finger that just tapped the old one: a second
          // contact 100ms later would toggle it straight back (gh#264 REFUTE finding 6).
          armSurface();
        });
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'ps-rm';
        rm.textContent = '✕';
        rm.addEventListener('click', () => removeAt(index));
        nameControls(tick, rm, displayName(row));
        li.append(tick, badge, nameField(row, index, [tick, rm]));
        if (!row.ticked) {
          const sit = document.createElement('span');
          sit.className = 'ps-sit';
          sit.textContent = COPY.sitOut;
          li.append(sit);
        }
        li.append(rm);
      }
      rows.push(li);
    });
    list.replaceChildren(...rows);
    markDuplicates();
  }

  function render(): void {
    renderRows();
    renderLimit();
    syncControls();
  }

  function hideToast(): void {
    clearTimeout(undoTimer);
    undoTimer = undefined;
    toast.hidden = true;
    root.classList.remove('ps-toasting');
  }

  /** Ruling 3: the x removes the name from the ROSTER, not just from this screen. It is written
   *  when the undo bar's chance is spent -- the bar expires, a second x replaces it, the screen
   *  closes, or the page is put away -- and an undo inside the four seconds writes nothing at all.
   *  A row added on this screen has no roster name yet, so removing it writes nothing either. */
  function commitRemoval(): void {
    const pending = state.undo;
    state = dropUndo(state);
    if (pending?.row.origin) void writeRoster([{ op: 'remove', name: pending.row.origin }]);
  }

  function removeAt(index: number): void {
    const gone = state.rows[index];
    if (!gone) return;
    // One bar at a time: the removal it was holding is final the moment another one replaces it.
    commitRemoval();
    state = removeRow(state, index);
    render();
    toastText.textContent = `${COPY.undoLead}${displayName(gone)}${COPY.undoTail}`;
    toast.hidden = false;
    root.classList.add('ps-toasting');
    clearTimeout(undoTimer);
    // The bar leaving is a reveal like any close (ADR-0057): the start button sits under it.
    undoTimer = setTimeout(() => {
      commitRemoval();
      hideToast();
      armSurface();
    }, UNDO_MS);
    // The rows below the removed one moved up under the finger, and the bar appeared: arm both.
    armSurface();
  }

  undo.addEventListener('click', () => {
    state = undoRemove(state);
    hideToast();
    render();
    armSurface();
  });

  dec.addEventListener('click', () => {
    state = setCount(state, state.count - 1);
    render();
  });
  inc.addEventListener('click', () => {
    state = setCount(state, state.count + 1);
    render();
  });
  add.addEventListener('click', () => {
    state = addRow(state);
    render();
    const fields = list.querySelectorAll<HTMLInputElement>('.ps-n');
    fields[fields.length - 1]?.focus();
    // The new row's tick and x appeared under the add row's old place: same rebuild, same arm.
    armSurface();
  });

  // gh#177's confirm, kept: the wipe takes every typed name and they do not come back.
  const closeReset = (): void => {
    if (resetDialog.open) resetDialog.close();
    armSurface();
  };
  reset.addEventListener('click', () => {
    resetDialog.showModal();
    armAllButtons(resetDialog);
  });
  resetCancel.addEventListener('click', closeReset);
  resetDialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    closeReset();
  });
  // A dialog can also close with no cancel event to take over -- the browser's close watcher stops
  // honouring a repeated preventDefault without user activation. Whatever closed it, the close is a
  // reveal (ADR-0057), so the close event arms too; the closer is safe to run twice.
  resetDialog.addEventListener('close', closeReset);
  resetConfirm.addEventListener('click', () => {
    // Rebuild first, close (and arm) last: the arm must be the final word on what is live.
    state = resetNames(state);
    render();
    closeReset();
  });

  /** Reads storage into the screen: the roster, the group, the ticks. */
  function load(): void {
    state = initialState(loadRoster().names(), loadGroup(), range);
    hideToast();
    render();
  }

  let starting = false;
  start.addEventListener('click', () => {
    if (!isOpen || starting || !canStart(state)) return;
    starting = true;
    start.disabled = true;
    const before = state;
    const ops = opsOf(state);
    state = dropUndo(state); // its removal rides in `ops`
    hideToast();
    // The edits are applied to the roster as it is NOW, under the lock, all or nothing. A refusal
    // starts nothing and writes nothing; the screen re-reads storage and says why:
    //   - ceiling (frame 10): another tab's adds filled the roster. The players see it as it really
    //     stands, the refused name absent, the add row closed (gh#264 REFUTE finding 2);
    //   - collision (frame 9): another tab stored a name this screen also wants. The re-read keeps
    //     this screen's edits (rebase), so both colliding rows show, marked, with start off.
    void writeRoster(ops).then((result) => {
      starting = false;
      if (result.status === 'ceiling') {
        // rebase, not a bare re-read: renames and a pending x survive; the adds that no longer fit
        // are what is dropped, and the full line stays while the roster is at the ceiling.
        state = { ...rebase(before, result.roster, loadGroup()), notice: 'full' };
      } else if (result.status === 'collision') {
        state = rebase(before, result.roster, loadGroup());
      } else {
        // onStart order is the COMMITTED order (gh#264 REFUTE round 3), read off what storage now
        // holds, never off this screen's rows: another tab may have moved a seat while it was open.
        const players = committedPlayers(before, result.roster);
        if (players && players.length >= state.min) {
          // Roster first, then the group: loadGroup() filters the group by the roster, so a group
          // written before its names reach the roster reads back empty.
          saveGroup(players.map((p) => p.name));
          close();
          // Acknowledged only once the route took them: a throw skips this and stays as loud as it was.
          const taken = onStart(players);
          void Promise.resolve(taken).then(() => {
            const html = document.documentElement;
            html.setAttribute(HANDOVER_ATTR, String((Number(html.getAttribute(HANDOVER_ATTR)) || 0) + 1));
          });
          return;
        }
        // A seated name another tab removed: show the roster as it stands, this screen's ticks kept.
        state = initialState(result.roster, playersOf(before).map((p) => p.name), range);
      }
      render();
      armSurface();
    });
  });

  // The page being put away is the last chance to make a pending x final. visibilitychange first:
  // it fires while the page can still run the write; pagehide is the backstop.
  const flushRemoval = (): void => {
    if (state.undo) {
      commitRemoval();
      hideToast();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushRemoval();
  });
  window.addEventListener('pagehide', flushRemoval);

  function open(): Promise<void> {
    if (migrationFailed) {
      migrationFailed = false;
      migrated = migrate();
    }
    countPendingOpen(1);
    // gh#272: every open holds, the first and every reopen alike, from the call until it lands.
    opening += 1;
    syncRenderHold();
    // finally, so a failed open (a rejected migration, a throwing route hook) is uncounted too; the
    // returned promise rejects with it, and stays the unhandled rejection it always was when ignored.
    return migrated
      .then(() => {
        load();
        onOpen?.();
        root.hidden = false;
        isOpen = true;
        announce(true);
        armSurface();
      })
      .finally(() => {
        countPendingOpen(-1);
        opening -= 1;
        syncRenderHold();
      });
  }

  function close(): void {
    commitRemoval();
    hideToast();
    root.hidden = true;
    isOpen = false;
    announce(false);
    // Last, after commitRemoval: a removal it started keeps the hold until that write settles.
    syncRenderHold();
  }

  // Ruling 6, the edit control mid-round. Asks only when a round is really running; otherwise there
  // is nothing to lose and the screen just opens.
  const closeEdit = (): void => {
    if (editDialog.open) editDialog.close();
    armSurface();
  };
  editCancel.addEventListener('click', closeEdit);
  editDialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    closeEdit();
  });
  // Same reason as the reset dialog's: a close with no cancel to take over still arms.
  editDialog.addEventListener('close', closeEdit);
  editConfirm.addEventListener('click', () => {
    closeEdit();
    abortRound();
    open();
  });
  document.addEventListener(EDIT_EVENT, () => {
    if (isOpen || editDialog.open) return;
    if (roundActive()) {
      editDialog.showModal();
      armAllButtons(editDialog);
      return;
    }
    open();
  });

  root.hidden = true;
  announce(false);
  return { open, close, arm: armSurface };
}
