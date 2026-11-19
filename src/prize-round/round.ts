// Engine 2a for the word games of the prize draw (gh#322): one-step word rounds for game 1 (pick a word, wait for
// the rule), game 5 (three consonant classes / word types) and game 7 (syllable count), in event mode. Pure: no
// DOM, storage or network. It generalises the card deal of src/prize-draw/cards.ts and reuses its machinery
// unchanged (hostDealCuts, fateValue, hashToScale, the Damm digit), so no phase-1 file is edited.
//
// Half-cut rounds only (owner ruling 2026-11-19, the cards rule of gh#306): live = 2 x keep. Then the two cuts of
// a deal are the same value, so every identity is in exactly one of two groups: group 0 (fate value below the
// cut, the lowest `keep`) or group 1 (the highest `keep`). Each group is dealt items from its own side of a
// candidate pair, so whichever candidate is drawn, and whichever polarity ("match = survive" or "match = out"),
// exactly `keep` people survive. Off a half-cut some holders would know their fate from their item before the
// draw, which is why the host refuses any other cut and the code has no way to express one.
//
//   game 1: a pair of conditions (A, B) from one family. Group 0 holds 3 distinct words from A-and-not-B, group 1
//           from B-and-not-A. Drawn A, match = survive: group 0 survives; match = out: group 1 survives. Feasible
//           for a pool only when each of those two quadrants holds at least 3 playable eligible words.
//   game 5/7: each person holds one value (a class or word type; a syllable count 1 to 4): group 0 the first value
//           of a pair, group 1 the second. Two candidate words, one per value, are the "rules": a drawn word
//           matches exactly the holders of its value. Feasible when each value has a playable eligible word.
//
// The engine computes feasible pairs from the bank (no hand-kept list) and reports every excluded pair with the
// reason. Only `reviewed`, unretired words are ever dealt.
//
// Word-family code, digits only, shared by this engine and engine 2b (scripted.ts):
//   seed (5) + cut (3) + bank revision (1) + kind (2) + pool (1) + format (1) + Damm check (1) = 14 digits,
// the check taken over the round number followed by the code exactly as round-code.ts does. Kind 00-49 indexes the
// frozen KINDS table below; 50-99 is engine 2b's block. One cut, not two: at a half-cut the low and high cuts are
// equal. Why 14: every phase-1 length (final 7, cut 9, deal 12) is at least 2 away, so no single inserted or
// deleted digit turns a phase-1 code into a word-family code or back, and the Damm check rejects every single
// substitution and adjacent swap inside the family. 13 would sit one insertion from a deal code; 11 one deletion.
// The bank revision digit is BANK_REVISION mod 10 of the host's build: a phone on another revision refuses with
// `stale-bank` instead of dealing from a bank the host does not hold.
//
// The drawn candidate (rule 0 or 1) and the polarity reach the phone by a rule tap, as the card round's rule does.

import {
  canonicalIdentity,
  CUT_DIGITS,
  dammCheck,
  fateValue,
  hashToScale,
  hostDealCuts,
  parseCode,
  ROUNDS,
  SEED_DIGITS,
} from '../prize-draw/round-code.ts';
import { BANK_REVISION, type Bank, type EnglishWord, type Lang, type Pool, type ThaiWord } from '../prize-words/schema.ts';
import {
  compareValues,
  conditionId,
  eligibleFor,
  familyOf,
  holds,
  playable,
  valuesOf,
  type CondValue,
  type Condition,
  type Family,
  type Word,
} from './conditions.ts';

