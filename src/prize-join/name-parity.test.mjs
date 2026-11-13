// node --test — gh#308: the phone join page refuses exactly what the join server refuses, for the same
// reason, and folds names to the same uniqueness key. Three validators run every case:
//   - the page's own (join.ts validateJoinName), the one the form calls before it sends;
//   - the event's (src/prize-event/names.ts checkName), the rule admin-typed names pass;
//   - the server's (services/feedback/src/join.mjs checkName), the one that decides.
// The cases are the inputs where a drifted rule would show: markup, over-long names (by clusters and by
// UTF-16 units), Thai combining marks, zero-width and bidi characters, mixed scripts, outer and inner
// whitespace. Invisible characters are written as escapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { joinNameKey, validateJoinName } from './join.ts';
import { checkName as eventCheck, nameKey as eventKey } from '../prize-event/names.ts';
import { checkName as serverCheck, nameKey as serverKey } from '../../services/feedback/src/join.mjs';

const DDO = 'ฒ';
const AM = 'ำ';

/** Every case, with the verdict the server gives today: a name or a reason. */
const CASES = [
  // accepted, verbatim or normalised
  ['ต้น', { name: 'ต้น' }],
  ['ต้น ส.', { name: 'ต้น ส.' }],
  ['  ต้น  ', { name: 'ต้น' }],
  ['a    b', { name: 'a b' }],
  [' Bee　K', { name: 'Bee K' }],
  ['Bee บีม', { name: 'Bee บีม' }],
  ["O'Neil", { name: "O'Neil" }],
  ['nam_2.x-y', { name: 'nam_2.x-y' }],
  ['๑๒๓', { name: '๑๒๓' }],
  ['น้ำ', { name: 'น้ำ' }],
  ['ก่ำ', { name: 'ก่ำ' }],
  ['W'.repeat(12), { name: 'W'.repeat(12) }],
  [(DDO + AM).repeat(12), { name: (DDO + AM).repeat(12) }],
  ['ก้'.repeat(12), { name: 'ก้'.repeat(12) }],
  ['กํา', { name: 'กํา' }],
  ['ฃ', { name: 'ฃ' }],
  // markup and symbols
  ['<img src=x>', { reason: 'charset' }],
  ['<a href=x>', { reason: 'charset' }],
  ['"><b>', { reason: 'charset' }],
  ['a&amp;b', { reason: 'charset' }],
  ['a@b', { reason: 'charset' }],
  ['฿', { reason: 'charset' }],
  ['๏', { reason: 'charset' }],
  // mixed and look-alike scripts
  ['Zoë', { reason: 'charset' }],
  ['аdmin', { reason: 'charset' }],
  ['Bee 李', { reason: 'charset' }],
  // over-long
  ['W'.repeat(13), { reason: 'too-long' }],
  [(DDO + AM).repeat(13), { reason: 'too-long' }],
  ['ก้'.repeat(13), { reason: 'too-long' }],
  ['a'.repeat(65), { reason: 'too-long' }],
  ['a '.repeat(40), { reason: 'too-long' }],
  ['<img src=x onerror=alert(1)>', { reason: 'charset' }],
  ['<b>'.repeat(22), { reason: 'too-long' }],
  // Thai combining marks
  ['่ก', { reason: 'leading-mark' }],
  ['ก ่', { reason: 'leading-mark' }],
  ['a่', { reason: 'leading-mark' }],
  ['1ิ', { reason: 'leading-mark' }],
  ['เ่', { reason: 'leading-mark' }],
  [AM, { reason: 'leading-mark' }],
  ['กิ่้', { reason: 'stacked-marks' }],
  ['ก้้', { reason: 'stacked-marks' }],
  ['ก' + AM + AM, { reason: 'stacked-marks' }],
  ['กิ' + AM, { reason: 'stacked-marks' }],
  // zero-width, bidi, controls, separators
  ['a​b', { reason: 'control' }],
  ['a‌b', { reason: 'control' }],
  ['a‍b', { reason: 'control' }],
  ['﻿a', { reason: 'control' }],
  ['a⁠b', { reason: 'control' }],
  ['‮abc‬', { reason: 'control' }],
  ['⁦abc⁩', { reason: 'control' }],
  ['a\nb', { reason: 'control' }],
  ['a\tb', { reason: 'control' }],
  ['a b', { reason: 'control' }],
  ['a­b', { reason: 'control' }],
  // emoji
  ['Bee 🙂', { reason: 'emoji' }],
  ['🇹🇭', { reason: 'emoji' }],
  // empty and malformed
  ['', { reason: 'empty' }],
  ['   ', { reason: 'empty' }],
  [123, { reason: 'empty' }],
  [null, { reason: 'empty' }],
  ['a\uD800b', { reason: 'lone-surrogate' }],
];

const verdict = (r) => (r.ok ? { name: r.name } : { reason: r.reason });
const label = (raw) => JSON.stringify(raw);

test('the server rule gives the verdict each case is written with (the cases are not stale)', () => {
  for (const [raw, want] of CASES) assert.deepEqual(verdict(serverCheck(raw)), want, label(raw));
});

test('every case: page, event and server agree on accept or refuse, the reason, and the stored name', () => {
  const reasons = new Set();
  for (const [raw] of CASES) {
    const server = verdict(serverCheck(raw));
    assert.deepEqual(verdict(validateJoinName(raw)), server, `page vs server on ${label(raw)}`);
    assert.deepEqual(verdict(eventCheck(raw)), server, `event vs server on ${label(raw)}`);
    if (server.reason) reasons.add(server.reason);
  }
  // Positive control: the cases reach every reason the server can give.
  assert.deepEqual([...reasons].sort(), ['charset', 'control', 'emoji', 'empty', 'leading-mark', 'lone-surrogate', 'stacked-marks', 'too-long']);
});

test('every accepted case: the page key hashes to the server key, and the event key is the same text', () => {
  const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
  let accepted = 0;
  for (const [raw] of CASES) {
    const r = serverCheck(raw);
    if (!r.ok) continue;
    accepted += 1;
    assert.equal(sha(joinNameKey(r.name)), serverKey(r.name), `page key vs server key on ${label(raw)}`);
    assert.equal(joinNameKey(r.name), eventKey(r.name), `page key vs event key on ${label(raw)}`);
  }
  assert.ok(accepted >= 10, 'positive control: enough accepted cases to compare keys');
});

test('names the server treats as one (taken) are one on the page too, and distinct names stay distinct', () => {
  const same = [
    ['Bee', 'bee'],
    ['Bee K', 'BeeK'],
    ['เเก', 'แก'],
    ['ฃวด', 'ขวด'],
    ['ฅน', 'คน'],
    ['น้ำ', 'น้ํา'],
  ];
  for (const [a, b] of same) {
    assert.equal(serverKey(a), serverKey(b), `server folds ${label(a)} and ${label(b)}`);
    assert.equal(joinNameKey(a), joinNameKey(b), `page folds ${label(a)} and ${label(b)}`);
  }
  assert.notEqual(joinNameKey('ต้น'), joinNameKey('ต้น ส.'));
  assert.notEqual(serverKey('ต้น'), serverKey('ต้น ส.'));
});
