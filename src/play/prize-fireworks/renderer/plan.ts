// The fireworks reveal's timeline, as data (gh#305). Pure: no DOM, no three. The scene draws whatever
// this says at a given elapsed time, so every beat, every lantern's fate and every plate's label is
// decided here, from the committed outcome alone, and tested.
//
// Timings are the picked board's MOTION rows (design/Gh303Fireworks.dc.html, "A FIVE BURSTS" and
// "FINAL A SIDE BY SIDE", picked 2026-11-11). Positions are the board's frame coordinates: 1920x1080 CSS px,
// y down.

import type { GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import { ELIMINATION_ROUNDS } from '../../../prize-draw/schedule.ts';
import { COPY } from './copy.ts';
import { randomFor } from './seed.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** Elimination beats, in ms. */
export const T = {
  /** 10 x 1000ms: the room shouts each number. */
  countdown: 10000,
  /** Numeral scale 1.15 to 1.0, ease-out, at each new number. */
  numeralPop: 300,
  /** Rocket 1 rises (ease-in). Each later rocket rises for the same time before its own burst. */
  launch: 600,
  /** One burst: 400ms burst then a 700ms wave. */
  slot: 1100,
  burstExpand: 400,
  wave: 700,
  /** The board staggers lanterns 0.02s apart, nearest first. */
  stagger: 20,
  /** One lantern going dark. The board gives no length; this is the shared reduced fade token's 200ms. */
  dim: 200,
  /** The counter settles on the survivors. */
  count: 800,
  /** Smoke clears; passed lanterns rise 6px and keep glowing. */
  settle: 3000,
} as const;

/** Final beats, in ms. */
export const FT = {
  /** All five rise together, ease-out. */
  launch: 1200,
  /** Bursts 5, 4, 3, 2: one slot each. */
  slot: 2400,
  /** The first-prize rocket climbs on alone, then bursts biggest. */
  lastClimb: 1200,
  last: 1800,
  /** The result frame fades up under the burst. */
  result: 600,
} as const;

export const BURST_COUNT = 5;
/** Where the five elimination bursts open, in burst order (the board's fw-reveal and fw-result frames). */
export const BURSTS: readonly (readonly [number, number])[] = [
  [330, 300],
  [1560, 250],
  [960, 470],
  [520, 690],
  [1420, 700],
];

/** The lantern field: 8 columns of 27px rows, 2px row gap, 10px column gap, inside 56..1864 x 100..860. */
export const FIELD = { left: 56, right: 1864, top: 100, height: 760, cols: 8, rowGap: 2, colGap: 10, minRow: 27 } as const;

/** Final lanes: five fixed columns; rockets stand on the pad at y 760, plates hang at 860. */
export const LANES_X: readonly number[] = [300, 630, 960, 1290, 1620];
export const PAD_Y = 760;
export const PLATE_PAD_TOP = 860;
/** Where the rockets are when the launch beat ends; they climb on from here to their bursts. */
export const LAUNCH_TOP_Y = 600;
/** Burst heights: the board's reveal frame bursts between 300 and 380; the last one, highest, at 280. */
export const BURST_Y_RANGE = [300, 400] as const;
export const LAST_BURST_Y = 280;
/** A burst plate hangs this far under its burst (the board's fwf-reveal frame). */
export const PLATE_UNDER_BURST = 170;

export type Beat = { at: number; event: GameEvent };

export type Lantern = { id: string; index: number; out: boolean; group: number; dimAt: number | null };
export type RoundPlan = {
  kind: 'round';
  round: number;
  lanterns: Lantern[];
  burstAt: number[];
  countAt: number;
  settleAt: number;
  total: number;
  beats: Beat[];
};

export type FinalLane = {
  id: string;
  lane: number;
  rank: number;
  /** What the plate says once its rocket bursts. */
  plateLabel: string;
  burstAt: number;
  burstY: number;
};
export type Winner = { place: number; line: string; id: string };
export type FinalPlan = {
  kind: 'final';
  lanes: FinalLane[];
  /** Lane indices in burst order: fifth prize first, first prize last. */
  burstOrder: number[];
  winners: Winner[];
  resultAt: number;
  total: number;
  beats: Beat[];
};
export type Plan = RoundPlan | FinalPlan;

type AnyInput = RevealInput<'fireworks'>;

export const easeOutCubic = (u: number): number => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;
export const easeInCubic = (u: number): number => Math.min(1, Math.max(0, u)) ** 3;

/** Lantern centres with every row at its minimum height: what groups a lantern under a burst. Rows that
 *  grow for a wrapped name move a lantern a few px, which never changes what it is near. */
export function nominalCells(n: number): { cx: number; cy: number }[] {
  const rows = Math.ceil(n / FIELD.cols);
  const colW = (FIELD.right - FIELD.left - FIELD.colGap * (FIELD.cols - 1)) / FIELD.cols;
  const h = rows * FIELD.minRow + (rows - 1) * FIELD.rowGap;
  const top = FIELD.top + (FIELD.height - h) / 2;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / FIELD.cols);
    const c = i % FIELD.cols;
    return { cx: FIELD.left + c * (colW + FIELD.colGap) + colW / 2, cy: top + r * (FIELD.minRow + FIELD.rowGap) + FIELD.minRow / 2 };
  });
}

