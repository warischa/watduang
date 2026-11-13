// node --test — the projector mounts the 3D reveal host (gh#305) only after a step is committed: a round's
// reveal, a card round's deal and then its rule, and the final. Resume never mounts and never draws; taking
// up another stored state disposes the reveal on screen and discards its late callbacks; the MC cannot step
// on while a reveal presents. Most cases drive a recording stand-in for the host (stage-harness fakeHosts);
// the reduced-motion case drives the real host over the fake page of host-harness.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeOrigin, fakeHosts, mount, mountSetupPage, press, seedRaw, seeded, storedEvent, storedRaw } from './stage-harness.mjs';
import { advance, decodeEvent, drawNext, encodeEvent, liveIds, prepareCards, revealDrawn } from '../../prize-event/event.ts';
import { satisfies } from '../../prize-draw/cards.ts';
import { ladderConsistent } from '../../prize-event/game-contract.ts';
import { startReveal } from '../_prize-reveal/game-host.ts';
import { makeModule, makePage, makeRegistry } from '../_prize-reveal/host-harness.mjs';

const FIREWORKS_R1 = { rounds: ['fireworks', null, null, null], final: null };
const CARDS_R1 = { rounds: ['cards', null, null, null], final: 'fireworks' };
const LADDER = { rounds: [null, null, null, null], final: 'ladder' };
const noDraw = { float: () => assert.fail('drew a float'), int: () => assert.fail('drew an int'), hex: () => assert.fail('drew hex') };

const stored = (origin) => decodeEvent(storedRaw(origin));
const screen = (s) => s.frame.getAttribute('data-screen');

test('a committed fireworks round mounts the host with the committed outcome; the MC is held until it settles', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  assert.equal(hosts.length, 0, 'nothing mounts before a press');
  press(s);
  await origin.idle();
  assert.equal(hosts.length, 1);
  const h = hosts[0];
  const ev = stored(origin);
  assert.equal(ev.at, 'revealed', 'the host mounted on a committed reveal');
  assert.equal(h.options.game, 'fireworks');
  assert.deepEqual(h.options.input.outcome, { kind: 'round', ...ev.rounds[0] });
  assert.deepEqual(h.options.input.people.map((p) => p.id), ev.setup.people.map((p) => p.id), 'round 1 plays the whole roster');
  assert.equal(h.options.input.eventName, 'Party 2570');
  assert.match(h.options.input.key, new RegExp(ev.eventKey));
  assert.equal(s.go(), null, 'the MC must not step on while the reveal presents');
  assert.equal(screen(s), 'round', 'the result is not drawn under the 3D layer before it lands');
  h.run();
  h.settle();
  assert.equal(screen(s), 'reveal');
  assert.equal(s.go().textContent, 'รอบต่อไป');
  assert.equal(s.frames.length, 0, 'a reveal the 3D game played does not replay the 2D wave');
});

test('a reveal that falls back before it ran shows the 2D reveal with its wave', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  press(s);
  await origin.idle();
  hosts[0].exit('fallback');
  assert.equal(screen(s), 'reveal');
  assert.equal(s.frames.length, 1, 'the 2D wave is the reveal when no 3D ran');
});

test('a failed commit never mounts the host', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  origin.faults.abortCommits = 1;
  press(s);
  await origin.idle();
  assert.equal(s.notice.hidden, false);
  assert.equal(hosts.length, 0, 'a draw that was not stored must never reach a 3D game');
});

test('a stale press (the store moved) takes the stored state up and never mounts', async () => {
  const origin = fakeOrigin();
  const ev = storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  seedRaw(origin, encodeEvent(revealDrawn(drawNext(ev, seeded(77)))));
  press(s);
  await origin.idle();
  assert.equal(screen(s), 'reveal');
  assert.equal(hosts.length, 0);
});

