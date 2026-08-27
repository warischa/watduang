// node --test src/tools/ — no framework, no dependency
// Covers the pure wheel logic exported from wheel.ts (no DOM needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickName,
  segmentPath,
  segmentEndpoints,
  labelGeometry,
  labelFontSize,
  labelText,
  landingRotation,
  segmentAtPointer,
  nameAtPointer,
  WHEEL_RIM_R,
  WHEEL_CX,
  WHEEL_CY,
  WHEEL_PALETTE,
} from './wheel.ts';
import { remainingSlots, slotTokens } from './name-list.ts';
import { drawNames } from './draw.ts';
import { WheelRound } from './wheel-round.ts';

const here = dirname(fileURLToPath(import.meta.url));

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
    const r = i / steps; // covers [0, 1)
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

// ---- Wheel geometry (gh#92) -----------------------------------------------------

// The eight paths the artboard draws, in artboard order — segmentPath must reproduce them
// byte-exact for count 8, or the built wheel drifts from the canvas (ADR-0033).
const ARTBOARD_PATHS_8 = [
  'M200 200 L137.2 48.5 A164 164 0 0 1 262.8 48.5 Z',
  'M200 200 L262.8 48.5 A164 164 0 0 1 351.5 137.2 Z',
  'M200 200 L351.5 137.2 A164 164 0 0 1 351.5 262.8 Z',
  'M200 200 L351.5 262.8 A164 164 0 0 1 262.8 351.5 Z',
  'M200 200 L262.8 351.5 A164 164 0 0 1 137.2 351.5 Z',
  'M200 200 L137.2 351.5 A164 164 0 0 1 48.5 262.8 Z',
  'M200 200 L48.5 262.8 A164 164 0 0 1 48.5 137.2 Z',
  'M200 200 L48.5 137.2 A164 164 0 0 1 137.2 48.5 Z',
];

test('segmentPath คืนร่าง 8 ช่องได้ตรงกับ artboard ทีละไบต์', () => {
  for (let i = 0; i < 8; i++) {
    assert.equal(segmentPath(i, 8), ARTBOARD_PATHS_8[i], `ช่องที่ ${i}`);
  }
});

test('จุดปลายของทุกช่องอยู่บนเส้นขอบรัศมี 164 และกินมุม 360/count', () => {
  for (const count of [2, 3, 5, 8, 12, 40]) {
    for (let i = 0; i < count; i++) {
      const { from, to } = segmentEndpoints(i, count);
      for (const p of [from, to]) {
        const dist = Math.hypot(p.x - WHEEL_CX, p.y - WHEEL_CY);
        assert.ok(Math.abs(dist - WHEEL_RIM_R) < 1e-6, `count=${count} ช่อง ${i}: รัศมี ${dist}`);
      }
      // angle of each endpoint (clockwise from 12) must land exactly on the segment bounds
      const ang = (p) => (Math.atan2(p.x - WHEEL_CX, WHEEL_CY - p.y) * 180) / Math.PI;
      const seg = 360 / count;
      const fromA = (ang(from) + 360) % 360;
      const toA = (ang(to) + 360) % 360;
      assert.ok(Math.abs(fromA - ((i * seg - seg / 2) + 360) % 360) < 1e-6, `from ${count}/${i}`);
      assert.ok(Math.abs(toA - ((i * seg + seg / 2) + 360) % 360) < 1e-6, `to ${count}/${i}`);
    }
  }
});

test('labelGeometry วางป้ายที่มุม i*360/count ระหว่าง hub กับ rim', () => {
  for (const count of [2, 4, 8, 16]) {
    for (let i = 0; i < count; i++) {
      const l = labelGeometry(i, count);
      assert.equal(((l.angle % 360) + 360) % 360, ((i * 360) / count) % 360);
      const dist = Math.hypot(l.x - WHEEL_CX, l.y - WHEEL_CY);
      assert.ok(dist > 46 && dist < 164, `count ${count}/${i}: ป้ายออกนอกวง ${dist}`);
    }
  }
});

test('landingRotation วางช่องที่เลือกไว้ตรงเข็มชี้ 12 นาฬิกาเสมอ', () => {
  for (const count of [2, 3, 8, 17, 40]) {
    for (const index of [0, 1, count - 1]) {
      for (const current of [0, 37, 359, 720 + 41]) {
        const final = landingRotation(current, index, count, 3);
        const seg = 360 / count;
        // pointer sits at 0; the picked segment centre must be at 0 after the rotation
        const centre = (((index * seg + final) % 360) + 360) % 360;
        assert.ok(Math.abs(centre) < 1e-9 || Math.abs(centre - 360) < 1e-9, `count ${count}/${index} from ${current}: centre ${centre}`);
        assert.ok(final - current >= 3 * 360 - 1e-9, 'ต้องหมุนอย่างน้อยครบรอบที่ขอ');
      }
    }
  }
});

