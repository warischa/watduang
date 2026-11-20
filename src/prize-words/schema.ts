// The word-bank contract for the letter and word games (gh#311). Types and closed vocabularies only:
// this module holds no logic, and no runtime module may derive an attribute from spelling. Every
// attribute is STORED data. The spelling-level ones are re-derived by the oracle test beside this file
// (which no runtime module imports); the judged ones are reviewed by people and models, never computed.
// The full definitions live in docs/design/prize-words-spec.md and win over any wording here.

/** The four pools. A round draws from one pool; `general` is the untheme'd pool. */
export const POOLS = ['general', 'office', 'food', 'animal'] as const;
export type Pool = (typeof POOLS)[number];

export type Lang = 'th' | 'en';

/**
 * The bank revision engines carry in their codes. A literal number, never derived: any bank edit that
 * changes what can be dealt bumps it by one and appends that revision's hash to revisions.json.
 */
export const BANK_REVISION = 1;

/** A bank: one append-only array per pool. A word's position in its array never changes. */
export type Bank<W> = Readonly<Record<Pool, readonly W[]>>;

/** Who has signed off the judged cells of a word. Only `reviewed` words may reach players. */
export type ReviewStatus = 'pending' | 'reviewed';

/** Consonant class of a Thai consonant, from the fixed 44-consonant table. */
export type ConsonantClass = 'high' | 'mid' | 'low';

/** The four Thai tone marks, U+0E48 to U+0E4B. U+0E47 is a vowel shortener, not a tone mark. */
export const TONE_MARKS = ['\u0E48', '\u0E49', '\u0E4A', '\u0E4B'] as const;
export type ToneMark = (typeof TONE_MARKS)[number];

/**
 * Written Thai vowel forms, a hyphen standing for the consonant slot. A form lists only what is
 * WRITTEN: an inherent vowel that is pronounced but not written is never listed.
 */
export const VOWEL_FORMS = [
  '-ะ', '-ั', '-า', '-ำ', '-ิ', '-ี', '-ึ', '-ื', '-ุ', '-ู',
  '-อ', '-็อ', '-ัว', '-ัวะ',
  'เ-', 'เ-ะ', 'เ-็', 'แ-', 'แ-ะ', 'แ-็',
  'โ-', 'โ-ะ', 'ใ-', 'ไ-', 'เ-า', 'เ-าะ',
  'เ-อ', 'เ-ิ', 'เ-อะ',
  'เ-ีย', 'เ-ียะ', 'เ-ือ', 'เ-ือะ',
  '-ือ', '-ว', 'เ-ย', '-รร',
] as const;
export type VowelForm = (typeof VOWEL_FORMS)[number];

/** English word types. The English bank admits only words with exactly one of these. */
export type WordType = 'noun' | 'verb' | 'adjective';

/** Condition families. A word takes part in a family's conditions only if listed in its `eligible`. */
export const THAI_FAMILIES = [
  'firstChar', 'firstConsonant', 'lastChar', 'letters', 'toneMarks', 'karan', 'length',
  'consonantClass', 'vowels', 'syllables', 'liveDead',
] as const;
export type ThaiFamily = (typeof THAI_FAMILIES)[number];

export const ENGLISH_FAMILIES = ['firstChar', 'lastChar', 'letters', 'length', 'doubleLetter', 'syllables', 'wordType'] as const;
export type EnglishFamily = (typeof ENGLISH_FAMILIES)[number];

interface WordBase {
  /** Stable id: language, pool and the 1-based position in that pool, zero-padded to 3 digits. */
  readonly id: string;
  /** The written word, NFC, allowed codepoints only. */
  readonly text: string;
  // Spelling-level: stored, re-derived by the oracle.
  /** The first codepoint. */
  readonly firstChar: string;
  /** The last codepoint. */
  readonly lastChar: string;
  /** Distinct codepoints of `text`, ascending by codepoint. */
  readonly letters: readonly string[];
  /** Number of codepoints. */
  readonly length: number;
  // Judged: stored, reviewed, never computed.
  /** Syllable count; null when the word has two accepted readings (then not eligible for `syllables`). */
  readonly syllables: number | null;
  /** Fit for a workplace room: no brands, alcohol, profanity or gambling words. A word that fails is not in the bank. */
  readonly workplaceSafe: true;
  readonly review: ReviewStatus;
  /** Free-text reviewer note: the dictionary citation, or why a family is excluded. */
  readonly note?: string;
  /** Set once a word is withdrawn. The word keeps its position and id forever; it is never deleted. */
  readonly retired?: true;
}

export interface ThaiWord extends WordBase {
  /** The first codepoint found in the 44-consonant table; leading vowels are skipped. */
  readonly firstConsonant: string;
  /** Distinct tone marks present, in TONE_MARKS order. */
  readonly toneMarks: readonly ToneMark[];
  /** True when the word contains U+0E4C (the karan mark). */
  readonly karan: boolean;
  /** Class of `firstConsonant` in the 44-consonant table. */
  readonly consonantClass: ConsonantClass;
  // Judged.
  /** Written vowel forms, in order of first appearance, each once. */
  readonly vowels: readonly VowelForm[];
  /** Live or dead word; null unless the word has exactly one syllable. */
  readonly liveDead: 'live' | 'dead' | null;
  /** Families this word takes part in, in THAI_FAMILIES order. */
  readonly eligible: readonly ThaiFamily[];
}

export interface EnglishWord extends WordBase {
  /** True when two adjacent letters are the same letter. */
  readonly doubleLetter: boolean;
  // Judged.
  readonly wordType: WordType;
  /** Families this word takes part in, in ENGLISH_FAMILIES order. */
  readonly eligible: readonly EnglishFamily[];
}
