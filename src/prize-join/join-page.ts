// gh#308: the phone join page's script (src/pages/game/prize-draw/join.astro). A phone opens the page from
// the QR on the main screen, the person types a nickname, and the page shows what the join server answered.
// Pure logic is in join.ts; this file renders it.
//
// Design source: direction A POSTER of design/Gh302Phone.dc.html, frames join-pin, join-name, join-taken
// and join-device at 320 and 375 (owner pick 2026-11-11, ADR-0033). Thai strings are the board's approved
// copy verbatim; a name refusal reuses the owner-approved roster refusals of the setup page
// (setup-page.ts REFUSAL_COPY); an answer the board does not draw has owner-approved copy (ANSWER_COPY).
//
// gh#309: once joined, the same page runs the result flow (pure half: reveal.ts). One status call before
// any reveal tells the phone whether it is on the frozen roster; after that every screen is computed here
// from the typed round codes, and no code typed ever reaches the network.
//
// A normal site page, not a play surface: it is not under src/play, so the play-route rules do not bind it.
// It renders no link at all. The flow's screens still arm their controls (armAllButtons): a rule button
// that comes up where "see my result" was tapped must not take that tap's second contact.
//
// Names: the server echoes the stored name, and storage keeps it, so a name on this page is attacker-owned
// (ADR-0026). Every name goes through writeName / nameBox (src/play/_prize-reveal/names-dom.ts), the one
// textContent sink of the prize-draw screens. No markup sink anywhere in this file.

import { fitAll, nameBox, writeName, type FitSpec } from '../play/_prize-reveal/names-dom.ts';
import { armAllButtons } from '../games/_arm-gate.ts';
import { REFUSAL_COPY } from '../prize-event/setup-page.ts';
import type { NameIssue } from '../prize-event/names.ts';
import { CUT_CODE_LENGTH, FINAL_ROUND } from '../prize-draw/round-code.ts';
import type { Card, Suit } from '../prize-draw/cards.ts';
import { COPY as CARD_COPY, rankLabel } from '../play/prize-cards/renderer/copy.ts';
import { SUITS, isRed } from '../play/prize-cards/renderer/paint.ts';
import {
  applyStatus,
  chooseRule,
  classifyStatus,
  enterCode,
  freshReveal,
  parseReveal,
  revealKey,
  revealView,
  statusUrl,
  type RevealRecord,
  type RevealScreen,
} from './reveal.ts';
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
  /** The join button's label while a name is being sent (owner-approved 2026-11-14); the ellipsis is U+2026. */
  sending: 'กำลังส่ง…',
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

/** The round as the phone names it: its number, and the final by the projector's own word for it. */
const roundName = (round: number): string => (round === FINAL_ROUND ? 'รอบชิง' : `รอบที่ ${round}`);

/** Thai suit names: the board draws the club; the other three are owner-approved (2026-11-14). */
const SUIT_NAME: Record<Suit, string> = {
  C: 'ดอกจิก',
  S: 'โพดำ',
  H: 'โพแดง',
  D: 'ข้าวหลามตัด',
};

/**
 * The result flow (gh#309), board copy verbatim: direction A POSTER of design/Gh302Phone.dc.html, frames
 * reveal-code, reveal-wrong, reveal-pass, reveal-out, reveal-card and claim-320 (COPY APPROVED 2026-11-11).
 * A figure inside a string is the only part that varies, exactly where the board varies it. The strings the
 * board does not draw are the owner's answers of 2026-11-14, verbatim.
 */
