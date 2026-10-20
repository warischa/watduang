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

test('ADR-0071 Data: exactly the listed per-game keys are migrated -- four lists deleted, three settings blobs kept', () => {
  assert.deepEqual(ps.LEGACY_LISTS.map((l) => [l.key, l.keep ?? 'delete']), [
    ['watduang:timebomb-players', 'delete'],
    ['watduang:dice-loser-players', 'delete'],
    ['watduang:one-bomb-players', 'delete'],
    ['freeze_tap_players', 'delete'],
    ['ZERO_TRIGGER_DATA_V1', 'settings'],
    ['short-stick-pro-v2', 'settings'],
    ['wire-panic-v1', 'settings'],
  ]);
});

// Owner ruling 2026-10-15 (ADR-0071 Data, widened): freeze-tap's own list, and the players field of
// three blobs whose other fields are game settings the routes keep.
const legacy = (key) => ps.LEGACY_LISTS.find((l) => l.key === key);
const migrate = async (key) => {
  const { migrateLegacyList } = await import('../../shell/roster.ts');
  const entry = legacy(key);
  await migrateLegacyList(entry.key, entry.extract, entry.keep);
};
const freezeSeat = (name, i) => ({ id: `p_${i + 1}`, name, emoji: MASCOTS[i].emoji, color: '#000', defaultName: MASCOTS[i].name });

test('freeze-tap import: the seats it showed, a default seat as its mascot, then the key is gone', async () => {
  slots.clear();
  slots.set('freeze_tap_players', JSON.stringify(['ต้น', MASCOTS[1].name, 'มายด์'].map(freezeSeat)));
  await migrate('freeze_tap_players');
  assert.deepEqual(loadRoster().names(), ['ต้น', MASCOTS[1].name, 'มายด์']);
  assert.equal(slots.has('freeze_tap_players'), false);
});

test('freeze-tap import: an untouched list of mascot defaults is not a list anyone typed -- nothing imports', async () => {
  slots.clear();
  slots.set('freeze_tap_players', JSON.stringify(MASCOTS.slice(0, 4).map((m, i) => freezeSeat(m.name, i))));
  await migrate('freeze_tap_players');
  assert.deepEqual(loadRoster().names(), [], 'the device still sees the first-visit stepper');
  assert.equal(slots.has('freeze_tap_players'), false);
});

test('freeze-tap import: read the way that route read it -- 2 to 20 seats with an emoji, else nothing', () => {
  const { extract } = legacy('freeze_tap_players');
  assert.deepEqual(extract([freezeSeat('ต้น', 0)]), [], 'one seat was never loaded by that route');
  assert.deepEqual(extract([{ name: 'ต้น' }, { name: 'มายด์' }]), [], 'no emoji, not that route\'s list');
  assert.deepEqual(extract('nope'), []);
});

// The three blobs, each in the shape its route's own save wrote, with that route's own settings.
const BLOBS = {
  ZERO_TRIGGER_DATA_V1: (names) => ({ players: names.map((name, i) => ({ id: i + 1, name, avatar: MASCOTS[i].emoji, score: 0 })), penaltyMode: 'custom' }),
  'short-stick-pro-v2': (names) => ({ players: names, stickCount: 8, shortCount: 2, penaltyMode: 'preset', selectedPenalty: 'ร้องเพลง' }),
  'wire-panic-v1': (names) => ({ players: names, penaltyMode: 'custom', selectedPenalty: '💸 เลี้ยงน้ำ' }),
};
const withoutPlayers = (blob) => {
  const copy = { ...blob };
  delete copy.players;
  return JSON.stringify(copy);
};

for (const [key, make] of Object.entries(BLOBS)) {
  test(`${key}: an EMPTY roster imports the players field; the blob stays, without it, every setting kept`, async () => {
    slots.clear();
    const blob = make(['ต้น', MASCOTS[1].name, 'มายด์']);
    slots.set(key, JSON.stringify(blob));
    await migrate(key);
    assert.deepEqual(loadRoster().names(), ['ต้น', MASCOTS[1].name, 'มายด์']);
    assert.equal(slots.get(key), withoutPlayers(blob), 'the settings are byte-equivalent and the players are gone');
  });

  test(`${key}: a NON-EMPTY roster wins -- the players field is dropped unread, the settings kept`, async () => {
    slots.clear();
    await loadRoster().add('แนน');
    const blob = make(['ต้น', 'มายด์']);
    slots.set(key, JSON.stringify(blob));
    await migrate(key);
    assert.deepEqual(loadRoster().names(), ['แนน']);
    assert.equal(slots.get(key), withoutPlayers(blob));
  });

  test(`${key}: corrupt JSON and a blob with no players are left exactly as they are`, async () => {
    for (const raw of ['{not json', withoutPlayers(make([]))]) {
      slots.clear();
      slots.set(key, raw);
      await migrate(key);
      assert.equal(slots.get(key), raw, 'the route\'s own settings key is not the migration\'s to delete');
      assert.deepEqual(loadRoster().names(), []);
    }
  });

  test(`${key}: an untouched default player list imports nothing, and is still dropped from the blob`, async () => {
    slots.clear();
    const blob = make(MASCOTS.slice(0, 4).map((m) => m.name));
    slots.set(key, JSON.stringify(blob));
    await migrate(key);
    assert.deepEqual(loadRoster().names(), []);
    assert.equal(slots.get(key), withoutPlayers(blob));
  });
}

