// What the ladder reveal displays, derived from the ladder it builds (gh#307). The slot table is what the
// scene paints on each prize slot, so every count here is re-derived from the display, never from the
// domain helper: ladderOrder only builds a consistent committed record to mount.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ladderOrder } from '../../../prize-event/game-contract.ts';
import { COPY } from './copy.ts';
import { RIG, TRACK, planFor, project, slotName, unproject } from './plan.ts';

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

const PERMS = permutations([0, 1, 2, 3, 4]);
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'พัดลม', ''];
const PEOPLE = ['p0', 'p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, name: `ชื่อ ${i}` }));

function inputFor(perm, slotRanks, nPrizes, picks = ['p2', 'p0', 'p4', 'p1', 'p3'], key = 'e|final') {
  return {
    key,
    eventName: 'งาน',
    people: PEOPLE,
    viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 },
    reducedMotion: false,
    claim: false,
    outcome: {
      kind: 'final',
      game: 'ladder',
      prizes: PRIZES.slice(0, nPrizes),
      picks,
      permutation: perm,
      slotRanks,
      order: ladderOrder(picks, perm, slotRanks),
    },
  };
}

const nameOf = (id) => PEOPLE.find((p) => p.id === id).name;

test('every permutation x every slot layout x 1 to 5 prizes: each slot shows order[rank], ranks past the count show no prize', () => {
  let slotsChecked = 0;
  let noPrize = 0;
  let cases = 0;
  const names = new Map(PEOPLE.map((p) => [p.id, p.name]));
  for (const perm of PERMS) {
    for (const slotRanks of PERMS) {
      for (let n = 1; n <= 5; n++) {
        const input = inputFor(perm, slotRanks, n, undefined, `k${cases % 7}`);
        const plan = planFor(input);
        cases++;
        assert.equal(plan.slots.length, 5);
        for (const slot of plan.slots) {
          const rank = slotRanks[slot.exit];
          assert.equal(slot.rank, rank);
          // The contract equation: order[slotRanks[permutation[lane]]] = picks[lane].
          assert.equal(slotName(slot, names), nameOf(input.outcome.order[rank]), `perm ${perm} slots ${slotRanks} exit ${slot.exit}`);
          if (rank < n) {
            assert.equal(slot.prize, true);
            assert.equal(slot.label, COPY.prizeLabel(rank + 1));
            assert.equal(slot.line, PRIZES[rank]);
          } else {
            assert.equal(slot.prize, false);
            assert.equal(slot.label, COPY.noPrize);
            assert.equal(slot.line, COPY.noPrizeLine);
            noPrize++;
          }
          slotsChecked++;
        }
        // The result frame names the same people, rank by rank, from the slots.
        assert.equal(plan.result.spot.id, input.outcome.order[0]);
        plan.result.cards.forEach((card, i) => {
          assert.equal(card.id, input.outcome.order[i + 1]);
          assert.equal(card.none, i + 1 >= n);
          assert.equal(card.line, i + 1 < n ? COPY.prizeLine(i + 2, PRIZES[i + 1]) : COPY.noPrize);
        });
      }
    }
  }
  assert.equal(cases, 72000);
  assert.equal(slotsChecked, 360000);
  // Per layout and permutation, 5 - n slots win nothing: (4+3+2+1+0) x 14400.
  assert.equal(noPrize, 144000);
});

test('lane independence: for a fixed picks assignment and slot layout, each finalist lands on each rank 24 times in 120', () => {
  const pickSets = [
    ['p0', 'p1', 'p2', 'p3', 'p4'],
    ['p4', 'p3', 'p2', 'p1', 'p0'],
    ['p2', 'p0', 'p4', 'p1', 'p3'],
  ];
  let tallies = 0;
  for (const picks of pickSets) {
    for (const slotRanks of PERMS) {
      const counts = new Map(picks.map((id) => [id, [0, 0, 0, 0, 0]]));
      for (const perm of PERMS) {
        const plan = planFor(inputFor(perm, slotRanks, 3, picks));
        // Read off the display: which finalist the slot of each rank names.
        for (const slot of plan.slots) counts.get(slot.id)[slot.rank]++;
      }
      for (const [id, byRank] of counts) assert.deepEqual(byRank, [24, 24, 24, 24, 24], `picks ${picks} slots ${slotRanks} ${id}`);
      tallies++;
    }
  }
  assert.equal(tallies, 360);
});

