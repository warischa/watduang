// The zones reveal's pure plan (gh#315): the names the picture leaves standing are exactly the round record's
// survivors and exactly what each phone computes from the round codes alone, at 200, 52 and 37 heads, every
// round, through the real event code; a plan that disagrees is refused, never repaired; and the zone a name
// sits in never depends on who survives (gh#299 decision 7), so a zone tells nobody anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as plan from './plan.ts';
import { advance, createEvent, drawNext, liveIds, revealDrawn } from '../../../prize-event/event.ts';
import { phoneVerdicts } from '../../../prize-draw/round-code.ts';
import { ELIMINATION_ROUNDS, proposeSchedule } from '../../../prize-draw/schedule.ts';

function seeded(seed) {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float,
    int: (n) => Math.floor(float() * n),
    hex: (bytes) => Array.from({ length: bytes }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join(''),
  };
}

// QR mode, as the join server issues it: a 6-digit PIN as the event key, server join ids as identities. A phone
// holds exactly those two plus the round codes.
const PIN = '048213';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const serverId = (i) => B64[i >> 6] + B64[i & 63] + Array.from({ length: 20 }, (_, k) => B64[(i * 7 + k * 13) % 64]).join('');
const roster = (n) => Array.from({ length: n }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
const ALL_ZONES = { rounds: ['zones', 'zones', 'zones', 'zones'], final: null };

/** Every elimination round of an all-zones QR event, with the reveal input the projector builds for it. */
function walk(n) {
  const rng = seeded(n * 31 + 7);
  const people = roster(n);
  const schedule = proposeSchedule(n);
  let s = createEvent(
    { eventName: 'Party', names: people.map((p) => p.name), schedule, prizes: ['TV'], games: ALL_ZONES, qr: { pin: PIN, roster: people } },
    rng,
  );
  const byId = new Map(s.setup.people.map((p) => [p.id, p]));
  const steps = [];
  for (let r = 1; r <= ELIMINATION_ROUNDS; r++) {
    s = revealDrawn(drawNext(s, rng));
    const rec = s.rounds[r - 1];
    const field = liveIds(s).map((id) => byId.get(id));
    steps.push({
      round: r,
      schedule,
      rec,
      entries: s.rounds.map((x) => ({ code: x.code })),
      input: { key: `${s.eventKey}:round${r}:${rec.code}`, eventName: 'Party', outcome: { kind: 'round', ...rec }, people: field },
    });
    s = advance(s, rng);
  }
  return steps;
}

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `N${i}` }));
const roundInput = (ps, survivors, { round = 1, code = 'C', key = `ev:round${round}:${code}` } = {}) => ({
  key,
  eventName: 'E',
  people: ps,
  outcome: { kind: 'round', game: 'zones', round, code: 'C', survivors },
});

test('draw equality: at 200, 52 and 37 heads, every round shows exactly the record and exactly the phones', () => {
  let rounds = 0;
  let wrongKeyDisagrees = 0;
  for (const n of [200, 52, 37]) {
    for (const { round, schedule, rec, entries, input } of walk(n)) {
      const label = `${n} heads, round ${round}`;
      assert.equal(rec.game, 'zones', `${label}: the event did not record the zones game`);
      assert.equal(input.people.length, schedule[round - 1], `${label}: the reveal was not handed the pre-cut field`);
      const shown = plan.projectOutcome(input);
      assert.deepEqual(shown, rec.survivors, `${label}: the picture leaves standing someone other than the record`);
      assert.equal(shown.length, schedule[round], `${label}: the picture keeps a count other than the schedule`);
      const standing = new Set(shown);
      const p = plan.planFor(input);
      const end = new Map(p.chips.map((c) => [c.id, plan.chipStateAt(c, p.total)]));
      for (const { id } of input.people) {
        const phone = phoneVerdicts(PIN, id, entries, 'confirmed').verdicts[round - 1];
        assert.equal(phone === 'in', standing.has(id), `${label}: phone and projector disagree for ${id}`);
        assert.equal(end.get(id), standing.has(id) ? 'in' : 'out', `${label}: ${id} ends in the wrong pose`);
        if (phoneVerdicts('048214', id, entries, 'confirmed').verdicts[round - 1] !== phone) wrongKeyDisagrees++;
      }
      rounds++;
    }
  }
  assert.equal(rounds, 12, 'not every round of the three events was checked');
  assert.ok(wrongKeyDisagrees > 0, 'the key does not matter: the phone comparison proves nothing');
});