test('settings blob: an import whose write does not land keeps the blob whole for the next visit', async () => {
  slots.clear();
  const raw = JSON.stringify(BLOBS['wire-panic-v1'](['ต้น', 'มายด์']));
  slots.set('wire-panic-v1', raw);
  const real = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try {
    await migrate('wire-panic-v1');
  } finally {
    localStorage.setItem = real;
  }
  assert.equal(slots.get('wire-panic-v1'), raw);
});

// ---- frames 9 and 10 (owner rulings 2026-10-15), pure ------------------------------------------

test('frame 9: two rows showing one trimmed name both mark, the limit line says so, and start is off', () => {
  const s = ps.setName(ps.initialState(['A', 'B', 'C'], [], [2, 10]), 2, ' A ');
  assert.deepEqual(ps.duplicateRows(s), [0, 2]);
  assert.equal(ps.canStart(s), false);
  assert.equal(ps.limitLine(s).kind, 'dup');
  const fixed = ps.setName(s, 2, 'Ann');
  assert.deepEqual(ps.duplicateRows(fixed), []);
  assert.equal(ps.canStart(fixed), true);
});

test('frame 9 on a first visit too: a seat typed as the next seat\'s mascot would merge them', () => {
  const s = ps.setName(ps.initialState([], [], [2, 10]), 0, MASCOTS[1].name);
  assert.deepEqual(ps.duplicateRows(s), [0, 1]);
  assert.equal(ps.canStart(s), false);
  assert.deepEqual(ps.duplicateRows(ps.setCount(ps.setName(ps.initialState([], [], [2, 10]), 0, MASCOTS[5].name), 4)), [], 'a hidden seat past the count is not on the screen');
});

test('frame 10: the roster-full line shows while the refused screen is at the ceiling, and outranks the counts', () => {
  const full = { ...ps.initialState(names(20), [], [2, 10]), notice: 'full' };
  assert.equal(ps.limitLine(full).kind, 'full');
  assert.equal(ps.limitLine(ps.removeRow(full, 0)).kind, 'over', 'a seat freed: the roster is no longer full');
  assert.equal(ps.limitLine({ ...full, notice: null }).kind, 'over');
});

test('P2 round 3: the players handed to onStart follow the COMMITTED roster order, not the screen\'s', () => {
  const s = ps.setName(ps.initialState(['A', 'B', 'C'], [], [2, 10]), 0, 'Alpha');
  // Another tab removed and re-added A while this screen was open; the rename landed on the moved seat.
  const players = ps.committedPlayers(s, ['B', 'C', 'Alpha']);
  assert.deepEqual(players.map((p) => p.name), ['B', 'C', 'Alpha']);
  assert.deepEqual(players.map((p) => p.mascot), [1, 2, 0], 'each player keeps the mascot it wore on the screen');
  assert.equal(ps.committedPlayers(s, ['B', 'Alpha']), null, 'a seated name missing from the committed roster is refused, never seated short');
});

test('frame 9 after a refused start: the re-read roster carries this screen\'s edits, so both colliding rows show', () => {
  const s = ps.setName(ps.initialState(['A', 'B', 'C'], [], [2, 10]), 0, 'D');
  const again = ps.rebase(s, ['A', 'B', 'C', 'D'], []);
  assert.deepEqual(again.rows.map((r) => r.name), ['D', 'B', 'C', 'D']);
  assert.deepEqual(ps.duplicateRows(again), [0, 3]);
  assert.deepEqual(ps.opsOf(ps.setName(again, 0, 'Dee')), [{ op: 'rename', from: 'A', to: 'Dee' }], 'fixed, the next start sends exactly the edit');
  // An untouched row another tab removed is not brought back; a row this screen added stays an add.
  const added = ps.addRow(ps.initialState(['A', 'B', 'C'], [], [2, 10]));
  const rebased = ps.rebase(added, ['B', 'C'], []);
  assert.deepEqual(rebased.rows.map((r) => r.name), ['B', 'C', MASCOTS[3].name]);
  assert.deepEqual(ps.opsOf(rebased), [{ op: 'add', name: MASCOTS[3].name }]);
});

// gh#264, one-bomb's `{ names }` blob: ten seats, an untouched seat holding its mascot's name, and no
// count stored -- that route read the count off its engine's stepper, which opened at 2 every visit.
test('one-bomb import: typed seats keep their place, untouched seats before them import as their mascot', () => {
  const names = MASCOTS.slice(0, 10).map((m) => m.name);
  names[1] = 'ต้น';
  names[3] = 'มายด์';
  assert.deepEqual(ps.extractOneBombList({ names }), [MASCOTS[0].name, 'ต้น', MASCOTS[2].name, 'มายด์']);
});