test('beats: cut as each light sets off, prize (its rank) as it lands, complete last; times strictly increase', () => {
  const plan = planFor(inputFor([3, 0, 4, 1, 2], [2, 0, 4, 1, 3], 3));
  const tags = plan.beats.map((b) => (b.event.type === 'beat' ? `${b.event.beat}:${b.event.index}` : b.event.type));
  const expected = [];
  plan.travels.forEach((tr, k) => expected.push(`cut:${k}`, `prize:${plan.slots[tr.exit].rank}`));
  expected.push('complete');
  assert.deepEqual(tags, expected);
  assert.equal(plan.travels.length, 5);
  for (let i = 1; i < plan.beats.length; i++) assert.ok(plan.beats[i].at > plan.beats[i - 1].at);
  assert.equal(plan.beats.at(-1).at, plan.total);
});

test('lights run in roster order, one at a time, each along its own path from its start lane to its exit', () => {
  const input = inputFor([3, 0, 4, 1, 2], [2, 0, 4, 1, 3], 2);
  const plan = planFor(input);
  assert.deepEqual(plan.travels.map((t) => t.id), ['p0', 'p1', 'p2', 'p3', 'p4']);
  plan.travels.forEach((tr, k) => {
    assert.equal(tr.style, k);
    assert.equal(input.outcome.picks[tr.start], tr.id);
    assert.equal(input.outcome.permutation[tr.start], tr.exit);
    if (k > 0) assert.ok(tr.startAt >= plan.travels[k - 1].arriveAt, 'a light set off before the last one landed');
    const pts = tr.points;
    assert.deepEqual(pts[0], { lane: tr.start, u: 0 });
    assert.deepEqual(pts.at(-1), { lane: tr.exit, u: 1 });
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const across = a.u === b.u && Math.abs(a.lane - b.lane) === 1;
      const down = a.lane === b.lane && b.u > a.u;
      assert.ok(across || down, `segment ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    }
  });
});

test('a record the module could only draw by inventing is refused', () => {
  const ok = inputFor([3, 0, 4, 1, 2], [2, 0, 4, 1, 3], 3);
  const swapped = structuredClone(ok);
  [swapped.outcome.order[0], swapped.outcome.order[1]] = [swapped.outcome.order[1], swapped.outcome.order[0]];
  assert.throws(() => planFor(swapped), /order/);
  const stranger = structuredClone(ok);
  stranger.people = PEOPLE.slice(1);
  assert.throws(() => planFor(stranger), /finalist/);
  for (const n of [0, 6]) {
    const bad = structuredClone(ok);
    bad.outcome.prizes = Array.from({ length: n }, () => 'x');
    assert.throws(() => planFor(bad), /prizes/);
  }
  const other = structuredClone(ok);
  other.outcome.game = 'fireworks';
  assert.throws(() => planFor(other), /another game/);
});

test('the rig reproduces the picked frame: lane ends land where the board draws them', () => {
  for (let lane = 0; lane < 5; lane++) {
    const near = project(RIG.laneWorld(lane, 0));
    const far = project(RIG.laneWorld(lane, 1));
    assert.ok(Math.abs(near.x - (240 + 360 * lane)) < 0.01 && Math.abs(near.y - 930) < 0.01, `near ${lane}: ${near.x},${near.y}`);
    assert.ok(Math.abs(far.x - (564 + 198 * lane)) < 0.01 && Math.abs(far.y - 290) < 0.01, `far ${lane}: ${far.x},${far.y}`);
  }
  const p = unproject(280, 226, RIG.farDepth);
  const back = project(p);
  assert.ok(Math.abs(back.x - 280) < 1e-6 && Math.abs(back.y - 226) < 1e-6);
  assert.ok(Math.abs(back.depth - RIG.farDepth) < 1e-9);
});

// The rails the room follows (PD-307-04): the board's #d9d6f0 at 50% alpha over the night ground #1c1b3e,
// pre-composited. At the earlier 35% the painted rail was under WCAG 1.4.11's 3:1 for graphics.
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the rails are the board ink at 50% alpha over the ground, and read at 3:1 or more', () => {
  const ink = channels('#d9d6f0');
  const ground = channels('#1c1b3e');
  const half = ink.map((c, i) => Math.round((c + ground[i]) / 2));
  const laneRgb = channels(TRACK.lane);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(laneRgb[i] - half[i]) <= 1, `lane channel ${i}: ${laneRgb[i]} vs 50% of the ink ${half[i]}`);
  assert.equal(TRACK.lane, '#7a7897', 'the board arithmetic for the picked rail');
  const ratio = contrast(TRACK.lane, '#1c1b3e');
  assert.ok(ratio >= 3, `rail contrast ${ratio.toFixed(2)}:1 is under 3:1`);
});
