// The prize-draw setup page's script (src/pages/game/prize-draw/index.astro). Reads the form, shows what
// stops the event from starting, and on "เริ่มงาน" builds the event, stores it and opens the projector route.
// A normal site page, not a play surface: the rules of src/play/** do not bind it, and its one navigation
// (to the play route, after the event is stored) is a script step because it must not happen before the
// store succeeds.
//
// Every name this page shows goes through writeName (src/play/_prize-reveal/names-dom.ts), the one
// textContent sink shared with the projector. No innerHTML anywhere in this file.
//
// Copy: the board's approved strings (design/Gh302Setup.dc.html, direction A), plus the strings the board
// did not draw, listed in the gh#304 evidence README and approved there by the owner on 2026-11-11: the
// refusal message per name reason, the head-count range and STORAGE_FAILED. A refusal row is the icon, the
// name through the name sink, then the fixed message for its reason; a message never carries the name.

import { proposeSchedule } from '../prize-draw/schedule.ts';
import { MAX_HEADS, MAX_PRIZES, MIN_HEADS, MIN_PRIZES, createEvent, cryptoRng, scheduleIssues, withEventLock } from './event.ts';
import { parseRoster, type NameIssue } from './names.ts';
import { writeName } from '../play/_prize-reveal/names-dom.ts';

/** Owner-approved, no board string: shown when the browser refuses to store the event. */
export const STORAGE_FAILED = 'บันทึกงานไม่ได้ เบราว์เซอร์นี้ไม่ให้เก็บข้อมูล';

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

/** Owner-approved: the head count is outside what an event can start with. */
export const HEAD_RANGE = `ใส่ได้ ${MIN_HEADS} ถึง ${MAX_HEADS} ชื่อ`;

const STEP_LABELS = ['เริ่ม', 'หลังรอบ 1', 'หลังรอบ 2', 'หลังรอบ 3', 'รอบชิง'];
const SCHEDULE_FIRST = 'แก้ตารางคัดออกก่อน แล้วจึงเริ่มงานได้';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The page's window, as far as this script uses it. The real `window` fits as is: its locks are
 *  `navigator.locks`, absent outside a secure context, and then nothing is stored (event.ts withEventLock). */
type Win = {
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  location: { assign(url: string): void };
  navigator?: { locks?: Pick<LockManager, 'request'> };
};

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

export function mountSetup(doc: Document, win: Win): void {
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
    const n = sched[0]!;
    const issues = n >= MIN_HEADS && n <= MAX_HEADS ? scheduleIssues(sched, n) : [];
    steps.forEach((s, i) => s.classList.toggle('err', issues.some((x) => x.index === i + 1)));
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

  // A start waiting on the event lock: a second submit before it has run would store a second event.
  let starting = false;
  const storageFailed = (): void => {
    startMsg.replaceChildren(errorRow(doc, { text: STORAGE_FAILED }));
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
      },
      cryptoRng(),
    );
    let storage: Win['localStorage'] | null = null;
    try {
      storage = win.localStorage ?? null;
    } catch {
      storage = null;
    }
    // Stored inside the event lock, so it never lands between a projector screen's read and its write; a
    // running event is replaced (a new key), and every screen on it takes the new one up. The projector
    // route opens only once the write has landed.
    starting = true;
    void withEventLock(win.navigator?.locks, storage, (tx) => {
      try {
        if (tx.write(event)) win.location.assign(form.getAttribute('data-play') ?? '/');
        else storageFailed();
      } finally {
        starting = false;
      }
    }).then((ran) => {
      if (ran) return;
      starting = false;
      storageFailed();
    });
  });

  propose();
  renderNames();
  renderSchedule();
  renderPrizes();
}
