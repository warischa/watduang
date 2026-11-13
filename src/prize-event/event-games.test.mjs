// node --test — the event schema v2 (gh#305): the MC's game picks ride in the event, a card round is dealt
// and persisted before its rule is drawn, a ladder final records how its order arose, and a stored v1 event
// still reads (normalised to v2) while its stored text stays the compare-and-set token. Pure, no DOM, except
// the store round trip over the in-memory IndexedDB double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advance,
  createEvent,
  decodeEvent,
  drawAndSave,
  drawNext,
  encodeEvent,
  liveIds,
  pickLane,
  position,
  prepareCards,
  revealDrawn,
  setupIssues,
} from './event.ts';
import { NO_GAMES, isFiveLanes, ladderConsistent, ladderOrder } from './game-contract.ts';
import { hostDealRound, satisfies } from '../prize-draw/cards.ts';
import { parseCode } from '../prize-draw/round-code.ts';
import { proposeSchedule } from '../prize-draw/schedule.ts';
import { fakeOrigin } from './fake-idb.mjs';
import { openEventStore, DB } from './store.ts';

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

const people = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const input = (n, games) => ({
  eventName: 'Party',
  names: people(n),
  schedule: proposeSchedule(n),
  prizes: ['TV', 'Bike', 'Fryer'],
  ...(games === undefined ? {} : { games }),
});
const ALL_CARDS = { rounds: ['cards', 'cards', 'cards', 'cards'], final: 'ladder' };
/** Cards play only a round that cuts exactly in half, so every round of an all-cards event halves. */
const HALVES = [80, 40, 20, 10, 5];
const cardsInput = () => ({ ...input(80, ALL_CARDS), schedule: HALVES });
// proposeSchedule(50) halves only round 2 (20 -> 10), where MIXED plays cards.
const MIXED = { rounds: ['fireworks', 'cards', null, 'fireworks'], final: 'fireworks' };

/** Walk the four rounds, preparing every card round first. The step into a ladder final draws its slot
 *  layout, so every advance gets the random source. */
function walkRounds(s, rng) {
  for (let r = 1; r <= 4; r++) {
    if (s.setup.games.rounds[r - 1] === 'cards') s = prepareCards(s, rng);
    s = advance(revealDrawn(drawNext(s, rng)), rng);
  }
  return s;
}

/** A v1 text as the gh#304 code wrote it: no games, no prepared, game-less records. */
function v1Text(state) {
  const strip = (r) => ({ round: r.round, code: r.code, survivors: r.survivors });
  return JSON.stringify({
    v: 1,
    eventKey: state.eventKey,
    setup: { eventName: state.setup.eventName, people: state.setup.people, schedule: state.setup.schedule, prizes: state.setup.prizes },
    rounds: state.rounds.map(strip),
    final: state.final ? { order: state.final.order } : null,
    at: state.at,
  });
}

// ---- the schema

test('a new event is v2 and plays no game anywhere unless the MC picked one', () => {
  const s = createEvent(input(50), seeded(1));
  assert.equal(s.v, 2);
  assert.deepEqual(s.setup.games, NO_GAMES);
  assert.equal(s.prepared, null);
  const picked = createEvent(input(50, MIXED), seeded(1));
  assert.deepEqual(picked.setup.games, MIXED);
  assert.notEqual(picked.setup.games, MIXED, 'the event must hold its own copy of the picks');
  assert.throws(() => createEvent(input(50, { rounds: ['ladder', null, null, null], final: null }), seeded(1)), /games/);
  assert.throws(() => createEvent(input(50, { rounds: [null, null, null, null], final: 'cards' }), seeded(1)), /games/);
});

test('every round and the final record the game they were played with', () => {
  const rng = seeded(2);
  let s = walkRounds(createEvent(input(50, MIXED), rng), rng);
  assert.deepEqual(s.rounds.map((r) => r.game), MIXED.rounds);
  s = drawNext(s, rng);
  assert.equal(s.final.game, 'fireworks');
  assert.deepEqual(decodeEvent(encodeEvent(s)), s);
});

// ---- v1 -> v2

