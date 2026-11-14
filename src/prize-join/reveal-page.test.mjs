// node --test — gh#309: the phone's result flow, driven through the real page code (join-page.ts) on the
// prize-draw fake DOM, against a QR event the projector's own walk produced (event.ts). Covers every screen
// after joining: code entry, a wrong code, in, out, a card round's card and its rule, removed, provisional,
// and the claim. The network is a fetch double that answers the one status call and is then CUT: any later
// call fails the test, so no result on this page can depend on a server call at reveal time.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { makeDoc } from '../prize-event/fake-dom.mjs';
import { advance, createEvent, decodeEvent, drawNext, encodeEvent, liveIds, prepareCards, revealDrawn, winners } from '../prize-event/event.ts';
import { hostFinalCode } from '../prize-draw/round-code.ts';
import { ARM_DELAY_MS } from '../games/_arm-gate.ts';
import { COPY as CARD_COPY } from '../play/prize-cards/renderer/copy.ts';
import { ANSWER_COPY, REVEAL_COPY, mountJoin } from './join-page.ts';
import { storageKey } from './join.ts';
import { chooseRule, enterCode, freshReveal, revealKey, revealView } from './reveal.ts';
import { readFileSync } from 'node:fs';
import { screenView } from '../prize-event/view.ts';

const EV = 'AbCdEfGhIjKlMnOpQrStUv';
const PIN = '048213';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const serverId = (i) => B64[i >> 6] + B64[i & 63] + Array.from({ length: 20 }, (_, k) => B64[(i * 7 + k * 13) % 64]).join('');

function seeded(seed) {
  let a = seed >>> 0;
  const float = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { float, int: (n) => Math.floor(float() * n), hex: () => assert.fail('QR mode generates no id') };
}

/** A QR event walked to its drawn final by the projector's own functions: round 2 and 4 are card rounds. */
export function walkedEvent(seed = 9, prizes = ['TV', 'Bike', 'Fryer', 'Fan', 'Mug']) {
  const rng = seeded(seed);
  const people = Array.from({ length: 80 }, (_, i) => ({ id: serverId(i), name: `P${i + 1}` }));
  let s = createEvent(
    {
      eventName: 'Party',
      names: people.map((p) => p.name),
      schedule: [80, 40, 20, 10, 5],
      prizes,
      games: { rounds: [null, 'cards', 'fireworks', 'cards'], final: null },
      qr: { pin: PIN, roster: people },
    },
    rng,
  );
  for (let r = 1; r <= 4; r++) {
    if (s.setup.games.rounds[r - 1] === 'cards') s = prepareCards(s, rng);
    s = advance(revealDrawn(drawNext(s, rng)), rng);
  }
  s = revealDrawn(drawNext(s, rng));
  return decodeEvent(encodeEvent(s));
}

const EVENT = walkedEvent();
const FINAL_CODE = hostFinalCode(PIN, EVENT.final.order, 5);

/** Mount the page for a device that joined as `person`, with a status answer and a timer queue. */
function phone(person, { status, kv = new Map(), fetchImpl } = {}) {
  const doc = makeDoc();
  const root = doc.createElement('main');
  doc.body.append(root);
  kv.set(storageKey(EV), JSON.stringify({ token: 'T'.repeat(32), id: person.id, name: person.name }));
  const timers = [];
  const calls = [];
  const scrolls = [];
  let cut = false;
  const violations = [];
  const h = mountJoin(root, {
    gameName: 'x',
    location: { pathname: '/game/prize-draw/join/', search: '', hash: `#event=${EV}&pin=${PIN}` },
    history: { replaceState: () => {} },
    session: null,
    storage: { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => kv.set(k, String(v)) },
    fetch:
      fetchImpl ??
      (async (url, init) => {
        if (cut) {
          violations.push(url);
          throw new TypeError('network cut');
        }
        calls.push({ url, method: init.method, body: init.body });
        cut = true;
        if (status === 'network') throw new TypeError('network down');
        return { status: 200, json: async () => status };
      }),
    getRandomValues: (a) => webcrypto.getRandomValues(a),
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => {},
    scrollTo: (x, y) => scrolls.push([x, y]),
  });
  const $ = (sel) => root.querySelector(sel);
  const p = {
    root,
    h,
    timers,
    scrolls,
    kv,
    calls,
    violations,
    $,
    heading: () => $('h1')?.textContent,
    /** Run every timer the page has scheduled so far, once, and let what they started settle. */
    async runTimers() {
      for (const fn of timers.splice(0)) fn();
      await h.settled();
      mock.timers.tick(ARM_DELAY_MS);
    },
    async code(text) {
      const btn = $('#pj-code-form')?.querySelector('button');
      assert.ok(btn, `no code form on screen (heading ${p.heading()})`);
      assert.equal(btn.disabled, false, 'the code button is still held by the arm gate');
      $('#pj-code').value = text;
      $('#pj-code-form').dispatch('submit');
      await h.settled();
      mock.timers.tick(ARM_DELAY_MS);
    },
    async rule(label) {
      const btn = root.querySelectorAll('button').find((b) => b.textContent === label);
      assert.ok(btn, `no rule button "${label}"`);
      btn.click();
      await h.settled();
      mock.timers.tick(ARM_DELAY_MS);
    },
    noteTexts: () => root.querySelectorAll('.pj-note').map((n) => n.textContent),
  };
  return p;
}

