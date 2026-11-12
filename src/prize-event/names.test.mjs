// node --test — the name channel of a prize-draw event: the one validity rule (checkName, held to the
// join server's rule, gh#308) and what a typed roster becomes before any screen sees it. Pure, no DOM.
// The DOM sink has its own tests beside each screen. Invisible characters are written as escapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAME_CAP, checkName, graphemeCount, isCleanName, nameIssue, nameKey, normaliseName, parseRoster } from './names.ts';

const DDO = 'ฒ'; // the widest Thai letter (gh#302 NAME FIT row)
const SARA_AM = 'ำ';
const no = (raw, reason) => assert.deepEqual(checkName(raw), { ok: false, reason }, JSON.stringify(raw));
const ok = (raw) => {
  const r = checkName(raw);
  assert.equal(r.ok, true, `${JSON.stringify(raw)} should pass, got ${JSON.stringify(r)}`);
  return r.name;
};

test('the cap is 12 clusters (owner ruling 2026-11-11)', () => {
  assert.equal(NAME_CAP, 12);
});

test('clusters, not code points: marks join the consonant before them', () => {
  const name = 'น้ำตาล';
  assert.ok([...name].length > graphemeCount(name), 'this input cannot tell clusters from code points');
  assert.equal(graphemeCount('WWWWWWWWWWWW'), 12);
});

test('12 clusters pass and 13 fail, in Latin and in Thai with marks (where a code-point cap would differ)', () => {
  ok('W'.repeat(12));
  no('W'.repeat(13), 'too-long');
  ok('ก้'.repeat(12));
  no('ก้'.repeat(13), 'too-long');
  assert.equal(ok((DDO + SARA_AM).repeat(12)), (DDO + SARA_AM).repeat(12), 'the widest valid Thai name');
});

test('the allowlist: Thai, ASCII letters and digits, space . - \' _ pass verbatim', () => {
  for (const name of ['Bee.K', "O'Neil", 'nam_2', 'a-b', 'บีม ก.', '๑๒๓']) assert.equal(ok(name), name);
});

test('markup and other symbols are charset, pictographs are emoji', () => {
  for (const raw of ['<img src=x>', 'a@b', '50%', 'Zoë', '๏', '฿']) no(raw, 'charset');
  for (const raw of ['\u{1F600}ab', '\u{1F1F9}\u{1F1ED}', 'ton❤']) no(raw, 'emoji');
});

test('bidi, zero-width and control characters are refused as control, never stripped into a different name', () => {
  for (const raw of ['‮abc‬', 'a⁦b⁩', 'ab‏', 'a​b', 'a‍b', 'a\u0000b', 'a\tb']) no(raw, 'control');
  assert.equal(normaliseName('‮abc'), '‮abc', 'normalising must not repair a name');
  no('ab\uD800', 'lone-surrogate');
});

test('a mark needs a Thai consonant under it', () => {
  no('ิabc', 'leading-mark');
  no('aิ', 'leading-mark');
  no('เิ', 'leading-mark'); // on a vowel letter
});

test('stacked marks: over 3 code points, a repeated mark, or SARA AM out of place', () => {
  ok('กิ้');
  no('กิุ่', 'stacked-marks');
  no('ก่่', 'stacked-marks');
  ok(DDO + SARA_AM);
  ok('น้' + SARA_AM);
  no(DDO + SARA_AM.repeat(23), 'stacked-marks');
  no('ก' + SARA_AM + SARA_AM, 'stacked-marks');
  no('กั' + SARA_AM, 'stacked-marks');
});

test('normalising: NFC, whitespace collapsed and trimmed', () => {
  assert.equal(ok('  นุ่น   ท.  '), 'นุ่น ท.');
  assert.equal(normaliseName('é'), 'é');
});

test('the uniqueness key folds case and spaces, the two spellings of SARA AM, and mark order', () => {
  assert.equal(nameKey('Bee K'), nameKey('beek'));
  assert.notEqual(nameKey('Bee K'), nameKey('Bee L'));
  assert.equal(nameKey('ก' + SARA_AM), nameKey('กํา'));
  assert.equal(nameKey('กิ้'), nameKey('ก้ิ'));
});

test('parseRoster: one name per line, blanks dropped, refusals and duplicates reported, never repaired or merged', () => {
  const r = parseRoster(['Aom T.', '', '  aom   t. ', 'Ploy', '‮Ploy', 'W'.repeat(13)].join('\r\n'));
  assert.deepEqual(r.names, ['Aom T.', 'Ploy']);
  assert.deepEqual(r.duplicates, ['aom t.']);
  assert.deepEqual(r.refused, [
    { name: '‮Ploy', issue: 'control' },
    { name: 'W'.repeat(13), issue: 'too-long' },
  ]);
});

test('isCleanName: a stored name must be exactly what checkName stores', () => {
  assert.equal(isCleanName('Aom T.'), true);
  assert.equal(isCleanName(' Aom'), false);
  assert.equal(isCleanName('<b>'), false);
  assert.equal(isCleanName(42), false);
  assert.equal(nameIssue('Aom'), null);
});
