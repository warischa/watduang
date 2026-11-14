// The prize-draw setup page's script (src/pages/game/prize-draw/index.astro). Reads the form, shows what
// stops the event from starting, and on "เริ่มงาน" builds the event, stores it and opens the projector route.
// A normal site page, not a play surface: the rules of src/play/** do not bind it, and its one navigation
// (to the play route, after the event is stored) is a script step because it must not happen before the
// store has committed it.
//
// Replacing a saved event asks first (gh#313): when the store holds an event, the start asks the MC through
// the browser's own confirm dialog. Cancel writes nothing, so the saved event stays byte-identical. Confirm
// stores the new event as a compare-and-set on exactly the text that was asked about (store.ts put): if a
// projector moved the saved event while the dialog was open, nothing is replaced and the MC is asked again.
//
// Every name this page shows goes through writeName (src/play/_prize-reveal/names-dom.ts), the one
// textContent sink shared with the projector. No innerHTML anywhere in this file.
//
// Copy: the board's approved strings (design/Gh302Setup.dc.html, direction A), plus the strings the board
// did not draw, listed in the gh#304 evidence README and approved there by the owner on 2026-11-11: the
// refusal message per name reason, the head-count range and STORAGE_FAILED. A refusal row is the icon, the
// name through the name sink, then the fixed message for its reason; a message never carries the name.
//
// The game rows (gh#305, owner picks 2026-11-13: design/Gh305GamePick.dc.html items 1a and 1b, option A
// each): one button group per step inside the schedule step; the page renders only the games the registry
// lets that step play, and this script refuses any other. A browser without WebGL2 keeps the picks and
// shows the note in place of the line over the rows: the projector checks again on the night and falls
// back to the plain reveal by itself. The probe is a bare getContext call, never three.
//
// QR mode (gh#308; design/Gh302Setup.dc.html frame setup-qr, direction A, picked 2026-11-11): step 2 takes
// the board's mode toggle. In QR mode the open control opens the projector route in its own window and,
// once, creates the remote event (qr-event.ts); the session, admin token included, stays in this page's own
// localStorage and travels only in a header. The projector reads a lobby record without the token and
// shows the join QR. The review list polls the server while this page is visible, one read at a time, and
// every removal is a server write first. The start sends exactly the reviewed ids; the server freezes the
// roster from them, and the stored event is built from exactly that frozen roster (createEvent), then the
// lobby and the session are dropped and the projector walks the event. A start answer that is not a clean
// roster stores nothing; a frozen roster outside the event range can never become this event, so the
// remote event is purged and the session dropped, and the open control makes a new one. Names from the
// server are attacker-owned: qr-event.ts drops those out of contract, and what survives reaches the DOM
// through nameBox (writeName), never markup. An admin-mode start purges every open QR event, this tab's and
// the one in the origin's storage: nobody can join it any more, so its names have no use.
//
// Ownership. Storage is shared by every tab of the origin, and the lobby record outranks the stored event on
// the projector, so a lobby written after an event was stored hides that event. A tab writes a QR record
// (session, lobby) only while it owns the session: it is this tab's live session, the origin's stored
// session is the same remote event, and the event store still holds the generation the session was opened
// over (AdminSession.gen). A session that fails any of them is over here and writes nothing more. A send's
// answer that comes back after the session or the mode it was made for has ended belongs to nothing.

import { ELIMINATION_ROUNDS, proposeSchedule } from '../prize-draw/schedule.ts';
import { MAX_HEADS, MAX_PRIZES, MIN_HEADS, MIN_PRIZES, createEvent, cryptoRng, cutsInHalf, scheduleIssues, type EventState } from './event.ts';
import { OLD_TAB_OPEN, REFUSED_BROWSER, openEventStore, type EventStore, type StoreEnv } from './store.ts';
import { isCutGame, isFinalGame, type CutGame, type FinalGame, type GameChoices } from './game-contract.ts';
import { parseRoster, type NameIssue } from './names.ts';
import { fitAll, nameBox, writeName } from '../play/_prize-reveal/names-dom.ts';
import {
  ADMIN_KEY,
  LOBBY_KEY,
  POLL_MS,
  encodeLobby,
  encodeSession,
  frozenNames,
  parseLobby,
  parseSession,
  qrApi,
  type AdminSession,
  type ApiEnv,
  type CreatedEvent,
  type Member,
  type QrApi,
} from './qr-event.ts';

/** Owner-approved, no board string: shown when the browser refuses to store the event. */
export const STORAGE_FAILED = 'บันทึกงานไม่ได้ เบราว์เซอร์นี้ไม่ให้เก็บข้อมูล';

/** Owner-approved (gh#313): the question asked, in the browser's own confirm dialog, before a new event
 *  replaces the saved one. */
export const CONFIRM_REPLACE = 'มีงานที่บันทึกไว้แล้ว ถ้าเริ่มงานใหม่ งานเดิมจะหายไป เริ่มใหม่เลยไหม?';

/** Owner-approved: why a name was refused, one per reason code the roster can show, plus a taken name.
 *  'empty' has none: a blank line is skipped, never listed. */
export const REFUSAL_COPY: Record<Exclude<NameIssue, 'empty'> | 'taken', string> = {
  charset: "ใช้ได้เฉพาะตัวอักษรไทย อังกฤษ ตัวเลข เว้นวรรค และ . - ' _",
  emoji: 'ชื่อใส่อีโมจิไม่ได้',
  'too-long': 'ชื่อยาวเกิน 12 ตัว',
  'stacked-marks': 'สระหรือวรรณยุกต์ซ้อนกันเกินไป',
  'leading-mark': 'สระหรือวรรณยุกต์ต้องตามหลังพยัญชนะ',
  control: 'ชื่อนี้มีตัวอักษรที่มองไม่เห็น ลบแล้วพิมพ์ใหม่',
  'lone-surrogate': 'ชื่อนี้มีตัวอักษรที่อ่านไม่ได้',
  taken: 'ชื่อนี้ซ้ำกับชื่อที่มีแล้ว',
};

