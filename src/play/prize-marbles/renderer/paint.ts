// Canvas painters for the marble-race reveal (gh#316). A WebGL scene cannot lay out Thai text, so every word
// on the projector frame, and the flat track it sits on, is painted here into 2D canvases the scene shows as
// textures: the background (night ground, track, lane separators, finish line and its label, the top bar),
// and the column of name plates. The top bar, the lower band's side columns and its centre figure are the
// gh#302 chrome the fireworks reveal already paints; they are imported from it, not copied.
//
// Values are the picked board's (design/Gh316Marbles.dc.html, VALUES and VALUES BY ROLE, option A, picked
// 2026-11-16). Every fade on the track is the board's colour pre-composited over the track, as listed there.
// Names and the MC's typed strings are drawn with fillText, which renders text and nothing else: no markup
// is ever parsed from them.

import { COLOR, measurer, paintTop, surface, type Dot, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { fitName, type Fit } from '../../prize-fireworks/renderer/text-fit.ts';
import { FINISH_X, LANE_DY, LANE_Y0, NAME_FIT, PLATE, TRACK } from './plan.ts';
import type { MarbleState } from './plan.ts';

export { COLOR, surface, type Paintable };
export { FACES, paintBand, paintFigure, FIGURE_H, FIGURE_W } from '../../prize-fireworks/renderer/paint.ts';

/** Track colours (VALUES BY ROLE, dir A). */
export const TRACK_COLOR = {
  ground: '#14142b',
  separator: '#45455c',
  finishGlow: '#66541c',
  marbleGlow: '#66541c',
} as const;

/** The four marble bodies, cycling by lane: decoration only, no fate meaning. Each with its rolling streak
 *  (35% over the track) and its stopped, dim body (40% over the track), as the board lists them. The
 *  accents come from the shared accent copy (gh#128: a file never pastes part of the accent trio). */
export const MARBLE_COLOR = [
  { body: COLOR.punch, streak: '#662248', out: '#72244d' },
  { body: COLOR.sky, streak: '#1c3875', out: '#1d3d80' },
  { body: COLOR.lilac, streak: '#535175', out: '#5c5a80' },
  { body: '#ffffff', streak: '#666675', out: '#727280' },
] as const;

/** The lower band is 170px on this board (gh#303 drew 190px); the fireworks band is centred 10px higher. */
export const BAND_CY = 975;
export const BAND_SHIFT = 10;

const MITR = "'Mitr', sans-serif";
const SARABUN = "'Sarabun', sans-serif";

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

type TextOpts = { weight: number; size: number; family: string; color: string; align?: CanvasTextAlign; strike?: boolean };

/** Lines centred on `cy` at `lineHeight` each, aligned on x. */
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

/** Separators sit midway in the gap between two plate rows. */
export function separatorYs(lanes: number): number[] {
  return Array.from({ length: Math.max(0, lanes - 1) }, (_, i) => LANE_Y0 + LANE_DY * i + PLATE.h + (LANE_DY - PLATE.h) / 2);
}

/** The full-frame background: the night ground, the track with its lanes and finish line, the finish label,
 *  and the gh#302 top bar. Repainted only when the heat's lane count changes (the short last heat). */
export function paintBackground(p: Paintable, eventName: string, label: string, dots: Dot[], lanes: number, finishLabel: string): void {
  const { ctx } = p;
  const ground = ctx.createLinearGradient(0, 0, 0, 1080);
  ground.addColorStop(0, COLOR.groundTop);
  ground.addColorStop(1, COLOR.groundBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.save();
  roundRect(ctx, TRACK.left, TRACK.top, TRACK.width, TRACK.height, TRACK.radius);
  ctx.fillStyle = TRACK_COLOR.ground;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = TRACK_COLOR.separator;
  for (const y of separatorYs(lanes)) ctx.fillRect(PLATE.x, y - 1, 1848 - PLATE.x, 2);
  const lanesH = TRACK.top + TRACK.height - LANE_Y0;
  ctx.fillStyle = TRACK_COLOR.finishGlow;
  ctx.fillRect(FINISH_X - 12, LANE_Y0, 24, lanesH);
  ctx.fillStyle = COLOR.gold;
  ctx.fillRect(FINISH_X - 2, LANE_Y0, 4, lanesH);
  drawLines(ctx, [finishLabel], 1620, 106 + 15, 30, { weight: 600, size: 30, family: MITR, color: COLOR.gold });
  paintTop(p, eventName, label, dots);
}

/** The plates column's canvas, in frame px: the 20 plates with room for the passed glow all round. */
export const PLATES_BOX = { x: PLATE.x - 24, y: LANE_Y0 - 24, w: PLATE.w + 48, h: LANE_DY * 19 + PLATE.h + 48 } as const;

export type PlateFit = Fit;

/** Plate names at the board's NAME FIT: Sarabun 700, 28px shrinking to 18px, then two lines. */
export function fitPlates(doc: Document, names: readonly string[]): PlateFit[] {
  const { ctx } = surface(doc, 1, 1, 1);
  const bold = measurer(ctx, 700, SARABUN);
  return names.map((name) => fitName(name, bold, NAME_FIT.size, NAME_FIT.floor, NAME_FIT.box));
}

/** One heat's plates in their lanes: the gh#302 night pill, gold once across, dim and struck through once
 *  stopped short. */
export function paintPlates(p: Paintable, fits: readonly PlateFit[], states: readonly MarbleState[]): void {
  const { ctx } = p;
  ctx.clearRect(0, 0, p.w, p.h);
  fits.forEach((fit, lane) => {
    const x = PLATE.x - PLATES_BOX.x;
    const y = LANE_Y0 + LANE_DY * lane - PLATES_BOX.y;
    const state = states[lane] ?? 'plain';
    ctx.save();
    roundRect(ctx, x, y, PLATE.w, PLATE.h, PLATE.h / 2);
    if (state === 'in') {
      ctx.shadowColor = COLOR.glow;
      ctx.shadowBlur = 16 * p.scale;
      ctx.fillStyle = COLOR.gold;
      ctx.fill();
    } else if (state === 'plain') {
      ctx.fillStyle = COLOR.raised;
      ctx.fill();
    } else {
      roundRect(ctx, x + 1, y + 1, PLATE.w - 2, PLATE.h - 2, PLATE.h / 2 - 1);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.raised;
      ctx.stroke();
    }
    ctx.restore();
    drawLines(ctx, fit.lines, x + PLATE.w / 2, y + PLATE.h / 2, fit.size, {
      weight: 700,
      size: fit.size,
      family: SARABUN,
      color: state === 'in' ? COLOR.onGold : state === 'out' ? COLOR.out : COLOR.ink,
      align: 'center',
      strike: state === 'out',
    });
  });
}
