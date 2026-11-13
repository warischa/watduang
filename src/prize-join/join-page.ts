// gh#308: the phone join page's script (src/pages/game/prize-draw/join.astro). A phone opens the page from
// the QR on the main screen, the person types a nickname, and the page shows what the join server answered.
// Pure logic is in join.ts; this file renders it.
//
// Design source: direction A POSTER of design/Gh302Phone.dc.html, frames join-pin, join-name, join-taken
// and join-device at 320 and 375 (owner pick 2026-11-11, ADR-0033). Thai strings are the board's approved
// copy verbatim; a name refusal reuses the owner-approved roster refusals of the setup page
// (setup-page.ts REFUSAL_COPY); an answer the board does not draw has owner-approved copy (ANSWER_COPY).
//
// A normal site page, not a play surface: it is not under src/play, so the play-route rules do not bind it.
// It renders no link at all.
//
// Names: the server echoes the stored name, and storage keeps it, so a name on this page is attacker-owned
// (ADR-0026). Every name goes through writeName / nameBox (src/play/_prize-reveal/names-dom.ts), the one
// textContent sink of the prize-draw screens. No markup sink anywhere in this file.

import { fitAll, nameBox, writeName, type FitSpec } from '../play/_prize-reveal/names-dom.ts';
import { REFUSAL_COPY } from '../prize-event/setup-page.ts';
import type { NameIssue } from '../prize-event/names.ts';
import {
  LINK_KEY,
  classify,
  joinUrl,
  newDeviceToken,
  parseLink,
  parseRecord,
  readJoinLink,
  storageKey,
  validateJoinName,
  type DeviceRecord,
  type Outcome,
} from './join.ts';

/** Board copy, direction A (design/Gh302Phone.dc.html COPY SOURCES row), verbatim. */
export const COPY = {
  pinHeading: 'ใส่ PIN ของงาน',
  pinHint: 'ดู PIN บนจอใหญ่ ถ้าสแกน QR มา PIN จะใส่ให้แล้ว',
  next: 'ถัดไป',
  nameHeading: 'ตั้งชื่อที่จะขึ้นจอ',
  nameHint: 'ชื่อเล่นหรือชื่อเรียกก็ได้ ไม่เกิน 12 ตัว',
  nameLabel: 'ชื่อของคุณ',
  join: 'เข้าร่วม',
  deletionNote: 'รายชื่อทั้งหมดจะถูกลบหลังจบงาน',
  deviceHeading: 'เครื่องนี้เข้าร่วมแล้ว',
  onePerDevice: '1 เครื่องเข้าร่วมได้ 1 ชื่อ',
  yourName: 'ชื่อของคุณบนจอ',
  keepOpen: 'เปิดหน้านี้ค้างไว้ เมื่อจอใหญ่ขึ้นรหัสรอบ ให้ใส่รหัสที่หน้านี้',
} as const;

/** The name-taken error, as its runs: the board's string with the typed name where the sample name is. */
export const takenRuns = (name: string): Array<{ text: string } | { name: string }> => [
  { text: 'ชื่อ “' },
  { name },
  { text: '” มีคนใช้แล้ว ลองเติมอักษรย่อ เช่น “' },
  { name },
  { text: ' ส.”' },
];

/** Answers the board does not draw, in owner-approved copy (gh#308), verbatim. */
export const ANSWER_COPY = {
  noEvent: 'ไม่พบงานนี้ ลองสแกน QR บนจออีกครั้ง',
  full: 'งานนี้รับคนครบแล้ว ติดต่อผู้จัด',
  removed: 'ผู้จัดนำชื่อนี้ออกจากรายชื่อแล้ว',
  started: 'งานเริ่มแล้ว เข้าร่วมเพิ่มไม่ได้',
  gone: 'งานนี้หมดเวลาแล้ว',
  unavailable: 'ระบบไม่ว่าง ลองกดส่งอีกครั้ง',
  bad: 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง',
  pin: 'รหัสงานไม่ถูกต้อง ลองสแกน QR บนจออีกครั้ง',
  emptyName: 'พิมพ์ชื่อเล่นก่อนกดเข้าร่วม',
} as const;

/** The board's NAME FIT row for the phone: the header pill and the name card. */
export const PHONE_FIT: { pill: FitSpec; card: FitSpec } = {
  pill: { size: 16, floor: 16 },
  card: { size: 34, floor: 21 },
};

/** A send that gets no answer in this long is treated as no answer: it may have landed, so it is retried. */
export const SEND_TIMEOUT_MS = 15000;

type KeyStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type JoinEnv = {
  /** The page URL. Only the fragment carries the link; the query is never read for it. */
  location: { pathname: string; search: string; hash: string };
  /** Used once, to take the link out of the visible URL after it is read. */
  history: { replaceState(data: unknown, unused: string, url: string): void };
  /** sessionStorage, or null: keeps the stripped link for a reload of this tab only. */
  session: KeyStore | null;
  /** localStorage, or null when the browser refuses it (the page then remembers for this visit only). */
  storage: KeyStore | null;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  getRandomValues: (a: Uint8Array) => Uint8Array;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type JoinHandle = {
  /** Resolves once the page has handled every submit so far. */
  settled(): Promise<void>;
  /** Fit the rendered names again (fonts loaded, viewport changed). */
  refit(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const refusal = (reason: NameIssue): string => (reason === 'empty' ? ANSWER_COPY.emptyName : REFUSAL_COPY[reason]);

export function mountJoin(root: HTMLElement, env: JoinEnv): JoinHandle {
  const doc = root.ownerDocument;
  const link = takeLink();
  let pin = link.pin;
  let queue: Promise<void> = Promise.resolve();
  let busy = false;

  const handle: JoinHandle = { settled: () => queue, refit: () => fitAll(root) };
  if (!link.eventId) {
    message(ANSWER_COPY.noEvent);
    return handle;
  }
  const eventId = link.eventId;
  const key = storageKey(eventId);
  let rec: DeviceRecord = load() ?? { token: newDeviceToken(env.getRandomValues) };

  if (rec.id && rec.name !== undefined) device(rec.name);
  else if (!pin) pinScreen(null);
  else nameScreen('', null);
  return handle;

  /**
   * The link from the fragment, which is then removed from the visible URL so a screenshot or a share of
   * the page does not carry the PIN. The tab keeps it, so a reload of this page finds the event again; a
   * new fragment (another scan) replaces it.
   */
  function takeLink(): ReturnType<typeof readJoinLink> {
    const { pathname, search, hash } = env.location;
    if (hash) {
      env.history.replaceState(null, '', pathname + search);
      const fresh = readJoinLink(hash);
      // A fragment that names no event is a bad scan: it shows no event, never the one kept from before.
      if (!fresh.eventId) return fresh;
      try {
        env.session?.setItem(LINK_KEY, JSON.stringify(fresh));
      } catch {
        // Not kept: a reload then finds no event.
      }
      return fresh;
    }
    try {
      return parseLink(env.session?.getItem(LINK_KEY) ?? null);
    } catch {
      return parseLink(null);
    }
  }

  function load(): DeviceRecord | null {
    try {
      return parseRecord(env.storage?.getItem(key) ?? null);
    } catch {
      return null;
    }
  }
  function save(): void {
    try {
      env.storage?.setItem(key, JSON.stringify(rec));
    } catch {
      // A browser that refuses storage still joins; it remembers for this visit only.
    }
  }

  // ---- screens -------------------------------------------------------------------------------------

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** The board's header band. The event title slot stays empty: the join route does not return a title. */
  function frame(name: string | null): HTMLElement {
    const top = el('div', 'pj-top');
    top.append(el('span', 'pj-ev'));
    if (name !== null) top.append(nameBox(doc, 'span', 'pj-me', name, PHONE_FIT.pill));
    const body = el('div', 'pj-bd');
    root.replaceChildren(top, body);
    return body;
  }

  /** The board's error icon: a punch disc with an ink mark. Colours come from the page stylesheet by class
   *  (tokens), never as values copied here. */
  function errorIcon(): Element {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const parts: Array<[string, Record<string, string>]> = [
      ['circle', { cx: '12', cy: '12', r: '11', class: 'pj-ic-disc' }],
      ['path', { d: 'M12 6v8', fill: 'none', 'stroke-width': '3', 'stroke-linecap': 'round', class: 'pj-ic-mark' }],
      ['circle', { cx: '12', cy: '18', r: '1.7', class: 'pj-ic-dot' }],
    ];
    for (const [tag, attrs] of parts) {
      const p = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
      svg.append(p);
    }
    return svg;
  }

  /** An error row under a field: icon, then the words; tied to the field by aria-describedby. */
  function showError(field: HTMLInputElement, slot: HTMLElement, content: Node | string): void {
    const words = el('span');
    if (typeof content === 'string') words.textContent = content;
    else words.append(content);
    slot.replaceChildren(errorIcon(), words);
    slot.hidden = false;
    field.classList.add('pj-err');
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', slot.id);
  }

  function form(id: string, onSubmit: () => void): HTMLFormElement {
    const f = el('form', 'pj-form');
    f.id = id;
    f.setAttribute('novalidate', '');
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!busy) onSubmit();
    });
    return f;
  }

  function pinScreen(error: string | null): void {
    const body = frame(null);
    const h = el('h1', 'pj-h', COPY.pinHeading);
    h.id = 'pj-pin-h';
    const hint = el('p', 'pj-sub', COPY.pinHint);
    hint.id = 'pj-pin-hint';
    const field = el('input', 'pj-inp pj-code');
    field.id = 'pj-pin';
    field.type = 'text';
    field.setAttribute('inputmode', 'numeric');
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('aria-labelledby', 'pj-pin-h');
    field.setAttribute('aria-describedby', 'pj-pin-hint');
    field.value = pin;
    const slot = el('div', 'pj-emsg');
    slot.id = 'pj-pin-msg';
    slot.setAttribute('role', 'alert');
    slot.hidden = true;
    const btn = el('button', 'pj-btn', COPY.next);
    btn.type = 'submit';
    const f = form('pj-pin-form', () => {
      const typed = field.value.trim();
      if (!typed) {
        field.focus();
        return;
      }
      pin = typed;
      nameScreen('', null);
    });
    f.append(field, slot, btn);
    body.append(h, hint, f);
    if (error) showError(field, slot, error);
  }

  function nameScreen(value: string, error: Node | string | null): void {
    const body = frame(null);
    const h = el('h1', 'pj-h', COPY.nameHeading);
    const hint = el('p', 'pj-sub', COPY.nameHint);
    hint.id = 'pj-name-hint';
    const label = el('label', 'pj-lbl', COPY.nameLabel);
    label.setAttribute('for', 'pj-name');
    const field = el('input', 'pj-inp');
    field.id = 'pj-name';
    field.type = 'text';
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('autocapitalize', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('enterkeyhint', 'go');
    field.setAttribute('dir', 'auto');
    field.value = value;
    const slot = el('div', 'pj-emsg');
    slot.id = 'pj-name-msg';
    slot.setAttribute('role', 'alert');
    slot.hidden = true;
    const btn = el('button', 'pj-btn', COPY.join);
    btn.type = 'submit';
    const note = el('p', 'pj-note', COPY.deletionNote);
    const f = form('pj-name-form', () => {
      // Busy from the tap itself, so a second tap before the first send starts is ignored, not queued.
      busy = true;
      queue = queue
        .then(() => submitName(field, slot, btn))
        .finally(() => {
          busy = false;
        });
    });
    f.append(label, field, slot, btn);
    body.append(h, hint, f, note);
    if (error !== null) showError(field, slot, error);
  }

  function device(name: string): void {
    const body = frame(name);
    const box = el('div', 'pj-box');
    box.append(el('div', 'pj-lbl', COPY.yourName), nameBox(doc, 'div', 'pj-who', name, PHONE_FIT.card));
    body.append(el('h1', 'pj-h', COPY.deviceHeading), el('p', 'pj-sub', COPY.onePerDevice), box, el('p', 'pj-note', COPY.keepOpen));
    fitAll(root);
  }

  function message(text: string): void {
    frame(null).append(el('h1', 'pj-h', text));
  }

  function takenMessage(name: string): Node {
    const span = el('span');
    for (const run of takenRuns(name)) {
      if ('text' in run) span.append(doc.createTextNode(run.text));
      else {
        const n = el('span', 'pj-nm');
        writeName(n, run.name);
        span.append(n);
      }
    }
    return span;
  }

  // ---- sending -------------------------------------------------------------------------------------

  /** One send of `name`. Leaves the record `pending` only while the answer is unknown. */
  async function send(name: string): Promise<Outcome> {
    rec = { token: rec.token, pending: name };
    save();
    let status: number | null = null;
    let body: unknown = null;
    const ctl = new AbortController();
    const timer = env.setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await env.fetch(joinUrl(eventId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, name, token: rec.token }),
        cache: 'no-store',
        credentials: 'same-origin',
        signal: ctl.signal,
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch {
      status = null;
    } finally {
      env.clearTimeout(timer);
    }
    const out = classify(status, body);
    if (out.kind === 'joined') rec = { token: rec.token, id: out.id, name: out.name };
    else if (out.kind !== 'unavailable') rec = { token: rec.token };
    save();
    return out;
  }

  async function submitName(field: HTMLInputElement, slot: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    const checked = validateJoinName(field.value);
    if (!checked.ok) {
      showError(field, slot, refusal(checked.reason));
      field.focus();
      return;
    }
    btn.disabled = true;
    field.readOnly = true;
    try {
      // One name per device: a name whose send may have landed is settled before any other is sent.
      const earlier = rec.pending;
      if (earlier !== undefined && earlier !== checked.name) {
        const first = await send(earlier);
        if (first.kind === 'joined' || first.kind === 'unavailable') return show(first, checked.name);
      }
      show(await send(checked.name), checked.name);
    } finally {
      btn.disabled = false;
      field.readOnly = false;
    }
  }

  function show(out: Outcome, typed: string): void {
    switch (out.kind) {
      case 'joined':
        return device(out.name);
      case 'taken':
        return nameScreen(typed, takenMessage(typed));
      case 'name':
        return nameScreen(typed, refusal(out.reason));
      case 'unavailable':
        return nameScreen(typed, ANSWER_COPY.unavailable);
      case 'bad':
        return nameScreen(typed, ANSWER_COPY.bad);
      case 'pin':
        pin = '';
        return pinScreen(ANSWER_COPY.pin);
      case 'full':
      case 'removed':
      case 'started':
      case 'gone':
        return message(ANSWER_COPY[out.kind]);
    }
  }
}