test('one-bomb import: an untouched list imports nothing, so the device sees the first-visit stepper', () => {
  assert.deepEqual(ps.extractOneBombList({ names: MASCOTS.slice(0, 10).map((m) => m.name) }), []);
  assert.deepEqual(ps.extractOneBombList({ names: ['', ' ', '\u200b'] }), []);
  assert.deepEqual(ps.extractOneBombList({ names: 'ต้น' }), []);
  assert.deepEqual(ps.extractOneBombList(null), []);
});

test('one-bomb import: one typed seat still imports the two seats the route opened on', () => {
  const names = MASCOTS.slice(0, 10).map((m) => m.name);
  names[0] = 'ต้น';
  assert.deepEqual(ps.extractOneBombList({ names }), ['ต้น', MASCOTS[1].name]);
});

test('one-bomb import: a name is cut to the 12 characters that route allowed, and seats past ten are not read', () => {
  const names = MASCOTS.slice(0, 12).map((m) => m.name);
  names[0] = 'abcdefghijklmnop';
  names[11] = 'ghost';
  assert.deepEqual(ps.extractOneBombList({ names }), ['abcdefghijkl', MASCOTS[1].name]);
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
  assert.ok(board.includes(`${ps.COPY.fullLead}${ps.ROSTER_CEILING}${ps.COPY.fullTail}`), 'roster-full line (frame 10)');
  assert.ok(board.includes(ps.COPY.dupLine), 'duplicate line (frame 9)');
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
  assert.equal(page.part('limit').textContent, `${page.ps.COPY.fullLead}${page.ps.ROSTER_CEILING}${page.ps.COPY.fullTail}`, 'frame 10: the limit line says why');
});

test('frame 10 keeps this screen\'s renames: only the add that no longer fits is dropped', async (t) => {
  const nineteen = Array.from({ length: 19 }, (_, i) => `p${i + 1}`);
  const { page, names } = await savedPage(t, nineteen);
  const f = page.root.querySelectorAll('.ps-n')[0];
  f.value = 'First';
  f.dispatchEvent({ type: 'input' });
  page.part('add').click();
  t.mock.timers.tick(401);
  await page.store.applyRosterOps([{ op: 'add', name: 'otherTab' }], 20);
  page.part('start').click();
  await settle();
  assert.equal(page.calls.started.length, 0);
  assert.equal(page.root.querySelectorAll('.ps-n')[0].value, 'First', 'the rename typed here is still on the screen');
  assert.equal(page.root.querySelectorAll('.ps-p').length, 20);
  t.mock.timers.tick(401);
  page.part('start').click();
  await settle();
  assert.equal(names()[0], 'First', 'and the next start writes it');
});

// ---- frames 9 and 10 and the committed order, on the real screen (REFUTE round 3) ---------------

const rename = (page, i, value) => {
  const f = page.root.querySelectorAll('.ps-n')[i];
  f.value = value;
  f.dispatchEvent({ type: 'input' });
};
const dupRows = (page) => page.root.querySelectorAll('.ps-p').map((li, i) => (/\bps-dup\b/.test(li.className) ? i : -1)).filter((i) => i >= 0);

test('frame 9 on the real screen: typing a name another row shows marks both rows and turns start off at once', async (t) => {
  const { page, names } = await savedPage(t);
  rename(page, 0, 'B');
  assert.deepEqual(dupRows(page), [0, 1]);
  assert.equal(page.part('limit').textContent, page.ps.COPY.dupLine);
  assert.equal(page.part('start').disabled, true);
  page.part('start').click();
  await settle();
  assert.equal(page.calls.started.length, 0, 'the screen never sends a colliding batch');
  assert.deepEqual(names(), ['A', 'B', 'C']);
  rename(page, 0, 'Bee');
  assert.deepEqual(dupRows(page), [], 'fixed: the marks clear');
  assert.equal(page.part('start').disabled, false);
});

test('frame 9 after a refused start: another tab stored the name first -- nothing starts, both rows show, start off', async (t) => {
  const { page, names } = await savedPage(t);
  rename(page, 0, 'D');
  await page.store.applyRosterOps([{ op: 'add', name: 'D' }], 20); // the other tab
  page.part('start').click();
  await settle();
  assert.equal(page.calls.started.length, 0);
  assert.deepEqual(names(), ['A', 'B', 'C', 'D'], 'nothing written, nothing merged');
  assert.deepEqual(page.root.querySelectorAll('.ps-n').map((f) => f.value), ['D', 'B', 'C', 'D']);
  assert.deepEqual(dupRows(page), [0, 3]);
  assert.equal(page.part('limit').textContent, page.ps.COPY.dupLine);
  t.mock.timers.tick(401);
  assert.equal(page.part('start').disabled, true);
  rename(page, 0, 'Dee');
  page.part('start').click();
  await settle();
  assert.deepEqual(page.calls.started[0].map((p) => p.name), ['Dee', 'B', 'C', 'D']);
  assert.deepEqual(names(), ['Dee', 'B', 'C', 'D']);
});

