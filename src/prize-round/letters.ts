// Game 2 of the prize draw (gh#323, engine 2b): each person holds one letter tile, and a hidden word is revealed one
// written character per step. Pure: no DOM, storage or network.
//
// Two candidate hidden words (A, B) from the round's pool. Group 0 holds a tile from letters(A) minus letters(B),
// group 1 from letters(B) minus letters(A), both read from the stored `letters` cell. Whichever word is drawn, its
// characters hit every holder of its own side and nobody on the other side, so the hit set is exactly one group.
// Polarity is meaningful: "a revealed letter knocks its holders out" or "saves them".
//
// Tile alphabet: any codepoint the stored `letters` cell lists, vowel signs and tone marks included, as Thai
// crossword tiles do; a combining tile is shown on a dotted circle (conditions.ts). Each step reveals one letter of
// the stored `letters` cell, and only those: scoring reads the stored cell, never the spelling. `text` decides
// only the ORDER of the steps (first appearance in the written word); a stored letter the text lacks is revealed
// after the rest, in stored order, so a cell that disagrees with its text still scores by the cell.

import { hashToScale } from '../prize-draw/round-code.ts';
import type { Bank } from '../prize-words/schema.ts';
import { eligibleFor, playable, type Word } from './conditions.ts';
import type { Banks } from './round.ts';
import { idPart, pickDistinct, type ComposeCtx, type Composed, type Composer, type ScriptSetup } from './script-kit.ts';

/** Least number of distinct tiles each side of a pair offers, so a group never all holds one tile by construction. */
export const MIN_TILES_PER_SIDE = 2;

type LetterPair = { readonly words: readonly [Word, Word]; readonly sides: readonly [readonly string[], readonly string[]] };
type LetterAnalysis = { readonly playableWords: number; readonly pairs: readonly LetterPair[]; readonly excluded: number };

const cache = new WeakMap<Banks, Map<string, LetterAnalysis>>();

function sideOf(a: Word, b: Word): string[] {
  const other = new Set(b.letters);
  return a.letters.filter((c) => !other.has(c));
}

export function analyseLetters(banks: Banks, setup: ScriptSetup): LetterAnalysis {
  let per = cache.get(banks);
  if (!per) cache.set(banks, (per = new Map()));
  const key = `${setup.lang}|${setup.pool}`;
  let a = per.get(key);
  if (!a) {
    const words = ((banks[setup.lang] as Bank<Word>)[setup.pool] ?? []).filter((w) => playable(w) && eligibleFor(w, 'letters'));
    const pairs: LetterPair[] = [];
    let excluded = 0;
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const s0 = sideOf(words[i]!, words[j]!);
        const s1 = sideOf(words[j]!, words[i]!);
        if (s0.length >= MIN_TILES_PER_SIDE && s1.length >= MIN_TILES_PER_SIDE) pairs.push({ words: [words[i]!, words[j]!], sides: [s0, s1] });
        else excluded++;
      }
    }
    a = { playableWords: words.length, pairs, excluded };
    per.set(key, a);
  }
  return a;
}

/** The stored letters of `w`, ordered by first appearance in its text for display; the set is the stored cell. */
export function revealOrder(w: Word): string[] {
  const at = (c: string) => {
    const i = [...w.text].indexOf(c);
    return i < 0 ? Infinity : i;
  };
  return w.letters.map((c, i) => ({ c, i, at: at(c) })).sort((x, y) => x.at - y.at || x.i - y.i).map((x) => x.c);
}

export const LETTERS: Composer = {
  threshold: 1,
  infeasible(banks, setup) {
    const a = analyseLetters(banks, setup);
    return a.pairs.length > 0 ? null : `${a.playableWords} playable words give no pair with ${MIN_TILES_PER_SIDE} tiles on each side`;
  },
  compose(ctx: ComposeCtx): Composed {
    const a = analyseLetters(ctx.banks, ctx.setup);
    const base = [ctx.eventKey, ctx.round, ctx.seed, ctx.setup.lang, ctx.setup.pool];
    const pair = a.pairs[hashToScale('letters-pair', base, a.pairs.length)]!;
    return {
      scripts: [revealOrder(pair.words[0]), revealOrder(pair.words[1])],
      detail: { words: pair.words.map((w) => w.id), sides: pair.sides },
      holding: (identity, group) => pickDistinct('letters-tile', [...base, idPart(identity)], pair.sides[group], 1),
    };
  },
};
