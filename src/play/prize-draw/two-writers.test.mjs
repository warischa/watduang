// Two screens on one stored event (two tabs, or a duplicated projector tab), and the setup page replacing
// it: each round of an event is drawn at most once, ever, a screen that is behind never writes over what is
// stored, and a press acts only on the step its button was rendered at. Driven through the real route, the
// real setup page and the real store (store.ts) over one in-memory origin in manual mode: the test decides
// when each IndexedDB transaction runs (one `step` = up to the end of the next transaction or open), and
// when each tab hears of another tab's commit (BroadcastChannel messages wait for `evA` / `evB`). No Web Locks
// anywhere: since gh#313 the compare-and-set of one IndexedDB transaction is the whole guarantee.
//
// The invariant is checked on EVERY committed write (the origin logs each one with the value it replaced),
// after every step of every interleaving:
//   - per event key and round, at most one round code and one survivor set is ever written; the final, one
//     order per event key;
//   - only the setup page changes the event key, and only to a fresh event at round 1; a screen's write never
//     replaces another event, never steps the walk back or sideways, and never rewrites a stored round;
//   - what each tab holds and shows is the one stored draw, and its mounted control was rendered at the text
//     it holds (StageHandle.version);
//   - a screen's write lands only on the text the screen showed when its button was pressed;
//   - once every transaction has run and every message is delivered, every tab holds what is stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { advance, createEvent, decodeEvent, drawNext, encodeEvent, position } from '../../prize-event/event.ts';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { mountStage } from './stage.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import {
  REFUSED_BROWSER,
  eventWrites,
  fakeOrigin,
  mountNow,
  mountSetupPage,
  names,
  press,
  seedRaw,
  seeded,
  settle,
  storedRaw,
  tick,
} from './stage-harness.mjs';

const PHASE = { ready: 0, drawn: 1, revealed: 2 };
/** How far along the walk a state is, in steps; only for checking that writes move forward. */
const ordinal = (s) => {
  const p = position(s);
  return (p.kind === 'round' ? (p.round - 1) * 3 : 12) + PHASE[p.at];
};

function event(n, seed) {
  return createEvent({ eventName: 'Party 2570', names: names(n), schedule: proposeSchedule(n), prizes: ['A', 'B', 'C', 'D', 'E'] }, seeded(seed));
}

/** Run tasks up to and including the next transaction or open boundary, draining continuations after each. */
async function step(origin) {
  for (;;) {
    const kind = origin.step();
    await tick();
    if (!kind || kind === 'boundary') return Boolean(kind);
  }
}

/** Tabs A and B on one stored event, both loaded, and a setup page mounted on first use. Each tab's own
 *  draws come from its own seeded source, so two draws of one round would differ: a second draw cannot hide
 *  behind an identical result. `env` replaces a tab's environment (a refused browser). */
async function world({ n = 9, initial = event(n, 1), env = {}, confirm = () => true } = {}) {
  const origin = fakeOrigin({ manual: true });
  seedRaw(origin, encodeEvent(initial));
  const tabs = {};
  for (const [name, seed] of [['A', 101], ['B', 202]]) {
    tabs[name] = { ...mountNow({ origin, env: env[name] ?? origin.tab(name), rng: seeded(seed) }), name };
  }
  await settle(origin);
  let page = null;
  const setup = () => (page ??= mountSetupPage({ origin, env: env.setup ?? origin.tab('setup'), confirm }));
  // What checkInvariant has already verified, so each step checks only the writes made since the last one.
  // A fixture stored before any tab mounted may already hold draws; they count as stored.
  const audit = { checked: 0, codes: new Map(), finals: new Map(), pressedAt: {} };
  for (const r of initial.rounds) audit.codes.set(roundKey(initial.eventKey, r.round), new Set([drawOf(r)]));
  return { origin, tabs, ev: initial, audit, setup };
}

const roundKey = (eventKey, round) => `${eventKey}#${round}`;
const drawOf = (r) => `${r.code}:${r.survivors.join()}`;

