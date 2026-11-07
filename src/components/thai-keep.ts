// gh#295 A6. The browser breaks Thai lines at its own dictionary's word boundaries, and that dictionary
// misses some everyday words: it reads one as two and the line breaker splits it, e.g. the daily-fortune
// tagline wrapped mid-word at 325-415px on the home page and the fortune category page (Chrome).
//
// keepThaiWords() puts U+2060 WORD JOINER between every grapheme cluster of a listed word, so no engine
// can break inside it, whatever its dictionary says (Chrome, WebKit and Firefox need not agree on where
// a word ends). Grapheme clusters keep every mark, and SARA AM, on its base: no joiner can orphan one into
// a dotted circle. The visible text is unchanged, and the joiner is added at render time, so the manifest
// copy (and the OG lock that pins it) stays byte-exact.
//
// The list is a set this repo owns, grown one word at a time: a browser dictionary is not ours, so no
// rule can enumerate every word one splits. An Intl.Segmenter-based meter shares the browser's dictionary
// and is blind to these breaks by construction; only a rendered check of a named word can see one.
const WJ = '\u2060';

// gh#295 B1 added the privacy policy title's compound and the feedback page's name: the rendered sweep
// in that ticket's evidence saw Chrome split the first, and the verb that opens the second, across two
// lines on the policy page at phone widths. The verb alone is one ICU word, split only in context, so
// the entry is the whole name it sits in.
export const KEEP_WORDS: readonly string[] = ['อ่านขำๆ', 'จิ๊บจ๊อยอะไร', 'ความเป็นส่วนตัว', 'ติชมและเสนอเกม'];

const graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' });

function glue(word: string): string {
  return [...graphemes.segment(word)].map((g) => g.segment).join(WJ);
}

const GLUED = KEEP_WORDS.map((w) => [w, glue(w)] as const);

export function keepThaiWords(text: string): string {
  let out = text;
  for (const [word, glued] of GLUED) out = out.split(word).join(glued);
  return out;
}
