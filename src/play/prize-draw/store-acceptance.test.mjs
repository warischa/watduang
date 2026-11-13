// gh#313's acceptance behaviours, driven through the real setup page and the real projector route over the
// in-memory origin (IndexedDB, BroadcastChannel, localStorage). Each one names what it guards:
//   1. confirm before replace: cancel leaves the saved event byte-identical; confirm replaces it;
//   2. two writers on one event never lose a persisted draw, with no Web Locks at all;
//   3. an aborted transaction never reaches the reveal;
//   4. an event saved in localStorage before gh#313 resumes, now held by IndexedDB;
//   5. a refused browser renders the refused-browser message, on the projector and on the setup page.
// Events here are seeded where a real user's would be: in IndexedDB, or under the old localStorage key.
// This file reaches the code only through the harness, on purpose: the same assertions can then be run
// against an older build through a different harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, decodeEvent, drawNext, encodeEvent, position, revealDrawn } from '../../prize-event/event.ts';
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
  seeded,
  settle,
  storedEvent,
  storedRaw,
} from './stage-harness.mjs';

/** What the old key holds once its event has moved (store.ts SEALED), literal on purpose. */
const SEAL = '{"v":0,"movedTo":"indexeddb"}';
const shownSurvivors = (s) => s.frame.querySelectorAll('.pd-chip.in').filter((c) => !c.classList.contains('pd-legend-chip')).map((c) => c.textContent);
const namesOf = (ev, ids) => {
  const keep = new Set(ids);
  return ev.setup.people.filter((p) => keep.has(p.id)).map((p) => p.name);
};

test('1. confirm before replace: cancel asks, writes nothing and opens nothing; confirm replaces the saved event and then opens the projector', async () => {
  const origin = fakeOrigin();
  const saved = storedEvent(origin, { n: 50 });
  const before = storedRaw(origin);
  const no = mountSetupPage({ origin, confirm: () => false });
  no.submit();
  await origin.idle();
  assert.deepEqual(no.asked, [CONFIRM_REPLACE], 'the start did not ask before replacing a saved event');
  assert.equal(storedRaw(origin), before, 'cancel changed the saved event');
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL, 'cancel wrote an event somewhere else');
  assert.deepEqual(eventWrites(origin), []);
  assert.deepEqual(no.visits, [], 'cancel opened the projector');

  const yes = mountSetupPage({ origin, confirm: () => true });
  yes.submit();
  await origin.idle();
  assert.deepEqual(yes.asked, [CONFIRM_REPLACE]);
  const now = decodeEvent(storedRaw(origin));
  assert.notEqual(now.eventKey, saved.eventKey, 'confirm did not replace the saved event');
  assert.equal(now.setup.eventName, 'Replacement');
  assert.deepEqual(eventWrites(origin).map((w) => [w.by, w.before]), [['setup', before]], 'the replacement was not one write over the text that was asked about');
  assert.deepEqual(yes.visits, ['/game/prize-draw/play/']);
});

test('2. two tabs press the same undrawn round with no Web Locks: one draw is committed, the other tab writes nothing and shows that draw', async () => {
  const origin = fakeOrigin({ manual: true });
  const ev = makeEvent({ n: 50 });
  origin.localStorage.set(STORAGE_KEY, encodeEvent(ev));
  const A = mountNow({ origin, env: origin.tab('A'), rng: seeded(101) });
  const B = mountNow({ origin, env: origin.tab('B'), rng: seeded(202) });
  await settle(origin);
  // The copy out of the old key is one write already; count only what the presses commit.
  const moved = eventWrites(origin).length;
  assert.ok(press(A), 'tab A offered no press');
  assert.ok(press(B), 'tab B offered no press');
  await settle(origin);
  A.deliver();
  B.deliver();
  await settle(origin);
  const writes = eventWrites(origin).slice(moved);
  assert.equal(writes.length, 1, `${writes.length} draws were committed to the store`);
  const stored = decodeEvent(storedRaw(origin));
  assert.deepEqual(position(stored), { kind: 'round', round: 1, at: 'revealed' });
  for (const tab of [A, B]) {
    assert.equal(tab.frame.getAttribute('data-screen'), 'reveal');
    assert.deepEqual(tab.stage.current().rounds, stored.rounds, 'a tab holds a draw that is not the stored one');
    assert.deepEqual(shownSurvivors(tab), namesOf(stored, stored.rounds[0].survivors), 'a tab shows another draw than the stored one');
  }
});

