// Two screens on one stored event (two tabs, or a duplicated projector tab), and the setup page replacing
// it: each round of an event is drawn at most once, ever, a screen that is behind never writes over what is
// stored, a press acts only on the step its button was rendered at, and nothing writes without the event
// lock. Driven through the real route and the real setup page on the prize fake DOM, with one shared storage
// behind a Storage object per tab, a fake Web Locks manager that grants only when the test says so, and
// storage events the test delivers when it chooses.
//
// The invariant is checked on EVERY write any tab makes (the shared storage logs each one with the value
// it replaced), after every step of every interleaving:
//   - per event key and round, at most one round code and one survivor set is ever written; the final, one
//     order per event key;
//   - only the setup page changes the event key, and only to a fresh event at round 1; a screen's write never
//     replaces another event, never steps the walk back or sideways, and never rewrites a stored round;
//   - what each tab holds and shows is the one stored draw, and its mounted control was rendered at the text
//     it holds (StageHandle.version);
//   - in explore, a screen's write lands only on the text the screen showed when its button was pressed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STORAGE_KEY, createEvent, decodeEvent, drawNext, encodeEvent, position } from '../../prize-event/event.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { fakeLocks, mount, mountSetupPage, names, seeded, sharedStorage } from './stage-harness.mjs';