/** Owner-approved (gh#305): the no-game choice in each game row. That step reveals in plain 2D. */
export const NO_GAME_LABEL = 'แบบปกติ';

/** Owner-approved (gh#305): shown over the game rows when this browser cannot draw WebGL2. */
export const NO_WEBGL_NOTE = 'เครื่องนี้แสดงเกม 3D ไม่ได้ ถ้าวันงานก็แสดงไม่ได้ ระบบจะเปิดผลแบบปกติให้เอง';

/** Owner-approved 2026-11-14 (PD-305-01): why a round's cards button is locked. */
export const CARDS_HALF_NOTE = 'เกมไพ่ใช้ได้เฉพาะรอบที่คัดออกครึ่งหนึ่งพอดี';

/** Can this browser draw the 3D games? One WebGL2 context on a canvas that never joins the document, then
 *  released at once. No context, or a browser that throws, is no. */
export function hasWebGL2(doc: Pick<Document, 'createElement'>): boolean {
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = doc.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/** Board copy for QR mode (design/Gh302Setup.dc.html setup-qr A, COPY SOURCES rows), verbatim. The joined
 *  line is the board's string in its runs: the label, the count, then the unit and the gap. */
export const QR_COPY = {
  joined: 'เข้าร่วมแล้ว',
  people: 'คน',
  gap: (n: number): string => ` · ยังขาด ${n} คน`,
  remove: 'ลบ',
  more: (n: number): string => `เลื่อนดูอีก ${n} ชื่อ`,
  startWith: (n: number): string => `เริ่มด้วย ${n} คน`,
};

/** Answers no board draws. Owner-approved copy 2026-11-14 (gh#308 comment); verbatim, never reworded. */
export const QR_PENDING = {
  // Start pressed in QR mode before the QR screen was opened.
  noEvent: 'ยังไม่ได้เปิดหน้า QR กด เปิดหน้า QR บนจอใหญ่ ก่อน',
  // The join server did not answer; the list keeps trying.
  unavailable: 'ระบบไม่ว่าง กำลังลองใหม่ให้อัตโนมัติ',
  // The QR event has expired or is unknown.
  gone: 'งาน QR นี้หมดอายุแล้ว เปิดหน้า QR ใหม่อีกครั้ง',
  // This browser no longer holds the key of the QR event.
  admin: 'เบราว์เซอร์นี้ไม่ใช่เครื่องที่เปิดงาน QR นี้ เปิดหน้า QR ใหม่อีกครั้ง',
  // Start refused: none of the reviewed names is still joined.
  empty: 'ยังไม่มีชื่อที่เข้าร่วมอยู่ จึงเริ่มงานไม่ได้',
  // The QR event has already started; names can no longer be removed.
  started: 'งานเริ่มแล้ว ลบชื่อไม่ได้',
  // The join server sent an answer this page cannot use.
  bad: 'ระบบตอบกลับผิดพลาด ลองใหม่อีกครั้ง',
};

/** Names the review list shows before it scrolls: the board's 312px window holds 5 rows, in 3 columns at
 *  640px and up (15 names), in 1 column below (5 names; design/Gh308Gaps.dc.html gap 2 B). The phone
 *  boundary matches the page's 639px media rule. */
const QR_VISIBLE_ROWS = { wide: 15, phone: 5 };
const QR_PHONE_QUERY = '(max-width: 639px)';
/** The same boundary for a window without matchMedia: its own width. */
const QR_PHONE_BELOW = 640;
/** The window as the review list's width reads it; any member may be missing. */
type QrView = {
  matchMedia?: (query: string) => {
    matches: boolean;
    addEventListener?: (type: 'change', fn: () => void) => void;
    removeEventListener?: (type: 'change', fn: () => void) => void;
  };
  innerWidth?: number;
  addEventListener?: (type: 'resize', fn: () => void) => void;
  removeEventListener?: (type: 'resize', fn: () => void) => void;
};
const viewOf = (doc: Document): QrView | null => doc.defaultView as unknown as QrView | null;
function qrVisibleRows(doc: Document): number {
  const view = viewOf(doc);
  if (!view) return QR_VISIBLE_ROWS.wide;
  const phone =
    typeof view.matchMedia === 'function'
      ? view.matchMedia(QR_PHONE_QUERY).matches
      : typeof view.innerWidth === 'number' && view.innerWidth < QR_PHONE_BELOW;
  return phone ? QR_VISIBLE_ROWS.phone : QR_VISIBLE_ROWS.wide;
}
/** Calls `fn` whenever the phone boundary may have been crossed: the query's own change, or, without
 *  matchMedia, every resize. Returns the undo; a window with neither is never watched. */
function watchQrWidth(doc: Document, fn: () => void): () => void {
  const view = viewOf(doc);
  try {
    if (view && typeof view.matchMedia === 'function') {
      const query = view.matchMedia(QR_PHONE_QUERY);
      if (typeof query.addEventListener !== 'function') return () => {};
      query.addEventListener('change', fn);
      return () => query.removeEventListener?.('change', fn);
    }
    if (view && typeof view.addEventListener === 'function') {
      view.addEventListener('resize', fn);
      return () => view.removeEventListener?.('resize', fn);
    }
  } catch {
    // A window that refuses to be watched keeps the count of the last render.
  }
  return () => {};
}
/** The board's fit for a review-list name (setup-qr: 18px, floor 17). */
const QR_FIT = { size: 18, floor: 17 };
/** The window the projector opens in, so a second open reuses it. */
const PROJECTOR_WINDOW = 'pd-projector';

/** The game row groups in index.astro, the elimination rounds first, then the final. */
const GAME_GROUPS = ['pd-game-r1', 'pd-game-r2', 'pd-game-r3', 'pd-game-r4', 'pd-game-final'];

/** Owner-approved: the head count is outside what an event can start with. */
export const HEAD_RANGE = `ใส่ได้ ${MIN_HEADS} ถึง ${MAX_HEADS} ชื่อ`;

const STEP_LABELS = ['เริ่ม', 'หลังรอบ 1', 'หลังรอบ 2', 'หลังรอบ 3', 'รอบชิง'];
const SCHEDULE_FIRST = 'แก้ตารางคัดออกก่อน แล้วจึงเริ่มงานได้';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The page's window, as far as this script uses it. The real `window` fits as is: it is also the store's
 *  environment (store.ts StoreEnv), and a browser without usable IndexedDB stores nothing. */
type Win = StoreEnv & {
  location: { assign(url: string): void };
  confirm(message: string): boolean;
  addEventListener?(type: string, listener: (event: Event) => void): void;
  /** QR mode's browser side; the real window has all of them. */
  open?(url: string, target: string): unknown;
  fetch?: ApiEnv['fetch'];
  setTimeout?(fn: () => void, ms: number): unknown;
  clearTimeout?(handle: never): void;
};

/** Storage as QR mode uses it: the session and the lobby record. */
type Kv = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The parts of a cross-document view transition this script touches, as `pageswap` hands it over. */
type PageSwap = {
  activation?: { entry?: { url?: string } | null } | null;
  viewTransition?: {
    ready?: Promise<unknown>;
    finished?: Promise<unknown>;
    updateCallbackDone?: Promise<unknown>;
    skipTransition(): void;
  } | null;
};

/**
 * The site's page fade (web.css @view-transition) is on for this page and never for a play route, so
 * Chrome starts a fade for the start's navigation, aborts it when the projector does not opt in, and
 * raises that abort as an uncaught InvalidStateError. This page skips the fade itself when the
 * destination is `target`, before the projector decides, and handles every promise the transition
 * carries. A fade to any other page is left alone.
 */
export function skipFadeInto(target: string): (event: Event) => void {
  return (event) => {
    const { activation, viewTransition: vt } = event as Event & PageSwap;
    const to = activation?.entry?.url;
    if (!vt || !to) return;
    try {
      if (new URL(target, to).pathname !== new URL(to).pathname) return;
    } catch {
      return;
    }
    const ignore = (): void => {};
    for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) p?.catch(ignore);
    vt.skipTransition();
  };
}