test('a plan whose picture disagrees with the record is refused, never repaired', () => {
  const [{ input }] = walk(52);
  const good = plan.planFor(input);
  assert.doesNotThrow(() => plan.checkPlan(good, input));
  const flipped = structuredClone(good);
  flipped.chips[0].pass = !flipped.chips[0].pass;
  assert.throws(() => plan.checkPlan(flipped, input), /survivor/);
  // Same count, two fates swapped: a count-only check would pass this.
  const swapped = structuredClone(good);
  const a = swapped.chips.find((c) => c.pass);
  const b = swapped.chips.find((c) => !c.pass);
  a.pass = false;
  b.pass = true;
  assert.throws(() => plan.checkPlan(swapped, input), /survivor/);
  const dropped = structuredClone(good);
  dropped.chips.pop();
  assert.throws(() => plan.checkPlan(dropped, input), /chip/);
  const moved = structuredClone(good);
  moved.chips[0].zone = (moved.chips[0].zone + 1) % plan.ZONE_COUNT;
  assert.throws(() => plan.checkPlan(moved, input), /zone/);
});

test('an outcome the module cannot draw faithfully is refused', () => {
  const ps = people(12);
  const ok = roundInput(ps, ['p1', 'p4', 'p7']);
  assert.doesNotThrow(() => plan.planFor(ok));
  const o = ok.outcome;
  assert.throws(() => plan.planFor({ ...ok, outcome: { ...o, survivors: [...o.survivors, 'nobody'] } }), /survivor/);
  assert.throws(() => plan.planFor({ ...ok, outcome: { ...o, survivors: ['p1', 'p1'] } }), /survivor/);
  assert.throws(() => plan.planFor({ ...ok, people: [...ps, ps[0]] }), /twice/);
  assert.throws(() => plan.planFor({ ...ok, outcome: { ...o, game: 'fireworks' } }), /zones/);
  assert.throws(() => plan.planFor({ ...ok, outcome: { ...o, kind: 'final' } }), /round/);
  assert.throws(() => plan.planFor({ ...ok, outcome: { ...o, round: 5 } }), /round/);
});

test('zone assignment never reads the draw: any survivors, any code give every name the same zone, slot and moment', () => {
  // The signature itself takes no code and no outcome: event key, round, live field.
  assert.equal(plan.zoneAssignment.length, 3);
  const ps = people(52);
  const scatter = (keep, k) => ps.filter((_, i) => (i * k) % 52 < keep).map((p) => p.id);
  const draws = [scatter(20, 7), scatter(20, 11), scatter(5, 3), scatter(51, 5), []];
  const codes = ['123456789', '987654321', '000000000', '555123004', 'C'];
  const pose = (survivors, code) =>
    plan.planFor(roundInput(ps, survivors, { code })).chips.map((c) => `${c.id}@${c.zone}.${c.slot}:${c.verdictAt.toFixed(6)}`);
  const first = pose(draws[0], codes[0]);
  draws.forEach((d, i) => assert.deepEqual(pose(d, codes[i]), first, `survivors ${d.length}, code ${codes[i]}: a zone, slot or wave moment moved`));
  const zones = plan.zoneAssignment('ev', 1, ps.map((p) => p.id));
  const p = plan.planFor(roundInput(ps, draws[0]));
  assert.deepEqual(p.zones.map((z) => z.ids), zones, 'the plan does not use the assignment it exports');
  // Cosmetic, so it follows the event and the round: another event or round, another grouping.
  assert.notDeepEqual(plan.zoneAssignment('ev2', 1, ps.map((p) => p.id)), zones);
  assert.notDeepEqual(plan.zoneAssignment('ev', 2, ps.map((p) => p.id)), zones);
});

