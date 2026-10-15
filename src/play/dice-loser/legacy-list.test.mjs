// ADR-0071 "Data": this route kept its own player list under a per-game key until gh#264. The shared
// screen imports it once, on an EMPTY shared roster, and deletes the key; on a non-empty roster the
// roster wins and the key is deleted unread. The rule is the core's (migrateLegacyList, shared with
// timebomb's key); what this file pins is THIS route's half of it -- the key is registered, and the
// extractor reads the blob the way this route's own load() read it, so the import is what the players
// last saw:
//   - `{ count, names }`, names one entry per seat up to the route's maximum, an untouched seat
//     holding its cast name; count clamped into [2, 10], 3 when absent; a name cut to the 12
//     characters its field allowed, and a blank seat playing as its cast name.
//   - a seat past the count kept its typed name for when the count came back up: imported after the
//     shown seats, so deleting the key does not delete it. An untouched seat past the count is not.
import test from 'node:test';
import assert from 'node:assert/strict';

const slots = new Map();
globalThis.localStorage = {
  getItem: (k) => (slots.has(k) ? slots.get(k) : null),
  setItem: (k, v) => slots.set(k, String(v)),
  removeItem: (k) => slots.delete(k),
};

const ps = await import('../_player-screen/player-screen.ts');
const { MASCOTS } = await import('../_mascots.ts');
const { loadRoster, migrateLegacyList } = await import('../../shell/roster.ts');
const game = (await import('../../games/dice-loser.ts')).default;

const KEY = 'watduang:dice-loser-players';
const entry = () => ps.LEGACY_LISTS.find((l) => l.key === KEY);
/** What this route's own save() wrote: one entry per seat up to its maximum, cast names untouched. */
const blob = (count, typed = {}) => ({
  count,
  names: Array.from({ length: game.players[1] }, (_, i) => typed[i] ?? MASCOTS[i].name),
});

test('the dice-loser key is registered for the one-time import', () => {
  assert.ok(entry(), `${KEY} is not in LEGACY_LISTS -- a dice-loser-only device would lose its list`);
});

test('the shown seats import in seat order, a blank seat as its cast name', () => {
  const { extract } = entry();
  assert.deepEqual(extract(blob(4, { 0: 'ต้น', 1: '', 2: '   ', 3: 'มายด์' })), ['ต้น', MASCOTS[1].name, MASCOTS[2].name, 'มายด์']);
});

test('a typed name past the count is kept; an untouched seat past it is not', () => {
  const { extract } = entry();
  assert.deepEqual(extract(blob(2, { 0: 'ต้น', 5: 'บอส' })), ['ต้น', MASCOTS[1].name, 'บอส']);
});

test("the count is this route's own: 3 when absent, clamped into the declared range", () => {
  const { extract } = entry();
  assert.equal(extract({ names: blob(0).names }).length, 3);
  assert.equal(extract(blob(99)).length, game.players[1]);
  assert.equal(extract(blob(0)).length, game.players[0]);
  assert.deepEqual(game.players, [2, 10], 'the extractor reads this blob with the range it was written under');
});

test('a name is cut to the 12 characters its field allowed', () => {
  const { extract } = entry();
  assert.equal(extract(blob(2, { 0: 'abcdefghijklmnop' }))[0], 'abcdefghijkl');
});

test('a corrupt blob imports nothing', () => {
  const { extract } = entry();
  for (const bad of [null, 'x', 7, {}, { count: 3 }, { count: 3, names: 'ต้น' }]) assert.deepEqual(extract(bad), []);
});

test('end to end: an EMPTY roster imports the list and the key is gone; a non-empty roster wins', async () => {
  slots.clear();
  slots.set(KEY, JSON.stringify(blob(3, { 1: 'มายด์' })));
  await migrateLegacyList(KEY, entry().extract);
  assert.deepEqual(loadRoster().names(), [MASCOTS[0].name, 'มายด์', MASCOTS[2].name]);
  assert.equal(slots.has(KEY), false);

  slots.clear();
  await loadRoster().add('แนน');
  slots.set(KEY, JSON.stringify(blob(3, { 0: 'ต้น' })));
  await migrateLegacyList(KEY, entry().extract);
  assert.deepEqual(loadRoster().names(), ['แนน']);
  assert.equal(slots.has(KEY), false);
});
