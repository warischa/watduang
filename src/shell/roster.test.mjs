// node --test — no framework, no dependency.
// localStorage does not exist in Node, so stub it with what the real one is: a string→string map.
// That map is also the point of this file: localStorage is shared across every tab on the domain, so
// two loadRoster() closures over one map ARE two tabs, with no browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const slots = new Map();
// Quota full and old-Safari private mode both throw here — the one failure roster.ts:24 promises to survive.
let writesFail = false;
globalThis.localStorage = {
  getItem: (k) => (slots.has(k) ? slots.get(k) : null),
  setItem: (k, v) => {
    if (writesFail) throw new Error('QuotaExceededError');
    slots.set(k, String(v));
  },
  removeItem: (k) => slots.delete(k),
};

// Mirrors roster.ts's own KEY. Only the two lock tests use it, to plant a write "another tab already
// finished" without going through a second loadRoster() closure that would queue on the same lock.
const KEY = 'watduang:roster';

// Node 22 defines a `navigator` global (userAgent, platform…) with NO `locks`, and it is a getter —
// a plain assignment is a silent no-op here and throws in strict mode, so swap it by defineProperty.
// Every test that does not call this runs the no-locks fallback path, which is asserted below.
function setLocks(locks) {
  Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true, writable: true });
}
const realNavigator = globalThis.navigator;
function restoreNavigator() {
  Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true, writable: true });
}

const { loadRoster, loadGroup, saveGroup } = await import('./roster.ts');
// Imported after the stub for the same reason roster.ts is: both reach localStorage through the
// module graph, and a static import would run before the map above exists.
const { hasVisibleChar } = await import('../tools/name-list.ts');
const { defaultPlayers } = await import('./player-select.ts');

// Lost update across tabs. loadRoster() captured the list at load and add() wrote that whole captured
// array back, so the later writer erased the earlier one's name. The interleave is the ordinary one:
// both tabs are open, each loads, then each adds.
test('#data-loss two tabs adding a name: the interleave read-A, read-B, add-B, add-A keeps both names', async () => {
  slots.clear();
  saveGroup([]);
  const tabA = loadRoster(); // both tabs load while the roster is empty
  const tabB = loadRoster();

  await tabB.add('บี');
  await tabA.add('เอ'); // writes last — must not write its own stale [] back over \u0e1a\u0e35

  assert.deepEqual(loadRoster().names().sort(), ['บี', 'เอ'].sort(), 'both names must survive the interleave');
});

// Second hop, and the harm a player actually sees: loadGroup() filters the saved group by the roster,
// so a name dropped from the roster silently un-ticks itself next visit.
test('#data-loss the pre-ticked group survives the same interleave — loadGroup filters by roster names', async () => {
  slots.clear();
  const tabA = loadRoster();
  const tabB = loadRoster();

  await tabB.add('บี');
  saveGroup(['บี']); // tab B ticked its new name and started a round
  await tabA.add('เอ');

  assert.deepEqual(loadGroup(), ['บี'], 'the group must not shrink because another tab wrote later');
});

// Calibrates the fix both ways: it must not turn a duplicate into a second entry, and the writer must
// still see whatever the other tab added.
test('adding a name another tab already added stays a no-op, and the stale closure adopts it', async () => {
  slots.clear();
  const tabA = loadRoster();
  await loadRoster().add('เอ');

  await tabA.add('เอ');
  assert.deepEqual(loadRoster().names(), ['เอ'], 'no duplicate');
  assert.deepEqual(tabA.names(), ['เอ'], 'the stale closure caught up on the name it tried to add');
});