test('the event key is read off both reveal-key shapes; any other shape or round is refused', () => {
  assert.equal(plan.eventKeyOf('0a1b2c3d4e5f6a7b:round3:123456789', 3), '0a1b2c3d4e5f6a7b');
  assert.equal(plan.eventKeyOf('demo:0a1b2c3d4e5f6a7b:round1:123456789', 1), '0a1b2c3d4e5f6a7b');
  assert.equal(plan.eventKeyOf('048213:round2:12345678', 2), '048213');
  assert.throws(() => plan.eventKeyOf('048213:round2:12345678', 3), /round 3/);
  assert.throws(() => plan.eventKeyOf('048213|round2|12345678', 2), /reveal key/);
  assert.throws(() => plan.eventKeyOf('round2:12345678', 2), /reveal key/);
  const ps = people(9);
  assert.throws(() => plan.planFor(roundInput(ps, ['p0'], { key: 'ev:round2:C' })), /reveal key/);
});

test('the reveal key is anchored whole: an optional demo: prefix, one event key, its round, one code -- nothing else', () => {
  // Both key shapes the builders make still parse (the known-good control).
  assert.equal(plan.eventKeyOf('048213:round1:000123', 1), '048213');
  assert.equal(plan.eventKeyOf('demo:048213:round1:000123', 1), '048213');
  assert.equal(plan.eventKeyOf('0a1b2c3d4e5f6a7b:round4:123456789', 4), '0a1b2c3d4e5f6a7b');
  assert.equal(plan.eventKeyOf('demo:0a1b2c3d4e5f6a7b:round2:123456789', 2), '0a1b2c3d4e5f6a7b');
  // A suffix match reads an event key out of a key that names something else entirely.
  const refused = [
    'unrecognised:048213:round1:000123',
    'a:b:048213:round1:000123',
    'demo:demo:048213:round1:000123',
    'demo:unrecognised:048213:round1:000123',
    '048213:round1:000123:extra',
    '048213:round1:000:123',
    ':round1:000123',
    '048213:round1:',
    '048213:round:000123',
    '048213:round1:000123\n',
    '048213:round1:000123\r\n',
  ];
  for (const key of refused) {
    assert.throws(() => plan.eventKeyOf(key, 1), /reveal key/, `admitted a key of another shape: ${JSON.stringify(key)}`);
  }
  // The module refuses it, not just the helper: a plan is never built from a key it cannot read whole.
  const ps = people(9);
  for (const key of ['unrecognised:ev:round1:C', 'a:b:ev:round1:C']) {
    assert.throws(() => plan.planFor(roundInput(ps, ['p0'], { key })), /reveal key/);
  }
});

