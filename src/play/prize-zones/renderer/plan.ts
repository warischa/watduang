// The zones reveal's timeline, as data (gh#315). Pure: no DOM, no three. The scene draws whatever this says at a
// given elapsed time, so every name's zone, its place in the zone, the moment its verdict lands and the verdict
// itself are decided here, from the committed outcome alone, and tested.
//
// Design: design/Gh315Zones.dc.html, owner pick 2026-11-16: Z1 A FOUR BLOCKS (2x2 tinted panels) and Z2 B NAMES
// SIT IN THEIR ZONES (random zones, the verdict per name in a zone-by-zone wave, badges count who sat). Timings
// are the board's MOTION rows for Z2-B; positions are its frame coordinates (1920x1080 CSS px, y down).
//
// Equal odds (gh#299 decision 7): the zones are theatre. zoneAssignment takes the event key, the round and the live
// field and nothing else -- never the round code, never the survivors -- so the projector can show the zones before
// the draw (src/play/prize-draw/zones-idle.ts, the board's zn-idle), the reveal shows the same zones after it, and
// a name's zone, its slot and the moment its verdict lands are the same whichever names survive. The verdicts are
// outcome.survivors as committed; checkPlan refuses any plan whose final picture leaves a different set standing.

import type { GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import { ELIMINATION_ROUNDS } from '../../../prize-draw/schedule.ts';
import { COLOR } from '../../prize-fireworks/renderer/paint.ts';
import { randomFor } from '../../prize-fireworks/renderer/seed.ts';
import { COPY } from './copy.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** Four zones: layout A FOUR BLOCKS. */
export const ZONE_COUNT = 4;
/** Zone colours in panel order (the board's ZKEYS4), and the panel grounds: each colour at 14% pre-composited
 *  over the night midpoint #1c1b3c, as the board computes them. The accents come from the
 *  one accent copy the prize renderers share (gh#128: a file never pastes part of the accent trio). */
export const ZONES = [
  { key: 'punch', color: COLOR.punch, tint: '#3c2045' },
  { key: 'sky', color: COLOR.sky, tint: '#1e2857' },
  { key: 'lilac', color: COLOR.lilac, tint: '#343257' },
  { key: 'white', color: '#ffffff', tint: '#3c3b57' },
] as const;

/** Z2-B beats, in ms (MOTION row "zone wave 1..Z", "count", "settle"). */
export const T = {
  /** One zone: its verdicts land (400ms ease-out each), then it settles (700ms). */
  slot: 1100,
  verdict: 400,
  /** The board staggers the names 0.02s apart; a big zone squeezes it so its wave ends inside the slot. */
  stagger: 20,
  count: 800,
  settle: 3000,
  /** A seated chip lowers 6px and tilts 8 degrees as it dims. */
  lowerPx: 6,
  tiltDeg: 8,
} as const;

/** The zone field: 100..870 between the 56px margins; panels 2x2, 375px rows, a 20px gap. */
export const FIELD = { left: 56, top: 100, width: 1808, height: 770 } as const;
export const PANEL = { w: 894, h: 375, gap: 20, padX: 16, padY: 4, head: 34, headGap: 2, radius: 24, rim: 3 } as const;
/** Inside a panel: 4 columns, 8px column gap, 2px row gap, rows at least 22px, chips padded 6px each side. */
export const GRID = { cols: 4, colGap: 8, rowGap: 2, minRow: 22, chipPadX: 6 } as const;
/** NAME FIT (row "A blocks"): Sarabun 700, 20px shrinking to an 18px floor, then two lines. */
export const NAME_FIT = { size: 20, floor: 18 } as const;
/** The lower band: 170px tall, 20px off the bottom. */
export const BAND = { height: 170, bottom: 20 } as const;
export const BAND_CY = FRAME_H - BAND.bottom - BAND.height / 2;

export type Box = { x: number; y: number; w: number; h: number };
export type Cell = { cx: number; cy: number; w: number; h: number };

export function panelBox(zone: number): Box {
  return {
    x: FIELD.left + (zone % 2) * (PANEL.w + PANEL.gap),
    y: FIELD.top + Math.floor(zone / 2) * (PANEL.h + PANEL.gap),
    w: PANEL.w,
    h: PANEL.h,
  };
}

/** The zone header strip: the dot, the zone name and the badge. */
export function headBox(zone: number): Box {
  const p = panelBox(zone);
  return { x: p.x + PANEL.padX, y: p.y + PANEL.padY, w: p.w - 2 * PANEL.padX, h: PANEL.head };
}

/** The name grid's box: the panel less its padding, the header and the gap under it. */
export function gridBox(zone: number): Box {
  const h = headBox(zone);
  const top = h.y + PANEL.head + PANEL.headGap;
  return { x: h.x, y: top, w: h.w, h: panelBox(zone).y + PANEL.h - PANEL.padY - top };
}

/** A column's width at `cols` columns: the grid's width less the gaps between them, shared out. */
export const columnWidth = (cols: number): number => (PANEL.w - 2 * PANEL.padX - GRID.colGap * (cols - 1)) / cols;
export const COL_W = columnWidth(GRID.cols);
/** The text box inside a chip. */
export const NAME_BOX = COL_W - 2 * GRID.chipPadX;
/** The widest grid growth may try: the cards renderer's own cap, whose field grows from six columns to ten. */
export const MAX_COLS = 10;

/** Chip boxes for `n` names in zone `zone`, rows at their measured heights (a row holding a wrapped name grows),
 *  the block centred in the grid as the board's align-content does. Fewer names keep the same chips. `cols` and
 *  `scale` default to the board's four columns at full size; a scale below 1 shrinks both axes together about
 *  the grid's centre, so the block keeps its shape and stays inside the grid. */
export function gridLayout(zone: number, n: number, rowHeights: readonly number[], cols: number = GRID.cols, scale = 1): Cell[] {
  const g = gridBox(zone);
  const colW = columnWidth(cols);
  const rows = Math.ceil(n / cols);
  const heights = Array.from({ length: rows }, (_, r) => Math.max(GRID.minRow, rowHeights[r] ?? 0));
  const total = heights.reduce((a, b) => a + b, 0) + GRID.rowGap * Math.max(0, rows - 1);
  const tops: number[] = [];
  let y = g.y + (g.h - total * scale) / 2;
  for (const h of heights) {
    tops.push(y);
    y += (h + GRID.rowGap) * scale;
  }
  const x0 = g.x + (g.w * (1 - scale)) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return {
      cx: x0 + (c * (colW + GRID.colGap) + colW / 2) * scale,
      cy: tops[r]! + (heights[r]! / 2) * scale,
      w: colW * scale,
      h: heights[r]! * scale,
    };
  });
}

