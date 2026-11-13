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

import { ELIMINATION_ROUNDS, proposeSchedule } from '../prize-draw/schedule.ts';
import { MAX_HEADS, MAX_PRIZES, MIN_HEADS, MIN_PRIZES, createEvent, cryptoRng, cutsInHalf, scheduleIssues, type EventState } from './event.ts';
import { OLD_TAB_OPEN, REFUSED_BROWSER, openEventStore, type EventStore, type StoreEnv } from './store.ts';
import { isCutGame, isFinalGame, type CutGame, type FinalGame, type GameChoices } from './game-contract.ts';
import { parseRoster, type NameIssue } from './names.ts';
import { writeName } from '../play/_prize-reveal/names-dom.ts';

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
};

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
  // An untouched empty list is not an error; after a start is tried, an empty list says why it failed.
  let tried = false;
  // The MC's own edits to the schedule survive a change in the roster; "ใช้ค่าที่ระบบเสนอ" drops them.
  let edited = false;

  const heads = (): number => {
    const r = parseRoster(namesBox.value);
    return r.names.length + r.refused.length + r.duplicates.length;
  };
  const schedule = (): number[] => [heads(), ...steps.map((s) => (s.value.trim() === '' ? Number.NaN : Number(s.value))), 5];

  const propose = (): void => {
    const n = heads();
    const proposal = n >= MIN_HEADS ? proposeSchedule(n) : null;
    steps.forEach((s, i) => (s.value = proposal ? String(proposal[i + 1]) : ''));
  };

  const renderNames = (): void => {
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
  // halving is cleared there and then, never kept for the start to refuse.
  function offerCards(sched: readonly number[]): void {
    for (let step = 0; step < ELIMINATION_ROUNDS; step++) {
      const halves = cutsInHalf(sched, step + 1);
      const b = cardButtons[step];
      if (b) b.disabled = !halves;
      if (!halves && chosen[step] === 'cards') {
        chosen[step] = null;
        renders[step]?.();
      }
    }
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
  const takeOver = async (store: EventStore, event: EventState, asked: boolean): Promise<void> => {
    if (!asked && !win.confirm(CONFIRM_REPLACE)) return;
    if (await store.takeOver(event)) open();
    else storageFailed();
  };

  /** Store `event`, asking first when it would replace a saved one; open the projector once committed. */
  const start = async (event: EventState): Promise<void> => {
    const store = await opening;
    if (!store) {
      refusedBrowser();
      return;
    }
    // A stale answer means the saved event moved while this start ran: look again, ask again. Bounded so
    // a store that keeps moving ends in the failure message rather than a loop.
    let asked = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (store.status() === 'revoked') return takeOver(store, event, asked);
      const now = await store.load();
      if (!now) {
        if (store.status() === 'revoked') return takeOver(store, event, asked);
        break;
      }
      if (now.state) {
        if (!win.confirm(CONFIRM_REPLACE)) return;
        asked = true;
      }
      const r = await store.put(now.raw, event);
      if (r.ok) {
        open();
        return;
      }
      if (r.reason === 'failed') {
        if (store.status() === 'revoked') return takeOver(store, event, asked);
        break;
      }
    }
    storageFailed();
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (starting) return;
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
    void start(event).then(
      () => (starting = false),
      () => {
        starting = false;
        storageFailed();
      },
    );
  });

  propose();
  renderNames();
  renderSchedule();
  renderPrizes();
}