export type WordGame = 1 | 5 | 7;
export type Kind = { readonly game: WordGame; readonly lang: Lang; readonly family: Family };
/** A build's banks. `revision` defaults to BANK_REVISION; a test sets it to stand for another build. */
export type Banks = { readonly th: Bank<ThaiWord>; readonly en: Bank<EnglishWord>; readonly revision?: number };
/** Why a phone refuses a code: mistyped or minted for no round it can play, or minted on another bank revision. */
export type CodeRefusal = 'bad-code' | 'stale-bank';
export type Refused = { readonly refused: CodeRefusal };
export type WordSetup = { readonly game: WordGame; readonly lang: Lang; readonly pool: Pool; readonly family: Family };
export type Polarity = 'survive' | 'out';
/** The phone's rule tap: which candidate the main screen drew, and the polarity it showed. */
export type RuleTap = { readonly rule: 0 | 1; readonly polarity: Polarity };
/** What one person holds: a hand of words (game 1) or one value (games 5 and 7). */
export type Holding = { readonly kind: 'hand'; readonly words: readonly Word[] } | { readonly kind: 'value'; readonly value: CondValue };
/** The two candidates of a round: conditions (game 1) or words (games 5 and 7), index = rule. */
export type Candidates =
  | { readonly kind: 'conditions'; readonly pair: readonly [Condition, Condition] }
  | { readonly kind: 'words'; readonly family: Family; readonly values: readonly [CondValue, CondValue]; readonly pair: readonly [Word, Word] };
export type ParsedWordCode = { seed: string; cut: number; revision: number; kindIndex: number; kind: Kind; pool: Pool };

/**
 * Every (game, language, family) a word round can play. FROZEN ORDER: a code carries the index, so an entry is
 * never moved or removed; a new one is appended. Written out by hand, not derived from the schema's family lists,
 * so a family appended there cannot shift a code. At most 50 entries: kind digits 50-99 belong to engine 2b.
 */
export const KINDS: readonly Kind[] = [
  { game: 1, lang: 'th', family: 'firstChar' },
  { game: 1, lang: 'th', family: 'firstConsonant' },
  { game: 1, lang: 'th', family: 'lastChar' },
  { game: 1, lang: 'th', family: 'letters' },
  { game: 1, lang: 'th', family: 'toneMarks' },
  { game: 1, lang: 'th', family: 'karan' },
  { game: 1, lang: 'th', family: 'length' },
  { game: 1, lang: 'th', family: 'consonantClass' },
  { game: 1, lang: 'th', family: 'vowels' },
  { game: 1, lang: 'th', family: 'syllables' },
  { game: 1, lang: 'th', family: 'liveDead' },
  { game: 1, lang: 'en', family: 'firstChar' },
  { game: 1, lang: 'en', family: 'lastChar' },
  { game: 1, lang: 'en', family: 'letters' },
  { game: 1, lang: 'en', family: 'length' },
  { game: 1, lang: 'en', family: 'doubleLetter' },
  { game: 1, lang: 'en', family: 'syllables' },
  { game: 1, lang: 'en', family: 'wordType' },
  { game: 5, lang: 'th', family: 'consonantClass' },
  { game: 5, lang: 'en', family: 'wordType' },
  { game: 7, lang: 'th', family: 'syllables' },
  { game: 7, lang: 'en', family: 'syllables' },
];
/** Pool order inside the mode digits. FROZEN for the same reason as KINDS. */
export const POOL_ORDER: readonly Pool[] = ['general', 'office', 'food', 'animal'];
export const KIND_DIGITS = 2;
/** First kind number of engine 2b's block; engine 2a's KINDS stay below it. */
export const SCRIPT_KIND_BASE = 50;
export const CODE_FORMAT = 0;
export const WORD_CODE_LENGTH = SEED_DIGITS + CUT_DIGITS + 1 + KIND_DIGITS + 1 + 1 + 1;
/** Words in a game-1 hand, and so the least a quadrant may hold. */
export const HAND_SIZE = 3;
/** The values a game-5 or game-7 player can hold, in a fixed order. */
const HELD_VALUES: Partial<Record<Family, readonly CondValue[]>> = {
  consonantClass: ['high', 'mid', 'low'],
  wordType: ['noun', 'verb', 'adjective'],
  syllables: [1, 2, 3, 4],
};

// ---- pool analysis: feasible pairs, computed from the bank --------------------------------------------------------

