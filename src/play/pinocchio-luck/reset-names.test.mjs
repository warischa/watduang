// gh#179, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, the
// setup screen holds the animal cast again, it holds exactly as many seats as setupCount, and every
// name a player typed is gone.
//
// Runs the REAL bytes. main.js is a lifted IIFE with no exports, so resetSetupNames is sliced out by
// source text and evaluated over the setupCount/setupNames values this file supplies -- the same
// technique short-stick's reset-names.test.mjs uses on resetPlayerNames, adapted to a
// `function name(){}` declaration rather than a `const name = () => {}` one, because that is this
// file's own idiom (every render/state function in main.js is declared this way).
//
// ponytail: no DOM. resetSetupNames is a pure state move; the trigger -> dialog -> confirm wiring,
// and the fresh arm at the moment the dialog opens, are pinned by arm-reveal-paths.test.mjs. Neither
// file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here — a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { mascotNames, resetCastNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `function <name>(){...}` out of main.js by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `function ${name}(){`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while slicing ${name}`);
}

// Applied, not returned: resetSetupNames closes over the outer function's setupCount/setupNames
// parameters and reassigns setupNames, so the wrapper supplies both, calls it, and reads the result
// back off the same binding.
const body = sliceFn('resetSetupNames');
const applyReset = new Function(
  'setupCount',
  'setupNames',
  'resetCastNames',
  `${body}\nresetSetupNames();\nreturn setupNames;`,
);

test('reset restores the animal cast and keeps the seat count', () => {
  // Four seats, two renamed by hand, one renamed to a string that is not in the cast at all.
  const result = applyReset(4, ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'], resetCastNames);
  assert.equal(result.length, 4, 'the seat count changed — reset must keep it');
  assert.deepEqual(result, mascotNames(4));
  assert.ok(!result.includes('พี่โต้ง'), 'a typed name survived the reset');
  assert.ok(!result.includes('น้องหมวย'), 'a typed name survived the reset');
});

test('reset keeps the count at both ends of the 2-10 range, even when setupNames is shorter', () => {
  for (const n of [2, 10]) {
    // setupNames deliberately shorter than setupCount: a seat the stepper added that a player never
    // typed into. A reset keyed off setupNames.length would under-fill; setupCount is what
    // setupMarkup() actually renders, so that is what resetSetupNames reads.
    const result = applyReset(n, ['typed 0'], resetCastNames);
    assert.equal(result.length, n);
    assert.deepEqual(result, mascotNames(n));
  }
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetSetupNames that did nothing at all leaves this red.
test('RED CALIBRATION: the fixture starts off-cast, so a no-op reset would fail', () => {
  const before = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  assert.notDeepEqual(before, mascotNames(4));
});

// The one numbered default left on this route lives only in the setup placeholder (the aria-label
// beside it states the SEAT NUMBER, not a default name, and is kept -- see the comment at
// defaultName in main.js). Pinned by absence, so the positive half is pinned too: the cast import
// has to still be there.
test('no numbered placeholder default remains in main.js', () => {
  assert.doesNotMatch(source, /placeholder="ผู้เล่น \$\{/, 'a numbered placeholder default remains');
  assert.match(source, /import \{ mascotNames, resetCastNames \} from '\.\.\/_mascots\.ts';/);
});
