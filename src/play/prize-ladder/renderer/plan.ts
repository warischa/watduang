// The ladder reveal's timeline and geometry, as data (gh#307). Pure: no DOM, no three. The scene draws
// whatever this says at a given elapsed time, so every rung, every path, every slot's label and every
// slot's finalist is decided here, from the committed record alone, and tested.
//
// Design: the picked option of design/Gh303Ladder.dc.html, B DEPTH, ONE AT A TIME (owner pick 2026-11-11):
// frames ld-idle, ld-reveal, ld-result (B) and ld-few. Positions are the board's frame coordinates: 1920x1080
// CSS px, y down. Timings are its MOTION rows for B.

import { ladderConsistent, type Lane } from '../../../prize-event/game-contract.ts';
import type { GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import { COPY } from './copy.ts';
import { LANES, ROWS, buildLadder, follow, type Rung } from './ladder.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** Beats, in ms (MOTION B). */
export const T = {
  /** The picks stand before the first light sets off. The board holds this until the MC presses start;
   *  the contract gives the module no start, and the MC's draw already was one, so it is a short hold. */
  idle: 1500,
  /** One light runs its whole path at a constant rate. */
  travel: 4800,
  /** It lands; the next light waits for the landing to finish. */
  land: 1200,
  /** A rung lights as a light reaches it. */
  rungLit: 200,
  /** The slot's finalist name fades in on landing (the shared reduced fade token). */
  nameIn: 200,
  /** The camera glides to face the slots, ease-in-out. */
  glide: 1500,
  /** The gh#302 result frame fades up, the track falls to 25%. */
  result: 600,
} as const;

/** How far the camera follows a light: the share of the light's run down the track, and of its sideways
 *  position. The board says the camera follows behind the light; a full follow would carry the start plates
 *  out of view on every run, so the follow is partial, and then scaled by FOLLOW_FIT (below) to the room
 *  the board's frame leaves. */
export const FOLLOW = { along: 0.5, across: 0.3, window: 600 } as const;

// ---- the rig: the picked frame's camera, solved from the board ----------------------------------------

/** The board's ld-idle B track: lane ends at the near edge (y 930, 360px apart, centred) and the far edge
 *  (y 290, 198px apart), seen from 35 degrees above the plane. */
const BOARD = { nearY: 930, farY: 290, nearGap: 360, farGap: 198, pitchDeg: 35 } as const;

type Vec3 = [number, number, number];

function solveRig() {
  const pitch = (BOARD.pitchDeg * Math.PI) / 180;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  // World units: one lane apart. In camera space a ground point at forward distance f from under the
  // camera, height h below it, sits at depth d = h s + f c and height u = f s - h c; on screen its lane gap
  // is focal / d and its height above centre focal u / d. Both edges give u and d up to the focal length.
  const u0 = (FRAME_H / 2 - BOARD.nearY) / BOARD.nearGap;
  const u1 = (FRAME_H / 2 - BOARD.farY) / BOARD.farGap;
  const focal = ((u1 - u0) * (c / s)) / (1 / BOARD.farGap - 1 / BOARD.nearGap);
  const nearDepth = focal / BOARD.nearGap;
  const farDepth = focal / BOARD.farGap;
  const height = nearDepth * s - u0 * c;
  const nearF = nearDepth * c + u0 * s;
  const farF = farDepth * c + u1 * s;
  return { pitch, c, s, focal, nearDepth, farDepth, height, nearF, farF };
}

const R = solveRig();

export const RIG = {
  ...R,
  /** A point on lane `lane` (fractional between lanes) at `u` along the track: 0 at the start, 1 at the end. */
  laneWorld(lane: number, u: number): Vec3 {
    return [lane - (LANES - 1) / 2, 0, -(R.nearF + u * (R.farF - R.nearF))];
  },
  /** World length of one frame px at depth `d` from the base camera. */
  px(d: number): number {
    return d / R.focal;
  },
  basePosition: [0, R.height, 0] as Vec3,
  baseTarget: [0, R.height - Math.sin(R.pitch), -Math.cos(R.pitch)] as Vec3,
};

/** World point to frame px (and depth) through the base camera. */
export function project(p: Vec3): { x: number; y: number; depth: number } {
  const dy = p[1] - R.height;
  const cy = dy * R.c - p[2] * R.s;
  const depth = -(dy * R.s + p[2] * R.c);
  return { x: FRAME_W / 2 + (R.focal * p[0]) / depth, y: FRAME_H / 2 - (R.focal * cy) / depth, depth };
}

/** Frame px at `depth` to the world point the base camera sees there. */
export function unproject(x: number, y: number, depth: number): Vec3 {
  const cx = ((x - FRAME_W / 2) * depth) / R.focal;
  const cy = ((FRAME_H / 2 - y) * depth) / R.focal;
  const cz = -depth;
  return [cx, R.height + cy * R.c + cz * R.s, -cy * R.s + cz * R.c];
}

// ---- the board's layout ---------------------------------------------------------------------------------

/** Lane plates: 320px pills centred on the near lane ends, top at 950. */
export const PLATE = { w: 320, minH: 64, top: 950, padL: 12, padR: 14, dot: 18, gap: 10, x: (lane: number) => 240 + 360 * lane } as const;
/** Far prize slots: 300px wide in a row above the far lane ends, top at 112; leaders end at 226. */
export const SLOT = { w: 300, top: 112, leaderY: 226, x: (exit: number) => 280 + 340 * exit } as const;
/** The hud's label block (left 56, top 330), and the panel it is painted on. */
export const HUD = { left: 56, top: 330, w: 900, h: 180 } as const;
/** The top bar's height: the event name and the round dots. */
export const TOP_H = 96;
/** The tallest slot card paintSlot draws: its 14px padding top and bottom, the label line (30 x 1.25), two
 *  lines of prize name (30 x 1.3 each) and the landed name, 6 + two lines at its 20px floor (x 1.2). A prize
 *  name past two lines makes a taller card than the camera fit allows for. */
export const SLOT_MAX_H = 14 * 2 + 30 * 1.25 + 2 * 30 * 1.3 + 6 + 2 * 20 * 1.2;

/** Line widths, frame px at the near edge: lanes, lit rungs, paths and their glow, leaders; head radius. */
export const WIDTH = { lane: 5, rung: 5.8, path: 7, glow: 18, leader: 5, head: 13, dash: 14, gap: 10 } as const;

/** Path styles in roster order (VALUES: gold, white, pink, blue, white dashed), each with its glow at 35%
 *  and its 25% result shade, pre-composited on the ground as the board lists them. */
export const STYLES = [
  { color: '#ffcc00', glow: '#6b5927', dim: '#55472d', dashed: false },
  { color: '#ffffff', glow: '#6b6b80', dim: '#55546d', dashed: false },
  { color: '#ff3d7f', glow: '#6b2753', dim: '#55244d', dashed: false },
  { color: '#2b7bff', glow: '#213d80', dim: '#20336d', dashed: false },
  { color: '#ffffff', glow: '#6b6b80', dim: '#55546d', dashed: true },
] as const;
/** Lanes and leaders at 50% alpha of the rung ink (PD-307-04), then the result shade; lit rungs full, then 25%. */
export const TRACK = { lane: '#7a7897', laneDim: '#2d2b4c', rung: '#d9d6f0', rungDim: '#4b4a69' } as const;

// ---- the plan ---------------------------------------------------------------------------------------------

export type Point = { lane: number; u: number };
export type Slot = {
  exit: number;
  rank: number;
  /** A rank below the prize count. */
  prize: boolean;
  /** The slot's label: the place, or the no-prize label. */
  label: string;
  /** Under the label: the MC's prize name, or the thank-you line. */
  line: string;
  /** The finalist whose path ends here: read off the built ladder. */
  id: string;
  /** When that finalist's light lands. */
  landAt: number;
};
export type Travel = {
  id: string;
  start: number;
  exit: number;
  /** Index into STYLES: roster order. */
  style: number;
  points: Point[];
  startAt: number;
  arriveAt: number;
};
export type LitRung = Rung & { litAt: number };
export type ResultLine = { line: string; id: string; none: boolean };
export type Plan = {
  rungs: LitRung[];
  slots: Slot[];
  travels: Travel[];
  /** The finalist on each start lane's plate. */
  plates: { lane: number; id: string; style: number }[];
  result: { spot: ResultLine; cards: ResultLine[] };
  glideAt: number;
  resultAt: number;
  total: number;
  beats: { at: number; event: GameEvent }[];
};

export const rowU = (row: number): number => (row + 1) / (ROWS + 1);

/** A path in track coordinates: down its start lane, across each rung it meets, on to its exit. */
function pathPoints(rungs: readonly Rung[], start: number): Point[] {
  const pts: Point[] = [{ lane: start, u: 0 }];
  for (const c of follow(rungs, start).crossings) {
    pts.push({ lane: c.from, u: rowU(c.row) }, { lane: c.to, u: rowU(c.row) });
  }
  pts.push({ lane: pts[pts.length - 1]!.lane, u: 1 });
  return pts;
}

export function worldOf(p: Point): Vec3 {
  return RIG.laneWorld(p.lane, p.u);
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Cumulative world arc length at each point of a path. */
export function arcLengths(points: readonly Point[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1]! + dist(worldOf(points[i - 1]!), worldOf(points[i]!)));
  return out;
}

/** How far along its path (world length) a light is at `t`. */
export function lightDistance(tr: Travel, arcs: readonly number[], t: number): number {
  const total = arcs[arcs.length - 1]!;
  if (t <= tr.startAt) return 0;
  if (t >= tr.arriveAt) return total;
  return (total * (t - tr.startAt)) / (tr.arriveAt - tr.startAt);
}

/** The world point at arc length `s` along a path. */
export function pointAt(points: readonly Point[], arcs: readonly number[], s: number): Vec3 {
  for (let i = 1; i < points.length; i++) {
    if (s <= arcs[i]! || i === points.length - 1) {
      const a = worldOf(points[i - 1]!);
      const b = worldOf(points[i]!);
      const len = arcs[i]! - arcs[i - 1]!;
      const k = len > 0 ? Math.min(1, Math.max(0, (s - arcs[i - 1]!) / len)) : 1;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
  }
  return worldOf(points[0]!);
}

type AnyInput = RevealInput<'ladder'>;

/** The whole reveal for a committed ladder final. Throws on a record it could only draw by inventing. */
export function planFor(input: AnyInput): Plan {
  const outcome = input.outcome;
  if (outcome.game !== 'ladder') throw new Error('ladder: the outcome is for another game');
  if (outcome.kind !== 'final') throw new Error('ladder: not a final');
  const roster = input.people.map((p) => p.id);
  const picks = outcome.picks;
  if (picks.length !== LANES || new Set(picks).size !== LANES || !picks.every((id) => roster.includes(id))) {
    throw new Error(`ladder: the picks are not ${LANES} distinct finalists of this step`);
  }
  const prizes = outcome.prizes;
  if (prizes.length < 1 || prizes.length > LANES) throw new Error(`ladder: the final needs 1 to ${LANES} prizes`);
  if (!ladderConsistent(outcome)) throw new Error('ladder: the committed order does not follow from the picks, permutation and slots');

  const built = buildLadder(outcome.permutation, input.key);
  // Lights run in roster order, which is also the order of the path styles.
  const starts = [0, 1, 2, 3, 4].sort((a, b) => roster.indexOf(picks[a]!) - roster.indexOf(picks[b]!));
  const step = T.travel + T.land;
  const travels: Travel[] = starts.map((start, k) => {
    const startAt = T.idle + k * step;
    return {
      id: picks[start]!,
      start,
      exit: follow(built, start).exit,
      style: k,
      points: pathPoints(built, start),
      startAt,
      arriveAt: startAt + T.travel,
    };
  });

  const slots: Slot[] = new Array(LANES);
  for (const tr of travels) {
    const rank = outcome.slotRanks[tr.exit as Lane]!;
    const prize = rank < prizes.length;
    slots[tr.exit] = {
      exit: tr.exit,
      rank,
      prize,
      label: prize ? COPY.prizeLabel(rank + 1) : COPY.noPrize,
      line: prize ? prizes[rank]! : COPY.noPrizeLine,
      id: tr.id,
      landAt: tr.arriveAt,
    };
  }
  // What the slots show must be the committed order: the ladder realizes the record or nothing is drawn.
  const byRank = [...slots].sort((a, b) => a.rank - b.rank);
  if (byRank.some((s, rank) => outcome.order[rank] !== s.id)) throw new Error('ladder: the built ladder does not reach the committed order');

  // A rung lights when the first light reaches it.
  const rungs: LitRung[] = built.map((r) => ({ ...r, litAt: Infinity }));
  for (const tr of travels) {
    const arcs = arcLengths(tr.points);
    const total = arcs[arcs.length - 1]!;
    tr.points.forEach((p, i) => {
      const next = tr.points[i + 1];
      if (!next || next.u !== p.u) return;
      const rung = rungs.find((r) => rowU(r.row) === p.u && r.left === Math.min(p.lane, next.lane))!;
      rung.litAt = Math.min(rung.litAt, tr.startAt + (T.travel * arcs[i]!) / total);
    });
  }

  const glideAt = T.idle + LANES * step;
  const resultAt = glideAt + T.glide;
  const total = resultAt + T.result;
  const beats: Plan['beats'] = [];
  travels.forEach((tr, k) => {
    beats.push({ at: tr.startAt, event: { type: 'beat', beat: 'cut', index: k } });
    beats.push({ at: tr.arriveAt, event: { type: 'beat', beat: 'prize', index: slots[tr.exit]!.rank } });
  });
  beats.push({ at: total, event: { type: 'complete' } });

  const line = (rank: number): ResultLine => ({
    id: byRank[rank]!.id,
    none: rank >= prizes.length,
    line: rank < prizes.length ? COPY.prizeLine(rank + 1, prizes[rank]!) : COPY.noPrize,
  });
  return {
    rungs,
    slots,
    travels,
    plates: picks.map((id, lane) => ({ lane, id, style: starts.indexOf(lane) })),
    result: { spot: line(0), cards: [1, 2, 3, 4].map(line) },
    glideAt,
    resultAt,
    total,
    beats,
  };
}

/** The finalist name a slot shows once its light has landed. */
export function slotName(slot: Slot, names: ReadonlyMap<string, string>): string {
  return names.get(slot.id) ?? '';
}

export function beatsIn(plan: Plan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

// ---- the camera -------------------------------------------------------------------------------------------

export const easeInOut = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOut = (u: number): number => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

// ---- what the camera must keep in frame ---------------------------------------------------------------------

type Box = { l: number; t: number; r: number; b: number };
const meets = (a: Box, b: Box): boolean => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t);
const HUD_RECT: Box = { l: HUD.left, t: HUD.top, r: HUD.left + HUD.w, b: HUD.top + HUD.h };
const TOP_RECT: Box = { l: 0, t: 0, r: FRAME_W, b: TOP_H };
const PLATE_ANCHORS = Array.from({ length: LANES }, (_, lane) => unproject(PLATE.x(lane), PLATE.top, R.nearDepth));
const SLOT_ANCHORS = Array.from({ length: LANES }, (_, exit) => unproject(SLOT.x(exit), SLOT.top, R.farDepth));

/** A panel's frame box with the base camera moved by `off` (no turn): its anchor is its top centre, and it
 *  faces the camera, so it scales with its anchor's depth. */
function panelBox(anchor: Vec3, anchorDepth: number, w: number, h: number, off: Vec3): Box {
  const q = project([anchor[0] - off[0], anchor[1] - off[1], anchor[2] - off[2]]);
  const k = anchorDepth / q.depth;
  return { l: q.x - (w / 2) * k, r: q.x + (w / 2) * k, t: q.y, b: q.y + h * k };
}

/** With the camera moved by `off`: every plate and the tallest slot card wholly inside the frame (the
 *  camera fit always shows the whole frame), and none of them on the hud or the top bar. */
function clearAt(off: Vec3): boolean {
  const boxes = [
    ...PLATE_ANCHORS.map((a) => panelBox(a, R.nearDepth, PLATE.w, PLATE.minH, off)),
    ...SLOT_ANCHORS.map((a) => panelBox(a, R.farDepth, SLOT.w, SLOT_MAX_H, off)),
  ];
  return boxes.every((b) => b.l >= 0 && b.t >= 0 && b.r <= FRAME_W && b.b <= FRAME_H && !meets(b, HUD_RECT) && !meets(b, TOP_RECT));
}

/**
 * The share of FOLLOW the frame has room for. A follow offset is at most FOLLOW.across times the lanes'
 * half-span sideways and FOLLOW.along times the track's length forward; every box edge is linear in the
 * offset, so the four corners of that range bound every offset a run can take. Solved by bisection on the
 * corners. The board's ld-reveal frame keeps plates, slots and hud where ld-idle has them, which is the
 * zero offset, so the bisection always has a clear start.
 */
function solveFollowFit(): number {
  const span = (LANES - 1) / 2;
  const fits = (k: number): boolean =>
    [-1, 1].every((side) => [0, 1].every((a) => clearAt([side * FOLLOW.across * span * k, 0, -a * FOLLOW.along * (R.farF - R.nearF) * k])));
  if (!fits(0)) throw new Error('ladder: the board frame does not clear its own hud');
  if (fits(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export const FOLLOW_FIT = solveFollowFit();

/** Plates and hud: the glide toward the slots carries the plates off the bottom and the slot row across the
 *  hud, so both fade out over the shared 200ms fade, ending as the glide sets off. */
export function chromeOpacity(plan: Plan, t: number): number {
  return Math.min(1, Math.max(0, (plan.glideAt - t) / T.nameIn));
}

/** Where the slot row is, and the pose that faces it square on from the far depth. */
const SLOT_ROW = unproject(FRAME_W / 2, SLOT.top + 55, R.farDepth);
const SLOTS_POSITION: Vec3 = [SLOT_ROW[0], SLOT_ROW[1], SLOT_ROW[2] + R.farDepth];

const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** The camera's follow offset while a light runs: part of its way down the track, part of its average
 *  sideways position over the last moments (so a rung crossing sways the view, never jerks it). */
function followOffset(tr: Travel, arcs: readonly number[], t: number): Vec3 {
  const at = pointAt(tr.points, arcs, lightDistance(tr, arcs, t));
  const along = -at[2] - R.nearF;
  let x = 0;
  const samples = 7;
  for (let i = 0; i < samples; i++) {
    const ti = Math.max(tr.startAt, t - (FOLLOW.window * i) / (samples - 1));
    x += pointAt(tr.points, arcs, lightDistance(tr, arcs, ti))[0];
  }
  return [(FOLLOW_FIT * FOLLOW.across * x) / samples, 0, -FOLLOW_FIT * FOLLOW.along * along];
}

/** The camera at `t`: its position and the point it looks at. */
export function cameraAt(plan: Plan, arcsByTravel: readonly (readonly number[])[], t: number): { position: Vec3; target: Vec3 } {
  if (t >= plan.glideAt) {
    const k = easeInOut((t - plan.glideAt) / T.glide);
    return { position: lerp3(RIG.basePosition, SLOTS_POSITION, k), target: lerp3(RIG.baseTarget, SLOT_ROW, k) };
  }
  let off: Vec3 = [0, 0, 0];
  plan.travels.forEach((tr, k) => {
    const arcs = arcsByTravel[k]!;
    if (t >= tr.startAt && t <= tr.arriveAt) off = followOffset(tr, arcs, t);
    else if (t > tr.arriveAt && t < tr.arriveAt + T.land) {
      const back = 1 - easeInOut((t - tr.arriveAt) / T.land);
      const o = followOffset(tr, arcs, tr.arriveAt);
      off = [o[0] * back, 0, o[2] * back];
    }
  });
  const add = (a: Vec3): Vec3 => [a[0] + off[0], a[1] + off[1], a[2] + off[2]];
  return { position: add(RIG.basePosition), target: add(RIG.baseTarget) };
}
