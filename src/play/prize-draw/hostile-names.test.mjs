// Names are attacker-owned once QR join lands (gh#308), and the projector is where they arrive. ADR-0026:
// guard at the sink. This file feeds hostile names to the projector's two name-bearing screens, the field
// (rounds, reveals, the final) and the result, along both channels a name can take:
//   - STORAGE, the real channel: a stored event is re-validated on read, so a hostile blob shows no event
//     at all, while a valid control blob does show its names (positive control);
//   - the RENDERER directly, bypassing validation: even a name the validator would refuse is written as
//     text, never parsed. This is the defence that survives a validator bug.
// What "hostile" means here: markup within the cap, an anchor, a 13-cluster name, a bidi override
// (src/prize-event/fake-dom.mjs HOSTILE). A fake DOM cannot see bidi reordering itself, so for bidi this
// asserts what can go red: the stored channel refuses it, and the sink isolates any name with dir="auto".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from '../../prize-event/fake-dom.mjs';
import { STORAGE_KEY } from '../../prize-event/event.ts';
import { announce, renderScreen } from '../_prize-reveal/reveal.ts';
import { memoryStorage, mount, names, seeded, storedEvent } from './stage-harness.mjs';

const hostile = Object.values(HOSTILE);

function assertInert(doc, root, label) {
  assert.deepEqual(doc.htmlWrites, [], `${label}: a markup sink was used`);
  const active = root.all().filter((el) => ACTIVE_TAGS.includes(el.tagName));
  assert.deepEqual(active.map((el) => el.tagName), [], `${label}: a name became an element`);
}

test('positive control: a valid stored event shows every name on the field, as text', () => {
  const storage = memoryStorage();
  storedEvent(storage, { n: 50 });
  const s = mount({ storage, rng: seeded(4) });
  const chips = s.frame.querySelectorAll('.pd-chip');
  assert.deepEqual(chips.map((c) => c.textContent), names(50));
  assertInert(s.doc, s.root, 'control');
});

test('storage channel: each hostile name in an otherwise valid stored event leaves the screen with no event', () => {
  for (const bad of hostile) {
    const storage = memoryStorage();
    const ev = storedEvent(storage, { n: 50 });
    ev.setup.people[7].name = bad;
    storage.map.set(STORAGE_KEY, JSON.stringify(ev));
    const s = mount({ storage, rng: seeded(5) });
    assert.equal(s.frame.getAttribute('data-screen'), 'cold', `${JSON.stringify(bad)} reached the screen`);
    assert.ok(!s.root.textContent.includes(bad), `${JSON.stringify(bad)} is on screen`);
    assertInert(s.doc, s.root, JSON.stringify(bad));
  }
});

const view = (chipNames) => ({
  kind: 'round',
  eventName: HOSTILE.markup,
  round: 1,
  rounds: 4,
  dots: ['on', 'todo', 'todo', 'todo', 'todo'],
  chips: chipNames.map((name, i) => ({ id: String(i), name, mark: 'live' })),
  from: chipNames.length,
  to: 1,
  game: null,
});

test('renderer, field: hostile names render as their own text, isolated, never as elements', () => {
  const doc = makeDoc();
  const frame = doc.createElement('div');
  doc.body.append(frame);
  renderScreen(frame, view(hostile), doc);
  const runs = frame.querySelectorAll('.nm');
  assert.deepEqual(runs.map((r) => r.textContent), hostile);
  assert.ok(runs.every((r) => r.getAttribute('dir') === 'auto'), 'a name run is not direction-isolated');
  assertInert(doc, frame, 'field');
});

test('renderer, reveal: the same names marked in and out stay text', () => {
  const doc = makeDoc();
  const frame = doc.createElement('div');
  doc.body.append(frame);
  const v = { ...view(hostile), kind: 'reveal', passed: 2 };
  v.chips = v.chips.map((c, i) => ({ ...c, mark: i % 2 ? 'in' : 'out' }));
  renderScreen(frame, v, doc);
  assert.deepEqual(frame.querySelectorAll('.nm').map((r) => r.textContent), hostile);
  assertInert(doc, frame, 'reveal');
});

test('renderer, result: hostile winner names and hostile prize names stay text', () => {
  const doc = makeDoc();
  const frame = doc.createElement('div');
  doc.body.append(frame);
  const winners = hostile.map((name, i) => ({ place: i + 1, prize: HOSTILE.anchor, name }));
  renderScreen(frame, { kind: 'result', eventName: HOSTILE.anchor, winners }, doc);
  assert.deepEqual(frame.querySelectorAll('.nm').map((r) => r.textContent), hostile);
  assert.ok(frame.textContent.includes(HOSTILE.anchor), 'the prize name is not shown as text');
  assertInert(doc, frame, 'result');
});

test('renderer, announcement: hostile winner names reach the live region as text, each its own isolated run', () => {
  const doc = makeDoc();
  const live = doc.createElement('p');
  doc.body.append(live);
  const winners = hostile.map((name, i) => ({ place: i + 1, prize: HOSTILE.anchor, name }));
  announce(live, { kind: 'result', eventName: HOSTILE.anchor, winners }, doc);
  const runs = live.all().filter((el) => el.getAttribute('dir') === 'auto');
  assert.deepEqual(runs.map((r) => r.textContent), hostile, 'a winner name in the live region is not its own direction-isolated run');
  for (const bad of hostile) assert.ok(live.textContent.includes(bad), `${JSON.stringify(bad)} is not announced as text`);
  assertInert(doc, live, 'announcement');
});
