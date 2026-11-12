// node --test — the prize-draw event: setup validation, the state machine, the draw it delegates to
// gh#300's host cut draw, the final permutation, and persistence/resume. Pure, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HEADS,
  MIN_HEADS,
  STORAGE_KEY,
  advance,
  createEvent,
  decodeEvent,
  drawAndSave,
  drawNext,
  encodeEvent,
  liveIds,
  loadEvent,
  position,
  revealDrawn,
  scheduleIssues,
  setupIssues,
  uniformPermutation,
  winners,
  withEventLock,
} from './event.ts';
import { proposeSchedule } from '../prize-draw/schedule.ts';
import { parseCode } from '../prize-draw/round-code.ts';

// Seeded test source, the same generator the gh#300 tests use.
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

// A source that fails the test if anything draws from it: resume and reveal must never draw.
const noDraw = {
  float: () => assert.fail('drew a float'),
  int: () => assert.fail('drew an int'),
  hex: () => assert.fail('drew hex'),
};

const people = (n) => Array.from({ length: n }, (_, i) => `คน ${i + 1}`);
const input = (n, over = {}) => ({
  eventName: 'ปาร์ตี้ปีใหม่ 2570',
  names: people(n),
  // proposeSchedule throws below 9 people, so an out-of-range case passes its own schedule
  schedule: 'schedule' in over ? over.schedule : proposeSchedule(n),
  prizes: ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน'],
  ...over,
});

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    map,
  };
}

/** A Web Locks manager with no other holder: grants at once, records every request's name. */
function granting() {
  const names = [];
  return { names, request: (name, cb) => (names.push(name), Promise.resolve().then(() => cb({ name, mode: 'exclusive' }))) };
}

// ---- schedule validation

test('for every head count 50 to 200 the proposed schedule is valid and ends at 5', () => {
  for (let n = 50; n <= 200; n++) {
    const s = proposeSchedule(n);
    assert.equal(s.at(-1), 5, `n=${n}`);
    assert.deepEqual(scheduleIssues(s, n), [], `n=${n}: ${s.join('>')}`);
  }
});

test('an edit that does not shrink is refused at the step that broke it, naming the step before', () => {
  assert.deepEqual(scheduleIssues([200, 100, 120, 20, 5], 200), [{ index: 2, kind: 'not-less' }]);
  assert.deepEqual(scheduleIssues([200, 100, 100, 20, 5], 200), [{ index: 2, kind: 'not-less' }]);
  // After round 3 at the final size: the final step is the one that no longer shrinks.
  assert.deepEqual(scheduleIssues([200, 100, 50, 5, 5], 200), [{ index: 4, kind: 'not-less' }]);
});

test('a blank, fractional or non-numeric step is refused', () => {
  for (const bad of [Number.NaN, 50.5, Infinity]) {
    assert.deepEqual(scheduleIssues([200, 100, bad, 20, 5], 200), [{ index: 2, kind: 'not-integer' }], String(bad));
  }
});

test('the first and the last step are locked to the head count and the final size', () => {
  assert.deepEqual(scheduleIssues([199, 100, 50, 20, 5], 200), [{ index: 0, kind: 'locked' }]);
  assert.deepEqual(scheduleIssues([200, 100, 50, 20, 6], 200), [{ index: 4, kind: 'locked' }]);
  assert.deepEqual(scheduleIssues([200, 100, 50, 5], 200), [{ index: 4, kind: 'locked' }]);
});

test('a step below the final size is refused even when the run still decreases', () => {
  // Strictly decreasing to 5 already implies every step is above 5; this pins the bound on its own.
  const issues = scheduleIssues([200, 100, 50, 4, 5], 200);
  assert.ok(issues.some((i) => i.index === 3 || i.index === 4), JSON.stringify(issues));
});

// ---- setup validation

test('head counts outside MIN_HEADS..MAX_HEADS cannot start; the edges can', () => {
  assert.equal(MIN_HEADS, 9);
  assert.equal(MAX_HEADS, 200);
  assert.ok(setupIssues(input(MIN_HEADS)).length === 0);
  assert.ok(setupIssues(input(MAX_HEADS)).length === 0);
  assert.deepEqual(setupIssues(input(MIN_HEADS - 1, { schedule: [8, 7, 6, 5, 5] })).map((i) => i.kind), ['head-count']);
  assert.deepEqual(setupIssues(input(MAX_HEADS + 1, { schedule: [201, 100, 50, 20, 5] })).map((i) => i.kind), ['head-count']);
});

