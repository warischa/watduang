// Canvas painters for the text and flat shapes of the fireworks reveal (gh#305). A WebGL scene cannot lay
// out Thai text, so every word on the projector frame is painted here into a 2D canvas that the scene
// shows as a texture: the frame chrome, the lower band's figure, the lantern-name atlas, the rocket plates
// and the result frame. Coordinates are the board's frame px (1920x1080, y down); each canvas carries its
// own scale so the texture matches the screen's backing pixels.
//
// Values are the picked board's (design/Gh303Fireworks.dc.html, VALUES and VALUES BY ROLE, picked
// 2026-11-11). Names and the MC's typed strings are drawn with fillText, which renders text and nothing
// else: no markup is ever parsed from them.

import { fitName, wrapLines, type Fit, type Measure } from './text-fit.ts';

export const COLOR = {
  groundTop: '#14142b',
  groundBottom: '#23214d',
  raised: '#23214d',
  ink: '#ffffff',
  soft: '#d9d6f0',
  gold: '#ffcc00',
  punch: '#ff3d7f',
  sky: '#2b7bff',
  /** --accent-lilac, for the phase-2 renderers that import this palette (zones, marbles). */
  lilac: '#c9c2ff',
  out: '#9a97c0',
  onGold: '#14142b',
  glow: 'rgba(255,204,0,0.45)',
} as const;

const MITR = "'Mitr', sans-serif";
const SARABUN = "'Sarabun', sans-serif";

/** The faces this reveal paints with, for document.fonts.load. */
export const FACES = ['600 30px Mitr', '700 50px Mitr', '400 20px Sarabun', '700 20px Sarabun'] as const;

export type Paintable = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; scale: number; w: number; h: number };

/** A canvas of w x h frame px at `scale` backing px per frame px, drawing in frame px. */
export function surface(doc: Document, w: number, h: number, scale: number): Paintable {
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('fireworks: no 2D canvas context');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  return { canvas, ctx, scale, w, h };
}

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

export function measurer(ctx: CanvasRenderingContext2D, weight: number, family: string): Measure {
  return (text, size) => {
    ctx.font = font(weight, size, family);
    return ctx.measureText(text).width;
  };
}

/** A rounded-rect path with per-corner radii (top-left, top-right, bottom-right, bottom-left). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): void {
  const [tl, tr, br, bl] = (typeof r === 'number' ? [r, r, r, r] : r).map((v) => Math.min(v, w / 2, h / 2)) as [number, number, number, number];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

type TextOpts = { weight: number; size: number; family: string; color: string; align?: CanvasTextAlign; glow?: number; strike?: boolean };

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
  lines.forEach((line, i) => {
    const y = top + lineHeight * (i + 0.5);
    ctx.fillText(line, x, y);
    if (o.strike) {
      const w = ctx.measureText(line).width;
      const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      ctx.shadowBlur = 0;
      ctx.fillRect(x0, y - Math.max(1, o.size / 14) / 2, w, Math.max(1, o.size / 14));
    }
  });
  ctx.restore();
}

// ---- the frame chrome ----------------------------------------------------------------------------

export type Dot = 'done' | 'on' | 'todo';

/** The top bar: the event name left, the round label and dots right (the gh#302 picked bar). */
export function paintTop(p: Paintable, eventName: string, label: string, dots: Dot[]): void {
  const { ctx } = p;
  const cy = 48;
  const labelMeasure = measurer(ctx, 600, MITR);
  const dotW = dots.map((_, i) => (i === dots.length - 1 ? 36 : 22));
  const dotsW = dotW.reduce((a, b) => a + b, 0) + 14 * (dots.length - 1);
  const labelW = labelMeasure(label, 30);
  const groupW = labelW + 14 + 14 + dotsW;
  let x = 1864 - groupW;
  drawLines(ctx, [label], x, cy, 30, { weight: 600, size: 30, family: MITR, color: COLOR.ink });
  x += labelW + 28;
  dots.forEach((d, i) => {
    const w = dotW[i]!;
    ctx.save();
    roundRect(ctx, x, cy - 11, w, 22, 11);
    if (d === 'on') {
      ctx.shadowColor = COLOR.glow;
      ctx.shadowBlur = 18 * p.scale;
      ctx.fillStyle = COLOR.gold;
      ctx.fill();
    } else {
      if (d === 'done') {
        ctx.fillStyle = COLOR.soft;
        ctx.fill();
      }
      roundRect(ctx, x + 1.5, cy - 9.5, w - 3, 19, 9.5);
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLOR.soft;
      ctx.stroke();
    }
    ctx.restore();
    x += w + 14;
  });
  // The MC's typed name: shrunk to the room left of the dots rather than run under them.
  const room = 1864 - groupW - 40 - 56;
  const evMeasure = measurer(ctx, 600, MITR);
  let size = 36;
  while (size > 12 && evMeasure(eventName, size) > room) size -= 1;
  drawLines(ctx, [eventName], 56, cy, size * 1.2, { weight: 600, size, family: MITR, color: COLOR.soft });
}

