// The marble-race reveal's timeline, as data (gh#316). Pure: no DOM, no three. The scene draws whatever
// this says at a given elapsed time, so every marble's position, every crossing and the freeze are decided
// here, from the committed outcome alone, and tested.
//
// Design: the picked options of design/Gh316Marbles.dc.html (owner pick 2026-11-16): M1 A HEAT LANES, M2 A
// FREEZE AT THE CUT, with the board's correction of the same day: the crossing order is heat-major, and
// time stops the instant the round's last survivor crosses, in the last heat that holds one.
//
// What the round record holds is the survivor SET, in roster order, and nothing else: event.ts stores no
// rank. So everything here that looks like an order is cosmetic and comes from the live field and the key
// alone: a heat is the next 20 names in roster order (the board's chunking), and a marble's pace inside
// its heat is drawn from the key. Neither ever reads who survives, so a name's heat, lane and pace are the
// same whichever survivors the draw committed. The survivors only decide WHO crosses: in each heat, the
// survivors cross in pace order and the rest stop short when the heat ends.
//
// Timings are the board's MOTION rows for A (launch 600ms, the race 6000ms a heat, the cut 1200ms hold with
// a 400ms pulse, settle 3000ms). Positions are the board's frame coordinates: 1920x1080 CSS px, y down.