function errorIcon(doc: Document): Element {
  // The board's error icon (setup-schedule-error): a punch disc with an ink exclamation mark. Colours come
  // from the page stylesheet by class (tokens), never as values copied here.
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const disc = doc.createElementNS(SVG_NS, 'circle');
  disc.setAttribute('cx', '12');
  disc.setAttribute('cy', '12');
  disc.setAttribute('r', '11');
  disc.setAttribute('class', 'emsg-disc');
  const bar = doc.createElementNS(SVG_NS, 'path');
  bar.setAttribute('d', 'M12 6v8');
  bar.setAttribute('class', 'emsg-mark');
  bar.setAttribute('stroke-width', '3');
  bar.setAttribute('stroke-linecap', 'round');
  const dot = doc.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '12');
  dot.setAttribute('cy', '18');
  dot.setAttribute('r', '1.7');
  dot.setAttribute('class', 'emsg-dot');
  svg.append(disc, bar, dot);
  return svg;
}

/** One error row: icon, then either approved text, or one text column holding a name written through the
 *  name sink above the approved message for why it was refused (fixed copy, so the name never reaches it).
 *  One column, not two flex items: an unbreakable name beside the message squeezed it to a word per line. */
function errorRow(doc: Document, content: { text: string } | { name: string; why: string | null }): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'emsg';
  if (!('name' in content)) {
    const span = doc.createElement('span');
    span.textContent = content.text;
    row.append(errorIcon(doc), span);
    return row;
  }
  const body = doc.createElement('div');
  body.className = 'emsg-body';
  const name = doc.createElement('span');
  name.className = 'emsg-name';
  writeName(name, content.name);
  body.append(name);
  if (content.why !== null) {
    const why = doc.createElement('span');
    why.className = 'emsg-why';
    why.textContent = content.why;
    body.append(why);
  }
  row.append(errorIcon(doc), body);
  return row;
}

/** What the page script takes besides the document and the window. */
export type SetupOptions = {
  /**
   * THE GAME PICKER SEAM (gh#305). Returns the MC's game picks at the moment the event starts; they are
   * frozen into the event (EventInput.games). Defaults to the page's own game rows.
   */
  games?: () => GameChoices;
  /** Can this browser draw the 3D games? Defaults to the hasWebGL2 probe on the page's document. */
  webgl2?: () => boolean;
  /** QR mode's seams; each defaults to the page's own window. Tests pass doubles. */
  qr?: {
    api?: QrApi;
    storage?: Kv | null;
    open?: (url: string) => void;
    now?: () => number;
    setTimeout?: (fn: () => void, ms: number) => unknown;
    clearTimeout?: (handle: unknown) => void;
    hidden?: () => boolean;
  };
};

