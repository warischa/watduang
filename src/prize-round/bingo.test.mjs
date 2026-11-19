// node --test — game 3 composition (gh#323): the alphabet split, the card shape, and the mark threshold that makes
// the cut exact with no tie: every card scores THRESHOLD..MAX_OWN_MARKS under its own script and below THRESHOLD
// under the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BINGO, BINGO_ALPHABET, CARD_SIZE, DRAWS, MAX_OWN_MARKS, SHARED, THRESHOLD } from './bingo.ts';
import { scoreAt } from './script-kit.ts';
import { prng, roster } from './scripted-fixtures.mjs';

test('alphabets and constants: 42 Thai consonants (no obsolete letters), 26 English letters, room for every set', () => {
  assert.equal(BINGO_ALPHABET.th.length, 42);
  assert.equal(new Set(BINGO_ALPHABET.th).size, 42);
  assert.ok(!BINGO_ALPHABET.th.includes('ฃ') && !BINGO_ALPHABET.th.includes('ฅ'));
  assert.equal(BINGO_ALPHABET.en.length, 26);
  assert.deepEqual([DRAWS, SHARED, THRESHOLD, MAX_OWN_MARKS, CARD_SIZE], [12, 6, 4, 6, 9]);
  for (const a of Object.values(BINGO_ALPHABET)) assert.ok(SHARED + 2 * (DRAWS - SHARED) + (CARD_SIZE - THRESHOLD) <= a.length);
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
      for (const id of roster(40, random)) {
        for (const g of [0, 1]) {
          const card = c.holding(id, g);
          cards++;
          assert.equal(card.length, CARD_SIZE);
          assert.equal(new Set(card).size, CARD_SIZE);
          assert.ok(card.every((x) => BINGO_ALPHABET[lang].includes(x)));
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