/** The lantern's own width: one grid column. */
export const LANTERN_W = (FIELD.right - FIELD.left - FIELD.colGap * (FIELD.cols - 1)) / FIELD.cols;

/** Lantern boxes (centre x, centre y, width, height) once the rows are measured: a row holding a wrapped
 *  name grows to it, and the field stays centred in its band. */
export function fieldLayout(n: number, rowHeights: readonly number[]): [number, number, number, number][] {
  const heights = rowHeights.map((h) => Math.max(FIELD.minRow, h));
  const total = heights.reduce((a, b) => a + b, 0) + FIELD.rowGap * Math.max(0, heights.length - 1);
  const tops: number[] = [];
  let y = FIELD.top + (FIELD.height - total) / 2;
  for (const h of heights) {
    tops.push(y);
    y += h + FIELD.rowGap;
  }
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / FIELD.cols);
    const c = i % FIELD.cols;
    return [FIELD.left + c * (LANTERN_W + FIELD.colGap) + LANTERN_W / 2, tops[r]! + heights[r]! / 2, LANTERN_W, heights[r]!];
  });
}

function roundPlan(input: AnyInput): RoundPlan {
  const outcome = input.outcome;
  if (outcome.kind !== 'round') throw new Error('fireworks: not a round');
  const ids = input.people.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('fireworks: a participant is listed twice');
  const known = new Set(ids);
  const kept = new Set<string>();
  for (const id of outcome.survivors) {
    if (!known.has(id)) throw new Error(`fireworks: survivor ${id} is not a participant of this round`);
    if (kept.has(id)) throw new Error(`fireworks: survivor ${id} is listed twice`);
    kept.add(id);
  }

  const burstAt = BURSTS.map((_, k) => T.countdown + T.launch + k * T.slot);
  const cells = nominalCells(ids.length);
  const lanterns: Lantern[] = ids.map((id, index) => ({ id, index, out: !kept.has(id), group: -1, dimAt: null }));
  const out = lanterns.filter((l) => l.out);

  // Each eliminated lantern goes dark under the nearest burst that still has room, so the five waves are
  // even and come from five points. Capacity-bounded nearest assignment, deterministic on ties.
  const cap = Math.ceil(out.length / BURST_COUNT);
  const pairs: { l: Lantern; g: number; d: number }[] = [];
  for (const l of out) {
    BURSTS.forEach(([bx, by], g) => pairs.push({ l, g, d: Math.hypot(cells[l.index]!.cx - bx, cells[l.index]!.cy - by) }));
  }
  pairs.sort((a, b) => a.d - b.d || a.l.index - b.l.index || a.g - b.g);
  const load = new Array<number>(BURST_COUNT).fill(0);
  for (const { l, g } of pairs) {
    if (l.group >= 0 || load[g]! >= cap) continue;
    l.group = g;
    load[g]! += 1;
  }
  for (let g = 0; g < BURST_COUNT; g++) {
    const [bx, by] = BURSTS[g]!;
    const dist = (l: Lantern): number => Math.hypot(cells[l.index]!.cx - bx, cells[l.index]!.cy - by);
    const group = out.filter((l) => l.group === g).sort((a, b) => dist(a) - dist(b) || a.index - b.index);
    // The wave must end inside its slot: a big group squeezes the stagger rather than overrun.
    const stagger = group.length > 1 ? Math.min(T.stagger, (T.wave - T.dim) / (group.length - 1)) : 0;
    group.forEach((l, j) => {
      l.dimAt = burstAt[g]! + T.burstExpand + j * stagger;
    });
  }

  const countAt = burstAt[BURST_COUNT - 1]! + T.slot;
  const settleAt = countAt + T.count;
  const total = settleAt + T.settle;
  const beats: Beat[] = burstAt.map((at, index) => ({ at, event: { type: 'beat', beat: 'cut', index } }));
  beats.push({ at: total, event: { type: 'complete' } });
  return { kind: 'round', round: outcome.round, lanterns, burstAt, countAt, settleAt, total, beats };
}