test('landingRotation ไม่ติดลบ และหมุนเต็มรอบเมื่อช่องเป้าเป็นช่องเดิมเสมอ', () => {
  // current already lands segment 0 under the pointer with count 4 (its centre sits at 0);
  // asking for segment 0 again must add exactly `turns` full turns, no half-turn jitter
  const final = landingRotation(0, 0, 4, 5);
  assert.equal(final, 5 * 360);
  const finalNeg = landingRotation(-90, 1, 4, 2);
  assert.ok(finalNeg >= 2 * 360 - 90);
});

test('labelFontSize อยู่ที่ 21 สำหรับ 8 ช่อง แล้วค่อยๆเล็กลง ไม่ต่ำกว่า 13', () => {
  assert.equal(labelFontSize(2), 21);
  assert.equal(labelFontSize(8), 21);
  const mid = labelFontSize(10);
  assert.ok(mid < 21 && mid >= 13);
  assert.ok(labelFontSize(40) >= 13);
  // monotonic non-increasing
  let prev = 21;
  for (let n = 2; n <= 60; n++) {
    const f = labelFontSize(n);
    assert.ok(f <= prev, `n=${n}: ${f} > ${prev}`);
    prev = f;
  }
});

test('labelText ตัดชื่อยาวที่เกินช่องและลงท้ายด้วย ellipsis ชื่อสั้นไม่แตะ', () => {
  // canonical 8-name disc: artboard names (all <= 5 chars) must print whole
  for (const name of ['บีม', 'มายด์', 'ปอนด์', 'เจได', 'ฟ้า', 'แทน', 'แก้ม', 'ปาล์ม']) {
    assert.equal(labelText(name, 8), name);
  }
  const long = 'ชื่อนี้ยาวเกินช่องไปมากจริงๆ';
  const cut = labelText(long, 8);
  assert.ok(cut.endsWith('…'));
  assert.ok(cut.length <= 6);
  assert.ok(long.startsWith(cut.slice(0, -1)));
  // thin segments cut harder than wide ones
  assert.ok(labelText(long, 20).length <= labelText(long, 8).length);
});

test('WHEEL_PALETTE ตามลำดับสีของ artboard', () => {
  assert.deepEqual([...WHEEL_PALETTE], ['#ffd27f', '#f89880', '#7fd8e8']);
});

// ---- Pointer/announcement invariant (confirmed defect: reveal() re-sliced the disc while
// `rotation` still encoded an index into the OLD list) ------------------------------------------

test('segmentAtPointer วิ่งย้อนกลับ landingRotation ได้ทุกกรณี — segment ที่หมุนไปตรงเข็มคือ index เดิมเสมอ', () => {
  for (const count of [2, 3, 8, 17, 40]) {
    for (const index of [0, 1, count - 1]) {
      for (const current of [0, 37, 359, 720 + 41]) {
        const final = landingRotation(current, index, count, 3);
        assert.equal(segmentAtPointer(final, count), index, `count ${count}/${index} from ${current}`);
      }
    }
  }
});

test('gh#confirmed-defect: ชื่อใต้เข็มต้องมาจาก array เดียวกับที่ indexOf ใช้คำนวณ ไม่ใช่ array ที่ตัดชื่อออกแล้ว', () => {
  const namesIndexed = ['เอ', 'บี', 'ซี'];
  const index = 1; // the picked name is namesIndexed[1]
  const rotation = landingRotation(0, index, namesIndexed.length, 4);
  assert.equal(rotation, 1680); // pins the exact arithmetic from the confirmed defect report

  // Correct: draw the disc from the SAME list `index` was taken from.
  assert.equal(nameAtPointer(namesIndexed, rotation), namesIndexed[index]);

  // The confirmed defect, reproduced: re-slicing to the post-elimination list (one name removed)
  // before the reveal changes what the wheel shows, even though the announced name doesn't.
  const namesAfterElimination = namesIndexed.filter((n) => n !== namesIndexed[index]); // the two survivors, in order
  assert.notEqual(nameAtPointer(namesAfterElimination, rotation), namesIndexed[index]);
});