test('3. an aborted transaction never reaches the reveal: the notice opens, the round stays undrawn, and the next press reveals what it committed', async () => {
  const origin = fakeOrigin();
  const ev = makeEvent({ n: 50 });
  origin.localStorage.set(STORAGE_KEY, encodeEvent(ev));
  const s = await mount({ origin, rng: seeded(3) });
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
  origin.faults.abortCommits = 1;
  press(s);
  await origin.idle();
  assert.equal(s.frame.getAttribute('data-screen'), 'round', 'an aborted transaction reached the reveal');
  assert.equal(s.notice.hidden, false, 'the notice did not open on an aborted transaction');
  assert.equal(origin.faults.abortCommits, 0, 'no transaction was aborted: this test measured nothing');
  assert.deepEqual(position(s.stage.current()), { kind: 'round', round: 1, at: 'ready' });
  s.notice.querySelector('button').disabled = false;
  s.notice.querySelector('button').click();
  press(s);
  await origin.idle();
  const stored = decodeEvent(storedRaw(origin));
  assert.deepEqual(position(stored), { kind: 'round', round: 1, at: 'revealed' });
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  assert.deepEqual(shownSurvivors(s), namesOf(stored, stored.rounds[0].survivors));
});

test('3b. an aborted next-round transaction leaves the screen on the reveal it is at: the notice opens, and a reload never moves backward', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50 });
  const s = await mount({ origin, rng: seeded(4) });
  press(s); // reveal round 1
  await origin.idle();
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  const revealed = storedRaw(origin);
  origin.faults.abortCommits = 1;
  press(s); // next
  await origin.idle();
  assert.equal(origin.faults.abortCommits, 0, 'no transaction was aborted: this test measured nothing');
  assert.equal(storedRaw(origin), revealed);
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal', 'the screen moved on although the step forward was never stored');
  assert.deepEqual(position(s.stage.current()), position(decodeEvent(revealed)), 'the screen holds a step the store does not');
  assert.equal(s.notice.hidden, false, 'the notice did not open on an aborted step forward');
  const reload = await mount({ origin, env: origin.tab('reload') });
  assert.deepEqual(position(reload.stage.current()), position(s.stage.current()), 'a reload lands on another step than the screen showed');
  s.notice.querySelector('button').disabled = false;
  s.notice.querySelector('button').click();
  press(s);
  await origin.idle();
  assert.deepEqual(position(decodeEvent(storedRaw(origin))), { kind: 'round', round: 2, at: 'ready' }, 'the next press did not store the step forward');
  assert.equal(s.frame.getAttribute('data-screen'), 'round');
});

test('4. an event saved in localStorage before gh#313 resumes on its step, moves into IndexedDB, and walks on there', async () => {
  const origin = fakeOrigin();
  const ev = makeEvent({ n: 60 });
  const revealed = revealDrawn(drawNext(ev, seeded(11)));
  const legacy = encodeEvent(revealed);
  origin.localStorage.set(STORAGE_KEY, legacy);
  const s = await mount({ origin, rng: seeded(12) });
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal', 'the saved event did not resume');
  assert.deepEqual(shownSurvivors(s), namesOf(revealed, revealed.rounds[0].survivors));
  assert.equal(storedRaw(origin), legacy, 'the saved event did not move into IndexedDB');
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL, 'the old key was not sealed after the move');
  press(s); // next
  await origin.idle();
  assert.deepEqual(position(decodeEvent(storedRaw(origin))), { kind: 'round', round: 2, at: 'ready' }, 'the walk did not go on in IndexedDB');
});

