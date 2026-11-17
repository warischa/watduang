// The flipcards reveal's timeline and layout, as data (gh#318). Pure: no DOM, no three. What each card turns to
// comes from the shared pick-final plan (../../_prize-final-pick/plan.ts), which every pick final shares; this
// file adds only the card's own look: where the row stands, when each card turns, and what the heading and the
// lower band say at a given time.
//
// Design: the picked options of design/Gh318Cards.dc.html, A ROW and ONE AT A TIME (owner pick 2026-11-16):
// frames card-idle, card-rv-one and card-result (A), card-few, with card-rm and card-fallback drawn by the
// shared host's 2D final view, never here. Positions are the board's frame coordinates: 1920x1080 CSS px, y
// down. The card adds no sub-beat of its own: its opening IS the shared turn (the board's MOTION row, a 600ms
// rotateY), and the face comes round at the half turn. The beats are the shared pick-final ones, which the
// owner ruled over the board's 7 s for all five (2026-11-17): the MC names each card as it turns, about 7 s each.
//
// The beats are shared with the envelopes final on purpose: one pace for both pick finals, read from the
// shared pick-final module, so the two cannot drift. A test still pins the two timelines equal on one record.

import { assertFinalPickPlan, BEATS, finalPickPlan, OBJECTS, STEP, type FinalPickPlan, type PickObject } from '../../_prize-final-pick/plan.ts';
import type { GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import { COPY } from './copy.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** The reveal's beats, in ms: the shared pick-final beats (one pace for both finals). The card's turn is the
 *  shared `turn` itself -- rotateY 180 degrees, ease-in-out, the face coming round at the half turn -- so the
 *  card adds no sub-beat inside it. The MC names each card as it turns, about 7 s each (owner ruling
 *  2026-11-17). */
export const T = { ...BEATS } as const;

/** One card's whole beat, read from the shared plan: 600 + 6400 = 7000. */
export { STEP };

// ---- the board's layout (A ROW) -----------------------------------------------------------------------------

/** The five card centres, left to right. */
export const XS = [280, 620, 960, 1300, 1640] as const;
/** The card (280 x 400 from top 300, 6px radius, 16px padding). The back: the night hatch (a 1px line every
 *  7px at 45 degrees) with a 2px gold inset edge and a gold five-point star (outer radius 64, inner 26) at its
 *  centre. A prize face: white with a 3px gold ring and a 16px gold glow outside it. A no-prize face: night with
 *  a 2px dim inset ring. */
export const CARD = {
  w: 280,
  h: 400,
  top: 300,
  r: 6,
  pad: 16,
  edge: 2,
  ring: 3,
  glow: 16,
  star: { outer: 64, inner: 26 },
} as const;
/** The card's centre line, frame y. */
export const CARD_CY = CARD.top + CARD.h / 2;

/** The camera's distance from the row, in frame px: square to it, far enough that a turning card keeps a
 *  gentle perspective. The board names the camera's pose and no figure. On the row's plane one world unit is
 *  one frame px through this camera. */
export const FOCAL = 2000;

/** Name plates under the cards: 320px pills, top 20px below the card, 4px / 14px padding. */
export const PLATE = { w: 320, minH: 64, top: CARD.top + 420, padX: 14, padY: 4 } as const;
/** The centred heading band (left and right 56, top 116). */
export const HUD = { top: 116, side: 56 } as const;
/** The lower band: 190px tall, 20px off the bottom, side columns 684px either side of the count. */
export const BAND = { h: 190, bottom: 20, side: 684 } as const;
export const BAND_TOP = FRAME_H - BAND.bottom - BAND.h;
/** The claim line sits 56px off the bottom. */
export const CLAIM_BOTTOM = 56;
export const TOP_H = 96;

// ---- the plan -------------------------------------------------------------------------------------------------

/** One card as the picture shows it once turned. */
export type CardFace = PickObject & {
  /** The place, or the no-prize label. */
  label: string;
  /** Under the label: the MC's prize name, or the thank-you line. */
  line: string;
};
export type Opening = {
  /** The card (0..4, left to right). */
  index: number;
  /** It starts to turn. */
  turnAt: number;
  /** Its face comes round to the room (the half turn). */
  faceAt: number;
};
export type Plan = {
  /** By card index. */
  slots: CardFace[];
  /** In turning order. */
  openings: Opening[];
  prizeCount: number;
  resultAt: number;
  total: number;
  beats: { at: number; event: GameEvent }[];
};

type AnyInput = RevealInput<'flipcards'>;

/** The picks the record carries: `picks[object]` is the finalist who picked card `object`. Read as unknown and
 *  handed to the shared plan, which refuses anything but the five finalists, each once. */
function recordedPicks(outcome: AnyInput['outcome']): readonly (string | null)[] {
  const picks: unknown = (outcome as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) throw new Error('flipcards: the final records no picks');
  return picks as readonly (string | null)[];
}

type ReadOut = { shared: FinalPickPlan; slots: CardFace[]; picks: readonly (string | null)[]; order: readonly string[] };

/** The shared plan of this record, and each card as the picture shows it. Throws on a record it could only draw
 *  by inventing: the shared plan refuses an incomplete, duplicate or foreign pick and a bad prize count. */
function readRecord(input: AnyInput): ReadOut {
  const outcome = input.outcome;
  if (outcome.game !== 'flipcards') throw new Error('flipcards: the outcome is for another game');
  if (outcome.kind !== 'final') throw new Error('flipcards: not a final');
  const prizes = outcome.prizes;
  if (prizes.length < 1 || prizes.length > OBJECTS) throw new Error(`flipcards: the final needs 1 to ${OBJECTS} prizes`);
  // Every prize the count promises must be a name the record holds: a hole, a null or a non-string still
  // reads as one prize in the count, and the card that wins it would paint a line with nothing on it.
  for (let i = 0; i < prizes.length; i++) {
    if (!(i in prizes) || typeof prizes[i] !== 'string') throw new Error(`flipcards: prize slot ${i} holds no prize name`);
  }
  const roster = input.people.map((p) => p.id);
  const order = outcome.order;
  if (roster.length !== OBJECTS || order.length !== OBJECTS || !order.every((id) => roster.includes(id))) {
    throw new Error(`flipcards: the order is not the ${OBJECTS} finalists of this step`);
  }
  const picks = recordedPicks(outcome);
  const shared = finalPickPlan(picks, order, prizes.length);
  const slots = shared.objects.map((o) => ({
    ...o,
    label: o.prize === null ? COPY.noPrize : COPY.prizeLabel(o.prize + 1),
    line: o.prize === null ? COPY.noPrizeLine : prizes[o.prize]!,
  }));
  return { shared, slots, picks, order };
}

/** What each card turns to, by card index: the picker, their drawn place, and the words the face shows. */
export function projectOutcome(input: AnyInput): CardFace[] {
  return readRecord(input).slots;
}

/** The whole reveal for a committed flipcards final: the faces the picture shows and the order they turn in
 *  come from one shared plan. */
export function planFor(input: AnyInput): Plan {
  const { shared, slots } = readRecord(input);
  const openings: Opening[] = shared.revealOrder.map((index, k) => {
    const turnAt = T.idle + k * STEP;
    return { index, turnAt, faceAt: turnAt + T.turn / 2 };
  });
  const resultAt = T.idle + OBJECTS * STEP;
  const total = resultAt + T.result;
  const beats: Plan['beats'] = [];
  openings.forEach((o, k) => {
    beats.push({ at: o.turnAt, event: { type: 'beat', beat: 'cut', index: k } });
    beats.push({ at: o.faceAt, event: { type: 'beat', beat: 'prize', index: slots[o.index]!.rank } });
  });
  beats.push({ at: total, event: { type: 'complete' } });
  return { slots, openings, prizeCount: shared.prizeCount, resultAt, total, beats };
}

/** Whether two plan values hold the same fields: arrays by position, objects by key whatever order the keys
 *  came in, everything else by value. A plan is data, so how it was serialised is not part of the picture. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    // An entry that was deleted leaves a hole, and the array methods step over holes: `every` would skip the
    // missing index and call the shorter plan the same one. So the index is walked and both sides must own
    // an entry at it -- a deleted beat, slot or opening is a different picture, not the same one.
    for (let i = 0; i < a.length; i++) {
      if (!(i in a) || !(i in b)) return false;
      if (!same(a[i], b[i])) return false;
    }
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    const keys = Object.keys(x);
    return keys.length === Object.keys(y).length && keys.every((k) => same(x[k], y[k]));
  }
  return false;
}

/** Throws unless `plan` draws exactly what the record makes: each card's picker and drawn prize, the turning
 *  order and the prize count, held to the shared plan's own check, and then every other field the picture
 *  draws with -- the words on each face, the times each card turns and comes round, the beats handed to the
 *  host -- held to the whole plan the record makes. Mount runs it on the plan it is about to draw, so a plan
 *  altered anywhere between record and picture is refused, never repaired. */
export function assertPlan(plan: Plan, input: AnyInput): void {
  const { picks, order } = readRecord(input);
  const shared: FinalPickPlan = {
    objects: plan.slots.map(({ index, id, rank, prize }) => ({ index, id, rank, prize })),
    revealOrder: plan.openings.map((o) => o.index),
    prizeCount: plan.prizeCount,
  };
  assertFinalPickPlan(shared, picks, order, input.outcome.prizes.length);
  // The shared check reads the picker, the prize and the order only; comparing the whole plan against a fresh
  // one covers the rest without a list of fields to keep in step with the plan's own shape.
  if (!same(plan, planFor(input))) throw new Error('flipcards: the plan is not the picture the record makes');
}

export function beatsIn(plan: Plan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

// ---- motion ----------------------------------------------------------------------------------------------------

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
/** Cubic ease-in-out: still at both ends, half way at the midpoint. */
export const easeInOut = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

const openingOf = (plan: Plan, index: number): Opening => plan.openings.find((o) => o.index === index)!;

/** How far card `index` has turned at `t`: 0 face down, 1 face up (ease-in-out over T.turn). */
export function turnAt(plan: Plan, index: number, t: number): number {
  return easeInOut((t - openingOf(plan, index).turnAt) / T.turn);
}

/** Whether card `index` has reached the half turn at `t`: the moment its prize beat lands. Which of its two
 *  panels the room actually sees is decided by the panel's facing toward the camera, not by this clock --
 *  away from the row's centre the half turn is not yet edge-on. */
export function faceUp(plan: Plan, index: number, t: number): boolean {
  return t >= openingOf(plan, index).faceAt;
}

/** How many cards are face up at `t`. */
export function openedAt(plan: Plan, t: number): number {
  return plan.openings.filter((o) => t >= o.faceAt).length;
}

/** The claim line's opacity; the lower band fades out as it fades in. */
export function claimOpacity(plan: Plan, t: number): number {
  return clamp01((t - plan.resultAt) / T.result);
}

/** The heading band's instruction at `t` (under the game name). */
export function hudAt(plan: Plan, t: number): string {
  if (t >= plan.resultAt) return COPY.winnersHeading;
  if (t < plan.openings[0]!.turnAt) return COPY.idle;
  if (openedAt(plan, t) === OBJECTS && plan.prizeCount === 1) return COPY.onePrize;
  return COPY.oneAtATime;
}

/** The lower band's two side texts at `t`; the count between them is the prize count throughout. */
export function bandAt(plan: Plan, t: number): { status: string; note: string } {
  if (t < plan.openings[0]!.turnAt) return { status: COPY.idleStatus, note: COPY.idleNote };
  const opened = openedAt(plan, t);
  if (opened < OBJECTS) return { status: COPY.opened(opened), note: COPY.lastNote };
  return { status: COPY.allOpen, note: COPY.noPrizeLine };
}