test('resume renders the settled 2D view without mounting or drawing', async () => {
  const origin = fakeOrigin();
  const ev = storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  seedRaw(origin, encodeEvent(revealDrawn(drawNext(ev, seeded(5)))));
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start, rng: noDraw });
  assert.equal(screen(s), 'reveal');
  assert.equal(hosts.length, 0);
  assert.equal(s.go().textContent, 'รอบต่อไป');
});

test('taking up another stored state disposes the reveal on screen and discards its late callbacks', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  press(s);
  await origin.idle();
  const h = hosts[0];
  h.run();
  const setup = mountSetupPage({ origin });
  setup.submit();
  await origin.idle();
  await s.deliver();
  await origin.idle();
  assert.equal(h.disposed, 1, 'the reveal of the replaced event is still on screen');
  assert.equal(s.stage.current().setup.eventName, 'Replacement');
  assert.equal(screen(s), 'round');
  const before = s.frame.textContent;
  h.options.render2D(h.options.input.outcome);
  h.options.onState?.('settled');
  assert.equal(s.frame.textContent, before, 'a late 2D callback from the disposed reveal drew over the taken-up state');
  assert.equal(screen(s), 'round');
  assert.ok(s.go(), 'the taken-up state has its MC button');
});

test('the 2D frame names the round game, verbatim from the picked board', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const s = await mount({ origin });
  assert.match(s.frame.textContent, /เกมรอบนี้พลุนับถอยหลัง/);
  const plain = fakeOrigin();
  storedEvent(plain, { n: 50 });
  const p = await mount({ origin: plain });
  assert.doesNotMatch(p.frame.textContent, /เกมรอบนี้/, 'a round with no game shows no game label');
});

test('a card round mounts twice: the stored deal face down, then the drawn rule', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 200, games: CARDS_R1 });
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  const dealButton = s.go().textContent;
  press(s);
  await origin.idle();
  let ev = stored(origin);
  assert.ok(ev.prepared, 'the deal is stored before anything of it is shown');
  assert.equal(ev.at, 'ready');
  assert.equal(ev.rounds.length, 0, 'no rule is drawn with the deal');
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].options.game, 'cards');
  assert.deepEqual(hosts[0].options.input.outcome, { kind: 'deal', ...ev.prepared });
  assert.equal(s.go(), null);
  hosts[0].run();
  hosts[0].settle();
  assert.equal(screen(s), 'round');
  assert.notEqual(s.go().textContent, dealButton, 'the rule press reads differently from the deal press');
  press(s);
  await origin.idle();
  ev = stored(origin);
  assert.equal(ev.prepared, null);
  const rec = ev.rounds[0];
  assert.equal(rec.game, 'cards');
  assert.equal(hosts.length, 2);
  assert.deepEqual(hosts[1].options.input.outcome, { kind: 'round', ...rec });
  hosts[1].settle();
  assert.equal(screen(s), 'reveal');
});

test('a refresh on a stored deal never redeals: the next press draws only the rule, from that deal', async () => {
  const origin = fakeOrigin();
  const ev = storedEvent(origin, { n: 200, games: CARDS_R1 });
  const dealt = prepareCards(ev, seeded(3));
  seedRaw(origin, encodeEvent(dealt));
  const { hosts, start } = fakeHosts();
  let ints = 0;
  const ruleOnly = { ...noDraw, int: (n) => (assert.equal(n, 2), ints++, 0) };
  const s = await mount({ origin, startReveal: start, rng: ruleOnly });
  assert.equal(hosts.length, 0, 'resume mounts nothing');
  press(s);
  await origin.idle();
  assert.equal(ints, 1);
  const rec = stored(origin).rounds[0];
  assert.deepEqual(rec.deal, dealt.prepared.deal);
  assert.deepEqual(rec.survivors, rec.deal.cards.filter((c) => satisfies(rec.deal.pair[0], c.card)).map((c) => c.id));
  assert.equal(hosts[0].options.input.outcome.kind, 'round');
});