// wheel.astro is a page script — plain node cannot import it, so the invariant is pinned at the
// source-text level (same bargain as GameNav.test.mjs / index.test.mjs). This is the one check
// that actually depends on wheel.astro's own source: restoring the old `drawWheel(remaining())`
// call inside reveal() must turn this test red, since that call is exactly the confirmed defect —
// the disc gets re-sliced while `rotation` still points at an index into the OLD list.
test('gh#confirmed-defect: reveal() ต้องไม่วาดวงล้อใหม่ก่อนรอบถัดไป — ไม่งั้นเข็มชี้จะไม่ตรงกับชื่อที่ประกาศ', () => {
  const src = readFileSync(join(here, '..', 'pages', 'tool', 'wheel.astro'), 'utf8');
  const revealStart = src.indexOf('function reveal(');
  const nextFnStart = src.indexOf('function pickFrom(');
  assert.ok(revealStart > -1 && nextFnStart > revealStart, 'reveal() หรือ pickFrom() หาไม่เจอ — โครงสร้างไฟล์เปลี่ยน');
  const revealBody = src.slice(revealStart, nextFnStart);
  assert.ok(
    !/drawWheel\(/.test(revealBody),
    'reveal() ต้องไม่เรียก drawWheel() — การวาดวงล้อใหม่ต้องรอจนกว่ารอบถัดไปจะเริ่ม',
  );
});

// ---- Duplicate names each own a turn (owner-decided: parseNameLines keeps duplicates) ----------
// Elimination used to be keyed on the name string, so two players who both typed "แนน" went out on
// one pick. Rounds are keyed on ROSTER POSITION now. This driver is the wheel page's round loop with
// the DOM taken out: same helpers, same pickers, same order of operations as spin() + reveal().
// It DRIVES WheelRound rather than reimplementing it: every question the loop asks (who is left,
// which offset a spin lands on, who a reveal takes out) is answered by the shipped class, so a
// regression inside remaining()/pickFrom()/reveal() reds these tests. A test-side `spun` Set and a
// local pickName call would only ever prove this file's own arithmetic.
function runWheelRound(players, random) {
  const round = new WheelRound();
  round.start(players);
  const reveals = [];
  let rotation = 0;
  while (true) {
    const left = round.remaining(true);
    if (left.length === 0) break;
    assert.ok(reveals.length <= players.length, 'the round must terminate within one reveal per player');
    // The answer is picked FIRST; the landing angle is derived from its offset (never read back).
    const offset = round.pickFrom(left, random);
    const slot = left[offset];
    rotation = landingRotation(rotation, offset, left.length, 4);
    // The disc is drawn from this same `left`, so the pointer must sit on the announced slot.
    assert.equal(nameAtPointer(left.map((s) => s.name), rotation), slot.name, 'pointer/announcement mismatch');
    round.reveal(slot, true);
    reveals.push({ name: slot.name, isLast: round.remaining(true).length === 0 });
  }
  return reveals;
}

// A fixed cycle of random values — every offset in a 3-, 2- and 1-slot pool is reachable from it.
function cycledRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('two players typing the same name each get their own spin (three names, one goes out per spin)', () => {
  for (const values of [[0], [0.9], [0.5, 0, 0.999999], [0.34, 0.67, 0.12]]) {
    const reveals = runWheelRound(['แนน', 'แนน', 'บี'], cycledRandom(values));
    assert.equal(reveals.length, 3, `exactly one player leaves per spin (random cycle ${values})`);
    assert.deepEqual(
      reveals.map((r) => r.name).sort(),
      ['บี', 'แนน', 'แนน'].sort(),
      'every slot is announced exactly once — the duplicate is announced twice, not once',
    );
    assert.deepEqual(reveals.map((r) => r.isLast), [false, false, true], 'only the third reveal is the last one');
  }
});

test('a two-person wheel of one repeated name takes TWO spins, and the first reveal is not the last', () => {
  const reveals = runWheelRound(['แนน', 'แนน'], cycledRandom([0.75]));
  assert.equal(reveals.length, 2, 'both slots spin, even though the names are identical');
  assert.equal(reveals[0].isLast, false, 'the first reveal must not be announced as คนสุดท้าย');
  assert.equal(reveals[1].isLast, true);
  assert.deepEqual(reveals.map((r) => r.name), ['แนน', 'แนน']);
});

test('draw: one press of N takes N distinct slots out, duplicates included', () => {
  const players = ['แนน', 'แนน', 'บี', 'แนน'];
  const drawnPositions = new Set();
  let presses = 0;
  const random = cycledRandom([0.5, 0, 0.9]);
  while (true) {
    const left = remainingSlots(players, drawnPositions);
    if (left.length === 0) break;
    const count = Math.min(2, left.length);
    const picked = drawNames(slotTokens(left), count, random).map((token) => left[Number(token)]);
    assert.equal(new Set(picked.map((s) => s.index)).size, count, 'one press never hands out one slot twice');
    for (const slot of picked) drawnPositions.add(slot.index);
    presses += 1;
    assert.ok(presses <= players.length, 'the box must empty');
  }
  assert.equal(drawnPositions.size, 4, 'all four slots left the box, not just the two distinct names');
  assert.equal(presses, 2, 'two presses of two');
});

// The round itself now lives in wheel-round.ts (gh#118), so it is driven directly instead of read
// as source text — a source pin cannot tell slot.index from players.indexOf(slot.name), and draw.ts
// learned the same lesson first (DrawRound / draw.test.mjs). Mirrors DrawRound's own pin: offset 4
// (0.85 * 5) is the THIRD "แนน", not the first one at index 1 — a name-lookup mutation
// (spun.add(this.players.indexOf(picked.name)) instead of spun.add(picked.index)) takes the wrong
// slot out and this goes red.
test('WheelRound: หมุนได้สลอตที่ 4 ของชื่อซ้ำ ต้องเอาคนนั้นออก ไม่ใช่คนแรกที่ชื่อเหมือนกัน', () => {
  const round = new WheelRound();
  round.start(['บี', 'แนน', 'ซี', 'แนน', 'แนน']);
  const left = round.remaining(true);
  const offset = round.pickFrom(left, () => 0.85);
  const picked = left[offset];
  assert.equal(picked.index, 4);
  round.reveal(picked, true);
  const remainingIdx = round.remaining(true).map((s) => s.index);
  assert.ok(!remainingIdx.includes(4), 'the slot that was picked must not still be on the disc');
  assert.ok(remainingIdx.includes(1), 'the OTHER แนน must still be on the disc — the wrong person left');
  assert.deepEqual(remainingIdx, [0, 1, 2, 3]);
});

test('WheelRound: วงล้อต้องหมดพอดีเท่าจำนวนสลอต ชื่อซ้ำนับแยกคน', () => {
  const round = new WheelRound();
  const players = ['บี', 'แนน', 'ซี', 'แนน', 'แนน'];
  round.start(players);
  assert.equal(round.size, players.length, 'no dedupe, no cap — every line is its own slot');

  const takenNames = [];
  const takenPositions = new Set();
  let spins = 0;
  const cycle = [0.85, 0, 0.999999, 0.4];
  while (round.remaining(true).length > 0) {
    assert.ok(spins < players.length, 'the disc must empty in one spin per slot');
    const left = round.remaining(true);
    const offset = round.pickFrom(left, () => cycle[spins % cycle.length]);
    const picked = left[offset];
    round.reveal(picked, true);
    assert.ok(!takenPositions.has(picked.index), `position ${picked.index} was picked twice`);
    takenPositions.add(picked.index);
    takenNames.push(picked.name);
    spins += 1;
  }
  assert.equal(spins, players.length);
  assert.deepEqual(takenNames.sort(), [...players].sort(), 'แนน must be announced three times, not once');
});

// Defect 2: at rest AFTER a reveal the disc is frozen on the geometry `rotation` encodes, so the
// eliminate checkbox must not redraw it — and must not cancel the pending reveal either.
test('the eliminate checkbox never redraws a disc that is holding a reveal, and never cancels a spin', () => {
  const src = readFileSync(join(here, '..', 'pages', 'tool', 'wheel.astro'), 'utf8');
  const start = src.indexOf("eliminateBox.addEventListener('change'");
  assert.ok(start > -1, 'the eliminate change handler moved');
  // Comment lines dropped first: this handler's comment NAMES the call it must not make, and a
  // plain text search cannot tell a mention from a use.
  const body = src
    .slice(start, src.indexOf('for (const el of modeEls)', start))
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  // gh#125 loosened this: it used to pin the exact string `if (!spinning && !discHoldsReveal)`, so
  // swapping the two operands or writing `if (!(spinning || discHoldsReveal))` — both semantically
  // identical — reddened it. What is load-bearing is that BOTH bits gate the redraw, not the order or
  // the spelling. The guard is taken as the text of the nearest enclosing `if (` before the call, so a
  // guard split over several lines is read too.
  const drawAt = body.indexOf('drawWheel(');
  assert.ok(drawAt > 0, 'the handler no longer redraws at all — this test is watching the wrong shape');
  const guardAt = body.lastIndexOf('if (', drawAt);
  assert.ok(guardAt >= 0, 'the redraw is unguarded — a disc holding a reveal gets repainted');
  const guard = body.slice(guardAt, drawAt);
  // REFUTE on gh#125's loosening: presence of the two identifiers is not the invariant — an inverted
  // guard (`if (spinning && discHoldsReveal)`) redraws exactly when it must not, and a non-enclosing
  // `if` on the line above an unguarded call both passed. The invariant is: the nearest `if` ENCLOSES
  // the call (no statement boundary between them) and both bits appear NEGATED — as `!x && !y` in
  // either order, or the de Morgan form `!(x || y)`.
  assert.ok(!guard.includes('}'), 'the if above the redraw does not enclose it — the call is unguarded');
  const negatedBoth =
    /!\s*spinning\b[\s\S]*!\s*discHoldsReveal\b|!\s*discHoldsReveal\b[\s\S]*!\s*spinning\b/.test(guard);
  const deMorgan = /!\s*\(\s*(spinning\s*\|\|\s*discHoldsReveal|discHoldsReveal\s*\|\|\s*spinning)\s*\)/.test(guard);
  assert.ok(negatedBoth || deMorgan, 'the redraw must run only when NEITHER spinning nor discHoldsReveal holds');
  assert.ok(!/cancelPendingSpin\(/.test(body), 'cancelPendingSpin() here would swallow the pending reveal');
});

// ---- gh#119: recording is conditional, so it matches the conditional filter -------------------
// Decision: record only while the eliminate box is checked. Ticking applies FORWARD only — a player
// who left the box unchecked must never uncover retroactive eliminations by tapping it.
// WheelRound.reveal(picked, gated) is driven directly — the gate lives in the real shipped module
// (wheel-round.ts), not restated in the test, so reverting the one-line fix there turns the four
// behaviour legs below red too. `gated` stands in for a reveal-time read of the eliminate checkbox;
// wheel.astro is the only caller that ever produces it from the DOM.

test('gh#119: three spins with the box unchecked, then ticking it, leaves every name on the disc', () => {
  const round = new WheelRound();
  round.start(['เอ', 'บี', 'ซี', 'ดี']);
  for (const offset of [0, 1, 1]) {
    const left = round.remaining(false); // unchecked: nothing recorded while spinning
    round.reveal(left[offset], false);
  }
  assert.deepEqual(round.remaining(false).map((s) => s.name), ['เอ', 'บี', 'ซี', 'ดี'], 'unchecked: nothing may leave the disc');
  assert.deepEqual(
    round.remaining(true).map((s) => s.name),
    ['เอ', 'บี', 'ซี', 'ดี'],
    'ticking the box must not retroactively eliminate the three picks made while it was unchecked',
  );
});

test('gh#119: with the box checked throughout, a pick is still eliminated', () => {
  const round = new WheelRound();
  round.start(['เอ', 'บี', 'ซี']);
  const left = round.remaining(true);
  round.reveal(left[0], true);
  assert.deepEqual(round.remaining(true).map((s) => s.name), ['บี', 'ซี'], 'the checked box must still take the pick out');
});

test('gh#119: ticking mid-round eliminates only the picks made after the tick', () => {
  const round = new WheelRound();
  round.start(['เอ', 'บี', 'ซี']);
  const before = round.remaining(false)[0]; // picked while unchecked — stays
  round.reveal(before, false);
  const after = round.remaining(true)[1]; // picked while checked — goes
  round.reveal(after, true);
  assert.equal(before.name, 'เอ');
  assert.equal(after.name, 'บี');
  assert.deepEqual(round.remaining(true).map((s) => s.name), ['เอ', 'ซี'], 'only the post-tick pick leaves');
});

test('gh#119: gating the record keeps position-keying — one of two identical names goes, not both', () => {
  const round = new WheelRound();
  round.start(['แนน', 'แนน', 'บี']);
  const picked = round.remaining(true)[0];
  round.reveal(picked, true);
  assert.equal(picked.index, 0, 'the first slot was the pick');
  assert.deepEqual(round.remaining(true).map((s) => s.name), ['แนน', 'บี'], 'the other แนน is a different slot and must survive');
});
