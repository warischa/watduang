// The turn arithmetic of wire-snip-panic, lifted out of main.js so a node test can reach it (gh#162).
// main.js is a verbatim mockup body wrapped in a module: everything in it is reachable only through
// a browser and a real round, which is exactly why the losing rule had no test.
//
// This module owns ONE decision and states it here so the next reader does not have to re-derive it:
// a round ends either by clearing the sequence (the seat survived, the phone moves on) or by the
// bomb going off (the round is over, the phone does NOT move on). So the loser is whoever is holding
// it -- `loserOf` deliberately does not advance, and src/play/wire-snip-panic/turn-rules.test.mjs
// pins that against the off-by-one that blames the next seat.
//
// Pure on purpose: no DOM, no timers, no game object. main.js keeps its own mutable `game` and copies
// these three fields back, which is a smaller change than rewriting its state into a reducer.
export type TurnState = {
  /** Seat holding the bomb right now, zero-based. */
  currentPlayerIndex: number;
  /** How many turns have been survived since the match started. Also the rotation counter. */
  turnRotationIndex: number;
  /** Difficulty step, 1-based. Feeds the per-turn time limit. */
  roundLevel: number;
};

export const INITIAL_TURN_STATE: TurnState = Object.freeze({
  currentPlayerIndex: 0,
  turnRotationIndex: 0,
  roundLevel: 1,
});

/** A seat cleared its sequence: the phone moves to the next seat, and a COMPLETED rotation -- not
 *  every turn -- escalates the round. Escalating per turn would shorten a player's clock early. */
export function afterSurvivedTurn(state: TurnState, playerCount: number): TurnState {
  const turnRotationIndex = state.turnRotationIndex + 1;
  return {
    currentPlayerIndex: (state.currentPlayerIndex + 1) % playerCount,
    turnRotationIndex,
    roundLevel: turnRotationIndex % playerCount === 0 ? state.roundLevel + 1 : state.roundLevel,
  };
}

/** THE LOSING RULE. The bomb went off on this seat's turn, so this seat loses. No advance: the next
 *  player never touched a wire. */
export function loserOf(state: TurnState): number {
  return state.currentPlayerIndex;
}