test('4b. a reload in the middle of the move resumes the saved event: an aborted copy keeps the old key, the next load moves it', async () => {
  const origin = fakeOrigin();
  const legacy = encodeEvent(revealDrawn(drawNext(makeEvent({ n: 60 }), seeded(13))));
  origin.localStorage.set(STORAGE_KEY, legacy);
  origin.faults.abortCommits = 1;
  await mount({ origin });
  assert.equal(origin.localStorage.get(STORAGE_KEY), legacy, 'the old key went although the copy aborted');
  const again = await mount({ origin });
  assert.equal(again.frame.getAttribute('data-screen'), 'reveal', 'the reload did not resume the saved event');
  assert.equal(storedRaw(origin), legacy, 'the reload did not move the saved event into IndexedDB');
  assert.equal(origin.localStorage.get(STORAGE_KEY), SEAL);
  assert.equal(eventWrites(origin).length, 1, 'the event was copied more than once');
});

test('5. a refused browser renders the refused-browser message on the projector and on the setup page, and stores nothing', async () => {
  const refusals = {
    'no IndexedDB': () => ({}),
    'an open that errors': (origin) => ((origin.faults.open = 'error'), origin.tab('X')),
    'an open that throws': (origin) => ((origin.faults.open = 'throw'), origin.tab('X')),
  };
  for (const [label, env] of Object.entries(refusals)) {
    const origin = fakeOrigin();
    origin.localStorage.set(STORAGE_KEY, encodeEvent(makeEvent({ n: 50 })));
    const s = await mount({ origin, env: env(origin) });
    assert.equal(s.frame.getAttribute('data-screen'), 'refused', `${label}: the projector did not refuse`);
    assert.equal(s.frame.textContent, REFUSED_BROWSER, `${label}: the projector does not show the refused-browser message`);
    assert.equal(s.live.textContent, REFUSED_BROWSER, `${label}: the refusal was not announced`);
    assert.equal(s.go(), null, `${label}: a refused projector offers a press`);
    const page = mountSetupPage({ origin, env: env(origin) });
    await origin.idle();
    assert.equal(page.message(), REFUSED_BROWSER, `${label}: the setup page does not say why before a start`);
    page.submit();
    await origin.idle();
    assert.equal(page.message(), REFUSED_BROWSER, `${label}: the setup page does not say why on start`);
    assert.deepEqual(page.visits, [], `${label}: a refused setup opened the projector`);
    assert.deepEqual(eventWrites(origin), [], `${label}: a refused browser stored an event`);
  }
});

test('6. a move out of the old key that aborts refuses the store: a setup start replaces nothing, the saved reveal stays, and the next load moves it intact and asks before replacing it', async () => {
  const origin = fakeOrigin();
  const legacy = encodeEvent(revealDrawn(drawNext(makeEvent({ n: 50 }), seeded(14))));
  origin.localStorage.set(STORAGE_KEY, legacy);
  origin.faults.abortCommits = 1;
  const page = mountSetupPage({ origin, confirm: () => true });
  await origin.idle();
  assert.equal(origin.faults.abortCommits, 0, 'the move was not aborted: this test measured nothing');
  page.submit();
  await origin.idle();
  assert.deepEqual(eventWrites(origin), [], 'a setup start stored over a saved event it could not see');
  assert.deepEqual(page.visits, [], 'the setup page opened the projector');
  assert.equal(origin.localStorage.get(STORAGE_KEY), legacy, 'the saved reveal left the old key without being moved');
  const s = await mount({ origin, env: origin.tab('reload') });
  assert.equal(storedRaw(origin), legacy, 'the next load did not move the saved reveal intact');
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  const again = mountSetupPage({ origin, env: origin.tab('setup2'), confirm: () => false });
  again.submit();
  await origin.idle();
  assert.deepEqual(again.asked, [CONFIRM_REPLACE], 'the moved event was replaced without asking');
  assert.equal(storedRaw(origin), legacy);
});