const person = (id) => EVENT.setup.people.find((x) => x.id === id);
const round = (n) => EVENT.rounds[n - 1];
/** The rule the main screen drew in a card round, as its rule card names it. */
const drawnRule = (r) => CARD_COPY.rule[r.deal.pair[r.rule]];
const inAfter = (id, n) => EVENT.rounds.slice(0, n).every((r) => r.survivors.includes(id));

test.beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
test.afterEach(() => mock.timers.reset());

test('joined -> status -> every round to the claim, with the network cut after the one status call', async () => {
  const winner = winners(EVENT)[1].person;
  const p = phone(winner, { status: { state: 'started', member: true } });
  assert.equal(p.heading(), 'เครื่องนี้เข้าร่วมแล้ว', 'the device screen until the status answers');
  await p.runTimers();
  assert.deepEqual(
    p.calls.map((c) => [c.method, c.url, c.body]),
    [['GET', `/api/draw/events/${EV}/status/${winner.id}`, undefined]],
    'exactly one status call, a GET with no body',
  );
  // Code entry, round 1 (frame reveal-code).
  assert.equal(p.heading(), 'รอบที่ 1');
  assert.equal(p.$('.pj-sub').textContent, REVEAL_COPY.codeSub);
  assert.deepEqual(p.noteTexts(), [REVEAL_COPY.offline]);
  // A wrong code: round 2's code typed into round 1 (frame reveal-wrong).
  await p.code(round(2).code);
  assert.equal(p.$('#pj-code-msg').hidden, false);
  assert.equal(p.$('#pj-code-msg').querySelector('span').textContent, REVEAL_COPY.wrongCode(1));
  assert.equal(p.$('#pj-code').getAttribute('aria-invalid'), 'true');
  assert.equal(p.heading(), 'รอบที่ 1', 'a wrong code moves nothing');
  // In (frame reveal-pass).
  await p.code(round(1).code);
  assert.equal(p.heading(), 'ผ่านรอบที่ 1');
  assert.equal(p.$('.pj-who').textContent, winner.name);
  // A card round: the card before the rule (frame reveal-card), equal to the projector's dealt card.
  await p.code(round(2).code);
  assert.equal(p.heading(), 'รอบที่ 2');
  assert.equal(p.$('.pj-sub').textContent, CARD_COPY.gameName);
  const dealt = round(2).deal.cards.find((c) => c.id === winner.id).card;
  assert.equal(p.$('.pj-cap').textContent, REVEAL_COPY.cardCaption(dealt));
  assert.equal(p.$('#pj-code-form'), null, 'no code form while the rule is not tapped');
  await p.rule(drawnRule(round(2)));
  assert.equal(p.heading(), 'ผ่านรอบที่ 2');
  await p.code(round(3).code);
  assert.equal(p.heading(), 'ผ่านรอบที่ 3');
  await p.code(round(4).code);
  await p.rule(drawnRule(round(4)));
  assert.equal(p.heading(), 'ผ่านรอบที่ 4');
  // The final code: the claim (frame claim-320), its name the projector's winner of that place.
  await p.code(FINAL_CODE);
  assert.equal(p.heading(), REVEAL_COPY.claimHeading);
  assert.equal(p.$('.pj-pz').textContent, 'รางวัลที่ 2');
  assert.equal(p.$('.pj-prize').querySelector('.pj-who').textContent, winners(EVENT)[1].person.name);
  assert.deepEqual(p.noteTexts(), [REVEAL_COPY.claimNote]);
  await p.runTimers();
  assert.deepEqual(p.violations, [], 'a call after the status answer');
});

test('out: a cut round, and a card round once its rule is tapped; out stays out and has no form', async () => {
  const outAt1 = EVENT.setup.people.find((x) => !round(1).survivors.includes(x.id));
  const a = phone(outAt1, { status: { state: 'started', member: true } });
  await a.runTimers();
  await a.code(round(1).code);
  assert.equal(a.heading(), 'รอบที่ 1 ไม่ผ่าน');
  assert.equal(a.$('.pj-sub').textContent, REVEAL_COPY.outSub);
  assert.equal(a.$('#pj-code-form'), null);
  assert.deepEqual(a.violations, []);

  const outAt2 = EVENT.setup.people.find((x) => inAfter(x.id, 1) && !inAfter(x.id, 2));
  const b = phone(outAt2, { status: { state: 'started', member: true } });
  await b.runTimers();
  await b.code(round(1).code);
  await b.code(round(2).code);
  assert.equal(b.heading(), 'รอบที่ 2');
  await b.rule(drawnRule(round(2)));
  assert.equal(b.heading(), 'รอบที่ 2 ไม่ผ่าน');
  await b.runTimers();
  assert.deepEqual(b.violations, []);
});

