// Canvas painters for the envelopes reveal (gh#317): the envelope's own look (its body, the bows and seal on
// its flap tip, the prize slot over an open body) and the frame's text (name plates, the heading band, the
// lower band, the claim line). A WebGL scene cannot lay out Thai text, so every word is painted here into a 2D
// canvas the scene shows as a texture. The top bar, the canvas surface, the count figure and the text fitting
// are the fireworks reveal's own (the same gh#302 chrome), reused rather than copied. Sizes are the picked
// board's frame px.
//
// Values are the picked board's (design/Gh317Envelopes.dc.html, VALUES, VALUES BY ROLE and NAME FIT). Names and
// the MC's typed strings are drawn with fillText, which renders text and nothing else: no markup is ever
// parsed from them.

import { COLOR, measurer, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { fitName, graphemes, wrapLines, type Fit, type Measure } from '../../prize-fireworks/renderer/text-fit.ts';
import { COPY } from './copy.ts';
import { BAND, ENV, FRAME_W, HUD, PLATE, SLOT, type EnvelopeSlot } from './plan.ts';

export { COLOR, FACES, FIGURE_H, FIGURE_W, paintFigure, paintTop, surface, type Dot, type Paintable } from '../../prize-fireworks/renderer/paint.ts';

const MITR = "'Mitr', sans-serif";
const SARABUN = "'Sarabun', sans-serif";

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.arcTo(x + w, y, x + w, y + k, k);
  ctx.lineTo(x + w, y + h - k);
  ctx.arcTo(x + w, y + h, x + w - k, y + h, k);
  ctx.lineTo(x + k, y + h);
  ctx.arcTo(x, y + h, x, y + h - k, k);
  ctx.lineTo(x, y + k);
  ctx.arcTo(x, y, x + k, y, k);
  ctx.closePath();
}

type TextOpts = { weight: number; size: number; family: string; color: string; align?: CanvasTextAlign };

/** Lines centred on `cy` at `lineHeight` each, aligned on x. */
function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, cy: number, lineHeight: number, o: TextOpts): void {
  ctx.save();
  ctx.font = font(o.weight, o.size, o.family);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'middle';
  const top = cy - (lines.length * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)));
  ctx.restore();
}

const probe = (doc: Document) => surface(doc, 1, 1, 1).ctx;

export type Painted = { paint: Paintable; height: number };

// ---- the envelope ------------------------------------------------------------------------------------------

/** The body panel: the art box's columns, from 3px above the body's top edge, so the 3px edge is whole. */
export const BODY_PANEL = { w: ENV.w, h: ENV.body.h + 6, top: ENV.top + ENV.body.y - 3 } as const;

/** The envelope body: the night surface in a rounded rect with a 3px gold edge. */
export function paintBody(p: Paintable): void {
  const { ctx } = p;
  const b = ENV.body;
  ctx.save();
  roundRect(ctx, b.x, 3, b.w, b.h, b.r);
  ctx.fillStyle = COLOR.raised;
  ctx.fill();
  ctx.lineWidth = b.edge;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLOR.gold;
  ctx.stroke();
  ctx.restore();
}

/** The bows and the seal on the flap tip, in a box centred SEAL_PANEL.cy below its top on the tip. */
export const SEAL_PANEL = { w: 72, h: 44, cy: 24 } as const;

/** Two gold bows above a night seal ringed in gold. */
export function paintSeal(p: Paintable): void {
  const { ctx } = p;
  const cx = SEAL_PANEL.w / 2;
  const cy = SEAL_PANEL.cy;
  ctx.save();
  ctx.fillStyle = COLOR.gold;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * ENV.bow.dx, cy + ENV.bow.dy, ENV.bow.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, ENV.seal.r, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.raised;
  ctx.fill();
  ctx.lineWidth = ENV.seal.edge;
  ctx.strokeStyle = COLOR.gold;
  ctx.stroke();
  ctx.restore();
}

