// Canvas painters for the flipcards reveal (gh#318): the card's own look (its back, a prize face, a no-prize
// face) and the frame's text (name plates, the heading band, the lower band, the claim line). A WebGL scene
// cannot lay out Thai text, so every word is painted here into a 2D canvas the scene shows as a texture. The top
// bar, the canvas surface, the count figure and the text fitting are the fireworks reveal's own (the same gh#302
// chrome), reused rather than copied. Sizes are the picked board's frame px.
//
// The plate, heading band, lower band and claim painters mirror the envelopes reveal's: the two boards share
// that chrome, but the envelopes painters close over the envelopes copy, so they cannot be imported as they
// stand. Hoisting them into the shared pick-final module is the follow-up that removes the mirror.
//
// Values are the picked board's (design/Gh318Cards.dc.html, VALUES, VALUES BY ROLE and NAME FIT). No suit, pip,
// rank, felt, chip or money: the back carries a drawn star, the face is a prize slot. Names and the MC's typed
// strings are drawn with fillText, which renders text and nothing else: no markup is ever parsed from them.

import { COLOR, measurer, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { fitName, wrapLines } from '../../prize-fireworks/renderer/text-fit.ts';
import { COPY } from './copy.ts';
import { BAND, CARD, FRAME_W, HUD, PLATE, type CardFace } from './plan.ts';

export { COLOR, FACES, FIGURE_H, FIGURE_W, paintFigure, paintTop, surface, type Dot, type Paintable } from '../../prize-fireworks/renderer/paint.ts';

/** The card colours the shared stage palette lacks (VALUES row): the back's hatch line, a prize face's label
 *  red (gh#303 C2) and its ink, and a prize face's white. */
export const CARD_COLOR = { hatch: '#2e2b63', label: '#c2185b', ink: '#14142b', face: '#ffffff' } as const;

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

// ---- the card back -------------------------------------------------------------------------------------------

/** The back, CARD.w x CARD.h: the night hatch, the gold inset edge, the gold star at the centre. */
export function paintBack(p: Paintable): void {
  const { ctx } = p;
  const { w, h, r } = CARD;
  ctx.save();
  roundRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  ctx.fillStyle = COLOR.raised;
  ctx.fillRect(0, 0, w, h);
  // repeating-linear-gradient(45deg, night 0 6px, hatch 6px 7px): the gradient runs from the bottom-left corner
  // toward the top-right, so each 1px hatch line runs top-left to bottom-right, the last px of every 7.
  const span = (w + h) * Math.SQRT1_2;
  ctx.translate(0, h);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = CARD_COLOR.hatch;
  for (let k = 0; k * 7 < span; k++) ctx.fillRect(k * 7 + 6, -span, 1, 2 * span);
  ctx.restore();
  ctx.save();
  roundRect(ctx, CARD.edge / 2, CARD.edge / 2, w - CARD.edge, h - CARD.edge, r - CARD.edge / 2);
  ctx.lineWidth = CARD.edge;
  ctx.strokeStyle = COLOR.gold;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? CARD.star.inner : CARD.star.outer;
    const x = w / 2 + rad * Math.cos(a);
    const y = h / 2 + rad * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = COLOR.gold;
  ctx.fill();
  ctx.restore();
}

// ---- the card face ----------------------------------------------------------------------------------------------

/** A face canvas carries this margin all round, for the prize face's 3px ring and its 16px glow. */
export const FACE_MARGIN = CARD.ring + CARD.glow + 1;
const FACE_BOX = CARD.w - 2 * CARD.pad;

/** A face: its label (Mitr 600 30px), 8px below it the prize name or the thank-you line (Sarabun 400 30px), 12px
 *  below that the picker's name (Sarabun 700 36px, floor 20px, two lines at the floor), centred on the card. A
 *  prize face is white with a red label and ink type inside a gold ring and glow; a no-prize face is night with
 *  dim type and a dim inset ring. Text taller than the card overflows it about its centre, as the board's
 *  centred column does; the canvas grows to hold it. Returns the canvas and its height (margin included). */
export function paintFace(doc: Document, face: CardFace, name: string, scale: number): Painted {
  const ctx0 = probe(doc);
  const fp = face.line ? wrapLines(face.line, measurer(ctx0, 400, SARABUN), 30, FACE_BOX) : [];
  const fit = fitName(name, measurer(ctx0, 700, SARABUN), 36, 20, FACE_BOX);
  const fkH = 30 * 1.25;
  const fpH = fp.length ? 8 + fp.length * 30 * 1.3 : 0;
  const lh = fit.size * 1.2;
  const fwH = 12 + fit.lines.length * lh;
  const content = fkH + fpH + fwH;
  const m = FACE_MARGIN;
  const inner = Math.max(CARD.h, content + 2 * CARD.pad);
  const height = inner + 2 * m;
  const paint = surface(doc, CARD.w + 2 * m, height, scale);
  const { ctx } = paint;
  const won = face.prize !== null;
  const x0 = m;
  const y0 = m + (inner - CARD.h) / 2;
  ctx.save();
  if (won) {
    // box-shadow: 0 0 0 3px gold, 0 0 16px glow. The glow is the card's shadow; the ring lies over it.
    ctx.save();
    roundRect(ctx, x0, y0, CARD.w, CARD.h, CARD.r);
    ctx.shadowColor = COLOR.glow;
    ctx.shadowBlur = CARD.glow * scale;
    ctx.fillStyle = COLOR.gold;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, x0 - CARD.ring, y0 - CARD.ring, CARD.w + 2 * CARD.ring, CARD.h + 2 * CARD.ring, CARD.r + CARD.ring);
    ctx.fillStyle = COLOR.gold;
    ctx.fill();
    roundRect(ctx, x0, y0, CARD.w, CARD.h, CARD.r);
    ctx.fillStyle = CARD_COLOR.face;
    ctx.fill();
  } else {
    roundRect(ctx, x0, y0, CARD.w, CARD.h, CARD.r);
    ctx.fillStyle = COLOR.raised;
    ctx.fill();
    roundRect(ctx, x0 + CARD.edge / 2, y0 + CARD.edge / 2, CARD.w - CARD.edge, CARD.h - CARD.edge, CARD.r - CARD.edge / 2);
    ctx.lineWidth = CARD.edge;
    ctx.strokeStyle = COLOR.out;
    ctx.stroke();
  }
  ctx.restore();
  const cx = m + CARD.w / 2;
  const top = height / 2 - content / 2;
  const labelColor = won ? CARD_COLOR.label : COLOR.out;
  const typeColor = won ? CARD_COLOR.ink : COLOR.out;
  drawLines(ctx, [face.label], cx, top + fkH / 2, fkH, { weight: 600, size: 30, family: MITR, color: labelColor, align: 'center' });
  if (fp.length) drawLines(ctx, fp, cx, top + fkH + 8 + (fpH - 8) / 2, 30 * 1.3, { weight: 400, size: 30, family: SARABUN, color: typeColor, align: 'center' });
  drawLines(ctx, fit.lines, cx, top + fkH + fpH + 12 + (fwH - 12) / 2, lh, { weight: 700, size: fit.size, family: SARABUN, color: typeColor, align: 'center' });
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
