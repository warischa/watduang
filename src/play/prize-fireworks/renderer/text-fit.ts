// The gh#302 NAME FIT rule for text the fireworks reveal paints into canvases (gh#305). The 2D reveal
// applies the same rule to DOM boxes (names-dom.ts); a canvas has no layout, so this computes the size and
// line breaks a browser would give that box: render at the surface size; if the text plus 2% slack
// overflows, shrink 1px at a time; at the floor, wrap (white-space normal with overflow-wrap anywhere:
// spaces first, then between grapheme clusters). Never clipped, never truncated.

/** Width of `text` at `size` px in the surface's face. */
export type Measure = (text: string, size: number) => number;
export type Fit = { size: number; lines: string[] };

export const FIT_SLACK = 1.02;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Grapheme clusters: a Thai letter keeps its vowel and tone marks. */
export function graphemes(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  return Array.from(text);
}

/** Break `text` into lines no wider than `box` at `size`: at spaces first, inside a word only when the word
 *  alone is wider than the box. A cluster wider than the box takes a line of its own. */
export function wrapLines(text: string, measure: Measure, size: number, box: number): string[] {
  const lines: string[] = [];
  let line = '';
  const push = (): void => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of text.split(' ').filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size) <= box) {
      line = candidate;
      continue;
    }
    push();
    if (measure(word, size) <= box) {
      line = word;
      continue;
    }
    for (const cluster of graphemes(word)) {
      if (line && measure(line + cluster, size) > box) push();
      line += cluster;
    }
  }
  push();
  return lines.length ? lines : [''];
}

export function fitName(text: string, measure: Measure, size: number, floor: number, box: number): Fit {
  for (let px = size; px >= floor; px -= 1) {
    if (measure(text, px) * FIT_SLACK <= box) return { size: px, lines: [text] };
  }
  return { size: floor, lines: wrapLines(text, measure, floor, box) };
}