test('a stored v1 event reads as v2, deterministically: games null, nothing prepared, every draw kept', () => {
  const rng = seeded(3);
  let s = createEvent(input(50), rng);
  const texts = [];
  for (let r = 1; r <= 4; r++) {
    texts.push(v1Text(s));
    s = drawNext(s, rng);
    texts.push(v1Text(s));
    s = advance(revealDrawn(s));
  }
  s = revealDrawn(drawNext(s, rng));
  texts.push(v1Text(s));
  for (const text of texts) {
    const a = decodeEvent(text);
    assert.ok(a, 'a valid v1 text must decode');
    assert.equal(a.v, 2);
    assert.deepEqual(a.setup.games, NO_GAMES);
    assert.equal(a.prepared, null);
    for (const r of a.rounds) assert.equal(r.game, null);
    if (a.final) assert.equal(a.final.game, null);
    const old = JSON.parse(text);
    assert.deepEqual(a.rounds.map((r) => [r.round, r.code, r.survivors]), old.rounds.map((r) => [r.round, r.code, r.survivors]));
    assert.deepEqual(a.final?.order ?? null, old.final?.order ?? null);
    assert.equal(encodeEvent(decodeEvent(text)), encodeEvent(a), 'normalisation must be deterministic');
    // The normalised event round-trips as v2.
    assert.deepEqual(decodeEvent(encodeEvent(a)), a);
  }
});

test('v1 is read by its own rules: a v1 text carrying v2 fields does not smuggle them in, and a broken v1 is refused', () => {
  const rng = seeded(4);
  const s = revealDrawn(drawNext(createEvent(input(50), rng), rng));
  const good = JSON.parse(v1Text(s));
  const smuggled = decodeEvent(JSON.stringify({ ...good, setup: { ...good.setup, games: ALL_CARDS }, rounds: [{ ...good.rounds[0], game: 'cards' }] }));
  assert.ok(smuggled);
  assert.deepEqual(smuggled.setup.games, NO_GAMES);
  assert.equal(smuggled.rounds[0].game, null);
  assert.equal(decodeEvent(JSON.stringify({ ...good, rounds: [{ ...good.rounds[0], survivors: good.rounds[0].survivors.slice(1) }] })), null);
});

test('an unknown version is refused, and the store keeps its text untouched', async () => {
  const rng = seeded(5);
  const good = JSON.parse(encodeEvent(createEvent(input(50), rng)));
  for (const v of [0, 3, '2', null]) assert.equal(decodeEvent(JSON.stringify({ ...good, v })), null, `v = ${JSON.stringify(v)}`);
  const origin = fakeOrigin();
  const text = JSON.stringify({ ...good, v: 3 });
  origin.put(DB.name, DB.version, DB.store, DB.key, text);
  const opened = openEventStore(origin.tab('A'));
  await origin.idle();
  const snap = await (await opened).load();
  assert.equal(snap.state, null);
  assert.equal(snap.raw, text);
  assert.equal(origin.get(DB.name, DB.store, DB.key), text);
});

test('a v1 event in the store: the snapshot keeps the v1 text, and the next write compares against exactly it', async () => {
  const rng = seeded(6);
  const s = createEvent(input(50), rng);
  const text = v1Text(s);
  const origin = fakeOrigin();
  origin.put(DB.name, DB.version, DB.store, DB.key, text);
  const opened = openEventStore(origin.tab('A'));
  await origin.idle();
  const store = await opened;
  const snap = await store.load();
  assert.equal(snap.raw, text, 'the snapshot must carry the stored text byte for byte, not a re-encoding');
  assert.equal(snap.state.v, 2);
  assert.equal(origin.get(DB.name, DB.store, DB.key), text, 'reading must not rewrite the record');
  // Must-red: the normalised text is not what is stored, so a compare-and-set on it is stale.
  const wrong = await store.put(encodeEvent(snap.state), revealDrawn(drawNext(snap.state, rng)));
  assert.equal(wrong.ok, false);
  const next = revealDrawn(drawNext(snap.state, rng));
  const r = await store.put(snap.raw, next);
  assert.ok(r.ok, 'a compare-and-set on the original v1 text must succeed');
  assert.deepEqual(decodeEvent(origin.get(DB.name, DB.store, DB.key)), next);
});

// ---- cards