test('removed: the status says not a member, so the page says removed whatever the codes say', async () => {
  const p = phone(winners(EVENT)[0].person, { status: { state: 'started', member: false } });
  await p.runTimers();
  assert.equal(p.heading(), ANSWER_COPY.removed);
  assert.equal(p.$('#pj-code-form'), null);
  assert.equal(JSON.parse(p.kv.get(revealKey(EV))).member, 'removed');
});

test('provisional: no status answer, the flow still runs, every result says the main screen decides, and no retry after a code', async () => {
  const winner = winners(EVENT)[0].person;
  const p = phone(winner, { status: 'network' });
  await p.runTimers();
  assert.equal(p.heading(), 'รอบที่ 1', 'no answer still opens the code entry');
  await p.code(round(1).code);
  assert.equal(p.heading(), 'ผ่านรอบที่ 1');
  assert.ok(p.noteTexts().includes(REVEAL_COPY.provisional), 'the provisional note');
  await p.runTimers();
  assert.deepEqual(p.violations, [], 'the status call was retried after a reveal began');
});

test('the status open: the device screen stays and asks again later; a reload after the start resumes without a call', async () => {
  const winner = winners(EVENT)[0].person;
  const p = phone(winner, { status: { state: 'open' } });
  await p.runTimers();
  assert.equal(p.heading(), 'เครื่องนี้เข้าร่วมแล้ว');
  const kv = new Map();
  const q = phone(winner, { status: { state: 'started', member: true }, kv });
  await q.runTimers();
  await q.code(round(1).code);
  // Reload: the record holds the membership and the codes, so the page asks nothing.
  const again = phone(winner, { status: { state: 'started', member: true }, kv });
  await again.runTimers();
  assert.equal(again.heading(), 'ผ่านรอบที่ 1');
  assert.deepEqual(again.calls, [], 'a reload after the status answer called the server');
});

test('names are attacker-owned (ADR-0026): the claim screen and every name sink write text only', async () => {
  const winner = winners(EVENT)[1].person;
  const hostile = '"><img src=x onerror=alert(1)><a href=/x>x</a>';
  const p = phone({ id: winner.id, name: hostile }, { status: { state: 'started', member: true } });
  await p.runTimers();
  for (const n of [1, 2, 3, 4]) {
    await p.code(round(n).code);
    if (round(n).game === 'cards') await p.rule(drawnRule(round(n)));
  }
  await p.code(FINAL_CODE);
  assert.equal(p.heading(), REVEAL_COPY.claimHeading);
  assert.equal(p.$('.pj-prize').querySelector('.pj-who').textContent, hostile);
  assert.equal(p.$('.pj-me').textContent, hostile);
  const tags = p.root.all().map((el) => el.tagName);
  assert.ok(!tags.includes('IMG') && !tags.includes('A'), 'a name became an element');
  assert.ok(!p.root.all().some((el) => [...el.attrs.values()].some((v) => String(v).includes('onerror'))), 'a name reached an attribute');
});

test('the walk this file drives covers what it claims: card rounds, a winner, people out at 1 and at 2', () => {
  assert.deepEqual(EVENT.rounds.map((r) => r.game), [null, 'cards', 'fireworks', 'cards']);
  assert.ok(FINAL_CODE, 'no final code for this order');
  assert.equal(liveIds(EVENT).length, 5);
  assert.ok(EVENT.setup.people.some((x) => inAfter(x.id, 1) && !inAfter(x.id, 2)));
  assert.equal(person(winners(EVENT)[1].person.id).name, winners(EVENT)[1].person.name);
});

test('3 prizes: the finalists placed 4 and 5 get the out result, places 1 to 3 the claim (the final code carries the count)', async () => {
  const three = walkedEvent(9, ['TV', 'Bike', 'Fryer']);
  const code = hostFinalCode(PIN, three.final.order, three.setup.prizes.length);
  const seen = [];
  for (const [slot, id] of three.final.order.entries()) {
    const fin = three.setup.people.find((x) => x.id === id);
    const p = phone(fin, { status: { state: 'started', member: true } });
    await p.runTimers();
    for (const r of three.rounds) {
      await p.code(r.code);
      if (r.game === 'cards') await p.rule(CARD_COPY.rule[r.deal.pair[r.rule]]);
    }
    await p.code(code);
    seen.push(p.heading());
    if (slot < 3) assert.equal(p.$('.pj-pz').textContent, `รางวัลที่ ${slot + 1}`);
    else {
      // The board's out frame, heading only on the final (owner pick PD-309-12, 2026-11-14).
      assert.equal(p.$('.pj-sub'), null, `place ${slot + 1}: the cheer line on the final`);
      assert.equal(p.$('.pj-prize'), null, `place ${slot + 1}: a prize box with no prize`);
    }
    assert.deepEqual(p.violations, []);
  }
  assert.deepEqual(seen, [REVEAL_COPY.claimHeading, REVEAL_COPY.claimHeading, REVEAL_COPY.claimHeading, 'รอบชิง ไม่ผ่าน', 'รอบชิง ไม่ผ่าน']);
});

