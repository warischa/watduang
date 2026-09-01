// gh#175, the invariant a reader of the diff cannot check by eye: after the confirm is accepted,
// every name field on the screen holds its seat's animal name again, no seat is added or removed, and
// every name a player typed is gone.
//
// This route is shaped differently from the other resets, and the difference is the point. It holds
// NO array of typed names on this screen (game.players does not exist until initPlayers runs, on
// Next), so the wipe is a write over the live inputs: resetNameInputs sets `inputs[i].value` and
// data-index IS the seat. It also reaches the cast through its own `defaultName` helper rather than
// through resetCastNames -- but defaultName is `mascotNames(i + 1)[i]`, so the names it writes ARE
// the shared cast, and that one-liner is pinned below by source so a future edit cannot quietly point
// it somewhere else. Which cast this route reads is deliberately not changed here.
//
// It runs the REAL bytes. main.js is a lifted IIFE with no exports, so both declarations are sliced
// out by source text and evaluated over plain `{ value }` objects -- which is all resetNameInputs
// touches, as its own comment states. A rename or a rewrite fails this file loudly instead of
// silently testing nothing.
//
// ponytail: no DOM. This proves the WIPE, and separately (by source, at the bottom) that the confirm
// is wired to it. That the buttons under the closing modal are re-armed is arm-reveal-paths.test.mjs's
// job, and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here -- a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { mascotNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `function <name>(...)` out of main.js by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} -- this test is measuring nothing`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `no body found for ${name}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while slicing ${name}`);
}

// defaultName is a brace-less arrow, so the brace walk above cannot slice it -- it would run on into
// whatever follows. Taken to the end of its own statement instead, and its shape asserted, so this
// file evaluates the route's real one-liner rather than one it wrote for the occasion.
const nameDecl = source.slice(source.indexOf('const defaultName = '));
const defaultNameDecl = nameDecl.slice(0, nameDecl.indexOf(';') + 1);
assert.match(defaultNameDecl, /^const defaultName = \(i\) => mascotNames\(i \+ 1\)\[i\];$/,
  'defaultName no longer reads the shared cast -- this test would be pinning a local invention');

const body = sliceFn('resetNameInputs');

// Applied, not returned: resetNameInputs closes over main.js's defaultName, which closes over the
// imported mascotNames, so the wrapper supplies the real one and CALLS the reset.
const applyReset = new Function(
  'inputs',
  'mascotNames',
  `${defaultNameDecl}\n${body};\nresetNameInputs(inputs); return inputs;`,
);

test('reset puts every name field back to its seat animal and loses every typed name', () => {
  // The screen a player is looking at when they press reset: five fields, three typed over, one of
  // them a string that is not in the cast at all, and one left blank.
  const typed = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', '', 'Bank'];
  const inputs = typed.map((value) => ({ value }));

  applyReset(inputs, mascotNames);

  assert.equal(inputs.length, 5, 'a seat appeared or vanished -- reset must keep the count');
  assert.deepEqual(inputs.map((el) => el.value), mascotNames(5));
  for (const name of ['พี่โต้ง', 'น้องหมวย', 'Bank']) {
    assert.ok(!inputs.some((el) => el.value === name), `a typed name survived the reset: ${name}`);
  }
});

test('reset holds at both ends of the 2-10 range', () => {
  for (const n of [2, 10]) {
    const inputs = Array.from({ length: n }, (_, i) => ({ value: `typed ${i}` }));
    applyReset(inputs, mascotNames);
    assert.deepEqual(inputs.map((el) => el.value), mascotNames(n));
  }
});

// Calibration, in the shape that can actually fail: the fields handed in are NOT the cast, so a
// resetNameInputs that did nothing at all leaves the tests above red. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a reset test passes on a
// no-op.
test('RED CALIBRATION: the fixtures start off-cast, so a no-op reset would fail', () => {
  assert.notDeepEqual(['พี่โต้ง', 'ชิบะ', 'น้องหมวย', '', 'Bank'], mascotNames(5));
  assert.notDeepEqual(Array.from({ length: 10 }, (_, i) => `typed ${i}`), mascotNames(10));
});

// The wiring the pure slice above cannot see: the confirm drives the wipe over the live fields, and
// over those fields only -- the seat count control is not in this handler.
test('the confirm handler drives the wipe over the name fields', () => {
  const handler = source.match(/#btnConfirmResetNames'\)\.onclick = \(\) => \{[\s\S]*?\n {6}\};/);
  assert.ok(handler, 'the reset confirm handler is no longer recognisable -- this test measures nothing');
  assert.match(handler[0], /resetNameInputs\(card\.querySelectorAll\('\.player-text-input'\)\)/);
  assert.match(handler[0], /closeResetNamesModal\(\)/);
});

// The confirm's copy names every loss it causes, per docs/agents/src-edit-rules.md. Pinned as text
// because it is the only part of this feature a player reads, and a well-meaning edit that drops the
// irreversibility clause is invisible to every other check in this directory. It lives in main.js
// here, not markup.html: this modal is built by script.
test('the confirm copy still names the loss and what survives', () => {
  assert.match(
    source,
    /ชื่อผู้เล่นที่พิมพ์ไว้จะถูกแทนด้วยชื่อสัตว์ทั้งหมด และเอากลับคืนไม่ได้ จำนวนผู้เล่นที่ตั้งไว้จะยังคงอยู่/,
  );
  // The trigger and the two answers, verbatim from the gh#174 pattern.
  assert.match(source, /↺ รีเซ็ตเป็นชื่อสัตว์/);
  assert.match(source, /เก็บชื่อเดิมไว้/);
});
