// node --test — the ladder final's lane picks are stored as they are made (gh#307 REFUTE P2), not held in
// one screen's memory until the draw. Each assignment is a compare-and-set write of the event (store.ts
// put), so a reload comes back to the same picks, a second projector follows them on the other tab's commit
// notice, and a tab that is behind loses its pick on the version compare instead of overwriting. The slot
// layout beside the picks never changes, and nothing of the permutation exists until the picks lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventWrites, fakeHosts, fakeOrigin, mount, press, seedRaw, seeded, storedEvent, storedRaw } from './stage-harness.mjs';
import { advance, decodeEvent, drawNext, encodeEvent, liveIds, revealDrawn } from '../../prize-event/event.ts';

const LADDER = { rounds: [null, null, null, null], final: 'ladder' };

/** A stored ladder event at its final, ready, with its slot layout and five empty lanes. */
function atLadderFinal(origin) {
  let ev = storedEvent(origin, { n: 50, games: LADDER });
  const rng = seeded(4);
  for (let r = 1; r <= 4; r++) ev = advance(revealDrawn(drawNext(ev, rng)), rng);
  seedRaw(origin, encodeEvent(ev));
  const byId = new Map(ev.setup.people.map((p) => [p.id, p.name]));
  return { ev, finalists: liveIds(ev), name: (id) => byId.get(id) };
}

const stored = (origin) => decodeEvent(storedRaw(origin));
const slotsText = (origin) => JSON.stringify(JSON.parse(storedRaw(origin)).prepared.slotRanks);
/** A tap past the arm window (the gate is arm-reveal-paths' to test). */
const tap = (b) => {
  assert.ok(b, 'no such control on screen');
  b.disabled = false;
  b.click();
};
/** The MC's lane tap, then name tap; the name tap's write answers before this returns. */
async function pick(s, origin, lane, name) {
  tap(s.laneButtons()[lane]);
  tap(s.nameButton(name));
  await origin.idle();
}
/** What a screen shows on each lane: the finalist's name, or null for an empty lane. */
const shown = (s, names) => s.laneButtons().map((b) => names.find((n) => b.textContent.includes(n)) ?? null);

test('a reload after two picks comes back to them, with the other three finalists still free', async () => {
  const origin = fakeOrigin();
  const { finalists, name } = atLadderFinal(origin);
  const names = finalists.map(name);
  const slots = slotsText(origin);
  const s = await mount({ origin });
  await pick(s, origin, 3, names[0]);
  await pick(s, origin, 0, names[1]);
  assert.deepEqual(stored(origin).prepared.picks, [finalists[1], null, null, finalists[0], null], 'the picks were not stored');
  const reloaded = await mount({ origin, env: origin.tab('reload') });
  assert.deepEqual(shown(reloaded, names), [names[1], null, null, names[0], null]);
  assert.deepEqual(reloaded.nameButtons().map((b) => b.textContent), names.slice(2), 'a picked finalist is free again after the reload');
  assert.equal(slotsText(origin), slots, 'a pick changed the stored slot layout');
  assert.doesNotMatch(storedRaw(origin), /permutation/, 'the permutation exists before the lock');
});

test('a reload after all five picks keeps every assignment, and the draw locks exactly those', async () => {
  const origin = fakeOrigin();
  const { finalists, name } = atLadderFinal(origin);
  const names = finalists.map(name);
  const slots = slotsText(origin);
  const s = await mount({ origin });
  const lanes = [4, 2, 0, 3, 1];
  for (const [k, lane] of lanes.entries()) await pick(s, origin, lane, names[k]);
  const want = Array(5);
  lanes.forEach((lane, k) => (want[lane] = finalists[k]));
  const { hosts, start } = fakeHosts();
  const reloaded = await mount({ origin, env: origin.tab('reload'), startReveal: start });
  assert.deepEqual(shown(reloaded, names), want.map(name));
  assert.equal(reloaded.nameButtons().length, 0);
  assert.equal(slotsText(origin), slots);
  assert.equal(press(reloaded), true);
  await origin.idle();
  const final = stored(origin).final;
  assert.deepEqual(final.picks, want, 'the draw did not lock the stored picks');
  assert.equal(JSON.stringify(final.slotRanks), slots, 'the lock drew new slots');
  assert.equal(hosts.length, 1);
});

test('a second projector tab follows the first tab\'s picks on its commit notice', async () => {
  const origin = fakeOrigin();
  const { finalists, name } = atLadderFinal(origin);
  const names = finalists.map(name);
  const a = await mount({ origin, env: origin.tab('A') });
  const b = await mount({ origin, env: origin.tab('B') });
  assert.deepEqual(shown(b, names), [null, null, null, null, null]);
  await pick(a, origin, 2, names[3]);
  assert.deepEqual(shown(b, names), [null, null, names[3], null, null], 'the second tab did not follow the pick');
  assert.equal(b.nameButton(names[3]), null, 'the second tab still offers a picked finalist');
});

test('a stale tab\'s pick loses on the version compare: the other tab\'s stored pick stands, and the stale tab takes it up', async () => {
  const origin = fakeOrigin();
  const { finalists, name } = atLadderFinal(origin);
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
