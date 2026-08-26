// node --test 'src/**/*.test.mjs' — no framework, no dependency
// Covers the pure draw-lots logic exported from draw.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawNames } from './draw.ts';
import { DrawRound } from './draw-round.ts';

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

// ---- The round itself (DrawRound), not just one press ------------------------------------------
// Elimination is keyed on ROSTER POSITION. parseNameLines keeps duplicates on purpose, so three
// people at one table can all be "แนน" and each owns a turn. Looking the position up by name
// (drawn.add(players.indexOf(slot.name))) takes the FIRST match out instead of the slot that was
// drawn: the wrong person leaves the box and the drawn one stays drawable. These tests exist to go
// red on exactly that, which asserting on draw.astro's source text could not.
test('DrawRound: จับสลอตที่ 4 ของชื่อซ้ำ ต้องเอาคนนั้นออก ไม่ใช่คนแรกที่ชื่อเหมือนกัน', () => {
  const round = new DrawRound();
  round.start(['บี', 'แนน', 'ซี', 'แนน', 'แนน']);
  // 0.85 * 5 = 4.25 -> offset 4, the third duplicate. The first slot carrying that name is 1.
  const picked = round.pick(1, () => 0.85);
  assert.deepEqual(picked.map((s) => s.index), [4]);
  round.take(picked);
  const left = round.remaining().map((s) => s.index);
  assert.ok(!left.includes(4), 'the slot that was drawn must not still be drawable');
  assert.ok(left.includes(1), 'the OTHER แนน must still be in the box — the wrong person left');
  assert.deepEqual(left, [0, 1, 2, 3]);
});

test('DrawRound: กล่องต้องหมดพอดีเท่าจำนวนสลอต ชื่อซ้ำนับแยกคน', () => {
  const round = new DrawRound();
  const players = ['บี', 'แนน', 'ซี', 'แนน', 'แนน'];
  round.start(players);
  assert.equal(round.size, players.length, 'no dedupe, no cap — every line is its own slot');
  assert.equal(round.remaining().length, players.length);

  const takenNames = [];
  const takenPositions = new Set();
  let presses = 0;
  const cycle = [0.85, 0, 0.999999, 0.4];
  while (round.remaining().length > 0) {
    assert.ok(presses < players.length, 'the box must empty in one press per slot');
    const picked = round.pick(1, () => cycle[presses % cycle.length]);
    round.take(picked);
    for (const slot of picked) {
      assert.ok(!takenPositions.has(slot.index), `position ${slot.index} was drawn twice`);
      takenPositions.add(slot.index);
      takenNames.push(slot.name);
    }
    presses += 1;
  }
  assert.equal(presses, players.length);
  assert.deepEqual(takenNames.sort(), [...players].sort(), 'แนน must be announced three times, not once');
});

test('DrawRound: เริ่มรอบใหม่คืนทุกสลอตเข้ากล่อง', () => {
  const round = new DrawRound();
  round.start(['แนน', 'แนน', 'บี']);
  round.take(round.pick(2, () => 0));
  assert.equal(round.remaining().length, 1);
  round.reset();
  assert.equal(round.remaining().length, 3);
  round.start(['เอ', 'บี']);
  assert.equal(round.remaining().length, 2, 'a new roster starts its own round');
});

test('DrawRound: ขอจับมากกว่าที่เหลือ ถูกปฏิเสธด้วยเหตุผลภาษาไทย', () => {
  const round = new DrawRound();
  round.start(['เอ', 'บี', 'ซี']);
  round.take(round.pick(2, () => 0));
  assert.throws(() => round.pick(2, () => 0), /เหลือ/);
});