// REFUTE r1 finding 1: the status call stops at the first code INTERACTION, accepted or not, typed or submitted.
for (const [label, act] of [
  ['a valid code typed into the field, not yet submitted', (p) => {
    p.$('#pj-code').value = round(1).code;
    p.$('#pj-code').dispatch('input');
  }],
  ['a wrong-round code submitted', (p) => {
    p.$('#pj-code').value = round(2).code;
    p.$('#pj-code-form').dispatch('submit');
  }],
]) {
  test(`no status retry after the first code interaction: ${label}`, async () => {
    const p = phone(winners(EVENT)[0].person, { status: 'network' });
    await p.runTimers();
    assert.equal(p.calls.length, 1, 'the one status call, which failed');
    assert.equal(p.heading(), 'รอบที่ 1');
    act(p);
    await p.runTimers();
    await p.runTimers();
    assert.deepEqual(p.violations, [], 'a status call after a code was typed');
    // From then on the phone computes with what it has: no membership, so every result is provisional.
    await p.code(round(1).code);
    assert.equal(p.heading(), 'ผ่านรอบที่ 1');
    assert.ok(p.noteTexts().includes('ยังไม่ยืนยันชื่อ ผลจริงดูที่จอใหญ่'));
    await p.runTimers();
    assert.deepEqual(p.violations, []);
  });
}

// REFUTE r1 finding 2, the reviewer's fixture: a latecomer catching up from the final's code card reaches a
// past card round and taps the rule the card shows beside its code, as its words read.
test('a latecomer catches up from the final code card, card rounds included, and reaches the projector\'s outcome', async () => {
  const three = walkedEvent(9, ['TV', 'Bike', 'Fryer']);
  const card = screenView(three).code;
  const winner = three.setup.people.find((x) => x.id === three.final.order[0]);
  assert.equal(winner.name, 'P39', 'the reviewer\'s witness');
  const p = phone(winner, { status: { state: 'started', member: true } });
  await p.runTimers();
  for (const e of card.earlier) {
    await p.code(e.digits);
    if (p.heading() === `รอบที่ ${e.round}`) await p.rule(CARD_COPY.rule[e.rule]);
  }
  await p.code(card.digits);
  assert.equal(p.heading(), REVEAL_COPY.claimHeading);
  assert.equal(p.$('.pj-pz').textContent, 'รางวัลที่ 1');
});

// REFUTE r1 finding 3: a control a screen change puts up is held for the arm window, then live (ADR-0057).
test('every control the flow puts up is held inside the arm window and live after it', async () => {
  const winner = winners(EVENT)[1].person;
  const p = phone(winner, { status: { state: 'started', member: true } });
  const held = (label) => {
    const buttons = p.root.querySelectorAll('button');
    assert.ok(buttons.length > 0, `${label}: no control on screen`);
    for (const b of buttons) assert.equal(b.disabled, true, `${label}: "${b.textContent}" is live inside the arm window`);
    mock.timers.tick(ARM_DELAY_MS);
    for (const b of buttons) assert.equal(b.disabled, false, `${label}: "${b.textContent}" never armed`);
  };
  const submit = async (code) => {
    p.$('#pj-code').value = code;
    p.$('#pj-code-form').dispatch('submit');
    await p.h.settled();
  };
  for (const fn of p.timers.splice(0)) fn();
  await p.h.settled();
  held('code entry, round 1');
  await submit(round(1).code);
  held('pass, round 1');
  await submit(round(2).code);
  held('card, round 2');
  p.root.querySelectorAll('button').find((b) => b.textContent === CARD_COPY.rule[round(2).deal.pair[round(2).rule]]).click();
  await p.h.settled();
  held('pass, round 2');
});

