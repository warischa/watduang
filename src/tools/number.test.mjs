// node --test 'src/**/*.test.mjs' — no framework, no dependency
// Covers the pure random-number logic exported from number.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickNumber, rangeError } from './number.ts';

test('pickNumber คืนเลขที่อยู่ในช่วงเสมอ', () => {
  for (const r of [0, 0.1, 0.3, 0.5, 0.7, 0.999999]) {
    const picked = pickNumber(1, 10, [], () => r);
    assert.ok(picked >= 1 && picked <= 10, `ได้ ${picked} ซึ่งอยู่นอกช่วง 1-10`);
  }
});

test('random = 0 ได้ค่าต่ำสุด (ขอบล่าง)', () => {
  assert.equal(pickNumber(1, 10, [], () => 0), 1);
});

test('random เกือบ 1 ได้ค่าสูงสุด ไม่หลุดขอบบน (ขอบบน)', () => {
  assert.equal(pickNumber(1, 10, [], () => 0.999999), 10);
});

test('random คืนค่า 1 พอดี ไม่หลุดขอบบน', () => {
  assert.equal(pickNumber(1, 10, [], () => 1), 10);
});

test('โหมดห้ามซ้ำ: สุ่มไล่ 1..5 จนครบ ได้ครบ 5 ค่าไม่ซ้ำ', () => {
  const drawn = [];
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const picked = pickNumber(1, 5, drawn, () => 0);
    assert.ok(!seen.has(picked), `ได้เลข ${picked} ซ้ำ ทั้งที่ยังไม่ครบรอบ`);
    seen.add(picked);
    drawn.push(picked);
  }
  assert.equal(seen.size, 5);
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('โหมดห้ามซ้ำ: ครั้งที่ 6 หลังครบช่วงแล้วต้องพังพร้อมเหตุผล ไม่ใช่คืนค่าว่างหรือวนลูป', () => {
  const drawn = [1, 2, 3, 4, 5];
  assert.throws(() => pickNumber(1, 5, drawn, () => 0), /ครบ/);
});

test('ต่ำสุดมากกว่าสูงสุด ถูกปฏิเสธด้วยเหตุผลภาษาไทยที่อ่านได้', () => {
  assert.throws(() => pickNumber(10, 1, [], () => 0), /ต่ำสุด/);
});

test('ช่วงมีค่าเดียว (min === max) ถูกปฏิเสธด้วยเหตุผลภาษาไทยที่อ่านได้', () => {
  assert.throws(() => pickNumber(5, 5, [], () => 0), /อย่างน้อย/);
});

// Without the MAX_RANGE_SIZE cap this call allocates ~1e9 array entries and hangs the tab
// instead of throwing, so this test is what keeps the phone alive.
test('ช่วงกว้างเกินเพดาน ถูกปฏิเสธ ไม่ใช่ไปสร้างลิสต์ยักษ์จนเครื่องค้าง', () => {
  assert.throws(() => pickNumber(1, 999999999, [], () => 0), /ไม่เกิน/);
});

test('ช่วงกว้างพอดีเพดาน (10000 ค่า) ยังสุ่มได้ปกติ', () => {
  assert.equal(pickNumber(1, 10000, [], () => 0), 1);
});

// gh#60: the page island must gate its roll button off this exact validator, not a hand-maintained
// mirror. This is the caller-facing half of the same checks pickNumber throws on above.
test('rangeError คืนข้อความเพดานเมื่อช่วงกว้างเกิน MAX_RANGE_SIZE', () => {
  assert.match(rangeError(1, 100000) ?? '', /ไม่เกิน/);
});

test('rangeError คืนข้อความต่ำสุดมากกว่าสูงสุด', () => {
  assert.match(rangeError(10, 1) ?? '', /ต่ำสุด/);
});

test('rangeError คืนข้อความช่วงต่ำกว่าพื้น (min === max)', () => {
  assert.match(rangeError(5, 5) ?? '', /อย่างน้อย/);
});

test('rangeError คืน null เมื่อช่วงถูกต้อง', () => {
  assert.equal(rangeError(1, 10), null);
});

// Structural tripwire (ADR-0018/ADR-0023 pattern): node --test cannot import an .astro file's inline
// <script>, so this can't call render() directly. It scans the source text instead and asserts
// render() holds no independent range-validity logic — only a call into the shared validator.
// Ceiling, stated plainly so nobody cites this test's green as behavioural proof: a source-text scan
// pins the spellings listed below and nothing else. A paraphrased mirror — `const cap = 1e4; if (span
// > cap)` — passes every assertion here while reintroducing the bug, and so does keeping the call but
// ignoring its result. The set of paraphrases has no owner, so this check cannot converge on it; the
// behavioural evidence is the real-browser probe in docs/verification/evidence/60/, not this test.
test('number.astro render() ไม่มี logic ตรวจช่วงตัวเลขของตัวเอง มีแต่เรียก rangeError', () => {
  const astroPath = fileURLToPath(new URL('../pages/tool/number.astro', import.meta.url));
  const source = readFileSync(astroPath, 'utf8');

  assert.match(source, /rangeError\(min, max\)/, 'render() must call the shared validator');

  // These are the exact comparisons/literals the old hand-maintained mirror used. Their absence is
  // what proves the mirror was deleted rather than left alongside the new call.
  assert.doesNotMatch(source, /min\s*>\s*max/, 'a hand-written min>max check must not remain');
  assert.doesNotMatch(source, /rangeSize\s*<\s*\d/, 'a hand-written floor check must not remain');
  assert.doesNotMatch(source, /rangeSize\s*>\s*\d/, 'a hand-written cap check must not remain');
  assert.ok(!source.includes('10000'), 'MAX_RANGE_SIZE must not be typed as a literal in the page');
  // Found by the pre-merge review, not by the original brief: the two input listeners held the SAME
  // conditions in a different spelling and omitted the cap, so an over-cap range was still persisted
  // to localStorage and a reload landed the player on a disabled button. Both now call rangeError.
  assert.doesNotMatch(source, /range\.min\s*<=\s*range\.max/, 'a hand-written min<=max check must not remain');
  assert.doesNotMatch(source, /range\.max\s*-\s*range\.min/, 'a hand-written range-size calculation must not remain');
});