// write() swallows a failed setItem on purpose (roster.ts:24) — the page keeps going in memory. The
// re-read at the write must not cash that promise in: storage is still empty after the failure, so a
// list that simply adopts storage drops every name typed since. The player sees the name vanish from the
// roster while its tick is still in `selected`, which is the loss this whole file exists to stop.
test('#data-loss writes failing silently: a later add must not erase the names added before the failure', async () => {
  slots.clear();
  const roster = loadRoster();
  writesFail = true;
  await roster.add('กบ'); // write fails, silently — \u0e01\u0e1a lives in memory only
  await roster.add('แนน'); // re-reads an EMPTY storage — must union with memory, not replace it
  writesFail = false;
  assert.deepEqual(roster.names(), ['กบ', 'แนน'], 'names() is what the panel renders — both must be in it');
});

// Both directions at once: the degraded page must keep its own names AND still pick up the other tab's.
test('#data-loss a failed write does not cost the other tab either — memory and storage union, order kept', async () => {
  slots.clear();
  const roster = loadRoster();
  writesFail = true;
  await roster.add('กบ');
  writesFail = false;
  await loadRoster().add('บี'); // another tab, writing successfully
  await roster.add('แนน');
  assert.deepEqual(roster.names(), ['กบ', 'บี', 'แนน'], 'this tab first, in typing order, then what it caught up on');
});

// Negative control: with one tab only, add() behaves exactly as it always did.
test('negative control: a single tab adding two names in order is unchanged', async () => {
  slots.clear();
  const roster = loadRoster();
  await roster.add('เอ');
  await roster.add('บี');
  await roster.add('  '); // blank is still refused
  assert.deepEqual(roster.names(), ['เอ', 'บี']);
  assert.deepEqual(loadRoster().names(), ['เอ', 'บี']);
});

// ---- Web Locks ----------------------------------------------------------------------------------
// What these can and cannot show: no unit test can prove the cross-tab fix, because the interleaving
// belongs to the browser scheduler and two Node closures never run at the same instant (ADR-0009, and
// docs/verification/evidence/34/08-roster-race-two-tab.json is where the real two-tab drive lives).
// What they DO pin is everything under this file's control: that the lock is asked for, that the
// re-read sits inside the critical section rather than before it, and that both no-lock environments
// still store the name instead of throwing.

// Calibrates every other test in this file: they never call setLocks, so they are all running the
// fallback branch. If Node ever ships navigator.locks this assertion fires and says so.
test('the Node runner has no navigator.locks — every test above exercises the fallback path', () => {
  assert.equal(typeof globalThis.navigator?.locks, 'undefined');
});

// The load-bearing one. The lock is granted a microtask late, so a write from another tab can land in
// the gap between add() being called and its critical section running. Whether that name survives is
// exactly the question "is the re-read inside the lock": inside, it is seen and unioned; outside (a lock
// wrapped around the write alone, which is the plausible wrong fix) the stale [] is written back over it.
test('#data-loss the re-read is inside the critical section — a write landing before the grant is not clobbered', async () => {
  slots.clear();
  const asked = [];
  setLocks({
    request: async (name, fn) => {
      asked.push(name);
      await Promise.resolve(); // grant late, the way a lock held by another tab does
      return fn();
    },
  });
  try {
    const tabA = loadRoster(); // captures an empty list at load
    const pending = tabA.add('เอ'); // queued on the lock — its critical section has NOT run yet
    slots.set(KEY, JSON.stringify(['บี'])); // another tab finished its own add in the meantime
    await pending;

    assert.deepEqual(asked, ['watduang:roster'], 'add() must take the shared lock, once');
    assert.deepEqual(loadRoster().names(), ['บี', 'เอ'], 'the name written during the wait must survive');
  } finally {
    restoreNavigator();
  }
});

// request() rejects on an opaque origin (sandboxed iframe, file://) — a real browser case, not a Node
// one. The name must still be stored: a rejected lock that swallowed the write would look exactly like
// a working fix while losing every name, and the await in PlayerSetup would reject on top of it.
test('a lock request that rejects still stores the name, and add() does not reject', async () => {
  slots.clear();
  setLocks({ request: () => Promise.reject(new DOMException('opaque origin', 'SecurityError')) });
  try {
    await loadRoster().add('เอ');
    assert.deepEqual(loadRoster().names(), ['เอ'], 'the fallback runs the write the lock never granted');
  } finally {
    restoreNavigator();
  }
});

