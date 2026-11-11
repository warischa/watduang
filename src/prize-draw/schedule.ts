// Pure cut-schedule logic for the prize draw: never touches DOM or storage.
// The schedule is a proposal only; the host may edit it before the start, so nothing downstream may assume
// a value came from here. The round code (round-code.ts) works for any keep count below the head count.

/** Number of elimination rounds before the final, and the size of that final. */
export const ELIMINATION_ROUNDS = 4;
export const FINAL_SIZE = 5;

// The 1-2-5 series: the round numbers a person would pick by hand (the owner's own example uses 100, 50, 20).
function niceNumbers(limit: number): number[] {
  const out: number[] = [];
  for (let decade = 1; decade <= limit; decade *= 10) {
    for (const m of [1, 2, 5]) if (m * decade <= limit) out.push(m * decade);
  }
  return out;
}

// A snapped value may sit at most this factor away from the geometric target, else the rounded target wins.
const MAX_SNAP_FACTOR = 1.6;

/**
 * Propose head counts for each stage: [n, after round 1, ..., after round 4 = the final of 5].
 * Each step aims at an even geometric shrink from the current count to 5 over the rounds still left,
 * then snaps to the nearest 1-2-5 number when one is close and still leaves room for the later rounds.
 */
export function proposeSchedule(n: number): number[] {
  const minimum = FINAL_SIZE + ELIMINATION_ROUNDS;
  if (!Number.isInteger(n) || n < minimum) {
    throw new RangeError(`a schedule of ${ELIMINATION_ROUNDS} rounds down to ${FINAL_SIZE} needs at least ${minimum} people, got ${n}`);
  }
  const schedule = [n];
  let current = n;
  for (let left = ELIMINATION_ROUNDS; left > 1; left--) {
    const target = current / (current / FINAL_SIZE) ** (1 / left);
    // Leave one distinct count for every round still to come, and shrink by at least one.
    const lo = FINAL_SIZE + (left - 1);
    const hi = current - 1;
    let pick = Math.min(hi, Math.max(lo, Math.round(target)));
    let bestDistance = Math.log(MAX_SNAP_FACTOR);
    for (const nice of niceNumbers(hi)) {
      if (nice < lo) continue;
      const distance = Math.abs(Math.log(nice / target));
      if (distance <= bestDistance) {
        bestDistance = distance;
        pick = nice;
      }
    }
    schedule.push(pick);
    current = pick;
  }
  schedule.push(FINAL_SIZE);
  return schedule;
}
