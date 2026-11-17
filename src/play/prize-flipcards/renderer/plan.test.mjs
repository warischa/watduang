// What the flipcards reveal shows, checked against the final the event really draws (gh#318). A QR-mode event
// is walked to its final; the final is drawn by the event's own drawNext with the picks locked, and its code by
// hostFinalCode. For every finalist, the phone's own answer (phoneFinalSlot, from the PIN, its join id and the
// round codes alone) is the truth: the card that finalist picked must turn to that slot's prize, or the
// no-prize copy past the prize count. Every pick assignment, every prize count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, createEvent, drawNext, liveIds, revealDrawn } from '../../../prize-event/event.ts';
import { hostFinalCode, phoneFinalSlot } from '../../../prize-draw/round-code.ts';
import { planFor as envelopesPlanFor } from '../../prize-envelopes/renderer/plan.ts';
import { COPY } from './copy.ts';
import { STEP, T, assertPlan, bandAt, beatsIn, claimOpacity, faceUp, hudAt, planFor, projectOutcome, turnAt } from './plan.ts';

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

/** A QR event walked to its ready flipcards final with `n` prizes. */
function atFinal(n, seed) {
  const rng = seeded(seed);
  let s = createEvent(
    {
      eventName: 'Party',
      names: ROSTER.map((p) => p.name),
      schedule: [80, 40, 20, 10, 5],
      prizes: PRIZES.slice(0, n),
      games: { rounds: [null, null, null, null], final: 'flipcards' },
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
  };
}

test('5 finalists x 1 to 5 prizes x all 120 placements, drawn for real: each picked card turns to its picker\'s phone slot', () => {
  let finalists = 0;
  let noPrize = 0;
  for (let n = 1; n <= 5; n++) {
    const ready = atFinal(n, 40 + n);
    const live = liveIds(ready);
    assert.equal(live.length, 5);
    const entries = ready.rounds.map((r) => ({ code: r.code }));
    permutations(live).forEach((picks, k) => {
      const drawn = revealDrawn(drawNext(ready, seeded(1000 * n + k), picks));
      assert.equal(drawn.final.game, 'flipcards');
      assert.deepEqual(drawn.final.picks, picks, 'the draw did not lock the placement it was handed');
      const code = hostFinalCode(drawn.eventKey, drawn.final.order, n);
      assert.ok(code, 'no final code for this order: nothing was checked against a phone');
      const input = inputOf(drawn);
      const shown = projectOutcome(input);
      assert.doesNotThrow(() => assertPlan(planFor(input), input));
      for (const id of live) {
        const phone = phoneFinalSlot(PIN, id, entries, code, 'confirmed');
        assert.equal(phone.verdict, 'in', `${id}: the phone does not reach the final`);
        assert.equal(phone.prizes, n);
        const card = shown[picks.indexOf(id)];
        assert.equal(card.id, id, 'the card names someone other than its picker');
        if (phone.slot < n) {
          assert.equal(card.prize, phone.slot);
          assert.equal(card.label, `รางวัลที่ ${phone.slot + 1}`);
          assert.equal(card.line, PRIZES[phone.slot]);
        } else {
          assert.equal(card.prize, null);
          assert.equal(card.label, 'ไม่มีรางวัล');
          assert.equal(card.line, 'ขอบคุณที่ร่วมลุ้น');
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
function fixed(n = 3, picks = ['p2', 'p0', 'p4', 'p1', 'p3'], order = ['p3', 'p1', 'p4', 'p0', 'p2'], game = 'flipcards') {
  return {
    key: 'e|final',
    eventName: 'งาน',
    outcome: { kind: 'final', game, prizes: PRIZES.slice(0, n), order, picks },
    people: IDS.map((id, i) => ({ id, name: `ชื่อ ${i}` })),
    viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 },
    reducedMotion: false,
  };
}

test('a mutated record is refused, never repaired', () => {
  assert.doesNotThrow(() => planFor(fixed()));
  const mutants = {
    'no picks': [(i) => delete i.outcome.picks, /picks/],
    'an empty card': [(i) => (i.outcome.picks[2] = null), /pick/],
    'a finalist on two cards': [(i) => (i.outcome.picks[0] = i.outcome.picks[1]), /pick/],
    'a stranger picked': [(i) => (i.outcome.picks[4] = 'x9'), /pick/],
    'the order of another step': [(i) => (i.outcome.order[0] = 'x9'), /order/],
    'a finalist missing from the people': [(i) => i.people.pop(), /order/],
    'no prize': [(i) => (i.outcome.prizes = []), /prizes/],
    'six prizes': [(i) => (i.outcome.prizes = [...PRIZES, 'x']), /prizes/],
    // A prize the record never named: the count still reads 1 to 5, so only the slot itself shows the hole.
    'a prize slot with nothing in it': [(i) => (i.outcome.prizes = Array(1)), /prize/],
    'a null prize name': [(i) => (i.outcome.prizes[1] = null), /prize/],
    'a prize name that is not text': [(i) => (i.outcome.prizes[0] = 7), /prize/],
    'another game': [(i) => (i.outcome.game = 'envelopes'), /another game/],
    'not a final': [(i) => (i.outcome.kind = 'round'), /not a final/],
  };
  for (const [label, [mutate, re]] of Object.entries(mutants)) {
    const input = fixed();
    mutate(input);
    assert.throws(() => planFor(input), re, label);
    assert.throws(() => projectOutcome(input), re, label);
  }
});

test('a mutated plan is refused against its record: what a card turns to, and the order they turn in', () => {
  const input = fixed(3);
  assert.doesNotThrow(() => assertPlan(planFor(input), input));
  const mutants = {
    'two faces swapped': (p) => ([p.slots[0], p.slots[4]] = [p.slots[4], p.slots[0]]),
    'a prize moved to another rank': (p) => (p.slots[4] = { ...p.slots[4], prize: 1 }),
    'a card handed to another finalist': (p) => (p.slots[2] = { ...p.slots[2], id: 'p0' }),
    'the first prize turned first': (p) => p.openings.reverse(),
    'two turns swapped': (p) => ([p.openings[3], p.openings[4]] = [p.openings[4], p.openings[3]]),
    'another prize count': (p) => (p.prizeCount = 2),
    'a card dropped': (p) => p.slots.pop(),
  };
  for (const [label, mutate] of Object.entries(mutants)) {
    const plan = planFor(input);
    mutate(plan);
    assert.throws(() => assertPlan(plan, input), /final pick/, label);
  }
});

test('a plan whose words, times or beats drifted from the record is refused, not drawn', () => {
  const input = fixed(3);
  // The plan the record makes passes: a guard that refused everything would prove nothing here.
  assert.doesNotThrow(() => assertPlan(planFor(input), input));
  const mutants = {
    'a face showing another prize name': (p) => (p.slots[0].line = 'another prize'),
    'a face showing another place': (p) => (p.slots[0].label = 'รางวัลที่ 5'),
    'a face with no prize name at all': (p) => (p.slots[0].line = undefined),
    'a card coming round before it turns': (p) => (p.openings[0].faceAt = -1),
    'a card turning at another time': (p) => (p.openings[1].turnAt += 1),
    'the beats completing at once': (p) => (p.beats = [{ at: 0, event: { type: 'complete' } }]),
    'a beat naming another rank': (p) => (p.beats[1].event.index = 0),
    'a beat dropped': (p) => p.beats.splice(1, 1),
    'the result at another time': (p) => (p.resultAt += 1),
    'the whole reveal another length': (p) => (p.total += 1),
  };
  for (const [label, mutate] of Object.entries(mutants)) {
    const plan = planFor(input);
    mutate(plan);
    assert.throws(() => assertPlan(plan, input), /flipcards/, label);
  }
  // The same plan with its keys in another order draws the same picture, so it is still accepted: the check
  // compares what the plan holds, not how it was serialised.
  const reordered = planFor(input);
  reordered.slots = reordered.slots.map((s) => ({ line: s.line, label: s.label, prize: s.prize, rank: s.rank, id: s.id, index: s.index }));
  reordered.openings = reordered.openings.map((o) => ({ faceAt: o.faceAt, turnAt: o.turnAt, index: o.index }));
  assert.doesNotThrow(() => assertPlan(reordered, input));
});

test('a plan with a hole where an array entry was deleted is refused, never drawn', () => {
  const input = fixed(3);
  // The counterexample: the last beat carries the completion, and deleting it leaves an array of the same
  // length whose hole `Array.prototype.every` steps over -- a plan accepted with a reveal that never ends.
  const lost = planFor(input);
  delete lost.beats[lost.beats.length - 1];
  assert.equal(beatsIn(lost, -1, lost.total).some((e) => e.type === 'complete'), false, 'the deletion kept the completion');
  assert.throws(() => assertPlan(lost, input), /flipcards/, 'the completion beat deleted');
  // Every array the plan carries: a hole is not an entry, so it is not the picture the record makes.
  const rows = {
    'a middle beat deleted': (p) => delete p.beats[1],
    'a card slot deleted': (p) => delete p.slots[2],
    'a card opening deleted': (p) => delete p.openings[0],
    'a beat appended past the end, leaving a hole': (p) => (p.beats.length += 1),
  };
  for (const [label, mutate] of Object.entries(rows)) {
    const plan = planFor(input);
    mutate(plan);
    assert.throws(() => assertPlan(plan, input), /final pick|flipcards/, label);
  }
});

test('the timeline: no-prize cards turn first, prize 1 last, one at a time on the owner-ruled 7000ms beat', () => {
  // order p3 p1 p4 p0 p2; picks: card 0 p2 (rank 4), 1 p0 (3), 2 p4 (2), 3 p1 (1), 4 p3 (0); 3 prizes.
  const plan = planFor(fixed(3));
  assert.deepEqual(plan.openings.map((o) => o.index), [0, 1, 2, 3, 4].filter((i) => plan.slots[i].prize === null).concat([2, 3, 4]));
  assert.equal(plan.slots[plan.openings.at(-1).index].prize, 0);
  plan.openings.forEach((o, k) => {
    assert.equal(o.turnAt, T.idle + k * STEP);
    // The face comes round at the half turn: before it the back faces the room, from it the face does.
    assert.equal(o.faceAt, o.turnAt + T.turn / 2);
  });
  assert.equal(T.turn, 600);
  assert.equal(T.hold, 6400);
  assert.equal(STEP, 7000, 'one card\'s beat is the MC\'s 7s (owner ruling 2026-11-17), not the board\'s 7s for all five');
  const tags = plan.beats.map((b) => (b.event.type === 'beat' ? `${b.event.beat}:${b.event.index}` : b.event.type));
  assert.deepEqual(tags, ['cut:0', 'prize:4', 'cut:1', 'prize:3', 'cut:2', 'prize:2', 'cut:3', 'prize:1', 'cut:4', 'prize:0', 'complete']);
  for (let i = 1; i < plan.beats.length; i++) assert.ok(plan.beats[i].at > plan.beats[i - 1].at);
  assert.equal(plan.beats.at(-1).at, plan.total);
  assert.deepEqual(beatsIn(plan, -1, plan.total).length, plan.beats.length);

  // Before the first turn: every card face down, the idle copy.
  const first = plan.openings[0];
  for (let i = 0; i < 5; i++) {
    assert.equal(turnAt(plan, i, first.turnAt), 0);
    assert.equal(faceUp(plan, i, first.turnAt), false);
  }
  assert.equal(hudAt(plan, 0), COPY.idle);
  assert.deepEqual(bandAt(plan, 0), { status: COPY.idleStatus, note: COPY.idleNote });
  // Mid-reveal, two face up: the count reads two, the last note stands; the rest still down.
  const third = plan.openings[2];
  assert.deepEqual(bandAt(plan, third.turnAt), { status: 'เปิดแล้ว 2 จาก 5 ใบ', note: COPY.lastNote });
  assert.equal(hudAt(plan, third.turnAt), COPY.oneAtATime);
  assert.equal(faceUp(plan, third.index, third.faceAt - 1), false);
  assert.equal(faceUp(plan, third.index, third.faceAt), true);
  // A turn eases in and out: half way round at its midpoint, still at both ends.
  assert.equal(turnAt(plan, third.index, third.faceAt), 0.5);
  assert.ok(turnAt(plan, third.index, third.turnAt + 30) < 0.01 && turnAt(plan, third.index, third.turnAt + T.turn - 30) > 0.99);
  assert.equal(turnAt(plan, third.index, third.turnAt + T.turn), 1);
  // The result: every card face up, the heading, the claim faded in.
  for (let i = 0; i < 5; i++) assert.equal(turnAt(plan, i, plan.resultAt), 1);
  assert.equal(hudAt(plan, plan.resultAt), COPY.winnersHeading);
  assert.equal(claimOpacity(plan, plan.total), 1);
  assert.equal(claimOpacity(plan, plan.resultAt - 1), 0);
});

test('the two pick finals keep one rhythm: every beat lands when the envelopes final lands it, on the same record', () => {
  for (let n = 1; n <= 5; n++) {
    const cards = planFor(fixed(n));
    const envelopes = envelopesPlanFor(fixed(n, undefined, undefined, 'envelopes'));
    assert.deepEqual(
      cards.beats.map((b) => [b.at, b.event]),
      envelopes.beats.map((b) => [b.at, b.event]),
      `${n} prizes: the card final drifted from the envelope final's timing`,
    );
    assert.equal(cards.resultAt, envelopes.resultAt);
    assert.equal(cards.total, envelopes.total);
  }
});

test('one prize: once every card is face up the heading reads the one-prize line (card-few)', () => {
  const plan = planFor(fixed(1));
  const allOpen = plan.openings.at(-1).faceAt;
  assert.equal(hudAt(plan, allOpen), COPY.onePrize);
  assert.deepEqual(bandAt(plan, allOpen), { status: COPY.allOpen, note: COPY.noPrizeLine });
  assert.equal(plan.slots.filter((s) => s.prize === null).length, 4);
  assert.equal(hudAt(planFor(fixed(3)), allOpen), COPY.oneAtATime);
});
