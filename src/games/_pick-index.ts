// Shared pure helper: pick one random index out of a roster. Extracted from pick-loser.ts
// (gh#154 deletes that game; short-stick.ts still needs this function, so it moved here first).

/** Picks one index out of the roster — returns the index, never a name, so callers stay safe
 *  against duplicate names in the roster */
export function pickLoser(players: readonly string[], rand: () => number = Math.random): number {
  if (players.length === 0) {
    throw new Error('pick-loser: ผู้เล่นว่างเปล่า — ต้องมีอย่างน้อย 1 คนถึงจะสุ่มได้');
  }
  return Math.floor(rand() * players.length);
}
