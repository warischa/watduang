// gh#175, the invariant a reader of the diff cannot check by eye: after the reset confirm is
// accepted, the seat names hold the animal cast again, the array keeps exactly as many seats as
// before, and every name a player typed is gone.
//
// It runs the REAL bytes. main.ts is a module whose top level touches `document`, so it cannot be
// imported here; resetPlayerNames is sliced out by source text and evaluated over a `names` array
// this file supplies — the same technique timebomb/reset-names.test.mjs uses. A rename or a rewrite
// of resetPlayerNames fails this file loudly instead of silently testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly — resetPlayerNames owns the
// state move and the confirm handler owns save() and renderRows(). What that costs is stated: this
// proves the WIPE, and separately (by source, at the bottom) that the confirm handler is wired to it
// and persists the result. That the dialog's buttons are inert for their arm window is
// arm-reveal-paths.test.mjs's job, and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast and the real seat range, imported rather than re-listed here — a stand-in would test
// this file's idea of the reset instead of the one that ships.
import { mascotNames, resetCastNames } from '../_mascots.ts';
import game from '../../games/dice-loser.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

/** Slices `function <name>(...)` out of main.ts by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.ts no longer declares ${name} — this test is measuring nothing`);
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

// `new Function` parses JavaScript, not TypeScript. The slice carries exactly one annotation, the
// return type, and it is stripped here — asserted first, so a rewrite that changes the declaration's
// shape fails loudly instead of quietly evaluating something this file did not read.
const sliced = sliceFn('resetPlayerNames');
assert.match(sliced, /^function resetPlayerNames\(\): void \{/);
const body = sliced.replace('function resetPlayerNames(): void {', 'function resetPlayerNames() {');

// Applied, not returned: resetPlayerNames closes over main.ts's module-level `names` and over the
// shared cast's resetCastNames, so the wrapper supplies both and CALLS it.
const applyReset = new Function(
  'seed',
  'resetCastNames',
  `let names = seed; ${body}; resetPlayerNames(); return names;`,
);

// What main.ts's own `names` always holds: one entry per seat the game allows, whatever `count` is.
const SEATS = game.players[1];
const castNames = mascotNames(SEATS);

test('reset restores the animal cast and loses every typed name', () => {
  // The screen a player is looking at when they press reset: mascot seats, three renamed by hand,
  // one of them to a string that is not in the cast at all.
  const seed = castNames.slice();
  seed[0] = 'พี่โต้ง';
  seed[2] = 'น้องหมวย';
  seed[5] = 'Bank';

  const after = applyReset(seed, resetCastNames);

  assert.deepEqual(after, castNames);
  for (const typed of ['พี่โต้ง', 'น้องหมวย', 'Bank']) {
    assert.ok(!after.includes(typed), `a typed name survived the reset: ${typed}`);
  }
});

test('reset keeps the seat array the same length, so the player count cannot move', () => {
  const after = applyReset(
    Array.from({ length: SEATS }, (_, i) => `typed ${i}`),
    resetCastNames,
  );
  assert.equal(after.length, SEATS);
  // The count lives in a separate variable that resetPlayerNames does not name at all — pinned as
  // absence, because the promise the confirm's copy makes is exactly that the party keeps its size.
  assert.doesNotMatch(body, /\bcount\b/, 'resetPlayerNames now touches `count` — the confirm promises it survives');
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetPlayerNames that did nothing at all leaves the first test red. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a reset test passes on a
// no-op.
test('RED CALIBRATION: the fixtures start off-cast, so a no-op reset would fail', () => {
  const seed = castNames.slice();
  seed[0] = 'พี่โต้ง';
  assert.notDeepEqual(seed, castNames);
  assert.notDeepEqual(
    Array.from({ length: SEATS }, (_, i) => `typed ${i}`),
    castNames,
  );
});

// The wiring the pure slice above cannot see: the confirm persists the wipe and redraws the rows.
// Without save() the typed names come back on the next load, which is the opposite of what the copy
// promises ("เอากลับคืนไม่ได้").
test('the confirm handler persists the wipe and redraws the rows', () => {
  const handler = source.match(/resetConfirmEl\?\.addEventListener\('click',[\s\S]*?\n\}\);/);
  assert.ok(handler, 'the reset confirm handler is no longer recognisable — this test measures nothing');
  assert.match(handler[0], /\bresetPlayerNames\(\)/);
  assert.match(handler[0], /\bsave\(\)/);
  assert.match(handler[0], /\brenderRows\(\)/);
});

// The confirm's copy names every loss it causes, per docs/agents/src-edit-rules.md. Pinned as text
// because it is the only part of this feature a player reads, and a well-meaning edit that drops the
// irreversibility clause is invisible to every other check in this directory.
test('the confirm copy still names the loss and what survives', () => {
  const markup = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
  assert.match(
    markup,
    /ชื่อผู้เล่นที่พิมพ์ไว้จะถูกแทนด้วยชื่อสัตว์ทั้งหมด และเอากลับคืนไม่ได้ จำนวนผู้เล่นและกติกาที่ตั้งไว้จะยังคงอยู่/,
  );
  // The trigger and the two answers, verbatim from the gh#174 pattern.
  assert.match(markup, /↺ รีเซ็ตเป็นชื่อสัตว์/);
  assert.match(markup, /เก็บชื่อเดิมไว้/);
});
