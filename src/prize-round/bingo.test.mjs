// node --test — game 3 composition (gh#323): the alphabet split, the card shape, and the mark threshold that makes
// the cut exact with no tie: every card scores THRESHOLD..MAX_OWN_MARKS under its own script and below THRESHOLD
// under the other. Plus the barred letter sets: one member of each is out of the round's universe, so no card, script
// or row can hold a full set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINGO, BINGO_ALPHABET, BINGO_BARRED, CARD_SIZE, DRAWS, MAX_OWN_MARKS, SHARED, THRESHOLD } from './bingo.ts';
import { scoreAt } from './script-kit.ts';
import { prng, roster } from './scripted-fixtures.mjs';

test('alphabets and constants: 42 Thai consonants (no obsolete letters), 26 English letters, room for every set', () => {
  assert.equal(BINGO_ALPHABET.th.length, 42);
  assert.equal(new Set(BINGO_ALPHABET.th).size, 42);
  assert.ok(!BINGO_ALPHABET.th.includes('ฃ') && !BINGO_ALPHABET.th.includes('ฅ'));
  assert.equal(BINGO_ALPHABET.en.length, 26);
  assert.deepEqual([DRAWS, SHARED, THRESHOLD, MAX_OWN_MARKS, CARD_SIZE], [12, 6, 4, 6, 9]);
  for (const [lang, a] of Object.entries(BINGO_ALPHABET)) assert.ok(SHARED + 2 * (DRAWS - SHARED) + (CARD_SIZE - THRESHOLD) <= a.length - BINGO_BARRED[lang].length);
});

test('every card: 9 distinct letters, THRESHOLD..MAX_OWN_MARKS marks under its own script, under THRESHOLD under the other', () => {
  const random = prng(31);
  const seen = { own: new Map(), other: new Map() };
  let cards = 0;
  for (const lang of ['th', 'en']) {
    for (let k = 0; k < 30; k++) {
      const ctx = { eventKey: String(200000 + k), round: 1 + (k % 4), seed: String(10000 + k * 37), setup: { game: 3, lang, pool: 'general' }, banks: null };
      const c = BINGO.compose(ctx);
      const [s0, s1] = c.scripts;
      assert.equal(s0.length, DRAWS);
      assert.equal(new Set(s0).size, DRAWS);
      assert.equal(s0.filter((x) => s1.includes(x)).length, SHARED);
      for (const set of BINGO_BARRED[lang]) for (const s of c.scripts) assert.ok(!set.every((x) => s.includes(x)), `script holds a barred set at ${ctx.eventKey}`);
      for (const id of roster(40, random)) {
        for (const g of [0, 1]) {
          const card = c.holding(id, g);
          cards++;
          assert.equal(card.length, CARD_SIZE);
          assert.equal(new Set(card).size, CARD_SIZE);
          assert.ok(card.every((x) => BINGO_ALPHABET[lang].includes(x)));
          for (const set of BINGO_BARRED[lang]) assert.ok(!set.every((x) => card.includes(x)), `card holds a barred set at ${ctx.eventKey}`);
          const own = scoreAt(c.scripts[g], card, DRAWS);
          const other = scoreAt(c.scripts[1 - g], card, DRAWS);
          assert.ok(own >= THRESHOLD && own <= MAX_OWN_MARKS, `own ${own}`);
          assert.ok(other < THRESHOLD, `other ${other}`);
          seen.own.set(own, (seen.own.get(own) ?? 0) + 1);
          seen.other.set(other, (seen.other.get(other) ?? 0) + 1);
        }
      }
    }
  }
  assert.equal(cards, 4800);
  assert.deepEqual([...seen.own.keys()].sort(), [4, 5, 6], 'every own-mark count in range is dealt');
  assert.deepEqual([...seen.other.keys()].sort(), [0, 1, 2, 3], 'every other-mark count in range is dealt');
});

