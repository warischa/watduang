// node --test — game 2 composition (gh#323): candidate word pairs from the stored `letters` cell, each side's tiles,
// and the hit set of a drawn word being exactly one group.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, MIN_TILES_PER_SIDE, analyseLetters, revealOrder } from './letters.ts';
import { scoreAt } from './script-kit.ts';
import { scriptFixtureBanks, prng, roster } from './scripted-fixtures.mjs';

function tinyEnglish(texts) {
  const general = texts.map((text, i) => ({
    id: `en-general-${String(i + 1).padStart(3, '0')}`, text, firstChar: text[0], lastChar: text.at(-1), letters: [...new Set(text)].sort(),
    length: text.length, syllables: 1, workplaceSafe: true, review: 'reviewed', doubleLetter: false, wordType: 'noun',
    eligible: ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType'],
  }));
  return { th: { general: [], office: [], food: [], animal: [] }, en: { general, office: [], food: [], animal: [] } };
}

test(`a pair needs ${MIN_TILES_PER_SIDE} tiles on each side: one-letter differences are excluded, two are feasible`, () => {
  const setup = { game: 2, lang: 'en', pool: 'general' };
  assert.equal(MIN_TILES_PER_SIDE, 2);
  const thin = tinyEnglish(['cat', 'cot']);
  assert.match(LETTERS.infeasible(thin, setup), /2 playable words give no pair/);
  const ok = tinyEnglish(['cat', 'cod']);
  assert.equal(LETTERS.infeasible(ok, setup), null);
  assert.deepEqual(analyseLetters(ok, setup).pairs[0].sides, [['a', 't'], ['d', 'o']]);
});

test('every tile is from its own side: the drawn word hits all of its group and none of the other', () => {
  const banks = scriptFixtureBanks();
  const random = prng(41);
  let tiles = 0;
  for (const lang of ['th', 'en']) {
    for (const pool of ['general', 'office', 'food', 'animal']) {
      for (let k = 0; k < 10; k++) {
        const ctx = { eventKey: String(300000 + k), round: 1 + (k % 4), seed: String(20000 + k * 53), setup: { game: 2, lang, pool }, banks };
        const c = LETTERS.compose(ctx);
        const [w0, w1] = c.detail.words.map((id) => banks[lang][pool].find((w) => w.id === id));
        for (const [g, w] of [w0, w1].entries()) {
          assert.deepEqual([...c.scripts[g]].sort(), [...w.letters].sort(), 'the script is the stored letters, each once');
          assert.deepEqual(c.scripts[g], [...new Set(w.text)], 'ordered by first appearance in the text (the cell agrees with the text here)');
        }
        for (const id of roster(20, random)) {
          for (const g of [0, 1]) {
            const [tile] = c.holding(id, g);
            tiles++;
            const own = g === 0 ? w0 : w1;
            const other = g === 0 ? w1 : w0;
            assert.ok(own.letters.includes(tile) && !other.letters.includes(tile), `${lang} ${pool} ${own.text}/${other.text} tile ${tile}`);
          }
        }
      }
    }
  }
  assert.equal(tiles, 3200);
});

test('scoring reads the stored letters cell, never the text: a cell that disagrees with its text scores by the cell', () => {
  // A synthetic row whose text is 'cat' but whose stored letters are b, q, r, z.
  const [cat] = tinyEnglish(['cat']).en.general;
  const row = { ...cat, letters: ['b', 'q', 'r', 'z'] };
  const script = revealOrder(row);
  assert.deepEqual(script, ['b', 'q', 'r', 'z'], 'every step is a stored letter; none of the text letters');
  for (const t of ['c', 'a', 't']) assert.equal(scoreAt(script, [t], script.length), 0, `text letter ${t} never hits`);
  for (const t of ['b', 'q', 'r', 'z']) assert.equal(scoreAt(script, [t], script.length), 1, `stored letter ${t} hits`);
  // Mixed: stored letters the text holds come first, in text order; the rest follow in stored order.
  assert.deepEqual(revealOrder({ ...cat, letters: ['a', 't', 'z'] }), ['a', 't', 'z']);
  assert.deepEqual(revealOrder({ ...cat, text: 'tab', letters: ['a', 'b', 't'] }), ['t', 'a', 'b']);
});