/** A press that a test records: the text the tab showed, if the press reached the store. A stored text never
 *  comes back once replaced, so each recorded text may be written over at most once. */
function pressTab(w, name) {
  const tab = w.tabs[name];
  const before = tab.stage.version();
  const pressed = press(tab);
  if (pressed && !before.busy && tab.stage.version().busy) (w.audit.pressedAt[name] ??= new Set()).add(before.seen);
  return pressed;
}

function checkInvariant({ origin, tabs, audit }, label) {
  const { codes, finals } = audit;
  const writes = eventWrites(origin);
  for (const w of writes.slice(audit.checked)) {
    const after = decodeEvent(w.after);
    assert.ok(after, `${label}: ${w.by} wrote a blob that does not decode`);
    const before = decodeEvent(w.before ?? null);
    if (w.by === 'setup') {
      assert.deepEqual([after.rounds.length, after.final, after.at], [0, null, 'ready'], `${label}: the setup page stored an event that is not at round 1`);
      if (before) assert.notEqual(after.eventKey, before.eventKey, `${label}: the setup page reused the stored event's key`);
    } else {
      assert.ok(before, `${label}: tab ${w.by} wrote where no event was stored`);
      assert.ok(audit.pressedAt[w.by]?.has(w.before), `${label}: tab ${w.by} wrote over a text its pressed button was not rendered at`);
      audit.pressedAt[w.by].delete(w.before);
      assert.equal(after.eventKey, before.eventKey, `${label}: tab ${w.by} wrote over another event`);
      assert.ok(ordinal(after) > ordinal(before), `${label}: tab ${w.by} wrote a step that is not ahead of the stored one`);
      before.rounds.forEach((r, i) => assert.deepEqual(after.rounds[i], r, `${label}: tab ${w.by} rewrote stored round ${i + 1}`));
      if (before.final) assert.deepEqual(after.final, before.final, `${label}: tab ${w.by} rewrote the stored final`);
    }
    after.rounds.forEach((r) => {
      const k = roundKey(after.eventKey, r.round);
      codes.set(k, (codes.get(k) ?? new Set()).add(drawOf(r)));
    });
    if (after.final) finals.set(after.eventKey, (finals.get(after.eventKey) ?? new Set()).add(after.final.order.join()));
  }
  audit.checked = writes.length;
  for (const [k, seen] of codes) assert.ok(seen.size <= 1, `${label}: round ${k} was drawn ${seen.size} times`);
  for (const [k, seen] of finals) assert.ok(seen.size <= 1, `${label}: the final of ${k} was drawn ${seen.size} times`);
  for (const tab of Object.values(tabs)) {
    const v = tab.stage.version();
    if (tab.go()) assert.equal(v.token, v.seen, `${label}: tab ${tab.name}'s button was rendered at another text than the one it holds`);
    const held = tab.stage.current();
    if (!held) continue;
    for (const r of held.rounds) {
      assert.ok(codes.get(roundKey(held.eventKey, r.round))?.has(drawOf(r)), `${label}: tab ${tab.name} holds a round ${r.round} draw that was never stored`);
    }
    if (tab.frame.getAttribute('data-screen') === 'reveal') {
      const last = held.rounds[held.rounds.length - 1];
      const byId = new Map(held.setup.people.map((p) => [p.id, p.name]));
      const shown = tab.frame.querySelectorAll('.pd-chip.in').filter((c) => !c.classList.contains('pd-legend-chip')).map((c) => c.textContent);
      assert.deepEqual(shown, last.survivors.map((id) => byId.get(id)), `${label}: tab ${tab.name} shows another draw than the one it holds`);
    }
  }
}

