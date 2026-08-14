// node --test 'src/**/*.test.mjs' — no framework, no dependency
// Covers the pure จับฉลาก logic exported from draw.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawNames } from './draw.ts';

test('จับฉลากได้จำนวนเท่ากับที่ขอเป๊ะ', () => {
  const names = ['เอ', 'บี', 'ซี', 'ดี'];
  const result = drawNames(names, 2, () => 0.5);
  assert.equal(result.length, 2);
});

test('ผลจับฉลากไม่มีชื่อซ้ำกันเองในรอบเดียว', () => {
  const names = ['เอ', 'บี', 'ซี', 'ดี', 'อี'];
  // fixed random — if the implementation doesn't remove a drawn name from the box, this comes back with duplicates
  const result = drawNames(names, 4, () => 0);
  assert.equal(new Set(result).size, result.length);
});

test('ชื่อที่จับไปรอบแรกแล้ว จับรอบถัดไปในรอบเดียวกันไม่ได้อีก', () => {
  const names = ['เอ', 'บี', 'ซี', 'ดี'];
  const first = drawNames(names, 1, () => 0);
  const stillIn = names.filter((n) => !first.includes(n));
  const second = drawNames(stillIn, 1, () => 0);
  assert.ok(!first.includes(second[0]));
  assert.equal(stillIn.length, names.length - first.length);
});

test('ขอจับมากกว่าที่เหลือในกล่อง ถูกปฏิเสธด้วยเหตุผลภาษาไทยที่อ่านได้', () => {
  const names = ['เอ', 'บี', 'ซี'];
  assert.throws(() => drawNames(names, 4, () => 0), /เหลือ/);
});

test('ผลจับฉลากทุกชื่อต้องอยู่ในกล่องจริง', () => {
  const names = ['เอ', 'บี', 'ซี'];
  const result = drawNames(names, 3, () => 0.999999);
  for (const name of result) {
    assert.ok(names.includes(name), `ได้ ${name} ซึ่งไม่อยู่ในกล่อง`);
  }
});

test('random คืนค่า 1 พอดี ไม่หลุดขอบท้ายกล่อง', () => {
  const names = ['เอ', 'บี', 'ซี'];
  const result = drawNames(names, 3, () => 1);
  for (const name of result) {
    assert.ok(names.includes(name), `ได้ ${name} ซึ่งไม่อยู่ในกล่อง`);
  }
});

test('เริ่มรอบใหม่ (เรียกด้วยกล่องเต็ม) คืนสิทธิ์จับได้ครบทุกคนอีกครั้ง', () => {
  const names = ['เอ', 'บี', 'ซี'];
  const roundOne = drawNames(names, 3, () => 0.5);
  assert.equal(roundOne.length, 3);
  // reset = call again with the original full box, not the leftovers from the previous round
  const roundTwo = drawNames(names, 3, () => 0.5);
  assert.equal(roundTwo.length, 3);
  assert.equal(new Set(roundTwo).size, 3);
});

test('ลิสต์ว่างพัง ด้วยเหตุผลภาษาไทยที่อ่านได้ ไม่ใช่คืนค่าว่างเงียบๆ', () => {
  assert.throws(() => drawNames([], 1, () => 0), /คน/);
});

test('กล่องเหลือชื่อเดียว จับชื่อสุดท้ายได้สำเร็จ ไม่ throw', () => {
  const result = drawNames(['เอ'], 1, () => 0);
  assert.deepEqual(result, ['เอ']);
});

// The caller passes the live roster in — splicing it in place instead of a copy would silently
// delete names from every other tool and game that shares the roster.
test('กล่องที่ส่งเข้าไปต้องไม่ถูกแก้ — ฟังก์ชันทำงานบนสำเนาเท่านั้น', () => {
  const names = ['เอ', 'บี', 'ซี'];
  const before = [...names];
  drawNames(names, 2, () => 0);
  assert.deepEqual(names, before);
});