/** A zone's grid as laid out: the columns names are dealt into, the width they are fitted in, the scale both
 *  axes take, the row heights in unscaled grid units (the atlas paints in those) and the chip boxes in frame px. */
export type GridLayout = { cols: number; colW: number; nameBox: number; scale: number; rowH: number[]; cells: Cell[] };

/**
 * Where a zone's names sit, at the largest size its grid can hold them (owner ruling 2026-11-17, the cards
 * renderer's rule). The board's four columns come first: whenever their rows fit the grid, the boxes are exactly
 * the board's and nothing is scaled. When they do not fit, columns grow -- each growth narrows the name box, so
 * `linesAt` is asked again at that width and the rows are rebuilt from the line counts it returns -- and the
 * first column count whose rows fit wins. If none fits, the count with the SHORTEST block wins rather than the
 * widest tried: a narrower box wraps more lines, so the block height is not monotonic in the column count, and
 * taking the last would shrink names needlessly. That block then scales as one, both axes together, so no chip
 * leaves its grid. The scale reserves the drop a seated chip makes at EVERY size, the block that fits at full
 * size included: a chip lowers as it sits, so a block that only just fits the standing grid would otherwise sit
 * down through the panel floor. A block with the drop to spare keeps scale 1 and the board's boxes untouched.
 *
 * Pure, and shared with the projector's pre-draw idle view: `linesAt(nameBox)` returns each name's line count in
 * slot order at that text width, measured by the caller (the reveal's canvas fitter, or the idle view's DOM
 * boxes). A row is as tall as its tallest name, and a name that wraps is always at the floor, so line counts
 * alone give the row heights -- no measuring happens here.
 */
export function zoneGrid(zone: number, n: number, linesAt: (nameBox: number) => readonly number[]): GridLayout {
  const g = gridBox(zone);
  const at = (cols: number) => {
    const colW = columnWidth(cols);
    const nameBox = colW - 2 * GRID.chipPadX;
    const lines = linesAt(nameBox);
    const rows = Math.ceil(n / cols);
    const rowH = Array.from({ length: rows }, (_, r) => {
      let most = 1;
      for (let i = r * cols; i < Math.min(n, (r + 1) * cols); i++) most = Math.max(most, lines[i] ?? 1);
      return Math.max(GRID.minRow, most * NAME_FIT.floor);
    });
    const total = rowH.reduce((a, b) => a + b, 0) + GRID.rowGap * Math.max(0, rows - 1);
    return { cols, colW, nameBox, rowH, total };
  };
  let best = at(GRID.cols);
  if (best.total > g.h) {
    for (let cols = GRID.cols + 1; cols <= MAX_COLS; cols++) {
      const cand = at(cols);
      if (cand.total <= g.h) {
        best = cand;
        break;
      }
      if (cand.total < best.total) best = cand;
    }
  }
  // One rule for both branches: the block has to hold the seated pose, not just the standing one. Reserving the
  // drop leaves the grid's own padding below the last row, so the pose stays inside the panel at any scale.
  const scale = Math.min(1, (g.h - T.lowerPx) / best.total);
  return {
    cols: best.cols,
    colW: best.colW,
    nameBox: best.nameBox,
    scale,
    rowH: best.rowH,
    cells: gridLayout(zone, n, best.rowH, best.cols, scale),
  };
}

