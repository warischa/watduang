// gh#174, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, the
// roster holds the animal cast again, it holds exactly as many seats as before, and every name a
// player typed is gone.
//
// It runs the REAL bytes. main.js is a lifted IIFE with no exports, so resetPlayerNames is sliced out
// by source text and evaluated over a `game` object this file supplies -- the same technique, and the
// same brace-matching slicer, that fairness.test.mjs already uses on lockFairCounts. A rename or a
// rewrite of resetPlayerNames fails this file loudly instead of silently testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly -- resetPlayerNames owns the
// state move and its handler owns saveDraft/renderSetup. What that costs is stated: this proves the
// WIPE, never that the button is wired to it. The wiring (trigger -> openDialog -> confirm button ->
// resetPlayerNames) is pinned by arm-reveal-paths.test.mjs, and neither file substitutes for the
// other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here — a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { mascotNames, resetCastNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `const <name> = ...;` out of main.js by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `const ${name} = `;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
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

// Applied, not returned: resetPlayerNames closes over main.js's `game` and over the shared cast's
// resetCastNames, so the wrapper supplies both and CALLS it.
const body = sliceFn('resetPlayerNames');
const applyReset = new Function('game', 'resetCastNames', `${body}; resetPlayerNames(); return game;`);

test('reset restores the animal cast, keeps the count, and loses every typed name', () => {
  // The screen a player is looking at when they press reset: four seats, two renamed by hand, one
  // renamed to a string that is not in the cast at all.
  const game = { players: ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'] };
  applyReset(game, resetCastNames);

  assert.equal(game.players.length, 4, 'the party changed size — reset must keep the count');
  assert.deepEqual(game.players, mascotNames(4));
  assert.ok(!game.players.includes('พี่โต้ง'), 'a typed name survived the reset');
  assert.ok(!game.players.includes('น้องหมวย'), 'a typed name survived the reset');
});

test('reset keeps the count at both ends of the 2-10 range', () => {
  for (const n of [2, 10]) {
    const game = { players: Array.from({ length: n }, (_, i) => `typed ${i}`) };
    applyReset(game, resetCastNames);
    assert.equal(game.players.length, n);
    assert.deepEqual(game.players, mascotNames(n));
  }
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetPlayerNames that did nothing at all leaves this red. Asserted here rather than left implicit,
// because a fixture that already satisfies the expectation is how a reset test passes on a no-op.
test('RED CALIBRATION: the fixture starts off-cast, so a no-op reset would fail', () => {
  const before = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  assert.notDeepEqual(before, mascotNames(4));
});

// main.js must have no numbered default left on any path a player can see. The visible-name paths are
// the state array it boots with, the placeholder, the blank-field fallback and the added seat; all
// four now route through the shared cast. Pinned by absence, which is fragile on its own, so the
// positive half is pinned too: the cast import has to still be there.
test('no numbered default remains in main.js', () => {
  const numbered = source
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(source, /import \{[^}]*mascotNames[^}]*\} from '\.\.\/_mascots\.ts'/);
});