// ---- gh#51 F4, closed as won't-fix, and this test is the record of why. saveGroup() overwrites
// watduang:group wholesale with no lock, no re-read and no CAS while add() in this same file has both,
// but the two keys do not carry the same semantics. add() is a read-modify-write over a list every tab
// appends to, and the name it used to drop was one nobody removed. The group is the set the player
// ticked on THIS page — PlayerSetup unticks by selected.delete(name) — so unioning it with the stored
// group would resurrect a name the player had just removed: the ghost tick loadGroup()'s own filter
// exists to prevent, and a wrong group actually played is a worse loss than a prefill the player
// re-ticks. A lock alone buys nothing here either: there is no read to protect inside it, and one
// setItem of the whole value cannot interleave. This test fails if saveGroup ever starts merging.
test('gh#51 F4: saveGroup replaces the group wholesale — an untick must never come back as a ghost tick', async () => {
  slots.clear();
  const roster = loadRoster();
  await roster.add('เอ');
  await roster.add('บี');
  saveGroup(['เอ', 'บี']); // the last round played with both, and both are still in the roster
  assert.deepEqual(loadGroup(), ['เอ', 'บี'], 'positive control: the stored group really did hold both names');

  saveGroup(['เอ']); // this round: the player unticked the second name on this page
  assert.deepEqual(loadGroup(), ['เอ'], 'a merge with the stored group resurrected the unticked name');
});

// gh#133 — a name with no visible character is not a name. trim() strips U+FEFF and U+00A0 but NOT
// U+200B ZERO WIDTH SPACE or U+2060 WORD JOINER, so a name pasted out of a chat app became a roster
// row that renders as nothing, cannot be told apart from the next blank one, and — there being no
// remove-a-name control — could never be got rid of. Every invisible character below is written as a
// \uXXXX escape, never as a literal: a literal is invisible in the diff and dies to any whitespace
// cleaner.
test('#133 a name with no visible character never becomes a player', async () => {
  slots.clear();
  const roster = loadRoster();
  // The divergence input: trim() leaves every one of these standing, so the pre-fix guard stored them.
  for (const blank of ['\u200B', '\u2060', '\u200B\u200B\u2060', ' \u200B ', '\uFEFF', '\u00A0', '\u200E', '\u00AD', '', '   ']) {
    await roster.add(blank);
  }
  assert.deepEqual(roster.names(), [], 'nothing that renders as nothing was stored');
  assert.equal(slots.has(KEY), false, 'and storage was never written at all');

  // The other half, and the one that matters more: Thai "สระ" and "วรรณยุกต์" are nonspacing marks and
  // must still store, or the guard silently blocks real players.
  for (const name of ['สมชาย', 'น้ำ', 'ปุ๊กกี้', 'Beam', '7', 'ก\u200B']) {
    await roster.add(name);
  }
  assert.deepEqual(roster.names(), ['สมชาย', 'น้ำ', 'ปุ๊กกี้', 'Beam', '7', 'ก\u200B'], 'every ordinary name still stores');
});

test('#133 a blank already in storage is dropped when the roster and the group are read', () => {
  slots.clear();
  slots.set(KEY, JSON.stringify(['บีม', '\u200B', 'น้ำ', '\u2060']));
  saveGroup(['บีม', '\u200B']); // saveGroup stores raw by design, so this is a blank genuinely persisted
  assert.deepEqual(loadRoster().names(), ['บีม', 'น้ำ'], 'the stored blank is gone from the roster');
  assert.deepEqual(loadGroup(), ['บีม'], 'and gone from the saved group');
});