export type Beat = { at: number; event: GameEvent };
export type Chip = {
  id: string;
  /** Roster index. */
  index: number;
  zone: number;
  /** Place inside the zone's grid, reading order. */
  slot: number;
  /** Stays standing. */
  pass: boolean;
  /** When its verdict starts to land. */
  verdictAt: number;
};
export type Zone = { index: number; ids: string[]; startAt: number; outCount: number };
export type ZonesPlan = {
  kind: 'round';
  round: number;
  zones: Zone[];
  /** Roster order. */
  chips: Chip[];
  countAt: number;
  settleAt: number;
  total: number;
  beats: Beat[];
};

type AnyInput = RevealInput<'zones'>;

export const easeOutCubic = (u: number): number => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

/**
 * The zones of a round: a shuffle of the live field (roster order) seeded by the event key and the round, dealt
 * round-robin so sizes differ by at most one. Computable before the draw: it takes no code and no outcome, so who
 * survives cannot reach a name's zone or its slot.
 */
export function zoneAssignment(eventKey: string, round: number, ids: readonly string[]): string[][] {
  const rand = randomFor(`${eventKey}|${round}`, 'zones');
  const order = ids.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const zones: string[][] = Array.from({ length: ZONE_COUNT }, () => []);
  order.forEach((idx, k) => zones[k % ZONE_COUNT]!.push(ids[idx]!));
  return zones;
}

/**
 * The event key inside a reveal key. Both builders end the key in the step, `round<r>:<code>`, after the event
 * key: the projector's `<eventKey>:round<r>:<code>` (stage.ts present) and the demo's
 * `demo:<eventKey>:round<r>:<code>` (demo.ts). An event key never holds a colon (hex or a 6-digit PIN). A key of
 * any other shape, or naming another round, is refused rather than guessed at.
 *
 * The whole key is anchored, so a longer key that merely ENDS in this shape is refused too: `demo:` is the only
 * prefix admitted, and exactly one event key and one code surround the step. No segment may hold a colon or any
 * line terminator -- CR, LF, U+2028 or U+2029. JavaScript reads the last two as line terminators while a class
 * excluding only CR and LF admits them, so a separator would ride into the event key, or into the code past the
 * end anchor.
 */
export function eventKeyOf(key: string, round: number): string {
  const m = /^(?:demo:)?([^:\r\n\u2028\u2029]+):round(\d+):([^:\r\n\u2028\u2029]+)$/.exec(key);
  if (!m || Number(m[2]) !== round) throw new Error(`zones: the reveal key does not name its event and round ${round}`);
  return m[1]!;
}

/** The zones the reveal draws: the same assignment the projector showed before the draw. */
export function zonesFor(input: AnyInput): string[][] {
  return zoneAssignment(eventKeyOf(input.key, input.outcome.round), input.outcome.round, input.people.map((p) => p.id));
}

/** A chip's state at `t`: standing until its verdict starts to land. */
export function chipStateAt(chip: Chip, t: number): 'standing' | 'in' | 'out' {
  return t < chip.verdictAt ? 'standing' : chip.pass ? 'in' : 'out';
}

/** How far a chip's verdict has landed at `t`, 0 to 1, eased out. */
export function verdictProgress(chip: Chip, t: number): number {
  return easeOutCubic((t - chip.verdictAt) / T.verdict);
}

/**
 * Refuses a plan whose picture is not the committed outcome: every participant exactly one chip, every chip in
 * the zone and slot the key assigns, and the names left standing at the end exactly outcome.survivors.
 */
export function checkPlan(plan: ZonesPlan, input: AnyInput): void {
  const ids = input.people.map((p) => p.id);
  if (plan.chips.length !== ids.length || plan.chips.some((c, i) => c.id !== ids[i] || c.index !== i)) {
    throw new Error(`zones: ${plan.chips.length} chips for ${ids.length} participants, or out of roster order`);
  }
  const zones = zonesFor(input);
  for (const c of plan.chips) {
    if (zones[c.zone]?.[c.slot] !== c.id) throw new Error(`zones: ${c.id} is not in the zone and slot the key assigns`);
    if (!Number.isFinite(c.verdictAt) || c.verdictAt < 0 || c.verdictAt + T.verdict > plan.countAt) {
      throw new Error(`zones: ${c.id} never lands inside the wave`);
    }
  }
  const standing = plan.chips.filter((c) => chipStateAt(c, plan.total) === 'in').map((c) => c.id);
  const kept = new Set(input.outcome.survivors);
  if (standing.length !== kept.size || standing.some((id) => !kept.has(id))) {
    throw new Error('zones: the picture leaves standing a set other than the committed survivors');
  }
}

