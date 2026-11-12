// What the projector screen shows for an event at its current position, as data. DOM-free and copy-free:
// the Thai words live with the renderer (src/play/_prize-reveal/), the facts live here, so the 2D reveal
// and the 3D games that fall back to it (gh#305-gh#307) read one shape and cannot disagree on who passed.

import { ELIMINATION_ROUNDS } from '../prize-draw/schedule.ts';
import { liveIds, position, winners, type EventState } from './event.ts';

export type Mark = 'live' | 'in' | 'out';
export type Chip = { id: string; name: string; mark: Mark };
/** One dot per elimination round, then the final's pill: done, the current one, or still to come. */
export type Dot = 'done' | 'on' | 'todo';
export type Winner = { place: number; prize: string; name: string };

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
      /** The game the MC picked for this round; null while every reveal is the plain 2D one. */
      game: string | null;
    }
  | { kind: 'reveal'; eventName: string; round: number; rounds: number; dots: Dot[]; chips: Chip[]; passed: number; game: string | null }
  | { kind: 'final'; eventName: string; dots: Dot[]; chips: Chip[] }
  | { kind: 'result'; eventName: string; winners: Winner[] };

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
      return {
        kind: 'result',
        eventName,
        winners: winners(state).map((w) => ({ place: w.index + 1, prize: w.prize, name: w.person.name })),
      };
    }
    return { kind: 'final', eventName, dots: dots(ELIMINATION_ROUNDS + 1), chips: live.map((id) => chip(id, 'live')) };
  }
  const { round } = pos;
  const to = state.setup.schedule[round]!;
  if (pos.at === 'revealed') {
    const kept = new Set(state.rounds[round - 1]!.survivors);
    return {
      kind: 'reveal',
      eventName,
      round,
      rounds: ELIMINATION_ROUNDS,
      dots: dots(round),
      chips: live.map((id) => chip(id, kept.has(id) ? 'in' : 'out')),
      passed: kept.size,
      game: null,
    };
  }
  return {
    kind: 'round',
    eventName,
    round,
    rounds: ELIMINATION_ROUNDS,
    dots: dots(round),
    chips: live.map((id) => chip(id, 'live')),
    from: live.length,
    to,
    game: null,
  };
}
