// The envelopes and flipcards finals' object picks on the projector (gh#317, gh#318; owner ruling 2026-11-16:
// the ladder's lane-placement control, gh#305 pick B): the 2D picture the room watches while the MC places each
// finalist on an object, an object and then a name, in any order. One module for both finals; only the
// object's look and its copy are the game's own (OBJECT_LOOK, COPY).
//
// Design source: the boards' idle frames, design/Gh317Envelopes.dc.html A/env-idle and design/Gh318Cards.dc.html
// A/card-idle (owner pick D1 A ROW, ADR-0033): the top bar, the game name and instruction centred under it,
// five equal objects on one baseline, a name plate under each (the pick in words, never colour alone), and the
// low band with the prize count. The idle frames draw the five picks made; the states before that (an empty
// plate, the object the next name lands on) take the ladder's placement plate, design/Gh305GamePick.dc.html
// i2-lanes B, which the owner ruled reused here. The picked status line shows only once all five are placed.
//
// This file builds the frame only: it holds no control. The MC's taps land on real-pixel controls over it
// (stage.ts), placed from PLATE_Y and objectX, so they cover the plates. Names reach the DOM through names-dom.ts.

import type { Dot } from '../../prize-event/view.ts';
import type { PickFinal } from '../../prize-event/game-contract.ts';
import { COPY as LADDER } from '../prize-ladder/renderer/copy.ts';
import { GAME_NAME, top } from '../_prize-reveal/reveal.ts';
import { fitAll, nameBox } from '../_prize-reveal/names-dom.ts';

export type ObjectsView = {
  game: PickFinal;
  eventName: string;
  dots: Dot[];
  /** The MC's prize count, 1..5, as the low band draws it. */
  prizeCount: number;
  /** The finalists' names in roster order. */
  names: readonly string[];
  /** Per object, left to right, the roster index (into `names`) of the finalist on it, or null while empty. */
  plates: readonly (number | null)[];
  /** The object the next name lands on; null once every object is filled. */
  next: number | null;
  /** An empty object's label. */
  objectLabel: (object: number) => string;
};

/** Board copy, verbatim from each board's idle frame (COPY SOURCES, owner-approved E1 / C1 2026-11-16). */
export const COPY: Record<PickFinal, { instruction: string; picked: string; note: string }> = {
  envelopes: {
    instruction: 'ผู้เข้ารอบชิง 5 คน เลือกซองของขวัญคนละซอง',
    picked: 'เลือกแล้ว รอเปิดรอบชิง',
    note: 'ซองของขวัญปิดอยู่ รางวัลอยู่ข้างใน',
  },
  flipcards: {
    instruction: 'ผู้เข้ารอบชิง 5 คน เลือกไพ่คว่ำคนละใบ',
    picked: 'เลือกไพ่แล้ว รอเปิดรอบชิง',
    note: 'ไพ่คว่ำหน้า รางวัลอยู่ด้านหลัง',
  },
};
/** The low band's unit after the prize count (both boards). */
const PRIZE_UNIT = 'รางวัล';

/** An object's centre, in frame px: the boards' five centres (280, 620, 960, 1300, 1640). */
export const objectX = (object: number): number => 280 + 340 * object;
/** Each object's box on the row (A ROW): its top, width and height, in frame px. */
const OBJECT_BOX: Record<PickFinal, { top: number; w: number; h: number }> = {
  envelopes: { top: 340, w: 300, h: 300 },
  flipcards: { top: 300, w: 280, h: 400 },
};
/** The plate's top under each object: the object's top plus 320 (envelope) or 420 (card), as the boards draw it. */
export const PLATE_Y: Record<PickFinal, number> = { envelopes: 660, flipcards: 720 };
/** Where the free finalists' name controls sit, in frame px: under the plates, above the low band. The idle
 *  frames draw every finalist placed, so no board places this row; it keeps clear of the objects it names. */