test('a card round deals first and stores the deal; the rule is drawn only on the next step, from that deal', () => {
  const rng = seeded(7);
  const s = createEvent(cardsInput(), rng);
  assert.throws(() => drawNext(s, rng), /deal/, 'a card round must not draw before its deal is stored');
  const dealt = prepareCards(s, rng);
  assert.deepEqual(position(dealt), { kind: 'round', round: 1, at: 'ready' });
  assert.equal(dealt.prepared.round, 1);
  assert.equal(parseCode(dealt.prepared.code, 1).kind, 'deal');
  assert.deepEqual(dealt.prepared.deal.cards.map((c) => c.id), liveIds(s), 'every live id is dealt one card, in roster order');
  assert.deepEqual(decodeEvent(encodeEvent(dealt)), dealt);
  const drawn = drawNext(dealt, rng);
  assert.equal(drawn.prepared, null);
  const rec = drawn.rounds[0];
  assert.equal(rec.game, 'cards');
  assert.equal(rec.code, dealt.prepared.code);
  assert.deepEqual(rec.deal, dealt.prepared.deal);
  const rule = rec.deal.pair[rec.rule];
  assert.deepEqual(rec.survivors, rec.deal.cards.filter((c) => satisfies(rule, c.card)).map((c) => c.id));
});

test('a refreshed prepared deal is never redealt: the stored deal decodes as is, and preparing again throws', () => {
  const rng = seeded(8);
  const dealt = prepareCards(createEvent(cardsInput(), rng), rng);
  const resumed = decodeEvent(encodeEvent(dealt));
  assert.deepEqual(resumed.prepared, dealt.prepared);
  assert.throws(() => prepareCards(resumed, noDraw), /prepared|deal/);
  // The rule draw takes one int and nothing else: no seed, no re-deal.
  let ints = 0;
  const onlyRule = { ...noDraw, int: (n) => (assert.equal(n, 2), ints++, 1) };
  const drawn = drawNext(resumed, onlyRule);
  assert.equal(ints, 1);
  assert.equal(drawn.rounds[0].rule, 1);
});

test('each card rule selects exactly K, counted off the stored faces (gh#300 proof), at every head count edge', () => {
  // Cards play only a round that halves, so the edges are the halving ones: the smallest keep (10 -> 5), the
  // smallest roster with a card round 1 (16 -> 8), an odd keep (74 -> 37), every round (80), the largest (200 -> 100).
  const edges = [[13, 12, 11, 10, 5], [16, 8, 7, 6, 5], [74, 37, 20, 10, 5], HALVES, [200, 100, 50, 10, 5]];
  let rounds = 0;
  for (const schedule of edges) {
    const n = schedule[0];
    const games = { rounds: [1, 2, 3, 4].map((r) => (schedule[r - 1] === 2 * schedule[r] ? 'cards' : null)), final: 'ladder' };
    for (let e = 0; e < 4; e++) {
      const rng = seeded(n * 100 + e);
      let s = createEvent({ ...input(n, games), schedule }, rng);
      for (let r = 1; r <= 4; r++) {
        if (games.rounds[r - 1] !== 'cards') {
          s = advance(revealDrawn(drawNext(s, rng)), rng);
          continue;
        }
        s = prepareCards(s, rng);
        const keep = s.setup.schedule[r];
        for (const rule of s.prepared.deal.pair) {
          assert.equal(s.prepared.deal.cards.filter((c) => satisfies(rule, c.card)).length, keep, `n=${n} round ${r} rule ${rule}`);
        }
        s = drawNext(s, rng);
        assert.equal(s.rounds[r - 1].survivors.length, keep);
        assert.notEqual(decodeEvent(encodeEvent(s)), null, `n=${n} round ${r}: a real deal must decode`);
        s = advance(revealDrawn(s), rng);
        rounds++;
      }
    }
  }
  assert.equal(rounds, (1 + 1 + 3 + 4 + 3) * 4);
});

