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
import { screenView } from './view.ts';
import { renderScreen } from '../play/_prize-reveal/reveal.ts';
import { makeDoc } from './fake-dom.mjs';
import { chooseRule, enterCode, freshReveal, revealView } from '../prize-join/reveal.ts';
import { REVEAL_COPY, mountJoin } from '../prize-join/join-page.ts';
import { storageKey } from '../prize-join/join.ts';
import { COPY as CARD_COPY } from '../play/prize-cards/renderer/copy.ts';

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

// gh#309: the same agreement, end to end through what each side SHOWS. The codes are read off the
// projector's own view at the step that paints them (a cut round's reveal, a card round's deal, the
// result), the drawn rule as its rule card names it; the phone side is the page's own flow (reveal.ts),
// and for every finalist the real page, whose claim screen must name the projector's winner of its place.

/** Walk a QR event as the projector does, keeping the code each step painted. */
function walkShown(rng) {
  let s = createEvent(qrInput(), rng);
  const shown = [];
  for (let r = 1; r <= 4; r++) {
    const cards = s.setup.games.rounds[r - 1] === 'cards';
    if (cards) {
      s = prepareCards(s, rng);
      shown.push(screenView(s).code);
    }
    s = revealDrawn(drawNext(s, rng));
    if (cards) assert.equal(screenView(s).code, undefined, `round ${r}: a card round paints its code at the deal only`);
    else shown.push(screenView(s).code);
    assert.equal(shown[r - 1].round, r, `round ${r}: the code card names another round`);
    s = advance(s, rng);
  }
  s = revealDrawn(drawNext(s, rng, [...liveIds(s)].reverse()));
  const view = screenView(s);
  assert.equal(view.claim, true, 'the result draws the claim line in QR mode');
  return { s, shown, final: view.code };
}

/** The rule index on the phone's own pair for the rule the projector's card names. */
const tapped = (screen, r) => screen.pair.findIndex((rule) => CARD_COPY.rule[rule] === CARD_COPY.rule[r.deal.pair[r.rule]]);

test('every member: the phone flow fed the codes the projector painted reaches the projector\'s outcome', () => {
  const { s, shown, final } = walkShown(seeded(11));
  assert.ok(final, 'no final code painted');
  let finalists = 0;
  for (const { id } of s.setup.people) {
    let rec = { ...freshReveal(PIN), member: 'confirmed', started: true };
    for (let r = 1; r <= 4; r++) {
      const round = s.rounds[r - 1];
      rec = enterCode(rec, id, shown[r - 1].digits);
      assert.ok(rec, `${id}: the phone refused the code painted for round ${r}`);
      let { screen } = revealView(rec, id);
      if (round.game === 'cards') {
        assert.equal(screen.kind, 'card', `${id} round ${r}: no card before the rule`);
        assert.deepEqual(screen.card, round.deal.cards.find((c) => c.id === id).card, `${id} round ${r}: another card`);
        rec = chooseRule(rec, id, tapped(screen, round));
        screen = revealView(rec, id).screen;
      }
      const kept = round.survivors.includes(id);
      assert.equal(screen.kind, kept ? 'pass' : 'out', `${id} round ${r}: phone and projector disagree`);
      assert.equal(screen.round, r);
      if (!kept) break;
    }
    if (!s.final.order.includes(id)) continue;
    finalists++;
    rec = enterCode(rec, id, final.digits);
    const { screen } = revealView(rec, id);
    const slot = s.final.order.indexOf(id);
    // The final code carries the prize count: a place past it holds no prize and reads out (ADR-0079).
    const want = slot < s.setup.prizes.length ? { kind: 'claim', slot } : { kind: 'out', round: 5 };
    assert.deepEqual(screen, want, `${id}: another place in the final`);
  }
  assert.equal(finalists, 5);
  assert.equal(s.setup.prizes.length, 3, 'the walk must leave finalists past the prize count');
});