test('P2 round 3 on the real screen: onStart, the roster and the group all carry the COMMITTED order', async (t) => {
  const { page, names } = await savedPage(t);
  rename(page, 0, 'Alpha');
  await page.store.applyRosterOps([{ op: 'remove', name: 'A' }], 20); // another tab moves A to the end
  await page.store.applyRosterOps([{ op: 'add', name: 'A' }], 20);
  page.part('start').click();
  await settle();
  assert.deepEqual(names(), ['B', 'C', 'Alpha']);
  assert.deepEqual(page.calls.started[0].map((p) => p.name), ['B', 'C', 'Alpha']);
  assert.deepEqual(page.store.loadGroup(), ['B', 'C', 'Alpha']);
});

test('a ticked name another tab removed is not seated short: the screen re-reads instead of starting', async (t) => {
  const { page, names } = await savedPage(t);
  await page.store.applyRosterOps([{ op: 'remove', name: 'C' }], 20);
  page.part('start').click();
  await settle();
  assert.equal(page.calls.started.length, 0);
  assert.deepEqual(page.root.querySelectorAll('.ps-n').map((f) => f.value), ['A', 'B'], 'the screen shows the roster as it stands');
  assert.deepEqual(names(), ['A', 'B']);
  t.mock.timers.tick(401);
  page.part('start').click();
  await settle();
  assert.deepEqual(page.calls.started[0].map((p) => p.name), ['A', 'B']);
});

// gh#264: open() is async -- it waits for the legacy-list migration, which takes the roster lock --
// and until it lands the page shows neither this screen nor what it replaces. PENDING_ATTR is the
// page's own statement of that gap, so a reader (the fit probe's fresh read) can wait it out instead
// of reading a page mid-boot as "the screen a device opens on". It is a SEPARATE attribute: SCREEN_ATTR
// keeps its two values because the chrome's edit control and a route stylesheet read them.
const { makePage, installStorage } = await import('./screen-harness.mjs');
const LEGACY_KEY = ps.LEGACY_LISTS[0].key;

/** Mounts the real screen with the hooks these cases need and mountOnPage does not take: a legacy
 *  value present BEFORE mount (so the migration really reaches the lock) and a route onOpen. */
function mountBare({ onOpen, seed = (s) => s.set(LEGACY_KEY, 'not json') } = {}) {
  const storage = installStorage();
  seed(storage); // default: corrupt still goes through the lock, then retires
  const doc = makePage(SURFACE);
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const screen = ps.mountPlayerScreen({
    root: doc.getElementById('root'),
    range: [2, 10],
    onStart() {},
    roundActive: () => false,
    abortRound() {},
    onOpen,
  });
  const html = doc.documentElement;
  return { screen, storage, pending: () => html.hasAttribute(ps.PENDING_ATTR), shown: () => html.getAttribute(ps.SCREEN_ATTR) };
}

/** Node's navigator has no locks; these cases install one they control and put the real one back. */
function withLocks(t, request) {
  const real = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true, writable: true });
  t.after(() => Object.defineProperty(globalThis, 'navigator', { value: real, configurable: true, writable: true }));
}

/** An open that fails still surfaces as an unhandled rejection, exactly as it did before PENDING_ATTR
 *  existed -- the attribute must clear without swallowing it. node:test reds any unhandled rejection,
 *  so the runner's own listeners step aside while the expected one is collected. */
async function collectRejections(fn) {
  const runner = process.listeners('unhandledRejection');
  const seen = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => seen.push(e));
  try {
    await fn();
  } finally {
    // Waited out even when fn threw, so a rejection still in flight is collected here and never
    // lands in the next case's collector.
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.removeAllListeners('unhandledRejection');
    for (const l of runner) process.on('unhandledRejection', l);
  }
  return seen;
}

test('gh#264: open() marks the page pending BEFORE the migration lands and clears it once the screen is open', async (t) => {
  const held = [];
  withLocks(t, (_name, fn) => new Promise((resolve) => { held.push(() => resolve(fn())); }));
  const { screen, pending, shown } = mountBare();
  assert.equal(shown(), 'closed', 'the mount announces a closed screen before anything opens it');
  assert.equal(pending(), false, 'nothing is pending before open() is called');
  screen.open();
  assert.equal(pending(), true, 'open() did not mark the page pending synchronously');
  await settle();
  assert.ok(held.length > 0, 'the migration never reached the lock -- this case is not holding the open');
  assert.equal(pending(), true, 'pending cleared while the migration was still waiting on the lock');
  assert.equal(shown(), 'closed', 'the screen announced itself open before its migration landed');
  // Every request the migrations queued, including any a granted one queues next.
  while (held.length) {
    held.shift()();
    await settle();
  }
  assert.equal(pending(), false, 'the open completed and left the page marked pending');
  assert.equal(shown(), 'open');
});

