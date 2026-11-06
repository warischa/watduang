// node --test — gh#295 A6. Chrome's ICU dictionary splits some Thai words where no Thai reader would
// (a tagline rendered as one word broken across two lines at 325-415px). keepThaiWords() glues each
// listed word with U+2060 WORD JOINER at exactly the boundaries ICU invents inside it, so the line
// breaker can no longer use them. Node ships the same ICU, so a boundary found here is one Chrome uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepThaiWords, KEEP_WORDS } from './thai-keep.ts';

const WJ = '⁠';
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const innerBounds = (s) => [...seg.segment(s)].map((x) => x.index).filter((i) => i > 0);

test('every listed word is one that ICU actually splits (a word ICU keeps whole needs no entry)', () => {
  for (const w of KEEP_WORDS) {
    assert.ok(innerBounds(w).length > 0, `${w} has no inner ICU boundary: drop it from the list`);
  }
});

test('a joiner lands at every inner ICU boundary of a listed word, and nowhere else', () => {
  for (const w of KEEP_WORDS) {
    const out = keepThaiWords(`ก่อน ${w} หลัง`);
    const glued = out.slice(out.indexOf(' ') + 1, out.lastIndexOf(' '));
    const expected = [...w].map((ch, i) => (innerBounds(w).includes(i) ? WJ : '') + ch).join('');
    assert.equal(glued, expected, `${w} glued wrongly`);
  }
});

test('the visible text is unchanged: stripping the joiners gives back the input', () => {
  const s = 'กดครั้งเดียว รู้เลยว่าวันนี้จะเจอเรื่องจิ๊บจ๊อยอะไร อ่านขำๆ ไม่ต้องเชื่อ';
  const out = keepThaiWords(s);
  assert.notEqual(out, s, 'the daily-fortune tagline carries listed words: something must be glued');
  assert.equal(out.replaceAll(WJ, ''), s);
});

test('no joiner sits before a combining mark (that would orphan the mark into a dotted circle)', () => {
  for (const w of KEEP_WORDS) {
    const out = keepThaiWords(w);
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i] === WJ) assert.doesNotMatch(out[i + 1], /\p{M}/u, `joiner before a mark in ${w}`);
    }
  }
});

test('text with no listed word passes through untouched', () => {
  const s = 'เขย่ามือถือเสี่ยงเซียมซี เปิดดูใบทำนายของคุณ';
  assert.equal(keepThaiWords(s), s);
});