/** Run every transaction and deliver every message until nothing moves; then every tab holds what is stored. */
async function quiesce(w, label) {
  for (let round = 0; round < 50; round++) {
    while (await step(w.origin)) checkInvariant(w, label);
    const waiting = Object.values(w.tabs).some((t) => t.env.pendingMessages?.());
    for (const t of Object.values(w.tabs)) t.deliver();
    await tick();
    if (!waiting && !w.origin.tasks.length) break;
  }
  checkInvariant(w, label);
  const raw = storedRaw(w.origin);
  for (const tab of Object.values(w.tabs)) {
    assert.equal(tab.stage.version().seen, raw, `${label}: tab ${tab.name} did not end on the stored event`);
  }
}

/**
 * Every sequence of `length` actions over `actions`, run on a fresh world each, checked after each step and
 * once more after everything has settled.
 */
async function explore({ actions, length }) {
  const counts = { runs: 0, contested: 0, staleDropped: 0, setupStored: 0, setupBehindPress: 0, pressBehindSetup: 0 };
  const total = actions.length ** length;
  for (let code = 0; code < total; code++) {
    const w = await world();
    const plan = [];
    for (let i = 0, c = code; i < length; i++, c = Math.floor(c / actions.length)) plan.push(actions[c % actions.length]);
    const pressedReady = new Set();
    let setupSubmitted = false;
    let pressInFlightAtSetup = false;
    let setupInFlightAtPress = false;
    for (const [i, act] of plan.entries()) {
      const label = plan.slice(0, i + 1).join(' ');
      if (act === 'A' || act === 'B') {
        const held = w.tabs[act].stage.current();
        const wasBusy = w.tabs[act].stage.version().busy;
        pressTab(w, act);
        if (!wasBusy && held && held.at === 'ready' && held.rounds.length === 0 && w.tabs[act].stage.version().busy) pressedReady.add(act);
        if (setupSubmitted && w.origin.tasks.length) setupInFlightAtPress = true;
      } else if (act === 'step') await step(w.origin);
      else if (act === 'evA') w.tabs.A.deliver();
      else if (act === 'evB') w.tabs.B.deliver();
      else if (act === 'setup') {
        if (Object.values(w.tabs).some((t) => t.stage.version().busy)) pressInFlightAtSetup = true;
        setupSubmitted = true;
        w.setup().submit();
      }
      await tick();
      checkInvariant(w, label);
    }
    await quiesce(w, `${plan.join(' ')} (settled)`);
    if (pressedReady.size === 2) counts.contested++;
    if (eventWrites(w.origin).some((x) => x.by === 'setup')) counts.setupStored++;
    if (pressInFlightAtSetup) counts.setupBehindPress++;
    if (setupInFlightAtPress) counts.pressBehindSetup++;
    counts.runs++;
  }
  return counts;
}

test('every interleaving of two tabs (presses, transactions, commit notices) draws each round once, and both tabs end on the stored draw', async () => {
  const c = await explore({ actions: ['A', 'B', 'step', 'evA', 'evB'], length: 6 });
  assert.equal(c.runs, 5 ** 6);
  // Non-vacuity: the runs that matter are the ones where both tabs pressed round 1's reveal from ready, each
  // press reaching the store.
  assert.ok(c.contested > 1000, `only ${c.contested} runs had both tabs press the same undrawn round`);
});

test('every interleaving of two tabs and the setup page replacing the event keeps every invariant', async () => {
  const c = await explore({ actions: ['A', 'B', 'step', 'evA', 'evB', 'setup'], length: 5 });
  assert.equal(c.runs, 6 ** 5);
  // Non-vacuity, both orders: the setup page submitting while a press waits on its write, and a press made
  // while the setup page's start is still in flight.
  assert.ok(c.setupBehindPress > 100, `only ${c.setupBehindPress} runs submitted the setup page while a press was in flight`);
  assert.ok(c.pressBehindSetup > 100, `only ${c.pressBehindSetup} runs pressed while the setup page's start was in flight`);
  assert.ok(c.setupStored > 1000, `only ${c.setupStored} runs stored a replacement event`);
});

