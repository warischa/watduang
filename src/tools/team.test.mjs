// node --test 'src/**/*.test.mjs' — no framework, no dependency
// Covers the pure แบ่งทีม logic exported from team.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTeams } from './team.ts';

const NAMES6 = ['เอ', 'บี', 'ซี', 'ดี', 'อี', 'เอฟ'];

test('ทุกคนต้องอยู่ในผลลัพธ์ครบพอดี ไม่หาย ไม่ซ้ำ', () => {
  const teams = splitTeams(NAMES6, 3, () => 0.42);
  const flat = teams.flat();
  assert.deepEqual([...flat].sort(), [...NAMES6].sort());
  assert.equal(flat.length, NAMES6.length);
  assert.equal(new Set(flat).size, NAMES6.length);
});

test('จำนวนทีมที่คืนมาต้องตรงกับที่ขอ', () => {
  const teams = splitTeams(NAMES6, 3, () => 0.1);
  assert.equal(teams.length, 3);
});

test('หารไม่ลงตัว: ขนาดทีมต่างกันไม่เกิน 1 คน', () => {
  const names7 = [...NAMES6, 'จี'];
  const teams = splitTeams(names7, 3, () => 0.7);
  const sizes = teams.map((t) => t.length);
  assert.equal(Math.max(...sizes) - Math.min(...sizes), 1);
  // 7 people into 3 teams = exactly one team of 3, the other two of 2
  assert.deepEqual([...sizes].sort(), [2, 2, 3]);
});

test('ขอทีมมากกว่าจำนวนคนต้องถูกปฏิเสธ ไม่ใช่คืนทีมว่าง', () => {
  assert.throws(() => splitTeams(['เอ', 'บี'], 3, () => 0), /คน/);
});

test('ขอทีมต่ำกว่า 1 ทีมต้องถูกปฏิเสธ', () => {
  assert.throws(() => splitTeams(NAMES6, 0, () => 0), /ทีม/);
});

test('ชื่อน้อยกว่า 2 คนต้องถูกปฏิเสธ ด้วยเหตุผลภาษาไทยที่อ่านได้', () => {
  assert.throws(() => splitTeams(['เอ'], 1, () => 0), /คน/);
});

test('สอง RNG stream ที่ต่างกัน ต้องได้ผลแบ่งทีมที่ต่างกัน (ไม่ใช่แช่แข็งอันเดิม)', () => {
  const teamsA = splitTeams(NAMES6, 2, () => 0);
  const teamsB = splitTeams(NAMES6, 2, () => 0.999999);
  assert.notDeepEqual(teamsA, teamsB);
});

test('RNG stream เดิม เรียกซ้ำต้องได้ผลแบ่งทีมเดิมทุกครั้ง (ไม่มี memo แอบเก็บ state)', () => {
  const teamsA = splitTeams(NAMES6, 2, () => 0.3);
  const teamsB = splitTeams(NAMES6, 2, () => 0.3);
  assert.deepEqual(teamsA, teamsB);
});

test('random คืนค่า 1 พอดี ไม่หลุดขอบท้ายลิสต์ระหว่างสับ Fisher-Yates', () => {
  const teams = splitTeams(NAMES6, 3, () => 1);
  const flat = teams.flat();
  assert.deepEqual([...flat].sort(), [...NAMES6].sort());
  assert.equal(flat.length, NAMES6.length);
});

// The caller passes the live roster in — shuffling it in place instead of a copy would reorder
// the shared name list for every other tool and game.
test('ลิสต์ที่ส่งเข้าไปต้องไม่ถูกสับ — ฟังก์ชันทำงานบนสำเนาเท่านั้น', () => {
  const names = [...NAMES6];
  const before = [...names];
  splitTeams(names, 3, () => 0.8);
  assert.deepEqual(names, before);
});