// REFUTE r2: a membership answer that lands late re-renders the screen, and must keep the code being typed.
test('a late membership answer keeps the draft in the code field; an accepted code still clears it', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (urls.length === 1) throw new TypeError('network down');
    await gate;
    return { status: 200, json: async () => ({ state: 'started', member: true }) };
  };
  const p = phone(winners(EVENT)[0].person, { fetchImpl });
  await p.runTimers(); // the first status call fails: code entry, a retry scheduled
  assert.equal(p.heading(), 'รอบที่ 1');
  for (const fn of p.timers.splice(0)) fn(); // the retry: its call is now in flight
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(urls.length, 2, 'the retry is in flight');
  // Round 1 passes while the answer is out; the field the pass screen puts up starts empty.
  p.$('#pj-code').value = round(1).code;
  p.$('#pj-code-form').dispatch('submit');
  assert.equal(p.heading(), 'ผ่านรอบที่ 1');
  assert.equal(p.$('#pj-code').value, '', 'an accepted code clears the field');
  // The person starts typing round 2's code, then the late answer lands.
  p.$('#pj-code').value = '851';
  p.$('#pj-code').dispatch('input');
  release();
  await p.h.settled();
  assert.equal(p.heading(), 'ผ่านรอบที่ 1');
  assert.ok(!p.noteTexts().includes(REVEAL_COPY.provisional), 'the late membership answer was not taken');
  assert.equal(p.$('#pj-code').value, '851', 'the late answer wiped the draft');
  assert.equal(urls.length, 2, 'no call after the first code interaction');
  // The next accepted code still clears the field when the flow moves on.
  mock.timers.tick(ARM_DELAY_MS);
  p.$('#pj-code').value = round(2).code;
  p.$('#pj-code-form').dispatch('submit');
  await p.h.settled();
  mock.timers.tick(ARM_DELAY_MS);
  await p.rule(CARD_COPY.rule[round(2).deal.pair[round(2).rule]]);
  assert.equal(p.heading(), 'ผ่านรอบที่ 2');
  assert.equal(p.$('#pj-code').value, '', 'an accepted code and rule clear the field');
});

// ---- gh#309 audit picks (owner, 2026-11-14): docs/verification/evidence/ui-audit-2026-11-14-gh309/

/** A member in after round 1 whose round-2 fate turns on the rule tapped: the drawn rule keeps them. */
const ruleTurns = EVENT.setup.people.find((x) => {
  if (!inAfter(x.id, 2)) return false;
  let rec = { ...freshReveal(PIN), member: 'confirmed', started: true };
  rec = enterCode(enterCode(rec, x.id, round(1).code), x.id, round(2).code);
  return revealView(chooseRule(rec, x.id, round(2).rule === 0 ? 1 : 0), x.id).screen.kind === 'out';
});
const ruleLabel = (r, which) => CARD_COPY.rule[r.deal.pair[which]];

/** Every control on screen is held inside the arm window, then live (ADR-0057). */
function heldThenLive(p, label) {
  const buttons = p.root.querySelectorAll('button');
  assert.ok(buttons.length > 0, `${label}: no control on screen`);
  for (const b of buttons) assert.equal(b.disabled, true, `${label}: "${b.textContent}" is live inside the arm window`);
  mock.timers.tick(ARM_DELAY_MS);
  for (const b of buttons) assert.equal(b.disabled, false, `${label}: "${b.textContent}" never armed`);
}

test('PD-309-02: the result names the rule tapped and its change goes back to the card; the latest tap is stored and survives a reload', async () => {
  assert.ok(ruleTurns, 'the walk has no member whose round-2 fate turns on the rule');
  const kv = new Map();
  const p = phone(ruleTurns, { status: { state: 'started', member: true }, kv });
  await p.runTimers();
  await p.code(round(1).code);
  await p.code(round(2).code);
  const wrong = ruleLabel(round(2), round(2).rule === 0 ? 1 : 0);
  const right = ruleLabel(round(2), round(2).rule);
  await p.rule(wrong);
  assert.equal(p.heading(), 'รอบที่ 2 ไม่ผ่าน');
  assert.ok(p.noteTexts().includes(`กติกาที่คุณแตะ: ${wrong}`), 'the out screen names the rule tapped');
  const tap = async (label) => {
    p.root.querySelectorAll('button').find((b) => b.textContent === label).click();
    await p.h.settled();
  };
  await tap('เปลี่ยนกติกา');
  assert.equal(p.heading(), 'รอบที่ 2', 'the change goes back to the card screen');
  assert.ok(p.$('.pj-pcard'));
  heldThenLive(p, 'the card the change brought back');
  await tap(right);
  heldThenLive(p, 'the result of the second tap');
  assert.equal(p.heading(), 'ผ่านรอบที่ 2');
  assert.ok(p.noteTexts().includes(`กติกาที่คุณแตะ: ${right}`));
  assert.equal(JSON.parse(kv.get(revealKey(EV))).entries[1].rule, round(2).rule, 'the latest tap is the stored one');
  const again = phone(ruleTurns, { status: { state: 'started', member: true }, kv });
  await again.runTimers();
  assert.equal(again.heading(), 'ผ่านรอบที่ 2');
  assert.ok(again.noteTexts().includes(`กติกาที่คุณแตะ: ${right}`), 'a reload shows the latest choice');
  // Once the next code is accepted the change is gone: the rule stays as tapped.
  await again.code(round(3).code);
  assert.equal(again.root.querySelectorAll('button').find((b) => b.textContent === 'เปลี่ยนกติกา'), undefined);
  assert.deepEqual([...p.violations, ...again.violations], []);
});

