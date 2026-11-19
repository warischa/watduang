// Condition predicates for the word games of the prize draw (gh#322, engine 2a). Pure: no DOM, storage or network.
//
// A condition reads ONE stored attribute of a bank word and never looks at the spelling: every cell it tests is
// data in src/prize-words (spelling cells re-derived by that directory's oracle test, judged cells reviewed).
// A family is the set of conditions over one attribute (schema THAI_FAMILIES / ENGLISH_FAMILIES); a word takes
// part in a family only when the family is listed in its `eligible`, and only `reviewed`, unretired words may
// reach players at all (prize-words-spec, "Review").
//
// Display wording is DATA and PROVISIONAL: the final Thai and English copy comes from the canvas ticket (gh#325).
// Nothing in the composition reads the wording, so replacing it changes no deal.

import type { EnglishFamily, EnglishWord, Lang, ThaiFamily, ThaiWord } from '../prize-words/schema.ts';

export type Word = ThaiWord | EnglishWord;
export type Family = ThaiFamily | EnglishFamily;
export type CondValue = string | number | boolean;
/** One condition: "the word's `family` attribute is (or, for a list attribute, contains) `value`". */
export type Condition = { readonly family: Family; readonly value: CondValue };

/** Families whose stored cell is a list: their conditions test membership, not equality. */
const LIST_FAMILIES: ReadonlySet<Family> = new Set<Family>(['letters', 'toneMarks', 'vowels']);
/** Which families each language's words carry, so a condition is never asked of a cell the word lacks. */
const LANG_FAMILIES: Record<Lang, ReadonlySet<Family>> = {
  th: new Set<Family>(['firstChar', 'firstConsonant', 'lastChar', 'letters', 'toneMarks', 'karan', 'length', 'consonantClass', 'vowels', 'syllables', 'liveDead']),
  en: new Set<Family>(['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType']),
};

export function familyOf(lang: Lang): ReadonlySet<Family> {
  return LANG_FAMILIES[lang];
}

function cell(word: Word, family: Family): unknown {
  return (word as unknown as Record<string, unknown>)[family];
}

/** Only reviewed, unretired words may reach players. */
export function playable(word: Word): boolean {
  return word.review === 'reviewed' && word.retired !== true;
}

/** Does `word` take part in `family`? Read from the stored `eligible` list only. */
export function eligibleFor(word: Word, family: Family): boolean {
  return (word.eligible as readonly string[]).includes(family);
}

/** Does the condition hold on `word`? A pure read of one stored cell. */
export function holds(cond: Condition, word: Word): boolean {
  const v = cell(word, cond.family);
  if (LIST_FAMILIES.has(cond.family)) return Array.isArray(v) && (v as readonly unknown[]).includes(cond.value);
  return v === cond.value;
}

/** The values a word offers to a family's conditions: each element of a list cell, the cell itself otherwise. */
export function valuesOf(word: Word, family: Family): CondValue[] {
  const v = cell(word, family);
  if (LIST_FAMILIES.has(family)) return [...(v as readonly CondValue[])];
  return v === null || v === undefined ? [] : [v as CondValue];
}

/** A fixed order over values, so host and phone enumerate conditions identically: false < true < numbers < strings. */
export function compareValues(a: CondValue, b: CondValue): number {
  const rank = (x: CondValue) => (typeof x === 'boolean' ? 0 : typeof x === 'number' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'number') return a - (b as number);
  return a < (b as string) ? -1 : a > (b as string) ? 1 : 0;
}

export function conditionId(cond: Condition): string {
  return `${cond.family}=${String(cond.value)}`;
}

// ---- Provisional display wording (data; final copy is gh#325's) -------------------------------------------------

/** True until the canvas ticket replaces the wording below. */
export const WORDING_PROVISIONAL = true;

const DOTTED_CIRCLE = '◌';
const THAI_COMBINING = /^[ัิ-ฺ็-๎]$/u;