/** A stored ladder event at its final, ready, as the MC's step into it stores it: with its slot layout. */
function atLadderFinal(origin) {
  let ev = storedEvent(origin, { n: 50, games: LADDER });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  return ev;
}

const nameOf = (ev) => {
  const byId = new Map(ev.setup.people.map((p) => [p.id, p.name]));
  return (id) => byId.get(id);
};
/** A tap past the arm window (the gate is arm-reveal-paths' to test). */
const tap = (b) => {
  assert.ok(b, 'no such control on screen');
  b.disabled = false;
  b.click();
};

test('a ladder final: the MC taps a lane, then a name, in any order; a filled lane empties on a tap; five picks lock into the draw', async () => {
  const origin = fakeOrigin();
  const ev = atLadderFinal(origin);
  const finalists = liveIds(ev);
  const name = nameOf(ev);
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  assert.equal(screen(s), 'lanes');
  assert.equal(s.laneButtons().length, 5, 'one control per start lane');
  assert.deepEqual(s.nameButtons().map((b) => b.textContent), finalists.map(name), 'every finalist, in roster order');
  assert.equal(s.go().textContent, 'เปิดผล');
  assert.equal(s.go().disabled, true, 'the draw waits for five picks');
  // Lane 4 first: the MC taps it, then a name.
  tap(s.laneButtons()[3]);
  assert.equal(s.laneButtons()[3].getAttribute('aria-pressed'), 'true', 'the tapped lane is the one the next name lands on');
  tap(s.nameButton(name(finalists[0])));
  await origin.idle(); // each pick is a stored write
  assert.equal(s.nameButton(name(finalists[0])), null, 'a placed finalist leaves the name row');
  assert.match(s.laneButtons()[3].textContent, new RegExp(name(finalists[0])));
  // Tapping the filled lane empties it: the finalist is back in the row.
  tap(s.laneButtons()[3]);
  await origin.idle();
  assert.ok(s.nameButton(name(finalists[0])), 'emptying a lane gives its finalist back');
  assert.equal(s.nameButtons().length, 5);
  // Lanes in the order 5, 3, 1, 4, 2; finalists in reverse roster order.
  const laneOrder = [4, 2, 0, 3, 1];
  const want = Array(5);
  for (const [k, lane] of laneOrder.entries()) {
    const id = finalists[4 - k];
    tap(s.laneButtons()[lane]);
    tap(s.nameButton(name(id)));
    await origin.idle();
    want[lane] = id;
    if (k < 4) assert.equal(s.go().disabled, true, `the draw went live after ${k + 1} picks`);
  }
  assert.equal(s.nameButtons().length, 0, 'every finalist is on a lane');
  assert.equal(press(s), true);
  await origin.idle();
  const stored1 = stored(origin);
  assert.deepEqual(stored1.final.picks, want);
  assert.ok(ladderConsistent(stored1.final));
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].options.game, 'ladder');
  assert.deepEqual(hosts[0].options.input.outcome, { kind: 'final', prizes: stored1.setup.prizes, ...stored1.final });
  assert.deepEqual(hosts[0].options.input.people.map((p) => p.id), finalists);
  hosts[0].settle();
  assert.equal(screen(s), 'result');
  assert.equal(s.go(), null);
});

