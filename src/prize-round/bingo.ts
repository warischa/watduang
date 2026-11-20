// Game 3 of the prize draw (gh#323, engine 2b): each person holds a 3 x 3 letter card, the main screen draws DRAWS
// letters one per step, and after the last draw a card with at least THRESHOLD marks matches. Pure: no DOM,
// storage or network. No word bank is read: the letters come from a fixed alphabet per language.
//
// Composition around the threshold. The alphabet is split by hash into SHARED (drawn by both candidate scripts),
// OWN_0 (script 0 only), OWN_1 (script 1 only) and REST (never drawn). Script 0 draws SHARED + OWN_0 and script 1
// SHARED + OWN_1, each in its own hash order. A group-g card holds m marks' worth from SHARED + OWN_g, of which at
// most THRESHOLD - 1 come from SHARED, plus REST filler:
//   under its own script the card scores m (THRESHOLD to MAX_OWN_MARKS), under the other only its SHARED letters
//   (0 to THRESHOLD - 1).
// So every holder of the drawn script's group ends above every other holder: "fewest marks are out" is an exact
// cut with no tie to break, which replaces the hash tiebreak sketched for this game in gh#311. Polarity is
// mechanically free ("most marks survive" or "most marks are out"); gh#311 states only the first.
//
// Barred letter sets. A set of letters that spells a word the company-party category must never show (its owner is
// that category's Avoid line in CONTEXT.md) loses one hash-picked member per round before the split: the split runs
// over the rest of the alphabet, so no card, script or card row can hold a full set. The alphabet stays whole; REST
// shrinks by the exclusion count, and detail.excluded names the letters left out so any later generator can draw
// from the same universe.

import type { Lang } from '../prize-words/schema.ts';
import { hashToScale } from '../prize-draw/round-code.ts';
import { hashOrder, idPart, pickDistinct, type ComposeCtx, type Composed, type Composer } from './script-kit.ts';

/** Thai consonants of the 44-consonant table less the two obsolete ones (U+0E03, U+0E05): 42 letters. */
const THAI_ALPHABET = [...'กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'];
const ENGLISH_ALPHABET = [...'abcdefghijklmnopqrstuvwxyz'];
export const BINGO_ALPHABET: Readonly<Record<Lang, readonly string[]>> = { th: THAI_ALPHABET, en: ENGLISH_ALPHABET };

/** Per language, the letter sets no round may deal in full. Thai letters are written as escapes on purpose. */
export const BINGO_BARRED: Readonly<Record<Lang, readonly (readonly string[])[]>> = { th: [['\u0e2b', '\u0e27', '\u0e22']], en: [] };

export const CARD_SIZE = 9;
export const DRAWS = 12;
export const SHARED = 6;
export const THRESHOLD = 4;
/** Highest score a card reaches under its own script; spread so a survivor's card is not always at the threshold. */
export const MAX_OWN_MARKS = 6;

export const BINGO: Composer = {
  threshold: THRESHOLD,
  infeasible(_banks, setup) {
    return setup.pool === 'general' ? null : 'game 3 reads no word pool; it plays only under the general pool digit';
  },
  compose(ctx: ComposeCtx): Composed {
    const base = [ctx.eventKey, ctx.round, ctx.seed, ctx.setup.lang];
    const excluded: string[] = [];
    BINGO_BARRED[ctx.setup.lang].forEach((set, i) => {
      if (!set.some((x) => excluded.includes(x))) excluded.push(set[hashToScale('bingo-never', [...base, i], set.length)]!);
    });
    const universe = BINGO_ALPHABET[ctx.setup.lang].filter((x) => !excluded.includes(x));
    const order = hashOrder('bingo-split', base, universe);
    const own = DRAWS - SHARED;
    const shared = order.slice(0, SHARED);
    const sides = [order.slice(SHARED, SHARED + own), order.slice(SHARED + own, SHARED + 2 * own)] as const;
    const rest = order.slice(SHARED + 2 * own);
    const scripts = [hashOrder('bingo-draw', [...base, 0], [...shared, ...sides[0]]), hashOrder('bingo-draw', [...base, 1], [...shared, ...sides[1]])] as const;
    return {
      scripts,
      detail: { shared, sides, rest, excluded },
      holding: (identity, group) => {
        const p = [...base, idPart(identity)];
        const m = THRESHOLD + hashToScale('bingo-marks', p, MAX_OWN_MARKS - THRESHOLD + 1);
        const zLow = Math.max(0, m - own);
        const zHigh = Math.min(THRESHOLD - 1, m, SHARED);
        const z = zLow + hashToScale('bingo-shared', p, zHigh - zLow + 1);
        const card = [
          ...pickDistinct('bingo-card-shared', p, shared, z),
          ...pickDistinct('bingo-card-own', p, sides[group], m - z),
          ...pickDistinct('bingo-card-rest', p, rest, CARD_SIZE - m),
        ];
        return hashOrder('bingo-grid', p, card);
      },
    };
  },
};