import type { DeepReadonly, GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import { ELIMINATION_ROUNDS } from '../../../prize-draw/schedule.ts';
import { randomFor } from '../../prize-fireworks/renderer/seed.ts';
import { COPY } from './copy.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** Names a heat: the board's 20 lanes. */
export const HEAT_SIZE = 20;

/** Beats, in ms. */
export const T = {
  /** The heat's marbles leave the gate: ease-in, then the roll. */
  launch: 600,
  /** One heat's race, gate open to its last crossing. */
  race: 6000,
  /** Between two heats: the heat's end state holds while its plates read, then the next heat loads. The
   *  board draws no frame between heats; this is the board's count beat (800ms), reused. */
  rest: 800,
  /** The freeze holds before the round's result band comes up. */
  hold: 1200,
  /** The one gold pulse on the finish line at the freeze. */
  pulse: 400,
  /** A stopped marble and its plate going dim: the shared reduced fade token. */
  dim: 200,
  /** The result holds; streaks are gone, across-marbles keep their glow. */
  settle: 3000,
  /** A survivor rolls on past the line to its resting place. The board draws the resting places and no
   *  coast time; this is the pulse length, reused. */
  coast: 400,
} as const;

/** The track panel, lanes and finish line (the board's mb-reveal A frame). */
export const TRACK = { left: 56, top: 100, width: 1808, height: 770, radius: 24 } as const;
export const LANE_Y0 = 140;
export const LANE_DY = 36.5;
export const PLATE = { x: 72, w: 340, h: 32, padX: 12 } as const;
/** Plate names: Sarabun 700, 28px to an 18px floor, in the plate less its padding (NAME FIT, A plates). */
export const NAME_FIT = { size: 28, floor: 18, box: PLATE.w - 2 * PLATE.padX } as const;
export const MARBLE_R = 13;
/** Where a marble waits at the gate, and the finish line's centre. */
export const START_X = 453;
export const FINISH_X = 1740;
/** Across-marbles come to rest past the line, staggered by lane. */
export const REST_X0 = 1758;
export const REST_STEP = 18;

/** The first survivor of a heat crosses this far into its race; the last one ends it. */
const CROSS_FROM = 0.6;
/** Where an eliminated marble may stop, as a share of the gate-to-line run. */
const STOP_RANGE = [0.35, 0.93] as const;
/** The wobble that lets marbles pass and re-pass, as a share of the run. */
const WOBBLE = 0.03;

export type Marble = {
  id: string;
  /** Roster position in this round's field. */
  index: number;
  heat: number;
  lane: number;
  /** Cosmetic: the marble's place in its heat's pace order (0 fastest), drawn from the key. */
  pace: number;
  /** Survives this round: the record's survivor set, nothing else. */
  pass: boolean;
  /** When a survivor's centre reaches the line; null for everyone else. */
  crossAt: number | null;
  /** How far an eliminated marble has rolled when its heat ends (a share of the run, below 1). */
  stopFrac: number;
  wobbleFreq: number;
  wobblePhase: number;
};

export type Heat = {
  index: number;
  ids: string[];
  /** A heat after the freeze never runs: time stopped before it. */
  runs: boolean;
  startAt: number;
  /** The heat's cut: its last survivor crossing, or the race's end if it holds none. */
  endAt: number;
};

export type Beat = { at: number; event: GameEvent };

export type Plan = {
  round: number;
  /** The round's survivor count: what the band counts up to. */
  kept: number;
  heats: Heat[];
  /** Roster order. */
  marbles: Marble[];
  freezeHeat: number;
  freezeAt: number;
  resultAt: number;
  total: number;
  beats: Beat[];
};

type AnyInput = DeepReadonly<Pick<RevealInput<'marbles'>, 'key' | 'people' | 'outcome'>>;

export const easeOutCubic = (u: number): number => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

/** The live field in roster order, every id once; the record's survivors, each a participant, each once. */
function readOutcome(input: AnyInput): { ids: string[]; kept: Set<string>; round: number } {
  const outcome = input.outcome;
  if (outcome.game !== 'marbles') throw new Error('marbles: the outcome is for another game');
  if (outcome.kind !== 'round') throw new Error('marbles: plays elimination rounds only');
  const ids = input.people.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new Error('marbles: a participant is listed twice');
  const known = new Set(ids);
  const kept = new Set<string>();
  for (const id of outcome.survivors) {
    if (!known.has(id)) throw new Error(`marbles: survivor ${id} is not a participant of this round`);
    if (kept.has(id)) throw new Error(`marbles: survivor ${id} is listed twice`);
    kept.add(id);
  }
  if (kept.size === 0) throw new Error('marbles: a round with no survivor has no last survivor to freeze on');
  return { ids, kept, round: outcome.round };
}

/** The field cut into heats: the next HEAT_SIZE names in roster order, the last heat short. */
export function heatsOf(ids: readonly string[]): string[][] {
  const heats: string[][] = [];
  for (let i = 0; i < ids.length; i += HEAT_SIZE) heats.push(ids.slice(i, i + HEAT_SIZE));
  return heats;
}

/** A permutation of 0..n-1 from `rand` (Fisher-Yates). */
function shuffled(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The whole reveal for a committed outcome. Throws on an outcome it could only draw by inventing. */
export function planFor(input: AnyInput): Plan {
  const { ids, kept, round } = readOutcome(input);
  const groups = heatsOf(ids);
  const slot = T.launch + T.race + T.rest;
  const marbles: Marble[] = [];
  groups.forEach((group, h) => {
    // Pace and stop points come from the key and the lane alone, never from who survives.
    const rand = randomFor(input.key, `heat:${h}`);
    const pace = shuffled(group.length, rand);
    group.forEach((id, lane) => {
      marbles.push({
        id,
        index: h * HEAT_SIZE + lane,
        heat: h,
        lane,
        pace: pace[lane]!,
        pass: kept.has(id),
        crossAt: null,
        stopFrac: STOP_RANGE[0] + (STOP_RANGE[1] - STOP_RANGE[0]) * rand(),
        wobbleFreq: 1.2 + 1.3 * rand(),
        wobblePhase: rand(),
      });
    });
  });

  // The freeze heat is the last heat holding a survivor; every heat up to it runs, none after it does.
  const freezeHeat = Math.max(...marbles.filter((m) => m.pass).map((m) => m.heat));
  const heats: Heat[] = groups.map((group, h) => {
    const startAt = h * slot;
    return { index: h, ids: group, runs: h <= freezeHeat, startAt, endAt: startAt + T.launch + T.race };
  });

  // In each heat the survivors cross in pace order, spread over the back of the race; the last one crosses
  // as the race ends, which is the heat's cut (and, in the freeze heat, the instant time stops).
  for (const heat of heats) {
    if (!heat.runs) continue;
    const jitter = randomFor(input.key, `cross:${heat.index}`);
    const crossers = marbles.filter((m) => m.heat === heat.index && m.pass).sort((a, b) => a.pace - b.pace);
    const raceStart = heat.startAt + T.launch;
    crossers.forEach((m, j) => {
      const k = crossers.length;
      // The last crossing IS the heat's end, exactly: no float sum stands between the cut and the freeze.
      m.crossAt = j === k - 1 ? heat.endAt : raceStart + T.race * (CROSS_FROM + ((1 - CROSS_FROM) * (j + 0.3 + 0.4 * jitter())) / k);
    });
  }

  const freezeAt = heats[freezeHeat]!.endAt;
  const resultAt = freezeAt + T.hold;
  const total = resultAt + T.settle;
  const beats: Beat[] = heats.filter((h) => h.runs).map((h) => ({ at: h.endAt, event: { type: 'beat', beat: 'cut', index: h.index } }));
  beats.push({ at: total, event: { type: 'complete' } });
  const plan: Plan = { round, kept: kept.size, heats, marbles, freezeHeat, freezeAt, resultAt, total, beats };
  assertPlan(plan, input);
  return plan;
}

/**
 * Refuse a plan that does not stage its outcome exactly. Read off the plan's own content, the same way the
 * scene reads it: the set across the line at the freeze must be the record's survivors; the crossing order
 * must be heat-major; the freeze must be the last survivor's crossing, in the last heat holding one; no
 * eliminated marble may reach the line; the heats must be the field in roster order. Throws, never repairs.
 */
export function assertPlan(plan: Plan, input: AnyInput): void {
  const { ids, kept } = readOutcome(input);
  const fail = (why: string): never => {
    throw new Error(`marbles: the plan ${why}`);
  };
  const groups = heatsOf(ids);
  if (plan.heats.length !== groups.length) fail(`has ${plan.heats.length} heats for ${groups.length}`);
  if (plan.marbles.length !== ids.length) fail(`draws ${plan.marbles.length} marbles for ${ids.length} names`);
  plan.marbles.forEach((m, i) => {
    if (m.id !== ids[i]) fail(`puts ${m.id} where the roster has ${ids[i]}`);
    if (m.heat !== Math.floor(i / HEAT_SIZE) || m.lane !== i % HEAT_SIZE) fail(`seats ${m.id} in heat ${m.heat + 1} lane ${m.lane + 1}`);
    if (m.pass !== kept.has(m.id)) fail(`marks ${m.id} ${m.pass ? 'through' : 'out'} against the record`);
    if (m.pass !== (m.crossAt !== null)) fail(`has ${m.id} ${m.pass ? 'never crossing' : 'crossing'}`);
    if (!m.pass && !(m.stopFrac < 1)) fail(`lets eliminated ${m.id} reach the line`);
  });
  plan.heats.forEach((heat, h) => {
    if (heat.index !== h || heat.ids.join('\n') !== groups[h]!.join('\n')) fail(`heat ${h + 1} is not the roster's names ${h * HEAT_SIZE + 1} on`);
  });
  const crossers = plan.marbles.filter((m) => m.crossAt !== null).sort((a, b) => a.crossAt! - b.crossAt!);
  for (const m of crossers) {
    const heat = plan.heats[m.heat]!;
    if (!heat.runs) fail(`has ${m.id} cross in heat ${m.heat + 1}, which never runs`);
    if (!(m.crossAt! > heat.startAt + T.launch && m.crossAt! <= heat.endAt)) fail(`has ${m.id} cross outside heat ${m.heat + 1}`);
  }
  for (let i = 1; i < crossers.length; i++) {
    if (crossers[i - 1]!.heat > crossers[i]!.heat) fail(`is not heat-major: ${crossers[i]!.id} crosses before ${crossers[i - 1]!.id}`);
  }
  const last = crossers[crossers.length - 1];
  if (!last) return fail('has nobody cross');
  if (plan.freezeHeat !== last.heat) fail(`freezes in heat ${plan.freezeHeat + 1}, the last survivor crosses in heat ${last.heat + 1}`);
  if (plan.freezeAt !== last.crossAt) fail('does not freeze the instant the last survivor crosses');
  plan.heats.forEach((heat, h) => {
    if (heat.runs !== h <= plan.freezeHeat) fail(`${heat.runs ? 'runs' : 'skips'} heat ${h + 1} against the freeze`);
  });
  const shown = plan.marbles.filter((m) => isAcross(m, plan.freezeAt)).map((m) => m.id);
  if (shown.length !== kept.size || shown.some((id) => !kept.has(id))) fail('shows a different set across the line than the record');
}

/** Is the marble across the line at `t`? Only a survivor ever is, from its crossing on. */
export function isAcross(m: Marble, t: number): boolean {
  return m.crossAt !== null && t >= m.crossAt;
}

/** The survivor ids the picture shows across the line once time stops, in roster order. */
export function projectOutcome(input: AnyInput): string[] {
  const plan = planFor(input);
  return plan.marbles.filter((m) => isAcross(m, plan.freezeAt)).map((m) => m.id);
}

/** Distance covered by `s` ms into a roll that eases in over the launch, then runs at constant speed. */
function rolled(s: number): number {
  return s < T.launch ? (s * s) / (2 * T.launch) : s - T.launch / 2;
}

/** A marble's centre x at `t`. Each heat's clock stops at its cut: nothing moves after its own heat ends. */
export function marbleX(plan: Plan, m: Marble, t: number): number {
  const heat = plan.heats[m.heat]!;
  if (!heat.runs || t <= heat.startAt) return START_X;
  const now = Math.min(t, heat.endAt);
  const run = FINISH_X - START_X;
  if (m.crossAt !== null && now >= m.crossAt) {
    const restX = REST_X0 + (m.lane % 5) * REST_STEP;
    return FINISH_X + (restX - FINISH_X) * easeOutCubic((now - m.crossAt) / T.coast);
  }
  const arrive = m.crossAt ?? heat.endAt;
  const goal = m.crossAt !== null ? 1 : m.stopFrac;
  const span = arrive - heat.startAt;
  const s = now - heat.startAt;
  const u = s / span;
  const ramp = Math.min(1, s / T.launch) ** 2;
  const wobble = WOBBLE * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * (m.wobbleFreq * u + m.wobblePhase)) * ramp;
  // Short of the line until the marble's own crossing: the wobble may never carry it over early.
  const frac = Math.min((goal * rolled(s)) / rolled(span) + wobble, 0.999);
  return START_X + run * Math.max(0, frac);
}

/** The heat on the track at `t`: the latest one started, up to the freeze heat. */
export function heatAt(plan: Plan, t: number): number {
  let h = 0;
  for (const heat of plan.heats) if (heat.runs && t >= heat.startAt) h = heat.index;
  return h;
}

/** Survivors across the line at `t`, every heat so far. */
export function acrossAt(plan: Plan, t: number): number {
  return plan.marbles.filter((m) => isAcross(m, t)).length;
}

export type MarbleState = 'plain' | 'in' | 'out';

/** What a marble and its plate show at `t`: gold once across, dim once its heat ended short of the line. */
export function stateAt(plan: Plan, m: Marble, t: number): MarbleState {
  if (isAcross(m, t)) return 'in';
  const heat = plan.heats[m.heat]!;
  return !m.pass && heat.runs && t >= heat.endAt ? 'out' : 'plain';
}

/** The marble's dim at `t`, 0 to 1 over the fade. */
export function dimAt(plan: Plan, m: Marble, t: number): number {
  const heat = plan.heats[m.heat]!;
  if (m.pass || !heat.runs) return 0;
  return Math.min(1, Math.max(0, (t - heat.endAt) / T.dim));
}

/** A streak shows while the marble rolls and fades once it stops (its crossing coast, or its heat's end). */
export function streakAt(plan: Plan, m: Marble, t: number): number {
  const heat = plan.heats[m.heat]!;
  if (!heat.runs || t <= heat.startAt) return 0;
  const stop = Math.min(heat.endAt, m.crossAt !== null ? m.crossAt + T.coast : heat.endAt);
  return 1 - Math.min(1, Math.max(0, (t - stop) / T.dim));
}

/** The one gold pulse on the line at the freeze: up and down over its length, never a flash. */
export function pulseAt(plan: Plan, t: number): number {
  const u = (t - plan.freezeAt) / T.pulse;
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
}

/** Events whose time falls in (from, to]: consecutive ticks report each beat exactly once. */
export function beatsIn(plan: Plan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

export type Band = { left: string; figure: number; right: { kind: 'text'; text: string } | { kind: 'legend' } };

/** The lower band at `t`: the heat counter and the rolling count through the race and the freeze, then the
 *  round's result. */
export function bandAt(plan: Plan, t: number): Band {
  if (t < plan.resultAt) {
    return {
      // The denominator is the heats that run: a trailing heat after the freeze never loads, so promising
      // the whole chunking would count a heat the round never shows.
      left: COPY.heatCounter(heatAt(plan, t) + 1, plan.heats.filter((h) => h.runs).length),
      figure: acrossAt(plan, t),
      right: { kind: 'text', text: COPY.freezeLine(plan.kept) },
    };
  }
  return { left: COPY.passedRound(plan.round), figure: acrossAt(plan, t), right: { kind: 'legend' } };
}

/** The round label of the projector's top bar. */
export function topLabel(plan: Plan): string {
  return COPY.roundLabel(plan.round, ELIMINATION_ROUNDS);
}

/** The round dots: one per elimination round, then the final's pill. */
export function topDots(plan: Plan): ('done' | 'on' | 'todo')[] {
  return Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i + 1 < plan.round ? 'done' : i + 1 === plan.round ? 'on' : 'todo'));
}

/** A lane's centre y. */
export function laneY(lane: number): number {
  return LANE_Y0 + LANE_DY * lane + PLATE.h / 2;
}
