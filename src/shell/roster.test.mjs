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
