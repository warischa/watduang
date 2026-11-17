// The shared pick final (gh#317 envelopes, gh#318 flipcards), designed once and given each game's own look by
// its renderer. Pure: no DOM, no three, no copy.
//
// Five finalists each picked one of five objects (index 0..4, left to right). The final's uniform order was
// drawn before anything is shown, and it alone ranks the five: prize 1..N go to ranks 1..N, N being the MC's
// prize count. So whichever object a finalist picked opens to THEIR drawn prize: the pick is theatre and never
// changes the odds. The reveal opens one object at a time: the objects that win nothing first, left to right,
// then prize N down to prize 1, so the first prize opens last.
//
// Design: the shared mechanic of the gh#317 / gh#318 boards (owner pick 2026-11-16: ROW, ONE AT A TIME).
// Nothing here is chosen: every field is read off the committed record, and a record or plan that does not
// hold together is refused, never repaired.

import { FINAL_SIZE } from '../../prize-draw/schedule.ts';

export const OBJECTS = FINAL_SIZE;

/** The reveal's beats, in ms, one set for every pick final so the two games keep one pace. The MC names each
 *  object as it opens, about 7 s each (owner ruling 2026-11-17 on gh#317 / gh#318, over the board's 7 s for
 *  all five): one object's turn plus its hold is 7000. Each renderer adds its own sub-beats inside `turn`. */
export const BEATS = {
  /** The picks stand before the first object opens. */
  idle: 1500,
  /** One object opens. */
  turn: 600,
  /** The room reads it and the MC names it before the next one opens. */
  hold: 6400,
  /** The claim line fades in under the open row; the stage stills. */
  result: 200,
} as const;

/** One object's whole beat. */
export const STEP = BEATS.turn + BEATS.hold;

/** One object as the picture shows it. */
export type PickObject = {
  /** Its place in the row, 0..4 left to right. */
  index: number;
  /** The finalist who picked it. */
  id: string;
  /** The picker's place in the drawn order, 0 = first prize. */
  rank: number;
  /** The prize it opens to (0 = first prize), or null when the rank is at or past the prize count. */
  prize: number | null;
};

export type FinalPickPlan = {
  /** By object index. */
  objects: PickObject[];
  /** Object indices in opening order: no-prize objects left to right, then prize N down to prize 1. */
  revealOrder: number[];
  prizeCount: number;
};

function checkOrder(order: unknown): asserts order is readonly string[] {
  if (!Array.isArray(order) || order.length !== OBJECTS) throw new Error(`final pick: the order must hold ${OBJECTS} finalists`);
  for (let i = 0; i < OBJECTS; i++) {
    if (!(i in order) || typeof order[i] !== 'string') throw new Error(`final pick: order slot ${i} holds no finalist`);
  }
  if (new Set(order).size !== OBJECTS) throw new Error('final pick: the order names a finalist twice');
}

function checkPicks(picks: unknown, order: readonly string[]): asserts picks is readonly string[] {
  if (!Array.isArray(picks) || picks.length !== OBJECTS) throw new Error(`final pick: the picks must cover ${OBJECTS} objects`);
  for (let i = 0; i < OBJECTS; i++) {
    const id: unknown = picks[i];
    if (typeof id !== 'string') throw new Error(`final pick: object ${i} has no pick`);
    if (!order.includes(id)) throw new Error(`final pick: object ${i} was picked by someone outside the final`);
  }
  if (new Set(picks).size !== OBJECTS) throw new Error('final pick: a finalist picked two objects');
}

function checkCount(prizeCount: unknown): asserts prizeCount is number {
  if (!Number.isInteger(prizeCount) || (prizeCount as number) < 1 || (prizeCount as number) > OBJECTS) {
    throw new Error(`final pick: the prize count must be 1 to ${OBJECTS}`);
  }
}

/**
 * The plan of a committed pick final: what each object opens to, and the order they open in. `picks[i]` is the
 * finalist on object i (the shape the event stores while the MC places them, so a null is accepted by the type
 * and refused here: a final draws only once all five are placed). `order` is first prize first.
 */
export function finalPickPlan(picks: readonly (string | null)[], order: readonly string[], prizeCount: number): FinalPickPlan {
  checkOrder(order);
  checkPicks(picks, order);
  checkCount(prizeCount);
  const objects: PickObject[] = picks.map((id, index) => {
    const rank = order.indexOf(id);
    return { index, id, rank, prize: rank < prizeCount ? rank : null };
  });
  const none = objects.filter((o) => o.prize === null).map((o) => o.index);
  const prized = objects.filter((o) => o.prize !== null).sort((a, b) => b.rank - a.rank).map((o) => o.index);
  return { objects, revealOrder: [...none, ...prized], prizeCount };
}

/**
 * Throws unless `plan` is exactly what the record makes: every object names its picker and that picker's drawn
 * prize, and the objects open no-prize first (left to right), then prize N down to prize 1. A renderer runs
 * this on the plan it is about to draw, so a plan altered anywhere between record and picture is refused.
 */
export function assertFinalPickPlan(plan: FinalPickPlan, picks: readonly (string | null)[], order: readonly string[], prizeCount: number): void {
  const want = finalPickPlan(picks, order, prizeCount);
  const objects = plan?.objects;
  if (!Array.isArray(objects) || objects.length !== OBJECTS) throw new Error('final pick: the plan does not hold five objects');
  want.objects.forEach((w, i) => {
    const o = objects[i];
    if (!o || o.index !== w.index || o.id !== w.id || o.rank !== w.rank || o.prize !== w.prize) {
      throw new Error(`final pick: the plan's object ${i} is not what the record makes`);
    }
  });
  const reveal = plan.revealOrder;
  if (!Array.isArray(reveal) || reveal.length !== OBJECTS || want.revealOrder.some((v, i) => reveal[i] !== v)) {
    throw new Error('final pick: the plan opens the objects in another order than the record makes');
  }
  if (plan.prizeCount !== prizeCount) throw new Error('final pick: the plan carries another prize count');
}
