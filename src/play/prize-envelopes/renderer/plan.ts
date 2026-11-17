// The envelopes reveal's timeline and layout, as data (gh#317). Pure: no DOM, no three. What each envelope
// opens to comes from the shared pick-final plan (../../_prize-final-pick/plan.ts), which every pick final
// shares; this file adds only the envelope's own look: where the row stands, when each flap lifts, and what
// the heading and the lower band say at a given time.
//
// Design: the picked options of design/Gh317Envelopes.dc.html, A ROW and ONE AT A TIME (owner pick
// 2026-11-16): frames env-idle, env-rv-one and env-result (A), env-few, with env-rm and env-fallback drawn by
// the shared host's 2D final view, never here. Positions are the board's frame coordinates: 1920x1080 CSS px,
// y down. The flap's own sub-beats are its MOTION row for ONE AT A TIME; the beats they sit in are the shared
// pick-final ones, which the owner ruled over the board's 7 s for all five (2026-11-17): the MC names each
// envelope as it opens, about 7 s each.

import { BEATS, finalPickPlan, OBJECTS, STEP, type FinalPickPlan, type PickObject } from '../../_prize-final-pick/plan.ts';
import type { GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import { COPY } from './copy.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** The reveal's beats, in ms: the shared pick-final beats (one pace for both finals) plus the envelope's own
 *  sub-beats inside `turn`. The MC names each envelope as it opens, about 7 s each (owner ruling 2026-11-17). */
export const T = {
  ...BEATS,
  /** The flap lifts, ease-out. */
  lift: 300,
  /** The prize slot fades in over the open body. */
  slotIn: 200,
} as const;

/** One envelope's whole beat, read from the shared plan: 600 + 6400 = 7000. */
export { STEP };

// ---- the board's layout (A ROW) -----------------------------------------------------------------------------

/** The five envelope centres, left to right. */
export const XS = [280, 620, 960, 1300, 1640] as const;
/** The envelope art box (300 x 300 from top 340): the body is a 294 x 204 rounded rect from y 93 with a 3px gold
 *  edge; the flap hinges on the body's top edge and its tip sits at 180 closed, 24 open; two bows and the seal
 *  ride on the tip. */
export const ENV = {
  w: 300,
  top: 340,
  hinge: 93,
  body: { x: 3, y: 93, w: 294, h: 204, r: 12, edge: 3 },
  closedTip: 180,
  openTip: 24,
  bow: { dx: 20, dy: -4, r: 11 },
  seal: { r: 15, edge: 3 },
} as const;
/** The flap's length, hinge to tip (closed). */
export const FLAP_LEN = ENV.closedTip - ENV.hinge;

/** The camera's distance from the row, in frame px: square to it, far enough that a turning flap keeps a gentle
 *  perspective. The board names the camera's pose and no figure. On the row's plane one world unit is one
 *  frame px through this camera. */
export const FOCAL = 2000;

/** The frame y of a flap tip turned by `angle` about its hinge through the base camera: out toward the room
 *  (+z) first, upright at a half turn, then leaning back (-z). */
export function tipFrameY(angle: number): number {
  const hinge = FRAME_H / 2 - (ENV.top + ENV.hinge);
  const y = hinge - FLAP_LEN * Math.cos(angle);
  const z = FLAP_LEN * Math.sin(angle);
  return FRAME_H / 2 - (y * FOCAL) / (FOCAL - z);
}

/** The angle the flap turns through: past upright and leaning back, until its tip is at the height the board
 *  draws an open flap's tip (y 24 in the art box). Solved by bisection: past upright the tip only sinks as the
 *  flap leans further back. */
function solveOpenAngle(): number {
  const want = ENV.top + ENV.openTip;
  let lo = Math.PI;
  let hi = (3 * Math.PI) / 2;
  if (!(tipFrameY(lo) < want && tipFrameY(hi) > want)) throw new Error('envelopes: the open flap cannot reach the board tip');
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (tipFrameY(mid) < want) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export const OPEN_ANGLE = solveOpenAngle();
/** The prize slot over an open envelope's body: 18px in from each side, 14px below the body's top. */
export const SLOT = { dx: 18, top: ENV.top + 107, w: ENV.w - 36 } as const;
/** Name plates under the envelopes: 320px pills, top at 660, 4px / 14px padding. */
export const PLATE = { w: 320, minH: 64, top: ENV.top + 320, padX: 14, padY: 4 } as const;
/** The centred heading band (left and right 56, top 116). */
export const HUD = { top: 116, side: 56 } as const;
/** The lower band: 190px tall, 20px off the bottom, side columns 684px either side of the count. */
export const BAND = { h: 190, bottom: 20, side: 684 } as const;
export const BAND_TOP = FRAME_H - BAND.bottom - BAND.h;
/** The claim line sits 56px off the bottom. */
export const CLAIM_BOTTOM = 56;
export const TOP_H = 96;

// ---- the plan -------------------------------------------------------------------------------------------------

/** One envelope as the picture shows it once open. */
export type EnvelopeSlot = PickObject & {
  /** The place, or the no-prize label. */
  label: string;
  /** Under the label: the MC's prize name, or the thank-you line. */
  line: string;
};
export type Opening = {
  /** The envelope (0..4, left to right). */
  index: number;
  /** Its flap starts to lift. */
  liftAt: number;
  /** Its prize slot starts to fade in. */
  slotAt: number;
};
export type Plan = {
  /** By envelope index. */
  slots: EnvelopeSlot[];
  /** In opening order. */
  openings: Opening[];
  prizeCount: number;
  resultAt: number;
  total: number;
  beats: { at: number; event: GameEvent }[];
};

type AnyInput = RevealInput<'envelopes'>;

/** The picks the record carries: `picks[object]` is the finalist who picked envelope `object`. Read as unknown
 *  and handed to the shared plan, which refuses anything but the five finalists, each once. */
function recordedPicks(outcome: AnyInput['outcome']): readonly (string | null)[] {
  const picks: unknown = (outcome as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) throw new Error('envelopes: the final records no picks');
  return picks as readonly (string | null)[];
}

/** The shared plan of this record, and each envelope as the picture shows it. Throws on a record it could only
 *  draw by inventing: the shared plan refuses an incomplete, duplicate or foreign pick and a bad prize count. */
function readRecord(input: AnyInput): { shared: FinalPickPlan; slots: EnvelopeSlot[] } {
  const outcome = input.outcome;
  if (outcome.game !== 'envelopes') throw new Error('envelopes: the outcome is for another game');
  if (outcome.kind !== 'final') throw new Error('envelopes: not a final');
  const prizes = outcome.prizes;
  if (prizes.length < 1 || prizes.length > OBJECTS) throw new Error(`envelopes: the final needs 1 to ${OBJECTS} prizes`);
  // Every prize the count promises must be a name the record holds: a hole, a null or a non-string still
  // reads as one prize in the count, and the envelope that wins it would paint a line with nothing on it.
  for (let i = 0; i < prizes.length; i++) {
    if (!(i in prizes) || typeof prizes[i] !== 'string') throw new Error(`envelopes: prize slot ${i} holds no prize name`);
  }
  const roster = input.people.map((p) => p.id);
  const order = outcome.order;
  if (roster.length !== OBJECTS || order.length !== OBJECTS || !order.every((id) => roster.includes(id))) {
    throw new Error(`envelopes: the order is not the ${OBJECTS} finalists of this step`);
  }
  const shared = finalPickPlan(recordedPicks(outcome), order, prizes.length);
  const slots = shared.objects.map((o) => ({
    ...o,
    label: o.prize === null ? COPY.noPrize : COPY.prizeLabel(o.prize + 1),
    line: o.prize === null ? COPY.noPrizeLine : prizes[o.prize]!,
  }));
  return { shared, slots };
}

/** What each envelope opens to, by envelope index: the picker, their drawn place, and the words the slot shows. */
export function projectOutcome(input: AnyInput): EnvelopeSlot[] {
  return readRecord(input).slots;
}

/** The whole reveal for a committed envelopes final: the slots the picture shows and the order they open in
 *  come from one shared plan. */
export function planFor(input: AnyInput): Plan {
  const { shared, slots } = readRecord(input);
  const openings: Opening[] = shared.revealOrder.map((index, k) => {
    const liftAt = T.idle + k * STEP;
    return { index, liftAt, slotAt: liftAt + T.lift };
  });
  const resultAt = T.idle + OBJECTS * STEP;
  const total = resultAt + T.result;
  const beats: Plan['beats'] = [];
  openings.forEach((o, k) => {
    beats.push({ at: o.liftAt, event: { type: 'beat', beat: 'cut', index: k } });
    beats.push({ at: o.slotAt, event: { type: 'beat', beat: 'prize', index: slots[o.index]!.rank } });
  });
  beats.push({ at: total, event: { type: 'complete' } });
  return { slots, openings, prizeCount: shared.prizeCount, resultAt, total, beats };
}

export function beatsIn(plan: Plan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

// ---- motion ----------------------------------------------------------------------------------------------------

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
export const easeOut = (u: number): number => 1 - (1 - clamp01(u)) ** 3;

const openingOf = (plan: Plan, index: number): Opening => plan.openings.find((o) => o.index === index)!;

/** How far envelope `index`'s flap has lifted at `t`: 0 closed, 1 open (ease-out over T.lift). */
export function flapAt(plan: Plan, index: number, t: number): number {
  return easeOut((t - openingOf(plan, index).liftAt) / T.lift);
}

/** Envelope `index`'s prize slot opacity at `t` (a 200ms fade once the flap is up). */
export function slotOpacity(plan: Plan, index: number, t: number): number {
  return clamp01((t - openingOf(plan, index).slotAt) / T.slotIn);
}

/** How many envelopes are open (their slot showing) at `t`. */
export function openedAt(plan: Plan, t: number): number {
  return plan.openings.filter((o) => t >= o.slotAt).length;
}

/** The claim line's opacity; the lower band fades out as it fades in. */
export function claimOpacity(plan: Plan, t: number): number {
  return clamp01((t - plan.resultAt) / T.result);
}

/** The heading band's instruction at `t` (under the game name). */
export function hudAt(plan: Plan, t: number): string {
  if (t >= plan.resultAt) return COPY.winnersHeading;
  if (t < plan.openings[0]!.liftAt) return COPY.idle;
  if (openedAt(plan, t) === OBJECTS && plan.prizeCount === 1) return COPY.onePrize;
  return COPY.oneAtATime;
}

/** The lower band's two side texts at `t`; the count between them is the prize count throughout. */
export function bandAt(plan: Plan, t: number): { status: string; note: string } {
  if (t < plan.openings[0]!.liftAt) return { status: COPY.idleStatus, note: COPY.idleNote };
  const opened = openedAt(plan, t);
  if (opened < OBJECTS) return { status: COPY.opened(opened), note: COPY.lastNote };
  return { status: COPY.allOpen, note: COPY.noPrizeLine };
}
