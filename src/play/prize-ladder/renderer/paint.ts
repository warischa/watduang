// Canvas painters for the text of the ladder reveal (gh#307). A WebGL scene cannot lay out Thai text, so
// every word is painted here into a 2D canvas that the scene shows as a texture: the lane plates, the prize
// slots, the hud and the gh#302 result frame. The top bar and the canvas surface are the fireworks reveal's
// own (the same gh#302 bar), reused rather than copied. Sizes are the picked board's frame px.
//
// Values are the picked board's (design/Gh303Ladder.dc.html, VALUES, VALUES BY ROLE and NAME FIT, picked
// 2026-11-11). Names and the MC's typed strings are drawn with fillText, which renders text and nothing
// else: no markup is ever parsed from them.

import { COLOR, measurer, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { fitName, wrapLines } from '../../prize-fireworks/renderer/text-fit.ts';
import { COPY } from './copy.ts';
import { HUD, PLATE, SLOT, STYLES, type ResultLine, type Slot } from './plan.ts';

export { COLOR, FACES, paintTop, surface, type Dot, type Paintable } from '../../prize-fireworks/renderer/paint.ts';

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

type TextOpts = { weight: number; size: number; family: string; color: string; align?: CanvasTextAlign; glow?: number };

/** Lines centred on `cy` at `lineHeight` each, aligned on x. */
function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, cy: number, lineHeight: number, o: TextOpts): void {
  ctx.save();
  ctx.font = font(o.weight, o.size, o.family);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'middle';
  if (o.glow) {
    ctx.shadowColor = COLOR.glow;
    ctx.shadowBlur = o.glow * ctx.getTransform().a;
  }
  const top = cy - (lines.length * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)));
  ctx.restore();
}

