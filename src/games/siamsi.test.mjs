// node --test src/games/ — ไม่มี framework ไม่มี dependency
// เช็คเฉพาะ pure helper ที่ export จาก siamsi.ts (ไม่ต้องมี DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, draw, nextTurn, FORTUNES } from './siamsi.ts';

test('deck มี 24 ใบ เลขไม่ซ้ำกัน', () => {
  assert.equal(FORTUNES.length, 24);
  const numbers = new Set(FORTUNES.map((f) => f.number));
  assert.equal(numbers.size, 24);
});

test('ไม่มีการจั่วซ้ำตลอดวง — buildDeck แล้วจั่วจนหมดสำหรับผู้เล่นทุกจำนวน', () => {
  for (const playerCount of [2, 5, 10]) {
    let deck = buildDeck(playerCount, Math.random);
    assert.equal(deck.length, playerCount);
    const seen = new Set();
    for (let i = 0; i < playerCount; i++) {
      const { fortune, remaining } = draw(deck);
      assert.ok(!seen.has(fortune.number), `เลข ${fortune.number} จั่วซ้ำ`);
      seen.add(fortune.number);
      deck = remaining;
    }
    assert.equal(deck.length, 0); // deck ต้องหมดพอดีหลังจั่วครบทุกคน
    assert.equal(seen.size, playerCount);
  }
});

test('จั่วจาก deck ว่างต้อง throw', () => {
  assert.throws(() => draw([]), /empty/);
});

test('รอบจบพอดีหลังผู้เล่นครบ N คน', () => {
  const playerCount = 4;
  let current = 0;
  let turns = 0;
  let roundOver = false;
  while (!roundOver) {
    const result = nextTurn(current, playerCount);
    turns += 1;
    current = result.index;
    roundOver = result.roundOver;
  }
  assert.equal(turns, playerCount);
  assert.equal(current, 0); // วนกลับมาที่คนแรกพร้อมรอบใหม่
});

test('reshuffle คืน deck เต็มทุกครั้ง — buildDeck(24) ต้องได้ครบ 24 ใบไม่ซ้ำทุกรอบที่เรียก', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const deck = buildDeck(24, Math.random);
    assert.equal(deck.length, 24);
    const numbers = new Set(deck.map((i) => FORTUNES[i].number));
    assert.equal(numbers.size, 24); // ครบทุกใบ ไม่มีใบไหนถูกทิ้งค้างจากรอบก่อน
  }
});

// REFUTE ชี้ว่าเทสชุดแรกไม่ได้บังคับให้สับจริง — เปลี่ยน buildDeck เป็น slice เฉยๆ ก็ยังเขียว
// ทั้งที่ "เล่นอีกรอบ" ต้องได้ลำดับใหม่ เทสนี้ยิงด้วย rand ที่คุมค่าได้ ผลจึงตรวจสอบได้จริง
test('buildDeck สับจริง ไม่ใช่คืนลำดับเดิม', () => {
  // rand คงที่ 0 → Fisher-Yates สลับ order[i] กับ order[0] ทุกรอบ = ผลที่คำนวณล่วงหน้าได้
  const expected = (() => {
    const order = FORTUNES.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) [order[i], order[0]] = [order[0], order[i]];
    return order.slice(0, 5);
  })();
  assert.deepEqual(buildDeck(5, () => 0), expected);
  assert.notDeepEqual(buildDeck(5, () => 0), [0, 1, 2, 3, 4], 'buildDeck คืนลำดับเดิม = ไม่ได้สับ');

  // rand ต่างกันต้องให้ลำดับต่างกัน ไม่งั้นแปลว่า rand ไม่ถูกใช้เลย
  assert.notDeepEqual(buildDeck(8, () => 0), buildDeck(8, () => 0.99));
});

test('ผู้เล่นมากกว่าจำนวนใบ ต้องโยน error ไม่ใช่คืนกองสั้นๆ เงียบๆ', () => {
  assert.throws(() => buildDeck(FORTUNES.length + 1), /มากกว่าใบเซียมซี/);
  assert.equal(buildDeck(FORTUNES.length).length, FORTUNES.length);
});
