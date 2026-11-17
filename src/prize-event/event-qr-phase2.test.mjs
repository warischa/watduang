// node --test — gh#308 agreement for the phase-2 games: a QR-mode event whose rounds play `zones` and `marbles`
// and whose final plays `envelopes` or `flipcards`, with 1 to 5 prizes. A phone holding only (PIN, its join id,
// the round codes) must reach exactly what the projector stored, after every round and at the final. The final's
// object picks are walked as the projector stores them (one write at a time, each read back through the decoder)
// and never reach a phone: its place comes from the final code alone, which encodes the plain uniform order.
// The fixed event in event-qr.test.mjs stays as it is; this is a second one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, createEvent, decodeEvent, drawNext, encodeEvent, liveIds, pickObject, revealDrawn } from './event.ts';
import { hostFinalCode, phoneFinalSlot, phoneVerdicts } from '../prize-draw/round-code.ts';
import { screenView } from './view.ts';

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
/** A QR-mode event takes its ids and key from the server: its source must never be asked for hex. */
const noHex = (rng) => ({ ...rng, hex: () => assert.fail('a QR-mode event generated its own id or key') });
const noDraw = {
  float: () => assert.fail('drew a float'),
  int: () => assert.fail('drew an int'),
  hex: () => assert.fail('drew hex'),
};

const PIN = '048213';
const WRONG_PIN = '048214';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** A server join id: 22 base64url characters. */
const serverId = (i) => B64[i >> 6] + B64[i & 63] + Array.from({ length: 20 }, (_, k) => B64[(i * 7 + k * 13) % 64]).join('');
const ROSTER = Array.from({ length: 80 }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
const SCHEDULE = [80, 40, 20, 10, 5];
const PRIZES = ['TV', 'Bike', 'Fryer', 'Fan', 'Mug'];

const EVENTS = [
  { final: 'envelopes', rounds: ['zones', 'marbles', 'zones', 'marbles'] },
  { final: 'flipcards', rounds: ['marbles', 'zones', 'marbles', 'zones'] },
];

/** Read a state back as the store would hand it to the next screen. */
const stored = (s) => {
  const back = decodeEvent(encodeEvent(s));
  assert.ok(back, 'a walked state does not read back');
  assert.deepEqual(back, s, 'a walked state reads back as something else');
  return back;
};

/** What the projector stored for `id` over the committed rounds: in until the first round that cut it. */
const truth = (s, id) => {
  let alive = true;
  return s.rounds.map((r) => ((alive = alive && r.survivors.includes(id)) ? 'in' : 'out'));
};

/** Every member's phone verdicts over the codes committed so far must be the projector's record. */
function agreeOnRounds(s, label) {
  const entries = s.rounds.map((r) => ({ code: r.code }));
  let wrongKeyDiffers = 0;
  for (const { id } of s.setup.people) {
    assert.deepEqual(phoneVerdicts(PIN, id, entries, 'confirmed').verdicts, truth(s, id), `${label}: phone and projector disagree for ${id}`);
    if (phoneVerdicts(WRONG_PIN, id, entries, 'confirmed').verdicts.join() !== truth(s, id).join()) wrongKeyDiffers++;
  }
  assert.ok(wrongKeyDiffers > 0, `${label}: another PIN tells the same story, so the key proves nothing`);
}

/** Walk one event: four rounds, then the MC's five object picks one stored write at a time, then the draw. */
function walk({ final, rounds }, prizes, seed, reversed = true) {
  const rng = seeded(seed);
  let s = stored(
    createEvent(
      { eventName: 'Party', names: ROSTER.map((p) => p.name), schedule: SCHEDULE, prizes: PRIZES.slice(0, prizes), games: { rounds, final }, qr: { pin: PIN, roster: ROSTER } },
      noHex(rng),
    ),
  );
  for (let r = 1; r <= 4; r++) {
    s = stored(revealDrawn(drawNext(s, rng)));
    assert.equal(s.rounds[r - 1].game, rounds[r - 1]);
    agreeOnRounds(s, `${final} ${prizes} prizes, after round ${r}`);
    // The step into the final draws nothing, so a source that fails on any draw is enough.
    s = stored(advance(s, r < 4 ? rng : noDraw));
  }
  assert.deepEqual(s.prepared, { game: final, picks: [null, null, null, null, null] });
  // The MC places the finalists, one write per pick, each read back as the store would: reversed (object 0
  // holds the last finalist) or in roster order.
  const finalists = liveIds(s);
  const placement = reversed ? [...finalists].reverse() : finalists;
  for (const object of [4, 3, 2, 1, 0]) s = stored(pickObject(s, object, placement[object]));
  s = stored(revealDrawn(drawNext(s, rng)));
  assert.deepEqual(s.final.picks, placement);
  return s;
}

for (const event of EVENTS) {
  for (let prizes = 1; prizes <= 5; prizes++) {
    test(`QR mode, ${event.rounds.join('/')} then ${event.final}, ${prizes} prize(s): every phone reaches the projector's record at every step`, () => {
      const s = walk(event, prizes, 40 + prizes);
      const order = s.final.order;
      const code = hostFinalCode(PIN, order, prizes);
      assert.ok(code, 'no final code for this order: pick another seed, never special-case it');
      // The code a phone types is the one the projector paints on its result.
      assert.equal(screenView(s).finalCode?.digits, code, 'the projector paints another final code');
      const entries = s.rounds.map((r) => ({ code: r.code }));
      let finalists = 0;
      let wrongKeyDiffers = 0;
      for (const { id } of s.setup.people) {
        const slot = phoneFinalSlot(PIN, id, entries, code, 'confirmed');
        if (order.includes(id)) {
          finalists++;
          assert.deepEqual(slot, { verdict: 'in', slot: order.indexOf(id), prizes, provisional: false }, `${id}: another place in the final`);
        } else {
          assert.deepEqual(slot, { verdict: 'out', slot: null, prizes: null, provisional: false }, `${id}: a place for someone cut before the final`);
        }
        const other = phoneFinalSlot(WRONG_PIN, id, entries, code, 'confirmed');
        if (other.verdict !== slot.verdict || other.slot !== slot.slot) wrongKeyDiffers++;
      }
      assert.equal(finalists, 5);
      assert.ok(wrongKeyDiffers > 0, 'another PIN gives every phone the same final: the key proves nothing');
      // The phone never sees the picks: walked again with the opposite placement, the order and code stand.
      const again = walk(event, prizes, 40 + prizes, false);
      assert.notDeepEqual(again.final.picks, s.final.picks, 'precondition: the second walk placed the finalists otherwise');
      assert.deepEqual(again.final.order, order, 'the placement moved the order');
    });
  }
}