test('PD-309-03 and 13: every screen swap scrolls to the top and focuses the new heading; a wrong code does neither', async () => {
  const proto = Object.getPrototypeOf(makeDoc().createElement('div'));
  const own = Object.getOwnPropertyDescriptor(proto, 'focus');
  let focused = null;
  proto.focus = function () {
    focused = this;
  };
  try {
    const p = phone(winners(EVENT)[0].person, { status: { state: 'started', member: true } });
    await p.runTimers();
    const swaps = [];
    for (const r of EVENT.rounds) {
      swaps.push(() => p.code(r.code));
      if (r.game === 'cards') swaps.push(() => p.rule(ruleLabel(r, r.rule)));
    }
    swaps.push(() => p.code(FINAL_CODE));
    for (const step of swaps) {
      const before = p.scrolls.length;
      focused = null;
      await step();
      assert.deepEqual(p.scrolls.slice(before), [[0, 0]], `${p.heading()}: no scroll to the top`);
      assert.equal(focused, p.$('h1'), `${p.heading()}: focus is not on the new heading`);
      assert.equal(focused.getAttribute('tabindex'), '-1');
    }
    assert.equal(p.heading(), REVEAL_COPY.claimHeading, 'the walk reaches the claim');
    // A wrong code changes no screen: the field keeps focus and the page stays where it is.
    const q = phone(winners(EVENT)[0].person, { status: { state: 'started', member: true } });
    await q.runTimers();
    const before = q.scrolls.length;
    await q.code(round(2).code);
    assert.equal(focused, q.$('#pj-code'), 'a wrong code moves focus off the field');
    assert.equal(q.scrolls.length, before, 'a wrong code scrolled the page');
  } finally {
    Object.defineProperty(proto, 'focus', own);
  }
});

test('PD-309-04 and 05: the pass screen has no wait note, and the provisional note sits directly under the heading', async () => {
  const p = phone(winners(EVENT)[0].person, { status: 'network' });
  await p.runTimers();
  await p.code(round(1).code);
  assert.ok(!p.noteTexts().includes('รอรหัสรอบถัดไปจากจอใหญ่'), 'the wait note is back');
  const h1 = p.$('h1');
  const kids = h1.parentNode.children;
  assert.equal(kids[kids.indexOf(h1) + 1].textContent, REVEAL_COPY.provisional, 'the element after the heading');
});

test('PD-309-12: the final\'s out screen shows the heading without the cheer line; an earlier round keeps it', async () => {
  const three = walkedEvent(9, ['TV', 'Bike', 'Fryer']);
  const code = hostFinalCode(PIN, three.final.order, 3);
  const fin = three.setup.people.find((x) => x.id === three.final.order[4]);
  const p = phone(fin, { status: { state: 'started', member: true } });
  await p.runTimers();
  for (const r of three.rounds) {
    await p.code(r.code);
    if (r.game === 'cards') await p.rule(ruleLabel(r, r.rule));
  }
  await p.code(code);
  assert.equal(p.heading(), 'รอบชิง ไม่ผ่าน');
  assert.equal(p.$('.pj-sub'), null, 'the cheer line on the final');
  // Every elimination round keeps it: out at rounds 1 to 4, each through the real flow.
  for (const n of [1, 2, 3, 4]) {
    const out = EVENT.setup.people.find((x) => inAfter(x.id, n - 1) && !inAfter(x.id, n));
    assert.ok(out, `the walk has nobody out at round ${n}`);
    const q = phone(out, { status: { state: 'started', member: true } });
    await q.runTimers();
    for (const r of EVENT.rounds.slice(0, n)) {
      await q.code(r.code);
      if (r.game === 'cards') await q.rule(ruleLabel(r, r.rule));
    }
    assert.equal(q.heading(), `รอบที่ ${n} ไม่ผ่าน`);
    assert.equal(q.$('.pj-sub')?.textContent, REVEAL_COPY.outSub, `round ${n}: the cheer line`);
  }
});

