// node --test — the two phase-2 finals, `envelopes` (gh#317) and `flipcards` (gh#318), record which object each
// finalist picked. The MC places the five finalists on the five objects before the draw, one stored write at a
// time like the ladder's lane picks, so a reload or a second screen reads the same picks. The picks are theatre
// (gh#299 decision 7): the final's order stays the plain uniform draw over the finalists, so the order, its
// final code and the randomness consumed are the same for every one of the 120 possible placements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ev from './event.ts';
import { hostFinalCode } from '../prize-draw/round-code.ts';
import { proposeSchedule } from '../prize-draw/schedule.ts';

const { advance, createEvent, decodeEvent, drawNext, encodeEvent, liveIds, position, revealDrawn } = ev;

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
const noDraw = {
  float: () => assert.fail('drew a float'),
  int: () => assert.fail('drew an int'),
  hex: () => assert.fail('drew hex'),
};
/** Records every int the draw asks for, answering from `base`. */
const recording = (calls, base) => ({ ...noDraw, int: (n) => (calls.push(n), base.int(n)) });

const PICK_FINALS = ['envelopes', 'flipcards'];
const input = (n, final) => ({
  eventName: 'Party',
  names: Array.from({ length: n }, (_, i) => `P${i + 1}`),
  schedule: proposeSchedule(n),
  prizes: ['TV', 'Bike', 'Fryer'],
  ...(final === undefined ? {} : { games: { rounds: [null, null, null, null], final } }),
});

/** The pick write, read off the module so a missing export reds each test on its own line. */
const pickObject = (s, object, id) => {
  assert.equal(typeof ev.pickObject, 'function', 'event.ts has no pickObject');
  return ev.pickObject(s, object, id);
};

/** An event walked to its final, ready. The rounds use `rng`; the step into the final is handed no source. */
function atFinal(final, seed, n = 50) {
  const rng = seeded(seed);
  let s = createEvent(input(n, final), rng);
  for (let r = 1; r <= 4; r++) {
    const revealed = revealDrawn(drawNext(s, rng));
    s = r < 4 ? advance(revealed, noDraw) : advance(revealed, final === 'ladder' ? rng : noDraw);
  }
  return s;
}

/** Every ordering of `items`. */
function orderings(items) {
  const out = [];
  const go = (prefix, rest) => (rest.length ? rest.forEach((x, i) => go([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)])) : out.push(prefix));
  go([], items);
  return out;
}

/** Place `assignment` (object index -> finalist id) one write at a time, in a scrambled order. */
function place(s, assignment) {
  let t = s;
  for (const object of [3, 0, 4, 1, 2]) t = pickObject(t, object, assignment[object]);
  return t;
}

