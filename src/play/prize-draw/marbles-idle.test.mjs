// node --test — the marbles round before its draw (gh#316, owner pick PD-316-02 a: mb-idle A HEAT LANES).
// The projector shows the round's first heat at the gate BEFORE the MC's press commits the draw, so the
// plates cannot come from the round code or the survivors: a heat is the next HEAT_SIZE names in roster
// order (prize-marbles plan.ts heatsOf), the same cut the reveal runs. The expected names are derived from
// that plan helper here, never read off the module under test. Names reach the frame as text (ADR-0026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from '../../prize-event/fake-dom.mjs';
import { createEvent } from '../../prize-event/event.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { HEAT_SIZE, START_X, MARBLE_R, heatsOf } from '../prize-marbles/renderer/plan.ts';
import { seeded } from './stage-harness.mjs';
import { idleMarbles, renderMarblesIdle } from './marbles-idle.ts';

const ALL_MARBLES = { rounds: ['marbles', 'marbles', 'marbles', 'marbles'], final: null };
const HINT = 'พิธีกรกดเริ่ม แล้วลูกแก้วจะวิ่งเข้าเส้นชัย';

function event200() {
  const names = Array.from({ length: 200 }, (_, i) => `P${i + 1}`);
  return createEvent(
    { eventName: 'Party', names, schedule: proposeSchedule(200), prizes: ['TV'], games: ALL_MARBLES },
    seeded(7),
  );
}

/** The names the reveal's own heat cut puts in heat 1, in roster order — the oracle, not the module. */
function heat1Names(live) {
  const byId = new Map(live.map((p) => [p.id, p]));
  return heatsOf(live.map((p) => p.id))[0].map((id) => byId.get(id).name);
}

function viewFor(ev, round, names, count) {
  return { eventName: ev.setup.eventName, round, rounds: 4, dots: ['on', 'todo', 'todo', 'todo', 'todo'], names, count };
}

const plateNames = (frame) => frame.querySelectorAll('.pd-mplate').map((p) => p.querySelector('.nm').textContent);

function assertInert(doc, root, label) {
  assert.deepEqual(doc.htmlWrites, [], `${label}: a markup sink was used`);
  const active = root.all().filter((el) => ACTIVE_TAGS.includes(el.tagName));
  assert.deepEqual(active.map((el) => el.tagName), [], `${label}: a name became an element`);
}

test('at 200 heads the idle draws 20 plates at the gate, heat 1 in roster order, with the board hint verbatim', () => {
  const ev = event200();
  const live = ev.setup.people;
  const expected = heat1Names(live);
  assert.equal(expected.length, HEAT_SIZE, 'the oracle did not cut a full first heat');
  const plates = idleMarbles(ev.eventKey, 1, live);
  assert.deepEqual(plates.map((p) => p.name), expected, 'idleMarbles is not the reveal heat cut');

  const doc = makeDoc();
  const frame = doc.createElement('div');
  renderMarblesIdle(frame, viewFor(ev, 1, plates.map((p) => p.name), live.length), doc);

  assert.equal(frame.getAttribute('data-screen'), 'marbles');
  assert.deepEqual(plateNames(frame), expected, 'the plates are not heat 1 in roster order');
  assert.equal(frame.querySelectorAll('.pd-mplate').length, HEAT_SIZE, 'not 20 plates');
  // The marbles wait at the gate, one per plate, at the board's start x.
  const marbles = frame.querySelectorAll('.pd-mmarble');
  assert.equal(marbles.length, HEAT_SIZE, 'not 20 marbles at the gate');
  assert.ok(marbles.every((m) => m.style.getPropertyValue('inset-inline-start') === `${START_X - MARBLE_R}px`), 'a marble is not at the gate');
  // The band counts the whole round field, as the board draws it (196 joined), not the heat's 20.
  assert.equal(frame.querySelector('.pd-flow').querySelector('span').textContent, String(live.length));
  assert.equal(frame.querySelector('.pd-rt').textContent, HINT, 'the hint line is not the board string verbatim');
  assert.deepEqual(frame.querySelectorAll('.pd-lk').map((e) => e.textContent), ['เกมรอบนี้', HINT]);
  assert.deepEqual(frame.querySelectorAll('.pd-gname').map((e) => e.textContent), ['แข่งลูกแก้ว']);
  assert.deepEqual(frame.querySelectorAll('.pd-rl').map((e) => e.textContent), ['รอบที่ 1 จาก 4']);
  assert.equal(frame.querySelector('.pd-mtlabel').textContent, 'เส้นชัย');
  assert.equal(frame.querySelectorAll('a').length, 0, 'the frame holds an anchor');
  assert.equal(frame.querySelectorAll('button').length, 0, 'the frame holds a control');
  assertInert(doc, frame, 'idle');
});

test('a hostile name on a plate renders as its own text, direction-isolated, never as an element', () => {
  const ev = event200();
  const live = ev.setup.people;
  const names = heat1Names(live);
  names[0] = HOSTILE.markup;
  names[3] = HOSTILE.anchor;
  const doc = makeDoc();
  const frame = doc.createElement('div');
  renderMarblesIdle(frame, viewFor(ev, 1, names, live.length), doc);
  const runs = frame.querySelectorAll('.pd-mplate').map((p) => p.querySelector('.nm'));
  assert.deepEqual(runs.map((r) => r.textContent), names, 'a hostile name did not render as its own text');
  assert.ok(runs.every((r) => r.getAttribute('dir') === 'auto'), 'a name run is not direction-isolated');
  assert.equal(frame.querySelectorAll('img').length, 0, 'a name built an img');
  assertInert(doc, frame, 'hostile');
});

test('the same key and round always seat the same names, and a short field seats only its own', () => {
  const ev = event200();
  const live = ev.setup.people;
  const a = idleMarbles(ev.eventKey, 1, live);
  const b = idleMarbles(ev.eventKey, 1, live);
  assert.deepEqual(a, b, 'the idle heat is not deterministic for the same key and round');
  const doc = makeDoc();
  const f1 = doc.createElement('div');
  const f2 = doc.createElement('div');
  const view = viewFor(ev, 1, a.map((p) => p.name), live.length);
  renderMarblesIdle(f1, view, doc);
  renderMarblesIdle(f2, view, doc);
  assert.deepEqual(plateNames(f1), plateNames(f2), 'two renders of one view disagree');
  // A later round's short field: the heat is the whole field, never padded to 20.
  const few = live.slice(0, 7);
  const short = idleMarbles(ev.eventKey, 4, few);
  assert.deepEqual(short.map((p) => p.name), heat1Names(few), 'a short field is not its own roster order');
  assert.equal(short.length, 7);
  const f3 = doc.createElement('div');
  renderMarblesIdle(f3, viewFor(ev, 4, short.map((p) => p.name), few.length), doc);
  assert.equal(f3.querySelectorAll('.pd-mplate').length, 7, 'a short heat drew 20 plates');
  assert.equal(f3.querySelectorAll('.pd-mmarble').length, 7, 'a short heat drew 20 marbles');
});