// ---- the prize slot ------------------------------------------------------------------------------------------

/** The MC's prize line in a slot (the board's cap, PD-317-02 a): Sarabun 400 at 30px, shrinking to the slot's
 *  own 20px floor, then at most two lines, and no drawn line wider than the slot. */
const PRIZE_LINE = { size: 30, floor: 20, cap: 2 } as const;

const ELLIPSIS = '…';

/** Cut a line to the slot at `size`: whole grapheme clusters are kept while the line plus the ellipsis fits.
 *  A cluster that alone is wider than the slot (a long ZWJ emoji run is one cluster) cannot be split, so it is
 *  dropped and the line ends in the ellipsis; when nothing fits, the line is the ellipsis alone. */
function cutLine(line: string, measure: Measure, size: number): string {
  const clusters = graphemes(line);
  while (clusters.length && measure(clusters.join('') + ELLIPSIS, size) > SLOT.w) clusters.pop();
  return clusters.join('').replace(/\s+$/, '') + ELLIPSIS;
}

/** The lines of a fit, each drawn no wider than the slot. The prize name is MC-typed with no length limit, so
 *  nothing here can throw: a throw would reach the font-load promise or a resize and take a running reveal down. */
function capped(lines: string[], measure: Measure, size: number): string[] {
  return lines.map((line) => (measure(line, size) <= SLOT.w ? line : cutLine(line, measure, size)));
}

/** Fit the MC's prize line to the slot at the board's cap: at most two lines, none wider than the slot, and past
 *  the second the line is cut to whole clusters and ends in an ellipsis. */
function prizeLine(text: string, measure: Measure): Fit {
  const fit = fitName(text, measure, PRIZE_LINE.size, PRIZE_LINE.floor, SLOT.w);
  const size = fit.size;
  if (fit.lines.length <= PRIZE_LINE.cap) return { size, lines: capped(fit.lines, measure, size) };
  const first = fit.lines[0]!;
  const rest = text.startsWith(first) ? text.slice(first.length) : fit.lines.slice(1).join(' ');
  const head = wrapLines(rest.trimStart(), measure, size, SLOT.w)[0] ?? '';
  return { size, lines: [capped([first], measure, size)[0]!, cutLine(head, measure, size)] };
}

/** The slot over an open body: its label (Mitr 600 30px; gold, or dim when it wins nothing), the prize name or
 *  the thank-you line (Sarabun 400 30px shrinking to the slot's 20px floor, at most two lines, cut to an
 *  ellipsis past the cap; soft), and the
 *  picker's name (Sarabun 700 36px, floor 20px, two lines at the floor; white, or dim when it wins nothing).
 *  No surface of its own: the body is the surface. */
export function paintSlot(doc: Document, slot: EnvelopeSlot, name: string, scale: number): Painted {
  const ctx0 = probe(doc);
  const sp = slot.line ? prizeLine(slot.line, measurer(ctx0, 400, SARABUN)) : null;
  const fit = fitName(name, measurer(ctx0, 700, SARABUN), 36, 20, SLOT.w);
  const skH = 30 * 1.25;
  const spH = sp ? 4 + sp.lines.length * sp.size * 1.3 : 0;
  const lh = fit.size * 1.2;
  const swH = 6 + fit.lines.length * lh;
  const height = skH + spH + swH;
  const paint = surface(doc, SLOT.w, height, scale);
  const { ctx } = paint;
  const won = slot.prize !== null;
  const cx = SLOT.w / 2;
  drawLines(ctx, [slot.label], cx, skH / 2, skH, { weight: 600, size: 30, family: MITR, color: won ? COLOR.gold : COLOR.out, align: 'center' });
  if (sp) drawLines(ctx, sp.lines, cx, skH + 4 + (spH - 4) / 2, sp.size * 1.3, { weight: 400, size: sp.size, family: SARABUN, color: COLOR.soft, align: 'center' });
  drawLines(ctx, fit.lines, cx, skH + spH + 6 + (swH - 6) / 2, lh, {
    weight: 700,
    size: fit.size,
    family: SARABUN,
    color: won ? COLOR.ink : COLOR.out,
    align: 'center',
  });
  return { paint, height };
}