/** An inset ring of width `w` inside a rounded rect (the board's inset box-shadow). */
function insetRing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, width: number, color: string): void {
  ctx.save();
  roundRect(ctx, x + width / 2, y + width / 2, w - width, h - width, Math.max(0, r - width / 2));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

const probe = (doc: Document) => surface(doc, 1, 1, 1).ctx;

export type Painted = { paint: Paintable; height: number };

// ---- lane plates ------------------------------------------------------------------------------------------

/** The name's box on a plate: the plate less its padding, the dot and the gap. */
const PLATE_NAME_BOX = PLATE.w - PLATE.padL - PLATE.padR - PLATE.dot - PLATE.gap;

/** A lane plate: a raised pill, the path's dot, the name (Sarabun 700 40px, floor 24px, two lines at the
 *  floor; the plate grows). The dashed path's dot is ringed. */
export function paintPlate(doc: Document, name: string, style: number, scale: number): Painted {
  const fit = fitName(name, measurer(probe(doc), 700, SARABUN), 40, 24, PLATE_NAME_BOX);
  const lh = fit.size * 1.15;
  const height = Math.max(PLATE.minH, 8 + fit.lines.length * lh);
  const paint = surface(doc, PLATE.w, height, scale);
  const { ctx } = paint;
  ctx.save();
  roundRect(ctx, 0, 0, PLATE.w, height, 999);
  ctx.fillStyle = COLOR.raised;
  ctx.fill();
  const s = STYLES[style]!;
  const r = PLATE.dot / 2;
  const cx = PLATE.padL + r;
  ctx.beginPath();
  ctx.arc(cx, height / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = s.color;
  ctx.fill();
  if (s.dashed) {
    ctx.beginPath();
    ctx.arc(cx, height / 2, r - 2, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.raised;
    ctx.stroke();
  }
  ctx.restore();
  const boxX = PLATE.padL + PLATE.dot + PLATE.gap;
  drawLines(ctx, fit.lines, boxX + PLATE_NAME_BOX / 2, height / 2, lh, { weight: 700, size: fit.size, family: SARABUN, color: COLOR.ink, align: 'center' });
  return { paint, height };
}

// ---- prize slots ------------------------------------------------------------------------------------------

const SLOT_PAD = { x: 16, y: 14 } as const;
const SLOT_BOX = SLOT.w - 2 * SLOT_PAD.x;

/** A far prize slot: its label (Mitr 600 30px), the prize name or the thank-you line (Sarabun 400 30px,
 *  the stamped far size), and once its light has landed the finalist's name (Sarabun 700 36px, floor 20px).
 *  A prize slot is raised with a 3px gold inset ring; a no-prize slot is bare with a 2px raised ring and
 *  dim type. */
export function paintSlot(doc: Document, slot: Slot, name: string | null, scale: number): Painted {
  const ctx0 = probe(doc);
  const sp = slot.line ? wrapLines(slot.line, measurer(ctx0, 400, SARABUN), 30, SLOT_BOX) : [];
  const fit = name === null ? null : fitName(name, measurer(ctx0, 700, SARABUN), 36, 20, SLOT_BOX);
  const skH = 30 * 1.25;
  const spH = sp.length * 30 * 1.3;
  const swH = fit ? 6 + fit.lines.length * fit.size * 1.2 : 0;
  const height = SLOT_PAD.y * 2 + skH + spH + swH;
  const paint = surface(doc, SLOT.w, height, scale);
  const { ctx } = paint;
  if (slot.prize) {
    ctx.save();
    roundRect(ctx, 0, 0, SLOT.w, height, 24);
    ctx.fillStyle = COLOR.raised;
    ctx.fill();
    ctx.restore();
    insetRing(ctx, 0, 0, SLOT.w, height, 24, 3, COLOR.gold);
  } else {
    insetRing(ctx, 0, 0, SLOT.w, height, 24, 2, COLOR.raised);
  }
  const cx = SLOT.w / 2;
  let y = SLOT_PAD.y;
  drawLines(ctx, [slot.label], cx, y + skH / 2, skH, { weight: 600, size: 30, family: MITR, color: slot.prize ? COLOR.gold : COLOR.out, align: 'center' });
  y += skH;
  if (sp.length) drawLines(ctx, sp, cx, y + spH / 2, 30 * 1.3, { weight: 400, size: 30, family: SARABUN, color: COLOR.soft, align: 'center' });
  y += spH;
  if (fit) {
    const lh = fit.size * 1.2;
    drawLines(ctx, fit.lines, cx, y + 6 + (fit.lines.length * lh) / 2, lh, {
      weight: 700,
      size: fit.size,
      family: SARABUN,
      color: slot.prize ? COLOR.gold : COLOR.out,
      align: 'center',
    });
  }
  return { paint, height };
}

// ---- hud and result ---------------------------------------------------------------------------------------

export const HUD_BOX = { w: HUD.w, h: HUD.h } as const;

/** The hud: a label over the game name (Mitr 600 30px over Mitr 700 50px gold), from the panel's top-left. */
export function paintHud(p: Paintable, label: string): void {
  const { ctx } = p;
  const lines = wrapLines(label, measurer(ctx, 600, MITR), 30, HUD_BOX.w);
  const lkH = lines.length * 40.5;
  drawLines(ctx, lines, 0, lkH / 2, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft });
  drawLines(ctx, [COPY.gameName], 0, lkH + 30, 60, { weight: 700, size: 50, family: MITR, color: COLOR.gold });
}

export type Named = ResultLine & { name: string };

/** The gh#302 result frame (B, picked): the heading, first prize spotlit, ranks 2 to 5 on cards (a rank
 *  that wins nothing reads as no prize, its name dim), the claim line at the foot. */
export function paintResult(p: Paintable, spot: Named, cards: Named[]): void {
  const { ctx } = p;
  drawLines(ctx, [COPY.winnersHeading], 960, 144, 48, { weight: 600, size: 40, family: MITR, color: COLOR.ink, align: 'center' });
  const pz = wrapLines(spot.line, measurer(ctx, 600, MITR), 44, 1808);
  const pzTop = 186;
  drawLines(ctx, pz, 960, pzTop + (pz.length * 55) / 2, 55, { weight: 600, size: 44, family: MITR, color: COLOR.soft, align: 'center' });
  const fit = fitName(spot.name, measurer(ctx, 700, MITR), 132, 96, 1808);
  const wnTop = pzTop + pz.length * 55 + 10;
  const lh = fit.size * 1.1;
  drawLines(ctx, fit.lines, 960, wnTop + (fit.lines.length * lh) / 2, lh, { weight: 700, size: fit.size, family: MITR, color: COLOR.gold, align: 'center', glow: 30 });

  const colW = (1808 - 3 * 24) / 4;
  cards.forEach((card, i) => {
    const x = 56 + i * (colW + 24);
    const inner = colW - 56;
    const lines = wrapLines(card.line, measurer(ctx, 600, MITR), 30, inner);
    const nameFit = fitName(card.name, measurer(ctx, 700, MITR), 52, 32, inner);
    const nlh = nameFit.size * 1.15;
    const h = 28 + lines.length * 39 + 12 + nameFit.lines.length * nlh + 28;
    ctx.save();
    roundRect(ctx, x, 560, colW, h, 24);
    ctx.fillStyle = COLOR.raised;
    ctx.fill();
    ctx.restore();
    drawLines(ctx, lines, x + 28, 560 + 28 + (lines.length * 39) / 2, 39, { weight: 600, size: 30, family: MITR, color: COLOR.soft });
    const top = 560 + 28 + lines.length * 39 + 12;
    drawLines(ctx, nameFit.lines, x + 28, top + (nameFit.lines.length * nlh) / 2, nlh, {
      weight: 700,
      size: nameFit.size,
      family: MITR,
      color: card.none ? COLOR.out : COLOR.ink,
    });
  });
  const claim = wrapLines(COPY.claim, measurer(ctx, 400, SARABUN), 34, 1808);
  const clH = claim.length * 34 * 1.4;
  drawLines(ctx, claim, 960, 1080 - 56 - clH / 2, 34 * 1.4, { weight: 400, size: 34, family: SARABUN, color: COLOR.soft, align: 'center' });
}
