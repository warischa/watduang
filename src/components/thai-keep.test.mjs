// node --test — gh#295 A6. A browser's Thai dictionary splits some words where no Thai reader would
// (a tagline rendered as one word broken across two lines at 325-415px in Chrome). keepThaiWords() glues
// each listed word with U+2060 WORD JOINER between every grapheme cluster, so no engine can break inside
// it whatever its own dictionary says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepThaiWords, KEEP_WORDS } from './thai-keep.ts';

const WJ = '\u2060';
const words = new Intl.Segmenter('th', { granularity: 'word' });

test('every listed word is one that ICU actually splits (a word ICU keeps whole needs no entry)', () => {
  for (const w of KEEP_WORDS) {
    const inner = [...words.segment(w)].filter((s) => s.index > 0);
    assert.ok(inner.length > 0, `${w} has no inner ICU boundary: drop it from the list`);
  }
});

test('a listed word leaves no break opportunity between any two of its characters', () => {
  for (const w of KEEP_WORDS) {
    const out = keepThaiWords(w);
    const chars = [...out];
    for (let i = 1; i < chars.length; i++) {
      if (chars[i] === WJ || chars[i - 1] === WJ) continue;
      // two adjacent non-joiner characters must be one grapheme cluster (a base and its mark)
      const pair = chars[i - 1] + chars[i];
      const clusters = [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(pair)];
      assert.equal(clusters.length, 1, `${w}: an open boundary between ${chars[i - 1]} and ${chars[i]}`);
    }
  }
});

test('the visible text is unchanged: stripping the joiners gives back the input', () => {
  const s = 'กดครั้งเดียว รู้เลยว่าวันนี้จะเจอเรื่องจิ๊บจ๊อยอะไร อ่านขำๆ ไม่ต้องเชื่อ';
  const out = keepThaiWords(s);
  assert.notEqual(out, s, 'the daily-fortune tagline carries listed words: something must be glued');
  assert.equal(out.replaceAll(WJ, ''), s);
});

test('no joiner sits before a combining mark or SARA AM (that would orphan it into a dotted circle)', () => {
  for (const w of KEEP_WORDS) {
    const out = keepThaiWords(w);
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i] === WJ) assert.doesNotMatch(out[i + 1], /[\p{M}ำ]/u, `joiner before a mark in ${w}`);
    }
  }
});

test('text with no listed word passes through untouched', () => {
  const s = 'เขย่ามือถือเสี่ยงเซียมซี เปิดดูใบทำนายของคุณ';
  assert.equal(keepThaiWords(s), s);
});
