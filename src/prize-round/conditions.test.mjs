// node --test — the word-game condition predicates (gh#322): they read stored cells only, never the spelling,
// honour eligibility and review, order values the same way everywhere, and carry provisional wording in both
// languages for every family.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THAI_FAMILIES, ENGLISH_FAMILIES } from '../prize-words/schema.ts';
import {
  WORDING_PROVISIONAL,
  compareValues,
  conditionWording,
  eligibleFor,
  familyOf,
  heldWording,
  holds,
  playable,
  valuesOf,
} from './conditions.ts';
import { fixtureBanks } from './fixtures.mjs';

const banks = fixtureBanks();
const th = (text) => banks.th.general.find((w) => w.text === text) ?? banks.th.food.find((w) => w.text === text);
const en = (text) => banks.en.general.find((w) => w.text === text);

test('every predicate reads the stored cell: a word whose cells disagree with its text follows the cells', () => {
  // A deliberately inconsistent word: the text says one thing, every stored cell another.
  const liar = { ...en('apple'), text: 'zzz', firstChar: 'q', lastChar: 'k', letters: ['k', 'q'], length: 9, doubleLetter: false, syllables: 4, wordType: 'verb' };
  assert.equal(holds({ family: 'firstChar', value: 'q' }, liar), true);
  assert.equal(holds({ family: 'firstChar', value: 'z' }, liar), false);
  assert.equal(holds({ family: 'lastChar', value: 'k' }, liar), true);
  assert.equal(holds({ family: 'letters', value: 'q' }, liar), true);
  assert.equal(holds({ family: 'letters', value: 'z' }, liar), false);
  assert.equal(holds({ family: 'length', value: 9 }, liar), true);
  assert.equal(holds({ family: 'length', value: 3 }, liar), false);
  assert.equal(holds({ family: 'doubleLetter', value: false }, liar), true);
  assert.equal(holds({ family: 'syllables', value: 4 }, liar), true);
  assert.equal(holds({ family: 'wordType', value: 'verb' }, liar), true);
});

test('Thai families: equality on scalar cells, membership on list cells', () => {
  const kai = th('ไก่');
  assert.equal(holds({ family: 'firstChar', value: 'ไ' }, kai), true);
  assert.equal(holds({ family: 'firstConsonant', value: 'ก' }, kai), true);
  assert.equal(holds({ family: 'consonantClass', value: 'mid' }, kai), true);
  assert.equal(holds({ family: 'toneMarks', value: '่' }, kai), true);
  assert.equal(holds({ family: 'toneMarks', value: '้' }, kai), false);
  assert.equal(holds({ family: 'vowels', value: 'ไ-' }, kai), true);
  assert.equal(holds({ family: 'liveDead', value: 'dead' }, kai), true);
  assert.equal(holds({ family: 'karan', value: false }, kai), true);
  assert.equal(holds({ family: 'karan', value: true }, th('จันทร์')), true);
  assert.deepEqual(valuesOf(kai, 'letters'), kai.letters);
  assert.deepEqual(valuesOf(th('ประตู'), 'liveDead'), [], 'a null cell offers no value');
});

test('eligibility and review are read from the stored cells', () => {
  assert.equal(eligibleFor(th('จันทร์'), 'lastChar'), false, 'a word ending in a combining mark is not eligible for lastChar');
  assert.equal(eligibleFor(th('จันทร์'), 'firstChar'), true);
  assert.equal(playable(en('apple')), true);
  assert.equal(playable({ ...en('apple'), review: 'pending' }), false);
  assert.equal(playable({ ...en('apple'), retired: true }), false);
  assert.deepEqual([...familyOf('th')].sort(), [...THAI_FAMILIES].sort());
  assert.deepEqual([...familyOf('en')].sort(), [...ENGLISH_FAMILIES].sort());
});

test('value order is total and fixed: false, true, numbers ascending, strings by code unit', () => {
  const vals = ['b', 3, true, 'a', 1, false, 'ก'];
  assert.deepEqual([...vals].sort(compareValues), [false, true, 1, 3, 'a', 'b', 'ก']);
});

test('every family has provisional Thai and English wording; a lone combining mark sits on a dotted circle', () => {
  assert.equal(WORDING_PROVISIONAL, true);
  const samples = {
    firstChar: 'k', firstConsonant: 'ก', lastChar: 'y', letters: 'e', toneMarks: '้', karan: true, length: 4,
    consonantClass: 'low', vowels: 'เ-', syllables: 2, liveDead: 'live', doubleLetter: false, wordType: 'noun',
  };
  for (const [family, value] of Object.entries(samples)) {
    const w = conditionWording({ family, value });
    assert.match(w.th, /[ก-๛]/u, `${family} th`);
    assert.match(w.en, /^[ -~“”฀-๿◌]+$/u, `${family} en`);
  }
  assert.ok(conditionWording({ family: 'toneMarks', value: '้' }).th.includes('◌้'));
  assert.ok(conditionWording({ family: 'length', value: 4 }).en.includes('every written character'));
  assert.equal(conditionWording({ family: 'syllables', value: 1 }).en, 'the word has 1 syllable');
  assert.notEqual(conditionWording({ family: 'karan', value: true }).th, conditionWording({ family: 'karan', value: false }).th);
  for (const [family, value] of [['consonantClass', 'high'], ['wordType', 'verb'], ['syllables', 3]]) {
    const w = heldWording(family, value);
    assert.ok(w.th.length > 0 && w.en.length > 0);
  }
});
