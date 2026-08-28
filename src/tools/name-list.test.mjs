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

const { loadToolNames, saveToolNames, parseNameLines, hasVisibleChar } = await import('./name-list.ts');

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

test('#91 key isolation — saving one tool list leaves every other stored key byte-for-byte alone', () => {
  slots.clear();
  const canaryValue = JSON.stringify(['บีม', 'มายด์']);
  slots.set(SHARED_CANARY, canaryValue);
  slots.set('watduang:tool:draw-names', JSON.stringify(['ฟ้า']));

  saveToolNames(KEY, ['ปอนด์', 'แทน']);
  saveToolNames(KEY, loadToolNames(KEY));

  assert.equal(slots.get(SHARED_CANARY), canaryValue, 'the shared store is untouched by a tool write');
  assert.equal(slots.get('watduang:tool:draw-names'), JSON.stringify(['ฟ้า']), 'another tool\'s list is untouched');
  assert.deepEqual(JSON.parse(slots.get(KEY)), ['ปอนด์', 'แทน'], 'only the handed key moved');
});

// gh#133 — a name with no visible character is not a name. trim() strips U+FEFF and U+00A0 but NOT
// U+200B or U+2060, so a pasted zero-width line survived every guard and became an entry that renders
// as nothing. Written as escapes, never as literal invisible characters: a literal is invisible in a
// diff and dies to any whitespace cleaner.
const INVISIBLE_ONLY = [
  '',
  '   ',
  '\u200B', // ZERO WIDTH SPACE
  '\u2060', // WORD JOINER
  '\u200B\u200B\u2060',
  ' \u200B ', // ordinary spaces around a ZERO WIDTH SPACE
  '\uFEFF', // ZERO WIDTH NO-BREAK SPACE / BOM
  '\u00AD', // SOFT HYPHEN
  '\u200E', // LEFT-TO-RIGHT MARK
  '\u00A0', // NO-BREAK SPACE
  '\u3000', // IDEOGRAPHIC SPACE
];
// The false-reject side, and it is the one that matters more here: Thai "สระ" and "วรรณยุกต์" are
// Unicode nonspacing marks (category Mn) that appear in ordinary names, so a predicate that rejected
// Mn would silently block real players. Latin, digits and emoji must pass too.
const REAL_NAMES = ['สมชาย', 'น้ำ', 'ปุ๊กกี้', 'แนน', 'Beam', '7', '🎉', 'ก\u200B'];

test('#133 a string with no visible character is rejected, and every ordinary name is accepted', () => {
  for (const blank of INVISIBLE_ONLY) {
    assert.equal(hasVisibleChar(blank), false, `expected NO visible character in ${JSON.stringify(blank)}`);
  }
  for (const name of REAL_NAMES) {
    assert.equal(hasVisibleChar(name), true, `expected a visible character in ${JSON.stringify(name)}`);
  }
});

test('#133 parseNameLines drops a zero-width-only line and keeps every real name', () => {
  const text = ['บีม', '\u200B', 'น้ำ', '\u2060\uFEFF', '', 'ปุ๊กกี้', ' \u200B '].join('\n');
  assert.deepEqual(parseNameLines(text), ['บีม', 'น้ำ', 'ปุ๊กกี้']);
});

test('#133 a zero-width entry already in storage is dropped when the list is read', () => {
  slots.clear();
  slots.set(KEY, JSON.stringify(['บีม', '\u200B', 'น้ำ', '\u2060']));
  assert.deepEqual(loadToolNames(KEY), ['บีม', 'น้ำ']);
});
