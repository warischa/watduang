// The deploy that moved the event from localStorage into IndexedDB (gh#313), with tabs still running the
// code that shipped before it (legacy-head.mjs: its projector and its setup page). Those tabs take the
// exclusive Web Lock named after the old key for every write, so the new store takes the same lock, moves the
// old key's event across and seals the key with a text the old code reads as no event, and checks the seal
// before every later load and write. Also here: a newer version of the page taking the database over at any
// point of the projector's life (the move, the first load, a follow, a committed press).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, decodeEvent, drawNext, encodeEvent, revealDrawn } from '../../prize-event/event.ts';
import { legacyProjector, legacySetupStart } from '../../prize-event/legacy-head.mjs';
import {
  CONFIRM_REPLACE,
  DB,
  REFUSED_BROWSER,
  eventWrites,
  fakeOrigin,
  makeEvent,
  mount,
  mountNow,
  mountSetupPage,
  press,
  seedRaw,
  seeded,
  settle,
  storedRaw,
} from './stage-harness.mjs';

const SEAL = '{"v":0,"movedTo":"indexeddb"}';
// Owner-approved (gh#313), literal on purpose: pins the wording.
const OLD_TAB = 'มีงานที่เปิดค้างในแท็บเก่า ปิดแท็บอื่นทั้งหมด แล้วเริ่มงานใหม่จากหน้าตั้งค่า';

const roundOneCodes = (eventKey, texts) => {
  const codes = new Set();
  for (const t of texts) {
    const e = decodeEvent(t ?? null);
    if (e?.eventKey === eventKey && e.rounds[0]) codes.add(e.rounds[0].code);
  }
  return codes;
};

test('cutover: an old-code projector pressing while the new store reads the old key never gets a round drawn twice', async () => {
  const origin = fakeOrigin({ locks: true });
  const ev = makeEvent({ n: 50 });
  origin.localStorage.set(STORAGE_KEY, encodeEvent(ev));
  const old = legacyProjector(origin, origin.tab('old'), seeded(101));
  assert.ok(old.hasButton(), 'precondition: the old projector shows round 1 with its button');
  const env = origin.tab('new');
  const get = env.localStorage.getItem;
  let pressed = false;
  env.localStorage.getItem = (k) => {
    const v = get(k);
    if (!pressed) {
      pressed = true;
      old.press();
    }
    return v;
  };
  const s = mountNow({ origin, env, rng: seeded(202) });
  await origin.idle();
  assert.ok(pressed, 'the old projector never pressed during the read: this test measured nothing');
  if (press(s)) await origin.idle();
  const codes = roundOneCodes(ev.eventKey, [...old.writes, ...eventWrites(origin).map((w) => w.after)]);
  assert.equal(codes.size, 1, `one event, round 1 drawn with ${codes.size} codes: ${[...codes].join(', ')}`);
  assert.equal(old.hasButton(), false, 'the old projector still offers a press over the moved event');
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL);
});

test('cutover: a draw the old projector committed before the move is moved as it is, never drawn again', async () => {
  const origin = fakeOrigin({ locks: true });
  const ev = makeEvent({ n: 50 });
  origin.localStorage.set(STORAGE_KEY, encodeEvent(ev));
  const old = legacyProjector(origin, origin.tab('old'), seeded(101));
  await old.press();
  await origin.idle();
  const revealed = origin.localStorage.get(STORAGE_KEY);
  assert.equal(decodeEvent(revealed).at, 'revealed');
  const s = await mount({ origin, env: origin.tab('new'), rng: seeded(202) });
  assert.equal(storedRaw(origin), revealed);
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL);
});

