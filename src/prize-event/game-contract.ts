// The persisted game contract of the prize draw (gh#305): which 3D game each step uses, and what a
// committed round or final records for it. DOM-free and copy-free. Everything here is decided BEFORE any
// animation runs: a game module receives these facts and draws them, it never chooses them.
//
// event.ts stores these shapes as they are (payload v2: EventSetup.games, EventState.prepared, and the
// game-aware RoundRecord and FinalRecord); a stored v1 event reads back as their `game: null` members.

import type { Card, RuleId } from '../prize-draw/cards.ts';
import { ELIMINATION_ROUNDS, FINAL_SIZE } from '../prize-draw/schedule.ts';

export type GameId = 'fireworks' | 'cards' | 'ladder' | 'zones' | 'marbles' | 'envelopes' | 'flipcards';
export type Four<T> = readonly [T, T, T, T];
export type Five<T> = readonly [T, T, T, T, T];
export type Lane = 0 | 1 | 2 | 3 | 4;

/** What an elimination round may play. null is the plain 2D reveal. */
export type CutGame = 'fireworks' | 'cards' | 'zones' | 'marbles' | null;
/** What the final may play. null is the plain 2D result. */
export type FinalGame = 'fireworks' | 'ladder' | 'envelopes' | 'flipcards' | null;
/** The MC's picks, frozen when the event starts: one per elimination round, then the final. */
export type GameChoices = { rounds: Four<CutGame>; final: FinalGame };

/** A complete card deal: the rule pair on offer and every participant's card, in roster order. */
export type Deal = { pair: readonly [RuleId, RuleId]; cards: readonly { id: string; card: Card }[] };
/** A cards round whose deal is persisted and whose rule is not drawn yet. Refreshing never redeals it. */
export type CardsPrepared = { game: 'cards'; round: number; code: string; deal: Deal };

export type CutBase = { round: number; code: string; survivors: string[] };
/** A committed elimination round. `rule` indexes `deal.pair`. Survivors are in roster order. */
export type RoundRecord = CutBase & ({ game: null | 'fireworks' | 'zones' | 'marbles' } | { game: 'cards'; deal: Deal; rule: 0 | 1 });

/** The finals whose five finalists each pick one object (an envelope, a face-down card) before the draw. The
 *  pick is theatre (gh#299 decision 7): the order is the plain uniform draw, and the object a finalist picked
 *  opens to that finalist's own place. One shape serves both; only the object's look differs. */
export type PickFinal = 'envelopes' | 'flipcards';
export const PICK_FINALS: readonly PickFinal[] = ['envelopes', 'flipcards'];
export const isPickFinal = (x: unknown): x is PickFinal => (PICK_FINALS as readonly unknown[]).includes(x);

/** A committed final. `order` is first prize first. A ladder final also records how that order arose:
 *  `picks[lane]` is the finalist who chose start lane `lane`, `permutation[startLane] = exitLane`,
 *  `slotRanks[exitLane] = rank`, and ladderConsistent holds. A pick final records `picks[object]`, the finalist
 *  on object `object` (0..4, left to right), which the order never reads. Ranks at or past the prize count win
 *  nothing. */
export type FinalRecord = { order: string[] } & (
  | { game: null | 'fireworks' }
  | { game: 'ladder'; picks: Five<string>; permutation: Five<Lane>; slotRanks: Five<Lane> }
  | { game: PickFinal; picks: Five<string> }
);

export const CUT_GAMES: readonly Exclude<CutGame, null>[] = ['fireworks', 'cards', 'zones', 'marbles'];
export const FINAL_GAMES: readonly Exclude<FinalGame, null>[] = ['fireworks', 'ladder', 'envelopes', 'flipcards'];

/** Every step plays the plain 2D reveal: the default for an event created without picks. */
export const NO_GAMES: GameChoices = { rounds: [null, null, null, null], final: null };

export function isCutGame(x: unknown): x is CutGame {
  return x === null || (CUT_GAMES as readonly unknown[]).includes(x);
}

export function isFinalGame(x: unknown): x is FinalGame {
  return x === null || (FINAL_GAMES as readonly unknown[]).includes(x);
}

export function isGameChoices(x: unknown): x is GameChoices {
  if (typeof x !== 'object' || x === null) return false;
  const { rounds, final } = x as { rounds?: unknown; final?: unknown };
  return Array.isArray(rounds) && rounds.length === ELIMINATION_ROUNDS && rounds.every(isCutGame) && isFinalGame(final);
}

/** A bijection of the five lanes 0..4. */
export function isFiveLanes(x: unknown): x is Five<Lane> {
  if (!Array.isArray(x) || x.length !== FINAL_SIZE) return false;
  const seen = new Set<unknown>(x);
  return seen.size === FINAL_SIZE && x.every((v) => Number.isInteger(v) && v >= 0 && v < FINAL_SIZE);
}

/** The order a ladder produces: order[slotRanks[permutation[lane]]] = picks[lane]. Throws on a
 *  permutation or slot layout that is not a five-lane bijection -- never repairs one. */
export function ladderOrder(picks: readonly string[], permutation: readonly number[], slotRanks: readonly number[]): string[] {
  if (picks.length !== FINAL_SIZE) throw new Error(`ladder: ${picks.length} picks, not ${FINAL_SIZE}`);
  if (!isFiveLanes(permutation)) throw new Error('ladder: permutation is not a five-lane bijection');
  if (!isFiveLanes(slotRanks)) throw new Error('ladder: slotRanks is not a five-lane bijection');
  const order: string[] = new Array(FINAL_SIZE);
  picks.forEach((id, lane) => {
    order[slotRanks[permutation[lane]!]!] = id;
  });
  return order;
}

/** Does a ladder final's recorded order follow from its picks, permutation and slot layout? */
export function ladderConsistent(rec: {
  order: readonly string[];
  picks: readonly string[];
  permutation: readonly number[];
  slotRanks: readonly number[];
}): boolean {
  if (new Set(rec.picks).size !== FINAL_SIZE) return false;
  if (!isFiveLanes(rec.permutation) || !isFiveLanes(rec.slotRanks)) return false;
  const order = ladderOrder(rec.picks, rec.permutation, rec.slotRanks);
  return rec.order.length === FINAL_SIZE && order.every((id, rank) => rec.order[rank] === id);
}

/** The game a committed record was played with. */
export function recordGame(rec: RoundRecord | FinalRecord): GameId | null {
  return rec.game;
}