const PHASE = { ready: 0, drawn: 1, revealed: 2 };
/** How far along the walk a state is, in steps; only for checking that writes move forward. */
const ordinal = (s) => {
  const p = position(s);
  return (p.kind === 'round' ? (p.round - 1) * 3 : 12) + PHASE[p.at];
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

function event(n, seed) {
  return createEvent({ eventName: 'Party 2570', names: names(n), schedule: proposeSchedule(n), prizes: ['A', 'B', 'C', 'D', 'E'] }, seeded(seed));
}

/** Tabs A and B on one stored event, and a setup page mounted on first use. Each tab's own draws come from
 *  its own seeded source, so two draws of one round would differ: a second draw cannot hide behind an
 *  identical result. `locks` true: one shared fake manager, each tab's requests tagged with its name. */
function world({ locks = false, n = 9, initial = event(n, 1), wrap = {} } = {}) {
  const shared = sharedStorage();
  const manager = locks ? fakeLocks() : null;
  shared.map.set(STORAGE_KEY, JSON.stringify(initial));
  const tabs = {};
  for (const [name, seed] of [['A', 101], ['B', 202]]) {
    const t = shared.tab(name);
    const storage = wrap[name] ? wrap[name](t.storage) : t.storage;
    tabs[name] = { ...mount({ storage, rng: seeded(seed), locks: manager ? manager.as(name) : null, onStorage: t.onStorage }), deliver: t.deliver, name };
  }
  const setupTab = shared.tab('setup');
  let page = null;
  const setup = () => (page ??= mountSetupPage({ storage: setupTab.storage, locks: manager ? manager.as('setup') : null }));
  // What checkInvariant has already verified, so each step checks only the writes made since the last one.
  // A fixture stored before any tab mounted may already hold draws; they count as stored.
  const audit = { checked: 0, codes: new Map(), finals: new Map() };
  for (const r of initial.rounds) audit.codes.set(roundKey(initial.eventKey, r.round), new Set([drawOf(r)]));
  return { shared, tabs, ev: initial, locks: manager, audit, setup };
}

/** The MC's tap on a tab's button, past its arm window (the gate is tested in arm-reveal-paths). */
function press(tab) {
  const b = tab.go();
  if (!b) return false;
  b.disabled = false;
  b.click();
  return true;
}

const roundKey = (eventKey, round) => `${eventKey}#${round}`;
const drawOf = (r) => `${r.code}:${r.survivors.join()}`;

function checkInvariant({ shared, tabs, audit }, label) {
  const { codes, finals } = audit;
  for (const w of shared.writes.slice(audit.checked)) {
    const after = decodeEvent(w.raw);
    assert.ok(after, `${label}: ${w.by} wrote a blob that does not decode`);
    const before = decodeEvent(w.before);
    if (w.by === 'setup') {
      assert.deepEqual([after.rounds.length, after.final, after.at], [0, null, 'ready'], `${label}: the setup page stored an event that is not at round 1`);
      if (before) assert.notEqual(after.eventKey, before.eventKey, `${label}: the setup page reused the stored event's key`);
    } else {
      assert.ok(before, `${label}: tab ${w.by} wrote where no event was stored`);
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
  audit.checked = shared.writes.length;
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

/**
 * Every sequence of `length` actions over `actions`, run on a fresh world each, checked after each step. A
 * press records the text its tab showed; when the lock grants that press, its tab's first write must replace
 * exactly that text: a press queued on one step never acts on another.
 */
function explore({ locks, actions, length }) {
  const counts = { runs: 0, contested: 0, setupBehindStage: 0, stageBehindSetup: 0, setupStored: 0 };
  const total = actions.length ** length;
  for (let code = 0; code < total; code++) {
    const w = world({ locks });
    const plan = [];
    for (let i = 0, c = code; i < length; i++, c = Math.floor(c / actions.length)) plan.push(actions[c % actions.length]);
    const pressedReady = new Set();
    const seenIn = new Set();
    plan.forEach((act, i) => {
      const label = `${plan.slice(0, i + 1).join(' ')}`;
      if (act === 'A' || act === 'B') {
        const tab = w.tabs[act];
        const held = tab.stage.current();
        if (held && held.at === 'ready' && held.rounds.length === 0) pressedReady.add(act);
        const shown = held ? encodeEvent(held) : null;
        const queued = w.locks?.queue.length ?? 0;
        press(tab);
        if (w.locks && w.locks.queue.length > queued) w.locks.queue[w.locks.queue.length - 1].shown = shown;
      } else if (act === 'grant') {
        const head = w.locks.queue[0];
        const behind = w.locks.queue.slice(1).map((q) => q.by);
        if (head?.by === 'setup' && behind.some((b) => b !== 'setup')) seenIn.add('stageBehindSetup');
        if (head && head.by !== 'setup' && behind.includes('setup')) seenIn.add('setupBehindStage');
        const from = w.shared.writes.length;
        w.locks.grant();
        const mine = w.shared.writes.slice(from).filter((x) => x.by === head?.by);
        if (head && head.by !== 'setup' && mine.length) {
          assert.equal(mine[0].before, head.shown, `${label}: tab ${head.by} acted on a step its pressed button was not rendered at`);
        }
      } else if (act === 'evA') w.tabs.A.deliver();
      else if (act === 'evB') w.tabs.B.deliver();
      else if (act === 'setup') w.setup().submit();
      checkInvariant(w, label);
    });
    if (pressedReady.size === 2) counts.contested++;
    for (const k of seenIn) counts[k]++;
    if (w.shared.writes.some((x) => x.by === 'setup')) counts.setupStored++;
    counts.runs++;
  }
  return counts;
}

test('with Web Locks: every interleaving of two tabs (presses, lock grants, storage events) draws each round once', () => {
  const { runs, contested } = explore({ locks: true, actions: ['A', 'B', 'grant', 'evA', 'evB'], length: 6 });
  assert.equal(runs, 5 ** 6);
  // Non-vacuity: the runs that matter are the ones where both tabs pressed round 1's reveal from ready.
  assert.ok(contested > 1000, `only ${contested} runs had both tabs press the same undrawn round`);
});

test('with Web Locks: every interleaving of two tabs and the setup page replacing the event keeps every invariant', () => {
  const c = explore({ locks: true, actions: ['A', 'B', 'grant', 'evA', 'evB', 'setup'], length: 5 });
  assert.equal(c.runs, 6 ** 5);
  // Non-vacuity, both orders at the lock: a press queued behind the setup page's store (the queued-click
  // case), and the setup page queued behind a press (the setup-inside-a-press case).
  assert.ok(c.stageBehindSetup > 100, `only ${c.stageBehindSetup} runs granted the setup page with a press queued behind it`);
  assert.ok(c.setupBehindStage > 100, `only ${c.setupBehindStage} runs granted a press with the setup page queued behind it`);
  assert.ok(c.setupStored > 1000, `only ${c.setupStored} runs stored a replacement event`);
});

test('without Web Locks: no interleaving of presses, storage events and setup starts writes anything; every screen is cold', () => {
  const actions = ['A', 'B', 'evA', 'evB', 'setup'];
  let runs = 0;
  let attempts = 0;
  for (let code = 0; code < actions.length ** 5; code++) {
    const w = world();
    for (let i = 0, c = code; i < 5; i++, c = Math.floor(c / actions.length)) {
      const act = actions[c % actions.length];
      if (act === 'A' || act === 'B') {
        attempts++;
        assert.equal(press(w.tabs[act]), false, `tab ${act} offered a press without Web Locks`);
      } else if (act === 'setup') w.setup().submit();
      else w.tabs[act.slice(2)].deliver();
    }
    assert.deepEqual(w.shared.writes, [], 'a writer without Web Locks wrote');
    for (const tab of Object.values(w.tabs)) assert.equal(tab.frame.getAttribute('data-screen'), 'cold');
    runs++;
  }
  assert.equal(runs, 5 ** 5);
  assert.ok(attempts > 5000, `only ${attempts} presses were tried`);
});

test('positive control for the lock-less runs: a locked tab beside a lock-less one draws, and the lock-less one stays cold and writes nothing', () => {
  const shared = sharedStorage();
  shared.map.set(STORAGE_KEY, JSON.stringify(event(9, 1)));
  const locks = fakeLocks();
  const a = shared.tab('A');
  const b = shared.tab('B');
  const A = mount({ storage: a.storage, rng: seeded(101), locks, onStorage: a.onStorage });
  const B = mount({ storage: b.storage, rng: seeded(202), locks: null, onStorage: b.onStorage });
  assert.ok(press(A));
  locks.grant();
  assert.equal(shared.writes.filter((x) => x.by === 'A').length, 2, 'the locked tab did not draw and reveal');
  b.deliver();
  assert.equal(press(B), false);
  assert.equal(B.frame.getAttribute('data-screen'), 'cold');
  assert.deepEqual(shared.writes.filter((x) => x.by === 'B'), []);
});

const settle = (w) => {
  while (w.locks?.grant());
};

test('with Web Locks: two tabs on round 1, both press reveal, no storage event between: one draw, the second tab follows and writes nothing', () => {
  const w = world({ locks: true });
  press(w.tabs.A);
  press(w.tabs.B);
  settle(w);
  checkInvariant(w, 'both pressed');
  assert.deepEqual(w.shared.writes.filter((x) => x.by === 'B'), [], 'the tab that was behind wrote');
  assert.equal(w.tabs.B.frame.getAttribute('data-screen'), 'reveal', 'the tab that was behind did not follow to the stored reveal');
  assert.deepEqual(w.tabs.B.stage.current().rounds, w.tabs.A.stage.current().rounds);
});

test('with Web Locks: a tab left behind on round 1 never writes its old step while the other walks on', () => {
  const w = world({ locks: true });
  for (let i = 0; i < 3; i++) {
    press(w.tabs.A); // reveal 1, next, reveal 2
    settle(w);
  }
  const before = w.shared.map.get(STORAGE_KEY);
  press(w.tabs.B); // B still shows round 1, ready
  settle(w);
  assert.equal(w.shared.map.get(STORAGE_KEY), before, 'the stale tab wrote over newer state');
  assert.deepEqual(w.shared.writes.filter((x) => x.by === 'B'), []);
  assert.deepEqual(position(w.tabs.B.stage.current()), { kind: 'round', round: 2, at: 'revealed' }, 'the stale tab did not adopt the stored step');
  checkInvariant(w, 'stale');
});

test('with Web Locks: an event replaced by the setup page is never written over by a screen still on the old one', () => {
  const w = world({ locks: true });
  for (let i = 0; i < 4; i++) {
    press(w.tabs.A); // to round 2 revealed, past the new event's position
    settle(w);
  }
  const page = w.setup();
  page.submit();
  settle(w);
  const fresh = decodeEvent(w.shared.map.get(STORAGE_KEY));
  assert.notEqual(fresh.eventKey, w.ev.eventKey, 'the setup page did not replace the event');
  assert.deepEqual(page.visits, ['/game/prize-draw/play/']);
  const writes = w.shared.writes.length;
  press(w.tabs.A);
  settle(w);
  assert.equal(w.shared.writes.length, writes, 'the old screen wrote over the new event');
  assert.equal(w.tabs.A.stage.current().eventKey, fresh.eventKey, 'the old screen did not take up the new event');
  assert.equal(w.tabs.A.frame.getAttribute('data-screen'), 'round');
  checkInvariant(w, 'replaced');
});

test('with Web Locks: two taps on one button before anything runs move the event one step, not two', () => {
  const w = world({ locks: true });
  const b = w.tabs.A.go();
  b.disabled = false;
  b.click();
  b.click();
  settle(w);
  assert.deepEqual(position(decodeEvent(w.shared.map.get(STORAGE_KEY))), { kind: 'round', round: 1, at: 'revealed' });
});

// The same four scenarios without Web Locks: a screen that cannot take the lock shows no event, so it has no
// button to press and writes nothing; the setup page refuses to store.
const NO_LOCK_SCENARIOS = {
  'two tabs on round 1, both press reveal': (w) => [press(w.tabs.A), press(w.tabs.B)],
  'a tab left behind while the other would walk on': (w) => [press(w.tabs.A), press(w.tabs.A), press(w.tabs.A), press(w.tabs.B)],
  'the setup page replacing the event under a screen': (w) => {
    const page = w.setup();
    page.submit();
    assert.deepEqual(page.visits, [], 'the setup page opened the projector without Web Locks');
    return [press(w.tabs.A)];
  },
  'two taps on one button': (w) => [press(w.tabs.A), press(w.tabs.A)],
};
for (const [name, run] of Object.entries(NO_LOCK_SCENARIOS)) {
  test(`without Web Locks: ${name}: no screen offers a press, nothing is written, every screen is cold`, async () => {
    const w = world();
    const before = w.shared.map.get(STORAGE_KEY);
    assert.deepEqual(run(w).filter(Boolean), [], 'a screen without Web Locks offered a press');
    await tick();
    assert.deepEqual(w.shared.writes, [], 'a writer without Web Locks wrote');
    assert.equal(w.shared.map.get(STORAGE_KEY), before);
    for (const tab of Object.values(w.tabs)) assert.equal(tab.frame.getAttribute('data-screen'), 'cold');
  });
}

test('with Web Locks: a draw requested by both tabs runs once even when neither tab hears about the other', () => {
  const w = world({ locks: true });
  press(w.tabs.A);
  press(w.tabs.B);
  assert.equal(w.locks.queue.length, 2, 'both tabs must be waiting on the lock for this case to mean anything');
  w.locks.grant();
  w.locks.grant();
  checkInvariant(w, 'queued');
  assert.equal(w.shared.writes.filter((x) => x.by === 'B').length, 0);
});

test('without Web Locks: a press landing inside the other tab\'s re-read reaches no storage at all', () => {
  const w = world();
  let reads = 0;
  let fired = false;
  w.shared.setHook((op, by) => {
    reads++;
    if (op === 'get' && by === 'A' && !fired) {
      fired = true;
      press(w.tabs.B);
    }
  });
  assert.equal(press(w.tabs.A), false, 'a screen without Web Locks offered a press');
  assert.equal(fired, false, 'the lock-less press re-read storage');
  assert.equal(reads, 0, 'a lock-less screen touched storage');
  assert.deepEqual(w.shared.writes, []);
});

test('without Web Locks, the race inside one write (judge block 2): zero writes, at most one round 1 code', () => {
  const w = world();
  let interleaved = false;
  w.shared.setHook((op, by) => {
    if (op === 'set' && by === 'A' && !interleaved) {
      interleaved = true;
      press(w.tabs.B);
    }
  });
  press(w.tabs.A);
  assert.deepEqual(w.shared.writes, [], 'a lock-less tab wrote');
  const codes = new Set(w.shared.writes.map((x) => decodeEvent(x.raw).rounds[0]?.code));
  assert.ok(codes.size <= 1, `${codes.size} round 1 codes were stored`);
  for (const tab of Object.values(w.tabs)) assert.equal(tab.stage.current(), null, `tab ${tab.name} holds an event without Web Locks`);
});

const refusing = () => ({
  requests: 0,
  request() {
    this.requests++;
    return Promise.reject(new Error('SecurityError'));
  },
});

test('a refused lock request writes nothing and leaves the button live: every tap asks again, none writes', async () => {
  const locks = refusing();
  const shared = sharedStorage();
  shared.map.set(STORAGE_KEY, JSON.stringify(event(9, 1)));
  const t = shared.tab('A');
  const A = mount({ storage: t.storage, rng: seeded(101), locks });
  press(A);
  await tick();
  assert.equal(locks.requests, 1, 'the press never asked for the lock: this test measured nothing');
  assert.deepEqual(shared.writes, [], 'a refused press wrote');
  assert.deepEqual(position(decodeEvent(shared.map.get(STORAGE_KEY))), { kind: 'round', round: 1, at: 'ready' });
  press(A);
  await tick();
  assert.equal(locks.requests, 2, 'the button is dead after a refused lock');
  assert.deepEqual(shared.writes, []);
});

test('a rejected lock request, then a granting one: the first press writes nothing, the second acts', async () => {
  const inner = fakeLocks();
  let refuse = true;
  const locks = { request: (name, cb) => (refuse ? Promise.reject(new Error('SecurityError')) : inner.request(name, cb)) };
  const shared = sharedStorage();
  shared.map.set(STORAGE_KEY, JSON.stringify(event(9, 1)));
  const t = shared.tab('A');
  const A = mount({ storage: t.storage, rng: seeded(101), locks });
  press(A);
  await tick();
  assert.deepEqual(shared.writes, [], 'the refused press wrote');
  refuse = false;
  press(A);
  assert.equal(inner.queue.length, 1, 'the second press never reached the lock: the button died on the refusal');
  inner.grant();
  assert.deepEqual(position(decodeEvent(shared.map.get(STORAGE_KEY))), { kind: 'round', round: 1, at: 'revealed' }, 'the granted press did not act');
});

test('the setup page submitting inside a projector press (judge block 1) queues behind it; its replacement is what stays stored', () => {
  const w = world({ locks: true, initial: event(50, 1) });
  const page = w.setup();
  let submitted = false;
  w.shared.setHook((op, by) => {
    if (op === 'set' && by === 'A' && !submitted) {
      submitted = true;
      page.submit();
    }
  });
  press(w.tabs.A);
  w.locks.grant();
  assert.ok(submitted, 'the setup page never submitted inside the press: this test measured nothing');
  assert.deepEqual(w.locks.queue.map((q) => q.by), ['setup'], 'the setup page did not queue behind the projector');
  assert.deepEqual(page.visits, [], 'the setup page opened the projector before its write');
  assert.deepEqual(w.shared.writes.map((x) => x.by), ['A', 'A'], 'something wrote inside the projector\'s critical section');
  w.locks.grant();
  const stored = decodeEvent(w.shared.map.get(STORAGE_KEY));
  assert.notEqual(stored.eventKey, w.ev.eventKey, 'the replacement is not what is stored');
  assert.equal(stored.setup.eventName, 'Replacement');
  assert.deepEqual(page.visits, ['/game/prize-draw/play/'], 'the setup page did not open the projector after its write');
  w.tabs.A.deliver();
  w.tabs.B.deliver();
  assert.equal(w.tabs.A.stage.current().eventKey, stored.eventKey, 'the projector did not take up the replacement');
  assert.equal(w.shared.map.get(STORAGE_KEY), encodeEvent(stored));
  assert.deepEqual(w.shared.writes.map((x) => x.by), ['A', 'A', 'setup']);
  checkInvariant(w, 'setup inside a press');
});

test('a press queued at the lock when a non-project write replaces the event (judge block 3) is dropped: round 1 stays ready', () => {
  const w = world({ locks: true, initial: event(50, 1) });
  press(w.tabs.A);
  assert.equal(w.locks.queue.length, 1);
  const replacement = event(50, 9);
  w.shared.put(STORAGE_KEY, JSON.stringify(replacement));
  w.tabs.A.deliver();
  assert.equal(w.tabs.A.stage.current().eventKey, replacement.eventKey);
  w.locks.grant();
  assert.equal(w.tabs.A.stage.current().eventKey, replacement.eventKey);
  assert.deepEqual(position(w.tabs.A.stage.current()), { kind: 'round', round: 1, at: 'ready' }, 'the queued press drew the replacement without a new press');
  assert.deepEqual(w.shared.writes, [], 'the queued press wrote');
});

test('a press queued behind the setup page\'s store, the projector told of the new event before its grant: dropped, nothing drawn', () => {
  const w = world({ locks: true });
  w.setup().submit();
  press(w.tabs.A);
  assert.deepEqual(w.locks.queue.map((q) => q.by), ['setup', 'A']);
  w.locks.grant();
  w.tabs.A.deliver();
  const fresh = decodeEvent(w.shared.map.get(STORAGE_KEY));
  assert.equal(w.tabs.A.stage.current().eventKey, fresh.eventKey);
  w.locks.grant();
  assert.deepEqual(position(w.tabs.A.stage.current()), { kind: 'round', round: 1, at: 'ready' }, 'the press queued on the old event drew the new one');
  assert.deepEqual(w.shared.writes.map((x) => x.by), ['setup']);
});

test('a failed reveal-save, then the other tab\'s reveal: the take-up rebuilds the button, and the button still acts', () => {
  const ev = event(9, 1);
  const drawn = drawNext(ev, seeded(5));
  let failA = false;
  const w = world({
    locks: true,
    initial: drawn,
    wrap: { A: (s) => ({ getItem: (k) => s.getItem(k), setItem: (k, v) => { if (failA) throw new Error('quota'); s.setItem(k, v); } }) },
  });
  failA = true;
  press(w.tabs.A);
  w.locks.grant();
  assert.equal(w.tabs.A.frame.getAttribute('data-screen'), 'reveal', 'precondition: A reveals the stored draw although its write failed');
  assert.deepEqual(w.shared.writes, []);
  failA = false;
  press(w.tabs.B);
  w.locks.grant();
  assert.deepEqual(w.shared.writes.map((x) => x.by), ['B']);
  const next = w.tabs.A.go();
  w.tabs.A.deliver();
  assert.notStrictEqual(w.tabs.A.go(), next, 'taking up the other tab\'s reveal did not rebuild the button');
  assert.equal(w.tabs.A.go().disabled, true, 'the rebuilt button was not armed');
  checkInvariant(w, 'take-up after a failed save');
  assert.ok(press(w.tabs.A));
  w.locks.grant();
  assert.deepEqual(position(decodeEvent(w.shared.map.get(STORAGE_KEY))), { kind: 'round', round: 2, at: 'ready' }, 'the button is dead after taking up the other tab\'s reveal');
  assert.deepEqual(w.shared.writes.map((x) => x.by), ['B', 'A']);
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
});
