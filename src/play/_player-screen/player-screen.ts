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
import { takeSetupEditRequest } from '../_setup-bridge.ts';

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

/** Per-game player lists that predate the shared roster (ADR-0071 "Data"). Only a CONVERTED route's
 *  key is listed: an unconverted route still reads its own key, and retiring it here would empty that
 *  game's list under it. dice-loser's and one-bomb's keys join this table in their own conversion. */
export const LEGACY_LISTS: readonly { key: string; extract: (value: unknown) => string[] }[] = [
  {
    key: 'watduang:timebomb-players',
    extract: extractTimebombList,
  },
];

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
  return { mode: 'saved', min, max, count: 0, rows, undo: null };
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

/** Who plays this round, in roster order (ruling 5). */
export function playersOf(state: ScreenState): Player[] {
  const seated = state.mode === 'first' ? state.rows.slice(0, state.count) : state.rows.filter((r) => r.ticked);
  return seated.map((r) => ({ name: displayName(r), emoji: MASCOTS[r.mascot].emoji, mascot: r.mascot }));
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
  return n >= state.min && n <= state.max;
}

/** Which limit line the saved screen shows. Under-minimum wins: it is the reason start is off. */
export function limitLine(state: ScreenState): { kind: 'under' | 'over' | 'count'; n: number } {
  const ticked = tickedCount(state);
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
  // Not on the board: the first-visit field label stays timebomb's positional one (gh#177).
  seatLabel: 'ชื่อผู้เล่นคนที่ ',
} as const;

export interface MountOptions {
  /** Where the screen renders. Anything already inside stays first (the host's tagline slot). */
  root: HTMLElement;
  /** The game's manifest `players` tuple. */
  range: Range;
  /** Pressed start: the ticked players, in roster order. The screen has already closed itself. */
  onStart: (players: Player[]) => void;
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
  open(): void;
  close(): void;
}

/** The chrome's edit control (PlayExit.astro) reads these two names to tell a converted route from an
 *  unconverted one: the attribute on <html> says "a shared screen is mounted, and whether it is open",
 *  and the events carry the request and the changes. No import either way, so the twelve routes that
 *  have not mounted this screen keep PlayExit's reload path untouched. */
export const SCREEN_ATTR = 'data-player-screen';
export const STATE_EVENT = 'watduang:player-screen';
export const EDIT_EVENT = 'watduang:edit-players';

/** The game root the dialogs and the undo bar cover: the same id set the shared chrome probes use. */
function surfaceOf(root: HTMLElement): HTMLElement {
  return root.closest<HTMLElement>('#app, #app-container, #appRoot') ?? document.body;
}

export function mountPlayerScreen(options: MountOptions): PlayerScreen {
  const { root, range, onStart, roundActive, abortRound, onOpen } = options;
  checkRange(range);
  // gh#185's flag. On a route that mounts this screen the chrome's edit control never writes it (it
  // edits in place), but a flag already in the tab -- written by an unconverted route's reload that
  // never completed -- would survive the navigation and force the NEXT unconverted game opened in
  // this tab onto its setup screen. Taking it here clears it for every converted route at once; the
  // value itself is irrelevant, because this screen opens on every load anyway.
  takeSetupEditRequest();

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

  // Both legacy imports run once per mount; open() waits for them, or a timebomb-only device would
  // see the first-visit stepper on the very visit that imports its list.
  const migrated = Promise.all(LEGACY_LISTS.map(({ key, extract }) => migrateLegacyList(key, extract)));

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
    const b = document.createElement('b');
    b.textContent = String(line.n);
    if (line.kind === 'under') limit.replaceChildren(COPY.underLead, b, COPY.countUnit);
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
    });
    return input;
  }

  function renderRows(): void {
    const first = state.mode === 'first';
    countRow.hidden = !first;
    reset.hidden = !first;
    limit.hidden = first;
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
  }

  function render(): void {
    renderRows();
    if (state.mode === 'saved') renderLimit();
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
    if (pending?.row.origin) void applyRosterOps([{ op: 'remove', name: pending.row.origin }], ROSTER_CEILING);
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
    const players = playersOf(state);
    const ops = opsOf(state);
    state = dropUndo(state); // its removal rides in `ops`
    hideToast();
    // The edits are applied to the roster as it is NOW, under the lock. An add another tab's adds
    // have pushed past the ceiling is refused, never stored and clipped: then nothing starts, and the
    // screen re-reads storage so the players see the roster as it really stands, the refused name
    // absent and the add row closed at the ceiling (gh#264 REFUTE finding 2).
    void applyRosterOps(ops, ROSTER_CEILING).then(({ refused }) => {
      starting = false;
      if (refused.length > 0) {
        load();
        armSurface();
        return;
      }
      // Roster first, then the group: loadGroup() filters the group by the roster, so a group
      // written before its names reach the roster reads back empty.
      saveGroup(players.map((p) => p.name));
      close();
      onStart(players);
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

  function open(): void {
    void migrated.then(() => {
      load();
      onOpen?.();
      root.hidden = false;
      isOpen = true;
      announce(true);
      armSurface();
    });
  }

  function close(): void {
    commitRemoval();
    hideToast();
    root.hidden = true;
    isOpen = false;
    announce(false);
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
  return { open, close };
}