// gh#140 — the identity a fresh device starts with is a mascot label, icon included, and the roster
// is the channel it has to survive. Round trip, not a read of the code: store the whole default cast,
// re-read it through a second loadRoster(), and require identity.
test('gh#140 the default players round-trip through the roster unchanged, icons included', async () => {
  slots.clear();
  const defaults = defaultPlayers(10, 2, 10);
  const roster = loadRoster();
  for (const label of defaults) await roster.add(label);

  assert.deepEqual(loadRoster().names(), defaults, 'serialize then deserialize is identity');
  assert.deepEqual(JSON.parse(slots.get(KEY)), defaults, 'and what sits in storage is the same again');
  saveGroup(defaults);
  assert.deepEqual(loadGroup(), defaults, 'the saved group survives too, so nothing un-ticks itself');
  // The icon specifically: deepEqual above would still pass if every label had lost its emoji on both
  // sides of the trip, because both sides come from the same source.
  assert.equal(
    defaults.every((label) => /^\p{Extended_Pictographic}/u.test(label)),
    true,
    'every stored label still opens with its icon',
  );
});

// gh#140 — an emoji is a surrogate pair, and \ud83d\udc3f\ufe0f carries a U+FE0F variation selector, which is
// Cf: exactly the category the predicate drops. If the pair were tested alone the label would still
// pass on its Thai half, so both halves are asserted separately.
test('gh#140 every default label, and every icon alone, survives hasVisibleChar', () => {
  const labels = defaultPlayers(20, 1, 20);
  assert.equal(labels.length, 20, 'the whole cast is under test, not a sample');
  for (const label of labels) {
    assert.equal(hasVisibleChar(label), true, `label must be storable: ${label}`);
    const [icon, ...rest] = label.split(' ');
    assert.equal(hasVisibleChar(icon), true, `icon alone must be visible: ${icon}`);
    assert.equal(hasVisibleChar(rest.join(' ')), true, `name alone must be visible: ${rest.join(' ')}`);
  }
});

// ADR-0071: the shared player screen writes the roster as an operation set, applied under the lock
// to the roster as it stands at write time (gh#264 REFUTE findings 2 and 4).
const { applyRosterOps, migrateLegacyList } = await import('./roster.ts');
const seed = async (names) => {
  slots.clear();
  await applyRosterOps(names.map((name) => ({ op: 'add', name })), 20);
};

test('ADR-0071 ops: remove, rename in place and add, in one batch', async () => {
  await seed(['เอ', 'บี', 'ซี', 'ดี']);
  await applyRosterOps([{ op: 'remove', name: 'บี' }, { op: 'rename', from: 'ซี', to: 'ซีซี' }, { op: 'add', name: 'อี' }], 20);
  assert.deepEqual(loadRoster().names(), ['เอ', 'ซีซี', 'ดี', 'อี']);
});

test('ADR-0071 ops: a stale screen that changed nothing does not resurrect a name another tab removed', async () => {
  await seed(['A', 'B', 'C']);
  await applyRosterOps([{ op: 'remove', name: 'A' }], 20); // tab A removes A
  await applyRosterOps([], 20); // tab B opened before that, changed nothing, pressed start
  assert.deepEqual(loadRoster().names(), ['B', 'C']);
});

test('ADR-0071 ops: two screens renaming two different names both land, each in its own seat', async () => {
  await seed(['A', 'B', 'C']);
  await applyRosterOps([{ op: 'rename', from: 'A', to: 'Alpha' }], 20);
  await applyRosterOps([{ op: 'rename', from: 'B', to: 'Beta' }], 20);
  assert.deepEqual(loadRoster().names(), ['Alpha', 'Beta', 'C']);
});

test('ADR-0071 ops: two legal 19 -> 20 adds race; the second is REFUSED and reported, nothing is stored past 20', async () => {
  const nineteen = Array.from({ length: 19 }, (_, i) => `p${i + 1}`);
  await seed(nineteen);
  assert.deepEqual(await applyRosterOps([{ op: 'add', name: 'tabA' }], 20), { status: 'ok', roster: [...nineteen, 'tabA'] });
  assert.deepEqual(await applyRosterOps([{ op: 'add', name: 'tabB' }], 20), { status: 'ceiling', roster: [...nineteen, 'tabA'], refused: ['tabB'] });
  const stored = loadRoster().names();
  assert.equal(stored.length, 20);
  assert.ok(stored.includes('tabA'), 'the first legal addition is kept');
  // And a later batch from a screen that saw 20 cannot clip anyone: it has nothing to add.
  await applyRosterOps([], 20);
  assert.ok(loadRoster().names().includes('tabA'));
});