test('the prize slots are on screen while the finalists pick, drawn from the stored layout; each pick stores only its lane, and the lock keeps that layout', async () => {
  const origin = fakeOrigin();
  // The MC's own step into the final stores the layout: walk round 4 on the stage itself.
  let ev = storedEvent(origin, { n: 50, games: LADDER });
  const rng = seeded(4);
  for (let r = 1; r <= 3; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(revealDrawn(drawNext(ev, rng))));
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start, rng: seeded(6) });
  assert.equal(stored(origin).prepared, null, 'precondition: round 4 revealed, nothing prepared');
  assert.equal(press(s), true); // the step into the final
  await origin.idle();
  const open = stored(origin);
  assert.equal(open.prepared.game, 'ladder', 'the step into the final stored the slot layout');
  assert.equal(open.final, null);
  const raw = storedRaw(origin);
  assert.doesNotMatch(raw, /permutation/, 'nothing of the permutation is stored before the picks');
  const slotText = () => s.frame.querySelectorAll('div.pd-slot').map((d) => d.textContent);
  const prizes = open.setup.prizes;
  const want = open.prepared.slotRanks.map((rank) => (rank < prizes.length ? `รางวัลที่ ${rank + 1}${prizes[rank]}` : 'ไม่มีรางวัลขอบคุณที่ร่วมลุ้น'));
  assert.equal(screen(s), 'lanes');
  assert.deepEqual(slotText(), want, 'each exit lane shows the prize its stored rank wins, before any pick');
  const finalists = liveIds(open);
  const name = nameOf(open);
  for (let lane = 0; lane < 5; lane++) {
    tap(s.laneButtons()[lane]);
    tap(s.nameButton(name(finalists[lane])));
    await origin.idle();
    const now = stored(origin);
    assert.deepEqual(now.prepared.picks, [...finalists.slice(0, lane + 1), ...Array(4 - lane).fill(null)], `pick ${lane + 1} was not stored`);
    assert.equal(JSON.stringify(now.prepared.slotRanks), JSON.stringify(open.prepared.slotRanks), `pick ${lane + 1} changed the slot layout`);
    assert.doesNotMatch(storedRaw(origin), /permutation/, `pick ${lane + 1} stored a permutation`);
    assert.deepEqual(slotText(), want, `pick ${lane + 1} redrew the slots`);
  }
  assert.equal(press(s), true);
  await origin.idle();
  const final = stored(origin).final;
  assert.deepEqual(final.slotRanks, open.prepared.slotRanks, 'the lock drew new slots');
  assert.deepEqual(final.picks, finalists);
  assert.equal(hosts.length, 1);
});

test('a ladder draw with fewer than five picks writes nothing', async () => {
  const origin = fakeOrigin();
  const ev = atLadderFinal(origin);
  const before = storedRaw(origin);
  const { hosts, start } = fakeHosts();
  const s = await mount({ origin, startReveal: start });
  tap(s.laneButtons()[0]);
  tap(s.nameButton(nameOf(ev)(liveIds(ev)[0])));
  await origin.idle();
  const picked = storedRaw(origin);
  assert.notEqual(picked, before, 'precondition: the one pick is stored');
  press(s); // forced past its own disabled state
  await origin.idle();
  assert.equal(storedRaw(origin), picked, 'a draw with one pick wrote');
  assert.equal(hosts.length, 0);
});

test('reduced motion never imports three: the real host reveals in 2D without loading a game or a renderer', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50, games: FIREWORKS_R1 });
  const page = makePage({ reducedMotion: true });
  const reg = makeRegistry(makeModule());
  const s = await mount({ origin, reducedMotion: true, startReveal: (o) => startReveal({ ...o, registry: reg.registry }, page.env) });
  press(s);
  await origin.idle();
  assert.equal(page.rendererLoads, 0, 'three was imported under reduced motion');
  assert.equal(reg.loads, 0, 'the game module was imported under reduced motion');
  assert.deepEqual(page.contextRequests, []);
  assert.equal(screen(s), 'reveal');
  assert.ok(s.go(), 'the MC can step on');
  // Positive control: the same press without reduced motion does import.
  const o2 = fakeOrigin();
  storedEvent(o2, { n: 50, games: FIREWORKS_R1 });
  const page2 = makePage();
  const reg2 = makeRegistry(makeModule());
  const s2 = await mount({ origin: o2, startReveal: (o) => startReveal({ ...o, registry: reg2.registry, container: page2.container }, page2.env) });
  press(s2);
  await o2.idle();
  assert.equal(reg2.loads, 1, 'control: without reduced motion the game loads');
  assert.equal(page2.rendererLoads, 1);
});
