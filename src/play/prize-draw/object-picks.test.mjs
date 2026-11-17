// node --test — the envelopes (gh#317) and flipcards (gh#318) finals' object picks on the projector. The MC
// places each finalist on an object with the ladder's lane-placement control (owner ruling 2026-11-16, gh#305
// pick B): tap an object, then a name, in any order; a tap on a filled object empties it. Every assignment is a
// compare-and-set write of the event (store.ts put), so a reload comes back to the picks, a second projector
// follows them, and a tab that is behind loses its pick on the version compare. The draw locks the stored picks
// and hands them to the reveal as `outcome.picks`; the order it draws never reads them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventWrites, fakeHosts, fakeOrigin, mount, press, seedRaw, seeded, storedEvent, storedRaw } from './stage-harness.mjs';
import { advance, decodeEvent, drawNext, encodeEvent, liveIds, revealDrawn } from '../../prize-event/event.ts';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from '../../prize-event/fake-dom.mjs';
import * as objects from './final-picks.ts';

const hostile = Object.values(HOSTILE);

const PICK_FINALS = ['envelopes', 'flipcards'];
/** Board copy, verbatim from each board's idle frame (design/Gh317Envelopes.dc.html A/env-idle,
 *  design/Gh318Cards.dc.html A/card-idle). */
const BOARD = {
  envelopes: { name: 'ซองของขวัญ', instruction: 'ผู้เข้ารอบชิง 5 คน เลือกซองของขวัญคนละซอง', picked: 'เลือกแล้ว รอเปิดรอบชิง', note: 'ซองของขวัญปิดอยู่ รางวัลอยู่ข้างใน' },
  flipcards: { name: 'เปิดไพ่ชิงรางวัล', instruction: 'ผู้เข้ารอบชิง 5 คน เลือกไพ่คว่ำคนละใบ', picked: 'เลือกไพ่แล้ว รอเปิดรอบชิง', note: 'ไพ่คว่ำหน้า รางวัลอยู่ด้านหลัง' },
};

/** A stored pick-final event at its final, ready, with five empty objects. */
function atFinal(origin, game, list) {
  let ev = storedEvent(origin, { n: 50, games: { rounds: [null, null, null, null], final: game }, ...(list ? { list } : {}) });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  const byId = new Map(ev.setup.people.map((p) => [p.id, p.name]));
  return { ev, finalists: liveIds(ev), name: (id) => byId.get(id) };
}

const stored = (origin) => decodeEvent(storedRaw(origin));
const tap = (b) => {
  assert.ok(b, 'no such control on screen');
  b.disabled = false;
  b.click();
};
/** The MC's object tap, then name tap; the name tap's write answers before this returns. */
async function pick(s, origin, object, name) {
  tap(s.laneButtons()[object]);
  tap(s.nameButton(name));
  await origin.idle();
}
/** What a screen shows on each object's control: the finalist's name, or null for an empty object. */
const shown = (s, names) => s.laneButtons().map((b) => names.find((n) => b.textContent.includes(n)) ?? null);
/** What the frame's plates read, left to right. */
const plates = (s) => s.frame.querySelectorAll('.pd-plate').map((p) => p.textContent);
const texts = (s, sel) => s.frame.querySelectorAll(sel).map((e) => e.textContent);

