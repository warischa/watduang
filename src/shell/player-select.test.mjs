// node --test src/shell/ — ไม่มี framework ไม่มี dependency
// เช็คตรรกะล้วนๆ ที่ export จาก player-select.ts (ไม่ต้องมี DOM/localStorage)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStart, numberedPlayers } from './player-select.ts';

test('เกิน max: ตัดคนท้ายไปเล่น สั่งเตือนก่อนถ้ายังไม่เคยเตือน', () => {
  const selected = ['เอ', 'บี', 'ซี', 'ดี'];
  const r = resolveStart(selected, 2, 3, false);
  assert.deepEqual(r.playing, ['เอ', 'บี', 'ซี']);
  assert.deepEqual(r.sittingOut, ['ดี']);
  assert.equal(r.needsOverMaxWarning, true);
  assert.equal(r.belowMin, false);
});

test('เกิน max แต่ warned=true (กดยืนยันรอบสอง): ไม่เตือนซ้ำ ไปต่อ', () => {
  const selected = ['เอ', 'บี', 'ซี', 'ดี'];
  const r = resolveStart(selected, 2, 3, true);
  assert.equal(r.needsOverMaxWarning, false);
  assert.deepEqual(r.playing, ['เอ', 'บี', 'ซี']);
});

test('พอดี max: ไม่มีใครนั่งเล่น ไม่ต้องเตือน', () => {
  const selected = ['เอ', 'บี', 'ซี'];
  const r = resolveStart(selected, 2, 3, false);
  assert.deepEqual(r.playing, selected);
  assert.deepEqual(r.sittingOut, []);
  assert.equal(r.needsOverMaxWarning, false);
});

test('ต่ำกว่า min: ปฏิเสธ ไม่ว่าจะเตือน max หรือไม่', () => {
  const r = resolveStart(['เอ'], 2, 5, false);
  assert.equal(r.belowMin, true);
});

test('regression #21: playing รวมกับ sittingOut ต้องได้วงเต็มเท่าที่ติ๊กมาเสมอ — ไม่มีใครหายไปจากผลลัพธ์ ต่อให้เกิน max', () => {
  const selected = ['เอ', 'บี', 'ซี', 'ดี', 'อี'];
  const r = resolveStart(selected, 1, 2, false);
  assert.deepEqual([...r.playing, ...r.sittingOut], selected);
});

test('regression #21: resolveStart ไม่แก้ไข array ที่รับเข้ามา (ฝั่งเรียกยังเอาวงเต็มไปเก็บ saveGroup ได้)', () => {
  const selected = ['เอ', 'บี', 'ซี'];
  const before = [...selected];
  resolveStart(selected, 1, 1, false);
  assert.deepEqual(selected, before);
});

test('#22 numberedPlayers: สร้าง "คนที่ 1..N" ตามจำนวนที่กรอก', () => {
  assert.deepEqual(numberedPlayers(3, 1, 10), ['คนที่ 1', 'คนที่ 2', 'คนที่ 3']);
});

test('#22 numberedPlayers: clamp ขึ้นถึง min ถ้ากรอกน้อยกว่า', () => {
  assert.deepEqual(numberedPlayers(1, 3, 10), ['คนที่ 1', 'คนที่ 2', 'คนที่ 3']);
});

test('#22 numberedPlayers: clamp ลงถึง max ถ้ากรอกมากกว่า', () => {
  assert.equal(numberedPlayers(99, 1, 4).length, 4);
});

test('#22 numberedPlayers: count ไม่ใช่ตัวเลข (NaN/0) ถอยไปใช้ min', () => {
  assert.deepEqual(numberedPlayers(0, 2, 5), ['คนที่ 1', 'คนที่ 2']);
});
