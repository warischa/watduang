// The cards reveal's pure timeline (gh#306): where every card sits, when it is dealt, when the rule shows,
// when everyone flips, and which cards the committed round says passed. DOM-free and three-free, so the
// whole timeline is testable in node.
//
// The picked option is B ALL AT ONCE (design/Gh303Cards.dc.html, owner pick 2026-11-11): the deal, then a
// centre rule card, a drumroll, one flip for everyone, a beat to read, then the judging and the count. The
// beat times are the board's MOTION row; where the row gives one span for two moves, the split is named.
//
// Nothing here decides an outcome. The deal's cards and the round's survivors arrive committed; a card is
// shown passing only because `outcome.survivors` lists its holder. An outcome that cannot be drawn as given
// (a card for nobody, a survivor nobody holds, or survivors the drawn rule visibly contradicts) is refused
// with an error, never repaired: the host then shows the 2D view.

import type { DeepReadonly, GameEvent, RevealInput } from '../../_prize-reveal/game-contract.ts';
import type { Deal } from '../../../prize-event/game-contract.ts';
import { satisfies, type Card, type RuleId } from '../../../prize-draw/cards.ts';
import { ELIMINATION_ROUNDS } from '../../../prize-draw/schedule.ts';
import { COPY } from './copy.ts';

export { COPY };

export const FRAME_W = 1920;
export const FRAME_H = 1080;

/** Beat lengths in ms (MOTION row, option B). */
export const T = {
  /** Deal: each card leaves the stack 0.02s after the one before and slides for 400ms. */
  dealStep: 20,
  dealSlide: 400,
  /** Rule draw, 2000ms: fly to the centre and flip (800ms, split evenly), hold 800ms, shrink 400ms. */
  ruleFly: 400,
  ruleFlip: 400,
  ruleHold: 800,
  ruleShrink: 400,
  /** The round-code veil fades in over 300ms (code row); the rule card's veil reuses it. */
  veilIn: 300,
  drumroll: 1500,
  flip: 600,
  hold: 1200,
  /** Judge 500ms: passing rings come up in 200ms; fails dim and strike in 300ms, from the edges in. */
  judge: 500,
  ringUp: 200,
  failDim: 300,
  /** The judging stagger past 10 cards (gsap row): 0.02s, squeezed when the fails would overrun. */
  judgeStep: 20,
  count: 800,
} as const;

/** The stage field (VALUES row): 56px in from each side, from 100px to 860px. */
export const FIELD = { left: 56, right: 1864, top: 100, height: 760 } as const;
/** A card at the board's 100-card metrics, in card units (1 unit = 1 frame px at full size). */
export const CARD = { w: 293, h: 40, colGap: 10, rowGap: 4, radius: 6, padL: 4, padR: 8, face: 66, faceGap: 6, downPad: 8 } as const;
/** Names on cards (NAME FIT row): Sarabun 20px, floor 16px. */
export const NAME_FIT = { size: 20, floor: 16 } as const;
/** Name boxes in card units for a card `cardW` wide: face up beside the 66px rank column; face down across the whole card. */
export function nameBoxes(cardW: number): { up: number; down: number } {
  return { up: cardW - CARD.padL - CARD.face - CARD.faceGap - CARD.padR, down: cardW - 2 * CARD.downPad };
}
export const NAME_BOX_UP = nameBoxes(CARD.w).up;
export const NAME_BOX_DOWN = nameBoxes(CARD.w).down;
/** The rule card (option B): 700px wide at left 610, top 250. */
export const RULE_CARD = { x: 610, y: 250, w: 700 } as const;
/** The lower band's centre line (190px tall, 20px off the bottom). */
export const BAND_CY = FRAME_H - 20 - 190 / 2;

/**
 * `cardW` and `rowH` are in card units; the painted size is that times `s`. Every card of row r is rowH[r] tall.
 */
export type Layout = { cols: number; rows: number; s: number; cardW: number; rowH: number[]; cells: { cx: number; cy: number }[] };

/** Past 102 names a row is two name lines at the 16px floor (PD-306-01, the audit canvas): 2 x 16 = 32px. */
const DENSE_ROW = 2 * NAME_FIT.floor;
const FIELD_W = FIELD.right - FIELD.left;