test('a segment carrying a Unicode line separator is refused, in the event key and in the code alike', () => {
  // The known-good control: both shapes the builders make, a hex key and a PIN, with and without the prefix.
  assert.equal(plan.eventKeyOf('048213:round1:000123', 1), '048213');
  assert.equal(plan.eventKeyOf('demo:048213:round1:000123', 1), '048213');
  assert.equal(plan.eventKeyOf('0a1b2c3d4e5f6a7b:round4:123456789', 4), '0a1b2c3d4e5f6a7b');
  assert.equal(plan.eventKeyOf('demo:0a1b2c3d4e5f6a7b:round2:123456789', 2), '0a1b2c3d4e5f6a7b');
  // U+2028 and U+2029 are line terminators to JavaScript but neither a colon nor CR/LF, so a class that excludes
  // only those three lets a separator ride into the event key -- or into the code, past the end anchor.
  const ps = people(9);
  for (const sep of ['\u2028', '\u2029']) {
    const keys = [`048213${sep}:round1:000123`, `demo:048213${sep}:round1:000123`, `048213:round1:000123${sep}`, `048213:round1:000${sep}123`];
    for (const key of keys) {
      assert.throws(() => plan.eventKeyOf(key, 1), /reveal key/, `admitted a line separator: ${JSON.stringify(key)}`);
    }
    // The module refuses it, not just the helper: no plan is built from a key it cannot read whole.
    assert.throws(() => plan.planFor(roundInput(ps, ['p0'], { key: `ev${sep}:round1:C` })), /reveal key/);
  }
});

