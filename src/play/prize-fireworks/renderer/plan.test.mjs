// The fireworks reveal's pure timeline (gh#305): beats in order for both modes, every lantern that goes
// dark is one the committed round eliminated (and only those), the last rocket up holds first prize, and
// an outcome the module could only draw by inventing something is refused rather than drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as plan from './plan.ts';

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `N${i}` }));

function roundInput(n, keep, { key = 'ev|r1|CODE', round = 1 } = {}) {
  const ps = people(n);
  // A scattered survivor set, in roster order: i -> i * k mod n is a bijection when k is coprime to n.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const k = [7, 11, 13, 17, 19].find((m) => gcd(m, n) === 1);
  const survivors = ps.filter((_, i) => (i * k) % n < keep).map((p) => p.id);
  assert.equal(survivors.length, keep, 'fixture: the survivor set is not the size asked for');
  return { key, eventName: 'E', people: ps, outcome: { kind: 'round', game: 'fireworks', round, code: 'C', survivors } };
}

function finalInput(prizes = ['A', 'B', 'C', 'D', 'E'], order = ['p3', 'p0', 'p4', 'p1', 'p2']) {
  return { key: 'ev|final', eventName: 'E', people: people(5), outcome: { kind: 'final', game: 'fireworks', prizes, order } };
}

const events = (p) => plan.beatsIn(p, -1, p.total);

test('elimination: five cut beats in time order, then complete at the end', () => {
  const p = plan.planFor(roundInput(196, 100));
  const evs = events(p);
  assert.deepEqual(evs.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type)), ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'cut:4', 'complete']);
  const ats = p.beats.map((b) => b.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b));
  assert.equal(p.burstAt[0], plan.T.countdown + plan.T.launch, 'the first burst is not right after the countdown and launch');
  assert.equal(p.total, plan.T.countdown + plan.T.launch + 5 * plan.T.slot + plan.T.count + plan.T.settle);
});

test('elimination: exactly the eliminated go dark, each once, nearest its burst first; survivors never do', () => {
  const input = roundInput(196, 100);
  const p = plan.planFor(input);
  const kept = new Set(input.outcome.survivors);
  for (const l of p.lanterns) {
    assert.equal(l.out, !kept.has(l.id), l.id);
    if (l.out) assert.ok(l.group >= 0 && l.group < 5 && l.dimAt !== null, `${l.id} never dims`);
    else assert.equal(l.dimAt, null, `${l.id} passed and still dims`);
  }
  for (let g = 0; g < 5; g++) {
    const group = p.lanterns.filter((l) => l.group === g);
    const times = group.map((l) => l.dimAt);
    for (const t of times) {
      assert.ok(t >= p.burstAt[g] + plan.T.burstExpand, 'a lantern dimmed before its burst');
      assert.ok(t + plan.T.dim <= p.burstAt[g] + plan.T.slot, 'a lantern was still dimming after its wave');
    }
    const [bx, by] = plan.BURSTS[g];
    const cells = plan.nominalCells(input.people.length);
    const byTime = [...group].sort((a, b) => a.dimAt - b.dimAt).map((l) => Math.hypot(cells[l.index].cx - bx, cells[l.index].cy - by));
    assert.deepEqual(byTime, [...byTime].sort((a, b) => a - b), `group ${g} is not nearest first`);
  }
  assert.equal(plan.litCountAt(p, 0), 196);
  assert.equal(plan.litCountAt(p, p.total), 100, 'the field ends on a count other than the survivors');
});

test('elimination: a big cut squeezes its stagger into the wave instead of overrunning it', () => {
  const p = plan.planFor(roundInput(200, 5));
  for (const l of p.lanterns.filter((x) => x.out)) assert.ok(l.dimAt + plan.T.dim <= p.burstAt[l.group] + plan.T.slot);
  assert.equal(plan.litCountAt(p, p.total), 5);
});

test('elimination: the low band steps 10 to 0, counts the bursts, then names the round', () => {
  const p = plan.planFor(roundInput(196, 100, { round: 3 }));
  const nums = [0, 999, 1000, 9500, 10000, 10500].map((t) => plan.lowBand(p, t).figure);
  assert.deepEqual(nums.map((f) => f.value), [10, 10, 9, 1, 0, 0]);
  assert.ok(nums[0].scale > 1.14 && nums[1].scale === 1, 'the numeral does not settle from 1.15 to 1');
  assert.equal(plan.lowBand(p, 0).left, 'ทั้งห้องนับพร้อมกัน');
  assert.deepEqual(plan.lowBand(p, 0).right, { kind: 'text', text: 'ถึง 0 แล้วพลุจะขึ้น' });
  const third = plan.lowBand(p, p.burstAt[2] + 1);
  assert.equal(third.left, 'พลุลูกที่ 3 จาก 5');
  assert.deepEqual(third.right, { kind: 'text', text: 'โคมที่ดับ คือชื่อที่ไม่ผ่าน' });
  assert.equal(third.figure.kind, 'count');
  const end = plan.lowBand(p, p.total);
  assert.equal(end.left, 'ผ่านรอบที่ 3');
  assert.deepEqual(end.right, { kind: 'legend' });
  assert.deepEqual(end.figure, { kind: 'count', value: 100 });
});