test('ADR-0071 ops: a removal in the same batch frees the seat an add needs', async () => {
  await seed(Array.from({ length: 20 }, (_, i) => `p${i + 1}`));
  assert.equal((await applyRosterOps([{ op: 'add', name: 'new' }, { op: 'remove', name: 'p1' }], 20)).status, 'ok');
  assert.equal(loadRoster().names().at(-1), 'new');
});

test('ADR-0071 ops: a rename whose old name another tab removed lands as an add; a rename onto an existing name is a COLLISION', async () => {
  await seed(['A', 'B']);
  await applyRosterOps([{ op: 'remove', name: 'A' }], 20);
  await applyRosterOps([{ op: 'rename', from: 'A', to: 'Alpha' }], 20);
  assert.deepEqual(loadRoster().names(), ['B', 'Alpha']);
  const result = await applyRosterOps([{ op: 'rename', from: 'Alpha', to: 'B' }], 20);
  assert.deepEqual(result, { status: 'collision', roster: ['B', 'Alpha'], names: ['B'] });
  assert.deepEqual(loadRoster().names(), ['B', 'Alpha'], 'two rows with one name are never merged silently');
});

// gh#264 REFUTE round 3: a refusal used to keep every edit before the refused add -- the API was
// partial. A refused batch now writes NOTHING, and says why.
const countWrites = async (fn) => {
  let writes = 0;
  const real = localStorage.setItem;
  localStorage.setItem = (k, v) => { writes += 1; real(k, v); };
  try {
    return { result: await fn(), writes: () => writes };
  } finally {
    localStorage.setItem = real;
  }
};

test('ADR-0071 ops: a batch refused at the ceiling is ATOMIC -- its renames, removes and earlier adds are not written either', async () => {
  await seed(['A', 'B', 'C']);
  const { result, writes } = await countWrites(() => applyRosterOps(
    [{ op: 'rename', from: 'A', to: 'Alpha' }, { op: 'remove', name: 'C' }, { op: 'add', name: 'D' }, { op: 'add', name: 'E' }], 3));
  assert.deepEqual(result, { status: 'ceiling', roster: ['A', 'B', 'C'], refused: ['E'] });
  assert.equal(writes(), 0, 'no storage write at all');
  assert.deepEqual(loadRoster().names(), ['A', 'B', 'C']);
});

test('ADR-0071 ops: a rename onto a name ANOTHER TAB added is a collision -- reported, nothing written', async () => {
  await seed(['A', 'B', 'C']);
  await applyRosterOps([{ op: 'add', name: 'D' }], 20); // the other tab, while this screen was open
  const { result, writes } = await countWrites(() => applyRosterOps(
    [{ op: 'rename', from: 'A', to: 'D' }, { op: 'rename', from: 'B', to: 'Beta' }], 20));
  assert.deepEqual(result, { status: 'collision', roster: ['A', 'B', 'C', 'D'], names: ['D'] });
  assert.equal(writes(), 0);
  assert.deepEqual(loadRoster().names(), ['A', 'B', 'C', 'D'], 'the other rename does not land alone either');
});

test('ADR-0071 ops: an add onto a stored name, or two adds of one name, is a collision', async () => {
  await seed(['A', 'B']);
  assert.deepEqual(await applyRosterOps([{ op: 'add', name: ' B ' }], 20), { status: 'collision', roster: ['A', 'B'], names: ['B'] });
  assert.deepEqual(await applyRosterOps([{ op: 'add', name: 'C' }, { op: 'add', name: 'C' }], 20), { status: 'collision', roster: ['A', 'B'], names: ['C'] });
  assert.deepEqual(loadRoster().names(), ['A', 'B']);
});