for (const game of PICK_FINALS) {
  test(`${game}: the frame is the board's idle picture, five objects with a plate under each, and the picked line only once five are placed`, async () => {
    const origin = fakeOrigin();
    const { finalists, name } = atFinal(origin, game);
    const names = finalists.map(name);
    const s = await mount({ origin });
    assert.equal(s.frame.getAttribute('data-screen'), 'objects');
    assert.equal(s.frame.querySelectorAll('.pd-obj').length, 5, 'not five objects');
    assert.deepEqual(plates(s), ['1', '2', '3', '4', '5'], 'an empty plate does not name its object');
    assert.ok(texts(s, '.pd-gname').includes(BOARD[game].name), 'no game name');
    assert.ok(texts(s, '.pd-lk').includes(BOARD[game].instruction), 'no board instruction');
    assert.ok(texts(s, '.pd-lk').includes(BOARD[game].note), 'no board note');
    assert.ok(!texts(s, '.pd-lk').includes(BOARD[game].picked), 'the picked line shows before all five are placed');
    assert.deepEqual(texts(s, '.pd-to'), ['2'], 'the prize count is not the event\'s');
    assert.equal(s.laneButtons().length, 5);
    assert.equal(s.go().disabled, true, 'the draw is live before any pick');
    for (const [object, k] of [[4, 0], [0, 1], [2, 2], [1, 3], [3, 4]]) await pick(s, origin, object, names[k]);
    assert.deepEqual(plates(s), [names[1], names[3], names[2], names[4], names[0]]);
    assert.ok(texts(s, '.pd-lk').includes(BOARD[game].picked), 'no picked line once all five are placed');
    assert.equal(s.nameButtons().length, 0);
  });

  test(`${game}: a reload after two picks comes back to them, and a tap on a filled object empties it, stored`, async () => {
    const origin = fakeOrigin();
    const { finalists, name } = atFinal(origin, game);
    const names = finalists.map(name);
    const s = await mount({ origin });
    await pick(s, origin, 3, names[0]);
    await pick(s, origin, 0, names[1]);
    assert.deepEqual(stored(origin).prepared, { game, picks: [finalists[1], null, null, finalists[0], null] }, 'the picks were not stored');
    const reloaded = await mount({ origin, env: origin.tab('reload') });
    assert.deepEqual(shown(reloaded, names), [names[1], null, null, names[0], null]);
    assert.deepEqual(reloaded.nameButtons().map((b) => b.textContent), names.slice(2), 'a placed finalist is free again after the reload');
    // Undo: the filled object empties, as a stored write, and its finalist is free again.
    const writes = eventWrites(origin).length;
    tap(reloaded.laneButtons()[3]);
    await origin.idle();
    assert.equal(eventWrites(origin).length, writes + 1, 'the undo was not a stored write');
    assert.deepEqual(stored(origin).prepared.picks, [finalists[1], null, null, null, null]);
    assert.ok(reloaded.nameButton(names[0]), 'the emptied object\'s finalist is not free again');
  });

  test(`${game}: a second projector tab follows the first tab's picks on its commit notice`, async () => {
    const origin = fakeOrigin();
    const { finalists, name } = atFinal(origin, game);
    const names = finalists.map(name);
    const a = await mount({ origin, env: origin.tab('A') });
    const b = await mount({ origin, env: origin.tab('B') });
    await pick(a, origin, 2, names[3]);
    assert.deepEqual(shown(b, names), [null, null, names[3], null, null], 'the second tab did not follow the pick');
    assert.equal(b.nameButton(names[3]), null, 'the second tab still offers a placed finalist');
  });

  test(`${game}: a stale tab's pick loses on the version compare, writes nothing, and takes the stored pick up`, async () => {
    const origin = fakeOrigin();
    const { finalists, name } = atFinal(origin, game);
    const names = finalists.map(name);
    // Tab A never hears B's commit notice: it learns of B's pick only from its own compare-and-set.
    const envA = origin.tab('A');
    const Real = envA.BroadcastChannel;
    envA.BroadcastChannel = class extends Real {
      addEventListener() {}
    };
    const a = await mount({ origin, env: envA });
    const b = await mount({ origin, env: origin.tab('B') });
    await pick(b, origin, 0, names[0]);
    assert.deepEqual(shown(a, names), [null, null, null, null, null], 'precondition: tab A has not heard of the pick');
    const writes = eventWrites(origin).length;
    await pick(a, origin, 0, names[1]);
    assert.equal(eventWrites(origin).length, writes, 'the stale pick was written');
    assert.deepEqual(stored(origin).prepared.picks, [finalists[0], null, null, null, null], 'the stale pick overwrote the stored one');
    assert.deepEqual(shown(a, names), [names[0], null, null, null, null], 'the stale tab did not take up the stored pick');
  });

  test(`${game}: the draw locks the stored picks after a reload and hands them to the reveal as outcome.picks`, async () => {
    const origin = fakeOrigin();
    const { finalists, name } = atFinal(origin, game);
    const names = finalists.map(name);
    const s = await mount({ origin });
    const objects = [4, 2, 0, 3, 1];
    for (const [k, object] of objects.entries()) await pick(s, origin, object, names[k]);
    const want = Array(5);
    objects.forEach((object, k) => (want[object] = finalists[k]));
    const { hosts, start } = fakeHosts();
    const reloaded = await mount({ origin, env: origin.tab('reload'), startReveal: start });
    assert.deepEqual(shown(reloaded, names), want.map(name));
    assert.equal(press(reloaded), true);
    await origin.idle();
    const final = stored(origin).final;
    assert.deepEqual(final.picks, want, 'the draw did not lock the stored picks');
    assert.equal(hosts.length, 1);
    const outcome = hosts[0].options.input.outcome;
    assert.equal(outcome.kind, 'final');
    assert.equal(outcome.game, game);
    assert.deepEqual(outcome.picks, want, 'the reveal was not handed the picks');
    assert.deepEqual(outcome.order, final.order);
    assert.equal(reloaded.laneButtons().length, 0, 'the object picks stay on screen while the final presents');
    hosts[0].settle();
    assert.equal(reloaded.frame.getAttribute('data-screen'), 'result');
  });
}

// ADR-0026: names are attacker-owned. The frame is fed hostile names directly, bypassing the stored event's
// validation, as hostile-names.test.mjs does for the other screens: each plate is its name's own text, never
// markup, and no markup sink is touched.
test('renderer: hostile names on the plates render as their own text, never as elements', () => {
  for (const game of PICK_FINALS) {
    const doc = makeDoc();
    const frame = doc.createElement('div');
    doc.body.append(frame);
    const names = hostile.slice(0, 5);
    while (names.length < 5) names.push(`P${names.length}`);
    assert.equal(typeof objects.renderObjects, 'function', 'no renderObjects in final-picks.ts');
    objects.renderObjects(frame, { game, eventName: hostile[0], dots: [], prizeCount: 3, names, plates: [0, 1, 2, 3, 4], next: null, objectLabel: String }, doc);
    assert.deepEqual(doc.htmlWrites, [], `${game}: a markup sink was used`);
    const active = frame.all().filter((el) => ACTIVE_TAGS.includes(el.tagName));
    assert.deepEqual(active.map((el) => el.tagName), [], `${game}: a name became an element`);
    assert.deepEqual(frame.querySelectorAll('.pd-plate').map((p) => p.textContent), names, `${game}: a plate does not read its name`);
  }
});