type Game1Pair = { readonly pair: readonly [Condition, Condition]; readonly quadrants: readonly [readonly Word[], readonly Word[]] };
type HeldPair = { readonly values: readonly [CondValue, CondValue]; readonly words: readonly [readonly Word[], readonly Word[]] };
type Excluded = { readonly pair: string; readonly reason: string };
type Analysis =
  | { readonly game: 1; readonly playableWords: number; readonly values: number; readonly feasible: readonly Game1Pair[]; readonly excluded: readonly Excluded[] }
  | { readonly game: 5 | 7; readonly playableWords: number; readonly values: number; readonly feasible: readonly HeldPair[]; readonly excluded: readonly Excluded[] };

const analysisCache = new WeakMap<Banks, Map<string, Analysis>>();

function poolWords(banks: Banks, kind: Kind, pool: Pool): Word[] {
  const list = (banks[kind.lang] as Bank<Word>)[pool] ?? [];
  return list.filter((w) => playable(w) && eligibleFor(w, kind.family));
}

function analyseGame1(words: readonly Word[], family: Family): Analysis {
  const seen = new Map<string, CondValue>();
  for (const w of words) for (const v of valuesOf(w, family)) seen.set(`${typeof v}:${String(v)}`, v);
  const values = [...seen.values()].sort(compareValues);
  const feasible: Game1Pair[] = [];
  const excluded: Excluded[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a: Condition = { family, value: values[i]! };
      const b: Condition = { family, value: values[j]! };
      const q0 = words.filter((w) => holds(a, w) && !holds(b, w));
      const q1 = words.filter((w) => !holds(a, w) && holds(b, w));
      const id = `${conditionId(a)} | ${conditionId(b)}`;
      if (q0.length >= HAND_SIZE && q1.length >= HAND_SIZE) feasible.push({ pair: [a, b], quadrants: [q0, q1] });
      else excluded.push({ pair: id, reason: `A-not-B holds ${q0.length}, B-not-A holds ${q1.length}; each needs ${HAND_SIZE}` });
    }
  }
  return { game: 1, playableWords: words.length, values: values.length, feasible, excluded };
}

function analyseHeld(game: 5 | 7, words: readonly Word[], family: Family): Analysis {
  const values = HELD_VALUES[family] ?? [];
  const by = values.map((v) => words.filter((w) => holds({ family, value: v }, w)));
  const feasible: HeldPair[] = [];
  const excluded: Excluded[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const id = `${family}=${String(values[i])} | ${family}=${String(values[j])}`;
      if (by[i]!.length > 0 && by[j]!.length > 0) feasible.push({ values: [values[i]!, values[j]!], words: [by[i]!, by[j]!] });
      else excluded.push({ pair: id, reason: `first value has ${by[i]!.length} playable words, second has ${by[j]!.length}; each needs 1` });
    }
  }
  return { game, playableWords: words.length, values: values.length, feasible, excluded };
}

function analyse(banks: Banks, kind: Kind, pool: Pool): Analysis {
  let perBanks = analysisCache.get(banks);
  if (!perBanks) analysisCache.set(banks, (perBanks = new Map()));
  const key = `${kind.game}|${kind.lang}|${kind.family}|${pool}`;
  let a = perBanks.get(key);
  if (!a) {
    const words = poolWords(banks, kind, pool);
    a = kind.game === 1 ? analyseGame1(words, kind.family) : analyseHeld(kind.game, words, kind.family);
    perBanks.set(key, a);
  }
  return a;
}

export type FeasibilityRow = {
  lang: Lang;
  pool: Pool;
  game: WordGame;
  family: Family;
  playableWords: number;
  /** Distinct condition values (game 1) or holdable values (games 5, 7); under 2 means no pair exists at all. */
  values: number;
  feasible: string[];
  excluded: Excluded[];
};

/** Per language x pool x (game, family): the feasible candidate pairs and every excluded pair with its reason. */
export function feasibilityReport(banks: Banks): FeasibilityRow[] {
  const rows: FeasibilityRow[] = [];
  for (const kind of KINDS) {
    for (const pool of POOL_ORDER) {
      const a = analyse(banks, kind, pool);
      const feasible =
        a.game === 1
          ? a.feasible.map((p) => `${conditionId(p.pair[0])} | ${conditionId(p.pair[1])}`)
          : a.feasible.map((p) => `${kind.family}=${String(p.values[0])} | ${kind.family}=${String(p.values[1])}`);
      rows.push({ lang: kind.lang, pool, game: kind.game, family: kind.family, playableWords: a.playableWords, values: a.values, feasible, excluded: [...a.excluded] });
    }
  }
  return rows;
}