test('ADR-0071 ops: a collision outranks the ceiling -- the name is what the players can fix in place', async () => {
  await seed(['A', 'B']);
  const result = await applyRosterOps([{ op: 'add', name: 'B' }, { op: 'add', name: 'C' }], 2);
  assert.equal(result.status, 'collision');
});

// gh#264 REFUTE round 2: the renames of one batch are ONE simultaneous mapping, never a sequence.
test('ADR-0071 ops: a rename chain A->B, B->Z keeps every player, each in its own seat', async () => {
  await seed(['A', 'B', 'C']);
  await applyRosterOps([{ op: 'rename', from: 'A', to: 'B' }, { op: 'rename', from: 'B', to: 'Z' }], 20);
  assert.deepEqual(loadRoster().names(), ['B', 'Z', 'C']);
  // Order of the ops inside the batch must not matter either.
  await seed(['A', 'B', 'C']);
  await applyRosterOps([{ op: 'rename', from: 'B', to: 'Z' }, { op: 'rename', from: 'A', to: 'B' }], 20);
  assert.deepEqual(loadRoster().names(), ['B', 'Z', 'C']);
});

test('ADR-0071 ops: a swap A<->B keeps both rows, swapped in place', async () => {
  await seed(['A', 'B', 'C']);
  await applyRosterOps([{ op: 'rename', from: 'A', to: 'B' }, { op: 'rename', from: 'B', to: 'A' }], 20);
  assert.deepEqual(loadRoster().names(), ['B', 'A', 'C']);
});

test('ADR-0071 ops: a rename onto a name another seat still shows is a collision, whichever seat moves', async () => {
  await seed(['A', 'B', 'C']);
  const later = await applyRosterOps([{ op: 'rename', from: 'C', to: 'A' }], 20); // the later seat takes an earlier name
  assert.deepEqual(later, { status: 'collision', roster: ['A', 'B', 'C'], names: ['A'] });
  const earlier = await applyRosterOps([{ op: 'rename', from: 'A', to: 'C' }], 20); // the earlier seat takes a later name
  assert.deepEqual(earlier, { status: 'collision', roster: ['A', 'B', 'C'], names: ['C'] });
  assert.deepEqual(loadRoster().names(), ['A', 'B', 'C'], 'nobody merged, nobody lost');
});

test('ADR-0071 ops: blank adds are dropped before writing', async () => {
  await seed([]);
  await applyRosterOps(['เอ', '  ', '\u200b', 'บี'].map((name) => ({ op: 'add', name })), 20);
  assert.deepEqual(loadRoster().names(), ['เอ', 'บี']);
});

const LEGACY = 'watduang:test-legacy-players';

test('ADR-0071 migrateLegacyList: an EMPTY roster imports the legacy names, then the key is gone', async () => {
  slots.clear();
  slots.set(LEGACY, JSON.stringify({ names: ['ต้น', 'มายด์'] }));
  await migrateLegacyList(LEGACY, (v) => v.names);
  assert.deepEqual(loadRoster().names(), ['ต้น', 'มายด์']);
  assert.equal(slots.has(LEGACY), false);
});

test('ADR-0071 migrateLegacyList: a NON-EMPTY roster wins, the legacy key is deleted unread', async () => {
  slots.clear();
  await loadRoster().add('แนน');
  slots.set(LEGACY, JSON.stringify({ names: ['ต้น', 'มายด์'] }));
  await migrateLegacyList(LEGACY, (v) => v.names);
  assert.deepEqual(loadRoster().names(), ['แนน']);
  assert.equal(slots.has(LEGACY), false);
});

test('ADR-0071 migrateLegacyList: idempotent -- a second call with the key gone changes nothing', async () => {
  slots.clear();
  slots.set(LEGACY, JSON.stringify({ names: ['ต้น'] }));
  await migrateLegacyList(LEGACY, (v) => v.names);
  await applyRosterOps([{ op: 'add', name: 'บอส' }], 20);
  await migrateLegacyList(LEGACY, (v) => v.names);
  assert.deepEqual(loadRoster().names(), ['ต้น', 'บอส']);
});