test('gh#264 REFUTE r1: pending is the page\'s, so it stays until EVERY open in flight has landed', async (t) => {
  const held = [];
  withLocks(t, (_name, fn) => new Promise((resolve) => { held.push(() => resolve(fn())); }));
  const first = mountBare();
  const firstRequests = held.splice(0);
  // A second screen on the same page: its own migration, its own lock requests, one shared <html>.
  const doc = globalThis.document;
  const otherRoot = doc.createElement('section');
  otherRoot.setAttribute('id', 'second-root');
  doc.body.append(otherRoot);
  const second = ps.mountPlayerScreen({ root: otherRoot, range: [2, 10], onStart() {}, roundActive: () => false, abortRound() {} });
  first.screen.open();
  second.open();
  await settle();
  assert.ok(firstRequests.length > 0 && held.length > 0, 'both migrations must be waiting on the lock, or this case holds nothing');
  while (firstRequests.length) {
    firstRequests.shift()();
    await settle();
  }
  assert.equal(otherRoot.hidden, true, 'the second screen opened without its migration -- this case is not holding it');
  assert.equal(first.pending(), true, 'the first open cleared the marker while the second was still waiting');
  while (held.length) {
    held.shift()();
    await settle();
  }
  assert.equal(otherRoot.hidden, false);
  assert.equal(first.pending(), false, 'every open landed and the page is still marked pending');
});

test('gh#264 REFUTE r1: two opens of ONE screen, closed before they land, leave nothing pending', async (t) => {
  const held = [];
  withLocks(t, (_name, fn) => new Promise((resolve) => { held.push(() => resolve(fn())); }));
  const page = mountBare();
  page.screen.open();
  page.screen.open();
  page.screen.close();
  await settle();
  assert.equal(page.pending(), true);
  while (held.length) {
    held.shift()();
    await settle();
  }
  assert.equal(page.pending(), false);
});

test('gh#264: a migration that rejects still clears pending -- no page is left marked mid-open', async (t) => {
  withLocks(t, () => { throw new Error('locks refused'); });
  let page;
  const seen = await collectRejections(async () => {
    page = mountBare();
    page.screen.open();
    assert.equal(page.pending(), true);
    await settle();
  });
  assert.equal(page.pending(), false, 'a rejected migration left the page marked pending forever');
  assert.equal(page.shown(), 'closed', 'a rejected open must not announce the screen open');
  assert.deepEqual(seen.map((e) => e.message), ['locks refused'], 'the failure was swallowed instead of surfacing');
});

test('gh#264 REFUTE r2: open() hands its caller the outcome -- a failed open rejects, so a route can recover', async (t) => {
  withLocks(t, () => { throw new Error('locks refused'); });
  const page = mountBare();
  let caught;
  const seen = await collectRejections(async () => {
    const opening = page.screen.open();
    assert.equal(typeof opening?.then, 'function', 'open() returns nothing: a route cannot tell its screen never came');
    await opening.catch((e) => { caught = e; });
  });
  assert.equal(caught?.message, 'locks refused');
  assert.deepEqual(seen, [], 'a caller that handled the failure still got an unhandled rejection');
});

test('gh#264 REFUTE r2: an open after a FAILED migration runs the migration again instead of reusing the rejection', async (t) => {
  let refuse = true;
  withLocks(t, (_name, fn) => { if (refuse) throw new Error('locks refused'); return Promise.resolve(fn()); });
  const page = mountBare();
  const seen = await collectRejections(async () => {
    page.screen.open();
    await settle();
  });
  assert.deepEqual(seen.map((e) => e.message), ['locks refused'], 'precondition: the first open failed loudly');
  assert.equal(page.shown(), 'closed');
  refuse = false;
  await page.screen.open();
  assert.equal(page.shown(), 'open', 'the retry reused the rejected migration, so the screen can never open on this page');
  assert.equal(page.pending(), false);
});

test('gh#264: an open whose route hook throws still clears pending', async (t) => {
  withLocks(t, (_name, fn) => Promise.resolve(fn()));
  let page;
  const seen = await collectRejections(async () => {
    page = mountBare({ onOpen: () => { throw new Error('route hook broke'); } });
    page.screen.open();
    assert.equal(page.pending(), true, 'open() did not mark the page pending, so its clearing below proves nothing');
    await settle();
  });
  assert.equal(page.pending(), false, 'a throwing onOpen left the page marked pending forever');
  assert.deepEqual(seen.map((e) => e.message), ['route hook broke']);
});

// gh#264: a device with nothing to migrate must open without queueing on the roster lock. Every
// grant waits for a gap between frames, and a software-rendered 3D route starved three of them for
// over 14 seconds. These hold every grant forever: an open that needs one never lands.
const SETTINGS_KEYS = ps.LEGACY_LISTS.filter((l) => l.keep === 'settings').map((l) => l.key);
const neverGrant = (t) => {
  const requests = [];
  withLocks(t, (name) => { requests.push(name); return new Promise(() => {}); });
  return requests;
};
/** Another tab's roster write, through roster.ts's own add(): with no lock to wait on, add() runs
 *  its critical section synchronously, so the names are stored before this returns. */