test('cutover: an old-code setup page writing over the seal makes the new store refuse with the old-tab message; nothing is drawn; the MC resolves it from the setup page', async () => {
  const origin = fakeOrigin({ locks: true });
  origin.localStorage.set(STORAGE_KEY, encodeEvent(makeEvent({ n: 50 })));
  const s = await mount({ origin, env: origin.tab('new'), rng: seeded(3) });
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL, 'precondition: the move sealed the old key');
  const theirs = makeEvent({ n: 50, rng: seeded(9) });
  assert.equal(await legacySetupStart(origin, origin.tab('old-setup'), theirs), true);
  const ours = storedRaw(origin);
  const writes = eventWrites(origin).length;
  press(s);
  await origin.idle();
  assert.equal(eventWrites(origin).length, writes, 'a round was drawn after an old setup page took the key over');
  assert.equal(s.frame.getAttribute('data-screen'), 'revoked');
  assert.equal(s.frame.textContent, OLD_TAB, 'the projector does not say why it stopped');
  assert.equal(s.go(), null, 'a refused projector still offers a press');
  assert.equal(origin.localStorage.get(STORAGE_KEY), encodeEvent(theirs), 'the old setup page event was not kept');
  assert.equal(storedRaw(origin), ours, 'the stored event was not kept');
  const reloaded = await mount({ origin, env: origin.tab('reload') });
  assert.equal(reloaded.frame.getAttribute('data-screen'), 'revoked', 'a reload over the conflict did not refuse');
  assert.equal(reloaded.frame.textContent, OLD_TAB);
  // The setup page says so, and a start asks first: cancel changes nothing, confirm replaces and re-seals.
  const no = mountSetupPage({ origin, env: origin.tab('setup-a'), confirm: () => false });
  await origin.idle();
  assert.equal(no.message(), OLD_TAB, 'the setup page does not say why before a start');
  no.submit();
  await origin.idle();
  assert.deepEqual(no.asked, [CONFIRM_REPLACE]);
  assert.equal(storedRaw(origin), ours);
  assert.equal(origin.localStorage.get(STORAGE_KEY), encodeEvent(theirs));
  const yes = mountSetupPage({ origin, env: origin.tab('setup-b'), confirm: () => true });
  await origin.idle();
  yes.submit();
  await origin.idle();
  assert.deepEqual(yes.asked, [CONFIRM_REPLACE]);
  assert.equal(decodeEvent(storedRaw(origin)).setup.eventName, 'Replacement', 'confirm did not replace the stored event');
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL, 'confirm did not seal the old key again');
  assert.deepEqual(yes.visits, ['/game/prize-draw/play/']);
  const fresh = await mount({ origin, env: origin.tab('after') });
  assert.equal(fresh.frame.getAttribute('data-screen'), 'round');
});

test('cutover: a seal that cannot be written refuses that open and keeps the old key; the next open moves and seals it', async () => {
  const origin = fakeOrigin({ locks: true });
  const legacy = encodeEvent(revealDrawn(drawNext(makeEvent({ n: 50 }), seeded(4))));
  origin.localStorage.set(STORAGE_KEY, legacy);
  origin.faults.setItemThrows = true;
  const s = await mount({ origin });
  assert.equal(s.frame.getAttribute('data-screen'), 'refused', 'a store opened without its seal');
  assert.equal(s.frame.textContent, REFUSED_BROWSER);
  assert.equal(origin.localStorage.get(STORAGE_KEY), legacy, 'the old key changed although the seal failed');
  origin.faults.setItemThrows = false;
  const again = await mount({ origin, env: origin.tab('reload') });
  assert.equal(again.frame.getAttribute('data-screen'), 'reveal', 'the next open did not resume the saved event');
  assert.equal(storedRaw(origin), legacy);
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL);
});

test('cutover: records that differ are refused, even for the same event; both are kept', async () => {
  const origin = fakeOrigin({ locks: true });
  const ev = makeEvent({ n: 50 });
  const newerOld = encodeEvent(revealDrawn(drawNext(ev, seeded(5))));
  seedRaw(origin, encodeEvent(ev));
  origin.localStorage.set(STORAGE_KEY, newerOld);
  const s = await mount({ origin });
  assert.equal(s.frame.getAttribute('data-screen'), 'revoked', 'a store opened over two different records');
  assert.equal(s.frame.textContent, OLD_TAB);
  assert.equal(s.go(), null);
  assert.equal(storedRaw(origin), encodeEvent(ev));
  assert.equal(origin.localStorage.get(STORAGE_KEY), newerOld, 'the newer progress under the old key was not kept');
  assert.deepEqual(eventWrites(origin), []);
});