test('the decoder re-derives every dealt card and both rule counts: any tampered deal or cut reads as no event', () => {
  const rng = seeded(9);
  const s0 = createEvent(cardsInput(), rng);
  const dealt = JSON.parse(encodeEvent(prepareCards(s0, rng)));
  const cut = JSON.parse(encodeEvent(revealDrawn(drawNext(prepareCards(s0, seeded(10)), seeded(11)))));
  assert.notEqual(decodeEvent(JSON.stringify(dealt)), null, 'control: the dealt blob must decode');
  assert.notEqual(decodeEvent(JSON.stringify(cut)), null, 'control: the cut blob must decode');
  const p = dealt.prepared;
  const flip = (c) => ({ ...c, card: { ...c.card, suit: c.card.suit === 'H' ? 'S' : 'H' } });
  // Two holders trade cards: both rule counts still hold, so only re-deriving each card catches it.
  const j = p.deal.cards.findIndex((c) => c.card.suit !== p.deal.cards[0].card.suit || c.card.rank !== p.deal.cards[0].card.rank);
  const traded = p.deal.cards.map((c, i) => (i === 0 ? { ...c, card: p.deal.cards[j].card } : i === j ? { ...c, card: p.deal.cards[0].card } : c));
  // A real deal cut for one more keeper: every card re-derives from its code, only the count is wrong.
  const live0 = liveIds(s0);
  const wide = hostDealRound(s0.eventKey, 1, live0, s0.setup.schedule[1] + 1, seeded(12).float);
  const wideDeal = { pair: [...wide.pair], cards: live0.map((id) => ({ id, card: wide.cards.get(id) })) };
  const r0 = cut.rounds[0];
  const otherRule = r0.rule === 0 ? 1 : 0;
  const variants = {
    'a card that is not the one the code deals': { ...dealt, prepared: { ...p, deal: { ...p.deal, cards: [flip(p.deal.cards[0]), ...p.deal.cards.slice(1)] } } },
    'two holders traded cards': { ...dealt, prepared: { ...p, deal: { ...p.deal, cards: traded } } },
    'a deal that keeps the wrong count': { ...dealt, prepared: { ...p, code: wide.code, deal: wideDeal } },
    'a card missing': { ...dealt, prepared: { ...p, deal: { ...p.deal, cards: p.deal.cards.slice(1) } } },
    'cards out of roster order': { ...dealt, prepared: { ...p, deal: { ...p.deal, cards: [p.deal.cards[1], p.deal.cards[0], ...p.deal.cards.slice(2)] } } },
    'the pair reversed': { ...dealt, prepared: { ...p, deal: { ...p.deal, pair: [p.deal.pair[1], p.deal.pair[0]] } } },
    'a cut code where a deal code belongs': { ...dealt, prepared: { ...p, code: cut.rounds[0].code.slice(0, 9) } },
    'prepared for the wrong round': { ...dealt, prepared: { ...p, round: 2 } },
    'prepared on a round that plays no cards': { ...dealt, setup: { ...dealt.setup, games: { ...dealt.setup.games, rounds: [null, 'cards', 'cards', 'cards'] } } },
    'prepared on a drawn step': { ...cut, at: 'drawn', prepared: p },
    'survivors of the other rule': { ...cut, rounds: [{ ...r0, survivors: liveIds(decodeEvent(JSON.stringify(cut))).filter((id) => satisfies(r0.deal.pair[otherRule], r0.deal.cards.find((c) => c.id === id).card)) }] },
    'a rule that is not 0 or 1': { ...cut, rounds: [{ ...r0, rule: 2 }] },
    'a card round recorded as fireworks': { ...cut, rounds: [{ ...r0, game: 'fireworks' }] },
    'games that are not a valid pick': { ...cut, setup: { ...cut.setup, games: { rounds: ['cards'], final: null } } },
  };
  for (const [label, v] of Object.entries(variants)) assert.equal(decodeEvent(JSON.stringify(v)), null, label);
});

// ---- one stored code form (gh#306 REFUTE round 1)

/** The forms the typed-input parser forgives and a stored code must not take. */
function tamperedForms(code) {
  return {
    'a space': `${code.slice(0, 5)} ${code.slice(5)}`,
    'a hyphen': `${code.slice(0, 5)}-${code.slice(5)}`,
    'Thai numerals': [...code].map((d) => String.fromCodePoint(0x0e50 + Number(d))).join(''),
  };
}