const writeRosterUnlocked = (names) => {
  const nav = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  try {
    const roster = loadRoster();
    for (const name of names) roster.add(name);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  }
};

const NOTHING_TO_MIGRATE = {
  'empty storage': () => {},
  'a saved roster': () => {
    writeRosterUnlocked(['A', 'B']);
    assert.deepEqual(loadRoster().names(), ['A', 'B'], 'the seed stored no roster, so this case is the empty one');
  },
  'settings blobs with no players field': (s) => {
    for (const key of SETTINGS_KEYS) s.set(key, withoutPlayers(BLOBS[key](['A', 'B'])));
  },
};
for (const [label, seed] of Object.entries(NOTHING_TO_MIGRATE)) {
  test(`gh#264: nothing to migrate (${label}) -- open() takes no lock and lands with every grant withheld`, async (t) => {
    const requests = neverGrant(t);
    const page = mountBare({ seed });
    page.screen.open();
    await settle();
    assert.deepEqual(requests, [], 'the migration queued on the lock with nothing to migrate');
    assert.equal(page.shown(), 'open', 'the open waited on a grant it did not need');
    assert.equal(page.pending(), false);
  });
}

// The outside read only ever authorizes a skip: any value it cannot prove empty goes through the
// lock exactly as before, and the locked re-read decides what happens to it.
for (const raw of ['{not json', '[]', '"players"', JSON.stringify({ players: null, penaltyMode: 'custom' })]) {
  test(`gh#264: a settings value the outside read cannot prove empty (${raw}) still takes the lock`, async (t) => {
    const requests = neverGrant(t);
    const page = mountBare({ seed: (s) => s.set(SETTINGS_KEYS[0], raw) });
    page.screen.open();
    await settle();
    assert.equal(requests.length, 1, 'that value never reached the locked path');
    assert.equal(page.shown(), 'closed');
  });
}

/** Holds every grant until the caller releases them, oldest first. */
const holdGrants = (t) => {
  const held = [];
  withLocks(t, (_name, fn) => new Promise((resolve) => { held.push(() => resolve(fn())); }));
  return async () => {
    while (held.length) {
      held.shift()();
      await settle();
    }
  };
};
const LEGACY_SEEDS = {
  'watduang:timebomb-players': { count: 2, names: ['Tb1', 'Tb2'] },
  'watduang:dice-loser-players': { count: 2, names: ['Dl1', 'Dl2'] },
  'watduang:one-bomb-players': { names: ['Ob1', 'Ob2'] },
  freeze_tap_players: [freezeSeat('Ft1', 0), freezeSeat('Ft2', 1)],
};
const changed = (key, names) => ({ ...BLOBS[key](names), penaltyMode: `changed-${key}` });

test('gh#264: every legacy list seeded, the roster written while the grants are held -- the locked path sees it and imports nothing', async (t) => {
  const grant = holdGrants(t);
  const page = mountBare({
    seed: (s) => {
      for (const [key, value] of Object.entries(LEGACY_SEEDS)) s.set(key, JSON.stringify(value));
      for (const key of SETTINGS_KEYS) s.set(key, JSON.stringify(BLOBS[key](['A', 'B'])));
    },
  });
  assert.deepEqual(ps.LEGACY_LISTS.map((l) => l.key).sort(), [...Object.keys(LEGACY_SEEDS), ...SETTINGS_KEYS].sort(), 'a listed key is not seeded');
  page.screen.open();
  await settle();
  // Another tab, while every grant is held: a roster of its own, and new settings in every blob.
  writeRosterUnlocked(['Other']);
  for (const key of SETTINGS_KEYS) page.storage.set(key, JSON.stringify(changed(key, ['A', 'B'])));
  await grant();
  assert.equal(page.shown(), 'open');
  assert.deepEqual(loadRoster().names(), ['Other'], 'a migration imported over a roster written before its grant');
  for (const key of Object.keys(LEGACY_SEEDS)) assert.equal(page.storage.has(key), false, `${key} was not retired`);
  for (const key of SETTINGS_KEYS) {
    assert.equal(page.storage.get(key), withoutPlayers(changed(key, ['A', 'B'])), `${key}: the newer settings were lost or the players kept`);
  }
});

