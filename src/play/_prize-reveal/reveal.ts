// The plain 2D reveal of the prize draw (gh#304): the projector frame every round, the final and the result
// are drawn in when no 3D game draws them, and the frame every 3D game (gh#305-gh#307) falls back to when
// it has no WebGL context or the room asked for reduced motion (ADR-0051: a play route never blanks).
//
// Design source: the picked direction B NIGHT STAGE of design/Gh302Projector.dc.html (owner pick
// 2026-11-11, ADR-0033), frames proj-round, proj-reveal and proj-result. The frame is authored at 1920x1080
// CSS px exactly as the board draws it and scaled as a whole to the screen (fitFrame), so every board value
// is used as drawn instead of being re-derived per projector resolution. The Thai copy is the board's
// approved copy, verbatim.
//
// Names reach the DOM only through names-dom.ts (textContent). This file builds every other node with
// createElement and textContent too, and holds no innerHTML: a name is not the only string here that a
// person typed (the event name and the prize names are the MC's).

import type { Chip, Dot, ScreenView, Winner } from '../../prize-event/view.ts';
import { FIT, fitAll, nameBox, writeName } from './names-dom.ts';

const FRAME_W = 1920;
const FRAME_H = 1080;

type Doc = Document;

function el(doc: Doc, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The board's arrow between the two counts, drawn node by node (no markup string). */
function arrow(doc: Doc): Element {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '110');
  svg.setAttribute('height', '110');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M3 12h16M13 5.5l6.5 6.5-6.5 6.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('class', 'pd-arrow');
  path.setAttribute('stroke-width', '3');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function top(doc: Doc, eventName: string, label: string | null, dotList: Dot[] | null): HTMLElement {
  const bar = el(doc, 'div', 'pd-top');
  bar.appendChild(el(doc, 'span', 'pd-ev', eventName));
  if (label !== null && dotList) {
    const dots = el(doc, 'span', 'pd-dots');
    dots.appendChild(el(doc, 'span', 'pd-rl', label));
    dotList.forEach((d, i) => {
      const dot = el(doc, 'i', [d === 'todo' ? '' : d, i === dotList.length - 1 ? 'fin' : ''].filter(Boolean).join(' '));
      dots.appendChild(dot);
    });
    bar.appendChild(dots);
  }
  return bar;
}

function field(doc: Doc, chips: Chip[]): HTMLElement {
  // Rendered in its end state (`pd-marked`): names are fitted as they will finally look, bold included.
  const grid = el(doc, 'div', 'pd-field pd-marked');
  chips.forEach((c, i) => {
    const chip = nameBox(doc, 'span', `pd-chip${c.mark === 'live' ? '' : ` ${c.mark}`}`, c.name, FIT.chip);
    // The reveal's wave runs in roster order; the stylesheet turns the index into a delay.
    chip.style.setProperty('--wave', String(i));
    grid.appendChild(chip);
  });
  return grid;
}

function count(doc: Doc, n: number, gold: boolean): HTMLElement {
  return el(doc, 'span', gold ? 'pd-to' : '', String(n));
}

function legendRow(doc: Doc, mark: 'in' | 'out', label: string): HTMLElement {
  const row = el(doc, 'div', '');
  row.appendChild(el(doc, 'span', `pd-chip pd-legend-chip ${mark}`, label));
  return row;
}

function low(doc: Doc, left: HTMLElement, flow: HTMLElement, right: HTMLElement): HTMLElement {
  const row = el(doc, 'div', 'pd-low');
  row.append(left, flow, right);
  return row;
}

/** The low row's left cell: a label, then the round's game when one is picked. A round with no game
 *  (every round until gh#305-gh#307) shows no "this round's game" label over nothing. */
function gameSlot(doc: Doc, key: string | null, game: string | null): HTMLElement {
  const cell = el(doc, 'div', 'pd-left');
  if (key !== null) cell.appendChild(el(doc, 'div', 'pd-lk', key));
  if (game !== null) cell.appendChild(el(doc, 'div', 'pd-gname', game));
  return cell;
}

function winnerText(doc: Doc, w: Winner, className: string): HTMLElement {
  const pz = el(doc, 'div', className);
  pz.textContent = w.prize ? `รางวัลที่ ${w.place} · ${w.prize}` : `รางวัลที่ ${w.place}`;
  return pz;
}

/**
 * Build the frame for `view` into `frame`, replacing what was there. The frame holds no control: the MC's
 * button lives outside the scaled frame, at real pixels, so its tap size never shrinks with the screen.
 */
export function renderScreen(frame: HTMLElement, view: ScreenView, doc: Doc = document): void {
  const parts: HTMLElement[] = [];
  if (view.kind === 'round') {
    parts.push(top(doc, view.eventName, `รอบที่ ${view.round} จาก ${view.rounds}`, view.dots));
    parts.push(field(doc, view.chips));
    const flow = el(doc, 'div', 'pd-flow');
    flow.append(count(doc, view.from, false), arrow(doc), count(doc, view.to, true), el(doc, 'small', '', 'คน'));
    const right = el(doc, 'div', 'pd-lk pd-rt');
    right.append(doc.createTextNode('รอบนี้คัดเหลือ'), doc.createElement('br'), doc.createTextNode(`${view.to} คน`));
    parts.push(low(doc, gameSlot(doc, view.game === null ? null : 'เกมรอบนี้', view.game), flow, right));
  } else if (view.kind === 'reveal') {
    parts.push(top(doc, view.eventName, `รอบที่ ${view.round} จาก ${view.rounds}`, view.dots));
    parts.push(field(doc, view.chips));
    const flow = el(doc, 'div', 'pd-flow');
    flow.append(count(doc, view.passed, true), el(doc, 'small', '', 'คน'));
    const legend = el(doc, 'div', 'pd-legend');
    legend.append(legendRow(doc, 'in', 'ผ่าน'), legendRow(doc, 'out', 'ไม่ผ่าน'));
    parts.push(low(doc, gameSlot(doc, `ผ่านรอบที่ ${view.round}`, view.game), flow, legend));
  } else if (view.kind === 'final') {
    parts.push(top(doc, view.eventName, 'รอบชิง', view.dots));
    parts.push(field(doc, view.chips));
    const flow = el(doc, 'div', 'pd-flow');
    flow.append(count(doc, view.chips.length, true), el(doc, 'small', '', 'คน'));
    parts.push(low(doc, gameSlot(doc, 'รอบชิง', null), flow, el(doc, 'div', 'pd-rt')));
  } else {
    parts.push(top(doc, view.eventName, null, null));
    const [first, ...rest] = view.winners;
    const spot = el(doc, 'div', 'pd-spot');
    spot.appendChild(el(doc, 'h2', '', 'ผู้ได้รับรางวัล'));
    if (first) {
      spot.appendChild(winnerText(doc, first, 'pd-pz'));
      spot.appendChild(nameBox(doc, 'div', 'pd-wn', first.name, FIT.winnerFirst));
    }
    parts.push(spot);
    if (rest.length) {
      const cards = el(doc, 'div', 'pd-wcards');
      for (const w of rest) {
        const card = el(doc, 'div', 'pd-wcard');
        card.appendChild(winnerText(doc, w, 'pd-pz'));
        card.appendChild(nameBox(doc, 'div', 'pd-wn', w.name, FIT.winnerCard));
        cards.appendChild(card);
      }
      parts.push(cards);
    }
    // The board's claim line ("show the result on your phone") is QR mode's (gh#309): admin mode has no
    // phones, so it is not drawn here.
  }
  frame.replaceChildren(...parts);
  frame.setAttribute('data-screen', view.kind);
  fitAll(frame);
}

/**
 * Write the screen-reader line for `view` into the live region: what a sighted room reads off the frame. The
 * result line carries the winners' names, so each one is written through the name sink as its own run
 * (text only, direction-isolated), never joined into the line as a string; the fixed copy around them is
 * text nodes. The line reads the same as the approved joined string.
 */
export function announce(live: HTMLElement, view: ScreenView, doc: Doc = document): void {
  if (view.kind === 'round') live.textContent = `รอบที่ ${view.round} จาก ${view.rounds} · รอบนี้คัดเหลือ ${view.to} คน`;
  else if (view.kind === 'reveal') live.textContent = `ผ่านรอบที่ ${view.round} · ${view.passed} คน`;
  else if (view.kind === 'final') live.textContent = 'รอบชิง';
  else {
    const parts: Node[] = [doc.createTextNode('ผู้ได้รับรางวัล')];
    for (const w of view.winners) {
      parts.push(doc.createTextNode(` · รางวัลที่ ${w.place} · `));
      const run = doc.createElement('span');
      writeName(run, w.name);
      parts.push(run);
    }
    live.replaceChildren(...parts);
  }
}

/** Scale the 1920x1080 frame to fit `box`, centred, keeping its aspect ratio. */
export function fitFrame(frame: HTMLElement, box: HTMLElement): void {
  const scale = Math.min(box.clientWidth / FRAME_W, box.clientHeight / FRAME_H);
  if (!(scale > 0)) return;
  frame.style.setProperty('--pd-scale', String(scale));
  frame.style.setProperty('--pd-x', `${(box.clientWidth - FRAME_W * scale) / 2}px`);
  frame.style.setProperty('--pd-y', `${(box.clientHeight - FRAME_H * scale) / 2}px`);
}