test('cutover: a lock request that fails refuses the open; nothing is moved or sealed', async () => {
  for (const how of ['reject', 'throw']) {
    const origin = fakeOrigin({ locks: true });
    const legacy = encodeEvent(makeEvent({ n: 50 }));
    origin.localStorage.set(STORAGE_KEY, legacy);
    origin.faults.lockRequest = how;
    const s = await mount({ origin });
    assert.equal(s.frame.getAttribute('data-screen'), 'refused', how);
    assert.equal(origin.localStorage.get(STORAGE_KEY), legacy, how);
    assert.deepEqual(eventWrites(origin), [], how);
  }
});

// ---- a newer version taking the database over, at each point of the projector's life

async function supersede(point, withReload) {
  const origin = fakeOrigin({ manual: true, locks: true });
  const ev = makeEvent({ n: 50 });
  if (point === 'migration') origin.localStorage.set(STORAGE_KEY, encodeEvent(ev));
  else {
    seedRaw(origin, encodeEvent(ev));
    origin.localStorage.set(STORAGE_KEY, SEAL);
  }
  const reloads = [];
  const env = origin.tab('A');
  let mark = null;
  const after = [];
  let newer = null;
  const takeOver = () => {
    newer = origin.openNewer(DB.name, DB.version + 1);
    newer.seen = [];
    newer.onblocked = () => newer.seen.push('blocked');
    newer.onupgradeneeded = () => {
      newer.seen.push('upgrade');
      mark = true;
    };
    newer.onsuccess = () => newer.seen.push('success');
  };
  origin.hooks.transaction = (by, mode) => {
    if (by !== 'A') return;
    if (mark) after.push(mode);
    if (!newer && point === 'initial load' && mode === 'readonly') takeOver();
    if (!newer && point === 'follow' && mode === 'readonly' && armed) takeOver();
    if (!newer && point === 'committed press' && mode === 'readwrite') takeOver();
  };
  let armed = false;
  if (point === 'migration') {
    const get = env.localStorage.getItem;
    env.localStorage.getItem = (k) => {
      if (!newer) takeOver();
      return get(k);
    };
  }
  const A = mountNow({ origin, env, rng: seeded(7), reload: withReload ? () => reloads.push('reload') : undefined });
  const B = point === 'follow' ? mountNow({ origin, env: origin.tab('B'), rng: seeded(8) }) : null;
  await settle(origin);
  const button = A.go();
  if (point === 'follow') {
    press(B);
    await settle(origin);
    armed = true;
    A.deliver();
    await settle(origin);
  }
  if (point === 'committed press') {
    press(A);
    await settle(origin);
  }
  await settle(origin);
  assert.ok(newer, `${point}: the newer version never opened: this test measured nothing`);
  assert.deepEqual(newer.seen, ['upgrade', 'success'], `${point}: the newer version was blocked`);
  if (button) {
    button.disabled = false;
    button.click();
    await settle(origin);
  }
  return { A, reloads, after, origin };
}

for (const point of ['migration', 'initial load', 'follow', 'committed press']) {
  for (const withReload of [true, false]) {
    test(`supersession during ${point}, ${withReload ? 'reload callback' : 'refusal fallback'}: ${withReload ? 'one reload' : 'the refused message'}, no press offered, nothing attempted after the close`, async () => {
      const { A, reloads, after } = await supersede(point, withReload);
      if (withReload) assert.deepEqual(reloads, ['reload'], `${point}: the page did not ask to reload exactly once`);
      else {
        assert.equal(A.frame.getAttribute('data-screen'), 'refused', `${point}: the page did not refuse`);
        assert.equal(A.frame.textContent, REFUSED_BROWSER);
      }
      assert.equal(A.go(), null, `${point}: a press is offered after the store closed`);
      assert.equal(A.stage.current(), null, `${point}: the page still holds an event after the store closed`);
      assert.deepEqual(after, [], `${point}: a transaction was attempted after the close`);
    });
  }
}