/** A label over the game name: the low band's left block, or the final's hud. */
function paintGameBlock(ctx: CanvasRenderingContext2D, label: string, gameName: string, top: number, box: number): void {
  const lines = wrapLines(label, measurer(ctx, 600, MITR), 30, box);
  const lkH = lines.length * 40.5;
  drawLines(ctx, lines, 56, top + lkH / 2, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft });
  drawLines(ctx, [gameName], 56, top + lkH + 30, 60, { weight: 700, size: 50, family: MITR, color: COLOR.gold });
}

const BAND_CY = 965;
/** The band's side columns: 1fr either side of the figure; the figure is never wider than this leaves. */
const SIDE_BOX = 684;

export type BandSide = { kind: 'text'; text: string } | { kind: 'legend'; passed: string; notPassed: string };

/** The elimination frame's lower band, both side columns. The centre figure is painted apart. */
export function paintBand(p: Paintable, left: string, gameName: string, right: BandSide): void {
  const { ctx } = p;
  paintGameBlock(ctx, left, gameName, BAND_CY - 50.25, SIDE_BOX);
  if (right.kind === 'text') {
    const lines = wrapLines(right.text, measurer(ctx, 600, MITR), 30, SIDE_BOX);
    drawLines(ctx, lines, 1864, BAND_CY, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft, align: 'right' });
  } else {
    legendChip(ctx, p.scale, 1864 - 170, BAND_CY - 54, right.passed, true);
    legendChip(ctx, p.scale, 1864 - 170, BAND_CY + 6, right.notPassed, false);
  }
}

function legendChip(ctx: CanvasRenderingContext2D, scale: number, x: number, y: number, text: string, passed: boolean): void {
  ctx.save();
  roundRect(ctx, x, y, 170, 48, 24);
  if (passed) {
    ctx.shadowColor = COLOR.glow;
    ctx.shadowBlur = 16 * scale;
    ctx.fillStyle = COLOR.gold;
    ctx.fill();
  } else {
    roundRect(ctx, x + 1, y + 1, 168, 46, 23);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.raised;
    ctx.stroke();
  }
  ctx.restore();
  drawLines(ctx, [text], x + 85, y + 24, 30, {
    weight: passed ? 700 : 400,
    size: 30,
    family: SARABUN,
    color: passed ? COLOR.onGold : COLOR.out,
    align: 'center',
    strike: !passed,
  });
}

/** The final's hud: the rockets-still-up label over the game name, left; the rule, right. */
export function paintHud(p: Paintable, left: string, gameName: string, rule: string): void {
  const { ctx } = p;
  paintGameBlock(ctx, left, gameName, 1044 - 100.5, 800);
  drawLines(ctx, [rule], 1864, 1044 - 20.25, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft, align: 'right' });
}

// ---- the centre figure -----------------------------------------------------------------------------

export const FIGURE_W = 900;
export const FIGURE_H = 240;
export const FIGURE_CY = BAND_CY;

