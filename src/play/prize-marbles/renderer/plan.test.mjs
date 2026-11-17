// The marble-race reveal's pure timeline (gh#316). Draw equality runs through the real event code: for
// events of 200, 52 and 37 heads walked through all four rounds as marble rounds, the set the picture shows
// across the line at the freeze is exactly the round record's survivors, and exactly what a phone computes
// from the round codes alone. The staging is checked over the whole timeline, not only at the freeze: the
// crossing order is heat-major, the freeze lands in the last heat holding a survivor, no eliminated marble
// ever reaches the line, and nothing moves once time stops. Which heat and lane a name races in never
// depends on who survives. A plan that disagrees with its outcome is refused, never repaired.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as plan from './plan.ts';
import { advance, createEvent, drawNext, liveIds, revealDrawn } from '../../../prize-event/event.ts';
import { proposeSchedule } from '../../../prize-draw/schedule.ts';
import { phoneVerdicts } from '../../../prize-draw/round-code.ts';

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

const MARBLES = { rounds: ['marbles', 'marbles', 'marbles', 'marbles'], final: null };

/** Every round of an all-marbles event of `n` heads, each as the projector builds its reveal input. */
function walk(n, seed = n) {
  const rng = seeded(seed);
  let s = createEvent({ eventName: 'Party', names: Array.from({ length: n }, (_, i) => `P${i + 1}`), schedule: proposeSchedule(n), prizes: ['TV'], games: MARBLES }, rng);
  const byId = new Map(s.setup.people.map((p) => [p.id, p]));
  const rounds = [];
  for (let r = 1; r <= 4; r++) {
    s = drawNext(s, rng);
    const rec = s.rounds.at(-1);
    const step = `round${rec.round}:${rec.code}`;
    rounds.push({
      state: s,
      rec,
      input: { key: `${s.eventKey}:${step}`, eventName: s.setup.eventName, people: liveIds(s).map((id) => byId.get(id)), outcome: { kind: 'round', ...rec } },
    });
    s = advance(revealDrawn(s), rng);
  }
  return rounds;
}

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `N${i}` }));
const roundInput = (ps, survivors, { key = 'ev:round1:C', round = 1 } = {}) => ({
  key,
  eventName: 'E',
  people: ps,
  outcome: { kind: 'round', game: 'marbles', round, code: 'C', survivors },
});

/** The staging invariants, checked by sampling the whole timeline every `step` ms. */
function assertStaging(p, label, step = 25) {
  const crossers = p.marbles.filter((m) => m.crossAt !== null).sort((a, b) => a.crossAt - b.crossAt);
  for (let i = 1; i < crossers.length; i++) {
    assert.ok(crossers[i - 1].heat <= crossers[i].heat, `${label}: ${crossers[i].id} of heat ${crossers[i].heat + 1} crosses before ${crossers[i - 1].id} of heat ${crossers[i - 1].heat + 1}`);
  }
  const lastHeatWithSurvivor = Math.max(...p.marbles.filter((m) => m.pass).map((m) => m.heat));
  assert.equal(p.freezeHeat, lastHeatWithSurvivor, `${label}: the freeze is not in the last heat holding a survivor`);
  assert.equal(p.freezeAt, crossers.at(-1).crossAt, `${label}: the freeze is not the instant the last survivor crosses`);
  for (const m of p.marbles) {
    const heat = p.heats[m.heat];
    if (m.pass) {
      assert.ok(heat.runs, `${label}: survivor ${m.id} sits in a heat that never runs`);
      assert.ok(m.crossAt > heat.startAt && m.crossAt <= heat.endAt, `${label}: ${m.id} crosses outside its own heat`);
    }
  }
  const frozen = new Map(p.marbles.map((m) => [m.id, plan.marbleX(p, m, p.freezeAt)]));
  for (let t = 0; t <= p.total + step; t += step) {
    for (const m of p.marbles) {
      const x = plan.marbleX(p, m, t);
      const across = x >= plan.FINISH_X;
      if (!m.pass) assert.ok(!across, `${label}: eliminated ${m.id} reached the line at ${t}ms`);
      else assert.equal(across, t >= m.crossAt, `${label}: ${m.id} is ${across ? 'across' : 'short'} at ${t}ms, crossing at ${m.crossAt}ms`);
      assert.equal(plan.isAcross(m, t), across, `${label}: the across state and the position disagree for ${m.id} at ${t}ms`);
      if (t >= p.freezeAt) assert.equal(x, frozen.get(m.id), `${label}: ${m.id} moved after time stopped`);
    }
  }
}