/**
 * Where n cards sit. The board draws 100 cards on 6 columns of 40px rows, and that holds up to 102 cards.
 * Above that the cards keep the board's sizes and only the grid changes (PD-306-01): rows are 32px, and
 * the column count is the fewest from 6 to 10 whose rows fit the field, so no name is scaled under its 16px
 * floor. A name may take up to 4 lines at the floor (line height = font size) and its row grows to hold it;
 * `linesAt(cardW)` gives each card's longest name's line count at that card width, and is asked only above
 * 102 cards. If even 10 columns cannot hold the grown rows, the field scales as one so no card leaves it.
 * Rows fill left to right, the field is centred in the stage, the last row starts at the left as a CSS grid's does.
 */
export function fieldLayout(n: number, linesAt?: (cardW: number) => readonly number[]): Layout {
  const rows6 = Math.max(1, Math.ceil(n / 6));
  let cols = 6;
  let rowH: number[] = new Array<number>(rows6).fill(CARD.h);
  let cardW: number = CARD.w;
  let s = 1;
  const heightOf = (hs: readonly number[]): number => hs.reduce((a, b) => a + b, 0) + (hs.length - 1) * CARD.rowGap;
  if (heightOf(rowH) > FIELD.height) {
    let found = false;
    let last = { cols, rowH, cardW };
    for (let c = 6; c <= 10 && !found; c++) {
      const rows = Math.ceil(n / c);
      const w = (FIELD_W - (c - 1) * CARD.colGap) / c;
      const lines = linesAt?.(w) ?? [];
      const hs = Array.from({ length: rows }, (_, r) => {
        let most = 0;
        for (let i = r * c; i < Math.min(n, (r + 1) * c); i++) most = Math.max(most, lines[i] ?? 1);
        return Math.max(DENSE_ROW, most * NAME_FIT.floor);
      });
      last = { cols: c, rowH: hs, cardW: w };
      found = heightOf(hs) <= FIELD.height;
    }
    ({ cols, rowH, cardW } = last);
    s = Math.min(1, FIELD.height / heightOf(rowH));
  }
  const rows = rowH.length;
  const w = (cols * cardW + (cols - 1) * CARD.colGap) * s;
  const h = heightOf(rowH) * s;
  const x0 = (FIELD.left + FIELD.right) / 2 - w / 2;
  const y0 = FIELD.top + FIELD.height / 2 - h / 2;
  const tops: number[] = [];
  rowH.reduce((top, rh) => (tops.push(top), top + rh + CARD.rowGap), 0);
  const cells = Array.from({ length: n }, (_, i) => ({
    cx: x0 + ((i % cols) * (cardW + CARD.colGap) + cardW / 2) * s,
    cy: y0 + (tops[Math.floor(i / cols)]! + rowH[Math.floor(i / cols)]! / 2) * s,
  }));
  return { cols, rows, s, cardW, rowH, cells };
}

/** Where the deal starts: one stack at the centre of the field. */
export const STACK = { x: (FIELD.left + FIELD.right) / 2, y: FIELD.top + FIELD.height / 2 } as const;

/** One card in its slot. `pass` is null until a round is committed; `judgeAt` is null on a deal. */
export type Slot = { id: string; card: Card; index: number; cx: number; cy: number; dealAt: number; pass: boolean | null; judgeAt: number | null };
export type Beat = { at: number; event: GameEvent };

type Common = { round: number; layout: Layout; slots: Slot[]; beats: Beat[]; total: number };
export type DealPlan = Common & { kind: 'deal'; dealEnd: number };
export type RoundPlan = Common & {
  kind: 'round';
  rule: RuleId;
  /** How many the committed round keeps: outcome.survivors, never a count of the cards. */
  kept: number;
  ruleShownAt: number;
  revealAt: number;
  flipAt: number;
  judgeAt: number;
  countAt: number;
};
export type Plan = DealPlan | RoundPlan;