test('game 3 reads no bank and plays only under the general pool digit', () => {
  assert.equal(BINGO.infeasible(null, { game: 3, lang: 'th', pool: 'general' }), null);
  assert.match(BINGO.infeasible(null, { game: 3, lang: 'th', pool: 'food' }), /no word pool/);
});

// ---- barred letter sets -----------------------------------------------------------------------------------------

/** The Thai barred set, written out here so the named cases do not depend on the list they check. */
const BARRED_TH = ['\u0e2b', '\u0e27', '\u0e22'];
const thCtx = (eventKey, round, seed) => ({ eventKey, round, seed, setup: { game: 3, lang: 'th', pool: 'general' }, banks: null });
const holdsAll = (items, set) => set.every((x) => items.includes(x));

test('connector: the Thai barred list is non-empty and every member is a bingo letter; English has none', () => {
  assert.ok(BINGO_BARRED.th.length > 0);
  assert.ok(BINGO_BARRED.th.some((set) => set.join() === BARRED_TH.join()), 'the Thai set is on the list');
  for (const set of BINGO_BARRED.th) {
    assert.ok(set.length >= 2 && new Set(set).size === set.length, `set ${set.join()}`);
    for (const x of set) assert.ok(BINGO_ALPHABET.th.includes(x), `U+${x.codePointAt(0).toString(16)} not in the Thai alphabet`);
  }
  assert.deepEqual(BINGO_BARRED.en, []);
});

test('every round: shared + sides + rest + excluded partitions the alphabet, and each barred set loses a member', () => {
  const hit = new Map();
  let rounds = 0;
  for (const lang of ['th', 'en']) {
    for (let k = 0; k < 60; k++) {
      for (const round of [1, 2, 3, 4]) {
        const c = BINGO.compose({ eventKey: String(300000 + k * 13), round, seed: String(10000 + k * 101 + round), setup: { game: 3, lang, pool: 'general' }, banks: null });
        rounds++;
        const { shared, sides, rest, excluded } = c.detail;
        assert.ok(Array.isArray(excluded), 'detail.excluded is a list');
        const all = [...shared, ...sides[0], ...sides[1], ...rest, ...excluded];
        assert.deepEqual([...all].sort(), [...BINGO_ALPHABET[lang]].sort(), 'a partition of the alphabet');
        assert.equal(excluded.length, BINGO_BARRED[lang].length);
        assert.equal(rest.length, BINGO_ALPHABET[lang].length - 2 * DRAWS + SHARED - excluded.length);
        for (const set of BINGO_BARRED[lang]) {
          const out = set.filter((x) => excluded.includes(x));
          assert.equal(out.length, 1, `set ${set.join()} loses exactly one member`);
          hit.set(out[0], (hit.get(out[0]) ?? 0) + 1);
        }
      }
    }
  }
  assert.equal(rounds, 480);
  for (const x of BARRED_TH) assert.ok(hit.get(x) > 0, `U+${x.codePointAt(0).toString(16)} is the excluded member in some round`);
});

test('a card that held the whole barred set on the unguarded engine no longer does', () => {
  const card = BINGO.compose(thCtx('200003', 4, '10111')).holding('9k9NKS0o6Sj-9o0AH4s77m', 0);
  assert.ok(!holdsAll(card, BARRED_TH));
});

test('a card whose middle row read the barred set on the unguarded engine reads it in no row', () => {
  const card = BINGO.compose(thCtx('200207', 4, '17659')).holding('jR_YX4J6GUUcQMCWiB6oPP', 0);
  for (let r = 0; r < 3; r++) assert.notEqual(card.slice(3 * r, 3 * r + 3).join(''), BARRED_TH.join(''), `row ${r}`);
  assert.ok(!holdsAll(card, BARRED_TH));
});

test('a script that drew the barred set consecutively on the unguarded engine no longer holds it', () => {
  const c = BINGO.compose(thCtx('201677', 2, '72049'));
  assert.notEqual(c.scripts[1].slice(9, 12).join(''), BARRED_TH.join(''));
  for (const s of c.scripts) assert.ok(!holdsAll(s, BARRED_TH));
});