test('draw equality through the real event: the picture at the freeze is the record and the phone, at 200, 52 and 37 heads', () => {
  const fields = [];
  for (const n of [200, 52, 37]) {
    for (const { state, rec, input } of walk(n)) {
      const label = `${n} heads, round ${rec.round} (${input.people.length} to ${rec.survivors.length})`;
      fields.push(input.people.length);
      const shown = plan.projectOutcome(input);
      assert.deepEqual(shown, rec.survivors, `${label}: the picture shows a different set than the record`);
      const entries = state.rounds.map((r) => ({ code: r.code }));
      const shownSet = new Set(shown);
      let ins = 0;
      for (const { id } of input.people) {
        const verdict = phoneVerdicts(state.eventKey, id, entries, 'confirmed').verdicts[rec.round - 1];
        assert.equal(verdict === 'in', shownSet.has(id), `${label}: the phone says ${verdict} for ${id}`);
        if (verdict === 'in') ins++;
      }
      assert.ok(ins > 0 && ins < input.people.length, `${label}: an all-in or all-out round proves nothing here`);
      const p = plan.planFor(input);
      assert.equal(p.heats.length, Math.ceil(input.people.length / plan.HEAT_SIZE));
      assertStaging(p, label, n === 200 ? 50 : 25);
    }
  }
  // The walks reach every field size the brief names: the 20-, 10- and 7-name rounds included.
  for (const want of [200, 100, 50, 20, 52, 10, 7, 37]) assert.ok(fields.includes(want), `no round had a field of ${want}`);
});

test('timing: heats run back to back, the round ends a hold and a settle after the freeze; 200 heads, every heat run', () => {
  const ps = people(200);
  const p = plan.planFor(roundInput(ps, ps.filter((_, i) => i % 2 === 0).map((x) => x.id)));
  const { launch, race, rest, hold, settle } = plan.T;
  assert.equal(p.heats.length, 10);
  assert.equal(p.freezeHeat, 9);
  p.heats.forEach((h, i) => {
    assert.equal(h.startAt, i * (launch + race + rest));
    assert.equal(h.endAt, h.startAt + launch + race);
  });
  assert.equal(p.total, 10 * (launch + race) + 9 * rest + hold + settle);
  assert.equal(p.resultAt, p.freezeAt + hold);
  const events = plan.beatsIn(p, -1, p.total).map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type));
  assert.deepEqual(events, [...Array.from({ length: 10 }, (_, h) => `cut:${h}`), 'complete']);
});

test('heats of 20 with a short last heat; a heat with no survivor and a heat of only survivors; the freeze follows the last survivor', () => {
  const ps = people(37);
  const probe = plan.planFor(roundInput(ps, ['p0']));
  assert.deepEqual(probe.heats.map((h) => h.ids.length), [20, 17]);
  const [h0, h1] = probe.heats.map((h) => h.ids);

  // Everyone in heat 1 survives, nobody in heat 2: heat 2 never runs, the freeze is in heat 1.
  const first = plan.planFor(roundInput(ps, h0));
  assert.equal(first.freezeHeat, 0);
  assert.equal(first.heats[1].runs, false);
  assert.deepEqual(plan.projectOutcome(roundInput(ps, h0)), h0);
  assertStaging(first, 'all of heat 1');

  // Nobody in heat 1, everyone in heat 2: heat 1 runs to its end with every marble stopped short.
  const second = plan.planFor(roundInput(ps, h1));
  assert.equal(second.freezeHeat, 1);
  assert.ok(second.heats[0].runs);
  assert.deepEqual(plan.projectOutcome(roundInput(ps, h1)), h1);
  assertStaging(second, 'all of heat 2');

  // Seven names, five survivors: one short heat.
  const seven = plan.planFor(roundInput(people(7), ['p0', 'p1', 'p3', 'p4', 'p6']));
  assert.deepEqual(seven.heats.map((h) => h.ids.length), [7]);
  assertStaging(seven, 'seven');
});

test('which heat and lane a name races in is the same whichever survivors are drawn', () => {
  const ps = people(52);
  const a = plan.planFor(roundInput(ps, ps.filter((_, i) => i % 3 === 0).map((x) => x.id)));
  const b = plan.planFor(roundInput(ps, ps.filter((_, i) => i % 5 === 1).map((x) => x.id)));
  const seat = (p) => p.marbles.map((m) => [m.id, m.heat, m.lane, m.pace]);
  assert.deepEqual(seat(a), seat(b));
  assert.deepEqual(a.heats.map((h) => h.ids), b.heats.map((h) => h.ids));
});

test('cosmetic choices follow the key: the same key replays; another key changes the order inside a heat, never who survives', () => {
  const ps = people(40);
  const keep = ps.filter((_, i) => i % 2 === 0).map((x) => x.id);
  const a = plan.planFor(roundInput(ps, keep));
  const b = plan.planFor(roundInput(ps, keep));
  const c = plan.planFor(roundInput(ps, keep, { key: 'another' }));
  const order = (p) => p.marbles.filter((m) => m.crossAt !== null).sort((x, y) => x.crossAt - y.crossAt).map((m) => m.id);
  assert.deepEqual(order(a), order(b));
  assert.notDeepEqual(order(a), order(c));
  assert.deepEqual(plan.projectOutcome(roundInput(ps, keep, { key: 'another' })), keep);
});

