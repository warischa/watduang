// The zones round before its draw (gh#315): the 2D picture the room stands up to, on the projector, while the
// MC has not yet pressed. The MC's press is the one that commits the draw, so this is the board's zn-idle: the
// four zones with their names, every zone still standing, the band asking the room to stand in its zone.
//
// Design source: design/Gh315Zones.dc.html frame A/zn-idle (owner pick 2026-11-16: Z1 A FOUR BLOCKS, Z2 B NAMES
// SIT IN THEIR ZONES, copy approved as it stands). The zones are the reveal's own (prize-zones plan.ts
// zoneAssignment): event key, round and the live field, never the round code and never a survivor, so the
// picture here is computable before the draw and the 3D reveal that follows the press lands each verdict in the
// zone the room already stands in.
//
// This file builds the frame only: it holds no control (the MC's button is stage.ts's, outside the frame).
// Names reach the DOM through names-dom.ts, as text.

import type { Person } from '../../prize-event/event.ts';
import type { Dot } from '../../prize-event/view.ts';
import { COPY as ZONES_COPY } from '../prize-zones/renderer/copy.ts';
import { NAME_FIT, ZONES, zoneAssignment, zoneGrid } from '../prize-zones/renderer/plan.ts';
import { GAME_NAME, top } from '../_prize-reveal/reveal.ts';
import { fitAll, nameBox } from '../_prize-reveal/names-dom.ts';
import { fitName, type Measure } from '../prize-fireworks/renderer/text-fit.ts';
import { measurer } from '../prize-fireworks/renderer/paint.ts';

export type ZonesIdleView = {
  eventName: string;
  round: number;
  rounds: number;
  dots: Dot[];
  /** Per zone, in panel order, its names in slot order. */
  zones: readonly (readonly string[])[];
};

/** Each zone's people for round `round`, from the event key and the live field in roster order alone. */
export function idleZones(eventKey: string, round: number, live: readonly Person[]): Person[][] {
  const byId = new Map(live.map((p) => [p.id, p]));
  return zoneAssignment(eventKey, round, live.map((p) => p.id)).map((ids) => ids.map((id) => byId.get(id)!));
}

function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A zone's per-name line counts at each text width the grid tries, cached so the layout is chosen on exactly
 *  the fit it applies (the reveal's fitsAt). The measure is the reveal's own canvas fitter over `doc` -- the
 *  same NAME FIT rule (text-fit.ts fitName), so the idle grid lands where the reveal's does, never a second
 *  copy of it -- or an injected measure for tests. A document with no 2D canvas (the fake DOM) cannot measure,
 *  so every name takes one line and the grid stays at the board's four columns, the layout the no-layout tests
 *  already assert. */
function zoneLines(doc: Document, names: readonly string[], injected?: Measure): (box: number) => readonly number[] {
  let measure = injected;
  if (!measure) {
    const probe = doc.createElement('canvas');
    const ctx = typeof probe.getContext === 'function' ? probe.getContext('2d') : null;
    measure = ctx ? measurer(ctx, 700, "'Sarabun', sans-serif") : (): number => 0;
  }
  const m = measure;
  const cache = new Map<number, readonly number[]>();
  return (box) => {
    let lines = cache.get(box);
    if (!lines) {
      lines = names.map((name) => fitName(name, m, NAME_FIT.size, NAME_FIT.floor, box).lines.length);
      cache.set(box, lines);
    }
    return lines;
  };
}

function panel(doc: Document, zone: number, names: readonly string[], measure?: Measure): HTMLElement {
  const box = el(doc, 'div', 'pd-zpanel');
  box.setAttribute('data-zone', String(zone));
  box.style.setProperty('--zone', ZONES[zone]!.color);
  box.style.setProperty('--zone-tint', ZONES[zone]!.tint);
  const head = el(doc, 'div', 'pd-zhead');
  const label = el(doc, 'span', 'pd-zname');
  label.append(el(doc, 'i', 'pd-zdot'), doc.createTextNode(ZONES_COPY.zoneLabel[zone]!));
  head.append(label, el(doc, 'span', 'pd-zbadge', ZONES_COPY.standUp));
  const grid = el(doc, 'div', 'pd-zgrid');
  for (const name of names) grid.appendChild(nameBox(doc, 'span', 'pd-chip', name, NAME_FIT));
  // The owner's ruling (2026-11-17), through the reveal's own zoneGrid: grow the columns when the board's four
  // cannot hold the zone, else scale the whole grid as one. The columns and the scale ride to the stylesheet as
  // custom properties (play.css .pd-zgrid); the rows auto-size to them because a wrapped chip here is line-height
  // 1, exactly the reveal's row model. Ordinary rosters get four columns at scale 1: today's layout, unchanged.
  const layout = zoneGrid(zone, names.length, zoneLines(doc, names, measure));
  grid.style.setProperty('--z-cols', String(layout.cols));
  grid.style.setProperty('--z-scale', String(layout.scale));
  box.append(head, grid);
  return box;
}

/** Build the zones frame for `view` into `frame`, replacing what was there. `measure` overrides the text
 *  measurer the zone grids fit names with (tests inject one; the projector measures over `doc`'s canvas). */
export function renderZonesIdle(frame: HTMLElement, view: ZonesIdleView, doc: Document = document, measure?: Measure): void {
  const field = el(doc, 'div', 'pd-zfield');
  view.zones.forEach((names, zone) => field.appendChild(panel(doc, zone, names, measure)));
  const left = el(doc, 'div', 'pd-left');
  left.append(el(doc, 'div', 'pd-lk', ZONES_COPY.gameCardLabel), el(doc, 'div', 'pd-gname', GAME_NAME.zones));
  const flow = el(doc, 'div', 'pd-flow');
  flow.append(el(doc, 'span', '', String(view.zones.reduce((n, z) => n + z.length, 0))), el(doc, 'small', '', ZONES_COPY.people));
  const low = el(doc, 'div', 'pd-low pd-zlow');
  low.append(left, flow, el(doc, 'div', 'pd-lk pd-rt', ZONES_COPY.idlePrompt));
  frame.replaceChildren(top(doc, view.eventName, ZONES_COPY.roundLabel(view.round, view.rounds), view.dots), field, low);
  frame.setAttribute('data-screen', 'zones');
  fitAll(frame);
}