test('final: five prize beats, fifth prize first, then complete; the last rocket up holds first prize', () => {
  const input = finalInput();
  const p = plan.planFor(input);
  const evs = events(p);
  assert.deepEqual(evs.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type)), ['prize:4', 'prize:3', 'prize:2', 'prize:1', 'prize:0', 'complete']);
  const lastLane = p.burstOrder.at(-1);
  assert.equal(p.lanes[lastLane].id, input.outcome.order[0], 'the last rocket up is not the first-prize winner');
  for (const lane of p.lanes) assert.equal(input.outcome.order[lane.rank], lane.id, `lane ${lane.lane} drew a rank it was not given`);
  const times = p.burstOrder.map((l) => p.lanes[l].burstAt);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(p.lanes[lastLane].burstY <= Math.min(...p.lanes.map((l) => l.burstY)), 'the last rocket is not the highest');
});

test('final: lanes keep roster order, whatever the committed order', () => {
  const p = plan.planFor(finalInput());
  assert.deepEqual(p.lanes.map((l) => l.id), ['p0', 'p1', 'p2', 'p3', 'p4']);
});

test('final: ranks past the prize count win nothing on the plate', () => {
  const p = plan.planFor(finalInput(['TV', '']));
  const byRank = Object.fromEntries(p.lanes.map((l) => [l.rank, l]));
  assert.equal(byRank[0].plateLabel, 'รางวัลที่ 1');
  assert.equal(byRank[1].plateLabel, 'รางวัลที่ 2');
  for (const r of [2, 3, 4]) assert.equal(byRank[r].plateLabel, plan.COPY.noPrize);
  assert.deepEqual(p.winners, [
    { place: 1, line: 'รางวัลที่ 1 · TV', id: 'p3' },
    { place: 2, line: 'รางวัลที่ 2', id: 'p0' },
  ]);
});

test('an outcome the module cannot draw faithfully is refused, never repaired', () => {
  const stranger = roundInput(10, 4);
  stranger.outcome = { ...stranger.outcome, survivors: [...stranger.outcome.survivors, 'nobody'] };
  assert.throws(() => plan.planFor(stranger), /survivor/);
  const twice = roundInput(10, 4);
  twice.outcome = { ...twice.outcome, survivors: ['p0', 'p0'] };
  assert.throws(() => plan.planFor(twice), /survivor/);
  assert.throws(() => plan.planFor(finalInput(['A'], ['p0', 'p1', 'p2', 'p3', 'p3'])), /order/);
  assert.throws(() => plan.planFor(finalInput(['A'], ['p0', 'p1', 'p2', 'p3', 'x'])), /order/);
  assert.throws(() => plan.planFor(finalInput([], ['p0', 'p1', 'p2', 'p3', 'p4'])), /prize/);
  assert.throws(() => plan.planFor({ ...finalInput(), outcome: { ...finalInput().outcome, game: 'ladder' } }), /fireworks/);
});

test('cosmetic choices follow the key: the same key replays, another key differs', () => {
  const a = plan.planFor(finalInput());
  const b = plan.planFor(finalInput());
  const c = plan.planFor({ ...finalInput(), key: 'other' });
  assert.deepEqual(a.lanes.map((l) => l.burstY), b.lanes.map((l) => l.burstY));
  assert.notDeepEqual(a.lanes.map((l) => l.burstY), c.lanes.map((l) => l.burstY));
});

test('the measured field: a wrapped row grows, the field stays centred, nominal rows match the grouping cells', () => {
  const nominal = plan.nominalCells(20);
  const flat = plan.fieldLayout(20, [27, 27, 27]);
  flat.forEach(([cx, cy], i) => assert.deepEqual([cx, cy], [nominal[i].cx, nominal[i].cy]));
  const grown = plan.fieldLayout(20, [27, 36, 27]);
  assert.equal(grown[8][3], 36);
  assert.equal(grown[0][1] - 27 / 2 + (grown[16][1] + 27 / 2) , 2 * (plan.FIELD.top + plan.FIELD.height / 2), 'not centred');
});

test('beatsIn is half open: each beat is reported once across consecutive ticks', () => {
  const p = plan.planFor(roundInput(30, 10));
  const seen = [];
  let prev = -1;
  for (let t = 0; t <= p.total + 50; t += 17) {
    seen.push(...plan.beatsIn(p, prev, t));
    prev = t;
  }
  assert.equal(seen.length, 6);
});