test('two tabs on round 1, both press reveal, no notice between: one draw, the second tab follows and writes nothing', async () => {
  const w = await world();
  pressTab(w, 'A');
  pressTab(w, 'B');
  await settle(w.origin);
  checkInvariant(w, 'both pressed');
  assert.deepEqual(eventWrites(w.origin).filter((x) => x.by === 'B'), [], 'the tab that was behind wrote');
  assert.equal(w.tabs.B.frame.getAttribute('data-screen'), 'reveal', 'the tab that was behind did not follow to the stored reveal');
  assert.deepEqual(w.tabs.B.stage.current().rounds, w.tabs.A.stage.current().rounds);
});

test('a tab left behind on round 1 never writes its old step while the other walks on', async () => {
  const w = await world();
  for (let i = 0; i < 3; i++) {
    pressTab(w, 'A'); // reveal 1, next, reveal 2
    await settle(w.origin);
  }
  const before = storedRaw(w.origin);
  pressTab(w, 'B'); // B still shows round 1, ready: it never heard
  await settle(w.origin);
  assert.equal(storedRaw(w.origin), before, 'the stale tab wrote over newer state');
  assert.deepEqual(eventWrites(w.origin).filter((x) => x.by === 'B'), []);
  assert.deepEqual(position(w.tabs.B.stage.current()), { kind: 'round', round: 2, at: 'revealed' }, 'the stale tab did not take up the stored step');
  checkInvariant(w, 'stale');
});

test('an event replaced by the setup page is never written over by a screen still on the old one', async () => {
  const w = await world();
  for (let i = 0; i < 4; i++) {
    pressTab(w, 'A'); // to round 2 revealed, past the new event's position
    await settle(w.origin);
  }
  const page = w.setup();
  page.submit();
  await settle(w.origin);
  const fresh = decodeEvent(storedRaw(w.origin));
  assert.notEqual(fresh.eventKey, w.ev.eventKey, 'the setup page did not replace the event');
  assert.deepEqual(page.visits, ['/game/prize-draw/play/']);
  const writes = eventWrites(w.origin).length;
  pressTab(w, 'A'); // A never heard of the new event
  await settle(w.origin);
  assert.equal(eventWrites(w.origin).length, writes, 'the old screen wrote over the new event');
  assert.equal(w.tabs.A.stage.current().eventKey, fresh.eventKey, 'the old screen did not take up the new event');
  assert.equal(w.tabs.A.frame.getAttribute('data-screen'), 'round');
  checkInvariant(w, 'replaced');
});

test('two taps on one button before anything runs move the event one step, not two', async () => {
  const w = await world();
  const b = w.tabs.A.go();
  b.disabled = false;
  b.click();
  b.click();
  await settle(w.origin);
  assert.deepEqual(position(decodeEvent(storedRaw(w.origin))), { kind: 'round', round: 1, at: 'revealed' });
  assert.equal(eventWrites(w.origin).length, 1);
});

test('a draw requested by both tabs runs once even when neither tab hears about the other', async () => {
  const w = await world();
  pressTab(w, 'A');
  pressTab(w, 'B');
  assert.ok(w.tabs.A.stage.version().busy && w.tabs.B.stage.version().busy, 'both tabs must be waiting on the store for this case to mean anything');
  while (await step(w.origin));
  checkInvariant(w, 'queued');
  assert.equal(eventWrites(w.origin).filter((x) => x.by === 'B').length, 0);
});

// Refused browsers: a tab whose browser cannot open the store shows why, offers no press and writes nothing,
// whatever the other tab and the setup page do.
const REFUSED_SCENARIOS = {
  'two tabs on round 1, both press reveal': (w) => [pressTab(w, 'A'), pressTab(w, 'B')],
  'a tab left behind while the other would walk on': (w) => [pressTab(w, 'A'), pressTab(w, 'A'), pressTab(w, 'B')],
  'the setup page replacing the event under a screen': (w) => {
    w.setup().submit();
    return [pressTab(w, 'A')];
  },
  'two taps on one button': (w) => [pressTab(w, 'A'), pressTab(w, 'A')],
};
for (const [name, run] of Object.entries(REFUSED_SCENARIOS)) {
  test(`refused browser: ${name}: no screen offers a press, nothing is written, every screen says why`, async () => {
    const w = await world({ env: { A: {}, B: {}, setup: {} } });
    const before = storedRaw(w.origin);
    assert.deepEqual(run(w).filter(Boolean), [], 'a refused screen offered a press');
    await settle(w.origin);
    assert.deepEqual(eventWrites(w.origin), [], 'a refused browser wrote');
    assert.equal(storedRaw(w.origin), before);
    for (const tab of Object.values(w.tabs)) {
      assert.equal(tab.frame.getAttribute('data-screen'), 'refused');
      assert.equal(tab.frame.textContent, REFUSED_BROWSER);
    }
  });
}

