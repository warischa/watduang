// The ladder, built from the committed permutation (gh#307). Pure: no DOM, no three.
//
// A ladder is a sequence of rungs, each joining two adjacent lanes on its own row, read top to bottom.
// It is CONSTRUCTED to realize the permutation that was drawn and persisted before the reveal mounted:
// never generated at random and accepted for whatever it happens to produce. The construction goes through
// a cosmetic waypoint arrangement M: the adjacent swaps that turn the identity into M, then those that turn
// M into the target. Both halves are exact, so the product is the committed permutation whatever M is; M
// only makes ladders look alike in density (an identity permutation would otherwise draw no rungs at all).
// The reveal key picks M among those that keep the rung count in range, and spreads the rungs over the rows.

import { isFiveLanes } from '../../../prize-event/game-contract.ts';
import { randomFor } from '../../prize-fireworks/renderer/seed.ts';

export const LANES = 5;
/** Rows of the picked board's ladder (ld-reveal A draws 12; B shares its track). */
export const ROWS = 12;
/** Fewest rungs a ladder may show, so no reveal reads as five straight lines. */
export const MIN_RUNGS = 8;

/** A rung joins lane `left` and lane `left + 1` on row `row`. */
export type Rung = { row: number; left: number };
export type Crossing = { row: number; from: number; to: number };

/** Positions hold start lanes: arrangement[position] = the start lane that is there now. */
type Arrangement = number[];

/** Adjacent swaps (by their left position) that turn arrangement `from` into `to`, fewest possible. */
function swapsBetween(from: Arrangement, to: Arrangement): number[] {
  const cur = [...from];
  const out: number[] = [];
  for (let p = 0; p < LANES; p++) {
    let j = cur.indexOf(to[p]!);
    while (j > p) {
      [cur[j - 1], cur[j]] = [cur[j]!, cur[j - 1]!];
      out.push(j - 1);
      j--;
    }
  }
  return out;
}

function arrangements(xs: number[]): Arrangement[] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => arrangements([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

const IDENTITY: Arrangement = [0, 1, 2, 3, 4];
/** All 120 waypoints, in a fixed order, so a key always picks the same one. */
const WAYPOINTS = arrangements(IDENTITY);
const TO_WAYPOINT = WAYPOINTS.map((m) => swapsBetween(IDENTITY, m));
const candidatesFor = new Map<string, number[][]>();

/** Every legal swap sequence for a target arrangement: in range, and never one rung undoing the last. */
function candidates(target: Arrangement): number[][] {
  const memo = candidatesFor.get(target.join(''));
  if (memo) return memo;
  const out = WAYPOINTS.map((m, i) => [...TO_WAYPOINT[i]!, ...swapsBetween(m, target)]).filter(
    (seq) => seq.length >= MIN_RUNGS && seq.length <= ROWS && seq.every((left, i) => i === 0 || left !== seq[i - 1]),
  );
  if (!out.length) throw new Error('ladder: no legal ladder for this permutation');
  candidatesFor.set(target.join(''), out);
  return out;
}

/** The rungs, top row first, that send start lane s to permutation[s]. Throws on anything that is not a
 *  five-lane bijection -- never repairs one. */
export function buildLadder(permutation: readonly number[], key: string): Rung[] {
  if (!isFiveLanes(permutation)) throw new Error('ladder: permutation is not a five-lane bijection');
  // Where every start lane must end up: target[exit] = start.
  const target: Arrangement = new Array(LANES);
  permutation.forEach((exit, start) => {
    target[exit] = start;
  });
  const rand = randomFor(key, 'ladder');
  const options = candidates(target);
  const seq = options[Math.floor(rand() * options.length)]!;
  // A distinct row for every rung, kept in sequence order: a partial shuffle of the rows, then sorted.
  const rows = Array.from({ length: ROWS }, (_, i) => i);
  for (let i = 0; i < seq.length; i++) {
    const j = i + Math.floor(rand() * (ROWS - i));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  const picked = rows.slice(0, seq.length).sort((a, b) => a - b);
  return seq.map((left, i) => ({ row: picked[i]!, left }));
}

/** Where a start lane ends, following the rungs by their drawn row (not their array order), and each rung
 *  it crosses on the way. */
export function follow(rungs: readonly Rung[], start: number): { exit: number; crossings: Crossing[] } {
  let pos = start;
  const crossings: Crossing[] = [];
  for (const r of [...rungs].sort((a, b) => a.row - b.row)) {
    if (r.left === pos) {
      crossings.push({ row: r.row, from: pos, to: pos + 1 });
      pos += 1;
    } else if (r.left + 1 === pos) {
      crossings.push({ row: r.row, from: pos, to: pos - 1 });
      pos -= 1;
    }
  }
  return { exit: pos, crossings };
}