test('a stored code is ASCII digits only: a space, a hyphen or Thai numerals in a prepared deal or a round reads as no event', () => {
  const dealt = prepareCards(createEvent(cardsInput(), seeded(40)), seeded(41));
  const code = dealt.prepared.code;
  assert.match(code, /^[0-9]{12}$/, 'control: the deal code is produced canonical');
  const drawn = drawNext(dealt, seeded(42));
  assert.equal(drawn.rounds[0].code, code, 'the canonical code is carried into the round record as is');
  assert.deepEqual(decodeEvent(encodeEvent(drawn)), drawn, 'control: the canonical round round-trips');
  const plain = drawNext(createEvent(input(50), seeded(43)), seeded(44));
  const cut = plain.rounds[0].code;
  assert.match(cut, /^[0-9]{9}$/);
  for (const [label, t] of Object.entries(tamperedForms(code))) {
    assert.notEqual(parseCode(t, 1), null, `control: the typed-input parser forgives ${label}`);
    const prepared = JSON.parse(encodeEvent(dealt));
    prepared.prepared.code = t;
    assert.equal(decodeEvent(JSON.stringify(prepared)), null, `a prepared deal code with ${label}`);
    assert.throws(() => drawNext({ ...dealt, prepared: { ...dealt.prepared, code: t } }, seeded(42)), /code/, `drawNext kept a deal code with ${label}`);
    const round = JSON.parse(encodeEvent(drawn));
    round.rounds[0].code = t;
    assert.equal(decodeEvent(JSON.stringify(round)), null, `a card round code with ${label}`);
  }
  for (const [label, t] of Object.entries(tamperedForms(cut))) {
    const round = JSON.parse(encodeEvent(plain));
    round.rounds[0].code = t;
    assert.equal(decodeEvent(JSON.stringify(round)), null, `a cut round code with ${label}`);
  }
  // A cut round's code must be a cut code for its round: a wrong check digit, or a deal code, is not one.
  const wrongCheck = `${cut.slice(0, 8)}${(Number(cut[8]) + 1) % 10}`;
  for (const [label, t] of Object.entries({ 'a wrong check digit': wrongCheck, 'a deal code': code, 'no code': '1' })) {
    const round = JSON.parse(encodeEvent(plain));
    round.rounds[0].code = t;
    assert.equal(decodeEvent(JSON.stringify(round)), null, `a cut round code that is ${label}`);
  }
});

// ---- cards only on an exact-half round (owner ruling 2026-11-13, gh#306)

test('cards may be picked only for a round that cuts exactly in half: setup refuses it elsewhere', () => {
  // proposeSchedule(50) is 50 -> 20 -> 10 -> 7 -> 5: only round 2 cuts exactly in half.
  const at = (round) => ({ rounds: [1, 2, 3, 4].map((r) => (r === round ? 'cards' : null)), final: null });
  assert.deepEqual(setupIssues(input(50, at(2))), []);
  for (const round of [1, 3, 4]) {
    assert.deepEqual(setupIssues(input(50, at(round))), [{ kind: 'cards-not-half', round }], `round ${round}`);
    assert.throws(() => createEvent(input(50, at(round)), seeded(50)), /cards-not-half/, `round ${round}`);
  }
  // An odd keep halves too: 74 -> 37.
  assert.deepEqual(setupIssues({ ...input(74, at(1)), schedule: [74, 37, 20, 10, 5] }), []);
  assert.deepEqual(setupIssues({ ...input(74, at(1)), schedule: [74, 36, 20, 10, 5] }), [{ kind: 'cards-not-half', round: 1 }]);
  assert.deepEqual(setupIssues(cardsInput()), [], 'every round of 80 -> 40 -> 20 -> 10 -> 5 halves');
});

test('the decoder refuses a stored event with cards on a round that does not cut exactly in half', () => {
  const s = JSON.parse(encodeEvent(createEvent(input(50), seeded(51))));
  const withCards = (round) => ({ ...s, setup: { ...s.setup, games: { rounds: [1, 2, 3, 4].map((r) => (r === round ? 'cards' : null)), final: null } } });
  assert.notEqual(decodeEvent(JSON.stringify(withCards(2))), null, 'control: cards on the half round decodes');
  for (const round of [1, 3, 4]) assert.equal(decodeEvent(JSON.stringify(withCards(round))), null, `cards on round ${round}`);
});

// ---- the ladder

/** A ladder event at the final, ready. */
function atLadderFinal(seed) {
  const rng = seeded(seed);
  const s = walkRounds(createEvent(input(50, { rounds: [null, null, null, null], final: 'ladder' }), rng), rng);
  return { s, rng };
}

