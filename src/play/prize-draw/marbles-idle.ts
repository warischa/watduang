// The marbles round before its draw (gh#316): the 2D picture the room stands up to, on the projector, while
// the MC has not yet pressed. The MC's press is the one that commits the draw, so this is the board's
// mb-idle A HEAT LANES (owner pick PD-316-02 a): the round's first heat at the gate, 20 names on plates,
// the hint line asking the room to wait for the race. The shared field stays for the other games.
//
// Design source: design/Gh316Marbles.dc.html frame mb-idle A, authored 1920x1080. The heat is the reveal's
// own cut (prize-marbles plan.ts heatsOf): the next HEAT_SIZE names in roster order, never the round code
// and never a survivor, so the picture is computable before the draw and the race that follows the press
// runs the lanes the room already reads. Unlike zones, the marbles cut is roster order alone -- the key
// draws each marble's pace, not its lane, so the idle seats the same names whichever survivors commit.
//
// This file builds the frame only: it holds no control (the MC's button is stage.ts's, outside the frame).
// Names reach the DOM through names-dom.ts, as text.

import type { Person } from '../../prize-event/event.ts';
import type { Dot } from '../../prize-event/view.ts';
import { COPY } from '../prize-marbles/renderer/copy.ts';
import { MARBLE_R, NAME_FIT, START_X, heatsOf, laneY } from '../prize-marbles/renderer/plan.ts';
import { TRACK_COLOR, separatorYs } from '../prize-marbles/renderer/paint.ts';
import { GAME_NAME, top } from '../_prize-reveal/reveal.ts';
import { fitAll, nameBox } from '../_prize-reveal/names-dom.ts';
import type { Measure } from '../prize-fireworks/renderer/text-fit.ts';

export type MarblesIdleView = {
  eventName: string;
  round: number;
  rounds: number;
  dots: Dot[];
  /** The heat on the plates: its names in lane (roster) order, at most HEAT_SIZE. */
  names: readonly string[];
  /** The whole round field the band counts, not the heat's 20 (the board draws the joined count). */
  count: number;
};

/** The idle frame's band copy. The label is the gh#302 approved card label; the hint is the board's COPY
 *  SOURCES "marbles idle: MC prompt", verbatim. The renderer's COPY never draws the idle, so these live
 *  here rather than in the reveal's copy module. */
const IDLE_COPY = {
  gameCardLabel: 'เกมรอบนี้',
  idlePrompt: 'พิธีกรกดเริ่ม แล้วลูกแก้วจะวิ่งเข้าเส้นชัย',
} as const;

/** The board's four marble accents, cycling by lane: decoration only, no fate meaning (fate is gold or
 *  dim, and the idle has neither). Named as tokens so the accent stays single-sourced; the canvas's
 *  MARBLE_COLOR carries the same cycle for the 3D reveal. */
const MB_BODY = ['var(--accent-punch)', 'var(--accent-sky)', 'var(--accent-lilac)', 'var(--ink-light)'] as const;

/** The heat the idle seats: the round's first HEAT_SIZE people in roster order, from the live field alone.
 *  The signature mirrors idleZones (the stage passes the event key and round uniformly); the marbles cut
 *  reads neither, because plan.ts heatsOf chunks the roster in order and the key only draws pace. */
export function idleMarbles(eventKey: string, round: number, live: readonly Person[]): Person[] {
  const byId = new Map(live.map((p) => [p.id, p]));
  const heat = heatsOf(live.map((p) => p.id))[0] ?? [];
  return heat.map((id) => byId.get(id)!);
}

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Build the marbles idle frame for `view` into `frame`, replacing what was there. `measure` is accepted
 *  for call parity with renderZonesIdle: the plates are a fixed 20-row column fitted by fitAll at layout
 *  time, so unlike the zones grid this frame makes no measurer-driven layout choice and does not read it. */
export function renderMarblesIdle(frame: HTMLElement, view: MarblesIdleView, doc: Document = document, measure?: Measure): void {
  const field = el(doc, 'div', 'pd-mfield');
  // The track's pre-composited separator and finish-glow solids come from the reveal's own TRACK_COLOR
  // (the one home of the board's faded values), set inline as the zones idle sets its zone colours.
  field.style.setProperty('--pd-m-sep', TRACK_COLOR.separator);
  field.style.setProperty('--pd-m-glow', TRACK_COLOR.finishGlow);
  field.appendChild(el(doc, 'div', 'pd-mtrack'));
  for (const y of separatorYs(view.names.length)) {
    const sep = el(doc, 'div', 'pd-mlane');
    sep.style.setProperty('inset-block-start', `${y - 1}px`);
    field.appendChild(sep);
  }
  field.appendChild(el(doc, 'div', 'pd-mfglow'));
  field.appendChild(el(doc, 'div', 'pd-mfinish'));
  field.appendChild(el(doc, 'div', 'pd-mtlabel', COPY.finishLabel));
  const lanes = el(doc, 'div', 'pd-mlanes');
  view.names.forEach((name, lane) => {
    const marble = el(doc, 'div', 'pd-mmarble');
    marble.style.setProperty('--mb', MB_BODY[lane % MB_BODY.length]!);
    marble.style.setProperty('inset-inline-start', `${START_X - MARBLE_R}px`);
    marble.style.setProperty('inset-block-start', `${laneY(lane) - MARBLE_R}px`);
    marble.appendChild(el(doc, 'div', 'pd-mhl'));
    field.appendChild(marble);
    lanes.appendChild(nameBox(doc, 'span', 'pd-mplate', name, NAME_FIT));
  });
  field.appendChild(lanes);
  const left = el(doc, 'div', 'pd-left');
  left.append(el(doc, 'div', 'pd-lk', IDLE_COPY.gameCardLabel), el(doc, 'div', 'pd-gname', GAME_NAME.marbles));
  const flow = el(doc, 'div', 'pd-flow');
  flow.append(el(doc, 'span', '', String(view.count)), el(doc, 'small', '', COPY.people));
  const low = el(doc, 'div', 'pd-low pd-mlow');
  low.append(left, flow, el(doc, 'div', 'pd-lk pd-rt', IDLE_COPY.idlePrompt));
  frame.replaceChildren(top(doc, view.eventName, COPY.roundLabel(view.round, view.rounds), view.dots), field, low);
  frame.setAttribute('data-screen', 'marbles');
  fitAll(frame);
}
