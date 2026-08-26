// node --test — no framework, no dependency. The shared name-entry panel's list handling (gh#91):
// one localStorage key per tool, no ceiling, and — the load-bearing half of the ticket — a write
// lands ONLY on the key it was handed, never anywhere near the shared group stores (ADR-0039).
// localStorage does not exist in Node, so stub it with what the real one is: a string→string map.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const slots = new Map();
// Quota full and old-Safari private mode both throw here — the store must keep going in memory (issue #7 rule).
let writesFail = false;
globalThis.localStorage = {
  getItem: (k) => (slots.has(k) ? slots.get(k) : null),
  setItem: (k, v) => {
    if (writesFail) throw new Error('QuotaExceededError');
    slots.set(k, String(v));
  },
  removeItem: (k) => slots.delete(k),
};

const KEY = 'watduang:tool:wheel-names';
// A real shared key (NOT the roster literal — that spelling belongs to roster.ts alone and a gate
// polices it): a canary standing in for every store a tool must not touch.
const SHARED_CANARY = 'watduang:group';

const { loadToolNames, saveToolNames, addToolName, removeToolName } = await import('./name-list.ts');

test('empty, missing and unreadable storage all load as an empty list', () => {
  slots.clear();
  assert.deepEqual(loadToolNames(KEY), [], 'missing key');
  slots.set(KEY, 'not json');
  assert.deepEqual(loadToolNames(KEY), [], 'corrupt JSON');
  slots.set(KEY, '{"a":1}');
  assert.deepEqual(loadToolNames(KEY), [], 'a non-array value');
  slots.set(KEY, '[1,"บีม",true,null]');
  assert.deepEqual(loadToolNames(KEY), ['บีม'], 'non-string entries are dropped');
});

test('save/load round-trips the list in order', () => {
  slots.clear();
  saveToolNames(KEY, ['บีม', 'มายด์', 'ปอนด์']);
  assert.deepEqual(loadToolNames(KEY), ['บีม', 'มายด์', 'ปอนด์']);
});

test('a failing write never throws and never touches storage', () => {
  slots.clear();
  writesFail = true;
  assert.doesNotThrow(() => saveToolNames(KEY, ['บีม']));
  writesFail = false;
  assert.equal(slots.has(KEY), false, 'nothing was written');
});

test('add trims, refuses blanks and duplicates, and has no ceiling — twenty past ten all stay', () => {
  let list = [];
  for (let i = 1; i <= 30; i += 1) {
    const before = list.length;
    ({ names: list } = addToolName(list, `คนที่ ${i}`));
    assert.equal(list.length, before + 1, 'every unique name is accepted, at any count');
  }
  assert.equal(list.length, 30, 'no ten-name ceiling survives anywhere in the path');

  const dup = addToolName(list, '  คนที่ 30  ');
  assert.equal(dup.added, false, 'a duplicate is refused, not re-added');
  assert.equal(dup.names.length, 30);

  const blank = addToolName(list, '   ');
  assert.equal(blank.added, false, 'whitespace-only input is refused');

  assert.deepEqual(addToolName(list, 'แก้ม').names.at(-1), 'แก้ม', 'a trimmed new name appends last');
});

test('#91 key isolation — saving one tool list leaves every other stored key byte-for-byte alone', () => {
  slots.clear();
  const canaryValue = JSON.stringify(['บีม', 'มายด์']);
  slots.set(SHARED_CANARY, canaryValue);
  slots.set('watduang:tool:draw-names', JSON.stringify(['ฟ้า']));

  saveToolNames(KEY, ['ปอนด์', 'แทน']);
  addToolName(loadToolNames(KEY), 'แก้ม');

  assert.equal(slots.get(SHARED_CANARY), canaryValue, 'the shared store is untouched by a tool write');
  assert.equal(slots.get('watduang:tool:draw-names'), JSON.stringify(['ฟ้า']), 'another tool\'s list is untouched');
  assert.deepEqual(JSON.parse(slots.get(KEY)), ['ปอนด์', 'แทน'], 'only the handed key moved');
});

test('remove drops every occurrence and keeps the rest in order', () => {
  assert.deepEqual(removeToolName(['บีม', 'มายด์', 'บีม', 'ปอนด์'], 'บีม'), ['มายด์', 'ปอนด์']);
  assert.deepEqual(removeToolName(['บีม', 'มายด์'], 'ไม่มี'), ['บีม', 'มายด์'], 'absent name is a no-op');
});