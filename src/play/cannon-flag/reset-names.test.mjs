// gh#175, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, the
// input values the confirm handler writes back hold the animal cast again, hold exactly as many
// entries as the roster it was handed, and every name a player typed is gone.
//
// It runs the REAL bytes. main.js is a lifted IIFE with no exports, so resetPlayerNames is sliced out
// by source text and evaluated, the same brace-matching slicer short-stick/reset-names.test.mjs uses
// on its own resetPlayerNames. A rename or a rewrite of the function fails this file loudly instead
// of silently testing nothing.
//
// ponytail: no DOM. This route holds its setup roster as the current .player-name-input values, not
// a game.players array, so resetPlayerNames here is a pure array-in/array-out function with nothing
// to preserve but shape -- the DOM write-back is the confirm handler's job, not this function's, and
// arm-reveal-paths.test.mjs pins that the handler is wired to call it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here — a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { mascotNames, resetCastNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `const <name> = ...;` out of main.js by matching braces/parens from the first opener after
 *  the declaration. resetPlayerNames is an arrow with an expression body (`(names) => resetCastNames(names);`),
 *  so this matches parens as readily as braces. */
function sliceFn(name) {
  const decl = `const ${name} = `;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
  const semi = source.indexOf(';', start);
  assert.notEqual(semi, -1, `no terminating ; found for ${name}`);
  return source.slice(start, semi + 1);
}

// Evaluated with resetCastNames supplied by the wrapper, the same real import the file itself uses —
// a stand-in implementation would test this file's idea of the cast, not the one that ships.
const body = sliceFn('resetPlayerNames');
const resetPlayerNames = new Function('resetCastNames', `${body}\nreturn resetPlayerNames;`)(resetCastNames);

test('reset returns the animal cast, keeps the count, and loses every typed name', () => {
  // The four values a player is looking at when they press reset: two renamed by hand, one renamed
  // to a string that is not in the cast at all.
  const typed = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  const result = resetPlayerNames(typed);

  assert.equal(result.length, 4, 'the roster changed size — reset must keep the count');
  assert.deepEqual(result, mascotNames(4));
  assert.ok(!result.includes('พี่โต้ง'), 'a typed name survived the reset');
  assert.ok(!result.includes('น้องหมวย'), 'a typed name survived the reset');
});

test('reset keeps the count at both ends of the 2-10 range', () => {
  for (const n of [2, 10]) {
    const typed = Array.from({ length: n }, (_, i) => `typed ${i}`);
    const result = resetPlayerNames(typed);
    assert.equal(result.length, n);
    assert.deepEqual(result, mascotNames(n));
  }
});

// Calibration, in the shape that can actually fail: the fixture handed in is NOT the cast, so a
// resetPlayerNames that did nothing at all (returned its input unchanged) leaves this red.
test('RED CALIBRATION: the fixture starts off-cast, so a no-op reset would fail', () => {
  const before = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  assert.notDeepEqual(before, mascotNames(4));
});

// main.js must have no numbered default left on either visible-name path: the placeholder and the
// blank-field fallback in MatchEngine.setupMatch. Pinned by absence, which is fragile on its own, so
// the positive half is pinned too: the cast import has to still be there.
test('no numbered default remains in main.js', () => {
  const numbered = source
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(source, /import \{[^}]*mascotNames[^}]*\} from '\.\.\/_mascots\.ts'/);
});