// ---- the code ---------------------------------------------------------------------------------------------------

/** Index of a setup's kind in KINDS; -1 when the game cannot play that family in that language. */
export function kindIndexOf(setup: Pick<WordSetup, 'game' | 'lang' | 'family'>): number {
  return KINDS.findIndex((k) => k.game === setup.game && k.lang === setup.lang && k.family === setup.family);
}

/** This build's bank revision digit. */
export function revisionDigit(banks: Banks): number {
  return (banks.revision ?? BANK_REVISION) % 10;
}

export type ParsedFamilyCode = { seed: string; cut: number; revision: number; kind: number; pool: Pool };

/** A word-family code (this engine's or engine 2b's) from its fields. */
export function familyCode(round: number, seed: string, cut: number, revision: number, kind: number, pool: Pool): string {
  if (!ROUNDS.includes(round)) throw new RangeError(`round must be one of ${ROUNDS.join(', ')}, got ${round}`);
  if (!new RegExp(`^[0-9]{${SEED_DIGITS}}$`).test(seed)) throw new RangeError(`seed must be ${SEED_DIGITS} digits`);
  if (!Number.isInteger(cut) || cut < 1 || cut >= 10 ** CUT_DIGITS) throw new RangeError(`cut out of range: ${cut}`);
  if (!Number.isInteger(revision) || revision < 0 || revision > 9) throw new RangeError(`revision digit out of range: ${revision}`);
  if (!Number.isInteger(kind) || kind < 0 || kind >= 10 ** KIND_DIGITS) throw new RangeError(`kind out of range: ${kind}`);
  const p = POOL_ORDER.indexOf(pool);
  if (p < 0) throw new RangeError('unknown pool');
  const payload = seed + String(cut).padStart(CUT_DIGITS, '0') + String(revision) + String(kind).padStart(KIND_DIGITS, '0') + String(p) + String(CODE_FORMAT);
  return payload + dammCheck(String(round) + payload);
}

/**
 * Parse a word-family code typed for `round`: null when malformed, mistyped, typed into another round, of another
 * format, naming no pool, or carrying a cut no half-cut host can mint. A half-cut deal separates the lowest `keep`
 * fate values from the rest with keep >= 1, so its cut is a fate value above the lowest one: never 0.
 */
export function parseFamilyCode(raw: string, round: number): ParsedFamilyCode | null {
  if (!ROUNDS.includes(round)) return null;
  const digits = typeof raw === 'string' ? normaliseDigits(raw) : null;
  if (digits === null || digits.length !== WORD_CODE_LENGTH) return null;
  if (dammCheck(String(round) + digits) !== 0) return null;
  let at = SEED_DIGITS;
  const cut = Number(digits.slice(at, (at += CUT_DIGITS)));
  const revision = Number(digits[at++]);
  const kind = Number(digits.slice(at, (at += KIND_DIGITS)));
  const pool = POOL_ORDER[Number(digits[at++])];
  if (cut < 1 || !pool || Number(digits[at]) !== CODE_FORMAT) return null;
  return { seed: digits.slice(0, SEED_DIGITS), cut, revision, kind, pool };
}

/** The word-round code for a seed and cut. Exported so the golden vectors can pin a fixed seed. */
export function wordCode(round: number, seed: string, cut: number, kindIndex: number, pool: Pool, revision: number = BANK_REVISION % 10): string {
  if (!KINDS[kindIndex] || kindIndex >= SCRIPT_KIND_BASE) throw new RangeError('unknown kind');
  return familyCode(round, seed, cut, revision, kindIndex, pool);
}

const THAI_ZERO = 0x0e50;