test('PD-309-09: the code field groups typed digits as the projector does; the parsed and stored value is the digits', async () => {
  const kv = new Map();
  const p = phone(winners(EVENT)[0].person, { status: { state: 'started', member: true }, kv });
  await p.runTimers();
  const type = (digits) => {
    p.$('#pj-code').value = digits;
    p.$('#pj-code').dispatch('input');
    return p.$('#pj-code').value;
  };
  assert.equal(type('482915307'), '482 915 307');
  assert.equal(type('482-915 30'), '482 915 30');
  assert.equal(type('482153076290'), '4821 5307 6290');
  assert.equal(type(round(1).code), round(1).code.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3'));
  await p.code(p.$('#pj-code').value);
  assert.equal(p.heading(), 'ผ่านรอบที่ 1', 'a grouped code reads');
  assert.equal(JSON.parse(kv.get(revealKey(EV))).entries[0].code, round(1).code, 'the stored code is the digits');
  // The final's 7 digits group 4-3, as the projector shows them.
  for (const r of EVENT.rounds.slice(1)) {
    await p.code(r.code);
    if (r.game === 'cards') await p.rule(ruleLabel(r, r.rule));
  }
  assert.equal(type(FINAL_CODE), `${FINAL_CODE.slice(0, 4)} ${FINAL_CODE.slice(4)}`);
});

test('PD-309-07: the three named compounds are kept whole with the site\'s no-wrap span', async () => {
  const removed = phone(winners(EVENT)[0].person, { status: { state: 'started', member: false } });
  await removed.runTimers();
  assert.equal(removed.heading(), ANSWER_COPY.removed);
  assert.deepEqual(removed.$('h1').querySelectorAll('.nw').map((n) => n.textContent), ['รายชื่อ']);
  const winner = winners(EVENT)[0].person;
  const p = phone(winner, { status: { state: 'started', member: true } });
  await p.runTimers();
  for (const r of EVENT.rounds) {
    await p.code(r.code);
    if (r.game === 'cards') await p.rule(ruleLabel(r, r.rule));
  }
  await p.code(FINAL_CODE);
  const note = p.root.querySelectorAll('.pj-note').find((n) => n.textContent === REVEAL_COPY.claimNote);
  assert.deepEqual(note.querySelectorAll('.nw').map((n) => n.textContent), ['จอใหญ่']);
  const css = readFileSync(new URL('../pages/game/prize-draw/join.astro', import.meta.url), 'utf8');
  assert.match(css, /\.pj :global\(\.nw\) \{\s*white-space: nowrap;\s*\}/);
  // Every rule that reaches the span only keeps it on one line: nothing hides it or restyles it.
  const rules = [...css.matchAll(/([^{}]*\bnw\b[^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 1);
  for (const [, sel, body] of rules) assert.equal(body.trim(), 'white-space: nowrap;', `${sel.trim()} does more than keep the compound whole`);
});

test('PD-309-01: under 375px the card screen takes the canvas\'s smaller card (frame 5: 90 x 126, rank 23px, suit 50px)', () => {
  const css = readFileSync(new URL('../pages/game/prize-draw/join.astro', import.meta.url), 'utf8');
  const block = css.match(/@media \(max-width: 374px\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(block, 'no rule for viewports under 375px');
  const rule = (sel) => block[1].match(new RegExp(`${sel.replace(/[().]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(rule(':global(.pj-pcard)'), /inline-size: 90px;[\s\S]*block-size: 126px;/);
  assert.match(rule(':global(.pj-rk),\n    .pj :global(.pj-rk2)') + rule(':global(.pj-rk), .pj :global(.pj-rk2)'), /font-size: 23px;/);
  assert.match(rule(':global(.pj-pcard svg)'), /inline-size: 50px;[\s\S]*block-size: 50px;/);
  // The ranks' corner offsets are the board's 12px / 8px x 0.6 (frame 5), each corner exactly.
  assert.match(block[1], /\.pj :global\(\.pj-rk\) \{\s*left: 7px;\s*top: 5px;\s*\}/);
  assert.match(block[1], /\.pj :global\(\.pj-rk2\) \{\s*right: 7px;\s*bottom: 5px;\s*\}/);
});

/** The code field with a caret: selection, and setSelectionRange as a browser keeps them. */
function caretField(p) {
  const f = p.$('#pj-code');
  f.selectionStart = f.selectionEnd = f.value.length;
  f.setSelectionRange = (a, b) => {
    f.selectionStart = a;
    f.selectionEnd = b;
  };
  /** One edit as the browser applies it: replace [from, to) with `text`, caret after it, then input. */
  f.edit = (from, to, text, inputType) => {
    f.value = f.value.slice(0, from) + text + f.value.slice(to);
    f.selectionStart = f.selectionEnd = from + text.length;
    f.dispatch('input', { inputType });
  };
  return f;
}

test('PD-309-09, REFUTE r1: typing keeps the caret after the digit typed; Delete and Backspace across a group gap remove the digit beyond it; selections and pastes regroup', async () => {
  const p = phone(winners(EVENT)[0].person, { status: { state: 'started', member: true } });
  await p.runTimers();
  const f = caretField(p);
  for (const d of '482915307') {
    f.edit(f.selectionStart, f.selectionEnd, d, 'insertText');
    assert.equal(f.selectionStart, f.value.length, `caret after typing ${d} into ${f.value}`);
  }
  assert.equal(f.value, '482 915 307');
  // Forward Delete with the caret before a gap: each press removes the next digit, the caret stays put.
  f.setSelectionRange(3, 3);
  for (const want of ['482 153 07', '482 530 7', '482 307']) {
    f.edit(3, 4, '', 'deleteContentForward');
    assert.deepEqual([f.value, f.selectionStart], [want, 3]);
  }
  // Backspace with the caret after a gap removes the digit before it.
  f.value = '';
  f.edit(0, 0, '482915307', 'insertFromPaste');
  f.setSelectionRange(4, 4);
  f.edit(3, 4, '', 'deleteContentBackward');
  assert.deepEqual([f.value, f.selectionStart], ['489 153 07', 2]);
  // A selection across a gap: the digits go, the rest regroups, the caret sits where they were.
  f.edit(1, 5, '', 'deleteContentBackward');
  assert.deepEqual([f.value, f.selectionStart], ['453 07', 1]);
  // A paste with spaces and dashes regroups, caret at its end.
  f.value = '';
  f.edit(0, 0, '4821-5307 6290', 'insertFromPaste');
  assert.deepEqual([f.value, f.selectionStart], ['4821 5307 6290', 14]);
});

test('REFUTE r1: a late membership answer keeps the focused field node, its value and its selection; only the provisional note goes', async () => {
  const proto = Object.getPrototypeOf(makeDoc().createElement('div'));
  const own = Object.getOwnPropertyDescriptor(proto, 'focus');
  let focused = null;
  proto.focus = function () {
    focused = this;
  };
  try {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) throw new TypeError('network down');
      await gate;
      return { status: 200, json: async () => ({ state: 'started', member: true }) };
    };
    const p = phone(winners(EVENT)[0].person, { fetchImpl });
    await p.runTimers();
    for (const fn of p.timers.splice(0)) fn();
    await new Promise((resolve) => setImmediate(resolve));
    p.$('#pj-code').value = round(1).code;
    p.$('#pj-code-form').dispatch('submit');
    assert.ok(p.noteTexts().includes(REVEAL_COPY.provisional), 'provisional before the answer');
    const field = caretField(p);
    field.focus();
    field.edit(0, 0, '851', 'insertText');
    field.setSelectionRange(1, 1);
    release();
    await p.h.settled();
    assert.equal(p.$('#pj-code'), field, 'the late answer replaced the field being typed in');
    assert.equal(focused, field, 'focus left the field');
    assert.deepEqual([field.value, field.selectionStart, field.selectionEnd], ['851', 1, 1]);
    assert.ok(!p.noteTexts().includes(REVEAL_COPY.provisional), 'the membership answer was not taken');
  } finally {
    Object.defineProperty(proto, 'focus', own);
  }
});

test('PD-309-05: the provisional note sits directly under the heading on every result screen: pass, card, out and claim', async () => {
  const under = (p, label) => {
    const h1 = p.$('h1');
    const kids = h1.parentNode.children;
    assert.equal(kids[kids.indexOf(h1) + 1]?.textContent, REVEAL_COPY.provisional, `${label}: the element after the heading`);
  };
  const p = phone(winners(EVENT)[0].person, { status: 'network' });
  await p.runTimers();
  for (const r of EVENT.rounds) {
    await p.code(r.code);
    if (r.game === 'cards') {
      under(p, `card, round ${r.round}`);
      await p.rule(ruleLabel(r, r.rule));
    }
    under(p, `pass, round ${r.round}`);
  }
  await p.code(FINAL_CODE);
  assert.equal(p.heading(), REVEAL_COPY.claimHeading);
  under(p, 'claim');
  const out = EVENT.setup.people.find((x) => !round(1).survivors.includes(x.id));
  const q = phone(out, { status: 'network' });
  await q.runTimers();
  await q.code(round(1).code);
  under(q, 'out');
});

// REFUTE r2: only a VERIFIED separator deletion takes the digit beyond the gap. A paste over the whole code,
// or deleting a stray non-digit, keeps every digit (ASCII and Thai numerals).
const toThai = (digits) => [...digits].map((d) => String.fromCodePoint(0x0e50 + Number(d))).join('');
for (const thai of [false, true]) {
  test(`REFUTE r2: pasting the same bare digits over the whole grouped code keeps them all (${thai ? 'Thai' : 'ASCII'})`, async () => {
    const p = phone(winners(EVENT)[0].person, { status: { state: 'started', member: true } });
    await p.runTimers();
    const f = caretField(p);
    const code = thai ? toThai(round(1).code) : round(1).code;
    f.edit(0, 0, code, 'insertFromPaste');
    f.edit(0, f.value.length, code, 'insertFromPaste');
    assert.equal(f.value.replace(/ /g, ''), code, 'the paste lost a digit');
    assert.equal(f.selectionStart, f.value.length);
    p.$('#pj-code-form').dispatch('submit');
    assert.equal(p.heading(), 'ผ่านรอบที่ 1');
  });
  for (const inputType of ['deleteContentBackward', 'deleteContentForward']) {
    test(`REFUTE r2: deleting a stray non-digit keeps every digit (${inputType}, ${thai ? 'Thai' : 'ASCII'})`, async () => {
      const p = phone(winners(EVENT)[0].person, { status: { state: 'started', member: true } });
      await p.runTimers();
      const f = caretField(p);
      const code = thai ? toThai(round(1).code) : round(1).code;
      f.edit(0, 0, `${code.slice(0, 3)}x${code.slice(3)}`, 'insertFromPaste');
      f.edit(3, 4, '', inputType);
      assert.equal(f.value.replace(/ /g, ''), code, 'deleting the x took a digit with it');
      assert.equal(f.selectionStart, 3, 'the caret left the place of the x');
      p.$('#pj-code-form').dispatch('submit');
      assert.equal(p.heading(), 'ผ่านรอบที่ 1');
    });
  }
}