// Owner-approved notice copy (gh#313), literal on purpose: it pins the wording, one per failed step.
const REVEAL_FAILED = 'บันทึกผลไม่ได้ จึงยังไม่เปิดผล ลองกด เปิดผล อีกครั้ง';
const NEXT_FAILED = 'บันทึกไม่ได้ จึงยังไม่ไปรอบต่อไป ลองกด รอบต่อไป อีกครั้ง';

test('3c. the notice names the step that failed: a failed reveal says the reveal one, a failed next round says the next-round one', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50 });
  const s = await mount({ origin, rng: seeded(5) });
  const close = () => {
    const b = s.notice.querySelector('button');
    b.disabled = false;
    b.click();
  };
  origin.faults.abortCommits = 1;
  press(s); // reveal fails
  await origin.idle();
  assert.equal(s.notice.hidden, false);
  assert.equal(s.notice.querySelector('p').textContent, REVEAL_FAILED, 'a failed reveal does not show the reveal notice');
  close();
  press(s); // reveal stores
  await origin.idle();
  assert.equal(s.frame.getAttribute('data-screen'), 'reveal');
  origin.faults.abortCommits = 1;
  press(s); // next fails
  await origin.idle();
  assert.equal(s.notice.hidden, false);
  assert.equal(s.notice.querySelector('p').textContent, NEXT_FAILED, 'a failed next round does not show the next-round notice');
  close();
  origin.faults.abortCommits = 1;
  press(s); // next fails again, then the reveal of round 2 fails: the text follows the step each time
  await origin.idle();
  assert.equal(s.notice.querySelector('p').textContent, NEXT_FAILED);
  close();
  press(s); // next stores
  await origin.idle();
  origin.faults.abortCommits = 1;
  press(s); // round 2 reveal fails
  await origin.idle();
  assert.equal(s.notice.querySelector('p').textContent, REVEAL_FAILED, 'the notice kept the next-round text on a failed reveal');
});

test('7. a newer version opening the database reloads the projector once, offers no press after the close, and writes nothing', async () => {
  const origin = fakeOrigin();
  storedEvent(origin, { n: 50 });
  const reloads = [];
  const s = mountNow({ origin, rng: seeded(6), reload: () => reloads.push('reload') });
  await origin.idle();
  const button = s.go();
  assert.ok(button, 'precondition: the projector offers its press');
  const req = origin.openNewer(DB.name, DB.version + 1);
  let blocked = false;
  req.onblocked = () => (blocked = true);
  await origin.idle();
  assert.equal(blocked, false, 'the projector kept the database open against the newer version');
  assert.deepEqual(reloads, ['reload'], 'the projector did not ask to reload exactly once');
  assert.equal(s.go(), null, 'a press is still offered after the store closed');
  button.disabled = false;
  button.click(); // the button that was on screen when the store closed
  await origin.idle();
  assert.equal(s.notice.hidden, true, 'a press after the close reached the store and failed');
  assert.equal(s.stage.version().busy, false, 'a press after the close was sent to the store');
  assert.deepEqual(eventWrites(origin), []);
  // The reloaded page is still the older code: it cannot open the newer database, so it says why and never
  // asks to reload again.
  const again = mountNow({ origin, env: origin.tab('reloaded'), reload: () => reloads.push('reload') });
  await origin.idle();
  assert.equal(again.frame.getAttribute('data-screen'), 'refused');
  assert.equal(again.frame.textContent, REFUSED_BROWSER);
  assert.deepEqual(reloads, ['reload'], 'the reloaded page asked to reload again');
});