export function mountSetup(doc: Document, win: Win, options: SetupOptions = {}): void {
  const $ = <T extends HTMLElement>(id: string): T => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`setup page: #${id} is missing`);
    return el as T;
  };
  const form = $<HTMLFormElement>('pd-setup');
  const eventName = $<HTMLInputElement>('pd-event');
  const namesBox = $<HTMLTextAreaElement>('pd-names');
  const count = $('pd-count');
  const namesMsg = $('pd-names-msg');
  const s0 = $('pd-s0');
  const steps = [1, 2, 3].map((i) => $<HTMLInputElement>(`pd-s${i}`));
  const stepLabels = [0, 1, 2, 3].map((i) => $(`pd-l${i}`));
  const schedMsg = $('pd-sched-msg');
  const reset = $<HTMLButtonElement>('pd-sched-reset');
  const minus = $<HTMLButtonElement>('pd-prize-minus');
  const plus = $<HTMLButtonElement>('pd-prize-plus');
  const prizeCount = $('pd-prize-count');
  const prizeRows = Array.from({ length: MAX_PRIZES }, (_, i) => i + 1);
  const prizeInputs = prizeRows.map((i) => $<HTMLInputElement>(`pd-prize-${i}`));
  const startMsg = $('pd-start-msg');
  const gamesLine = $('pd-games-line');
  const gamesNote = $('pd-games-note');
  const cutLabels = Array.from({ length: ELIMINATION_ROUNDS }, (_, i) => [$(`pd-game-r${i + 1}-from`), $(`pd-game-r${i + 1}-to`)] as const);

  let prizes = MAX_PRIZES;
  // QR mode (gh#308): the list on screen, and once the server has frozen it, the roster.
  let mode: 'admin' | 'qr' = 'admin';
  let reviewed: Member[] = [];
  let frozen: Member[] | null = null;
  // An untouched empty list is not an error; after a start is tried, an empty list says why it failed.
  let tried = false;
  // The MC's own edits to the schedule survive a change in the roster; "ใช้ค่าที่ระบบเสนอ" drops them.
  let edited = false;

  const heads = (): number => {
    if (mode === 'qr') return (frozen ?? reviewed).length;
    const r = parseRoster(namesBox.value);
    return r.names.length + r.refused.length + r.duplicates.length;
  };
  const schedule = (): number[] => [heads(), ...steps.map((s) => (s.value.trim() === '' ? Number.NaN : Number(s.value))), 5];

  const propose = (): void => {
    const n = heads();
    const proposal = n >= MIN_HEADS ? proposeSchedule(n) : null;
    steps.forEach((s, i) => (s.value = proposal ? String(proposal[i + 1]) : ''));
  };

  // Set by the QR block once it is wired: renders the review list and the start label.
  let renderQr = (): void => {};
  const renderNames = (): void => {
    renderQr();
    if (mode === 'qr') return;
    const r = parseRoster(namesBox.value);
    const n = r.names.length + r.refused.length + r.duplicates.length;
    const outside = (n > 0 || tried) && (n < MIN_HEADS || n > MAX_HEADS);
    count.textContent = `${n} ชื่อ`;
    count.classList.toggle('err', outside);
    namesMsg.replaceChildren(
      ...(outside ? [errorRow(doc, { text: HEAD_RANGE })] : []),
      ...r.refused.map((x) => errorRow(doc, { name: x.name, why: x.issue === 'empty' ? null : REFUSAL_COPY[x.issue] })),
      ...r.duplicates.map((name) => errorRow(doc, { name, why: REFUSAL_COPY.taken })),
    );
  };

  /** Show the schedule's problems; returns whether it is valid. */
  const renderSchedule = (): boolean => {
    const sched = schedule();
    s0.textContent = String(sched[0]);
    sched.slice(0, 4).forEach((v, i) => (stepLabels[i]!.textContent = Number.isFinite(v) ? `${v} คน` : ''));
    // Each game row names the cut it plays: from the box before the round to the box after it.
    cutLabels.forEach(([from, to], i) => {
      from.textContent = Number.isFinite(sched[i]) ? String(sched[i]) : '';
      to.textContent = Number.isFinite(sched[i + 1]) ? `${sched[i + 1]} คน` : '';
    });
    const n = sched[0]!;
    const issues = n >= MIN_HEADS && n <= MAX_HEADS ? scheduleIssues(sched, n) : [];
    steps.forEach((s, i) => s.classList.toggle('err', issues.some((x) => x.index === i + 1)));
    offerCards(sched);
    const first = issues.find((x) => x.kind === 'not-less');
    schedMsg.replaceChildren();
    if (first) {
      const at = first.index;
      // The board's own sentence (setup-schedule-error), for whichever box broke the run.
      schedMsg.appendChild(
        errorRow(doc, { text: `${STEP_LABELS[at]} ต้องน้อยกว่า${STEP_LABELS[at - 1]} (${sched[at - 1]} คน)` }),
      );
    }
    return issues.length === 0;
  };

  // The game rows. A group offers only what its step may play (game-contract.ts, the persisted rule): any
  // other button is hidden, disabled and never listened to, so no click can pick it.
  const chosen: (string | null)[] = GAME_GROUPS.map(() => null);
  const playable = (step: number, game: string | null): boolean => (step < ELIMINATION_ROUNDS ? isCutGame(game) : isFinalGame(game));
  const renders: (() => void)[] = [];
  const cardButtons: (HTMLButtonElement | undefined)[] = [];
  GAME_GROUPS.forEach((id, step) => {
    const buttons = Array.from($(id).querySelectorAll<HTMLButtonElement>('button'));
    const gameOf = (b: HTMLButtonElement): string | null => b.getAttribute('data-game') || null;
    const render = (): void => buttons.forEach((b) => b.setAttribute('aria-pressed', String(gameOf(b) === chosen[step])));
    for (const b of buttons) {
      const game = gameOf(b);
      if (!playable(step, game)) {
        b.hidden = true;
        b.disabled = true;
        continue;
      }
      if (game === 'cards') cardButtons[step] = b;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        chosen[step] = game;
        render();
      });
    }
    renders[step] = render;
    render();
  });
  // Cards play only a round that cuts exactly in half (event.ts cutsInHalf), so a round's cards button is
  // disabled on any other cut, checked again on every schedule change; a cards pick on a round that stops
  // halving is cleared there and then, never kept for the start to refuse. While any round holds cards back,
  // one reason line (for the page) sits under the first such round's row. Its slots are looked up softly, as
  // the mode toggle is: a page without them still gets the locking, just not the line.
  const cardNotes = Array.from({ length: ELIMINATION_ROUNDS }, (_, i) => doc.getElementById(`${GAME_GROUPS[i]}-note`));
  function offerCards(sched: readonly number[]): void {
    let firstHeld = -1;
    for (let step = 0; step < ELIMINATION_ROUNDS; step++) {
      const halves = cutsInHalf(sched, step + 1);
      const b = cardButtons[step];
      if (b) b.disabled = !halves;
      if (b && !halves && firstHeld < 0) firstHeld = step;
      if (!halves && chosen[step] === 'cards') {
        chosen[step] = null;
        renders[step]?.();
      }
    }
    cardNotes.forEach((slot, step) => slot?.replaceChildren(...(step === firstHeld ? [errorRow(doc, { text: CARDS_HALF_NOTE })] : [])));
  }
  const cut = (step: number): CutGame => {
    const g = chosen[step];
    return isCutGame(g) ? g : null;
  };
  const final = (): FinalGame => {
    const g = chosen[ELIMINATION_ROUNDS];
    return isFinalGame(g) ? g : null;
  };
  const pickedGames = options.games ?? ((): GameChoices => ({ rounds: [cut(0), cut(1), cut(2), cut(3)], final: final() }));
  if (!(options.webgl2 ?? (() => hasWebGL2(doc)))()) {
    gamesNote.replaceChildren(errorRow(doc, { text: NO_WEBGL_NOTE }));
    gamesLine.hidden = true;
  }

  const renderPrizes = (): void => {
    prizeCount.textContent = String(prizes);
    minus.disabled = prizes <= MIN_PRIZES;
    plus.disabled = prizes >= MAX_PRIZES;
    for (const row of Array.from(doc.querySelectorAll<HTMLElement>('[data-prize-row]'))) {
      row.hidden = Number(row.getAttribute('data-prize-row')) > prizes;
    }
  };

  namesBox.addEventListener('input', () => {
    if (!edited) propose();
    renderNames();
    renderSchedule();
    startMsg.replaceChildren();
  });
  steps.forEach((s) =>
    s.addEventListener('input', () => {
      edited = true;
      renderSchedule();
      startMsg.replaceChildren();
    }),
  );
  reset.addEventListener('click', () => {
    edited = false;
    propose();
    renderSchedule();
  });
  minus.addEventListener('click', () => {
    prizes = Math.max(MIN_PRIZES, prizes - 1);
    renderPrizes();
  });
  plus.addEventListener('click', () => {
    prizes = Math.min(MAX_PRIZES, prizes + 1);
    renderPrizes();
  });

  // Enter in a one-line field would submit the form, start the event and replace any stored one: only the
  // start button starts it.
  form.addEventListener('keydown', (ev) => {
    const target = ev.target as HTMLElement | null;
    if ((ev as KeyboardEvent).key === 'Enter' && target?.tagName === 'INPUT') ev.preventDefault();
  });

  // A start waiting on the store: a second submit before it has answered would store a second event.
  let starting = false;
  const storageFailed = (): void => {
    startMsg.replaceChildren(errorRow(doc, { text: STORAGE_FAILED }));
  };
  const refusedBrowser = (): void => {
    startMsg.replaceChildren(errorRow(doc, { text: REFUSED_BROWSER }));
  };
  const oldTabOpen = (): void => {
    startMsg.replaceChildren(errorRow(doc, { text: OLD_TAB_OPEN }));
  };
  // Opened once, at mount: a refused browser, or a store revoked because a tab running the old code holds
  // another event (store.ts), says so before the MC types a roster, and again on start.
  const opening = openEventStore(win).catch(() => null);
  void opening.then((store) => {
    if (!store) refusedBrowser();
    else store.onSuperseded((why) => why === 'revoked' && oldTabOpen());
  });

  const playTarget = form.getAttribute('data-play') ?? '/';
  const open = (): void => win.location.assign(playTarget);
  win.addEventListener?.('pageswap', skipFadeInto(playTarget));

  /** A revoked store: the MC's start replaces the stored event and seals the old key again (store.ts
   *  takeOver), only after the same confirm as any replacement. Cancel changes nothing. */
  const takeOver = async (store: EventStore, event: EventState, asked: boolean, stored: () => void): Promise<void> => {
    if (!asked && !win.confirm(CONFIRM_REPLACE)) return;
    if (await store.takeOver(event)) {
      stored();
      open();
    } else storageFailed();
  };

  /** Store `event`, asking first when it would replace a saved one; open the projector once committed.
   *  `stored` runs once the write has committed, before the projector opens. */
  const start = async (event: EventState, stored: () => void): Promise<void> => {
    const store = await opening;
    if (!store) {
      refusedBrowser();
      return;
    }
    // A stale answer means the saved event moved while this start ran: look again, ask again. Bounded so
    // a store that keeps moving ends in the failure message rather than a loop.
    let asked = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (store.status() === 'revoked') return takeOver(store, event, asked, stored);
      const now = await store.load();
      if (!now) {
        if (store.status() === 'revoked') return takeOver(store, event, asked, stored);
        break;
      }
      if (now.state) {
        if (!win.confirm(CONFIRM_REPLACE)) return;
        asked = true;
      }
      const r = await store.put(now.raw, event);
      if (r.ok) {
        stored();
        open();
        return;
      }
      if (r.reason === 'failed') {
        if (store.status() === 'revoked') return takeOver(store, event, asked, stored);
        break;
      }
    }
    storageFailed();
  };

  // Set by the QR block: the QR-mode start, and what an admin-mode start does to an open QR event.
  let startQr: (() => Promise<void>) | null = null;
  let abandonQr = (): void => {};

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (starting) return;
    if (mode === 'qr' && startQr) {
      starting = true;
      void startQr().then(
        () => (starting = false),
        () => {
          starting = false;
          storageFailed();
        },
      );
      return;
    }
    tried = true;
    startMsg.replaceChildren();
    renderNames();
    const scheduleOk = renderSchedule();
    const r = parseRoster(namesBox.value);
    const n = r.names.length + r.refused.length + r.duplicates.length;
    if (r.refused.length || r.duplicates.length || n < MIN_HEADS || n > MAX_HEADS) {
      namesBox.focus();
      return;
    }
    if (!scheduleOk) {
      startMsg.appendChild(errorRow(doc, { text: SCHEDULE_FIRST }));
      // ui-ux-pro-max "Focusable Error Summary": after a failed start, focus goes to the box to fix.
      steps.find((s) => s.classList.contains('err'))?.focus();
      return;
    }
    const event = createEvent(
      {
        eventName: eventName.value,
        names: namesBox.value.split(/\r\n|\r|\n/),
        schedule: schedule(),
        prizes: prizeInputs.slice(0, prizes).map((p) => p.value),
        games: pickedGames(),
      },
      cryptoRng(),
    );
    // A compare-and-set, so it never lands between a projector screen's read and its write; a running
    // event is replaced (a new key), and every screen on it takes the new one up. The projector route opens
    // only once the write has committed.
    starting = true;
    void start(event, () => abandonQr()).then(
      () => (starting = false),
      () => {
        starting = false;
        storageFailed();
      },
    );
  });

  // ---- QR mode (gh#308). Wired only where the page renders the mode toggle.
  const modeGroup = doc.getElementById('pd-mode');
  if (modeGroup) {
    const adminBlock = $('pd-mode-admin');
    const qrBlock = $('pd-mode-qr');
    const expectedBox = $<HTMLInputElement>('pd-qr-heads');
    const openButton = $<HTMLButtonElement>('pd-qr-open');
    const joinedLine = $('pd-qr-joined');
    const fill = $('pd-qr-fill');
    const list = $('pd-qr-list');
    const more = $('pd-qr-more');
    const qrMsg = $('pd-qr-msg');
    const startButton = $('pd-start');
    const startLabel = startButton.textContent ?? '';
    const modeButtons = Array.from(modeGroup.querySelectorAll<HTMLButtonElement>('button'));

    const q = options.qr ?? {};
    const storage: Kv | null = q.storage !== undefined ? q.storage : ((win as { localStorage?: Kv | null }).localStorage ?? null);
    const now = q.now ?? Date.now;
    const later = q.setTimeout ?? ((fn: () => void, ms: number): unknown => win.setTimeout?.(fn, ms));
    const cancel = q.clearTimeout ?? ((handle: unknown): void => win.clearTimeout?.(handle as never));
    const api =
      q.api ??
      qrApi({
        fetch: (url, init) => (win.fetch ? win.fetch(url, init) : Promise.reject(new Error('no fetch'))),
        setTimeout: later,
        clearTimeout: cancel,
      });
    const openScreen = q.open ?? ((url: string): void => void win.open?.(url, PROJECTOR_WINDOW));
    const hidden = q.hidden ?? ((): boolean => (doc as Partial<Document>).visibilityState === 'hidden');

    // A storage that throws is one that keeps nothing: the session lives in this tab only.
    const kvGet = (key: string): string | null => {
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    };
    const kvSet = (key: string, value: string): boolean => {
      try {
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    };
    const kvDel = (key: string): void => {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing kept, nothing to drop.
      }
    };

    /** The origin's stored session: at `at` for a live one, at 0 to name an event whatever its expiry. */
    const storedSession = (at = now()): AdminSession | null => parseSession(kvGet(ADMIN_KEY), at);
    const sameEvent = (a: CreatedEvent | null, b: CreatedEvent): boolean => a !== null && a.eventId === b.eventId && a.adminToken === b.adminToken;

    let session: AdminSession | null = storedSession();
    if (!session) {
      // Expired or unreadable: neither the key nor a lobby for it outlives it.
      kvDel(ADMIN_KEY);
      kvDel(LOBBY_KEY);
    }
    /** The server answered the list as started (a reload after the start): the next start repeats it. */
    let remoteStarted = false;
    let creating = false;
    const removing = new Set<string>();
    let timer: unknown = null;
    /** The session a list read is out for: a read for an ended session never holds up the current one. */
    let reading: AdminSession | null = null;
    /** Moves on whenever a session ends here; a create sent before it belongs to nothing. */
    let epoch = 0;
    /** The latest lobby write: an earlier one still waiting on the store writes nothing. */
    let lobbyWrite = 0;

    const say = (el: HTMLElement, text: string | null): void => el.replaceChildren(...(text === null ? [] : [errorRow(doc, { text })]));
    /** The key of the event the store holds now: null for none, undefined when the store cannot say. */
    const generation = async (): Promise<string | null | undefined> => {
      const store = await opening;
      const snap = store ? await store.load() : null;
      return snap ? (snap.state?.eventKey ?? null) : undefined;
    };
    /** `s` is still this tab's session and the origin's (the store generation is checked by each writer). */
    const owns = (s: AdminSession): boolean => session === s && sameEvent(storedSession(), s);
    /** Drops the records that still hold `s`: the session first, so a tab that then finds it gone writes no
     *  lobby, and the lobby second, so a lobby written before that check is gone after this one. */
    const release = (s: CreatedEvent): void => {
      if (sameEvent(storedSession(0), s)) kvDel(ADMIN_KEY);
      if (parseLobby(kvGet(LOBBY_KEY), 0)?.eventId === s.eventId) kvDel(LOBBY_KEY);
    };
    /** Writes `s` back with this page's removals, only while this tab still owns it. */
    const saveSession = (s: AdminSession): void => {
      const held = storedSession();
      if (!held || !owns(s)) return;
      s.removed = [...new Set([...held.removed, ...s.removed])];
      if (!kvSet(ADMIN_KEY, encodeSession(s))) say(qrMsg, STORAGE_FAILED);
    };
    const writeLobby = (): void => {
      const s = session;
      if (!s || frozen !== null) return;
      const text = encodeLobby(s, eventName.value.trim(), reviewed.length);
      const mine = ++lobbyWrite;
      void generation().then((gen) => {
        if (mine !== lobbyWrite || session !== s || frozen !== null || gen === undefined) return;
        if (gen !== s.gen || !owns(s)) return dropSession(null);
        kvSet(LOBBY_KEY, text);
        // Checked again once written: a tab ending the session drops the session record before the lobby,
        // so either it drops this write or this check finds the session gone.
        if (!owns(s) && kvGet(LOBBY_KEY) === text) kvDel(LOBBY_KEY);
      });
    };
    const expected = (): number | null => {
      const v = Number(expectedBox.value);
      return expectedBox.value.trim() !== '' && Number.isInteger(v) && v > 0 ? v : null;
    };

    renderQr = (): void => {
      startButton.textContent = mode === 'qr' ? QR_COPY.startWith(heads()) : startLabel;
      if (mode !== 'qr') return;
      const shown = frozen ?? reviewed;
      const n = shown.length;
      const want = expected();
      const label = doc.createElement('span');
      label.textContent = QR_COPY.joined;
      const unit = doc.createElement('span');
      unit.className = 'ju';
      unit.textContent = QR_COPY.people + (want !== null && want > n ? QR_COPY.gap(want - n) : '');
      joinedLine.replaceChildren(label, ` ${n}${want !== null ? ` / ${want}` : ''} `, unit);
      fill.style.setProperty('--fill', `${want !== null ? Math.min(100, Math.round((n / want) * 100)) : 0}%`);
      list.replaceChildren(
        ...shown.map((m) => {
          const row = doc.createElement('div');
          row.className = 'jrow';
          const del = doc.createElement('button');
          del.type = 'button';
          del.className = 'del';
          del.textContent = QR_COPY.remove;
          del.disabled = frozen !== null || remoteStarted || removing.has(m.id);
          del.addEventListener('click', () => void removeName(m.id));
          row.append(nameBox(doc, 'span', 'jn', m.name, QR_FIT), del);
          return row;
        }),
      );
      fitAll(list);
      renderMore();
    };
    /** The line under the list: how many names lie past the rows the window shows at its width now. */
    function renderMore(): void {
      if (mode !== 'qr') return;
      const n = (frozen ?? reviewed).length;
      const visible = qrVisibleRows(doc);
      more.textContent = n > visible ? QR_COPY.more(n - visible) : '';
    }
    /** Set while QR mode shows the list: lets go of the width watch. */
    let unwatchWidth: (() => void) | null = null;

    /** The list changed size: the untouched schedule follows it, like a typed roster. */
    const listChanged = (): void => {
      if (!edited) propose();
      renderSchedule();
      renderQr();
      writeLobby();
    };

    function dropSession(why: string | null): void {
      const s = session;
      epoch++;
      session = null;
      reviewed = [];
      frozen = null;
      remoteStarted = false;
      stopPolling();
      if (s) release(s);
      say(qrMsg, why);
      listChanged();
    }
    /** Takes up a session another tab opened, as a reload would. */
    const adopt = (s: AdminSession): void => {
      session = s;
      say(qrMsg, null);
      writeLobby();
      void poll();
    };

    // The poll: one read at a time, the next one POLL_MS after the last answer, only while QR mode shows a
    // live list on a visible page.
    const polling = (): boolean => mode === 'qr' && session !== null && frozen === null && !remoteStarted && !hidden();
    function stopPolling(): void {
      if (timer !== null) cancel(timer);
      timer = null;
    }
    const pollLater = (): void => {
      stopPolling();
      if (polling()) {
        timer = later(() => {
          timer = null;
          void poll();
        }, POLL_MS);
      }
    };
    const poll = async (): Promise<void> => {
      if (!polling() || !session || reading === session) return;
      const s = session;
      reading = s;
      const a = await api.names(s);
      if (reading === s) reading = null;
      // Asked for a session or a mode that has since ended: setMode('qr') polls again by itself.
      if (session !== s || mode !== 'qr') return;
      if (a.kind === 'names') {
        const gone = new Set(s.removed);
        reviewed = a.names.filter((m) => !gone.has(m.id));
        remoteStarted = a.state === 'started';
        say(qrMsg, null);
        listChanged();
      } else if (a.kind === 'gone' || a.kind === 'admin') dropSession(QR_PENDING[a.kind]);
      else say(qrMsg, QR_PENDING[a.kind]);
      pollLater();
    };

    async function removeName(id: string): Promise<void> {
      if (!session || frozen !== null || removing.has(id)) return;
      const s = session;
      removing.add(id);
      renderQr();
      const a = await api.remove(s, id);
      removing.delete(id);
      if (session !== s) return;
      if (a.kind === 'removed') {
        s.removed = [...s.removed, id];
        saveSession(s);
        reviewed = reviewed.filter((m) => m.id !== id);
        listChanged();
        return;
      }
      if (a.kind === 'gone' || a.kind === 'admin') {
        dropSession(QR_PENDING[a.kind]);
        return;
      }
      if (a.kind === 'started') {
        remoteStarted = true;
        stopPolling();
      }
      say(qrMsg, QR_PENDING[a.kind]);
      renderQr();
    }

    const setMode = (next: 'admin' | 'qr'): void => {
      mode = next;
      for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === next));
      adminBlock.hidden = next !== 'admin';
      qrBlock.hidden = next !== 'qr';
      startMsg.replaceChildren();
      if (!edited) propose();
      renderNames();
      renderSchedule();
      if (next === 'qr') {
        unwatchWidth ??= watchQrWidth(doc, renderMore);
        writeLobby();
        void poll();
      } else {
        unwatchWidth?.();
        unwatchWidth = null;
        stopPolling();
      }
    };
    for (const b of modeButtons) b.addEventListener('click', () => setMode(b.getAttribute('data-mode') === 'qr' ? 'qr' : 'admin'));

    // Opened first, inside the click, so no popup blocker sees a window opened after a network wait; the
    // projector shows its lobby once the record below lands.
    openButton.addEventListener('click', () => {
      openScreen(playTarget);
      if (session || creating) return;
      // Another tab's live event is this one's too: a second event would leave one of them unreachable.
      const theirs = storedSession();
      if (theirs) return adopt(theirs);
      creating = true;
      const at = epoch;
      // The generation the event is opened over is read before the create is sent, and the answer is taken
      // only while the store still holds it: an event stored meanwhile, in any tab, is never covered.
      void (async () => {
        const before = await generation();
        const a = await api.create();
        const gen = a.kind === 'created' && before !== undefined && (await generation()) === before ? before : undefined;
        creating = false;
        const live = at === epoch && mode === 'qr' && session === null;
        if (a.kind !== 'created') {
          if (live) say(qrMsg, QR_PENDING[a.kind]);
          return;
        }
        const fresh: AdminSession = { ...a.event, removed: [], gen: gen ?? null };
        // Claimed only while nobody holds a live session, and checked again once written.
        const claimed = live && gen !== undefined && !storedSession() && kvSet(ADMIN_KEY, encodeSession(fresh)) && sameEvent(storedSession(), fresh);
        if (!claimed) {
          // Nobody can reach this event any more: best effort, the server's clock deletes it anyway.
          void api.purge(fresh);
          const held = storedSession();
          if (!live) return;
          if (held && !sameEvent(held, fresh)) return adopt(held);
          release(fresh);
          say(qrMsg, STORAGE_FAILED);
          return;
        }
        adopt(fresh);
      })();
    });
    expectedBox.addEventListener('input', () => renderQr());
    eventName.addEventListener('input', () => writeLobby());
    doc.addEventListener('visibilitychange', () => (hidden() ? stopPolling() : void poll()));

    abandonQr = (): void => {
      // A create still on its way belongs to nothing now.
      epoch++;
      const held = storedSession(0);
      // Best effort: the server's own clock deletes it anyway (protocol doc, Clocks).
      if (held && !(session && sameEvent(held, session))) {
        void api.purge(held);
        release(held);
      }
      if (session) {
        void api.purge(session);
        dropSession(null);
      }
    };

    /** The QR-mode start: freeze the reviewed list on the server, then store the event built from exactly the
     *  roster it answered. A head count outside the event range never reaches the server, since a frozen
     *  roster cannot be undone. */
    startQr = async (): Promise<void> => {
      tried = true;
      startMsg.replaceChildren();
      const fail = (text: string): void => say(startMsg, text);
      if (session && !owns(session)) dropSession(null);
      if (!session) return fail(QR_PENDING.noEvent);
      const inRange = (): boolean => heads() >= MIN_HEADS && heads() <= MAX_HEADS;
      const scheduleFirst = (): void => {
        fail(SCHEDULE_FIRST);
        steps.find((x) => x.classList.contains('err'))?.focus();
      };
      if (!inRange()) return fail(HEAD_RANGE);
      if (!renderSchedule()) return scheduleFirst();
      const s = session;
      if (frozen === null) {
        stopPolling();
        const a = await api.start(s, reviewed.map((m) => m.id));
        if (session !== s) return;
        if (a.kind !== 'roster') {
          if (a.kind === 'gone' || a.kind === 'admin') dropSession(null);
          else pollLater();
          return fail(QR_PENDING[a.kind]);
        }
        if (frozenNames(a.roster, s.removed) === null) {
          pollLater();
          return fail(QR_PENDING.bad);
        }
        frozen = a.roster;
        listChanged();
        // The frozen roster is the event's people (ADR-0076 Identity) and cannot be undone: one outside the
        // range can never become this event. It is ended, and the open control makes a new one.
        if (!inRange()) {
          void api.purge(s);
          dropSession(null);
          return fail(HEAD_RANGE);
        }
      }
      const roster = frozen;
      if (!renderSchedule()) return scheduleFirst();
      let event: EventState;
      try {
        event = createEvent(
          {
            eventName: eventName.value,
            names: roster.map((m) => m.name),
            schedule: schedule(),
            prizes: prizeInputs.slice(0, prizes).map((p) => p.value),
            games: pickedGames(),
            // ADR-0076 Identity: the server's join ids and the PIN, so a phone's own result is the projector's.
            qr: { pin: s.pin, roster },
          },
          cryptoRng(),
        );
      } catch {
        return fail(QR_PENDING.bad);
      }
      // An event stored since the session was opened (another tab's start of this one, or any other start)
      // is not replaced from here.
      const gen = await generation();
      if (session !== s) return;
      if (gen !== undefined && (gen !== s.gen || !owns(s))) {
        dropSession(null);
        return fail(QR_PENDING.noEvent);
      }
      await start(event, () => {
        // The event is stored: the projector walks it, so the lobby goes; the key has nothing left to do.
        epoch++;
        session = null;
        release(s);
      });
    };

    if (session) setMode('qr');
    else setMode('admin');
  }

  propose();
  renderNames();
  renderSchedule();
  renderPrizes();
}