test('a ladder final locks the picks, then draws permutation and slot layout, and its order follows the equation', () => {
  const { s, rng } = atLadderFinal(12);
  const finalists = liveIds(s);
  const picks = [...finalists].reverse();
  assert.throws(() => drawNext(s, rng), /picks/, 'a ladder final needs the five lane picks');
  assert.throws(() => drawNext(s, rng, [finalists[0], ...finalists.slice(0, 4)]), /picks/, 'a finalist picked twice');
  assert.throws(() => drawNext(s, rng, [...finalists.slice(1), 'stranger']), /picks/, 'a pick who is not a finalist');
  const drawn = drawNext(s, rng, picks);
  const f = drawn.final;
  assert.equal(f.game, 'ladder');
  assert.deepEqual(f.picks, picks);
  assert.deepEqual(f.order, ladderOrder(f.picks, f.permutation, f.slotRanks));
  assert.ok(ladderConsistent(f));
  assert.deepEqual(decodeEvent(encodeEvent(drawn)), drawn);
  assert.equal(position(revealDrawn(drawn)).kind, 'final');
  // Picks are refused on a final that is not a ladder.
  const rng2 = seeded(13);
  const fw = walkRounds(createEvent(input(50, { rounds: [null, null, null, null], final: 'fireworks' }), rng2), rng2);
  assert.throws(() => drawNext(fw, rng2, liveIds(fw)), /picks/);
});

test('the ladder draws with the rejection-sampled int only, after the picks, and never from the float', () => {
  const { s } = atLadderFinal(14);
  const calls = [];
  const rng = { float: () => assert.fail('the ladder must not use the float'), hex: () => assert.fail('hex'), int: (n) => (calls.push(n), 0) };
  drawNext(s, rng, liveIds(s));
  assert.deepEqual(calls, [5, 4, 3, 2], 'one Fisher-Yates over the lanes; the slot layout was drawn when the final opened');
});

// The slot layout is on screen while the finalists pick (design/Gh303Ladder.dc.html ld-idle draws the prize
// slots before the press), so it is drawn and stored when the final opens; the permutation stays hidden and
// is drawn only once the picks lock. Equal odds still hold: the permutation is uniform and independent of
// both the picks and the slots (the 10,000-draw test below draws from one stored layout).

const LADDER_ONLY = { rounds: [null, null, null, null], final: 'ladder' };
const recording = (calls, base = noDraw) => ({ ...noDraw, int: (n) => (calls.push(n), base === noDraw ? n - 1 : base.int(n)) });

test('opening a ladder final draws its slot layout and nothing else, before any pick, and stores it', () => {
  const rng = seeded(31);
  let s = createEvent(input(50, LADDER_ONLY), rng);
  for (let r = 1; r <= 3; r++) s = advance(revealDrawn(drawNext(s, rng)), noDraw);
  const r4 = revealDrawn(drawNext(s, rng));
  assert.throws(() => advance(r4), /slot/, 'the step into a ladder final draws: it needs the random source');
  const calls = [];
  const open = advance(r4, recording(calls));
  assert.deepEqual(calls, [5, 4, 3, 2], 'one Fisher-Yates over the slots, at the open');
  assert.deepEqual(position(open), { kind: 'final', at: 'ready' });
  assert.equal(open.final, null, 'nothing of the final is drawn before the picks');
  assert.deepEqual(Object.keys(open.prepared).sort(), ['game', 'picks', 'slotRanks']);
  assert.deepEqual(open.prepared.picks, [null, null, null, null, null], 'the slot layout is the only fact drawn before the picks');
  assert.equal(open.prepared.game, 'ladder');
  assert.ok(isFiveLanes(open.prepared.slotRanks));
  assert.deepEqual(decodeEvent(encodeEvent(open)), open);
  // A round that opens no ladder final draws nothing on its advance.
  const rng2 = seeded(32);
  const fw = walkRounds(createEvent(input(50, { rounds: [null, null, null, null], final: 'fireworks' }), rng2), rng2);
  assert.equal(fw.prepared, null);
});