// A copy of round-code.ts normaliseDigits (not exported there): ASCII or Thai numerals, spaces and dashes ignored.
function normaliseDigits(raw: string): string | null {
  let out = '';
  for (const c of raw) {
    const cp = c.codePointAt(0)!;
    if (cp >= 48 && cp <= 57) out += c;
    else if (cp >= THAI_ZERO && cp <= THAI_ZERO + 9) out += String(cp - THAI_ZERO);
    else if (c === ' ' || c === '-') continue;
    else return null;
  }
  return out;
}

/**
 * Parse a word-round code typed for `round`; null when the family parser refuses it or it names no engine-2a kind
 * (an engine-2b code included). Every phase-1 code is refused by its length.
 */
export function parseWordCode(raw: string, round: number): ParsedWordCode | null {
  const f = parseFamilyCode(raw, round);
  if (!f || f.kind >= SCRIPT_KIND_BASE) return null;
  const kind = KINDS[f.kind];
  if (!kind) return null;
  return { seed: f.seed, cut: f.cut, revision: f.revision, kindIndex: f.kind, kind, pool: f.pool };
}

// ---- composition --------------------------------------------------------------------------------------------------

function candidatesFor(eventKey: string, round: number, seed: string, kindIndex: number, pool: Pool, a: Analysis): Candidates {
  const at = hashToScale('word-pair', [eventKey, round, seed, kindIndex, pool], a.feasible.length);
  if (a.game === 1) return { kind: 'conditions', pair: a.feasible[at]!.pair };
  const p = a.feasible[at]!;
  const pick = (i: 0 | 1) => p.words[i][hashToScale('word-candidate', [eventKey, round, seed, kindIndex, pool, i], p.words[i].length)]!;
  return { kind: 'words', family: KINDS[kindIndex]!.family, values: p.values, pair: [pick(0), pick(1)] };
}

/** A hand of HAND_SIZE distinct words from one quadrant, by a hash-driven partial shuffle (cards.ts cardFor, generalised). */
function handFrom(eventKey: string, round: number, seed: string, identity: string, quadrant: readonly Word[]): Word[] {
  const idx = quadrant.map((_, i) => i);
  const id = canonicalIdentity(identity);
  const hand: Word[] = [];
  for (let k = 0; k < HAND_SIZE; k++) {
    const j = k + hashToScale('word-hand', [eventKey, round, seed, id, k], idx.length - k);
    [idx[k], idx[j]] = [idx[j]!, idx[k]!];
    hand.push(quadrant[idx[k]!]!);
  }
  return hand;
}

function holdingFor(eventKey: string, round: number, seed: string, identity: string, kindIndex: number, pool: Pool, a: Analysis, group: 0 | 1): Holding {
  const at = hashToScale('word-pair', [eventKey, round, seed, kindIndex, pool], a.feasible.length);
  if (a.game === 1) return { kind: 'hand', words: handFrom(eventKey, round, seed, identity, a.feasible[at]!.quadrants[group]) };
  return { kind: 'value', value: a.feasible[at]!.values[group] };
}

/** Does this holding match the drawn candidate? Read from the stored cells of the dealt words only. */
export function matches(c: Candidates, holding: Holding, rule: 0 | 1): boolean {
  if (c.kind === 'conditions') {
    if (holding.kind !== 'hand') throw new TypeError('a game-1 round deals hands');
    return holding.words.every((w) => holds(c.pair[rule], w));
  }
  if (holding.kind !== 'value') throw new TypeError('a game-5 or game-7 round deals values');
  return holds({ family: c.family, value: holding.value }, c.pair[rule]);
}

/** In or out under a tap: match = survive keeps the matching holders, match = out keeps the others. */
export function survives(c: Candidates, holding: Holding, tap: RuleTap): boolean {
  return matches(c, holding, tap.rule) === (tap.polarity === 'survive');
}

export type HostWordRound = {
  code: string;
  setup: WordSetup;
  candidates: Candidates;
  holdings: Map<string, Holding>;
  /** groups[0]: the lowest `keep` fate values, dealt the first candidate's side; groups[1]: the rest. */
  groups: [string[], string[]];
  tries: number;
};

