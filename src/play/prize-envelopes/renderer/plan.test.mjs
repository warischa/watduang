// What the envelopes reveal shows, checked against the final the event really draws (gh#317). A QR-mode event
// is walked to its final; the final is drawn by the event's own drawNext with the picks locked, and its code by
// hostFinalCode. For every finalist, the phone's own answer (phoneFinalSlot, from the PIN, its join id and the
// round codes alone) is the truth: the envelope that finalist picked must show that slot's prize, or the
// no-prize copy past the prize count. Every pick assignment, every prize count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, createEvent, drawNext, liveIds, revealDrawn } from '../../../prize-event/event.ts';
import { hostFinalCode, phoneFinalSlot } from '../../../prize-draw/round-code.ts';
import { BEATS } from '../../_prize-final-pick/plan.ts';
import { COPY } from './copy.ts';
import { STEP, T, bandAt, beatsIn, claimOpacity, flapAt, hudAt, planFor, projectOutcome, slotOpacity } from './plan.ts';

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

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

const PIN = '048213';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const serverId = (i) => B64[i >> 6] + B64[i & 63] + Array.from({ length: 20 }, (_, k) => B64[(i * 7 + k * 13) % 64]).join('');
const ROSTER = Array.from({ length: 80 }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'พัดลม', 'กระเป๋า'];

/** A QR event walked to its ready envelopes final with `n` prizes. */
function atFinal(n, seed) {
  const rng = seeded(seed);
  let s = createEvent(
    {
      eventName: 'Party',
      names: ROSTER.map((p) => p.name),
      schedule: [80, 40, 20, 10, 5],
      prizes: PRIZES.slice(0, n),
      games: { rounds: [null, null, null, null], final: 'envelopes' },
      qr: { pin: PIN, roster: ROSTER },
    },
    rng,
  );
  for (let r = 1; r <= 4; r++) s = advance(revealDrawn(drawNext(s, rng)), rng);
  return s;
}

/** The reveal's input exactly as a step hands it over: the drawn record, the finalists in roster order. */
function inputOf(drawn) {
  const byId = new Map(drawn.setup.people.map((p) => [p.id, p]));
  return {
    key: `${drawn.eventKey}:final`,
    eventName: drawn.setup.eventName,
    outcome: { kind: 'final', prizes: drawn.setup.prizes, ...drawn.final },
    people: liveIds(drawn).map((id) => byId.get(id)),
    viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 },
    reducedMotion: false,
    claim: true,
  };
}

test('5 finalists x 1 to 5 prizes x all 120 placements, drawn for real: each picked envelope shows its picker\'s phone slot', () => {
  let finalists = 0;
  let noPrize = 0;
  for (let n = 1; n <= 5; n++) {
    const ready = atFinal(n, 40 + n);
    const live = liveIds(ready);
    assert.equal(live.length, 5);
    const entries = ready.rounds.map((r) => ({ code: r.code }));
    permutations(live).forEach((picks, k) => {
      const drawn = revealDrawn(drawNext(ready, seeded(1000 * n + k), picks));
      assert.equal(drawn.final.game, 'envelopes');
      assert.deepEqual(drawn.final.picks, picks, 'the draw did not lock the placement it was handed');
      const code = hostFinalCode(drawn.eventKey, drawn.final.order, n);
      assert.ok(code, 'no final code for this order: nothing was checked against a phone');
      const shown = projectOutcome(inputOf(drawn));
      for (const id of live) {
        const phone = phoneFinalSlot(PIN, id, entries, code, 'confirmed');
        assert.equal(phone.verdict, 'in', `${id}: the phone does not reach the final`);
        assert.equal(phone.prizes, n);
        const env = shown[picks.indexOf(id)];
        assert.equal(env.id, id, 'the envelope names someone other than its picker');
        if (phone.slot < n) {
          assert.equal(env.prize, phone.slot);
          assert.equal(env.label, `รางวัลที่ ${phone.slot + 1}`);
          assert.equal(env.line, PRIZES[phone.slot]);
        } else {
          assert.equal(env.prize, null);
          assert.equal(env.label, 'ไม่มีรางวัล');
          assert.equal(env.line, 'ขอบคุณที่ร่วมลุ้น');
          noPrize++;
        }
        finalists++;
      }
    });
  }
  assert.equal(finalists, 3000);
  // 120 placements x 5 finalists x (4+3+2+1+0) no-prize places, per finalist set of 5.
  assert.equal(noPrize, 1200);
});

/** A drawn final to mutate, without a walk: the record's own shape. */
const IDS = ['p0', 'p1', 'p2', 'p3', 'p4'];
function fixed(n = 3, picks = ['p2', 'p0', 'p4', 'p1', 'p3'], order = ['p3', 'p1', 'p4', 'p0', 'p2']) {
  return {
    key: 'e|final',
    eventName: 'งาน',
    outcome: { kind: 'final', game: 'envelopes', prizes: PRIZES.slice(0, n), order, picks },
    people: IDS.map((id, i) => ({ id, name: `ชื่อ ${i}` })),
    viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 },
    reducedMotion: false,
    claim: true,
  };
}