type AnyInput = Pick<RevealInput<'cards'>, 'key' | 'outcome' | 'people'>;
/** The outcome as this file checks it at run time: every field it reads, none assumed present. */
type Committed = {
  kind: string;
  game: unknown;
  round: number;
  deal?: DeepReadonly<Deal>;
  rule?: unknown;
  survivors?: readonly string[];
};

export const easeOutCubic = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
export const easeInOutCubic = (u: number): number => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export function clamp01(u: number): number {
  return Math.min(1, Math.max(0, u));
}

const RULES: readonly RuleId[] = ['black', 'clubs', 'face'];

function checkDeal(o: Committed, people: AnyInput['people']): DeepReadonly<Deal> {
  if (o.game !== 'cards') throw new Error(`cards: outcome is for ${String(o.game)}`);
  if (o.kind !== 'deal' && o.kind !== 'round') throw new Error(`cards: cannot draw a ${o.kind}`);
  if (!Number.isInteger(o.round) || o.round < 1 || o.round > ELIMINATION_ROUNDS) {
    throw new Error(`cards: round ${o.round} is not an elimination round`);
  }
  const deal = o.deal;
  if (!deal) throw new Error('cards: no deal');
  if (!RULES.includes(deal.pair[0]) || !RULES.includes(deal.pair[1])) throw new Error('cards: unknown rule in the pair');
  if (deal.cards.length !== people.length) throw new Error(`cards: ${deal.cards.length} cards for ${people.length} people`);
  if (new Set(people.map((p) => p.id)).size !== people.length) throw new Error('cards: a person is listed twice');
  deal.cards.forEach((c, i) => {
    if (c.id !== people[i]!.id) throw new Error(`cards: card ${i} is for ${c.id}, not ${people[i]!.id}`);
    const { suit, rank } = c.card;
    if (!['S', 'H', 'D', 'C'].includes(suit) || !Number.isInteger(rank) || rank < 1 || rank > 13) {
      throw new Error(`cards: card ${i} is not a card`);
    }
  });
  return deal;
}

/** The timeline for a committed deal or round. Throws on an outcome it cannot draw as given. */
export function planFor(input: AnyInput): Plan {
  const outcome = input.outcome as unknown as Committed;
  const deal = checkDeal(outcome, input.people);
  const cards = deal.cards;
  const layout = fieldLayout(cards.length);

  if (outcome.kind === 'deal') {
    const slots: Slot[] = cards.map((c, i) => ({
      id: c.id,
      card: { suit: c.card.suit, rank: c.card.rank },
      index: i,
      cx: layout.cells[i]!.cx,
      cy: layout.cells[i]!.cy,
      dealAt: i * T.dealStep,
      pass: null,
      judgeAt: null,
    }));
    const dealEnd = Math.max(0, cards.length - 1) * T.dealStep + T.dealSlide;
    return {
      kind: 'deal',
      round: outcome.round,
      layout,
      slots,
      dealEnd,
      beats: [
        { at: dealEnd, event: { type: 'beat', beat: 'deal', index: 0 } },
        { at: dealEnd, event: { type: 'complete' } },
      ],
      total: dealEnd,
    };
  }

  if (outcome.rule !== 0 && outcome.rule !== 1) throw new Error(`cards: rule ${String(outcome.rule)} is not 0 or 1`);
  if (!Array.isArray(outcome.survivors)) throw new Error('cards: no survivor list');
  const survivors = outcome.survivors;
  const rule = deal.pair[outcome.rule];
  const kept = new Set(survivors);
  if (kept.size !== survivors.length) throw new Error('cards: a survivor is listed twice');
  const holders = new Set(cards.map((c) => c.id));
  for (const id of kept) if (!holders.has(id)) throw new Error(`cards: survivor ${id} holds no card`);
  // The rule is on screen beside the faces, so a survivor list it contradicts cannot be drawn honestly.
  for (const c of cards) {
    if (satisfies(rule, c.card) !== kept.has(c.id)) throw new Error(`cards: survivor list disagrees with the drawn rule at ${c.id}`);
  }

  const ruleShownAt = T.ruleFly + T.ruleFlip;
  const revealAt = ruleShownAt + T.ruleHold + T.ruleShrink;
  const flipAt = revealAt + T.drumroll;
  const judgeAt = flipAt + T.flip + T.hold;
  const countAt = judgeAt + T.judge;
  const total = countAt + T.count;

  // Fails dim from the edges in: farthest from the field's centre first.
  const fails = cards.map((_, i) => i).filter((i) => !kept.has(cards[i]!.id));
  const dist = (i: number): number => Math.hypot(layout.cells[i]!.cx - STACK.x, layout.cells[i]!.cy - STACK.y);
  fails.sort((a, b) => dist(b) - dist(a) || a - b);
  const step = fails.length > 1 ? Math.min(T.judgeStep, (T.judge - T.failDim) / (fails.length - 1)) : 0;
  const failAt = new Map(fails.map((i, k) => [i, judgeAt + k * step]));

  const slots: Slot[] = cards.map((c, i) => ({
    id: c.id,
    card: { suit: c.card.suit, rank: c.card.rank },
    index: i,
    cx: layout.cells[i]!.cx,
    cy: layout.cells[i]!.cy,
    dealAt: Number.NEGATIVE_INFINITY,
    pass: kept.has(c.id),
    judgeAt: kept.has(c.id) ? judgeAt : failAt.get(i)!,
  }));
  return {
    kind: 'round',
    round: outcome.round,
    layout,
    slots,
    rule,
    kept: survivors.length,
    ruleShownAt,
    revealAt,
    flipAt,
    judgeAt,
    countAt,
    beats: [
      { at: ruleShownAt, event: { type: 'beat', beat: 'rule', index: 0 } },
      { at: judgeAt, event: { type: 'beat', beat: 'cut', index: 0 } },
      { at: total, event: { type: 'complete' } },
    ],
    total,
  };
}

