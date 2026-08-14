// node --test src/tools/ — ไม่มี framework ไม่มี dependency
// เช็คตรรกะวงล้อสุ่มล้วนๆ ที่ export จาก wheel.ts (ไม่ต้องมี DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickName } from './wheel.ts';

test('pickName คืนชื่อที่อยู่ในลิสต์เสมอ', () => {
  const names = ['เอ', 'บี', 'ซี'];
  for (const r of [0, 0.3, 0.5, 0.7, 0.999999]) {
    const picked = pickName(names, () => r);
    assert.ok(names.includes(picked), `ได้ ${picked} ซึ่งไม่อยู่ในลิสต์`);
  }
});

test('random = 0 ได้ชื่อแรก (ขอบล่าง)', () => {
  const names = ['เอ', 'บี', 'ซี'];
  assert.equal(pickName(names, () => 0), 'เอ');
});

test('random เกือบ 1 ได้ชื่อสุดท้าย ไม่หลุดขอบท้ายลิสต์ (ขอบบน)', () => {
  const names = ['เอ', 'บี', 'ซี'];
  assert.equal(pickName(names, () => 0.999999), 'ซี');
});

test('ทุกชื่อในลิสต์ต้องถูกสุ่มถึงได้ด้วยค่า random บางค่า', () => {
  const names = ['เอ', 'บี', 'ซี', 'ดี'];
  const reached = new Set();
  const steps = 1000;
  for (let i = 0; i < steps; i++) {
    const r = i / steps; // ครอบคลุม [0, 1)
    reached.add(pickName(names, () => r));
  }
  for (const name of names) {
    assert.ok(reached.has(name), `ไม่มีค่า random ไหนสุ่มถึง ${name}`);
  }
});

test('random คืนค่า 1 พอดี ไม่หลุดขอบท้ายลิสต์', () => {
  const names = ['เอ', 'บี', 'ซี'];
  assert.equal(pickName(names, () => 1), 'ซี');
});

test('ลิสต์ว่างพัง ด้วยเหตุผลภาษาไทยที่อ่านได้ ไม่ใช่คืนค่าว่างเงียบๆ', () => {
  assert.throws(() => pickName([], () => 0), /คน/);
});

test('ลิสต์มีชื่อเดียวพัง ด้วยเหตุผลภาษาไทยที่อ่านได้ ไม่ใช่คืนค่าว่างเงียบๆ', () => {
  assert.throws(() => pickName(['เอ'], () => 0), /คน/);
});