test('a mutated record is refused, never repaired', () => {
  assert.doesNotThrow(() => planFor(fixed()));
  const mutants = {
    'no picks': [(i) => delete i.outcome.picks, /picks/],
    'an empty envelope': [(i) => (i.outcome.picks[2] = null), /pick/],
    'a finalist on two envelopes': [(i) => (i.outcome.picks[0] = i.outcome.picks[1]), /pick/],
    'a stranger picked': [(i) => (i.outcome.picks[4] = 'x9'), /pick/],
    'the order of another step': [(i) => (i.outcome.order[0] = 'x9'), /order/],
    'a finalist missing from the people': [(i) => i.people.pop(), /order/],
    'no prize': [(i) => (i.outcome.prizes = []), /prizes/],
    'six prizes': [(i) => (i.outcome.prizes = [...PRIZES, 'x']), /prizes/],
    // A prize the record never named: the count still reads 1 to 5, so only the slot itself shows the hole.
    'a prize slot with nothing in it': [(i) => (i.outcome.prizes = Array(1)), /prize/],
    'a null prize name': [(i) => (i.outcome.prizes[1] = null), /prize/],
    'a prize name that is not text': [(i) => (i.outcome.prizes[0] = 7), /prize/],
    'another game': [(i) => (i.outcome.game = 'flipcards'), /another game/],
    'not a final': [(i) => (i.outcome.kind = 'round'), /not a final/],
  };
  for (const [label, [mutate, re]] of Object.entries(mutants)) {
    const input = fixed();
    mutate(input);
    assert.throws(() => planFor(input), re, label);
    assert.throws(() => projectOutcome(input), re, label);
  }
});

test('the timeline: no-prize envelopes open first, prize 1 last, one at a time on the shared 600 + 6400ms beat', () => {
  // order p3 p1 p4 p0 p2; picks: envelope 0 p2 (rank 4), 1 p0 (3), 2 p4 (2), 3 p1 (1), 4 p3 (0); 3 prizes.
  const plan = planFor(fixed(3));
  assert.deepEqual(plan.openings.map((o) => o.index), [0, 1, 2, 3, 4].filter((i) => plan.slots[i].prize === null).concat([2, 3, 4]));
  assert.equal(plan.slots[plan.openings.at(-1).index].prize, 0);
  plan.openings.forEach((o, k) => {
    assert.equal(o.liftAt, T.idle + k * STEP);
    assert.equal(o.slotAt, o.liftAt + T.lift);
  });
  // The beats are the shared pick-final ones, not a copy: the MC names each envelope as it opens, about 7s each.
  assert.equal(T.idle, BEATS.idle);
  assert.equal(T.turn, BEATS.turn);
  assert.equal(T.hold, BEATS.hold);
  assert.equal(T.result, BEATS.result);
  assert.equal(T.lift, 300);
  assert.equal(T.slotIn, 200);
  assert.equal(STEP, 7000);
  assert.equal(STEP, BEATS.turn + BEATS.hold);
  assert.equal(5 * STEP, 35000, 'five envelopes at about 7s each');
  assert.equal(plan.total, 36700);
  const tags = plan.beats.map((b) => (b.event.type === 'beat' ? `${b.event.beat}:${b.event.index}` : b.event.type));
  assert.deepEqual(tags, ['cut:0', 'prize:4', 'cut:1', 'prize:3', 'cut:2', 'prize:2', 'cut:3', 'prize:1', 'cut:4', 'prize:0', 'complete']);
  for (let i = 1; i < plan.beats.length; i++) assert.ok(plan.beats[i].at > plan.beats[i - 1].at);
  assert.equal(plan.beats.at(-1).at, plan.total);
  assert.deepEqual(beatsIn(plan, -1, plan.total).length, plan.beats.length);

  // Before the first lift: every flap closed, no slot showing, the idle copy.
  const first = plan.openings[0];
  for (let i = 0; i < 5; i++) assert.equal(flapAt(plan, i, first.liftAt), 0);
  assert.equal(hudAt(plan, 0), COPY.idle);
  assert.deepEqual(bandAt(plan, 0), { status: COPY.idleStatus, note: COPY.idleNote });
  // Mid-reveal, two open: the count reads two, the last note stands; the rest still closed.
  const third = plan.openings[2];
  assert.deepEqual(bandAt(plan, third.liftAt), { status: 'เปิดแล้ว 2 จาก 5 ซอง', note: COPY.lastNote });
  assert.equal(hudAt(plan, third.liftAt), COPY.oneAtATime);
  assert.equal(slotOpacity(plan, third.index, third.slotAt - 1), 0);
  assert.equal(slotOpacity(plan, third.index, third.slotAt + T.slotIn), 1);
  assert.equal(flapAt(plan, third.index, third.liftAt + T.lift), 1);
  // The result: every flap open, the heading, the claim faded in.
  for (let i = 0; i < 5; i++) assert.equal(flapAt(plan, i, plan.resultAt), 1);
  assert.equal(hudAt(plan, plan.resultAt), COPY.winnersHeading);
  assert.equal(claimOpacity(plan, plan.total), 1);
  assert.equal(claimOpacity(plan, plan.resultAt - 1), 0);
});

test('one prize: once every envelope is open the heading reads the one-prize line (env-few)', () => {
  const plan = planFor(fixed(1));
  const allOpen = plan.openings.at(-1).slotAt;
  assert.equal(hudAt(plan, allOpen), COPY.onePrize);
  assert.deepEqual(bandAt(plan, allOpen), { status: COPY.allOpen, note: COPY.noPrizeLine });
  assert.equal(plan.slots.filter((s) => s.prize === null).length, 4);
  assert.equal(hudAt(planFor(fixed(3)), allOpen), COPY.oneAtATime);
});
