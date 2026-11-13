// A refresh mid-event resumes the same step and never draws again (gh#304), driven through the real route
// on the prize fake DOM over the real store. The pure half (drawAndSave stores before it hands the draw
// back) is src/prize-event/event.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvent, drawNext, encodeEvent } from '../../prize-event/event.ts';
import { fakeOrigin, mount, mountNow, seedRaw, seeded, storedEvent, storedRaw } from './stage-harness.mjs';

const noDraw = {
  float: () => assert.fail('drew on the resume path'),
  int: () => assert.fail('drew on the resume path'),
  hex: () => assert.fail('drew on the resume path'),
};
const passed = (s) => s.frame.querySelectorAll('.pd-chip.in').filter((c) => !c.classList.contains('pd-legend-chip')).map((c) => c.textContent);

test('a refresh on a revealed round shows the same survivors and draws nothing', async () => {
  const origin = fakeOrigin();
  const ev = storedEvent(origin, { n: 60 });
  const first = await mount({ origin, rng: seeded(10) });
  first.go().disabled = false;
  first.go().click();
  await origin.idle();
  const before = passed(first);
  assert.equal(before.length, ev.setup.schedule[1], 'round 1 keeps the scheduled count');
  const again = await mount({ origin, env: origin.tab('reload'), rng: noDraw });
  assert.equal(again.frame.getAttribute('data-screen'), 'reveal');
  assert.deepEqual(passed(again), before);
});

test('a refresh between the stored draw and its reveal reveals the stored draw, drawing nothing', async () => {
  const origin = fakeOrigin();
  const ev = storedEvent(origin, { n: 60 });
  const drawn = drawNext(ev, seeded(11));
  seedRaw(origin, encodeEvent(drawn));
  const s = await mount({ origin, rng: noDraw });
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
  s.go().disabled = false;
  s.go().click();
  await origin.idle();
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  const ids = new Set(drawn.rounds[0].survivors);
  const want = drawn.setup.people.filter((p) => ids.has(p.id)).map((p) => p.name);
  assert.deepEqual(passed(s), want);
  assert.equal(decodeEvent(storedRaw(origin)).at, 'revealed');
});

test('a stale button press after the step moved on does nothing (no second draw from one screen)', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 60 });
  const s = await mount({ origin, rng: seeded(12) });
  const old = s.go();
  old.disabled = false;
  old.click();
  await origin.idle();
  const after = storedRaw(origin);
  old.click(); // the detached button of the screen before
  await origin.idle();
  assert.equal(storedRaw(origin), after, 'the old screen\'s button acted on the new step');
});

test('nothing is on screen before the store has answered, and a tap there cannot reach the store', async () => {
  const origin = fakeOrigin({ manual: true });
  storedEvent(origin, { n: 60 });
  const s = mountNow({ origin, rng: noDraw });
  assert.equal(s.go(), null, 'a button was offered before the stored step was known');
  assert.equal(s.frame.getAttribute('data-screen'), null);
  while (origin.step()) await new Promise((r) => setImmediate(r));
  await s.stage.ready;
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
});
