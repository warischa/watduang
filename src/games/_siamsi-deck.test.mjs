// node --test src/games/ — no framework, no dependency.
// gh#98's deck seam. A wrong deck is SILENT: 28 slips in the wrong proportions render perfectly and
// read perfectly, so nothing but a check over the data can see it. Every assertion here is over the
// data, never over a rendered screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLIPS,
  GRADE_TARGET,
  ASPECT_ORDER,
  gradeHistogram,
  readingOrder,
  thaiNumeral,
  drawSlip,
} from './_siamsi-deck.ts';

test('gh#98: the deck is 28 slips, numbered one to twenty-eight with no repeat', () => {
  assert.equal(SLIPS.length, 28);
  const numbers = SLIPS.map((s) => s.number);
  assert.equal(new Set(numbers).size, 28, 'a slip number repeats');
  assert.deepEqual(
    [...numbers].sort((a, b) => a - b),
    Array.from({ length: 28 }, (_, i) => i + 1),
  );
});

// The distribution claim itself. deepEqual against the target, not a length check: a deck that is
// 28 long and all one grade passes every count assertion and fails this one.
test('gh#98: the grade histogram matches the proportions of a real set exactly', () => {
  assert.deepEqual(gradeHistogram(), { ...GRADE_TARGET });
  assert.equal(
    Object.values(GRADE_TARGET).reduce((a, b) => a + b, 0),
    SLIPS.length,
    'the target proportions must themselves sum to the deck size',
  );
});

// Calibration for the test above, in the test file rather than in a note: a deliberately wrong deck
// must red. Without this the deepEqual could be passing for a reason nobody checked.
test('gh#98: the histogram check is calibrated — a mis-graded deck does not match the target', () => {
  const wrong = SLIPS.map((s, i) => (i === 0 ? { ...s, grade: 'ระวัง' } : s));
  assert.notDeepEqual(gradeHistogram(wrong), { ...GRADE_TARGET });
});

test('gh#98: every slip carries a four-line กลอน, all four readings and a closing thought', () => {
  for (const slip of SLIPS) {
    const where = `slip ${slip.number}`;
    assert.equal(slip.verse.length, 4, `${where}: the กลอน must be four lines`);
    for (const line of slip.verse) assert.ok(line.trim().length > 0, `${where}: an empty กลอน line`);
    for (const aspect of ASPECT_ORDER) {
      const text = slip.readings[aspect];
      assert.ok(typeof text === 'string' && text.trim().length > 0, `${where}: ${aspect} is empty`);
      assert.ok(!/^(tbd|todo|placeholder)/i.test(text.trim()), `${where}: ${aspect} is a placeholder`);
    }
    assert.ok(slip.closing.trim().length > 0, `${where}: no closing thought`);
  }
});

/** Every reader-facing string on a slip. The number field is deliberately NOT here — it is the
 *  "ติ้ว"'s own number and is rendered as a numeral, not as fortune text. */
function textOf(slip) {
  return [...slip.verse, ...ASPECT_ORDER.map((a) => slip.readings[a]), slip.closing];
}

// gh#98 box 3, the lottery half. Any digit at all inside fortune text reads as a pick, whichever
// numeral system it is written in.
test('gh#98: no digit, Arabic or Thai, appears anywhere in a slip text field', () => {
  for (const slip of SLIPS) {
    for (const text of textOf(slip)) {
      assert.ok(!/[0-9๐-๙]/.test(text), `slip ${slip.number}: a digit in "${text}"`);
    }
  }
});