/** A single character shown on screen; a combining mark sits on a dotted circle so it is visible alone. */
function shown(value: CondValue): string {
  const s = String(value);
  return THAI_COMBINING.test(s) ? DOTTED_CIRCLE + s : s;
}

type Wording = { readonly th: string; readonly en: string };

const CLASS_WORDS: Record<string, Wording> = {
  high: { th: 'อักษรสูง', en: 'high class' },
  mid: { th: 'อักษรกลาง', en: 'mid class' },
  low: { th: 'อักษรต่ำ', en: 'low class' },
};
const TYPE_WORDS: Record<string, Wording> = {
  noun: { th: 'คำนาม', en: 'a noun' },
  verb: { th: 'คำกริยา', en: 'a verb' },
  adjective: { th: 'คำคุณศัพท์', en: 'an adjective' },
};
const LIVE_DEAD_WORDS: Record<string, Wording> = {
  live: { th: 'เป็นคำเป็น', en: 'is a live word' },
  dead: { th: 'เป็นคำตาย', en: 'is a dead word' },
};

/** The provisional Thai and English wording of a condition. Wording names what it tests (spec, "Written form"). */
export function conditionWording(cond: Condition): Wording {
  const x = shown(cond.value);
  switch (cond.family) {
    case 'firstChar':
      return { th: `ตัวอักษรตัวแรกที่เขียนคือ “${x}”`, en: `the first written character is “${x}”` };
    case 'firstConsonant':
      return { th: `พยัญชนะตัวแรกคือ “${x}”`, en: `the first consonant is “${x}”` };
    case 'lastChar':
      return { th: `ตัวอักษรตัวสุดท้ายที่เขียนคือ “${x}”`, en: `the last written character is “${x}”` };
    case 'letters':
      return { th: `มีตัว “${x}” อยู่ในคำ`, en: `the word contains “${x}”` };
    case 'toneMarks':
      return { th: `มีวรรณยุกต์ “${x}”`, en: `the word has the tone mark “${x}”` };
    case 'vowels':
      return { th: `มีรูปสระ “${x}”`, en: `the word has the written vowel form “${x}”` };
    case 'karan':
      return cond.value ? { th: 'มีการันต์', en: 'the word has a karan mark' } : { th: 'ไม่มีการันต์', en: 'the word has no karan mark' };
    case 'doubleLetter':
      return cond.value
        ? { th: 'มีตัวอักษรเดียวกันเขียนติดกัน', en: 'the word has a double letter' }
        : { th: 'ไม่มีตัวอักษรเดียวกันเขียนติดกัน', en: 'the word has no double letter' };
    case 'length':
      return {
        th: `เขียนด้วย ${x} ตัวอักษรพอดี นับทุกตัวที่เขียน รวมสระและวรรณยุกต์`,
        en: `the word is written with exactly ${x} characters, every written character counted, vowels and marks included`,
      };
    case 'consonantClass': {
      const w = CLASS_WORDS[String(cond.value)]!;
      return { th: `พยัญชนะตัวแรกเป็น${w.th}`, en: `the first consonant is ${w.en}` };
    }
    case 'syllables':
      return { th: `มี ${x} พยางค์`, en: `the word has ${x} syllable${cond.value === 1 ? '' : 's'}` };
    case 'liveDead':
      return LIVE_DEAD_WORDS[String(cond.value)]!;
    case 'wordType': {
      const w = TYPE_WORDS[String(cond.value)]!;
      return { th: `เป็น${w.th}`, en: `the word is ${w.en}` };
    }
  }
}

/** The provisional wording of a value a player HOLDS in games 5 and 7 (a class, a word type, a syllable count). */
export function heldWording(family: Family, value: CondValue): Wording {
  if (family === 'consonantClass') return CLASS_WORDS[String(value)]!;
  if (family === 'wordType') return TYPE_WORDS[String(value)]!;
  return { th: `${String(value)} พยางค์`, en: `${String(value)} syllable${value === 1 ? '' : 's'}` };
}