test('positive control for the refused runs: a working tab beside a refused one draws, and the refused one writes nothing', async () => {
  const w = await world({ env: { B: {} } });
  assert.ok(pressTab(w, 'A'));
  await settle(w.origin);
  assert.deepEqual(eventWrites(w.origin).map((x) => x.by), ['A'], 'the working tab did not draw and reveal in one write');
  assert.equal(pressTab(w, 'B'), false);
  assert.equal(w.tabs.B.frame.getAttribute('data-screen'), 'refused');
});

/** Close a tab's storage notice the way the MC does (past its arm window). */
function closeNotice(tab) {
  const ok = tab.notice.querySelector('button');
  ok.disabled = false;
  ok.click();
  assert.equal(tab.notice.hidden, true);
}

test('an aborted transaction writes nothing; the button is held while the notice is open, and the next tap after closing it commits', async () => {
  const w = await world();
  w.origin.faults.abortCommits = 1;
  pressTab(w, 'A');
  await settle(w.origin);
  assert.equal(w.origin.faults.abortCommits, 0, 'nothing was aborted: this test measured nothing');
  assert.deepEqual(eventWrites(w.origin), [], 'an aborted press wrote');
  assert.equal(w.tabs.A.notice.hidden, false);
  assert.deepEqual(position(decodeEvent(storedRaw(w.origin))), { kind: 'round', round: 1, at: 'ready' });
  // The MC's button sits outside the notice's veil (gh#314 1a B): a tap on it while the notice is open acts not.
  assert.equal(w.tabs.A.go().disabled, true, 'the MC button is live under an open notice');
  pressTab(w, 'A');
  await settle(w.origin);
  assert.deepEqual(eventWrites(w.origin), [], 'a press acted while the notice was open');
  closeNotice(w.tabs.A);
  pressTab(w, 'A');
  await settle(w.origin);
  assert.deepEqual(position(decodeEvent(storedRaw(w.origin))), { kind: 'round', round: 1, at: 'revealed' }, 'the button is dead after an aborted transaction');
  checkInvariant(w, 'after abort');
});

test('the setup page submitting while a projector press waits on its write queues behind it; its replacement is what stays stored', async () => {
  const w = await world({ initial: event(50, 1) });
  const page = w.setup();
  await settle(w.origin); // the setup page has opened its store
  pressTab(w, 'A');
  page.submit();
  assert.ok(w.tabs.A.stage.version().busy, 'the press was not in flight when the setup page submitted: this test measured nothing');
  await settle(w.origin);
  assert.deepEqual(eventWrites(w.origin).map((x) => x.by), ['A', 'setup']);
  const stored = decodeEvent(storedRaw(w.origin));
  assert.notEqual(stored.eventKey, w.ev.eventKey, 'the replacement is not what is stored');
  assert.equal(stored.setup.eventName, 'Replacement');
  assert.deepEqual(page.asked.length, 1, 'the setup page replaced a saved event without asking');
  assert.deepEqual(page.visits, ['/game/prize-draw/play/'], 'the setup page did not open the projector after its write');
  w.tabs.A.deliver();
  w.tabs.B.deliver();
  await settle(w.origin);
  assert.equal(w.tabs.A.stage.current().eventKey, stored.eventKey, 'the projector did not take up the replacement');
  checkInvariant(w, 'setup behind a press');
});