for (const game of PICK_FINALS) {
  test(`${game}: opening the final stores five empty picks and draws nothing`, () => {
    const s = atFinal(game, 1);
    assert.deepEqual(position(s), { kind: 'final', at: 'ready' });
    assert.equal(s.final, null);
    assert.deepEqual(s.prepared, { game, picks: [null, null, null, null, null] });
    assert.deepEqual(decodeEvent(encodeEvent(s)), s, 'the opened final does not read back');
  });

  test(`${game}: pickObject stores one assignment at a time; a finalist moved leaves its old object; undo empties one`, () => {
    const s = atFinal(game, 2);
    const [a, b, c, d, e] = liveIds(s);
    let t = pickObject(s, 3, a);
    assert.deepEqual(t.prepared, { game, picks: [null, null, null, a, null] });
    t = pickObject(t, 0, b);
    t = pickObject(t, 1, a); // a moves from object 4 to object 2
    assert.deepEqual(t.prepared.picks, [b, a, null, null, null]);
    t = pickObject(t, 0, null); // object 1 emptied
    assert.deepEqual(t.prepared.picks, [null, a, null, null, null]);
    assert.deepEqual(decodeEvent(encodeEvent(t)), t, 'a partial placement does not read back');
    assert.throws(() => pickObject(t, 2, 'stranger'), /finalist/);
    assert.throws(() => pickObject(t, 2, s.setup.people.find((p) => !liveIds(s).includes(p.id)).id), /finalist/);
    assert.throws(() => pickObject(t, 5, c), /object/);
    assert.throws(() => pickObject(t, -1, c), /object/);
    assert.throws(() => pickObject(t, 1.5, c), /object/);
    // Never on another step: a round, a drawn final, a final of another game.
    const round = createEvent(input(50, game), seeded(3));
    assert.throws(() => pickObject(round, 0, liveIds(round)[0]), /final/);
    assert.throws(() => pickObject(atFinal('fireworks', 4), 0, liveIds(atFinal('fireworks', 4))[0]), /final/);
    const ladder = atFinal('ladder', 5);
    assert.throws(() => pickObject(ladder, 0, liveIds(ladder)[0]), /final/);
    for (const [object, id] of [[0, e], [2, d], [3, c], [4, b]]) t = pickObject(t, object, id);
    const drawn = drawNext(t, seeded(6));
    assert.throws(() => pickObject(drawn, 0, a), /final/);
    // The ladder's own write stays the ladder's.
    assert.throws(() => ev.pickLane(t, 0, a), /ladder/);
  });

  test(`${game}: the draw locks the stored picks, only once all five are placed, and records them`, () => {
    const s = atFinal(game, 7);
    const finalists = liveIds(s);
    assert.throws(() => drawNext(s, seeded(8)), /picks/, 'drew with no picks placed');
    let t = s;
    for (let k = 0; k < 4; k++) t = pickObject(t, k, finalists[k]);
    assert.throws(() => drawNext(t, seeded(8)), /picks/, 'drew with four picks placed');
    t = pickObject(t, 4, finalists[4]);
    const assignment = [...t.prepared.picks];
    const drawn = drawNext(t, seeded(8));
    assert.equal(drawn.at, 'drawn');
    assert.equal(drawn.prepared, null, 'the drawn final keeps its picks prepared');
    assert.deepEqual(Object.keys(drawn.final).sort(), ['game', 'order', 'picks']);
    assert.equal(drawn.final.game, game);
    assert.deepEqual(drawn.final.picks, assignment, 'the record is not the stored placement');
    assert.deepEqual([...drawn.final.order].sort(), [...finalists].sort());
    assert.deepEqual(decodeEvent(encodeEvent(revealDrawn(drawn))), revealDrawn(drawn));
    // Handed picks lock like the ladder's (the demo draws that way); still all five finalists, each once.
    const reversed = [...finalists].reverse();
    assert.deepEqual(drawNext(s, seeded(8), reversed).final.picks, reversed);
    assert.throws(() => drawNext(s, seeded(8), [finalists[0], ...finalists.slice(0, 4)]), /picks/);
    assert.throws(() => drawNext(s, seeded(8), [...finalists.slice(1), 'stranger']), /picks/);
  });

  test(`${game}: the picks never feed the order: all 120 placements give the plain final's order, final code and randomness`, () => {
    // The plain final: the same roster and rounds with no game, drawn from the same source.
    const plain = drawNext(atFinal(undefined, 9), recording([], seeded(10)));
    const s = atFinal(game, 9);
    assert.deepEqual(liveIds(s), liveIds(atFinal(undefined, 9)), 'precondition: the two events reach the same finalists');
    const orders = new Set();
    const tails = new Set();
    let placements = 0;
    for (const assignment of orderings(liveIds(s))) {
      const t = place(s, assignment);
      const calls = [];
      const rng = seeded(10);
      const drawn = drawNext(t, recording(calls, rng));
      assert.deepEqual(drawn.final.picks, assignment);
      assert.deepEqual(calls, [5, 4, 3, 2], `placement ${assignment}: the draw asked for other randomness`);
      orders.add(drawn.final.order.join());
      tails.add(rng.hex(8));
      placements++;
    }
    assert.equal(placements, 120);
    assert.deepEqual([...orders], [plain.final.order.join()], 'a placement changed the order');
    assert.equal(tails.size, 1, 'a placement changed how much randomness the draw consumed');
    // The final code is a function of the key, the order and the prize count only: one order, one code.
    const codes = new Set([...orders].map((o) => hostFinalCode(s.eventKey, o.split(','), s.setup.prizes.length)));
    assert.deepEqual([...codes], [hostFinalCode(plain.eventKey, plain.final.order, plain.setup.prizes.length)]);
  });
}

