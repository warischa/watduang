// node --test src/shell/ — ไม่มี framework ไม่มี dependency
// เช็คตรรกะล้วนๆ ที่ export จาก player-select.ts (ไม่ต้องมี DOM/localStorage)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStart, numberedPlayers, planStart } from './player-select.ts';

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

// ---- #23: a live round in progress is a question, never a silent choice ----
const cp = (game) => ({ game, players: ['เอ', 'บี'] });

test('#23 a checkpoint for the game on this page: the start must ask, not choose either way', () => {
  assert.equal(planStart(cp('siamsi'), 'siamsi'), 'ask');
});

test('#23 symptom-2 guard: only THIS page game raises the prompt — never another game, never a tool page', () => {
  assert.equal(planStart(cp('timebomb'), 'siamsi'), 'start', 'timebomb blob must not prompt on siamsi');
  assert.equal(planStart(cp('siamsi'), 'timebomb'), 'start', 'siamsi blob must not prompt on timebomb');
  assert.equal(planStart(cp('siamsi'), undefined), 'start', 'tool page has no game to resume');
  assert.equal(planStart(null, 'siamsi'), 'start', 'no checkpoint at all');
  assert.equal(planStart({ players: [] }, 'siamsi'), 'start', 'blob with no game tag owns nothing');
});

test('#23 the player answered: กลับไปเล่นรอบที่ค้าง starts as-is, เริ่มรอบใหม่ drops the round first', () => {
  assert.equal(planStart(cp('siamsi'), 'siamsi', 'resume'), 'start');
  assert.equal(planStart(cp('siamsi'), 'siamsi', 'fresh'), 'discard-then-start');
  // an answer is honoured even if the slot changed under us — a labelled choice is never re-asked
  assert.equal(planStart(null, 'siamsi', 'fresh'), 'discard-then-start');
});