test('a press waiting on its write when a write from outside this code replaces the event is dropped: nothing is drawn', async () => {
  const w = await world({ initial: event(50, 1) });
  pressTab(w, 'A');
  const replacement = event(50, 9);
  seedRaw(w.origin, encodeEvent(replacement));
  await settle(w.origin);
  assert.equal(w.tabs.A.stage.current().eventKey, replacement.eventKey);
  assert.deepEqual(position(w.tabs.A.stage.current()), { kind: 'round', round: 1, at: 'ready' }, 'the press drew the replacement without a new press');
  assert.deepEqual(eventWrites(w.origin), [], 'the press wrote');
});

test('a press made while the setup page\'s start is in flight lands behind it, on the old text: dropped, nothing drawn on the new event', async () => {
  const w = await world();
  const page = w.setup();
  await settle(w.origin);
  page.submit();
  await tick();
  // the setup page's load runs first; the press is made once its compare-and-set is queued, before it runs
  assert.ok(await step(w.origin), 'the setup page never loaded');
  assert.equal(page.asked.length, 1, 'precondition: the setup page has asked and queued its write');
  pressTab(w, 'A');
  await settle(w.origin);
  const fresh = decodeEvent(storedRaw(w.origin));
  assert.equal(fresh.setup.eventName, 'Replacement');
  assert.deepEqual(eventWrites(w.origin).map((x) => x.by), ['setup'], 'the press queued on the old event drew the new one');
  assert.equal(w.tabs.A.stage.current().eventKey, fresh.eventKey);
  assert.deepEqual(position(w.tabs.A.stage.current()), { kind: 'round', round: 1, at: 'ready' });
});

test('a failed reveal of a stored draw shows nothing; the other tab\'s reveal is taken up, the button is rebuilt and still acts', async () => {
  const ev = event(9, 1);
  const drawn = drawNext(ev, seeded(5));
  const w = await world({ initial: drawn });
  w.origin.faults.abortCommits = 1;
  pressTab(w, 'A');
  await settle(w.origin);
  assert.equal(w.tabs.A.frame.getAttribute('data-screen'), 'round', 'a reveal that was not committed was shown');
  assert.equal(w.tabs.A.notice.hidden, false);
  assert.deepEqual(eventWrites(w.origin), []);
  pressTab(w, 'B');
  await settle(w.origin);
  assert.deepEqual(eventWrites(w.origin).map((x) => x.by), ['B']);
  const next = w.tabs.A.go();
  w.tabs.A.deliver();
  await settle(w.origin);
  assert.notStrictEqual(w.tabs.A.go(), next, 'taking up the other tab\'s reveal did not rebuild the button');
  assert.equal(w.tabs.A.go().disabled, true, 'the rebuilt button is live under the open notice');
  assert.equal(w.tabs.A.frame.getAttribute('data-screen'), 'reveal');
  checkInvariant(w, 'take-up after a failed reveal');
  closeNotice(w.tabs.A);
  assert.equal(w.tabs.A.go().disabled, true, 'the button the close gives back was not armed');
  assert.ok(pressTab(w, 'A'));
  await settle(w.origin);
  assert.deepEqual(position(decodeEvent(storedRaw(w.origin))), { kind: 'round', round: 2, at: 'ready' }, 'the button is dead after taking up the other tab\'s reveal');
  assert.deepEqual(eventWrites(w.origin).map((x) => x.by), ['B', 'A']);
});

/** A store whose every answer the test hands back itself, in the order it chooses. */
function handStore() {
  const calls = [];
  let listener = null;
  const pending = (kind, args) =>
    new Promise((resolve) => calls.push({ kind, args, resolve }));
  return {
    calls,
    notify: () => listener(),
    store: {
      load: () => pending('load', []),
      put: (expected, next) => pending('put', [expected, next]),
      subscribe(l) {
        listener = l;
        return () => {};
      },
      onSuperseded() {},
      status: () => 'open',
      takeOver: async () => false,
    },
  };
}