export const REVEAL_COPY = {
  codeSub: 'ใส่รหัสรอบจากจอใหญ่ เพื่อดูผลของคุณ',
  codeLabel: 'รหัสรอบ',
  seeMine: 'ดูผลของฉัน',
  offline: 'ผลคำนวณในเครื่องนี้ ไม่ต้องรอเน็ต',
  wrongCode: (round: number): string => `รหัสนี้ไม่ใช่ของ${roundName(round)} ดูรหัสบนจอใหญ่อีกครั้ง`,
  passHeading: (round: number): string => `ผ่านรอบที่ ${round}`,
  /** Owner copy 2026-11-14: the board's line names the head count left, which no code carries to a phone. */
  passSub: (next: number): string => (next === FINAL_ROUND ? 'ไปต่อรอบชิง รอรหัสรอบชิงบนจอใหญ่' : `ไปต่อรอบที่ ${next} รอรหัสรอบถัดไปบนจอใหญ่`),
  waitNext: 'รอรหัสรอบถัดไปจากจอใหญ่',
  outHeading: (round: number): string => `${roundName(round)} ไม่ผ่าน`,
  outSub: 'ขอบคุณที่ร่วมสนุก เชียร์คนที่เหลือต่อได้เลย',
  yourCard: 'ไพ่ของคุณ',
  cardCaption: (card: Card): string => `${rankLabel(card.rank)} ${SUIT_NAME[card.suit]}`,
  /** gh#300 condition 4: the person taps the rule the main screen drew. It takes the place of the board's
   *  card-screen note, which asked for the round code instead (owner ruling 2026-11-14). */
  rulePrompt: 'แตะกติกาที่จอใหญ่เปิด',
  claimHeading: 'คุณได้รางวัล',
  /** The phone knows its place, never the prize's name: the projector's own form for a prize with no name. */
  prize: (place: number): string => `รางวัลที่ ${place}`,
  claimNote: 'แสดงหน้านี้ให้ทีมงานดู ชื่อต้องตรงกับบนจอใหญ่',
  provisional: 'ยังไม่ยืนยันชื่อ ผลจริงดูที่จอใหญ่',
} as const;

/** The status route is asked again this long after it says the event has not started. */
export const STATUS_OPEN_MS = 15000;
/** The waits before each new ask after no answer at all, the last one repeated. */
export const STATUS_RETRY_MS = [2000, 4000, 8000, 16000, 30000];

/** The board's NAME FIT row for the phone: the header pill and the name card. */
export const PHONE_FIT: { pill: FitSpec; card: FitSpec } = {
  pill: { size: 16, floor: 16 },
  card: { size: 34, floor: 21 },
};

/** A send that gets no answer in this long is treated as no answer: it may have landed, so it is retried. */
export const SEND_TIMEOUT_MS = 15000;

type KeyStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type JoinEnv = {
  /** The game's Thai name from the manifest (read where the page is built): the neutral heading above the not-found row. */
  gameName: string;
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
    notFound();
    return handle;
  }
  const eventId = link.eventId;
  const key = storageKey(eventId);
  let rec: DeviceRecord = load() ?? { token: newDeviceToken(env.getRandomValues) };
  const rkey = revealKey(eventId);
  /** The result flow's record (reveal.ts); null until this device has joined under a usable PIN. */
  let reveal: RevealRecord | null = null;
  /** Set once the status route said `started` or `gone` in this visit: it is never asked again. */
  let statusDone = false;
  let statusMisses = 0;

  if (rec.id && rec.name !== undefined) joinedFlow(loadReveal() ?? freshReveal(pin));
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

  /** No event in the link: the game's name as a neutral heading, then the answer as the board's error row. */
  function notFound(): void {
    const body = frame(null);
    const row = el('div', 'pj-emsg');
    row.setAttribute('role', 'alert');
    row.append(errorIcon(), el('span', undefined, ANSWER_COPY.noEvent));
    body.append(el('h1', 'pj-h', env.gameName), row);
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

  // ---- the result flow (gh#309) --------------------------------------------------------------------
  //
  // No call here reaches the network but checkStatus, and it runs only while no code has been typed: a
  // result is computed on this phone from the typed codes alone (gh#299 decision 5, gh#300 protocol).

  function loadReveal(): RevealRecord | null {
    try {
      return parseReveal(env.storage?.getItem(rkey) ?? null);
    } catch {
      return null;
    }
  }
  function saveReveal(): void {
    if (!reveal) return;
    try {
      env.storage?.setItem(rkey, JSON.stringify(reveal));
    } catch {
      // Not kept: a reload asks the status again and the codes are typed again.
    }
  }

  /** Joined: the device screen until the event starts, then the result flow. No usable PIN: the device screen only. */
  function joinedFlow(start: RevealRecord | null): void {
    reveal = start;
    if (!reveal) return device(rec.name!);
    saveReveal();
    if (reveal.started) renderFlow();
    else device(rec.name!);
    if (mayAsk()) askStatus(0);
  }

  /** The status may be asked only before membership is known and before the first code interaction. */
  function mayAsk(): boolean {
    return !statusDone && !!reveal && !reveal.typed && reveal.member === null && reveal.entries.length === 0 && reveal.final === null;
  }

  /** The first code interaction, accepted or not: no status call after it; the phone keeps the membership it has. */
  function markTyped(): void {
    if (!reveal || reveal.typed) return;
    reveal = { ...reveal, typed: true };
    saveReveal();
  }

  function askStatus(ms: number): void {
    env.setTimeout(() => {
      queue = queue.then(checkStatus);
    }, ms);
  }

  /** The one status call: non-blocking, before any reveal. Asked again only while the event is open or unanswered. */
  async function checkStatus(): Promise<void> {
    if (!mayAsk() || !rec.id) return;
    let status: number | null = null;
    let body: unknown = null;
    const ctl = new AbortController();
    const timer = env.setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await env.fetch(statusUrl(eventId, rec.id), {
        method: 'GET',
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
    if (!reveal) return;
    const out = classifyStatus(status, body);
    const before = reveal;
    reveal = applyStatus(reveal, out);
    saveReveal();
    if (out.kind === 'member' || out.kind === 'gone') statusDone = true;
    else if (mayAsk()) askStatus(out.kind === 'open' ? STATUS_OPEN_MS : STATUS_RETRY_MS[Math.min(statusMisses++, STATUS_RETRY_MS.length - 1)]!);
    // A membership answer changes what the screen says, never what the person is typing: the draft stays.
    if (reveal.started && (!before.started || before.member !== reveal.member)) renderFlow(true);
  }

  /** The board's check badge, drawn node by node. */
  function passBadge(): HTMLElement {
    const badge = el('div', 'pj-badge');
    const svg = doc.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of Object.entries({ width: '60', height: '60', viewBox: '0 0 24 24', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
    const path = doc.createElementNS(SVG_NS, 'path');
    const attrs = { d: 'M4.5 12.5l5 5L19.5 7', fill: 'none', stroke: 'currentColor', 'stroke-width': '3.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v);
    svg.append(path);
    badge.append(svg);
    return badge;
  }

  /** The board's suit drawing (the cards game's own path data), coloured by class. */
  function suitIcon(suit: Suit): Element {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of Object.entries({ width: '84', height: '84', viewBox: '0 0 24 24', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
    const g = doc.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', isRed(suit) ? 'pj-suit pj-red' : 'pj-suit');
    for (const [cx, cy, r] of SUITS[suit].circles) {
      const c = doc.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', String(r));
      g.append(c);
    }
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', SUITS[suit].path);
    g.append(p);
    svg.append(g);
    return svg;
  }

  function nameCard(name: string): HTMLElement {
    const box = el('div', 'pj-box');
    box.append(el('div', 'pj-lbl', COPY.yourName), nameBox(doc, 'div', 'pj-who', name, PHONE_FIT.card));
    return box;
  }

  /** The code form for `round`: the label, the field, its error row, the button. A wrong code shows the
   *  board's error in place (reveal-wrong); a code that reads moves the flow on. */
  function codeForm(round: number, typed: string): HTMLFormElement {
    const label = el('label', 'pj-lbl', REVEAL_COPY.codeLabel);
    label.setAttribute('for', 'pj-code');
    const field = el('input', 'pj-inp pj-code');
    field.id = 'pj-code';
    field.type = 'text';
    field.setAttribute('inputmode', 'numeric');
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('enterkeyhint', 'go');
    field.value = typed;
    // A deal code is 12 digits: the board's smaller code size (reveal-code-card) takes over past 9.
    const size = (): void => {
      const digits = field.value.replace(/[^0-9๐-๙]/g, '').length;
      if (digits > CUT_CODE_LENGTH) field.classList.add('pj-c12');
      else field.classList.remove('pj-c12');
    };
    field.addEventListener('input', () => {
      markTyped();
      size();
    });
    size();
    const slot = el('div', 'pj-emsg');
    slot.id = 'pj-code-msg';
    slot.setAttribute('role', 'alert');
    slot.hidden = true;
    const btn = el('button', 'pj-btn', REVEAL_COPY.seeMine);
    btn.type = 'submit';
    const f = form('pj-code-form', () => {
      markTyped();
      if (!reveal || !rec.id) return;
      const next = enterCode(reveal, rec.id, field.value);
      if (!next) {
        showError(field, slot, REVEAL_COPY.wrongCode(round));
        field.focus();
        return;
      }
      reveal = next;
      saveReveal();
      renderFlow();
    });
    f.append(label, field, slot, btn);
    return f;
  }

  function cardScreen(body: HTMLElement, screen: Extract<RevealScreen, { kind: 'card' }>): void {
    const card = el('div', 'pj-pcard');
    const rank = rankLabel(screen.card.rank);
    const red = isRed(screen.card.suit) ? ' pj-red' : '';
    card.append(el('span', `pj-rk${red}`, rank), suitIcon(screen.card.suit), el('span', `pj-rk2${red}`, rank));
    const rules = el('div', 'pj-rules');
    screen.pair.forEach((rule, i) => {
      const b = el('button', 'pj-btn', CARD_COPY.rule[rule]);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (!reveal || !rec.id) return;
        const next = chooseRule(reveal, rec.id, i === 0 ? 0 : 1);
        if (!next) return;
        reveal = next;
        saveReveal();
        renderFlow();
      });
      rules.append(b);
    });
    body.append(
      el('h1', 'pj-h', roundName(screen.round)),
      el('p', 'pj-sub', CARD_COPY.gameName),
      el('div', 'pj-lbl', REVEAL_COPY.yourCard),
      card,
      el('div', 'pj-cap', REVEAL_COPY.cardCaption(screen.card)),
      el('p', 'pj-note', REVEAL_COPY.rulePrompt),
      rules,
    );
  }

  /** Draw the flow's screen for the record, then fit names and arm every control it put up (ADR-0057:
   *  a button that replaces the one just tapped must not take the second contact of that tap). */
  function renderFlow(keepDraft = false): void {
    if (!reveal || !rec.id || rec.name === undefined) return;
    const name = rec.name;
    // Only a refresh in place (a membership answer) keeps the code being typed; a screen an accepted code
    // or rule moved to starts with an empty field.
    const typed = keepDraft ? (root.querySelector<HTMLInputElement>('#pj-code')?.value ?? '') : '';
    const { screen, provisional } = revealView(reveal, rec.id);
    const body = frame(name);
    switch (screen.kind) {
      case 'code':
        body.append(el('h1', 'pj-h', roundName(screen.round)), el('p', 'pj-sub', REVEAL_COPY.codeSub), codeForm(screen.round, typed), el('p', 'pj-note', REVEAL_COPY.offline));
        break;
      case 'pass':
        body.append(
          passBadge(),
          el('h1', 'pj-h', REVEAL_COPY.passHeading(screen.round)),
          el('p', 'pj-sub', REVEAL_COPY.passSub(screen.next)),
          nameCard(name),
          el('p', 'pj-note', REVEAL_COPY.waitNext),
          codeForm(screen.next, typed),
        );
        break;
      case 'out':
        body.append(el('h1', 'pj-h', REVEAL_COPY.outHeading(screen.round)), el('p', 'pj-sub', REVEAL_COPY.outSub), nameCard(name));
        break;
      case 'card':
        cardScreen(body, screen);
        break;
      case 'claim': {
        const prize = el('div', 'pj-prize');
        prize.append(el('div', 'pj-pz', REVEAL_COPY.prize(screen.slot + 1)), nameBox(doc, 'div', 'pj-who', name, PHONE_FIT.card));
        body.append(el('h1', 'pj-h', REVEAL_COPY.claimHeading), prize, el('p', 'pj-note', REVEAL_COPY.claimNote));
        break;
      }
      case 'removed':
        body.append(el('h1', 'pj-h', ANSWER_COPY.removed), nameCard(name));
        break;
    }
    if (provisional && screen.kind !== 'code' && screen.kind !== 'removed') body.append(el('p', 'pj-note', REVEAL_COPY.provisional));
    fitAll(root);
    armAllButtons(body);
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
    const idle = btn.textContent;
    btn.disabled = true;
    btn.textContent = COPY.sending;
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
      btn.textContent = idle;
      field.readOnly = false;
    }
  }

  function show(out: Outcome, typed: string): void {
    switch (out.kind) {
      case 'joined':
        // A join was accepted under this PIN, so it is the event key (ADR-0076 Identity); a fresh join
        // starts a fresh result record.
        return joinedFlow(freshReveal(pin));
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