test('gh#264: a settings blob stripped while the grants are held stays stripped; the next blob imports, every setting kept', async (t) => {
  const grant = holdGrants(t);
  const [first, second, third] = SETTINGS_KEYS;
  const page = mountBare({
    seed: (s) => {
      s.set(first, JSON.stringify(BLOBS[first](['F1', 'F2'])));
      s.set(second, JSON.stringify(BLOBS[second](['S1', 'S2'])));
      s.set(third, JSON.stringify(BLOBS[third](['T1', 'T2'])));
    },
  });
  page.screen.open();
  await settle();
  const strippedFirst = withoutPlayers(changed(first, ['F1', 'F2']));
  page.storage.set(first, strippedFirst);
  page.storage.set(second, JSON.stringify(changed(second, ['S1', 'S2'])));
  page.storage.set(third, JSON.stringify(changed(third, ['T1', 'T2'])));
  await grant();
  assert.equal(page.shown(), 'open');
  assert.deepEqual(loadRoster().names(), ['S1', 'S2'], 'the import did not come from the blob as it stood at the grant');
  assert.equal(page.storage.get(first), strippedFirst, 'a players list stripped before the grant came back');
  assert.equal(page.storage.get(second), withoutPlayers(changed(second, ['S1', 'S2'])));
  assert.equal(page.storage.get(third), withoutPlayers(changed(third, ['T1', 'T2'])));
});

// The fit probe reads these two names off <html> in the browser, where it cannot import this module.
// Pinned here so a rename on either side reds instead of leaving the probe waiting on an attribute
// nothing sets.
test('gh#264: the fit probe waits on the same two attributes this screen writes', async () => {
  const probe = await import('../../../scripts/play-screen-fit-probe.mjs');
  assert.equal(probe.PLAYER_SCREEN_ATTR, ps.SCREEN_ATTR);
  assert.equal(probe.PLAYER_SCREEN_PENDING_ATTR, ps.PENDING_ATTR);
  assert.notEqual(ps.PENDING_ATTR, ps.SCREEN_ATTR);
});

// ---- gh#283: nothing on the screen edits the roster while a start save waits ----------------------
//
// The start takes its player list when it is pressed, and the save it starts waits on the roster
// lock. Anything the screen let a player change inside that wait was either lost (the start already
// took its list) or, for an x, written later by the close the handover makes -- seating a player the
// roster no longer holds. So from the start press until the save settles, every roster edit is inert.

/** A saved roster on the real screen, start pressed, its save held at the lock. `before` runs first,
 *  unlocked: another tab's edit the start then meets. */
async function pendingStart(t, { roster = ['A', 'B', 'C'], before } = {}) {
  const saved = await savedPage(t, roster);
  await before?.(saved.page);
  const held = [];
  withLocks(t, (_name, fn) => new Promise((resolve) => { held.push(() => resolve(fn())); }));
  assert.equal(saved.page.part('start').click(), true, 'start was not live -- this case presses nothing');
  await settle();
  assert.equal(held.length, 1, 'the start save never reached the lock -- this case holds nothing');
  const release = async () => {
    while (held.length) {
      held.shift()();
      await settle();
    }
  };
  return { ...saved, release };
}

test('gh#283: an x pressed while the start save waits -- the round and the saved roster agree on who plays', async (t) => {
  const { page, names, rm, release } = await pendingStart(t);
  rm(2);
  await release();
  assert.equal(page.calls.started.length, 1, 'precondition: the start went through');
  assert.deepEqual(page.calls.started[0].map((p) => p.name), names(), 'the round seated a player the saved roster no longer holds');
});

test('gh#283: every x stays inert while the start save waits -- through a rebuild, its arm window, and a control handed back', async (t) => {
  const { page, names, release } = await pendingStart(t);
  const rms = () => page.root.querySelectorAll('.ps-rm');
  assert.deepEqual(rms().map((b) => b.disabled), [true, true, true], 'the start press left an x live');
  // A route reopening the screen rebuilds every row, and the reopen's own window then hands back
  // every control it collected.
  page.screen.open();
  await settle();
  t.mock.timers.tick(401);
  assert.equal(rms().length, 3, 'precondition: the reopen rebuilt the rows');
  assert.deepEqual(rms().map((b) => b.disabled), [true, true, true], 'a rebuilt x came back live after its arm window while the start save waits');
  // Another gate whose window ends hands the control back enabled (the arm gate's stated ceiling).
  const rm = rms()[0];
  rm.disabled = false;
  rm.click();
  assert.equal(page.part('toast').hidden, true, 'an x handed back live removed a player while the start save waits');
  assert.equal(page.root.querySelectorAll('.ps-p').length, 3);
  await release();
  assert.deepEqual(page.calls.started[0].map((p) => p.name), ['A', 'B', 'C']);
  assert.deepEqual(names(), ['A', 'B', 'C']);
});

test('gh#283: tick, rename and add are inert while the start save waits', async (t) => {
  const { page, names, release } = await pendingStart(t);
  const tick = page.root.querySelectorAll('.ps-tick')[0];
  const label = tick.getAttribute('aria-label');
  assert.equal(tick.disabled, true, 'a tick stayed live while the start save waits');
  tick.disabled = false;
  tick.click();
  assert.equal(page.root.querySelectorAll('.ps-tick')[0].getAttribute('aria-pressed'), 'true', 'a tick toggled while the start save waits');
  const field = page.root.querySelector('.ps-n');
  assert.equal(field.readOnly, true, 'a name field took typing while the start save waits');
  field.value = 'Zed';
  field.dispatchEvent({ type: 'input' });
  assert.equal(tick.getAttribute('aria-label'), label, 'a rename reached the screen while the start save waits');
  const add = page.part('add');
  assert.equal(add.disabled, true, 'the add row stayed live while the start save waits');
  add.disabled = false;
  add.click();
  assert.equal(page.root.querySelectorAll('.ps-p').length, 3, 'a row was added while the start save waits');
  await release();
  assert.deepEqual(names(), ['A', 'B', 'C']);
  assert.deepEqual(page.calls.started[0].map((p) => p.name), names());
});

