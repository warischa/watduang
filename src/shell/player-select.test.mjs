// node --test src/shell/ — no framework, no dependency
// Checks pure logic exported from player-select.ts (no DOM/localStorage needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStart, numberedPlayers, planStart, planClear, clearCopy, refusalCopy } from './player-select.ts';

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

// gh#94: the tools hand a group of any size onward, so the long-list case is pinned at its real
// magnitude, not just at 4-into-3. resolveStart is two size-independent slices (player-select.ts),
// which the assertions above already pin for shape (nothing dropped, input not mutated); this one
// pins the number the ticket names — 30 names into a 10-max game (ADR-0007).
test('gh#94: 30 names into a 10-max game -> 10 play, 20 sit out, none dropped', () => {
  const selected = Array.from({ length: 30 }, (_, i) => `คนที่ ${i + 1}`);
  const r = resolveStart(selected, 2, 10, false);
  assert.equal(r.playing.length, 10);
  assert.equal(r.sittingOut.length, 20);
  assert.deepEqual([...r.playing, ...r.sittingOut], selected);
  assert.equal(r.needsOverMaxWarning, true);
  assert.equal(r.belowMin, false);
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

// ---- #25: Clear group mid-round is a question too — and its condition is NOT planStart's ----

test('#25 a round in progress: pressing ล้างกลุ่มนี้ must ask before wiping it', () => {
  assert.equal(planClear(cp('siamsi'), false), 'ask');
});

test('#25 the condition is site-wide, not game-matched — session.clear() empties the one slot every game shares', () => {
  // The discriminating case, and the reason planClear takes no gameId: copying planStart's
  // checkpoint.game === gameId test would let a press on timebomb's page destroy a live siamsi round.
  assert.equal(planClear(cp('timebomb'), false), 'ask', "another game's live round dies here too");
  // a blob with no game tag is still a round someone is inside — the slot is emptied either way
  assert.equal(planClear({ players: ['เอ'] }, false), 'ask');
});

test('#25 no round in progress: clearing the group is unchanged — no question, no extra tap', () => {
  assert.equal(planClear(null, false, false), 'clear');
});

// ---- #data-loss: an empty checkpoint slot is not "no round" ----
// Only siamsi writes a checkpoint — 1 of 6 games. Every other game's round is live with the slot empty,
// and so is a siamsi round the moment it ends (saveCheckpoint(null)). The checkpoint was the whole test,
// so on a fresh session mid-timebomb or mid-short-stick, \u0e25\u0e49\u0e32\u0e07\u0e01\u0e25\u0e38\u0e48\u0e21\u0e19\u0e35\u0e49 tore the round down without a word.
// The shell already owns the missing bit: it sets root.hidden itself when a round starts.

test('#data-loss a live round with an EMPTY checkpoint slot must still ask — the slot is not the liveness test', () => {
  assert.equal(planClear(null, false, true), 'ask');
});

test('#data-loss the two signals are independent — either one alone is enough to ask', () => {
  // calibrates both ways: with neither signal there is nothing to lose and no question is raised
  assert.equal(planClear(null, false, false), 'clear', 'no round at all: unchanged, no extra tap');
  assert.equal(planClear(cp('siamsi'), false, false), 'ask', 'a stranded checkpoint alone still asks');
  assert.equal(planClear(cp('siamsi'), false, true), 'ask', 'both at once asks once, not twice');
});

test('#data-loss a labelled answer is still final — a live round does not re-raise the question', () => {
  assert.equal(planClear(null, true, true), 'clear');
  assert.equal(planClear(cp('siamsi'), true, true), 'clear');
});

test('#25 the player pressed ล้างและทิ้งรอบที่ค้าง: the labelled answer goes through and is never re-asked', () => {
  assert.equal(planClear(cp('siamsi'), true), 'clear');
  assert.equal(planClear(null, true), 'clear');
});

// ---- #data-loss: the question has to name every loss the confirm button will cause (ADR-0008) ----
// Three cases, because the two signals are independent: a stranded checkpoint, a round started on this
// page, or both at once. A press destroys everything both signals stand for, so copy that names only one
// of them leaves the other loss unnamed — which is the exact failure ADR-0008 exists to close.

test('#data-loss a stranded checkpoint alone keeps the template copy — ADR-0008 approved those bytes', () => {
  // null = do not touch the DOM, so the two strings quoted in ADR-0008 stay the shipped default
  assert.equal(clearCopy(cp('siamsi'), false), null);
  assert.equal(clearCopy(null, false), null, 'nothing to lose either: no swap');
});

test('#data-loss a live round with an empty slot names the round on this page, question and button both', () => {
  const copy = clearCopy(null, true);
  assert.equal(copy.message, 'เริ่มรอบบนหน้านี้ไปแล้ว ถ้าล้างกลุ่มนี้ รอบนี้จะหายไปทั้งรอบ');
  assert.equal(copy.confirmLabel, 'ล้างและทิ้งรอบนี้');
});

test('#data-loss both signals at once: the copy names BOTH losses, not just the round on this page', () => {
  // siamsi mid-round → walk to short-stick → start a round → \u0e25\u0e49\u0e32\u0e07\u0e01\u0e25\u0e38\u0e48\u0e21\u0e19\u0e35\u0e49. The press destroys the
  // short-stick round on screen AND the stranded siamsi checkpoint; live-round-only copy names one.
  const both = clearCopy(cp('siamsi'), true);
  const liveOnly = clearCopy(null, true);
  assert.notEqual(both.message, liveOnly.message, 'the both case cannot reuse the round-only wording');
  assert.match(both.message, /รอบบนหน้านี้/, 'the round started on this page must be named');
  assert.match(both.message, /รอบที่ค้าง/, 'the stranded round must be named too — it dies in the same press');
  assert.match(both.confirmLabel, /^ล้างและทิ้ง/, "the button names what it destroys — ADR-0008's rule");
  assert.notEqual(both.confirmLabel, liveOnly.confirmLabel, 'and it cannot claim to drop only this round');
});

test('#data-loss no case is a partial swap — every non-default case sets both strings', () => {
  // Nothing restores the template text on cancel, and root.hidden never goes back to false, so a case
  // that swapped only one string would leave the other stale for the rest of the page's life.
  for (const checkpoint of [null, cp('siamsi')]) {
    const copy = clearCopy(checkpoint, true);
    assert.ok(copy.message.length > 0 && copy.confirmLabel.length > 0);
  }
});

test('gh#50 refusalCopy: all three reasons map to the owner-approved strings, byte for byte', () => {
  assert.equal(
    refusalCopy('stale-version'),
    'รอบนี้ถูกเล่นต่อจากหน้าอื่นแล้ว ที่กดในหน้านี้หลังจากนั้นไม่ได้บันทึก',
  );
  assert.equal(refusalCopy('other-round'), 'มีรอบใหม่เริ่มไปแล้ว ที่กดในหน้านี้ไม่ได้บันทึก');
  assert.equal(refusalCopy('record-gone'), 'รอบนี้ถูกล้างไปแล้ว ที่กดในหน้านี้ไม่ได้บันทึก');
});