/** The whole reveal for a committed round. Throws on an outcome it could only draw by inventing. */
export function planFor(input: AnyInput): ZonesPlan {
  const outcome = input.outcome;
  if (outcome.game !== 'zones') throw new Error(`zones: the outcome is for ${String(outcome.game)}`);
  if (outcome.kind !== 'round') throw new Error(`zones: cannot draw a ${String(outcome.kind)}, only an elimination round`);
  if (!Number.isInteger(outcome.round) || outcome.round < 1 || outcome.round > ELIMINATION_ROUNDS) {
    throw new Error(`zones: round ${String(outcome.round)} is not an elimination round`);
  }
  const ids = input.people.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('zones: a participant is listed twice');
  const known = new Set(ids);
  const kept = new Set<string>();
  for (const id of outcome.survivors) {
    if (!known.has(id)) throw new Error(`zones: survivor ${id} is not a participant of this round`);
    if (kept.has(id)) throw new Error(`zones: survivor ${id} is listed twice`);
    kept.add(id);
  }

  const place = new Map<string, { zone: number; slot: number; verdictAt: number }>();
  const zones: Zone[] = zonesFor(input).map((zoneIds, index) => {
    const startAt = index * T.slot;
    const n = zoneIds.length;
    const stagger = n > 1 ? Math.min(T.stagger, (T.slot - T.verdict) / (n - 1)) : 0;
    zoneIds.forEach((id, slot) => place.set(id, { zone: index, slot, verdictAt: startAt + slot * stagger }));
    return { index, ids: zoneIds, startAt, outCount: zoneIds.filter((id) => !kept.has(id)).length };
  });
  const chips: Chip[] = ids.map((id, index) => ({ id, index, pass: kept.has(id), ...place.get(id)! }));

  const countAt = ZONE_COUNT * T.slot;
  const settleAt = countAt + T.count;
  const total = settleAt + T.settle;
  const beats: Beat[] = zones.map((z) => ({ at: z.startAt, event: { type: 'beat', beat: 'cut', index: z.index } }));
  beats.push({ at: total, event: { type: 'complete' } });
  const plan: ZonesPlan = { kind: 'round', round: outcome.round, zones, chips, countAt, settleAt, total, beats };
  checkPlan(plan, input);
  return plan;
}

/** The survivors the finished picture leaves standing, in roster order: read off the chips the painter draws. */
export function projectOutcome(input: AnyInput): string[] {
  const plan = planFor(input);
  return plan.chips.filter((c) => chipStateAt(c, plan.total) === 'in').map((c) => c.id);
}

/** Events whose time falls in (from, to]: consecutive ticks report each beat exactly once. */
export function beatsIn(plan: ZonesPlan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

/** Names still standing at `t`: a name counts as seated from the moment its verdict starts to land. */
export function standingAt(plan: ZonesPlan, t: number): number {
  return plan.chips.filter((c) => chipStateAt(c, t) !== 'out').length;
}

/** A zone's badge at `t`: stand up until its wave starts, then the count of who sat so far. */
export function badgeAt(plan: ZonesPlan, zone: number, t: number): string {
  const z = plan.zones[zone]!;
  if (t < z.startAt) return COPY.standUp;
  return COPY.seated(plan.chips.filter((c) => c.zone === zone && chipStateAt(c, t) === 'out').length);
}

export type Band = {
  left: string;
  figure: { kind: 'count'; value: number };
  right: { kind: 'text'; text: string } | { kind: 'legend' };
};

/** The lower band at `t`: the zone counter while the wave lands, then the round's result. */
export function bandAt(plan: ZonesPlan, t: number): Band {
  const figure = { kind: 'count' as const, value: standingAt(plan, t) };
  if (t < plan.countAt) {
    const zone = Math.min(ZONE_COUNT, Math.floor(Math.max(0, t) / T.slot) + 1);
    return { left: COPY.zoneCounter(zone, ZONE_COUNT), figure, right: { kind: 'text', text: COPY.outSit } };
  }
  return { left: COPY.passedRound(plan.round), figure, right: { kind: 'legend' } };
}

/** The round label of the projector's top bar. */
export function topLabel(plan: ZonesPlan): string {
  return COPY.roundLabel(plan.round, ELIMINATION_ROUNDS);
}

/** The round dots: one per elimination round, then the final's pill. */
export function topDots(plan: ZonesPlan): ('done' | 'on' | 'todo')[] {
  return Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i + 1 < plan.round ? 'done' : i + 1 === plan.round ? 'on' : 'todo'));
}