/** The countdown numeral (140px, 40px glow) or the count with its unit (130px, 24px glow), centred. */
export function paintFigure(p: Paintable, figure: { kind: 'numeral' | 'count'; value: number }, unit: string): void {
  const { ctx } = p;
  ctx.clearRect(0, 0, p.w, p.h);
  const cx = FIGURE_W / 2;
  const cy = FIGURE_H / 2;
  if (figure.kind === 'numeral') {
    drawLines(ctx, [String(figure.value)], cx, cy, 140, { weight: 700, size: 140, family: MITR, color: COLOR.gold, align: 'center', glow: 40 });
    return;
  }
  const num = String(figure.value);
  const numW = measurer(ctx, 700, MITR)(num, 130);
  const unitW = measurer(ctx, 600, MITR)(unit, 44);
  const x0 = cx - (numW + 28 + unitW) / 2;
  drawLines(ctx, [num], x0, cy, 130, { weight: 700, size: 130, family: MITR, color: COLOR.gold, glow: 24 });
  drawLines(ctx, [unit], x0 + numW + 28, cy, 44, { weight: 600, size: 44, family: MITR, color: COLOR.soft });
}

// ---- the lantern names ---------------------------------------------------------------------------

/** Lantern name fit (NAME FIT row): Sarabun 20px, floor 18px, in the lantern's box less 6px each side. */
export const LANTERN_FIT = { size: 20, floor: 18, pad: 6 } as const;
/** Room above and below the text box in the atlas, so Thai marks that overhang the line are kept. */
export const ATLAS_PAD_Y = 10;
const ATLAS_MAX = 4096;

export type LanternFits = { lit: Fit; out: Fit }[];

export function fitLanterns(doc: Document, names: readonly string[], box: number): LanternFits {
  const { ctx } = surface(doc, 1, 1, 1);
  const bold = measurer(ctx, 700, SARABUN);
  const plain = measurer(ctx, 400, SARABUN);
  return names.map((name) => ({
    lit: fitName(name, bold, LANTERN_FIT.size, LANTERN_FIT.floor, box),
    out: fitName(name, plain, LANTERN_FIT.size, LANTERN_FIT.floor, box),
  }));
}

export type AtlasCell = [number, number, number, number];
export type Atlas = { paint: Paintable; lit: AtlasCell[]; out: AtlasCell[] };

/**
 * Every lantern's name twice -- lit (bold) and dark (regular, struck through) -- as white coverage in one
 * texture. Cells are text boxes (`boxW` x row height, plus ATLAS_PAD_Y above and below), shelf-packed; the
 * scale drops if the shelves would outgrow ATLAS_MAX. Cell rects are returned as uv (u0, v0, u1, v1), v down.
 */
export function paintAtlas(doc: Document, fits: LanternFits, rowHeights: number[], boxW: number, scale: number): Atlas {
  const cellH = (i: number): number => rowHeights[Math.floor(i / 8)]! + 2 * ATLAS_PAD_Y;
  const gap = 2;
  const pack = (s: number): { w: number; h: number; at: [number, number][] } => {
    const width = Math.min(ATLAS_MAX / s, 4096);
    const at: [number, number][] = [];
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (let k = 0; k < fits.length * 2; k++) {
      const h = cellH(k >> 1);
      if (x + boxW > width) {
        x = 0;
        y += shelf + gap;
        shelf = 0;
      }
      at.push([x, y]);
      x += boxW + gap;
      shelf = Math.max(shelf, h);
    }
    return { w: width, h: y + shelf, at };
  };
  let s = scale;
  let packed = pack(s);
  while (packed.h * s > ATLAS_MAX && s > 0.25) {
    s *= 0.9;
    packed = pack(s);
  }
  const paint = surface(doc, packed.w, packed.h, s);
  const lit: AtlasCell[] = [];
  const out: AtlasCell[] = [];
  fits.forEach((fit, i) => {
    for (const variant of ['lit', 'out'] as const) {
      const [x, y] = packed.at[i * 2 + (variant === 'lit' ? 0 : 1)]!;
      const h = cellH(i);
      const f = fit[variant];
      drawLines(paint.ctx, f.lines, x + boxW / 2, y + h / 2, f.size, {
        weight: variant === 'lit' ? 700 : 400,
        size: f.size,
        family: SARABUN,
        color: '#ffffff',
        align: 'center',
        strike: variant === 'out',
      });
      (variant === 'lit' ? lit : out).push([x / packed.w, y / packed.h, (x + boxW) / packed.w, (y + h) / packed.h]);
    }
  });
  return { paint, lit, out };
}

// ---- the final's plates ----------------------------------------------------------------------------

/** Plate: 310px wide, 10px 22px padding, 28px radius; name Sarabun 700 40px/1.15, floor 24px, in 266px. */
export const PLATE = { w: 310, padY: 10, padX: 22, radius: 28, glow: 24, nameBox: 266 } as const;

