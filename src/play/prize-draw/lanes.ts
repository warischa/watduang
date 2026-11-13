// The ladder final's lane picks on the projector (gh#305 item 2, owner pick B): the 2D picture the room
// watches while the MC places each finalist on a start lane, a lane and then a name, in any order.
//
// Design source: design/Gh305GamePick.dc.html frame i2-lanes B, drawn on design/Gh303Ladder.dc.html ld-idle B
// (both picked, ADR-0033): the lanes in depth, the five plates near and large, the prize slots far. An empty
// plate is dashed in the dim text colour with its lane number and its path dot; the lane the next name lands
// on takes the slot's gold ring; once all five are placed the frame is ld-idle B unchanged. The prize slots
// are the stored layout (event.ts advance draws it as the final opens), so what the room sees here is what
// the draw uses. Positions and path styles are the ladder reveal's own (prize-ladder plan.ts), so the 3D
// reveal that follows the lock starts from the same picture.
//
// This file builds the frame only: it holds no control. The MC's taps land on real-pixel controls over it
// (stage.ts), so their tap size never shrinks with the screen. Names reach the DOM through names-dom.ts.

import type { Dot } from '../../prize-event/view.ts';
import { COPY as LADDER } from '../prize-ladder/renderer/copy.ts';
import { PLATE, SLOT, STYLES, TRACK, WIDTH } from '../prize-ladder/renderer/plan.ts';
import { GAME_NAME, top } from '../_prize-reveal/reveal.ts';
import { fitAll, nameBox } from '../_prize-reveal/names-dom.ts';

export type LanesView = {
  eventName: string;
  dots: Dot[];
  prizes: readonly string[];
  /** The stored layout: slotRanks[exitLane] = rank. */
  slotRanks: readonly number[];
  /** The finalists' names in roster order. */
  names: readonly string[];
  /** Per start lane, the roster index (into `names`) of the finalist on it, or null while it is empty. */
  plates: readonly (number | null)[];
  /** The lane the next name lands on; null once every lane is filled. */
  next: number | null;
  /** An empty lane's label. */
  laneLabel: (lane: number) => string;
  /** The hud line while a lane is still empty. */
  picking: string;
};

/** Where a start lane's plate is centred, in frame px: the ladder reveal's plate row. */
export const laneX = (lane: number): number => PLATE.x(lane);

/** A plate's name fit (Gh303Ladder NAME FIT: 40px, floor 24px). */
const PLATE_FIT = { size: 40, floor: 24 } as const;
/** An empty lane's path dot, per lane, as i2-lanes draws it: indexes into the ladder's path styles. */
const EMPTY_STYLE = [2, 1, 0, 4, 3] as const;
/** The track as ld-idle B draws it: from the plates' row up to a bend at 55% of the lane's offset from the
 *  centre, then on to the slot leaders. */
const TRACK_Y = { near: 930, bend: 290 } as const;
const BEND = 0.55;
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function track(doc: Document): Element {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pd-track');
  svg.setAttribute('width', '1920');
  svg.setAttribute('height', '1080');
  svg.setAttribute('viewBox', '0 0 1920 1080');
  svg.setAttribute('aria-hidden', 'true');
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const l = doc.createElementNS(SVG_NS, 'line');
    for (const [k, v] of [['x1', x1], ['y1', y1], ['x2', x2], ['y2', y2]] as const) l.setAttribute(k, String(v));
    l.setAttribute('stroke', TRACK.lane);
    l.setAttribute('stroke-width', String(WIDTH.lane));
    svg.appendChild(l);
  };
  for (let lane = 0; lane < STYLES.length; lane++) {
    const x = PLATE.x(lane);
    const bend = 960 + (x - 960) * BEND;
    line(x, TRACK_Y.near, bend, TRACK_Y.bend);
    line(bend, TRACK_Y.bend, SLOT.x(lane), SLOT.leaderY);
  }
  return svg;
}

function slot(doc: Document, exit: number, rank: number, prizes: readonly string[]): HTMLElement {
  const prize = rank < prizes.length;
  const box = el(doc, 'div', `pd-slot ${prize ? 'prize' : 'none'}`);
  box.style.setProperty('--x', `${SLOT.x(exit)}px`);
  box.append(
    el(doc, 'div', 'pd-sk', prize ? LADDER.prizeLabel(rank + 1) : LADDER.noPrize),
    el(doc, 'div', 'pd-sp', prize ? prizes[rank]! : LADDER.noPrizeLine),
  );
  return box;
}

function plate(doc: Document, lane: number, view: LanesView): HTMLElement {
  const at = view.plates[lane] ?? null;
  const empty = at === null;
  const box = el(doc, 'div', ['pd-plate', empty ? 'empty' : '', empty && view.next === lane ? 'next' : ''].filter(Boolean).join(' '));
  box.style.setProperty('--x', `${PLATE.x(lane)}px`);
  const style = STYLES[empty ? EMPTY_STYLE[lane]! : at]!;
  const dot = el(doc, 'i', style.dashed ? 'pd-dot dashed' : 'pd-dot');
  dot.style.setProperty('--dot', style.color);
  box.appendChild(dot);
  if (empty) box.appendChild(el(doc, 'span', 'pd-plate-name', view.laneLabel(lane + 1)));
  else box.appendChild(nameBox(doc, 'span', 'pd-plate-name', view.names[at]!, PLATE_FIT));
  return box;
}

/** Build the lane-pick frame for `view` into `frame`, replacing what was there. */
export function renderLanes(frame: HTMLElement, view: LanesView, doc: Document = document): void {
  const parts: Element[] = [top(doc, view.eventName, LADDER.finalLabel, view.dots), track(doc)];
  view.slotRanks.forEach((rank, exit) => parts.push(slot(doc, exit, rank, view.prizes)));
  for (let lane = 0; lane < view.plates.length; lane++) parts.push(plate(doc, lane, view));
  const hud = el(doc, 'div', 'pd-hud2');
  const placed = view.plates.every((p) => p !== null);
  hud.append(el(doc, 'div', 'pd-lk', placed ? LADDER.picked : view.picking), el(doc, 'div', 'pd-gname', GAME_NAME.ladder));
  parts.push(hud);
  frame.replaceChildren(...parts);
  frame.setAttribute('data-screen', 'lanes');
  fitAll(frame);
}
