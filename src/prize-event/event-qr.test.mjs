// node --test — gh#308, ADR-0076 Identity: a QR-mode event is built from the server's frozen roster, so each
// person's id is their server join id and the event key is the event's PIN. A phone holds exactly those two
// (its join answer and the QR link), so this file pins that a phone computing its own result from (PIN, its
// join id, the round codes) gets exactly what the projector stored, for cut rounds, card rounds and a ladder
// final; and that the decoder accepts the server's shapes and nothing looser, with admin-mode shapes as
// before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, createEvent, decodeEvent, drawNext, encodeEvent, liveIds, prepareCards, revealDrawn } from './event.ts';
import { hostFinalCode, phoneFinalSlot, phoneVerdicts } from '../prize-draw/round-code.ts';
import { phoneCard } from '../prize-draw/cards.ts';
import { fakeOrigin } from './fake-idb.mjs';
import { openEventStore } from './store.ts';

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
/** A source whose hex must never be asked for: QR mode takes its ids and key from the server. */
const noHex = (rng) => ({ ...rng, hex: () => assert.fail('a QR-mode event generated its own id or key') });

const PIN = '048213';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** A server join id: 22 base64url characters, every alphabet character used somewhere across the roster. */
const serverId = (i) => B64[i >> 6] + B64[i & 63] + Array.from({ length: 20 }, (_, k) => B64[(i * 7 + k * 13) % 64]).join('');
const roster = (n) => Array.from({ length: n }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
const HALVES = [80, 40, 20, 10, 5];
const GAMES = { rounds: [null, 'cards', 'fireworks', 'cards'], final: 'ladder' };

const qrInput = (people = roster(80), pin = PIN, extra = {}) => ({
  eventName: 'Party',
  names: people.map((p) => p.name),
  schedule: HALVES,
  prizes: ['TV', 'Bike', 'Fryer'],
  games: GAMES,
  qr: { pin, roster: people },
  ...extra,
});

test('QR mode: createEvent stores the server ids and the PIN, generates neither, and round-trips', () => {
  const people = roster(80);
  const ev = createEvent(qrInput(people), noHex(seeded(1)));
  assert.equal(ev.eventKey, PIN);
  assert.deepEqual(ev.setup.people, people);
  assert.deepEqual(decodeEvent(encodeEvent(ev)), ev);
});

test('QR mode: createEvent refuses a roster or PIN the server never issues', () => {
  const rng = seeded(2);
  const people = roster(80);
  const bad = [
    qrInput(people, '04821'),
    qrInput(people, '0482130'),
    qrInput(people, '๐๔๘๒๑๓'),
    qrInput(people, '04-213'),
    qrInput([{ id: `${serverId(0).slice(0, 21)}+`, name: 'P1' }, ...people.slice(1)]),
    qrInput([{ id: serverId(0).slice(0, 21), name: 'P1' }, ...people.slice(1)]),
    qrInput([people[1], ...people.slice(1)].map((p, i) => ({ ...p, name: `P${i + 1}` }))),
    { ...qrInput(people), names: [...people.slice(1).map((p) => p.name), 'Other'] },
    qrInput([{ id: serverId(0), name: ' P1' }, ...people.slice(1)]),
  ];
  for (const input of bad) assert.throws(() => createEvent(input, rng), RangeError, JSON.stringify(input.qr.pin) + ' ' + input.qr.roster[0].id);
});

test('the decoder takes exactly the two shapes: server ids with a 6-digit PIN, or hex ids with a hex key', () => {
  const qr = createEvent(qrInput(), seeded(3));
  const raw = encodeEvent(qr);
  assert.ok(decodeEvent(raw));
  const admin = createEvent({ eventName: 'A', names: roster(20).map((p) => p.name), schedule: [20, 15, 10, 7, 5], prizes: ['TV'] }, seeded(4));
  assert.match(admin.eventKey, /^[0-9a-f]{16}$/);
  assert.ok(decodeEvent(encodeEvent(admin)), 'an admin-mode event no longer reads back');
  const withKey = (ev, eventKey) => JSON.stringify({ ...ev, eventKey });
  const withId = (ev, id) => JSON.stringify({ ...ev, setup: { ...ev.setup, people: [{ ...ev.setup.people[0], id }, ...ev.setup.people.slice(1)] } });
  const nearMisses = {
    'a 5-digit PIN': withKey(qr, '04821'),
    'a 7-digit PIN': withKey(qr, '0482130'),
    'a PIN in Thai digits': withKey(qr, '๐๔๘๒๑๓'),
    'a PIN key with a hex id': withId(qr, admin.setup.people[0].id),
    'an id with a bad character': withId(qr, `${serverId(0).slice(0, 21)}=`),
    'an id one character short': withId(qr, serverId(0).slice(0, 21)),
    'an id one character long': withId(qr, `${serverId(0)}A`),
    'admin: a hex key one character short': withKey(admin, admin.eventKey.slice(0, 15)),
    'admin: an uppercase hex key': withKey(admin, admin.eventKey.toUpperCase()),
    'admin: a hex key with a server id': withId(admin, serverId(0)),
    'admin: a PIN key with hex ids': withKey(admin, PIN),
  };
  for (const [label, text] of Object.entries(nearMisses)) assert.equal(decodeEvent(text), null, label);
});

test('a stored QR-mode event goes through the store: compare-and-set put, load', async () => {
  const origin = fakeOrigin();
  const store = await openEventStore(origin.tab('A'));
  const ev = createEvent(qrInput(), seeded(5));
  const before = await store.load();
  const put = await store.put(before.raw, ev);
  assert.ok(put.ok, 'the store refused a QR-mode event');
  const now = await store.load();
  assert.deepEqual(now.state, ev);
  // A put over a snapshot that is no longer stored is refused like any other, PIN key or not: here another
  // QR event (another PIN) over the text read before the first one landed.
  const other = createEvent(qrInput(roster(80), '731906'), seeded(7));
  const stale = await store.put(before.raw, other);
  assert.equal(stale.ok, false, 'a QR-mode event replaced the stored one from a stale snapshot');
  assert.equal(stale.reason, 'stale');
  assert.deepEqual(stale.now.state, ev);
  assert.deepEqual((await store.load()).state, ev, 'the stored event moved');
});

/** Walk a QR event to its drawn final: card rounds deal first; the ladder takes the finalists reversed. */
function walk(rng) {
  let s = createEvent(qrInput(), rng);
  for (let r = 1; r <= 4; r++) {
    if (s.setup.games.rounds[r - 1] === 'cards') s = prepareCards(s, rng);
    s = advance(revealDrawn(drawNext(s, rng)), rng);
  }
  s = revealDrawn(drawNext(s, rng, [...liveIds(s)].reverse()));
  return decodeEvent(encodeEvent(s));
}

test('a phone with only (PIN, its join id, the round codes) computes exactly what the projector stored', () => {
  const s = walk(seeded(6));
  assert.ok(s, 'the walked event does not read back');
  const entries = s.rounds.map((r) => (r.game === 'cards' ? { code: r.code, rule: r.rule } : { code: r.code }));
  assert.deepEqual(s.rounds.map((r) => r.game), ['null', 'cards', 'fireworks', 'cards'].map((g) => (g === 'null' ? null : g)));
  const order = s.final.order;
  const finalCode = hostFinalCode(PIN, order);
  assert.ok(finalCode, 'no final code for this order');
  let disagreeWithWrongKey = 0;
  for (const { id } of s.setup.people) {
    // What the projector stored for this person, round by round.
    let alive = true;
    const truth = s.rounds.map((r) => (alive = alive && r.survivors.includes(id)) ? 'in' : 'out');
    const phone = phoneVerdicts(PIN, id, entries, 'confirmed');
    assert.deepEqual(phone.verdicts, truth, `phone and projector disagree for ${id}`);
    // A card round's face is the phone's own derivation too.
    for (const r of s.rounds.filter((x) => x.game === 'cards')) {
      const dealt = r.deal.cards.find((c) => c.id === id);
      if (dealt) assert.deepEqual(phoneCard(PIN, id, r.round, r.code), dealt.card);
    }
    const slot = phoneFinalSlot(PIN, id, entries, finalCode, 'confirmed');
    assert.equal(slot.slot, order.includes(id) ? order.indexOf(id) : null, `final slot for ${id}`);
    // Discriminator: the same codes under another PIN tell a different story for someone.
    if (phoneVerdicts('048214', id, entries, 'confirmed').verdicts.join() !== truth.join()) disagreeWithWrongKey++;
  }
  assert.ok(disagreeWithWrongKey > 0, 'the key does not matter: this test proves nothing about it');
});