/** Events whose time falls in (from, to]: each is reported once across consecutive ticks. */
export function beatsIn(plan: Plan, from: number, to: number): GameEvent[] {
  return plan.beats.filter((b) => b.at > from && b.at <= to).map((b) => b.event);
}

/** Cards that have landed in their slot by `t`. */
export function dealtBy(plan: Plan, t: number): number {
  return plan.slots.filter((s) => s.dealAt + T.dealSlide <= t).length;
}

/** The flip, 0 face down to 1 face up: one turn for everyone, ease-in-out (a turn: both ends matter). */
export function flipAt(plan: Plan, t: number): number {
  return plan.kind === 'round' ? easeInOutCubic((t - plan.flipAt) / T.flip) : 0;
}

/** Drumroll: every card trembles 2px and the camera dollies in 3%, which it keeps to the end. */
export function drumroll(plan: Plan, t: number): { tremble: number; dolly: number } {
  if (plan.kind !== 'round') return { tremble: 0, dolly: 0 };
  const start = plan.revealAt;
  const on = t >= start && t < plan.flipAt;
  return { tremble: on ? 2 : 0, dolly: 0.03 * easeInOutCubic((t - start) / T.drumroll) };
}

/** 35mm-equivalent: the vertical field of view of a 35mm lens on a 24mm-tall frame (as the fireworks). */
export const VFOV_DEG = (2 * Math.atan(12 / 35) * 180) / Math.PI;

export type FrameBox = { x: number; y: number; w: number; h: number };

/**
 * Where a chrome panel (the top bar) sits on the frame plane so it APPEARS at its picked frame position.
 * The camera dollies in `dolly` of its distance during and after the drumroll, which magnifies the whole
 * plane about the frame centre; the chrome is the gh#302 frame the fireworks reveal paints without any
 * camera move, so it is shrunk about that centre by exactly the magnification and lands where the board
 * puts it.
 */