test('a commit notice answered after this screen applied its own older write is not lost: the screen ends on the newer stored step', async () => {
  const h = handStore();
  const doc = makeDoc();
  const root = doc.createElement('div');
  const live = doc.createElement('p');
  doc.body.append(live, root);
  const stage = mountStage({ doc, root, live, rng: seeded(7), reducedMotion: true, store: Promise.resolve(h.store) });
  const s0 = event(9, 1);
  await tick();
  h.calls.shift().resolve({ raw: encodeEvent(s0), state: s0 });
  await stage.ready;
  // A presses reveal: its write is in flight.
  const button = root.querySelector('.pd-mc').querySelector('button');
  button.disabled = false;
  button.click();
  await tick();
  const put = h.calls.shift();
  assert.equal(put.kind, 'put');
  const s1 = put.args[1];
  // B took the reveal up and pressed next; its commit notice reaches A, whose load is now in flight.
  const s2 = advance(s1);
  h.notify();
  await tick();
  const load = h.calls.shift();
  assert.equal(load.kind, 'load');
  // A's own (older) write answers first, then the load with B's newer step.
  put.resolve({ ok: true, raw: encodeEvent(s1) });
  await tick();
  load.resolve({ raw: encodeEvent(s2), state: s2 });
  await tick();
  // Any later load sees the same stored step.
  for (let i = 0; i < 5 && h.calls.length; i++) {
    h.calls.shift().resolve({ raw: encodeEvent(s2), state: s2 });
    await tick();
  }
  assert.equal(stage.version().seen, encodeEvent(s2), 'the screen stayed on its own older write and will hear no further notice');
  assert.deepEqual(position(stage.current()), { kind: 'round', round: 2, at: 'ready' });
});

test('`seen` is assigned only in save() and adopt(), each of which renders or is followed by a render', () => {
  const source = fs
    .readFileSync(path.join(import.meta.dirname, 'stage.ts'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const body = (name) => {
    const at = source.indexOf(`const ${name} = (`);
    assert.ok(at > -1, `no ${name}() in stage.ts: this test measures nothing`);
    let depth = 0;
    for (let i = source.indexOf('{', source.indexOf('=>', at)); i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) return [at, i];
    }
    throw new Error(`unbalanced ${name}()`);
  };
  const spans = { save: body('save'), adopt: body('adopt') };
  const writes = [...source.matchAll(/(?<![\w.])seen\s*=(?!=)/g)].map((m) => m.index);
  const outside = writes.filter((i) => !Object.values(spans).some(([a, b]) => i > a && i < b));
  assert.deepEqual(outside.map((i) => source.slice(i, source.indexOf('\n', i)).trim()), [], 'seen is assigned outside save() and adopt()');
  assert.ok(writes.length >= 2, `only ${writes.length} assignments of seen found: the matcher went blind`);
  assert.match(source.slice(...spans.adopt), /render\(/, 'adopt() does not always re-render');
  assert.doesNotMatch(source.slice(...spans.adopt), /if\s*\([^)]*\)\s*render\(/, 'adopt() renders only on a condition');
  // save() does not render itself; every call of it is followed by a render in the same branch, either
  // directly or through showCommitted(), which renders at once or presents a 3D reveal whose first exit
  // renders (gh#305). Must-red: a save() followed by anything else fails here.
  const saves = [...source.matchAll(/\bsave\(r\.raw, next\);\s*(\S+)/g)];
  assert.ok(saves.length > 0, 'no save() call found: the matcher went blind');
  for (const m of saves) assert.match(m[1], /^(render|showCommitted)\(/, 'a save() is not followed by a render');
  const shown = source.slice(...body('showCommitted'));
  assert.match(shown, /\bpresent\(/);
  assert.match(shown, /else render\(/, 'showCommitted() has a branch that neither presents nor renders');
  const presented = source.slice(...body('present'));
  assert.match(presented, /render2D: \(\) => \{[\s\S]*?render\(/, "present()'s host exit does not render");
});