/**
 * Host side of a word round: refuses anything but a half-cut (roster = 2 x keep) and a setup with no feasible
 * pair; deals each identity its holding. The rule and the polarity are drawn later, from the host's own source.
 */
export function hostWordRound(
  eventKey: string,
  round: number,
  roster: string[],
  keep: number,
  random: () => number,
  setup: WordSetup,
  banks: Banks,
): HostWordRound {
  if (roster.length !== 2 * keep) {
    throw new RangeError(`word rounds play only half-cut rounds (live = 2 x keep); got ${roster.length} live, keep ${keep}`);
  }
  if (!familyOf(setup.lang).has(setup.family)) throw new RangeError(`${setup.lang} words carry no ${setup.family}`);
  const kindIndex = kindIndexOf(setup);
  if (kindIndex < 0) throw new RangeError(`game ${setup.game} does not play ${setup.lang} ${setup.family}`);
  if (!POOL_ORDER.includes(setup.pool)) throw new RangeError(`unknown pool ${String(setup.pool)}`);
  const a = analyse(banks, KINDS[kindIndex]!, setup.pool);
  if (a.feasible.length === 0) throw new RangeError(`no feasible pair for game ${setup.game} ${setup.lang} ${setup.pool} ${setup.family}`);
  const dealt = hostDealCuts(eventKey, round, roster, keep, random);
  const parsed = parseCode(dealt.code, round);
  if (!parsed || parsed.kind !== 'deal' || parsed.low !== parsed.high) throw new Error('a half-cut deal must carry two equal cuts');
  const code = wordCode(round, dealt.seed, parsed.low, kindIndex, setup.pool, revisionDigit(banks));
  const candidates = candidatesFor(eventKey, round, dealt.seed, kindIndex, setup.pool, a);
  const first = new Set(dealt.survivors[0]);
  const holdings = new Map<string, Holding>();
  for (const id of roster) holdings.set(id, holdingFor(eventKey, round, dealt.seed, id, kindIndex, setup.pool, a, first.has(id) ? 0 : 1));
  return { code, setup, candidates, holdings, groups: [dealt.survivors[0], dealt.survivors[1]], tries: dealt.tries };
}

/** The identities still in after the drawn rule and polarity. */
export function hostSurvivors(r: HostWordRound, tap: RuleTap): string[] {
  return [...r.holdings].filter(([, h]) => survives(r.candidates, h, tap)).map(([id]) => id);
}

export type PhoneWordRound = { setup: WordSetup; candidates: Candidates; holding: Holding };

/**
 * Phone side: this identity's holding and the two candidates, from the code alone. Refused `bad-code` when the code
 * does not parse or names a setup this bank cannot play, `stale-bank` when it was minted on another bank revision.
 */
export function phoneWordRound(eventKey: string, identity: string, round: number, code: string, banks: Banks): PhoneWordRound | Refused {
  const parsed = parseWordCode(code, round);
  if (!parsed) return { refused: 'bad-code' };
  if (parsed.revision !== revisionDigit(banks)) return { refused: 'stale-bank' };
  const a = analyse(banks, parsed.kind, parsed.pool);
  if (a.feasible.length === 0) return { refused: 'bad-code' };
  const group = fateValue(eventKey, round, parsed.seed, identity) < parsed.cut ? 0 : 1;
  const setup: WordSetup = { game: parsed.kind.game, lang: parsed.kind.lang, family: parsed.kind.family, pool: parsed.pool };
  return {
    setup,
    candidates: candidatesFor(eventKey, round, parsed.seed, parsed.kindIndex, parsed.pool, a),
    holding: holdingFor(eventKey, round, parsed.seed, identity, parsed.kindIndex, parsed.pool, a, group),
  };
}

/** Phone verdict after the rule tap, or the reason the code is refused. */
export function phoneWordVerdict(
  eventKey: string,
  identity: string,
  round: number,
  code: string,
  tap: RuleTap,
  banks: Banks,
): 'in' | 'out' | CodeRefusal {
  const r = phoneWordRound(eventKey, identity, round, code, banks);
  if ('refused' in r) return r.refused;
  return survives(r.candidates, r.holding, tap) ? 'in' : 'out';
}