test('a mutated plan is refused, never repaired', () => {
  const ps = people(60);
  const input = roundInput(ps, ps.filter((_, i) => i % 2 === 0).map((x) => x.id));
  const good = plan.planFor(input);
  assert.doesNotThrow(() => plan.assertPlan(good, input));
  const mutate = (fn) => {
    const p = structuredClone(good);
    fn(p);
    return p;
  };
  const inHeat = (p, h) => p.marbles.filter((m) => m.pass && m.heat === h);
  const cases = {
    'two heats swap a crossing (not heat-major)': (p) => {
      const [x, y] = [inHeat(p, 0)[0], inHeat(p, 1)[0]];
      [x.crossAt, y.crossAt] = [y.crossAt, x.crossAt];
    },
    'an eliminated marble crosses': (p) => {
      const m = p.marbles.find((x) => !x.pass && x.heat === 0);
      m.crossAt = p.heats[0].endAt - 1;
    },
    'a survivor flag flipped': (p) => {
      p.marbles.find((x) => !x.pass).pass = true;
    },
    'a survivor never crosses': (p) => {
      p.marbles.find((x) => x.pass).crossAt = null;
    },
    'the freeze moved earlier': (p) => {
      p.freezeAt -= 100;
    },
    'the freeze heat moved': (p) => {
      p.freezeHeat = 0;
    },
    'an eliminated marble stops on the line': (p) => {
      p.marbles.find((x) => !x.pass).stopFrac = 1;
    },
    'a marble dropped': (p) => {
      p.marbles.pop();
    },
    'two names swap heats': (p) => {
      const [x, y] = [p.marbles[0], p.marbles[25]];
      [x.heat, y.heat] = [y.heat, x.heat];
    },
    'a later heat runs past the freeze': (p) => {
      p.heats.push({ ...p.heats.at(-1), index: p.heats.length, ids: [] });
    },
  };
  for (const [name, fn] of Object.entries(cases)) assert.throws(() => plan.assertPlan(mutate(fn), input), /marbles/, name);
});

test('an outcome the module could only draw by inventing something is refused', () => {
  const ps = people(10);
  assert.throws(() => plan.planFor(roundInput(ps, ['p0', 'nobody'])), /survivor/);
  assert.throws(() => plan.planFor(roundInput(ps, ['p0', 'p0'])), /survivor/);
  assert.throws(() => plan.planFor(roundInput(ps, [])), /survivor/);
  assert.throws(() => plan.planFor(roundInput([...ps, ps[0]], ['p1'])), /twice/);
  assert.throws(() => plan.planFor({ ...roundInput(ps, ['p1']), outcome: { ...roundInput(ps, ['p1']).outcome, game: 'fireworks' } }), /marbles/);
  assert.throws(() => plan.planFor({ ...roundInput(ps, ['p1']), outcome: { kind: 'final', game: 'marbles', prizes: ['A'], order: ['p0'] } }), /marbles/);
});

test('the lower band: heat counter and the rolling count through the race, the result after the hold', () => {
  const ps = people(200);
  const p = plan.planFor(roundInput(ps, ps.filter((_, i) => i % 2 === 0).map((x) => x.id), { round: 2 }));
  const start = plan.bandAt(p, 0);
  assert.equal(start.left, 'ชุดที่ 1 จาก 10');
  assert.deepEqual(start.figure, 0);
  assert.deepEqual(start.right, { kind: 'text', text: 'ครบ 100 คน ลูกแก้วที่ข้ามเส้นชัย อยู่ต่อ' });
  const afterHeat1 = plan.bandAt(p, p.heats[0].endAt);
  assert.equal(afterHeat1.figure, p.marbles.filter((m) => m.pass && m.heat === 0).length, 'the count is not the heat\'s survivors at its cut');
  assert.equal(plan.bandAt(p, p.heats[3].startAt).left, 'ชุดที่ 4 จาก 10');
  const freeze = plan.bandAt(p, p.freezeAt);
  assert.equal(freeze.left, 'ชุดที่ 10 จาก 10');
  assert.equal(freeze.figure, 100);
  const end = plan.bandAt(p, p.total);
  assert.equal(end.left, 'ผ่านรอบที่ 2');
  assert.equal(end.figure, 100);
  assert.deepEqual(end.right, { kind: 'legend' });
  let prev = -1;
  for (let t = 0; t <= p.total; t += 40) {
    const f = plan.bandAt(p, t).figure;
    assert.ok(f >= prev, 'the count went backwards');
    prev = f;
  }
});

test('beatsIn is half open: each beat is reported once across consecutive ticks', () => {
  const ps = people(45);
  const p = plan.planFor(roundInput(ps, ps.filter((_, i) => i % 3 === 0).map((x) => x.id)));
  const seen = [];
  let prev = -1;
  for (let t = 0; t <= p.total + 50; t += 17) {
    seen.push(...plan.beatsIn(p, prev, t));
    prev = t;
  }
  assert.equal(seen.length, p.freezeHeat + 2);
});
