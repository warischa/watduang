// node --test src/games/daily-fortune.test.mjs — no framework, no dependency
// checks only the pure draw exported from daily-fortune.ts (no DOM needed).
// The invariant under test is the one the game exists for (#33): the fortune is a pure function of
// (normalized name, Bangkok date) — same pair same answer, new day new answer, whole pool reachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORTUNES, bangkokDate, fortuneFor, hashPick, normalizeName } from './daily-fortune.ts';

// A fixed name space — no RNG anywhere in this file, so every result is pass-always or fail-always.
const FIRST = ['ก้อง', 'ฟ้า', 'ตูน', 'แนน', 'บอส', 'มิ้น', 'เจ', 'ปอ', 'หมิว', 'ต้น', 'ใบเตย', 'ขวัญ',
  'Bank', 'Ploy', 'Jane', 'Nice'];
const LAST = ['', ' ใหญ่', ' เล็ก', ' น้อย', 'ๆ', '1', '2', '3', 'อร', 'ณี', 'ชัย', 'พร'];
const NAMES = FIRST.flatMap((f) => LAST.map((l) => `${f}${l}`)); // 192 distinct names
const DAYS = Array.from({ length: 60 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);

test('the pool itself: ~50 distinct lines, none blank', () => {
  assert.ok(FORTUNES.length >= 48, `pool is ${FORTUNES.length} items`);
  // A duplicate line keeps coverage looking full while two draws read identically to a player.
  assert.equal(new Set(FORTUNES).size, FORTUNES.length, 'the pool contains a duplicate line');
  for (const f of FORTUNES) assert.ok(f.trim().length > 0, 'blank fortune in the pool');
});

test('same name + same Bangkok day → the same fortune, every time it is asked', () => {
  for (const name of NAMES) {
    const first = fortuneFor(name, '2026-08-15');
    // A negative index would return undefined, and undefined === undefined would pass this test.
    assert.ok(FORTUNES.includes(first), `"${name}" drew something that is not in the pool: ${first}`);
    for (let again = 0; again < 5; again++) {
      assert.equal(fortuneFor(name, '2026-08-15'), first, `"${name}" changed on repeat draw ${again}`);
    }
  }
});

test('a new day deals a new fortune to nearly everyone', () => {
  // Not 100% by construction: with a 50-item pool two consecutive days collide for roughly 1 name
  // in 50 by chance, and asserting 100% would be asserting something false.
  let changed = 0;
  for (const name of NAMES) {
    if (fortuneFor(name, '2026-08-15') !== fortuneFor(name, '2026-08-16')) changed++;
  }
  const fraction = changed / NAMES.length;
  assert.ok(fraction >= 0.9, `only ${changed}/${NAMES.length} names changed fortune overnight (${fraction})`);

  // And it is not just one lucky pair of days — every day must move most of the วง.
  for (let i = 1; i < DAYS.length; i++) {
    const moved = NAMES.filter((n) => fortuneFor(n, DAYS[i - 1]) !== fortuneFor(n, DAYS[i])).length;
    assert.ok(moved / NAMES.length >= 0.85, `${DAYS[i - 1]} → ${DAYS[i]}: only ${moved}/${NAMES.length} moved`);
  }
});

test('every line in the pool is reachable — no fortune nobody can ever draw', () => {
  const seen = new Set();
  for (const name of NAMES) for (const day of DAYS) seen.add(fortuneFor(name, day));
  assert.equal(seen.size, FORTUNES.length, `only ${seen.size}/${FORTUNES.length} lines are reachable`);

  // Same claim one level down, against the raw picker: consecutive integer seeds must cover the pool.
  const direct = new Set();
  for (let i = 0; i < 5000; i++) direct.add(hashPick(`seed-${i}`, FORTUNES));
  assert.equal(direct.size, FORTUNES.length, `hashPick reaches only ${direct.size}/${FORTUNES.length}`);
});

test('names normalise: surrounding and internal spaces, Latin case, Thai composition', () => {
  const day = '2026-08-15';
  const base = fortuneFor('ก้อง', day);
  assert.equal(fortuneFor(' ก้อง ', day), base, 'padding changed the fortune');
  assert.equal(fortuneFor('\tก้อง\n', day), base, 'tab/newline padding changed the fortune');
  assert.equal(fortuneFor('ก้อง  ใหญ่', day), fortuneFor('ก้อง ใหญ่', day), 'double space changed the fortune');
  // Latin case only — Thai has no case, so toLowerCase leaves it byte-identical.
  assert.equal(fortuneFor('BANK', day), fortuneFor('bank', day), 'Latin case changed the fortune');
  assert.equal(fortuneFor('Bank', day), fortuneFor('bank', day), 'Latin case changed the fortune');
  // NFC folds the two spellings of an accented Latin name (measured: Thai has no canonical
  // decomposition — 'ก้อง'.normalize('NFD') is byte-identical, so NFC is a Latin-only guard here).
  const nfd = 'José'.normalize('NFD');
  assert.notEqual(nfd, 'José', 'this string has no decomposed form — pick another to test NFC with');
  assert.equal(fortuneFor(nfd, day), fortuneFor('José', day), 'a decomposed spelling drew a different fortune');
  // What deliberately does NOT normalise: two different people are two different names.
  assert.equal(normalizeName(' ก้อง '), 'ก้อง');
  assert.notEqual(normalizeName('ก้อง'), normalizeName('กอง'));

  // Zero-width characters: `\s` does not match them, so trim/collapse alone leaves them in and a
  // name pasted out of LINE or Facebook hashes differently from the identical-looking typed name.
  for (const [label, zw] of [['ZWSP', '\u200B'], ['ZWNJ', '\u200C'], ['ZWJ', '\u200D'], ['BOM', '\uFEFF']]) {
    assert.equal(normalizeName(`${zw}ก้อง${zw}`), 'ก้อง', `${label} survived normalisation`);
    assert.equal(fortuneFor(`ก้อง${zw}`, day), base, `${label} changed the fortune`);
  }
  // A name that is nothing but zero-width must not masquerade as a real one.
  assert.equal(normalizeName('\u200B\uFEFF'), '');

  // SARA AM: '\u0E33' is U+0E33 on a Thai keyboard, but NIKHAHIT + SARA AA (U+0E4D U+0E32) renders
  // identically and comes out of some PDFs and older systems. NFC does not fold the two, so
  // without an explicit rule the same-looking name draws a different fortune.
  const amComposed = '\u0E19\u0E33';       // NO NU + SARA AM
  const amDecomposed = '\u0E19\u0E4D\u0E32'; // NO NU + NIKHAHIT + SARA AA
  assert.notEqual(amComposed, amDecomposed, 'these must differ as strings, or this proves nothing');
  assert.equal(normalizeName(amDecomposed), amComposed, 'SARA AM spellings did not unify');
  assert.equal(fortuneFor(amDecomposed, day), fortuneFor(amComposed, day), 'SARA AM changed the fortune');
});

test('the date is Bangkok\'s, not the device\'s and not UTC', () => {
  // Injected instants — nothing here depends on when the suite runs.
  const beforeMidnight = new Date('2026-08-15T16:59:59Z'); // 23:59:59 in Bangkok
  const afterMidnight = new Date('2026-08-15T17:00:00Z'); // 00:00:00 the next day in Bangkok

  assert.match(bangkokDate(beforeMidnight), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(bangkokDate(beforeMidnight), '2026-08-15');
  assert.equal(bangkokDate(afterMidnight), '2026-08-16', 'Bangkok midnight did not roll the day over');

  // Machine-independent: at 17:00Z the UTC day is still the 15th. An implementation that sliced
  // toISOString() (or ran off a UTC device clock) fails here on any machine, in any timezone.
  assert.notEqual(bangkokDate(afterMidnight), afterMidnight.toISOString().slice(0, 10));

  // And the fortune moves with the Bangkok day, not the UTC one.
  assert.notEqual(
    fortuneFor('ก้อง', bangkokDate(beforeMidnight)),
    fortuneFor('ก้อง', bangkokDate(afterMidnight)),
  );
});

test('hashPick refuses an empty pool instead of returning undefined', () => {
  assert.throws(() => hashPick('ก้อง|2026-08-15', []), /empty pool/);
});
