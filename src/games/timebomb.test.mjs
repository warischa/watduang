// node --test src/games/ — no framework, no dependency
// checks only the pure time numbers exported from timebomb.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urgencyAt, pickDeadline, FUSE_MIN_MS, FUSE_MAX_MS } from './timebomb.ts';

const START = 1_700_000_000_000;
const DEADLINE = START + 30_000;

test('urgency = 0 ตอนเริ่ม และ = 1 ตอนถึงกำหนด', () => {
  assert.equal(urgencyAt(START, START, DEADLINE), 0);
  assert.equal(urgencyAt(DEADLINE, START, DEADLINE), 1);
  assert.equal(urgencyAt(START + 15_000, START, DEADLINE), 0.5);
});

// the long-tab-switch-away case: an unclamped elapsed/total would return > 1 — this is the bug this test exists to catch
test('urgency ค้างที่ 1 เมื่อเลยกำหนดไปไกลแล้ว', () => {
  assert.equal(urgencyAt(DEADLINE + 10 * 60_000, START, DEADLINE), 1);
  assert.equal(urgencyAt(START - 5_000, START, DEADLINE), 0);
  assert.equal(urgencyAt(START, START, START), 1); // total = 0 must never divide by zero
});

test('urgency ไม่ลดลงเลยตลอดช่วงที่สุ่มตัวอย่าง', () => {
  let prev = -1;
  for (let t = START - 5_000; t <= DEADLINE + 60_000; t += 250) {
    const u = urgencyAt(t, START, DEADLINE);
    assert.ok(u >= prev, `urgency ลดลงที่ t=${t}: ${u} < ${prev}`);
    assert.ok(u >= 0 && u <= 1, `urgency หลุดช่วง 0..1 ที่ t=${t}: ${u}`);
    prev = u;
  }
  assert.equal(prev, 1);
});

test('pickDeadline คืนเวลาสัมบูรณ์ที่อยู่ในช่วงฟิวส์', () => {
  for (const r of [0, 0.5, 0.999999]) {
    const fuse = pickDeadline(START, () => r) - START;
    assert.ok(fuse >= FUSE_MIN_MS && fuse <= FUSE_MAX_MS, `ฟิวส์ ${fuse} ms หลุดช่วง`);
  }
});