export function chromeBox(box: FrameBox, dolly: number): FrameBox {
  const k = 1 - dolly;
  const w = box.w * k;
  const h = box.h * k;
  const cx = FRAME_W / 2 + (box.x + box.w / 2 - FRAME_W / 2) * k;
  const cy = FRAME_H / 2 + (box.y + box.h / 2 - FRAME_H / 2) * k;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Where a point of the frame plane lands on screen (css px) for a viewport and a dolly of the camera. */
export function frameToViewport(x: number, y: number, vp: { cssWidth: number; cssHeight: number }, dolly: number): [number, number] {
  const tanHalf = Math.tan((VFOV_DEG * Math.PI) / 360);
  const aspect = vp.cssWidth / Math.max(1, vp.cssHeight);
  const dist = Math.max(FRAME_H / 2 / tanHalf, FRAME_W / 2 / (tanHalf * aspect));
  const k = vp.cssHeight / 2 / (tanHalf * dist * (1 - dolly));
  return [vp.cssWidth / 2 + (x - FRAME_W / 2) * k, vp.cssHeight / 2 + (y - FRAME_H / 2) * k];
}

/** The veil over the field while the rule card is up: in with the card, out as it shrinks to the band. */
export function veilAt(plan: Plan, t: number): number {
  if (plan.kind !== 'round') return 0;
  const shrink = plan.ruleShownAt + T.ruleHold;
  if (t < shrink) return 0.78 * clamp01(t / T.veilIn);
  return 0.78 * (1 - clamp01((t - shrink) / T.ruleShrink));
}

export type RuleCardPose = { visible: boolean; cx: number; cy: number; scale: number; turn: number; opacity: number };

/** The rule card: flies in from above the frame, turns face up, holds, then shrinks into the band's centre.
 *  `turn` is 0 back up to 1 face up; `cy` is the card's centre for a card `height` tall. */
export function ruleCardAt(plan: Plan, t: number, height: number): RuleCardPose {
  const hidden = { visible: false, cx: 0, cy: 0, scale: 0, turn: 0, opacity: 0 };
  if (plan.kind !== 'round' || t >= plan.revealAt) return hidden;
  const cx = RULE_CARD.x + RULE_CARD.w / 2;
  const cy = RULE_CARD.y + height / 2;
  const fromY = -height;
  const fly = easeOutCubic(t / T.ruleFly);
  const turn = easeOutCubic((t - T.ruleFly) / T.ruleFlip);
  const shrinkFrom = plan.ruleShownAt + T.ruleHold;
  const shrink = easeOutCubic((t - shrinkFrom) / T.ruleShrink);
  const y = fromY + (cy - fromY) * fly;
  return {
    visible: true,
    cx,
    cy: y + (BAND_CY - y) * shrink,
    scale: (0.6 + 0.4 * fly) * (1 - 0.75 * shrink),
    turn,
    opacity: 1 - shrink,
  };
}

export type Centre = { kind: 'count'; value: number; gold: boolean } | { kind: 'rule'; label: string; rule: string };
export type Band = { left: string; centre: Centre; right: { kind: 'text'; text: string } | { kind: 'legend' } } | null;

/** The lower band at `t`. None while the rule card is up (frame cd-rule draws no band). */
export function bandAt(plan: Plan, t: number): Band {
  const n = plan.slots.length;
  if (plan.kind === 'deal') {
    return { left: COPY.dealt(dealtBy(plan, t)), centre: { kind: 'count', value: n, gold: false }, right: { kind: 'text', text: COPY.notDrawnYet } };
  }
  if (t < plan.revealAt) return null;
  if (t < plan.judgeAt) {
    return {
      left: COPY.allAtOnce,
      centre: { kind: 'rule', label: COPY.ruleLabel, rule: COPY.rule[plan.rule] },
      right: { kind: 'text', text: COPY.ruleInFull[plan.rule] },
    };
  }
  // The counter rolls linearly from the field to the kept count.
  const value = Math.round(n - (n - plan.kept) * clamp01((t - plan.countAt) / T.count));
  return { left: COPY.passedRound(plan.round), centre: { kind: 'count', value, gold: true }, right: { kind: 'legend' } };
}

export function topLabel(plan: Plan): string {
  return COPY.roundLabel(plan.round, ELIMINATION_ROUNDS);
}

export function topDots(plan: Plan): ('done' | 'on' | 'todo')[] {
  return Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i + 1 < plan.round ? 'done' : i + 1 === plan.round ? 'on' : 'todo'));
}

/** The ids the reveal shows passing, once judged: read from the slots, which read outcome.survivors. */
export function shownPassing(plan: Plan): string[] {
  return plan.slots.filter((s) => s.pass === true).map((s) => s.id);
}