test('the two finals share one shape: a placement made for one game is refused under the other', () => {
  const env = atFinal('envelopes', 11);
  const [a, b] = liveIds(env);
  const good = JSON.parse(encodeEvent(pickObject(pickObject(env, 0, a), 2, b)));
  assert.notEqual(decodeEvent(JSON.stringify(good)), null, 'positive control: a good partial placement decodes');
  const swapped = { ...good, prepared: { ...good.prepared, game: 'flipcards' } };
  assert.equal(decodeEvent(JSON.stringify(swapped)), null, 'a flipcards placement on an envelopes final');
  const cards = JSON.parse(JSON.stringify(good));
  cards.setup.games.final = 'flipcards';
  cards.prepared.game = 'flipcards';
  assert.notEqual(decodeEvent(JSON.stringify(cards)), null, 'the same placement under flipcards decodes');
});

test('decode refuses a stored placement that is not five slots of distinct finalists or empties', () => {
  const s = atFinal('envelopes', 12);
  const [a, b] = liveIds(s);
  const good = JSON.parse(encodeEvent(pickObject(pickObject(s, 0, a), 2, b)));
  assert.notEqual(decodeEvent(JSON.stringify(good)), null, 'positive control: a good partial placement decodes');
  const outsider = s.setup.people.find((p) => !liveIds(s).includes(p.id)).id;
  const p = good.prepared;
  const variants = {
    'a finalist on two objects': { ...p, picks: [a, null, a, null, null] },
    'someone who is not a finalist': { ...p, picks: [a, null, outsider, null, null] },
    'not an id at all': { ...p, picks: [a, null, 7, null, null] },
    'six objects': { ...p, picks: [a, null, b, null, null, null] },
    'four objects': { ...p, picks: [a, null, b, null] },
    'no picks': { game: 'envelopes' },
    'picks that are not an array': { ...p, picks: { 0: a } },
    'the ladder\'s shape': { game: 'ladder', slotRanks: [0, 1, 2, 3, 4], picks: p.picks },
    'nothing stored': null,
  };
  for (const [label, prepared] of Object.entries(variants)) {
    assert.equal(decodeEvent(JSON.stringify({ ...good, prepared })), null, label);
  }
});

test('decode refuses a placement on any step but a ready envelopes or flipcards final', () => {
  const s = atFinal('flipcards', 13);
  const placed = place(s, liveIds(s));
  const prepared = JSON.parse(encodeEvent(placed)).prepared;
  const drawn = JSON.parse(encodeEvent(drawNext(placed, seeded(14))));
  assert.notEqual(decodeEvent(JSON.stringify(drawn)), null, 'positive control: the drawn final decodes');
  const fw = JSON.parse(encodeEvent(atFinal('fireworks', 13)));
  const round = JSON.parse(encodeEvent(createEvent(input(50, 'flipcards'), seeded(15))));
  const variants = {
    'a placement left on the drawn final': { ...drawn, prepared },
    'a placement on a fireworks final': { ...fw, prepared },
    'a placement on round 1': { ...round, prepared },
  };
  for (const [label, v] of Object.entries(variants)) assert.equal(decodeEvent(JSON.stringify(v)), null, label);
});

test('decode refuses a recorded final whose picks are missing, incomplete, repeated or not the finalists', () => {
  const s = atFinal('envelopes', 16);
  const good = JSON.parse(encodeEvent(revealDrawn(drawNext(place(s, liveIds(s)), seeded(17)))));
  assert.notEqual(decodeEvent(JSON.stringify(good)), null, 'positive control: the recorded final decodes');
  const f = good.final;
  const outsider = s.setup.people.find((p) => !liveIds(s).includes(p.id)).id;
  const { picks: _drop, ...noPicks } = f;
  const variants = {
    'no picks': noPicks,
    'an empty object': { ...f, picks: [...f.picks.slice(0, 4), null] },
    'a finalist twice': { ...f, picks: [f.picks[0], f.picks[0], ...f.picks.slice(2)] },
    'an outsider': { ...f, picks: [...f.picks.slice(0, 4), outsider] },
    'four picks': { ...f, picks: f.picks.slice(0, 4) },
    'recorded as fireworks': { ...f, game: 'fireworks' },
    'recorded as the other pick final': { ...f, game: 'flipcards' },
  };
  for (const [label, final] of Object.entries(variants)) assert.equal(decodeEvent(JSON.stringify({ ...good, final })), null, label);
});