export const NAMES_Y: Record<PickFinal, number> = { envelopes: 760, flipcards: 800 };
/** A plate's name fit (the boards' NAME FIT row: 40px, floor 24px). */
const PLATE_FIT = { size: 40, floor: 24 } as const;
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(doc: Document, tag: string, attrs: Record<string, string | number>): Element {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** A rounded rect as a path, Q curves at the corners: the board's own outline for the envelope body. */
const roundRect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;

/** A closed gift envelope (env-idle): night body with a gold edge, the gold flap dipped over it, two bow loops
 *  and a seal at the flap's tip. Paint lives in play.css by class. */
function envelope(doc: Document, w: number, h: number): Element {
  const cx = w / 2;
  const seal = 180;
  const svg = svgEl(doc, 'svg', { class: 'pd-envart', width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
  svg.append(
    svgEl(doc, 'path', { class: 'pd-env-body', d: roundRect(3, 93, w - 6, 204, 12) }),
    svgEl(doc, 'path', { class: 'pd-env-flap', d: `M0,93 L${cx},${seal} L${w},93 Z` }),
    svgEl(doc, 'circle', { class: 'pd-env-bow', cx: cx - 20, cy: seal - 4, r: 11 }),
    svgEl(doc, 'circle', { class: 'pd-env-bow', cx: cx + 20, cy: seal - 4, r: 11 }),
    svgEl(doc, 'circle', { class: 'pd-env-seal', cx, cy: seal, r: 15 }),
  );
  return svg;
}

/** A face-down card (card-idle): the night hatch with a gold inset edge (play.css) and a drawn gold star in its
 *  content box, never a suit. */
function cardBack(doc: Document, w: number, h: number): HTMLElement {
  const back = el(doc, 'div', 'pd-cardback');
  const iw = w - 32;
  const ih = h - 32;
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 26 : 64;
    points.push(`${(iw / 2 + r * Math.cos(a)).toFixed(1)},${(ih / 2 + r * Math.sin(a)).toFixed(1)}`);
  }
  const svg = svgEl(doc, 'svg', { width: iw, height: ih, viewBox: `0 0 ${iw} ${ih}`, 'aria-hidden': 'true' });
  svg.appendChild(svgEl(doc, 'polygon', { class: 'pd-card-star', points: points.join(' ') }));
  back.appendChild(svg);
  return back;
}

function object(doc: Document, game: PickFinal, index: number): HTMLElement {
  const box = OBJECT_BOX[game];
  const holder = el(doc, 'div', `pd-obj ${game}`);
  holder.style.setProperty('--x', `${objectX(index) - box.w / 2}px`);
  holder.style.setProperty('--y', `${box.top}px`);
  holder.style.setProperty('--w', `${box.w}px`);
  holder.style.setProperty('--h', `${box.h}px`);
  holder.appendChild(game === 'envelopes' ? envelope(doc, box.w, box.h) : cardBack(doc, box.w, box.h));
  return holder;
}

function plate(doc: Document, index: number, view: ObjectsView): HTMLElement {
  const at = view.plates[index] ?? null;
  const empty = at === null;
  const box = el(doc, 'div', ['pd-plate pd-oplate', empty ? 'empty' : '', empty && view.next === index ? 'next' : ''].filter(Boolean).join(' '));
  box.style.setProperty('--x', `${objectX(index)}px`);
  box.style.setProperty('--plate-y', `${PLATE_Y[view.game]}px`);
  if (empty) box.appendChild(el(doc, 'span', 'pd-plate-name', view.objectLabel(index + 1)));
  else box.appendChild(nameBox(doc, 'span', 'pd-plate-name', view.names[at]!, PLATE_FIT));
  return box;
}

/** Build the object-pick frame for `view` into `frame`, replacing what was there. */
export function renderObjects(frame: HTMLElement, view: ObjectsView, doc: Document = document): void {
  const copy = COPY[view.game];
  const parts: Element[] = [top(doc, view.eventName, LADDER.finalLabel, view.dots)];
  const hud = el(doc, 'div', 'pd-ohud');
  hud.append(el(doc, 'div', 'pd-gname', GAME_NAME[view.game]), el(doc, 'div', 'pd-lk', copy.instruction));
  parts.push(hud);
  for (let i = 0; i < view.plates.length; i++) parts.push(object(doc, view.game, i));
  for (let i = 0; i < view.plates.length; i++) parts.push(plate(doc, i, view));
  const placed = view.plates.every((p) => p !== null);
  const low = el(doc, 'div', 'pd-low pd-olow');
  const left = el(doc, 'div', '');
  if (placed) left.appendChild(el(doc, 'div', 'pd-lk', copy.picked));
  const flow = el(doc, 'div', 'pd-flow');
  flow.append(el(doc, 'span', 'pd-to', String(view.prizeCount)), el(doc, 'small', '', PRIZE_UNIT));
  const right = el(doc, 'div', 'pd-rt');
  right.appendChild(el(doc, 'div', 'pd-lk', copy.note));
  low.append(left, flow, right);
  parts.push(low);
  frame.replaceChildren(...parts);
  frame.setAttribute('data-screen', 'objects');
  fitAll(frame);
}
