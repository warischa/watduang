// node --test 'src/**/*.test.mjs' — no framework, no dependency
// Covers the pure random-number logic exported from number.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNumber } from './number.ts';

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