// gh#98 box 3, the legal and medical halves, plus ADR-0011's advice-register rule.
// HEURISTIC, and it earns no coverage past the tokens listed. ADR-0011 keeps the human read of
// every item universal, and that read is the real gate — this only catches the obvious way in.
//
// THE TOKENS ARE MULTI-CHARACTER ON PURPOSE, and that is the ceiling this list accepts. Thai is
// written without word spaces, so a substring scan cannot see a word boundary: the one-syllable
// forms of these words sit inside ordinary vocabulary a fortune slip legitimately uses — the word
// for fog opens with the word for doctor, the word for hard ends the word for medicine, and the
// word for pavilion contains the word for court. Scanning for those forms would not tighten the
// gate, it would only force the copy away from ordinary Thai. Measured: the first version of this
// list used them and reported the fog line on slip four.
const BANNED = [
  'คดี', 'ขึ้นศาล', 'ศาลตัดสิน', 'ฟ้องร้อง', 'ทนายความ', 'ตำรวจ', 'ผิดกฎหมาย', 'แจ้งความ',
  'ไปหาหมอ', 'พบหมอ', 'แพทย์', 'โรงพยาบาล', 'ผ่าตัด', 'คลินิก', 'กินยา', 'หยุดยา', 'ใบสั่งยา',
  'โรคประจำตัว', 'เจ็บป่วย', 'อาการป่วย',
  'หวย', 'ลอตเตอรี', 'สลากกินแบ่ง', 'ลงทุน', 'เล่นหุ้น', 'กู้เงิน', 'เป็นหนี้', 'ดอกเบี้ย',
  'การพนัน', 'แทงบอล',
  'เหล้า', 'เบียร์', 'สุรา', 'บุหรี่', 'ดื่มจนเมา',
];

test('gh#98: no slip names a legal act, a medical act, a wager or a drink', () => {
  for (const slip of SLIPS) {
    for (const text of textOf(slip)) {
      for (const token of BANNED) {
        assert.ok(!text.includes(token), `slip ${slip.number}: banned token "${token}" in "${text}"`);
      }
    }
  }
});

// Calibration for the scan above — feed it lines that break each half of the rule and confirm the
// scan sees them. A scan nobody has fed a bad input to is a scan nobody has tested.
test('gh#98: the banned-token scan is calibrated on a legal, a medical and a lottery line', () => {
  for (const bad of [
    'เรื่องที่ค้างอยู่จะจบด้วยดี ไม่ต้องขึ้นศาล',
    'ช่วงนี้ควรไปหาหมอสักครั้ง แล้วจะสบายขึ้น',
    'เดือนนี้เหมาะกับการลงทุนก้อนใหญ่',
  ]) {
    assert.ok(BANNED.some((token) => bad.includes(token)), `the scan missed "${bad}"`);
  }
});

// gh#98 box 4 — a "ระวัง" slip may warn, but it must hand the reader something to do about it.
test('gh#98: every ระวัง slip closes on something the reader can act on', () => {
  const careful = SLIPS.filter((s) => s.grade === 'ระวัง');
  assert.equal(careful.length, GRADE_TARGET['ระวัง']);
  for (const slip of careful) {
    assert.ok(slip.closing.trim().length > 0, `slip ${slip.number}: a ระวัง slip with no closing`);
    // the warning must not be the last word: the closing line names something the reader DOES.
    // The list is of action verbs, not of hedges — "it will be fine" would pass a hedge list and
    // hands the reader nothing.
    assert.ok(
      /ลอง|ถาม|พูด|เริ่ม|ดูแล|ตั้งหลัก|เลือก|พัก|ปรับ|วาง|บอก|กวาด|เลี่ยง/.test(slip.closing),
      `slip ${slip.number}: the closing reads as a verdict, not as something to do`,
    );
  }
});

// gh#97 box 5 — the subject the reader set their mind on is the row that reads first.
test('gh#97: the picked subject leads the slip, and ไม่เจาะจง promotes nothing', () => {
  assert.deepEqual(readingOrder('money'), ['money', 'work', 'love', 'health']);
  assert.deepEqual(readingOrder('work'), ['work', 'money', 'love', 'health']);
  assert.deepEqual(readingOrder('any'), ASPECT_ORDER);
  for (const aspect of ASPECT_ORDER) {
    assert.equal(readingOrder(aspect).length, 4);
    assert.equal(new Set(readingOrder(aspect)).size, 4);
  }
});

test('the ติ้ว number renders in Thai numerals', () => {
  assert.equal(thaiNumeral(14), '๑๔');
  assert.equal(thaiNumeral(1), '๑');
  assert.equal(thaiNumeral(28), '๒๘');
});

test('drawSlip returns a real slip for every position the random source can land on', () => {
  assert.equal(drawSlip(() => 0).number, SLIPS[0].number);
  // the upper edge: a random source returning just under one must not walk off the end
  assert.equal(drawSlip(() => 0.999999).number, SLIPS[SLIPS.length - 1].number);
  const seen = new Set();
  for (let i = 0; i < SLIPS.length; i++) seen.add(drawSlip(() => i / SLIPS.length).number);
  assert.equal(seen.size, SLIPS.length, 'some slip is unreachable by the draw');
});