// ---- name plates ---------------------------------------------------------------------------------------------

const PLATE_NAME_BOX = PLATE.w - 2 * PLATE.padX;

/** A name plate: a raised pill with the picker's name (Sarabun 700 40px, floor 24px, two lines at the floor;
 *  the plate grows). */
export function paintPlate(doc: Document, name: string, scale: number): Painted {
  const fit = fitName(name, measurer(probe(doc), 700, SARABUN), 40, 24, PLATE_NAME_BOX);
  const lh = fit.size * 1.15;
  const height = Math.max(PLATE.minH, 2 * PLATE.padY + fit.lines.length * lh);
  const paint = surface(doc, PLATE.w, height, scale);
  const { ctx } = paint;
  ctx.save();
  roundRect(ctx, 0, 0, PLATE.w, height, 999);
  ctx.fillStyle = COLOR.raised;
  ctx.fill();
  ctx.restore();
  drawLines(ctx, fit.lines, PLATE.w / 2, height / 2, lh, { weight: 700, size: fit.size, family: SARABUN, color: COLOR.ink, align: 'center' });
  return { paint, height };
}

// ---- the heading band, the lower band, the claim -----------------------------------------------------------------

export const HUD_W = FRAME_W - 2 * HUD.side;

/** The centred heading band: the game name (Mitr 700 50px gold) over the instruction (Mitr 600 30px soft, 6px
 *  below). Returns its height for a canvas of HUD_W. */
export function hudHeight(doc: Document, instruction: string): number {
  return 60 + 6 + wrapLines(instruction, measurer(probe(doc), 600, MITR), 30, HUD_W).length * 40.5;
}

export function paintHud(p: Paintable, instruction: string): void {
  const { ctx } = p;
  drawLines(ctx, [COPY.gameName], HUD_W / 2, 30, 60, { weight: 700, size: 50, family: MITR, color: COLOR.gold, align: 'center' });
  const lines = wrapLines(instruction, measurer(ctx, 600, MITR), 30, HUD_W);
  drawLines(ctx, lines, HUD_W / 2, 66 + (lines.length * 40.5) / 2, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft, align: 'center' });
}

/** The lower band's side texts (Mitr 600 30px soft): the status left, the note right, centred on the band. The
 *  count between them is the shared figure (paintFigure). */
export function paintBand(p: Paintable, status: string, note: string): void {
  const { ctx } = p;
  const cy = BAND.h / 2;
  const left = wrapLines(status, measurer(ctx, 600, MITR), 30, BAND.side);
  drawLines(ctx, left, 56, cy, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft });
  const right = wrapLines(note, measurer(ctx, 600, MITR), 30, BAND.side);
  drawLines(ctx, right, FRAME_W - 56, cy, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft, align: 'right' });
}

export const CLAIM_W = FRAME_W - 2 * HUD.side;

/** The claim line (Sarabun 400 34px soft, line height 1.4), centred. Returns its height for a CLAIM_W canvas. */
export function claimHeight(doc: Document): number {
  return wrapLines(COPY.claim, measurer(probe(doc), 400, SARABUN), 34, CLAIM_W).length * 34 * 1.4;
}

export function paintClaim(p: Paintable): void {
  const { ctx } = p;
  const lines = wrapLines(COPY.claim, measurer(ctx, 400, SARABUN), 34, CLAIM_W);
  drawLines(ctx, lines, CLAIM_W / 2, (lines.length * 34 * 1.4) / 2, 34 * 1.4, { weight: 400, size: 34, family: SARABUN, color: COLOR.soft, align: 'center' });
}
