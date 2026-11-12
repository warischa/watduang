// A refresh mid-event resumes the same step and never draws again (gh#304), driven through the real route
// on the prize fake DOM. The pure half (drawAndSave writes before it reveals) is src/prize-event/event.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, decodeEvent, drawNext } from '../../prize-event/event.ts';
import { memoryStorage, mount, seeded, storedEvent } from './stage-harness.mjs';

const noDraw = {
  float: () => assert.fail('drew on the resume path'),
  int: () => assert.fail('drew on the resume path'),
  hex: () => assert.fail('drew on the resume path'),
};
const passed = (s) => s.frame.querySelectorAll('.pd-chip.in').filter((c) => !c.classList.contains('pd-legend-chip')).map((c) => c.textContent);

test('a refresh on a revealed round shows the same survivors and draws nothing', () => {
  const storage = memoryStorage();
  const ev = storedEvent(storage, { n: 60 });
  const first = mount({ storage, rng: seeded(10) });
  first.go().disabled = false;
  first.go().click();
  const before = passed(first);
  assert.equal(before.length, ev.setup.schedule[1], 'round 1 keeps the scheduled count');
  const again = mount({ storage, rng: noDraw });
  assert.equal(again.frame.getAttribute('data-screen'), 'reveal');
  assert.deepEqual(passed(again), before);
});

test('a refresh between the stored draw and its reveal reveals the stored draw, drawing nothing', () => {
  const storage = memoryStorage();
  const ev = storedEvent(storage, { n: 60 });
  const drawn = drawNext(ev, seeded(11));
  storage.map.set(STORAGE_KEY, JSON.stringify(drawn));
  const s = mount({ storage, rng: noDraw });
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
  s.go().disabled = false;
  s.go().click();
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  const ids = new Set(drawn.rounds[0].survivors);
  const want = drawn.setup.people.filter((p) => ids.has(p.id)).map((p) => p.name);
  assert.deepEqual(passed(s), want);
  assert.equal(decodeEvent(storage.map.get(STORAGE_KEY)).at, 'revealed');
});

test('a stale button press after the step moved on does nothing (no second draw from one screen)', () => {
  const storage = memoryStorage();
  storedEvent(storage, { n: 60 });
  const s = mount({ storage, rng: seeded(12) });
  const old = s.go();
  old.disabled = false;
  old.click();
  const after = storage.map.get(STORAGE_KEY);
  old.click(); // the detached button of the screen before
  assert.equal(storage.map.get(STORAGE_KEY), after, 'the old screen\'s button acted on the new step');
});