test('prizes: 1 to 5', () => {
  assert.deepEqual(setupIssues(input(50, { prizes: [] })).map((i) => i.kind), ['prize-count']);
  assert.deepEqual(setupIssues(input(50, { prizes: ['a', 'b', 'c', 'd', 'e', 'f'] })).map((i) => i.kind), ['prize-count']);
  assert.deepEqual(setupIssues(input(50, { prizes: ['', '', '', '', ''] })), []);
});

test('a refused or duplicate name cannot start', () => {
  const names = people(49);
  assert.deepEqual(setupIssues(input(50, { names: [...names, 'WWWWWWWWWWWWW'] })).map((i) => i.kind), ['name-refused']);
  assert.deepEqual(setupIssues(input(50, { names: [...names, '<b>x</b>'] })).map((i) => i.kind), ['name-refused']);
  assert.deepEqual(setupIssues(input(50, { names: [...names, names[0]] })).map((i) => i.kind), ['name-duplicate']);
});

test('createEvent refuses an input setupIssues refuses', () => {
  assert.throws(() => createEvent(input(50, { schedule: [50, 20, 30, 7, 5] }), seeded(1)), RangeError);
});

// ---- the state machine

test('a full event walks ready -> drawn -> revealed through 4 rounds, then the final, then stops', () => {
  const rng = seeded(7);
  let s = createEvent(input(200), rng);
  const seen = [];
  for (let r = 1; r <= 4; r++) {
    assert.deepEqual(position(s), { kind: 'round', round: r, at: 'ready' });
    const before = liveIds(s);
    s = drawNext(s, rng);
    assert.deepEqual(position(s), { kind: 'round', round: r, at: 'drawn' });
    s = revealDrawn(s);
    assert.deepEqual(position(s), { kind: 'round', round: r, at: 'revealed' });
    const kept = s.rounds[r - 1].survivors;
    assert.equal(kept.length, s.setup.schedule[r]);
    assert.ok(kept.every((id) => before.includes(id)), 'a survivor that was not live');
    // Roster order, never fate-rank order: rank would leak the draw's ordering to whoever reads it.
    assert.deepEqual(kept, before.filter((id) => kept.includes(id)));
    seen.push(kept.length);
    s = advance(s);
  }
  assert.deepEqual(seen, [100, 50, 20, 5]);
  assert.deepEqual(position(s), { kind: 'final', at: 'ready' });
  s = drawNext(s, rng);
  assert.deepEqual(position(s), { kind: 'final', at: 'drawn' });
  s = revealDrawn(s);
  assert.deepEqual(position(s), { kind: 'final', at: 'revealed' });
  assert.throws(() => advance(s), /final/);
  const w = winners(s);
  assert.equal(w.length, 3, 'one winner per prize, 3 prizes set');
  assert.deepEqual(w.map((x) => x.prize), ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน']);
  assert.equal(new Set(w.map((x) => x.person.id)).size, 3);
  assert.ok(w.every((x) => s.rounds[3].survivors.includes(x.person.id)), 'a winner who was not a finalist');
});

test('every transition out of order throws instead of skipping or drawing twice', () => {
  const rng = seeded(3);
  let s = createEvent(input(50), rng);
  assert.throws(() => revealDrawn(s), /drawn/);
  assert.throws(() => advance(s), /revealed/);
  s = drawNext(s, rng);
  assert.throws(() => drawNext(s, rng), /ready/, 'a drawn round was drawn again');
  assert.throws(() => advance(s), /revealed/);
  s = revealDrawn(s);
  assert.throws(() => drawNext(s, rng), /ready/, 'a revealed round was drawn again');
});

test('the round code the event keeps is gh#300 code for that round', () => {
  const rng = seeded(11);
  let s = createEvent(input(50), rng);
  for (let r = 1; r <= 4; r++) {
    s = drawNext(s, rng);
    const parsed = parseCode(s.rounds[r - 1].code, r);
    assert.ok(parsed && parsed.kind === 'cut', `round ${r} code ${s.rounds[r - 1].code} does not parse for its round`);
    s = advance(revealDrawn(s));
  }
});

test('every person gets an opaque, unique id that is not their name', () => {
  const s = createEvent(input(200), seeded(5));
  const ids = s.setup.people.map((p) => p.id);
  assert.equal(new Set(ids).size, 200);
  assert.ok(s.setup.people.every((p) => !p.id.includes(p.name)));
  assert.match(s.eventKey, /^[0-9a-f]{16,}$/);
});

// ---- equal odds: the survivors come from gh#300's host cut draw over the live roster

test('round 1 survival is equal for every name (max |z| <= 4.5 over 2,000 events of 50)', () => {
  const N = 50;
  const EVENTS = 2000;
  const rng = seeded(2026);
  const counts = new Map();
  for (let e = 0; e < EVENTS; e++) {
    let s = createEvent(input(N), rng);
    s = drawNext(s, rng);
    const names = new Map(s.setup.people.map((p) => [p.id, p.name]));
    for (const id of s.rounds[0].survivors) counts.set(names.get(id), (counts.get(names.get(id)) ?? 0) + 1);
  }
  const keep = proposeSchedule(N)[1];
  const p = keep / N;
  const sd = Math.sqrt(EVENTS * p * (1 - p));
  let worst = 0;
  for (const name of people(N)) worst = Math.max(worst, Math.abs(((counts.get(name) ?? 0) - EVENTS * p) / sd));
  assert.ok(worst <= 4.5, `max |z| ${worst.toFixed(2)} over ${N} names`);
});

test('later rounds draw from the live roster only, with the scheduled keep', () => {
  const rng = seeded(99);
  let s = createEvent(input(120), rng);
  for (let r = 1; r <= 4; r++) {
    const live = liveIds(s);
    assert.equal(live.length, s.setup.schedule[r - 1]);
    s = advance(revealDrawn(drawNext(s, rng)));
  }
  assert.equal(liveIds(s).length, 5);
});

// ---- the final permutation

test('uniformPermutation: every item lands in every slot equally (5 x 5 cells, max |z| <= 4.5 over 25,000 shuffles)', () => {
  const rng = seeded(4242);
  const items = ['a', 'b', 'c', 'd', 'e'];
  const T = 25000;
  const cell = new Map();
  for (let t = 0; t < T; t++) {
    const out = uniformPermutation(items, rng.int);
    assert.deepEqual([...out].sort(), items);
    out.forEach((x, slot) => cell.set(`${x}${slot}`, (cell.get(`${x}${slot}`) ?? 0) + 1));
  }
  const p = 1 / 5;
  const sd = Math.sqrt(T * p * (1 - p));
  let worst = 0;
  for (const x of items) for (let slot = 0; slot < 5; slot++) worst = Math.max(worst, Math.abs(((cell.get(`${x}${slot}`) ?? 0) - T * p) / sd));
  assert.ok(worst <= 4.5, `max |z| ${worst.toFixed(2)}`);
});

test('uniformPermutation reaches all 120 orders of 5', () => {
  const rng = seeded(8);
  const seen = new Set();
  for (let t = 0; t < 6000; t++) seen.add(uniformPermutation([1, 2, 3, 4, 5], rng.int).join(''));
  assert.equal(seen.size, 120);
});

test('prize order comes from the permutation, not from the finalists roster order', () => {
  const rng = seeded(21);
  const firsts = new Set();
  for (let e = 0; e < 60; e++) {
    let s = createEvent(input(9, { prizes: ['x'] }), rng);
    for (let r = 1; r <= 4; r++) s = advance(revealDrawn(drawNext(s, rng)));
    const finalists = liveIds(s);
    s = revealDrawn(drawNext(s, rng));
    firsts.add(finalists.indexOf(winners(s)[0].person.id));
  }
  assert.equal(firsts.size, 5, `the first prize only ever went to roster positions ${[...firsts].join(',')}`);
});

// ---- persistence and resume

test('encode -> decode round-trips at every position', () => {
  const rng = seeded(31);
  let s = createEvent(input(60), rng);
  const step = [];
  for (let r = 1; r <= 4; r++) {
    step.push(s);
    s = drawNext(s, rng);
    step.push(s);
    s = revealDrawn(s);
    step.push(s);
    s = advance(s);
  }
  step.push(s, (s = drawNext(s, rng)), revealDrawn(s));
  for (const x of step) assert.deepEqual(decodeEvent(encodeEvent(x)), x);
});

test('a refresh after the draw resumes the same round with the same survivors and never draws again', async () => {
  const store = memoryStorage();
  const rng = seeded(41);
  let s = createEvent(input(80), rng);
  let r;
  const ran = await withEventLock(granting(), store, (tx) => {
    assert.ok(tx.write(s));
    r = drawAndSave(s, rng, (x) => tx.write(x));
  });
  assert.ok(ran);
  assert.ok(r.ok);
  const drawn = r.state.rounds[0];
  // the refresh: everything in memory is gone, only storage is left
  const resumed = loadEvent(store);
  assert.deepEqual(position(resumed), { kind: 'round', round: 1, at: 'drawn' });
  const shown = revealDrawn(resumed);
  assert.deepEqual(shown.rounds[0], drawn);
  // and nothing on the resume path draws
  assert.throws(() => drawNext(resumed, noDraw), /ready/);
});

test('the draw is written before it can be revealed: a failed write leaves the round undrawn and unshown', () => {
  const rng = seeded(51);
  const s = createEvent(input(50), rng);
  const r = drawAndSave(s, rng, () => false);
  assert.equal(r.ok, false);
  assert.equal(r.state, s, 'a draw that was never stored must not become the state on screen');
  assert.deepEqual(position(r.state), { kind: 'round', round: 1, at: 'ready' });
});

test('drawAndSave writes the drawn state, not the revealed one, so a refresh never skips the reveal', () => {
  const rng = seeded(52);
  const s = createEvent(input(50), rng);
  let written = null;
  const r = drawAndSave(s, rng, (x) => ((written = x), true));
  assert.ok(r.ok);
  assert.deepEqual(position(written), { kind: 'round', round: 1, at: 'drawn' });
});

test('withEventLock and loadEvent use the namespaced key and survive a throwing storage', async () => {
  assert.match(STORAGE_KEY, /^watduang:/);
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  const locks = granting();
  let wrote;
  assert.equal(await withEventLock(locks, throwing, (tx) => (wrote = tx.write(createEvent(input(50), seeded(1))))), true);
  assert.equal(wrote, false);
  assert.deepEqual(locks.names, [STORAGE_KEY], 'the lock is not named after the key it guards');
  assert.equal(loadEvent(throwing), null);
});

// ---- the one writer of the stored event: fail closed

const ev = () => createEvent(input(50), seeded(2));

test('withEventLock fails closed without Web Locks: the body never runs and nothing is written', async () => {
  for (const locks of [null, undefined]) {
    const store = memoryStorage();
    let ran = false;
    assert.equal(await withEventLock(locks, store, (tx) => ((ran = true), tx.write(ev()))), false);
    assert.equal(ran, false, `the body ran with locks=${locks}`);
    assert.equal(store.map.size, 0);
  }
});

test('withEventLock fails closed on a refused request, rejected or thrown: the body never runs, nothing is written', async () => {
  const refusals = {
    rejected: { request: () => Promise.reject(new Error('SecurityError')) },
    thrown: { request: () => { throw new Error('SecurityError'); } },
  };
  for (const [how, locks] of Object.entries(refusals)) {
    const store = memoryStorage();
    let ran = false;
    assert.equal(await withEventLock(locks, store, (tx) => ((ran = true), tx.write(ev()))), false, how);
    assert.equal(ran, false, `${how}: the refused body ran anyway`);
    assert.equal(store.map.size, 0, `${how}: a refused request wrote`);
  }
});

test('a tx kept past its callback cannot write: every write lands inside the lock', async () => {
  const store = memoryStorage();
  let kept;
  assert.equal(await withEventLock(granting(), store, (tx) => (kept = tx)), true);
  assert.equal(kept.write(ev()), false);
  assert.equal(store.map.size, 0, 'a write landed after the lock was released');
});

test('a throw inside the body rejects instead of reading as a refusal, and the tx is closed', async () => {
  const store = memoryStorage();
  let kept;
  await assert.rejects(withEventLock(granting(), store, (tx) => { kept = tx; throw new Error('bug'); }), /bug/);
  assert.equal(kept.write(ev()), false);
});

test('a stored blob is re-validated on read: anything malformed or inconsistent reads as no event', () => {
  const rng = seeded(61);
  let s = createEvent(input(50), rng);
  s = revealDrawn(drawNext(s, rng));
  const good = JSON.parse(encodeEvent(s));
  const variants = {
    'not json': '{',
    'wrong version': { ...good, v: 2 },
    'a 13-cluster name': { ...good, setup: { ...good.setup, people: good.setup.people.map((p, i) => (i ? p : { ...p, name: 'WWWWWWWWWWWWW' })) } },
    'a bidi override survives in a name': { ...good, setup: { ...good.setup, people: good.setup.people.map((p, i) => (i ? p : { ...p, name: '\u202Eabc' })) } },
    'a non-string name': { ...good, setup: { ...good.setup, people: good.setup.people.map((p, i) => (i ? p : { ...p, name: { toString: 1 } })) } },
    'a broken schedule': { ...good, setup: { ...good.setup, schedule: [50, 20, 30, 7, 5] } },
    'six prizes': { ...good, setup: { ...good.setup, prizes: ['1', '2', '3', '4', '5', '6'] } },
    'duplicate ids': { ...good, setup: { ...good.setup, people: good.setup.people.map((p, i) => (i === 1 ? { ...p, id: good.setup.people[0].id } : p)) } },
    'a survivor who was never in the roster': { ...good, rounds: [{ ...good.rounds[0], survivors: [...good.rounds[0].survivors.slice(1), 'stranger'] }] },
    'the wrong survivor count': { ...good, rounds: [{ ...good.rounds[0], survivors: good.rounds[0].survivors.slice(1) }] },
    'an unknown position': { ...good, at: 'shown' },
    'a final before round 4': { ...good, final: { order: good.rounds[0].survivors.slice(0, 5) } },
  };
  assert.notEqual(decodeEvent(JSON.stringify(good)), null, 'the control blob must decode, or every variant passes vacuously');
  for (const [label, v] of Object.entries(variants)) {
    assert.equal(decodeEvent(typeof v === 'string' ? v : JSON.stringify(v)), null, label);
  }
  assert.equal(decodeEvent(null), null);
});

test('a stored final that is not a permutation of the finalists reads as no event', () => {
  const rng = seeded(71);
  let s = createEvent(input(50), rng);
  for (let r = 1; r <= 4; r++) s = advance(revealDrawn(drawNext(s, rng)));
  s = drawNext(s, rng);
  const good = JSON.parse(encodeEvent(s));
  assert.notEqual(decodeEvent(JSON.stringify(good)), null);
  const dup = { ...good, final: { order: [good.final.order[0], ...good.final.order.slice(0, 4)] } };
  assert.equal(decodeEvent(JSON.stringify(dup)), null);
});

test('a stored roster with two names that read the same (one nameKey) reads as no event, as setup refuses it', () => {
  const rng = seeded(81);
  const roster = ['Bee K', ...people(49)];
  // The setup side refuses the pair: the rule the stored side must hold to.
  assert.deepEqual(setupIssues(input(50, { names: [...roster, 'beek'].slice(1) })).filter((i) => i.kind === 'name-duplicate'), []);
  assert.deepEqual(setupIssues(input(51, { names: [...roster, 'beek'] })).filter((i) => i.kind === 'name-duplicate').map((i) => i.name), ['beek']);
  const good = JSON.parse(encodeEvent(createEvent(input(50, { names: roster }), rng)));
  const withName = (name) => ({ ...good, setup: { ...good.setup, people: good.setup.people.map((p, i) => (i === 1 ? { ...p, name } : p)) } });
  // Positive control: a second name with a different key decodes, so the refusal below is about the key.
  assert.notEqual(decodeEvent(JSON.stringify(withName('beex'))), null, 'the control blob must decode');
  assert.equal(decodeEvent(JSON.stringify(withName('beek'))), null, '"Bee K" and "beek" share a key, and the stored roster kept both');
  assert.equal(decodeEvent(JSON.stringify(withName('BeeK'))), null, '"Bee K" and "BeeK" share a key, and the stored roster kept both');
});