test('gh#283: on a first visit the steppers and the reset are inert while the start save waits', async (t) => {
  const { page, names, release } = await pendingStart(t, {
    roster: [],
    before: (p) => {
      const f = p.root.querySelector('.ps-n');
      f.value = 'Typed';
      f.dispatchEvent({ type: 'input' });
    },
  });
  const count = page.part('count-num').textContent;
  for (const name of ['inc', 'dec']) {
    const b = page.part(name);
    assert.equal(b.disabled, true, `the ${name} stepper stayed live while the start save waits`);
    b.disabled = false;
    b.click();
    assert.equal(page.part('count-num').textContent, count, `the ${name} stepper moved the seat count while the start save waits`);
  }
  page.part('reset').click();
  assert.equal(page.byId('ps-reset-dialog').open, false, 'the reset confirm opened while the start save waits');
  page.byId('ps-reset-confirm').click();
  assert.equal(page.root.querySelector('.ps-n').value, 'Typed', 'the reset wiped a typed name while the start save waits');
  await release();
  assert.equal(page.calls.started[0][0].name, 'Typed');
  assert.deepEqual(page.calls.started[0].map((p) => p.name), names());
});

test('gh#283: a start the roster refuses lifts the freeze -- the x is live again once the window passes', async (t) => {
  const { page, names, rm, release } = await pendingStart(t, {
    before: (p) => p.store.applyRosterOps([{ op: 'remove', name: 'C' }], 20), // another tab
  });
  await release();
  assert.equal(page.calls.started.length, 0, 'precondition: the start was refused');
  t.mock.timers.tick(401);
  rm(0);
  assert.equal(page.part('toast').hidden, false, 'the x stayed inert after the refused start');
  assert.deepEqual(page.root.querySelectorAll('.ps-n').map((f) => f.value), ['B']);
  assert.deepEqual(names(), ['A', 'B'], 'inside the four seconds nothing is final');
});

// ---- a refused start keeps the pending x undoable (ADR-0071 ruling 3) -----------------------------
//
// The press hides the undo bar because its removal rides in the start's write. A refusal writes
// nothing, and rebase keeps that removal pending -- so the bar comes back with its four seconds, as a
// reveal that arms (ADR-0057). Without it, a later close made the removal final with no undo shown.

/** x on C, A renamed to Alpha, then another tab stores Alpha: the start is refused for a collision. */
async function refusedWithPendingX(t) {
  const saved = await savedPage(t);
  const { page } = saved;
  saved.rm(2);
  t.mock.timers.tick(401);
  rename(page, 0, 'Alpha');
  await page.store.applyRosterOps([{ op: 'add', name: 'Alpha' }], 20); // the other tab
  assert.equal(page.part('start').click(), true, 'start was not live -- this case presses nothing');
  await settle();
  assert.equal(page.calls.started.length, 0, 'precondition: the start was refused');
  assert.deepEqual(saved.names(), ['A', 'B', 'C', 'Alpha'], 'precondition: the refusal wrote nothing');
  return saved;
}

test('a refused start shows the undo bar again for the removal it keeps pending -- armed, and undo still works', async (t) => {
  const { page, names } = await refusedWithPendingX(t);
  assert.equal(page.part('toast').hidden, false, 'the refusal kept C\'s removal pending with no undo bar to take it back');
  assert.equal(page.part('toast-text').textContent, 'เอา C ออกจากวงแล้ว');
  assert.equal(page.part('undo').disabled, true, 'the bar came back unarmed');
  t.mock.timers.tick(401);
  assert.equal(page.part('undo').click(), true, 'the undo never came live');
  assert.equal(page.part('toast').hidden, true);
  page.screen.close();
  await settle();
  assert.deepEqual(names(), ['A', 'B', 'C', 'Alpha'], 'the close removed a player the undo took back');
});

test('a refused start gives the kept removal its own four seconds, then makes it final', async (t) => {
  const { page, names } = await refusedWithPendingX(t);
  t.mock.timers.tick(page.ps.UNDO_MS - 1);
  await settle();
  assert.equal(page.part('toast').hidden, false, 'the undo bar was not up for its four seconds');
  assert.deepEqual(names(), ['A', 'B', 'C', 'Alpha'], 'inside the four seconds nothing is final');
  t.mock.timers.tick(1);
  await settle();
  assert.equal(page.part('toast').hidden, true, 'the bar outlived its four seconds');
  assert.deepEqual(names(), ['A', 'B', 'Alpha'], 'the bar ran out and the removal was never written');
});
