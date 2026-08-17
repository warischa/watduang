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

const { loadRoster, loadGroup, saveGroup } = await import('./roster.ts');

// Lost update across tabs. loadRoster() captured the list at load and add() wrote that whole captured
// array back, so the later writer erased the earlier one's name. The interleave is the ordinary one:
// both tabs are open, each loads, then each adds.
test('#data-loss two tabs adding a name: the interleave read-A, read-B, add-B, add-A keeps both names', () => {
  slots.clear();
  saveGroup([]);
  const tabA = loadRoster(); // both tabs load while the roster is empty
  const tabB = loadRoster();

  tabB.add('บี');
  tabA.add('เอ'); // writes last — must not write its own stale [] back over \u0e1a\u0e35

  assert.deepEqual(loadRoster().names().sort(), ['บี', 'เอ'].sort(), 'both names must survive the interleave');
});

// Second hop, and the harm a player actually sees: loadGroup() filters the saved group by the roster,
// so a name dropped from the roster silently un-ticks itself next visit.
test('#data-loss the pre-ticked group survives the same interleave — loadGroup filters by roster names', () => {
  slots.clear();
  const tabA = loadRoster();
  const tabB = loadRoster();

  tabB.add('บี');
  saveGroup(['บี']); // tab B ticked its new name and started a round
  tabA.add('เอ');

  assert.deepEqual(loadGroup(), ['บี'], 'the group must not shrink because another tab wrote later');
});

// Calibrates the fix both ways: it must not turn a duplicate into a second entry, and the writer must
// still see whatever the other tab added.
test('adding a name another tab already added stays a no-op, and the stale closure adopts it', () => {
  slots.clear();
  const tabA = loadRoster();
  loadRoster().add('เอ');

  tabA.add('เอ');
  assert.deepEqual(loadRoster().names(), ['เอ'], 'no duplicate');
  assert.deepEqual(tabA.names(), ['เอ'], 'the stale closure caught up on the name it tried to add');
});

// write() swallows a failed setItem on purpose (roster.ts:24) — the page keeps going in memory. The
// re-read at the write must not cash that promise in: storage is still empty after the failure, so a
// list that simply adopts storage drops every name typed since. The player sees the name vanish from the
// roster while its tick is still in `selected`, which is the loss this whole file exists to stop.
test('#data-loss writes failing silently: a later add must not erase the names added before the failure', () => {
  slots.clear();
  const roster = loadRoster();
  writesFail = true;
  roster.add('กบ'); // write fails, silently — \u0e01\u0e1a lives in memory only
  roster.add('แนน'); // re-reads an EMPTY storage — must union with memory, not replace it
  writesFail = false;
  assert.deepEqual(roster.names(), ['กบ', 'แนน'], 'names() is what the panel renders — both must be in it');
});

// Both directions at once: the degraded page must keep its own names AND still pick up the other tab's.
test('#data-loss a failed write does not cost the other tab either — memory and storage union, order kept', () => {
  slots.clear();
  const roster = loadRoster();
  writesFail = true;
  roster.add('กบ');
  writesFail = false;
  loadRoster().add('บี'); // another tab, writing successfully
  roster.add('แนน');
  assert.deepEqual(roster.names(), ['กบ', 'บี', 'แนน'], 'this tab first, in typing order, then what it caught up on');
});

// Negative control: with one tab only, add() behaves exactly as it always did.
test('negative control: a single tab adding two names in order is unchanged', () => {
  slots.clear();
  const roster = loadRoster();
  roster.add('เอ');
  roster.add('บี');
  roster.add('  '); // blank is still refused
  assert.deepEqual(roster.names(), ['เอ', 'บี']);
  assert.deepEqual(loadRoster().names(), ['เอ', 'บี']);
});