test('ADR-0071 migrateLegacyList: a write that does not land keeps the legacy key for the next visit', async () => {
  slots.clear();
  slots.set(LEGACY, JSON.stringify({ names: ['ต้น'] }));
  writesFail = true;
  try {
    await migrateLegacyList(LEGACY, (v) => v.names);
  } finally {
    writesFail = false;
  }
  assert.equal(slots.has(LEGACY), true);
});

// gh#264 REFUTE round 5: `keep: 'settings'` blobs are rewritten by the ROUTE too, and the route
// carries an existing `players` field through so a failed import can retry. A route save that read
// the blob before a migration and wrote after it puts the retired players back; without a record
// that this key was already retired, the next mount imports them again.
const SETTINGS = 'watduang:test-legacy-settings';
const extractPlayers = (v) => v.players;
const blobWith = (players) => JSON.stringify({ players, mode: 'preset' });

test('ADR-0071 keep-settings: a stale route save after a migration does not bring retired players back', async () => {
  slots.clear();
  slots.set(SETTINGS, blobWith(['Alice', 'Bob']));
  await migrateLegacyList(SETTINGS, extractPlayers, 'settings');
  assert.deepEqual(loadRoster().names(), ['Alice', 'Bob']);
  slots.set(SETTINGS, blobWith(['Alice', 'Bob'])); // the stale write: read before the import, landed after it
  await applyRosterOps([{ op: 'remove', name: 'Alice' }, { op: 'remove', name: 'Bob' }], 20);
  await migrateLegacyList(SETTINGS, extractPlayers, 'settings');
  assert.deepEqual(loadRoster().names(), [], 'players the roster already retired were imported a second time');
  assert.deepEqual(JSON.parse(slots.get(SETTINGS)), { mode: 'preset' }, 'the stale players field must be stripped, settings kept');
});

test('ADR-0071 keep-settings: players dropped under a non-empty roster stay dropped after a stale route save', async () => {
  await seed(['แนน']);
  slots.set(SETTINGS, blobWith(['Alice', 'Bob']));
  await migrateLegacyList(SETTINGS, extractPlayers, 'settings');
  assert.deepEqual(loadRoster().names(), ['แนน']);
  slots.set(SETTINGS, blobWith(['Alice', 'Bob']));
  await applyRosterOps([{ op: 'remove', name: 'แนน' }], 20);
  await migrateLegacyList(SETTINGS, extractPlayers, 'settings');
  assert.deepEqual(loadRoster().names(), [], 'players the roster never took were imported into the emptied roster');
});

test('ADR-0071 keep-settings: a failed import records nothing, keeps the players, and a later mount imports them', async () => {
  slots.clear();
  slots.set(SETTINGS, blobWith(['Alice', 'Bob']));
  // Quota that refuses only the roster write: a small record written elsewhere would still land, so
  // a record written before the import proved durable is visible here, not hidden by a blanket throw.
  const real = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (k, v) => {
    if (k === KEY) throw new Error('QuotaExceededError');
    real(k, v);
  };
  try {
    await migrateLegacyList(SETTINGS, extractPlayers, 'settings');
  } finally {
    globalThis.localStorage.setItem = real;
  }
  assert.deepEqual([...slots.keys()], [SETTINGS], 'a failed import wrote something besides the blob it must keep whole');
  assert.deepEqual(JSON.parse(slots.get(SETTINGS)).players, ['Alice', 'Bob']);
  await migrateLegacyList(SETTINGS, extractPlayers, 'settings');
  assert.deepEqual(loadRoster().names(), ['Alice', 'Bob'], 'the retry after a failed import did not import');
  assert.deepEqual(JSON.parse(slots.get(SETTINGS)), { mode: 'preset' });
});
