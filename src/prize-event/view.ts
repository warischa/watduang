// What the projector screen shows for an event at its current position, as data. DOM-free and copy-free:
// the Thai words live with the renderer (src/play/_prize-reveal/), the facts live here, so the 2D reveal
// and the 3D games that fall back to it (gh#305-gh#307) read one shape and cannot disagree on who passed.

import { ELIMINATION_ROUNDS } from '../prize-draw/schedule.ts';
import { FINAL_ROUND, hostFinalCode } from '../prize-draw/round-code.ts';
import { liveIds, position, winners, type EventState } from './event.ts';
import type { GameId } from './game-contract.ts';
import type { RuleId } from '../prize-draw/cards.ts';
import { PIN } from './qr-event.ts';

export type Mark = 'live' | 'in' | 'out';
export type Chip = { id: string; name: string; mark: Mark };
/** One dot per elimination round, then the final's pill: done, the current one, or still to come. */
export type Dot = 'done' | 'on' | 'todo';
export type Winner = { place: number; prize: string; name: string };
/** One round's code: the round it belongs to (FINAL_ROUND for the final) and its digits, as a phone types it.
 *  A card round in the history also carries the rule its main screen drew: a latecomer must tap it. */
export type RoundCode = { round: number; digits: string; rule?: RuleId };
/** A round code the projector shows in QR mode (gh#309), with every earlier round's code in round order, so a
 *  phone that missed one can still type them all (gh#300 condition 1, owner ruling 2026-11-14). */
export type ShownCode = RoundCode & { earlier: RoundCode[] };

export type ScreenView =
  | {
      kind: 'round';
      eventName: string;
      round: number;
      rounds: number;
      dots: Dot[];
      chips: Chip[];
      from: number;
      to: number;
      /** The game the MC picked for this round; null for a plain 2D round. The renderer names it. */
      game: GameId | null;
      /** QR mode, a card round dealt: the deal code, so each phone sees its card before the rule. */
      code?: ShownCode;
    }
  | {
      kind: 'reveal';
      eventName: string;
      round: number;
      rounds: number;
      dots: Dot[];
      chips: Chip[];
      passed: number;
      game: GameId | null;
      /** QR mode, a cut round: its code. A card round showed its code at the deal, and shows none here. */
      code?: ShownCode;
    }
  | { kind: 'final'; eventName: string; dots: Dot[]; chips: Chip[] }
  | {
      kind: 'result';
      eventName: string;
      winners: Winner[];
      /** QR mode: the final's code, absent when no seed encodes the order (round-code.ts hostFinalCode). */
      code?: ShownCode;
      /** QR mode: winners claim on their phones, so the board's claim line is drawn. */
      claim?: true;
      /** QR mode: the final's code again, kept in small type once the MC closes its card (owner pick
       *  PD-309-11, 2026-11-14), since no later card lists it. */
      finalCode?: RoundCode;
    };

/** The codes of the rounds before `round`, in round order: each committed round's code (a card round's is its
 *  deal code, the one its phones typed). */
const earlierCodes = (state: EventState, round: number): RoundCode[] =>
  state.rounds
    .filter((r) => r.round < round)
    .map((r) => (r.game === 'cards' ? { round: r.round, digits: r.code, rule: r.deal.pair[r.rule] } : { round: r.round, digits: r.code }));
const shown = (state: EventState, round: number, digits: string): ShownCode => ({ round, digits, earlier: earlierCodes(state, round) });

/** A QR-mode event: its key is the join server's PIN (ADR-0076 Identity); an admin-mode key never is. */
export const isQrEvent = (state: EventState): boolean => PIN.test(state.eventKey);

// hostFinalCode scans seeds, so the result's code is kept per (key, order): a screen renders it many times.
let finalMemo: { key: string; code: string | null } | null = null;
function finalCode(state: EventState): string | null {
  const order = state.final?.order ?? [];
  // The final code carries the prize count (ADR-0079), so a phone placed past it is told it holds none.
  const prizes = state.setup.prizes.length;
  const key = JSON.stringify([state.eventKey, order, prizes]);
  if (finalMemo?.key !== key) {
    let code: string | null = null;
    try {
      code = hostFinalCode(state.eventKey, order, prizes);
    } catch {
      // An order that is not a final of FINAL_SIZE distinct ids encodes nothing: no code is shown.
    }
    finalMemo = { key, code };
  }
  return finalMemo.code;
}

function dots(current: number): Dot[] {
  // current: 1..4 for a round, ELIMINATION_ROUNDS + 1 for the final.
  return Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i + 1 < current ? 'done' : i + 1 === current ? 'on' : 'todo'));
}

export function screenView(state: EventState): ScreenView {
  const pos = position(state);
  const eventName = state.setup.eventName;
  const names = new Map(state.setup.people.map((p) => [p.id, p.name]));
  const chip = (id: string, mark: Mark): Chip => ({ id, name: names.get(id)!, mark });
  const live = liveIds(state);
  if (pos.kind === 'final') {
    if (pos.at === 'revealed') {
      const result: ScreenView = {
        kind: 'result',
        eventName,
        winners: winners(state).map((w) => ({ place: w.index + 1, prize: w.prize, name: w.person.name })),
      };
      if (!isQrEvent(state)) return result;
      const code = finalCode(state);
      return {
        ...result,
        claim: true,
        ...(code === null ? {} : { code: shown(state, FINAL_ROUND, code), finalCode: { round: FINAL_ROUND, digits: code } }),
      };
    }
    return { kind: 'final', eventName, dots: dots(ELIMINATION_ROUNDS + 1), chips: live.map((id) => chip(id, 'live')) };
  }
  const { round } = pos;
  const to = state.setup.schedule[round]!;
  if (pos.at === 'revealed') {
    const record = state.rounds[round - 1]!;
    const kept = new Set(record.survivors);
    return {
      kind: 'reveal',
      eventName,
      round,
      rounds: ELIMINATION_ROUNDS,
      dots: dots(round),
      chips: live.map((id) => chip(id, kept.has(id) ? 'in' : 'out')),
      passed: kept.size,
      game: record.game,
      ...(isQrEvent(state) && record.game !== 'cards' ? { code: shown(state, round, record.code) } : {}),
    };
  }
  const dealt = state.prepared?.game === 'cards' && state.prepared.round === round ? state.prepared.code : null;
  return {
    kind: 'round',
    eventName,
    round,
    rounds: ELIMINATION_ROUNDS,
    dots: dots(round),
    chips: live.map((id) => chip(id, 'live')),
    from: live.length,
    to,
    game: state.setup.games.rounds[round - 1]!,
    ...(isQrEvent(state) && dealt !== null ? { code: shown(state, round, dealt) } : {}),
  };
}
