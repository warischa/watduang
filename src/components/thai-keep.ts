// gh#295 A6. The browser breaks Thai lines at its ICU dictionary's word boundaries, and that dictionary
// misses some everyday words: it reads one as two and the line breaker splits it, e.g. the daily-fortune
// tagline wrapped mid-word at 325-415px on the home page and the fortune category page.
//
// keepThaiWords() inserts U+2060 WORD JOINER at exactly the boundaries ICU invents INSIDE a listed word,
// so those boundaries stop being break opportunities. The visible text is unchanged, and the joiner is
// added at render time, so the manifest copy (and the OG lock that pins it) stays byte-exact.
//
// The list is a set this repo owns, grown one word at a time: ICU's dictionary is not ours, so no rule
// can enumerate every word it splits. An Intl.Segmenter-based meter shares the browser's dictionary and
// is blind to these breaks by construction; only a rendered check of a named word can see one.
const WJ = '⁠';

export const KEEP_WORDS: readonly string[] = ['อ่านขำๆ', 'จิ๊บจ๊อยอะไร'];

const seg = new Intl.Segmenter('th', { granularity: 'word' });

function glue(word: string): string {
  const cuts = new Set([...seg.segment(word)].map((s) => s.index).filter((i) => i > 0));
  return [...word].map((ch, i) => (cuts.has(i) ? WJ : '') + ch).join('');
}

const GLUED = KEEP_WORDS.map((w) => [w, glue(w)] as const);

export function keepThaiWords(text: string): string {
  let out = text;
  for (const [word, glued] of GLUED) out = out.split(word).join(glued);
  return out;
}