export type PlatePaint = { paint: Paintable; height: number };

/** One plate, rising (gold, ink name) or burst (raised, its prize label over a white name). The canvas
 *  carries a glow margin all round; `height` is the plate's own height. */
export function paintPlate(doc: Document, name: string, scale: number, burst: string | null): PlatePaint {
  const probe = surface(doc, 1, 1, 1).ctx;
  const fit = fitName(name, measurer(probe, 700, SARABUN), 40, 24, PLATE.nameBox);
  const nameH = fit.lines.length * fit.size * 1.15;
  const labelH = burst === null ? 0 : 33 + 6;
  const height = PLATE.padY * 2 + labelH + nameH;
  const m = PLATE.glow * 2;
  const paint = surface(doc, PLATE.w + 2 * m, height + 2 * m, scale);
  const { ctx } = paint;
  ctx.save();
  roundRect(ctx, m, m, PLATE.w, height, PLATE.radius);
  if (burst === null) {
    ctx.shadowColor = COLOR.glow;
    ctx.shadowBlur = PLATE.glow * scale;
    ctx.fillStyle = COLOR.gold;
  } else {
    ctx.fillStyle = COLOR.raised;
  }
  ctx.fill();
  ctx.restore();
  const cx = m + PLATE.w / 2;
  let y = m + PLATE.padY;
  if (burst !== null) {
    drawLines(ctx, [burst], cx, y + 16.5, 33, { weight: 600, size: 30, family: MITR, color: COLOR.soft, align: 'center' });
    y += labelH;
  }
  drawLines(ctx, fit.lines, cx, y + nameH / 2, fit.size * 1.15, {
    weight: 700,
    size: fit.size,
    family: SARABUN,
    color: burst === null ? COLOR.onGold : COLOR.ink,
    align: 'center',
  });
  return { paint, height };
}

// ---- the final's result frame ------------------------------------------------------------------------

export type ResultWinner = { line: string; name: string };

/** The gh#302 result frame (B, picked): the heading, first prize spotlit, prizes 2 to 5 on cards. */
export function paintResult(p: Paintable, heading: string, winners: ResultWinner[]): void {
  const { ctx } = p;
  drawLines(ctx, [heading], 960, 144, 48, { weight: 600, size: 40, family: MITR, color: COLOR.ink, align: 'center' });
  const [first, ...rest] = winners;
  if (first) {
    const pz = wrapLines(first.line, measurer(ctx, 600, MITR), 44, 1808);
    const pzTop = 186;
    drawLines(ctx, pz, 960, pzTop + (pz.length * 55) / 2, 55, { weight: 600, size: 44, family: MITR, color: COLOR.soft, align: 'center' });
    const fit = fitName(first.name, measurer(ctx, 700, MITR), 132, 96, 1808);
    const wnTop = pzTop + pz.length * 55 + 10;
    const lh = fit.size * 1.1;
    drawLines(ctx, fit.lines, 960, wnTop + (fit.lines.length * lh) / 2, lh, {
      weight: 700,
      size: fit.size,
      family: MITR,
      color: COLOR.gold,
      align: 'center',
      glow: 30,
    });
  }
  const colW = (1808 - 3 * 24) / 4;
  rest.forEach((w, i) => {
    const x = 56 + i * (colW + 24);
    const inner = colW - 56;
    const pz = wrapLines(w.line, measurer(ctx, 600, MITR), 30, inner);
    const fit = fitName(w.name, measurer(ctx, 700, MITR), 52, 32, inner);
    const lh = fit.size * 1.15;
    const h = 28 + pz.length * 39 + 12 + fit.lines.length * lh + 28;
    ctx.save();
    roundRect(ctx, x, 560, colW, h, 24);
    ctx.fillStyle = COLOR.raised;
    ctx.fill();
    ctx.restore();
    drawLines(ctx, pz, x + 28, 560 + 28 + (pz.length * 39) / 2, 39, { weight: 600, size: 30, family: MITR, color: COLOR.soft });
    const wnTop = 560 + 28 + pz.length * 39 + 12;
    drawLines(ctx, fit.lines, x + 28, wnTop + (fit.lines.length * lh) / 2, lh, { weight: 700, size: fit.size, family: MITR, color: COLOR.ink });
  });
}
