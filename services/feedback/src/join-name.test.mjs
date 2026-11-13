// gh#308: a joined name is attacker-owned text that ends up on a projector (the ADR-0026 channel
// class). The server admits names from a set of characters it owns (Thai, ASCII letters and digits,
// space and four punctuation marks) and bounds how marks stack; everything else is refused with a
// reason. The sink still escapes: the rules here do not substitute for that (ADR-0076).
// Invisible characters and lone marks are written as escapes, never as literal characters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAME_MAX_GRAPHEMES, NAME_MAX_UNITS, checkName, nameKey } from './join.mjs';

const ok = (raw) => {
  const out = checkName(raw);
  assert.equal(out.ok, true, `${JSON.stringify(raw)} should pass, got ${JSON.stringify(out)}`);
  return out;
};
const no = (raw, reason) => {
  const out = checkName(raw);
  assert.deepEqual(out, { ok: false, reason }, `${JSON.stringify(raw)}`);
};

test('the allowed set: Thai, ASCII letters and digits, space and . - \' _ pass verbatim', () => {
  for (const name of ['ต้นข้าว', 'Ton', 'ton_99', "O'Neil", 'a.b-c', 'แม่น้ำ', '\u0E51\u0E52\u0E53', 'ฤดี']) assert.equal(ok(name).name, name);
});

test('markup is refused: < > & = and quotes are outside the allowed set', () => {
  for (const raw of ['<b>ต้น</b>', '<img src=x>', 'A&amp;B', 'say "hi"']) no(raw, 'charset');
});

test('an invisible combining character that is not a control is refused (deny-lists cannot list these)', () => {
  // COMBINING GRAPHEME JOINER: invisible, general category Mn, so no control or format class holds it.
  no('T\u034Fon', 'charset');
  assert.equal(ok('Ton').name, 'Ton');
  // Hangul filler, braille blank, choseong filler, a Latin accent.
  for (const raw of ['ab\u3164c', 'ab\u2800c', 'ab\u115Fc', 'x\u0301']) no(raw, 'charset');
});

test('other scripts, accented Latin, full-width forms and emoji are refused with a reason', () => {
  for (const raw of ['Привет', 'caf\u00E9', '\uFF34on', '\u4E2D\u6587', '\u0E3F100']) no(raw, 'charset');
  for (const raw of ['\u{1F600}ab', '\u{1F1F9}\u{1F1ED}', 'ton\u2764']) no(raw, 'emoji');
});

test('the cap counts clusters: 12 Thai clusters with marks pass, 13 do not', () => {
  // One cluster each: a consonant, a below vowel and a tone mark; and a consonant, a tone mark and SARA AM.
  assert.equal(NAME_MAX_GRAPHEMES, 12);
  for (const cluster of ['ปู่', 'น้ำ']) {
    assert.equal(ok(cluster.repeat(12)).name, cluster.repeat(12));
    no(cluster.repeat(13), 'too-long');
  }
  no('a'.repeat(13), 'too-long');
  assert.equal(ok('a'.repeat(12)).name.length, 12);
});

test('a raw size ceiling holds before anything is counted: one consonant under many marks', () => {
  no('\u0E01' + '\u0E48'.repeat(NAME_MAX_UNITS), 'too-long');
});

test('marks stack at most two on a consonant, never twice the same, never on anything else', () => {
  ok('ปู่');
  no('\u0E01\u0E34\u0E38\u0E48', 'stacked-marks'); // three marks
  no('\u0E01\u0E48\u0E48', 'stacked-marks'); // the same tone mark twice prints as one
  no('a\u0E48', 'leading-mark'); // a Thai tone mark on a Latin letter
  no('ab \u0E48c', 'leading-mark'); // on a space
  no('\u0E40\u0E48', 'leading-mark'); // on a leading vowel letter
  no('\u0E51\u0E48', 'leading-mark'); // on a Thai digit
});

test('SARA AM: once per cluster, only after a consonant or a tone mark', () => {
  ok('กำ');
  ok('น้ำ');
  // Measured on the gh#302 boards: SARA AM widens the cluster but never leaves it, so this is one cluster.
  no('\u0E12' + '\u0E33'.repeat(23), 'stacked-marks');
  no('\u0E01\u0E33\u0E33', 'stacked-marks');
  no('\u0E01\u0E31\u0E33', 'stacked-marks'); // after MAI HAN-AKAT
  no('\u0E33', 'leading-mark');
  no('\u0E40\u0E33', 'leading-mark');
});

test('bidi controls, format and control characters are refused, wherever they sit', () => {
  for (const raw of [
    'abc\u202Eevil', // RIGHT-TO-LEFT OVERRIDE
    '\u2067abc', // RIGHT-TO-LEFT ISOLATE
    'ab\u200Fc', // RIGHT-TO-LEFT MARK
    'ab\u200Bc', // ZERO WIDTH SPACE
    'ab\u200Dc', // ZERO WIDTH JOINER
    '\uFEFFabc', // BOM
    'ab\u0000c',
    'ab\nc',
    'ab\u2028c', // LINE SEPARATOR
    'ab\uE000c', // private use
  ]) no(raw, 'control');
});

test('a lone surrogate is refused, including one that arrives through a JSON escape', () => {
  no('ab\uD800', 'lone-surrogate');
  no(JSON.parse('"\\udc00ab"'), 'lone-surrogate');
});

test('empty, blank and leading-mark names are refused; spaces collapse', () => {
  no('', 'empty');
  no('   \u3000 ', 'empty');
  no(undefined, 'empty');
  no(42, 'empty');
  no('\u0E49abc', 'leading-mark');
  assert.equal(ok('  ต้น   ข้าว  ').name, 'ต้น ข้าว');
  assert.equal(ok('ต้น\u00A0ข้าว').name, 'ต้น ข้าว', 'a no-break space is a space');
});

test('the stored name is NFC: two orders of marks with different classes store as one', () => {
  assert.equal(ok('\u0E01\u0E48\u0E38').name, ok('\u0E01\u0E38\u0E48').name);
});

test('the uniqueness key folds what reads the same on a projector', () => {
  const key = (raw) => nameKey(ok(raw).name);
  assert.equal(key('TON'), key('ton'));
  assert.equal(key('ต้น ข้าว'), key('ต้นข้าว'));
  // SARA AM against NIKHAHIT + SARA AA, with the tone mark typed on either side of NIKHAHIT.
  assert.equal(key('น้ำ'), key('\u0E19\u0E49\u0E4D\u0E32'));
  assert.equal(key('น้ำ'), key('\u0E19\u0E4D\u0E49\u0E32'));
  assert.equal(key('แม่'), key('\u0E40\u0E40\u0E21\u0E48'), 'two SARA E read as SARA AE');
  assert.equal(key('\u0E01\u0E34\u0E48'), key('\u0E01\u0E48\u0E34'), 'mark order on one consonant is lost');
  assert.equal(key('ขวด'), key('\u0E03\u0E27\u0E14'), 'KHO KHUAT reads as KHO KHAI');
  assert.equal(key('คน'), key('\u0E05\u0E19'), 'KHO KHON reads as KHO KHWAI');
  assert.notEqual(key('ต้น'), key('ตัน'), 'different Thai words stay apart');
  assert.notEqual(key('T-on'), key('Ton'), 'punctuation is kept');
  assert.match(nameKey('x'), /^[0-9a-f]{64}$/, 'the key is a blob-name-safe hash');
});
