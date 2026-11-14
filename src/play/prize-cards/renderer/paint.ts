// Canvas painters for the cards reveal (gh#306). A WebGL scene cannot lay out Thai text, so every word and
// every card face is painted here into a 2D canvas the scene shows as a texture: the card atlas (names and
// faces as white coverage the card shader colours), the rule card, and the lower band's centre. The top bar
// and the band's two side columns are the gh#302 chrome the fireworks reveal already paints; they are
// imported from it, not copied, so the two games keep one picked bar.
//
// Values are the picked board's (design/Gh303Cards.dc.html, VALUES and VALUES BY ROLE, option B, picked
// 2026-11-11). Names and the MC's typed strings are drawn with fillText, which renders text and nothing
// else: no markup is ever parsed from them.

import { COLOR, measurer, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import { fitName, graphemes, wrapLines, type Fit, type Measure } from '../../prize-fireworks/renderer/text-fit.ts';
import type { Card, RuleId, Suit } from '../../../prize-draw/cards.ts';
import { CARD, NAME_FIT, RULE_CARD, nameBoxes, type Centre } from './plan.ts';
import { rankLabel } from './copy.ts';

export { COLOR };

/** Colours new on this board: red suits and ranks (C2), the card-back hatch line, the rule card label. */
export const CARD_COLOR = { red: '#c2185b', hatch: '#2e2b63', ruleLabel: '#3d3b5c', face: '#ffffff', ink: '#14142b' } as const;

const MITR = "'Mitr', sans-serif";
const SARABUN = "'Sarabun', sans-serif";

/** The faces this reveal paints with, for document.fonts.load. */
export const FACES = [
  '600 30px Mitr',
  '700 30px Mitr',
  '600 40px Mitr',
  '600 44px Mitr',
  '700 50px Mitr',
  '700 64px Mitr',
  '700 120px Mitr',
  '700 130px Mitr',
  '400 20px Sarabun',
  '700 20px Sarabun',
] as const;

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

type TextOpts = { weight: number; size: number; family: string; color: string; align?: CanvasTextAlign; glow?: number; strike?: boolean };

/** Lines centred on `cy` at `lineHeight` each, aligned on x. */
function drawLines(p: Paintable, lines: readonly string[], x: number, cy: number, lineHeight: number, o: TextOpts): void {
  const { ctx } = p;
  ctx.save();
  ctx.font = font(o.weight, o.size, o.family);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'middle';
  if (o.glow) {
    ctx.shadowColor = COLOR.glow;
    ctx.shadowBlur = o.glow * p.scale;
  }
  const top = cy - (lines.length * lineHeight) / 2;
  lines.forEach((line, i) => {
    const y = top + lineHeight * (i + 0.5);
    ctx.fillText(line, x, y);
    if (o.strike) {
      const w = ctx.measureText(line).width;
      const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
      const t = Math.max(1, o.size / 14);
      ctx.shadowBlur = 0;
      ctx.fillRect(x0, y - t / 2, w, t);
    }
  });
  ctx.restore();
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

// ---- suits: the board's own 24x24 drawings ---------------------------------------------------------------

type SuitShape = { circles: readonly (readonly [number, number, number])[]; path: string };

/** Path data verbatim from the board's suit icons (viewBox 0 0 24 24). */
export const SUITS: Record<Suit, SuitShape> = {
  S: {
    circles: [],
    path: 'M12 2C9 6.5 3 9.5 3 14c0 2.8 2.2 4.6 4.6 4.6 1.6 0 2.9-.8 3.6-1.9-.2 2.2-1.1 3.9-2.7 5.3h7c-1.6-1.4-2.5-3.1-2.7-5.3.7 1.1 2 1.9 3.6 1.9 2.4 0 4.6-1.8 4.6-4.6 0-4.5-6-7.5-9-12z',
  },
  H: {
    circles: [],
    path: 'M12 21.5s-7.6-4.7-9.6-9.4C1 8.6 3.1 4.5 6.9 4.5c2.1 0 3.7 1.2 5.1 3 1.4-1.8 3-3 5.1-3 3.8 0 5.9 4.1 4.5 7.6-2 4.7-9.6 9.4-9.6 9.4z',
  },
  D: { circles: [], path: 'M12 2l8.2 10L12 22 3.8 12z' },
  C: {
    circles: [
      [12, 11, 3],
      [12, 6.6, 4.4],
      [6.9, 13.2, 4.4],
      [17.1, 13.2, 4.4],
    ],
    path: 'M10.6 11.5h2.8c.1 4.3.9 7.3 2.9 10H7.7c2-2.7 2.8-5.7 2.9-10z',
  },
};

export const isRed = (suit: Suit): boolean => suit === 'H' || suit === 'D';

type PathCmd = { op: 'M' | 'L' | 'C' | 'Z'; pts: number[] };

/** SVG path data (M L H V C S Z, absolute and relative) as absolute moves, lines and cubics. */
export function parsePath(d: string): PathCmd[] {
  const tokens = d.match(/[MmLlHhVvCcSsZz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const out: PathCmd[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrl: [number, number] | null = null;
  const num = (): number => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        out.push({ op: 'M', pts: [x, y] });
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        break;
      case 'L':
        x = ox + num();
        y = oy + num();
        out.push({ op: 'L', pts: [x, y] });
        lastCtrl = null;
        break;
      case 'H':
        x = ox + num();
        out.push({ op: 'L', pts: [x, y] });
        lastCtrl = null;
        break;
      case 'V':
        y = oy + num();
        out.push({ op: 'L', pts: [x, y] });
        lastCtrl = null;
        break;
      case 'C': {
        const p = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
        out.push({ op: 'C', pts: p });
        lastCtrl = [p[2]!, p[3]!];
        x = p[4]!;
        y = p[5]!;
        break;
      }
      case 'S': {
        const c1: [number, number] = lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const p = [c1[0], c1[1], ox + num(), oy + num(), ox + num(), oy + num()];
        out.push({ op: 'C', pts: p });
        lastCtrl = [p[2]!, p[3]!];
        x = p[4]!;
        y = p[5]!;
        break;
      }
      case 'Z':
        out.push({ op: 'Z', pts: [] });
        x = sx;
        y = sy;
        lastCtrl = null;
        break;
      default:
        throw new Error(`cards: unsupported path command ${cmd}`);
    }
  }
  return out;
}

const PARSED: Record<Suit, PathCmd[]> = { S: parsePath(SUITS.S.path), H: parsePath(SUITS.H.path), D: parsePath(SUITS.D.path), C: parsePath(SUITS.C.path) };

/** A suit drawn in a `size` square with its top-left at (x, y). */
export function drawSuit(ctx: CanvasRenderingContext2D, suit: Suit, x: number, y: number, size: number, color: string): void {
  const k = size / 24;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [cx, cy, r] of SUITS[suit].circles) {
    ctx.moveTo(x + (cx + r) * k, y + cy * k);
    ctx.arc(x + cx * k, y + cy * k, r * k, 0, Math.PI * 2);
  }
  for (const c of PARSED[suit]) {
    const p = c.pts.map((v, i) => (i % 2 === 0 ? x + v * k : y + v * k));
    if (c.op === 'M') ctx.moveTo(p[0]!, p[1]!);
    else if (c.op === 'L') ctx.lineTo(p[0]!, p[1]!);
    else if (c.op === 'C') ctx.bezierCurveTo(p[0]!, p[1]!, p[2]!, p[3]!, p[4]!, p[5]!);
    else ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

// ---- the card atlas ----------------------------------------------------------------------------------

/** What each card needs painted: a deal shows backs only, so a deal's atlas holds no face and no verdict. */
export type CardPaint = { name: string; card: Card | null; verdict: 'pass' | 'fail' | null };
export type Cell = [number, number, number, number];
export type CardCells = { back: Cell; up: Cell | null; end: Cell | null; face: Cell | null };
export type CardAtlas = { paint: Paintable; cells: CardCells[] };
/** The cards' shape in card units: one width, and each card's height (a grown row is taller). */
export type CardGeometry = { cardW: number; heights: readonly number[] };

const ATLAS_MAX = 4096;
const NO_CELL: Cell = [0, 0, 0, 0];

export type NameFits = { back: Fit; up: Fit | null; end: Fit | null };

/** NAME FIT on cards: 20px, floor 16px, then wrapped; bold on a passing card. In card units, for cards `cardW` wide. */
export function fitCards(doc: Document, cards: readonly CardPaint[], cardW: number = CARD.w): NameFits[] {
  const box = nameBoxes(cardW);
  const { ctx } = surface(doc, 1, 1, 1);
  const plain = measurer(ctx, 400, SARABUN);
  const bold = measurer(ctx, 700, SARABUN);
  return cards.map((c) => ({
    back: fitName(c.name, plain, NAME_FIT.size, NAME_FIT.floor, box.down),
    up: c.card ? fitName(c.name, plain, NAME_FIT.size, NAME_FIT.floor, box.up) : null,
    end: c.verdict ? fitName(c.name, c.verdict === 'pass' ? bold : plain, NAME_FIT.size, NAME_FIT.floor, box.up) : null,
  }));
}

/**
 * Every card's name (face down, face up, and judged when a verdict exists) and every distinct face, as white
 * coverage in one texture, shelf-packed in card units at `scale` backing px per unit; the scale drops if
 * the shelves would outgrow ATLAS_MAX. Cells are uv rects (u0, v0, u1, v1), v down.
 */
export function paintCardAtlas(
  doc: Document,
  cards: readonly CardPaint[],
  fits: readonly NameFits[],
  scale: number,
  geometry: CardGeometry = { cardW: CARD.w, heights: [] },
): CardAtlas {
  type Item = { w: number; h: number; draw: (p: Paintable, x: number, y: number) => void; put: (cell: Cell) => void };
  const box = nameBoxes(geometry.cardW);
  const items: Item[] = [];
  const cells: CardCells[] = cards.map(() => ({ back: NO_CELL, up: null, end: null, face: null }));
  const faces = new Map<string, Cell>();
  // A cell is as tall as the card it is drawn for: the shader maps a cell over the card's whole height.
  const nameItem = (fit: Fit, w: number, h: number, weight: number, strike: boolean, put: (cell: Cell) => void): Item => ({
    w,
    h,
    draw: (p, x, y) => drawLines(p, fit.lines, x + w / 2, y + h / 2, fit.size, { weight, size: fit.size, family: SARABUN, color: '#ffffff', align: 'center', strike }),
    put,
  });
  cards.forEach((c, i) => {
    const f = fits[i]!;
    const h = geometry.heights[i] ?? CARD.h;
    items.push(nameItem(f.back, box.down, h, 400, false, (cell) => (cells[i]!.back = cell)));
    if (f.up) items.push(nameItem(f.up, box.up, h, 400, false, (cell) => (cells[i]!.up = cell)));
    if (f.end) items.push(nameItem(f.end, box.up, h, c.verdict === 'pass' ? 700 : 400, c.verdict === 'fail', (cell) => (cells[i]!.end = cell)));
    const faceKey = c.card ? `${c.card.suit}${c.card.rank}@${h}` : '';
    if (c.card && !faces.has(faceKey)) {
      const card = c.card;
      faces.set(faceKey, NO_CELL);
      items.push({
        w: CARD.face,
        h,
        draw: (p, x, y) => {
          const label = rankLabel(card.rank);
          const rankW = measurer(p.ctx, 700, MITR)(label, 30);
          drawLines(p, [label], x, y + h / 2, 30, { weight: 700, size: 30, family: MITR, color: '#ffffff' });
          drawSuit(p.ctx, card.suit, x + rankW + 4, y + h / 2 - 12, 24, '#ffffff');
        },
        put: (cell) => faces.set(faceKey, cell),
      });
    }
  });

  const gap = 2;
  const pack = (s: number): { w: number; h: number; at: [number, number][] } => {
    const width = Math.min(ATLAS_MAX / s, 4096);
    const at: [number, number][] = [];
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const it of items) {
      if (x + it.w > width) {
        x = 0;
        y += shelf + gap;
        shelf = 0;
      }
      at.push([x, y]);
      shelf = Math.max(shelf, it.h);
      x += it.w + gap;
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
  items.forEach((it, k) => {
    const [x, y] = packed.at[k]!;
    it.draw(paint, x, y);
    it.put([x / packed.w, y / packed.h, (x + it.w) / packed.w, (y + it.h) / packed.h]);
  });
  cards.forEach((c, i) => {
    if (c.card) cells[i]!.face = faces.get(`${c.card.suit}${c.card.rank}@${geometry.heights[i] ?? CARD.h}`)!;
  });
  return { paint, cells };
}

// ---- the rule card -------------------------------------------------------------------------------

/** The rule card's glow (0 0 60px gold) needs this margin all round. */
export const RULE_GLOW = 60;

const wordSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

/** Break `text` into lines no wider than `box`, between words (Thai has no spaces between them). */
export function wrapWords(text: string, measure: Measure, size: number, box: number): string[] {
  if (measure(text, size) <= box) return [text];
  const words = wordSegmenter ? Array.from(wordSegmenter.segment(text), (s) => s.segment) : graphemes(text);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && measure(line + word, size) > box) {
      lines.push(line.trimEnd());
      line = word.trimStart();
    } else line += word;
  }
  if (line) lines.push(line);
  return lines.flatMap((l) => (measure(l, size) > box ? wrapLines(l, measure, size, box) : [l]));
}

/** The suits a rule keeps, for the card's icon row; a rank rule keeps no suit, so it shows none. */
export function ruleSuits(rule: RuleId): Suit[] {
  return rule === 'black' ? ['S', 'C'] : rule === 'clubs' ? ['C'] : [];
}

export type RuleCardPaint = { front: Paintable; back: Paintable; w: number; h: number };

/** Option B's rule card, both sides: white face (label, the rule at 120px, the suits it keeps), the card
 *  back's hatch behind it. Canvases carry the glow margin; `w` x `h` is the card itself. */
export function paintRuleCard(doc: Document, rule: RuleId, label: string, text: string, scale: number): RuleCardPaint {
  const probe = surface(doc, 1, 1, 1).ctx;
  const inner = RULE_CARD.w - 2 * 48;
  const lines = wrapWords(text, measurer(probe, 700, MITR), 120, inner);
  const suits = ruleSuits(rule);
  const h = 40 + 50 + 12 + lines.length * 144 + (suits.length ? 14 + 72 : 0) + 40;
  const m = RULE_GLOW;
  const w = RULE_CARD.w;
  const side = (fill: (p: Paintable) => void): Paintable => {
    const p = surface(doc, w + 2 * m, h + 2 * m, scale);
    const { ctx } = p;
    ctx.save();
    roundRect(ctx, m, m, w, h, 32);
    ctx.shadowColor = COLOR.glow;
    ctx.shadowBlur = 60 * scale;
    ctx.fillStyle = CARD_COLOR.face;
    ctx.fill();
    ctx.restore();
    fill(p);
    return p;
  };
  const front = side((p) => {
    let y = m + 40;
    drawLines(p, [label], m + w / 2, y + 25, 50, { weight: 600, size: 40, family: MITR, color: CARD_COLOR.ruleLabel, align: 'center' });
    y += 50 + 12;
    drawLines(p, lines, m + w / 2, y + (lines.length * 144) / 2, 144, { weight: 700, size: 120, family: MITR, color: CARD_COLOR.ink, align: 'center' });
    y += lines.length * 144 + 14;
    const rowW = suits.length * 72 + (suits.length - 1) * 24;
    suits.forEach((suit, k) => drawSuit(p.ctx, suit, m + w / 2 - rowW / 2 + k * 96, y, 72, isRed(suit) ? CARD_COLOR.red : CARD_COLOR.ink));
  });
  const back = side((p) => {
    const { ctx } = p;
    ctx.save();
    roundRect(ctx, m, m, w, h, 32);
    ctx.clip();
    ctx.fillStyle = COLOR.raised;
    ctx.fillRect(m, m, w, h);
    // The card back's hatch: a 1px line every 7px at 45 degrees (repeating-linear-gradient 45deg).
    ctx.fillStyle = CARD_COLOR.hatch;
    const step = 7 * Math.SQRT2;
    for (let k = -h; k < w + h; k += step) {
      ctx.beginPath();
      ctx.moveTo(m + k, m + h);
      ctx.lineTo(m + k + Math.SQRT2, m + h);
      ctx.lineTo(m + k + Math.SQRT2 + h, m);
      ctx.lineTo(m + k + h, m);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    roundRect(ctx, m + 1, m + 1, w - 2, h - 2, 31);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.gold;
    ctx.stroke();
    ctx.restore();
  });
  return { front, back, w, h };
}

// ---- the band's centre ----------------------------------------------------------------------------

export const CENTRE_W = 900;
export const CENTRE_H = 220;

/** The count with its unit (130px; white while dealt, gold with its glow once judged) or the drawn rule
 *  under its label (64px gold), centred in a CENTRE_W x CENTRE_H canvas. */
export function paintCentre(p: Paintable, centre: Centre, unit: string): void {
  const cx = CENTRE_W / 2;
  const cy = CENTRE_H / 2;
  if (centre.kind === 'rule') {
    drawLines(p, [centre.label], cx, cy - 38.4, 40.5, { weight: 600, size: 30, family: MITR, color: COLOR.soft, align: 'center' });
    drawLines(p, [centre.rule], cx, cy + 20.25, 76.8, { weight: 700, size: 64, family: MITR, color: COLOR.gold, align: 'center', glow: 24 });
    return;
  }
  const num = String(centre.value);
  const numW = measurer(p.ctx, 700, MITR)(num, 130);
  const unitW = measurer(p.ctx, 600, MITR)(unit, 44);
  const x0 = cx - (numW + 28 + unitW) / 2;
  drawLines(p, [num], x0, cy, 130, { weight: 700, size: 130, family: MITR, color: centre.gold ? COLOR.gold : COLOR.ink, glow: centre.gold ? 24 : 0 });
  drawLines(p, [unit], x0 + numW + 28, cy, 44, { weight: 600, size: 44, family: MITR, color: COLOR.soft });
}
