// Canvas painters for the text of the zones reveal (gh#315). A WebGL scene cannot lay out Thai text, so every
// word on the projector frame is painted here into a 2D canvas the scene shows as a texture: the zone headers
// and the name atlas. The top bar and the lower band reuse the fireworks painters (the same gh#302 chrome).
// Coordinates are frame px (1920x1080, y down); each canvas carries its own scale so the texture matches the
// screen's backing pixels.
//
// Values are the picked board's (design/Gh315Zones.dc.html, layout A, VALUES and NAME FIT rows). Names are drawn
// with fillText, which renders text and nothing else: no markup is ever parsed from them.

import { COLOR, measurer, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { fitName, type Fit } from '../../prize-fireworks/renderer/text-fit.ts';
import { GRID, NAME_BOX, NAME_FIT } from './plan.ts';

export { COLOR };

const MITR = "'Mitr', sans-serif";
const SARABUN = "'Sarabun', sans-serif";

/** The faces this reveal paints with, for document.fonts.load. */
export const FACES = ['600 30px Mitr', '700 50px Mitr', '700 130px Mitr', '400 30px Sarabun', '700 20px Sarabun'] as const;

/** Header: a 22px zone dot, 10px gap, the zone name (Mitr 600 30px, white); the badge right (Mitr 600 30px, soft). */
export const HEAD = { dot: 22, gap: 10, size: 30 } as const;
/** Room above and below a name cell in the atlas, so Thai marks that overhang the line are kept. */
export const ATLAS_PAD_Y = 10;
const ATLAS_MAX = 4096;

type TextOpts = { weight: number; size: number; family: string; color: string; align?: CanvasTextAlign; strike?: boolean };

/** Lines centred on `cy`, `lineHeight` apart, aligned on x. A struck line gets a bar through its middle. */
function drawLines(ctx: CanvasRenderingContext2D, lines: readonly string[], x: number, cy: number, lineHeight: number, o: TextOpts): void {
  ctx.save();
  ctx.font = `${o.weight} ${o.size}px ${o.family}`;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'middle';
  const top = cy - (lines.length * lineHeight) / 2;
  lines.forEach((line, i) => {
    const y = top + lineHeight * (i + 0.5);
    ctx.fillText(line, x, y);
    if (o.strike) {
      const w = ctx.measureText(line).width;
      const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      const t = Math.max(1, o.size / 14);
      ctx.fillRect(x0, y - t / 2, w, t);
    }
  });
  ctx.restore();
}

/** One zone header strip, w x HEAD-high frame px: dot, zone name, badge. */
export function paintHead(p: Paintable, color: string, label: string, badge: string): void {
  const { ctx, w, h } = p;
  const cy = h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(HEAD.dot / 2, cy, HEAD.dot / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  drawLines(ctx, [label], HEAD.dot + HEAD.gap, cy, HEAD.size, { weight: 600, size: HEAD.size, family: MITR, color: COLOR.ink });
  drawLines(ctx, [badge], w, cy, HEAD.size, { weight: 600, size: HEAD.size, family: MITR, color: COLOR.soft, align: 'right' });
}

/** NAME FIT for every name: Sarabun 700 (every chip on the board is bold), 20px to an 18px floor, then wrap.
 *  `box` is the text width to fit in: the board's NAME_BOX, or the narrower one a grown column leaves. */
export function fitNames(doc: Document, names: readonly string[], box: number = NAME_BOX): Fit[] {
  const { ctx } = surface(doc, 1, 1, 1);
  const bold = measurer(ctx, 700, SARABUN);
  return names.map((name) => fitName(name, bold, NAME_FIT.size, NAME_FIT.floor, box));
}

/** A chip's own height for its fit: the board's chips are line-height 1, rows at least 22px. */
export function chipHeight(fit: Fit): number {
  return Math.max(GRID.minRow, fit.lines.length * fit.size);
}

export type AtlasCell = [number, number, number, number];
export type NameAtlas = { paint: Paintable; plain: AtlasCell[]; struck: AtlasCell[] };

/**
 * Every name twice -- plain and struck through -- as white coverage in one texture; the shader colours it per
 * state. A cell is the chip's own name box wide (`boxes`, in unscaled grid units -- a zone whose columns grew
 * has a narrower one) and the chip's height plus ATLAS_PAD_Y above and below, shelf-packed; the scale drops if
 * the shelves would outgrow ATLAS_MAX. Cell rects are uv (u0, v0, u1, v1), v down. Heights and widths stay
 * unscaled: the shader maps a cell over the chip's scaled box, so the name scales with the chip and is never
 * stretched.
 */
export function paintNameAtlas(doc: Document, names: readonly string[], fits: readonly Fit[], heights: readonly number[], scale: number, boxes?: readonly number[]): NameAtlas {
  const cellH = (i: number): number => heights[i]! + 2 * ATLAS_PAD_Y;
  const cellW = (i: number): number => boxes?.[i] ?? NAME_BOX;
  const widest = boxes?.length ? Math.max(...boxes) : NAME_BOX;
  const gap = 2;
  const pack = (s: number): { w: number; h: number; at: [number, number][] } => {
    const width = ATLAS_MAX / s;
    const at: [number, number][] = [];
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (let k = 0; k < names.length * 2; k++) {
      const w = cellW(k >> 1);
      if (x + w > width) {
        x = 0;
        y += shelf + gap;
        shelf = 0;
      }
      at.push([x, y]);
      x += w + gap;
      shelf = Math.max(shelf, cellH(k >> 1));
    }
    return { w: Math.min(width, Math.max(1, names.length * 2) * (widest + gap)), h: Math.max(1, y + shelf), at };
  };
  let s = scale;
  let packed = pack(s);
  while (packed.h * s > ATLAS_MAX && s > 0.25) {
    s *= 0.9;
    packed = pack(s);
  }
  const paint = surface(doc, packed.w, packed.h, s);
  const plain: AtlasCell[] = [];
  const struck: AtlasCell[] = [];
  fits.forEach((fit, i) => {
    for (const strike of [false, true]) {
      const [x, y] = packed.at[i * 2 + (strike ? 1 : 0)]!;
      const h = cellH(i);
      const w = cellW(i);
      drawLines(paint.ctx, fit.lines, x + w / 2, y + h / 2, fit.size, {
        weight: 700,
        size: fit.size,
        family: SARABUN,
        color: '#ffffff',
        align: 'center',
        strike,
      });
      (strike ? struck : plain).push([x / packed.w, y / packed.h, (x + w) / packed.w, (y + h) / packed.h]);
    }
  });
  return { paint, plain, struck };
}