test('partition: four zones, every name exactly once, sizes within one, at every field size', () => {
  for (const n of [6, 7, 9, 10, 20, 37, 52, 100, 200]) {
    const ids = people(n).map((p) => p.id);
    const zones = plan.zoneAssignment(`k${n}`, 1, ids);
    assert.equal(zones.length, plan.ZONE_COUNT);
    assert.deepEqual(zones.flat().sort(), [...ids].sort(), `${n}: a name is missing or doubled`);
    const sizes = zones.map((z) => z.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}: zones ${sizes.join('/')} are uneven`);
  }
});

test('a zone where everyone stays and a zone where everyone sits both resolve, and the badges count who sat', () => {
  const ps = people(8);
  const zones = plan.zoneAssignment('ev', 4, ps.map((p) => p.id));
  const input = roundInput(ps, ps.map((p) => p.id).filter((id) => zones[0].includes(id)), { round: 4 });
  const p = plan.planFor(input);
  assert.deepEqual(p.zones.map((z) => z.outCount), [0, ...zones.slice(1).map((z) => z.length)]);
  assert.deepEqual(plan.projectOutcome(input), input.outcome.survivors);
  assert.deepEqual(p.zones.map((z) => plan.badgeAt(p, z.index, p.total)), ['นั่ง 0', ...zones.slice(1).map((z) => `นั่ง ${z.length}`)]);
  const none = plan.planFor(roundInput(ps, [], { round: 4 }));
  assert.equal(plan.standingAt(none, none.total), 0);
  const all = plan.planFor(roundInput(ps, ps.map((p) => p.id), { round: 4 }));
  assert.equal(plan.standingAt(all, all.total), 8);
});

test('timeline: one cut beat per zone, in panel order, then complete; every verdict lands inside its zone slot', () => {
  for (const n of [7, 52, 200]) {
    const ps = people(n);
    const p = plan.planFor(roundInput(ps, ps.filter((_, i) => i % 3 === 0).map((x) => x.id)));
    const evs = plan.beatsIn(p, -1, p.total).map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type));
    assert.deepEqual(evs, ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'complete']);
    assert.equal(p.total, plan.ZONE_COUNT * plan.T.slot + plan.T.count + plan.T.settle);
    for (const z of p.zones) {
      assert.equal(z.startAt, z.index * plan.T.slot);
      const chips = p.chips.filter((c) => c.zone === z.index).sort((a, b) => a.slot - b.slot);
      assert.deepEqual(chips.map((c) => c.id), z.ids, 'chips are not in their zone slot order');
      for (const [j, c] of chips.entries()) {
        assert.ok(c.verdictAt >= z.startAt, `${c.id} lands before its zone`);
        assert.ok(c.verdictAt + plan.T.verdict <= z.startAt + plan.T.slot + 1e-9, `${c.id} is still landing after its zone slot`);
        if (j > 0) assert.ok(c.verdictAt > chips[j - 1].verdictAt, 'the wave is not one name after another');
      }
      if (chips.length > 1) assert.ok(chips[1].verdictAt - chips[0].verdictAt <= plan.T.stagger + 1e-9, 'stagger above the board value');
    }
  }
});

test('band and badges: the wave counts zone by zone and down to the survivors, then names the round', () => {
  const ps = people(40);
  const survivors = ps.filter((_, i) => i % 2 === 0).map((x) => x.id);
  const p = plan.planFor(roundInput(ps, survivors, { round: 2 }));
  const at0 = plan.bandAt(p, 0);
  assert.equal(at0.left, 'โซนที่ 1 จาก 4');
  assert.deepEqual(at0.right, { kind: 'text', text: 'ชื่อที่ไม่ผ่าน นั่งลง' });
  // The wave starts at once: zone 1's first name lands at t = 0.
  const first = p.chips.find((c) => c.zone === 0 && c.slot === 0);
  assert.equal(at0.figure.value, first.pass ? 40 : 39);
  assert.equal(plan.bandAt(p, 2 * plan.T.slot + 1).left, 'โซนที่ 3 จาก 4');
  assert.equal(plan.badgeAt(p, 3, 0), 'ยืนขึ้น');
  // After zone 1, the count has dropped by exactly the names that sat there.
  const z0 = p.zones[0];
  assert.equal(plan.standingAt(p, plan.T.slot), 40 - z0.outCount);
  assert.equal(plan.badgeAt(p, 0, plan.T.slot), `นั่ง ${z0.outCount}`);
  const end = plan.bandAt(p, p.total);
  assert.equal(end.left, 'ผ่านรอบที่ 2');
  assert.deepEqual(end.right, { kind: 'legend' });
  assert.equal(end.figure.value, 20);
  assert.equal(plan.topLabel(p), 'รอบที่ 2 จาก 4');
  assert.deepEqual(plan.topDots(p), ['done', 'on', 'todo', 'todo', 'todo']);
});

test('chip pose: standing until its moment, then eases to its verdict; the out lower and tilt, the in never move', () => {
  const ps = people(9);
  const p = plan.planFor(roundInput(ps, ['p0', 'p1', 'p2']));
  const out = p.chips.find((c) => !c.pass);
  const inn = p.chips.find((c) => c.pass);
  assert.equal(plan.chipStateAt(out, out.verdictAt - 1), 'standing');
  assert.equal(plan.chipStateAt(out, out.verdictAt), 'out');
  assert.equal(plan.verdictProgress(out, out.verdictAt + plan.T.verdict), 1);
  assert.equal(plan.verdictProgress(out, out.verdictAt - 5), 0);
  assert.equal(plan.chipStateAt(inn, p.total), 'in');
});

test('layout: the board panels, and a 50-name zone of one-line names fits its grid', () => {
  const panels = [0, 1, 2, 3].map((k) => plan.panelBox(k));
  assert.deepEqual(panels[0], { x: 56, y: 100, w: 894, h: 375 });
  assert.deepEqual(panels[3], { x: 970, y: 495, w: 894, h: 375 });
  const cells = plan.gridLayout(0, 50, new Array(13).fill(plan.GRID.minRow));
  const grid = plan.gridBox(0);
  for (const c of cells) {
    assert.ok(c.cx - c.w / 2 >= grid.x - 1e-9 && c.cx + c.w / 2 <= grid.x + grid.w + 1e-9, 'a chip leaves its grid sideways');
    assert.ok(c.cy - c.h / 2 >= grid.y - 1e-9 && c.cy + c.h / 2 <= grid.y + grid.h + 1e-9, 'a chip leaves its grid');
  }
  assert.equal(cells[4].cy - cells[0].cy, plan.GRID.minRow + plan.GRID.rowGap);
  // Fewer names: the same chips, centred, never smaller.
  const few = plan.gridLayout(0, 2, [plan.GRID.minRow]);
  assert.equal(few[0].h, plan.GRID.minRow);
  assert.equal(few[0].cy, grid.y + grid.h / 2);
});
