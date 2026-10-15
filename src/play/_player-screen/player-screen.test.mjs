// ADR-0071 / gh#264: the shared player screen's rulings, driven through its pure state model. No DOM:
// every ruling the owner made is a function of (roster, group, range) and a sequence of taps, so it is
// tested as exactly that. The page half (mountPlayerScreen) is covered per converted route by that
// route's arm-reveal-paths.test.mjs, which drives it over the shared DOM stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const slots = new Map();
globalThis.localStorage = {
  getItem: (k) => (slots.has(k) ? slots.get(k) : null),
  setItem: (k, v) => slots.set(k, String(v)),
  removeItem: (k) => slots.delete(k),
};

const ps = await import('./player-screen.ts');
const { MASCOTS } = await import('../_mascots.ts');
const { loadRoster } = await import('../../shell/roster.ts');

const names = (n, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const ticks = (state) => state.rows.map((r) => r.ticked);

test('ruling 2: a first visit starts the stepper at 4, clamped into the game range', () => {
  assert.equal(ps.initialState([], [], [2, 10]).count, 4);
  assert.equal(ps.initialState([], [], [5, 8]).count, 5, 'a minimum above 4 lifts the start');
  assert.equal(ps.initialState([], [], [2, 3]).count, 3, 'a maximum under 4 caps the start');
  const s = ps.initialState([], [], [2, 10]);
  assert.equal(s.mode, 'first');
  assert.equal(ps.setCount(s, 99).count, 10, 'the stepper never passes the maximum');
  assert.equal(ps.setCount(s, -5).count, 2, 'nor drops under the minimum');
});

test('ruling 2: a first visit plays with zero typing -- every seat is its mascot, in cast order', () => {
  const s = ps.initialState([], [], [2, 10]);
  const players = ps.playersOf(s);
  assert.deepEqual(players.map((p) => p.name), MASCOTS.slice(0, 4).map((m) => m.name));
  assert.deepEqual(players.map((p) => p.emoji), MASCOTS.slice(0, 4).map((m) => m.emoji));
  // A blanked field plays as its mascot and is written to the roster as that name.
  const blanked = ps.setName(s, 1, '   ');
  assert.equal(ps.playersOf(blanked)[1].name, MASCOTS[1].name);
  assert.deepEqual(ps.rosterOf(blanked), MASCOTS.slice(0, 4).map((m) => m.name));
});

test('ruling 3: a saved roster opens with no stepper and the saved group ticked', () => {
  const s = ps.initialState(['ต้น', 'มายด์', 'บอส', 'ฟร็อกกี้', 'แนน'], ['ต้น', 'มายด์', 'ฟร็อกกี้', 'แนน'], [2, 10]);
  assert.equal(s.mode, 'saved');
  assert.deepEqual(ticks(s), [true, true, false, true, true], 'sitting out survives from the last game');
  assert.deepEqual(ps.limitLine(s), { kind: 'count', n: 4 });
  assert.deepEqual(ps.playersOf(s).map((p) => p.name), ['ต้น', 'มายด์', 'ฟร็อกกี้', 'แนน'], 'roster order');
  assert.deepEqual(ps.playersOf(s).map((p) => p.mascot), [0, 1, 3, 4], 'a mascot belongs to the roster seat');
  assert.equal(ps.rosterOf(s).length, 5, 'sitting out is not leaving: the roster keeps all five');
});

test('ruling 4: a roster above the maximum ticks the FIRST max, refuses one more, drops nobody', () => {
  const s = ps.initialState(names(8), [], [2, 6]);
  assert.deepEqual(ticks(s), [true, true, true, true, true, true, false, false]);
  assert.deepEqual(ps.limitLine(s), { kind: 'over', n: 6 });
  assert.equal(ps.canStart(s), true);
  const refused = ps.toggleTick(s, 6);
  assert.deepEqual(ticks(refused), ticks(s), 'a seventh tick is refused while six are ticked');
  const swapped = ps.toggleTick(ps.toggleTick(s, 0), 6);
  assert.deepEqual(ticks(swapped), [false, true, true, true, true, true, true, false], 'untick one, then the seventh goes in');
  assert.equal(ps.rosterOf(swapped).length, 8, 'nobody was dropped from the roster');
});

test('ruling 4: a saved group larger than this game keeps its first max, in roster order', () => {
  const s = ps.initialState(names(8), names(8), [2, 6]);
  assert.deepEqual(ticks(s), [true, true, true, true, true, true, false, false]);
});

test('ruling 4: start is disabled under the minimum, and the limit line says why', () => {
  const s = ps.initialState(['ต้น', 'มายด์', 'บอส'], ['ต้น'], [2, 10]);
  assert.equal(ps.canStart(s), false);
  assert.deepEqual(ps.limitLine(s), { kind: 'under', n: 2 });
  assert.equal(ps.canStart(ps.toggleTick(s, 1)), true);
});

test('ruling 3: remove takes the row out at once; undo puts it back in its own seat with its mascot', () => {
  const s = ps.initialState(['ต้น', 'มายด์', 'บอส', 'ฟร็อกกี้'], [], [2, 10]);
  const removed = ps.removeRow(s, 2);
  assert.deepEqual(removed.rows.map((r) => r.name), ['ต้น', 'มายด์', 'ฟร็อกกี้']);
  assert.equal(removed.rows[2].mascot, 3, 'the row below keeps its own mascot -- no neighbour repaints');
  assert.deepEqual(ps.rosterOf(removed), ['ต้น', 'มายด์', 'ฟร็อกกี้'], 'the removed name leaves the roster');
  const back = ps.undoRemove(removed);
  assert.deepEqual(back.rows.map((r) => r.name), ['ต้น', 'มายด์', 'บอส', 'ฟร็อกกี้']);
  assert.equal(back.rows[2].mascot, 2);
  assert.equal(back.undo, null, 'one undo per removal');
});

test('ruling 3: a second removal replaces the first undo -- one bar at a time', () => {
  const s = ps.initialState(['ต้น', 'มายด์', 'บอส'], [], [2, 10]);
  const twice = ps.removeRow(ps.removeRow(s, 0), 0);
  assert.equal(twice.undo.row.name, 'มายด์');
  assert.deepEqual(ps.undoRemove(twice).rows.map((r) => r.name), ['มายด์', 'บอส']);
  assert.deepEqual(ps.dropUndo(twice).undo, null, 'the bar timing out drops the undo');
});

test('ruling 3: an undone row only takes a seat back if one is free', () => {
  const s = ps.initialState(names(3), [], [2, 2]);
  assert.deepEqual(ticks(s), [true, true, false]);
  const removed = ps.toggleTick(ps.removeRow(s, 0), 1); // remove a ticked row, then fill its seat
  const back = ps.undoRemove(removed);
  assert.equal(back.rows[0].ticked, false, 'the seat was taken while the bar was up');
  assert.equal(ps.tickedCount(back), 2);
});

test('ruling 7: the roster ceiling is 20 -- reading, adding and the range all stop there', () => {
  assert.equal(ps.ROSTER_CEILING, 20);
  assert.equal(MASCOTS.length, ps.ROSTER_CEILING, 'one mascot per seat is satisfiable only while these agree');
  const full = ps.initialState(names(25), [], [2, 20]);
  assert.equal(full.rows.length, 20, 'a stored roster past the ceiling seats its first twenty');
  assert.equal(ps.canAdd(full), false);
  assert.equal(ps.addRow(full).rows.length, 20, 'the add row is refused at the ceiling');
  assert.throws(() => ps.checkRange([2, 21]), RangeError, 'a game declaring more than the ceiling is refused');
  const grown = ps.addRow(ps.initialState(names(19), [], [2, 20]));
  assert.equal(grown.rows.length, 20);
  assert.equal(ps.undoRemove({ ...grown, undo: { row: grown.rows[0], index: 0 } }).rows.length, 20,
    'an undo cannot push the roster past the ceiling either');
});

test('the add row wears the lowest free mascot and takes a seat only if one is free', () => {
  const s = ps.removeRow(ps.initialState(['ต้น', 'มายด์', 'บอส'], [], [2, 3]), 1);
  const grown = ps.addRow(s);
  assert.equal(grown.rows[2].mascot, 1, 'the mascot the removed row wore is free again');
  assert.equal(grown.rows[2].name, MASCOTS[1].name);
  assert.equal(grown.rows[2].ticked, true);
  assert.equal(ps.addRow(grown).rows[3].ticked, false, 'a fourth name in a three-seat game sits out');
});

test('gh#177: reset puts the first-visit seats back to the cast and keeps the count', () => {
  const s = ps.setName(ps.setCount(ps.initialState([], [], [2, 10]), 6), 0, 'ต้น');
  const wiped = ps.resetNames(s);
  assert.equal(wiped.count, 6);
  assert.deepEqual(ps.rosterOf(wiped), MASCOTS.slice(0, 6).map((m) => m.name));
});

test('ADR-0071 Data: the timebomb list migrates on an EMPTY roster -- the seats it showed, then the key is gone', async () => {
  slots.clear();
  const [timebomb] = ps.LEGACY_LISTS;
  assert.equal(timebomb.key, 'watduang:timebomb-players');
  const stored = MASCOTS.map((m) => m.name);
  stored[0] = 'ต้น';
  slots.set(timebomb.key, JSON.stringify({ count: 3, names: stored }));
  const { migrateLegacyList } = await import('../../shell/roster.ts');
  await migrateLegacyList(timebomb.key, timebomb.extract);
  assert.deepEqual(loadRoster().names(), ['ต้น', MASCOTS[1].name, MASCOTS[2].name]);
  assert.equal(slots.has(timebomb.key), false);
});

test('ADR-0071 Data: a NON-EMPTY roster wins and the timebomb key is deleted unread', async () => {
  slots.clear();
  const [timebomb] = ps.LEGACY_LISTS;
  await loadRoster().add('แนน');
  slots.set(timebomb.key, JSON.stringify({ count: 2, names: ['ต้น', 'มายด์'] }));
  const { migrateLegacyList } = await import('../../shell/roster.ts');
  await migrateLegacyList(timebomb.key, timebomb.extract);
  assert.deepEqual(loadRoster().names(), ['แนน']);
  assert.equal(slots.has(timebomb.key), false);
});

test('pilot scope: only the converted route key is migrated -- dice-loser and one-bomb still read theirs', () => {
  assert.deepEqual(ps.LEGACY_LISTS.map((l) => l.key), ['watduang:timebomb-players']);
});

test('copy: every Thai string the screen builds at run time is on the board, byte for byte', () => {
  const board = fs.readFileSync(path.join(import.meta.dirname, '../../../design/PlayerSetup.dc.html'), 'utf8');
  const runtime = { ...ps.COPY };
  // The one string the board does not paint: timebomb's positional field label, kept on purpose.
  delete runtime.seatLabel;
  for (const [key, value] of Object.entries(runtime)) {
    assert.ok(board.includes(value), `COPY.${key} (${JSON.stringify(value)}) is not on the board`);
  }
  // The assembled lines, as the board writes them with its sample numbers.
  assert.ok(board.includes(`${ps.COPY.overLead}6${ps.COPY.overMid}`), 'over-max line');
  assert.ok(board.includes(`${ps.COPY.undoLead}บอส${ps.COPY.undoTail}`), 'undo line');
  const astro = fs.readFileSync(path.join(import.meta.dirname, 'PlayerScreen.astro'), 'utf8');
  for (const s of ['แตะที่ชื่อเพื่อเปลี่ยน — ชื่อจะติดไปเกมถัดไปด้วย', '+ เพิ่มคน', 'พร้อมเล่น', 'เลิกทำ',
    'เปลี่ยนผู้เล่นตอนนี้?', 'รอบที่เล่นอยู่จะจบลงทันที แล้วเริ่มรอบใหม่กับวงที่แก้แล้ว', 'เล่นรอบนี้ต่อ',
    'จบรอบ แล้วแก้ผู้เล่น', '↺ รีเซ็ตเป็นชื่อสัตว์']) {
    assert.ok(board.includes(s), `the test's own expectation is not on the board: ${s}`);
    assert.ok(astro.includes(s), `PlayerScreen.astro does not ship the board string: ${s}`);
  }
});

// ---- gh#264 REFUTE fix round ------------------------------------------------------------------

test('finding 1: hidden typed seats past the count survive the import; the shown seats keep their order', () => {
  const names = MASCOTS.map((m) => m.name);
  names[0] = 'One';
  names[4] = 'Five';
  names[5] = 'Six';
  // The player typed six seats, then stepped the count back to four: Five and Six are hidden, not gone.
  assert.deepEqual(ps.extractTimebombList({ count: 4, names }), ['One', MASCOTS[1].name, MASCOTS[2].name, MASCOTS[3].name, 'Five', 'Six']);
});

test('finding 3: a blank shown seat imports as its own mascot, so no later seat shifts', () => {
  assert.deepEqual(ps.extractTimebombList({ count: 3, names: ['A', '', 'C'] }), ['A', MASCOTS[1].name, 'C']);
  assert.deepEqual(ps.extractTimebombList({ count: 3, names: ['A', '​', 'C'] }), ['A', MASCOTS[1].name, 'C']);
});

test('finding 3 (kept, inherent): two seats with one name are one roster entry -- the roster is keyed by name', async () => {
  assert.deepEqual(ps.extractTimebombList({ count: 2, names: ['Same', 'Same'] }), ['Same', 'Same']);
  slots.clear();
  slots.set(ps.LEGACY_LISTS[0].key, JSON.stringify({ count: 2, names: ['Same', 'Same'] }));
  const { migrateLegacyList } = await import('../../shell/roster.ts');
  await migrateLegacyList(ps.LEGACY_LISTS[0].key, ps.LEGACY_LISTS[0].extract);
  assert.deepEqual(loadRoster().names(), ['Same']);
});

test('the import reads the count the way the timebomb route did: clamped into [2, 10], 6 when absent, capped at 20', () => {
  const names = Array.from({ length: 20 }, (_, i) => `n${i}`);
  assert.equal(ps.extractTimebombList({ names }).length, 20, '6 shown, then the 14 typed hidden seats');
  assert.deepEqual(ps.extractTimebombList({ count: 99, names }).slice(0, 10), names.slice(0, 10));
  assert.deepEqual(ps.extractTimebombList({ count: 1, names: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(ps.extractTimebombList({ count: 2, names: ['a', 'b', MASCOTS[2].name] }), ['a', 'b'], 'an untouched hidden seat is a default, not a name');
});

test('finding 4: the start write is a set of EDITS -- an untouched row writes nothing', () => {
  const s = ps.initialState(['A', 'B', 'C'], [], [2, 10]);
  assert.deepEqual(ps.opsOf(s), [], 'nothing changed, nothing written -- a stale screen cannot resurrect or reorder');
  const edited = ps.addRow(ps.setName(ps.removeRow(s, 0), 0, 'Beta'));
  assert.deepEqual(ps.opsOf(edited), [
    { op: 'remove', name: 'A' },
    { op: 'rename', from: 'B', to: 'Beta' },
    { op: 'add', name: MASCOTS[0].name },
  ]);
  assert.deepEqual(ps.opsOf(ps.initialState([], [], [2, 10])).map((o) => o.op), ['add', 'add', 'add', 'add'], 'a first visit adds its seats');
});

// The page half of rulings 3 and 7, on the real screen over the real template (the harness swaps in
// its own storage, so these run after every test above that reads `slots`).
const { mountOnPage, settle } = await import('./screen-harness.mjs');
const SURFACE = '<div id="app"><section id="root" hidden></section></div>';

async function savedPage(t, roster = ['A', 'B', 'C']) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: SURFACE, rootId: 'root', roster });
  page.screen.open();
  await settle();
  t.mock.timers.tick(401);
  const writes = [];
  const realSet = localStorage.setItem;
  localStorage.setItem = (k, v) => { writes.push(k); realSet(k, v); };
  return {
    page,
    writes,
    names: () => page.store.loadRoster().names(),
    rm: (i) => page.root.querySelectorAll('.ps-rm')[i].click(),
  };
}

test('finding 5 / ruling 3: the x removes from the ROSTER once the undo bar expires', async (t) => {
  const { page, names, rm } = await savedPage(t);
  rm(0);
  assert.deepEqual(names(), ['A', 'B', 'C'], 'inside the four seconds nothing is final');
  t.mock.timers.tick(page.ps.UNDO_MS);
  await settle();
  assert.deepEqual(names(), ['B', 'C']);
  page.screen.close();
  page.screen.open();
  await settle();
  assert.deepEqual(page.root.querySelectorAll('.ps-n').map((f) => f.value), ['B', 'C'], 'a reopen before start does not bring it back');
});

test('finding 5 / ruling 3: undo within four seconds restores the row at its index and writes NOTHING', async (t) => {
  const { page, writes, names, rm } = await savedPage(t);
  rm(1);
  t.mock.timers.tick(401);
  page.part('undo').click();
  t.mock.timers.tick(page.ps.UNDO_MS);
  await settle();
  assert.deepEqual(page.root.querySelectorAll('.ps-n').map((f) => f.value), ['A', 'B', 'C']);
  assert.deepEqual(names(), ['A', 'B', 'C']);
  assert.deepEqual(writes, [], 'no storage write at all');
});

test('finding 5 / ruling 3: a second x makes the first removal final at once', async (t) => {
  const { page, names, rm } = await savedPage(t);
  rm(0);
  t.mock.timers.tick(401);
  rm(0);
  await settle();
  assert.deepEqual(names(), ['B', 'C'], 'the first is written when the bar is replaced');
  t.mock.timers.tick(page.ps.UNDO_MS);
  await settle();
  assert.deepEqual(names(), ['C']);
});

test('finding 5 / ruling 3: a pending removal is made final when the page is put away', async (t) => {
  const first = await savedPage(t);
  first.rm(2);
  first.page.fireWindow('pagehide');
  await settle();
  assert.deepEqual(first.names(), ['A', 'B']);
  t.mock.timers.reset();
  const second = await savedPage(t, ['A', 'B']);
  second.rm(0);
  second.page.doc.visibilityState = 'hidden';
  second.page.doc.dispatchEvent({ type: 'visibilitychange' });
  await settle();
  assert.deepEqual(second.names(), ['B'], 'visibilitychange to hidden is the earlier, safer moment');
});

test('round 2: a rename chain on the real screen starts B/Z/C and the roster and group keep B/Z/C', async (t) => {
  const { page, names } = await savedPage(t);
  const fields = page.root.querySelectorAll('.ps-n');
  fields[0].value = 'B';
  fields[0].dispatchEvent({ type: 'input' });
  fields[1].value = 'Z';
  fields[1].dispatchEvent({ type: 'input' });
  page.part('start').click();
  await settle();
  assert.deepEqual(page.calls.started[0].map((p) => p.name), ['B', 'Z', 'C']);
  assert.deepEqual(names(), ['B', 'Z', 'C'], 'nobody the round played with is lost from the roster');
  assert.deepEqual(page.store.loadGroup(), ['B', 'Z', 'C']);
});

test('finding 2: a start whose add another tab pushed past the ceiling is refused -- nothing starts, nothing is clipped', async (t) => {
  const nineteen = Array.from({ length: 19 }, (_, i) => `p${i + 1}`);
  const { page, names } = await savedPage(t, nineteen);
  page.part('add').click();
  t.mock.timers.tick(401);
  await page.store.applyRosterOps([{ op: 'add', name: 'otherTab' }], 20); // lands while this screen is open
  page.part('start').click();
  await settle();
  assert.equal(page.calls.started.length, 0, 'the round did not start on a roster that is not the one shown');
  assert.equal(names().length, 20);
  assert.ok(names().includes('otherTab'), 'the other tab keeps its legal addition');
  assert.equal(page.root.querySelectorAll('.ps-p').length, 20, 'the screen re-read storage and shows the roster as it stands');
  t.mock.timers.tick(401);
  assert.equal(page.part('add').disabled, true, 'the add row is closed at the ceiling');
});