function finalPlan(input: AnyInput): FinalPlan {
  const outcome = input.outcome;
  if (outcome.kind !== 'final') throw new Error('fireworks: not a final');
  const ids = input.people.map((p) => p.id);
  const lanes = LANES_X.length;
  if (ids.length !== lanes || new Set(ids).size !== lanes) throw new Error(`fireworks: the final needs ${lanes} distinct finalists`);
  const order = outcome.order;
  if (order.length !== lanes || new Set(order).size !== lanes || !order.every((id) => ids.includes(id))) {
    throw new Error('fireworks: the committed order is not an order of these finalists');
  }
  const prizes = outcome.prizes;
  if (prizes.length < 1 || prizes.length > lanes) throw new Error('fireworks: the final needs 1 to 5 prizes');

  // Prize order reversed: fifth prize bursts first, first prize last.
  const rand = randomFor(input.key, 'final-burst-y');
  const slotYs = Array.from({ length: lanes - 1 }, () => BURST_Y_RANGE[0] + rand() * (BURST_Y_RANGE[1] - BURST_Y_RANGE[0]));
  const lastAt = FT.launch + (lanes - 1) * FT.slot + FT.lastClimb;
  const out: FinalLane[] = ids.map((id, lane) => {
    const rank = order.indexOf(id);
    const slot = lanes - 1 - rank;
    const last = rank === 0;
    return {
      id,
      lane,
      rank,
      plateLabel: rank < prizes.length ? COPY.prizeLabel(rank + 1) : COPY.noPrize,
      burstAt: last ? lastAt : FT.launch + slot * FT.slot,
      burstY: last ? LAST_BURST_Y : slotYs[slot]!,
    };
  });
  const burstOrder = [...out].sort((a, b) => a.burstAt - b.burstAt).map((l) => l.lane);
  const resultAt = FT.launch + (lanes - 1) * FT.slot + FT.last;
  const total = resultAt + FT.result;
  const beats: Beat[] = burstOrder.map((lane) => ({ at: out[lane]!.burstAt, event: { type: 'beat', beat: 'prize', index: out[lane]!.rank } }));
  beats.push({ at: total, event: { type: 'complete' } });
  const winners = prizes.map((prize, i) => ({ place: i + 1, line: COPY.prizeLine(i + 1, prize), id: order[i]! }));
  return { kind: 'final', lanes: out, burstOrder, winners, resultAt, total, beats };
}

/** The whole reveal for a committed outcome. Throws on an outcome it could only draw by inventing. */
export function planFor(input: AnyInput): Plan {
  if (input.outcome.game !== 'fireworks') throw new Error('fireworks: the outcome is for another game');
  return input.outcome.kind === 'round' ? roundPlan(input) : finalPlan(input);
}

/** Events whose time falls in (from, to]: consecutive ticks report each beat exactly once. */
export function beatsIn(plan: Plan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

/** Lanterns still lit at `t`: a lantern counts as dark from the moment it starts to go dark. */
export function litCountAt(plan: RoundPlan, t: number): number {
  return plan.lanterns.filter((l) => l.dimAt === null || l.dimAt > t).length;
}

export type Figure = { kind: 'numeral'; value: number; scale: number } | { kind: 'count'; value: number };
export type LowBand = { left: string; figure: Figure; right: { kind: 'text'; text: string } | { kind: 'legend' } };

/** The elimination frame's lower band at `t`: countdown, then the bursts, then the round's result. */
export function lowBand(plan: RoundPlan, t: number): LowBand {
  if (t < plan.burstAt[0]!) {
    const step = Math.min(Math.floor(Math.max(0, t) / 1000), T.countdown / 1000);
    const since = Math.max(0, t) - step * 1000;
    const scale = 1 + 0.15 * (1 - easeOutCubic(since / T.numeralPop));
    return {
      left: COPY.countdownLabel,
      figure: { kind: 'numeral', value: T.countdown / 1000 - step, scale },
      right: { kind: 'text', text: COPY.countdownAtZero },
    };
  }
  if (t < plan.countAt) {
    const burst = plan.burstAt.filter((at) => at <= t).length;
    return {
      left: COPY.burstCounter(burst, BURST_COUNT),
      figure: { kind: 'count', value: litCountAt(plan, t) },
      right: { kind: 'text', text: COPY.legendLine },
    };
  }
  return { left: COPY.passedRound(plan.round), figure: { kind: 'count', value: litCountAt(plan, t) }, right: { kind: 'legend' } };
}

/** The round label of the projector's top bar. */
export function topLabel(plan: Plan): string {
  return plan.kind === 'round' ? COPY.roundLabel(plan.round, ELIMINATION_ROUNDS) : COPY.finalLabel;
}

/** The round dots: one per elimination round, then the final's pill. */
export function topDots(plan: Plan): ('done' | 'on' | 'todo')[] {
  const current = plan.kind === 'round' ? plan.round : ELIMINATION_ROUNDS + 1;
  return Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i + 1 < current ? 'done' : i + 1 === current ? 'on' : 'todo'));
}

/** Rockets of the final still in the air at `t`. */
export function stillUp(plan: FinalPlan, t: number): number {
  return plan.lanes.filter((l) => l.burstAt > t).length;
}

/** A final rocket's height (frame y of its body centre) at `t`, or null once it has burst. */
export function rocketY(lane: FinalLane, t: number): number | null {
  if (t >= lane.burstAt) return null;
  if (t <= FT.launch) return PAD_Y - (PAD_Y - LAUNCH_TOP_Y) * easeOutCubic(t / FT.launch);
  const u = (t - FT.launch) / (lane.burstAt - FT.launch);
  return LAUNCH_TOP_Y - (LAUNCH_TOP_Y - lane.burstY) * u;
}