test('the slot layout never changes after the picks start, and only the permutation is drawn at the lock', () => {
  const { s } = atLadderFinal(33);
  const slots = [...s.prepared.slotRanks];
  const finalists = liveIds(s);
  for (let seed = 0; seed < 40; seed++) {
    const order = seeded(seed);
    const picks = [...finalists];
    for (let i = picks.length - 1; i > 0; i--) {
      const j = order.int(i + 1);
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    const calls = [];
    const drawn = drawNext(s, recording(calls, seeded(500 + seed)), picks);
    assert.deepEqual(drawn.final.slotRanks, slots, `seed ${seed}: the lock redrew the slots`);
    assert.deepEqual(calls, [5, 4, 3, 2], `seed ${seed}: the lock drew more than the permutation`);
    assert.equal(drawn.prepared, null, 'the drawn final keeps nothing prepared');
    assert.ok(ladderConsistent(drawn.final));
  }
  assert.deepEqual(s.prepared.slotRanks, slots, 'drawing never touched the stored layout');
});

// The lane picks are stored as they are made (gh#307 REFUTE P2): `prepared.picks[lane]` is the finalist on
// that start lane, or null. A reload, or a second tab, reads the same picks; the slot layout beside them is
// never touched, and the permutation is still drawn only at the lock.

test('a ladder final opens with five empty lanes stored beside its slot layout', () => {
  const { s } = atLadderFinal(40);
  assert.deepEqual(s.prepared.picks, [null, null, null, null, null]);
});

test('pickLane stores one assignment at a time; a finalist moved to a lane leaves the old one; the slot layout stays byte-identical', () => {
  const { s, rng } = atLadderFinal(41);
  const slots = JSON.stringify(s.prepared.slotRanks);
  const [a, b, c, d, e] = liveIds(s);
  let t = pickLane(s, 3, a);
  assert.deepEqual(t.prepared.picks, [null, null, null, a, null]);
  t = pickLane(t, 0, b);
  t = pickLane(t, 1, a); // a moves from lane 4 to lane 2
  assert.deepEqual(t.prepared.picks, [b, a, null, null, null]);
  t = pickLane(t, 0, null); // lane 1 emptied
  assert.deepEqual(t.prepared.picks, [null, a, null, null, null]);
  assert.equal(JSON.stringify(t.prepared.slotRanks), slots, 'a pick touched the slot layout');
  assert.deepEqual(decodeEvent(encodeEvent(t)), t, 'a partial assignment decodes');
  assert.throws(() => pickLane(t, 2, 'stranger'), /finalist/);
  assert.throws(() => pickLane(t, 5, c), /lane/);
  assert.throws(() => pickLane(t, -1, c), /lane/);
  const rng2 = seeded(42);
  const fw = walkRounds(createEvent(input(50, { rounds: [null, null, null, null], final: 'fireworks' }), rng2), rng2);
  assert.throws(() => pickLane(fw, 0, liveIds(fw)[0]), /ladder/);
  for (const [lane, id] of [[0, e], [2, d], [3, c], [4, b]]) t = pickLane(t, lane, id);
  assert.equal(JSON.stringify(t.prepared.slotRanks), slots);
  // The lock reads the stored picks and draws only the permutation.
  const calls = [];
  const drawn = drawNext(t, recording(calls, rng));
  assert.deepEqual(calls, [5, 4, 3, 2]);
  assert.deepEqual(drawn.final.picks, [e, a, d, c, b]);
  assert.equal(JSON.stringify(drawn.final.slotRanks), slots);
});

test('decode refuses stored lane picks that are duplicates, non-finalists, or more than five lanes', () => {
  const { s } = atLadderFinal(43);
  const [a, b] = liveIds(s);
  const good = JSON.parse(encodeEvent(pickLane(pickLane(s, 0, a), 2, b)));
  assert.notEqual(decodeEvent(JSON.stringify(good)), null);
  const p = good.prepared;
  const variants = {
    'a finalist on two lanes': [a, null, a, null, null],
    'someone who is not a finalist': [a, null, s.setup.people.find((x) => !liveIds(s).includes(x.id)).id, null, null],
    'not an id at all': [a, null, 7, null, null],
    'six lanes': [a, null, b, null, null, null],
    'four lanes': [a, null, b, null],
    'no picks': undefined,
  };
  for (const [label, picks] of Object.entries(variants)) {
    const prepared = picks === undefined ? { game: 'ladder', slotRanks: p.slotRanks } : { ...p, picks };
    assert.equal(decodeEvent(JSON.stringify({ ...good, prepared })), null, label);
  }
});

test('decode: a ready ladder final holds its slot layout, and no other step holds one', () => {
  const { s, rng } = atLadderFinal(34);
  const good = JSON.parse(encodeEvent(s));
  assert.notEqual(decodeEvent(JSON.stringify(good)), null);
  const r4 = JSON.parse(encodeEvent(revealDrawn(drawNext(createEvent(input(50, LADDER_ONLY), seeded(35)), seeded(36)))));
  const drawn = JSON.parse(encodeEvent(drawNext(s, rng, liveIds(s))));
  const fw = JSON.parse(encodeEvent(walkRounds(createEvent(input(50, { rounds: [null, null, null, null], final: 'fireworks' }), seeded(37)), seeded(37))));
  const variants = {
    'a ready ladder final with no slot layout': { ...good, prepared: null },
    'a slot layout off the five lanes': { ...good, prepared: { game: 'ladder', slotRanks: [0, 0, 1, 2, 3] } },
    'a slot layout of four': { ...good, prepared: { game: 'ladder', slotRanks: [0, 1, 2, 3] } },
    'a deal where the slot layout belongs': { ...good, prepared: { game: 'cards', round: 5, code: '1', deal: null } },
    'a slot layout on a round': { ...r4, at: 'ready', rounds: [], prepared: good.prepared },
    'a slot layout on a drawn final': { ...drawn, prepared: good.prepared },
    'a slot layout on a fireworks final': { ...fw, prepared: good.prepared },
  };
  for (const [label, v] of Object.entries(variants)) assert.equal(decodeEvent(JSON.stringify(v)), null, label);
});

test('every permutation, slot layout and pick order the ladder can draw decodes; a broken equation does not', () => {
  const { s, rng } = atLadderFinal(15);
  const good = JSON.parse(encodeEvent(drawNext(s, rng, liveIds(s))));
  const lanes = [0, 1, 2, 3, 4];
  const perms = [];
  const permute = (prefix, rest) => (rest.length ? rest.forEach((x, i) => permute([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)])) : perms.push(prefix));
  permute([], lanes);
  assert.equal(perms.length, 120);
  const finalists = liveIds(s);
  let checked = 0;
  for (const [i, permutation] of perms.entries()) {
    const slotRanks = perms[(i * 37) % 120];
    const picks = perms[(i * 53 + 7) % 120].map((k) => finalists[k]);
    const final = { order: ladderOrder(picks, permutation, slotRanks), game: 'ladder', picks, permutation, slotRanks };
    assert.notEqual(decodeEvent(JSON.stringify({ ...good, final })), null, `permutation ${permutation}`);
    checked++;
  }
  assert.equal(checked, 120);
  const f = good.final;
  const variants = {
    'an order the equation does not give': { ...f, order: [f.order[1], f.order[0], ...f.order.slice(2)] },
    'a permutation that is not a bijection': { ...f, permutation: [0, 0, 1, 2, 3] },
    'a slot layout off the five lanes': { ...f, slotRanks: [1, 2, 3, 4, 5] },
    'picks that are not the finalists': { ...f, picks: [f.picks[0], f.picks[0], ...f.picks.slice(2)] },
    'a ladder final recorded as fireworks': { ...f, game: 'fireworks' },
  };
  for (const [label, final] of Object.entries(variants)) assert.equal(decodeEvent(JSON.stringify({ ...good, final })), null, label);
});

test('drawAndSave passes the picks through and stores nothing of a failed write', async () => {
  const { s, rng } = atLadderFinal(16);
  const picks = liveIds(s);
  let written = null;
  const ok = await drawAndSave(s, rng, (x) => ((written = x), true), picks);
  assert.ok(ok.ok);
  assert.deepEqual(written.final.picks, picks);
  const failed = await drawAndSave(s, rng, () => false, picks);
  assert.equal(failed.ok, false);
  assert.equal(failed.state, s);
});

test('equal odds on the ladder: with the picks fixed, each finalist lands on first prize equally often (|z| <= 4.5 over 10,000 draws)', () => {
  const { s } = atLadderFinal(17);
  const picks = liveIds(s);
  const rng = seeded(18);
  const firsts = new Map(picks.map((id) => [id, 0]));
  const N = 10000;
  for (let i = 0; i < N; i++) {
    const f = drawNext(s, rng, picks).final;
    firsts.set(f.order[0], firsts.get(f.order[0]) + 1);
  }
  const p = 1 / 5;
  const sd = Math.sqrt(N * p * (1 - p));
  for (const [id, k] of firsts) assert.ok(Math.abs(k - N * p) / sd <= 4.5, `${id}: ${k}`);
});