test('the claim screen names the projector\'s winner of the place the phone computed', async () => {
  const { s, shown, final } = walkShown(seeded(11));
  const shownWinners = screenView(s).winners;
  for (const id of s.final.order) {
    const person = s.setup.people.find((p) => p.id === id);
    const doc = makeDoc();
    const root = doc.createElement('main');
    doc.body.append(root);
    const kv = new Map([[storageKey('AbCdEfGhIjKlMnOpQrStUv'), JSON.stringify({ token: 'T'.repeat(32), id, name: person.name })]]);
    // The phone has typed every code already and the status answered: the page draws from the record.
    let rec = { ...freshReveal(PIN), member: 'confirmed', started: true };
    s.rounds.forEach((round, i) => {
      rec = enterCode(rec, id, shown[i].digits);
      if (round.game === 'cards') rec = chooseRule(rec, id, tapped(revealView(rec, id).screen, round));
    });
    rec = enterCode(rec, id, final.digits);
    kv.set('watduang:prize-draw:reveal:AbCdEfGhIjKlMnOpQrStUv', JSON.stringify(rec));
    mountJoin(root, {
      gameName: 'x',
      location: { pathname: '/', search: '', hash: `#event=AbCdEfGhIjKlMnOpQrStUv&pin=${PIN}` },
      history: { replaceState: () => {} },
      session: null,
      storage: { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => kv.set(k, String(v)) },
      fetch: () => assert.fail('a server call on a page whose codes are all typed'),
      getRandomValues: (a) => a,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    const slot = s.final.order.indexOf(id);
    if (slot >= s.setup.prizes.length) {
      assert.equal(root.querySelector('.pj-prize'), null, `${person.name}: a claim for a place with no prize`);
      assert.equal(root.querySelector('h1').textContent, REVEAL_COPY.outHeading(5));
      continue;
    }
    const place = root.querySelector('.pj-pz').textContent;
    const shownName = root.querySelector('.pj-prize').querySelector('.pj-who').textContent;
    assert.equal(place, REVEAL_COPY.prize(slot + 1), `${person.name}: another place`);
    // The projector draws a winner card for each prize; a place past the prize count has none.
    const card = shownWinners.find((w) => w.place === slot + 1);
    if (card) assert.equal(shownName, card.name, `the phone of ${person.name} shows a name the projector does not show for its place`);
  }
  assert.ok(shownWinners.length >= 3, 'the walk paints too few winners to prove anything');
});

test('the code card lists every earlier round\'s code, in round order, under its label (gh#300 condition 1)', () => {
  const { s, shown, final } = walkShown(seeded(11));
  // A card round in the history carries the rule its main screen drew (REFUTE r1 finding 2).
  const own = (c, i) => {
    const r = s.rounds[i];
    return r.game === 'cards' ? { round: c.round, digits: c.digits, rule: r.deal.pair[r.rule] } : { round: c.round, digits: c.digits };
  };
  shown.forEach((code, i) => assert.deepEqual(code.earlier, shown.slice(0, i).map(own), `round ${i + 1}`));
  assert.deepEqual(final.earlier, shown.map(own), 'the final lists all four round codes');
  // As painted: the label, then one item per earlier round, its round and its digits as the card groups them.
  const doc = makeDoc();
  const frame = doc.createElement('div');
  doc.body.append(frame);
  renderScreen(frame, screenView(s), doc);
  const list = frame.querySelector('.pd-codebox').querySelector('.pd-earlier');
  assert.ok(list, 'no earlier-codes list on the final code card');
  assert.equal(list.querySelector('.pd-ek').textContent, 'รหัสรอบก่อนหน้า');
  const items = list.querySelectorAll('.pd-eitem').map((it) => [it.querySelector('.pd-er').textContent, it.querySelector('.pd-ed').textContent.replace(/ /g, '')]);
  assert.deepEqual(items, shown.map((c) => [`รอบที่ ${c.round}`, c.digits]));
});

// REFUTE r1 finding 2: a latecomer who saw no round as it happened catches up from the final's code card
// alone: every earlier code, and for a card round the rule drawn, read as the card paints it (the rule card's
// words, which are the phone's rule-tap labels). Every member must reach the projector's outcome that way.
test('every member catching up from the final code card alone reaches the projector\'s outcome, card rounds included', () => {
  const { s, final } = walkShown(seeded(11));
  const doc = makeDoc();
  const frame = doc.createElement('div');
  doc.body.append(frame);
  renderScreen(frame, screenView(s), doc);
  const painted = frame.querySelectorAll('.pd-eitem').map((it) => ({
    digits: it.querySelector('.pd-ed').textContent.replace(/ /g, ''),
    rule: it.querySelector('.pd-eru')?.textContent ?? null,
  }));
  assert.equal(painted.length, 4);
  s.rounds.forEach((r, i) => {
    const want = r.game === 'cards' ? CARD_COPY.rule[r.deal.pair[r.rule]] : null;
    assert.equal(painted[i].rule, want, `round ${r.round}: the card paints ${painted[i].rule} for the drawn rule`);
  });
  for (const { id } of s.setup.people) {
    let rec = { ...freshReveal(PIN), member: 'confirmed', started: true };
    let alive = true;
    for (const [i, item] of painted.entries()) {
      rec = enterCode(rec, id, item.digits);
      let { screen } = revealView(rec, id);
      if (screen.kind === 'card') {
        rec = chooseRule(rec, id, screen.pair.findIndex((rule) => CARD_COPY.rule[rule] === item.rule));
        screen = revealView(rec, id).screen;
      }
      alive = alive && s.rounds[i].survivors.includes(id);
      assert.equal(screen.kind, alive ? 'pass' : 'out', `${id} round ${i + 1}`);
      if (!alive) break;
    }
    if (!alive) continue;
    rec = enterCode(rec, id, final.digits);
    const slot = s.final.order.indexOf(id);
    assert.deepEqual(revealView(rec, id).screen, slot < s.setup.prizes.length ? { kind: 'claim', slot } : { kind: 'out', round: 5 }, id);
  }
});
