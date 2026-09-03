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

// gh#175 box: "All three open with animal names, and a search for the numbered default returns
// nothing a player can see" — the test above already covers main.js; markup.html is a second surface
// a player reads (the reset confirm's own copy, the player-tag labels) and gets the same absence
// check. The player-tag `#${i + 1}` seat labels are a position marker, not a name, so they are outside
// what this box means and are excluded on purpose.
test('gh#175 box: no numbered default remains in markup.html', () => {
  const markup = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
  const numbered = markup
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line));
  assert.deepEqual(numbered, [], `numbered default(s) left in markup.html: ${JSON.stringify(numbered)}`);
});

// gh#175 boxes: "Removing a player does not re-number or rename the players who remain" and "Renaming
// still persists as it does today". This route holds its setup roster as DOM input values -- there is
// no game.players array before Start -- so renderSetupPlayerInputs IS the removal/persistence path: it
// reads every current input's .value, clears the container, and rebuilds one row per seat, carrying
// existingNames[i] forward by POSITION. Sliced as real bytes (escapeHtml + renderSetupPlayerInputs, in
// the order main.js declares them) and driven with a minimal DOM stand-in -- a fake input list read
// back out of the generated markup by its own `value="..."` attribute, the same thing a real browser
// would hand back on the next read. No jsdom: the collaborators here touch nothing DOM cannot be
// modelled as (createElement, one container, plain objects).
function sliceFunction(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
  const open = source.indexOf('{', start);
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

const escapeHtmlBody = sliceFunction('escapeHtml');
const renderBody = sliceFunction('renderSetupPlayerInputs');
// defaultName is the arrow renderSetupPlayerInputs closes over for the placeholder — sliced too, so
// the placeholder this file sees is the same one-liner main.js declares, not a re-typed stand-in.
const defaultNameDecl = 'const defaultName = ';
const defaultNameDeclAt = source.indexOf(defaultNameDecl);
assert.notEqual(defaultNameDeclAt, -1, 'main.js no longer declares defaultName — this test is measuring nothing');
const defaultNameSemiAt = source.indexOf(';', defaultNameDeclAt);
const defaultNameBody = source.slice(defaultNameDeclAt, defaultNameSemiAt + 1);

/** A fake DOM good for exactly this function: one container that remembers what it was last asked to
 *  render, read back by parsing the `value="..."` attribute out of the innerHTML string the real
 *  function writes -- the same round trip a browser does when it parses an attribute into an initial
 *  property value. */
function makeContainer(initialValues) {
  const initialInputs = initialValues.map((v) => ({ value: v }));
  let rows = [];
  return {
    querySelectorAll: (sel) => (sel === '.player-name-input' ? initialInputs : []),
    set innerHTML(_v) {
      rows = [];
    },
    get innerHTML() {
      return '';
    },
    appendChild(row) {
      const m = /value="([^"]*)"/.exec(row.innerHTML);
      rows.push({ value: m ? m[1] : '' });
    },
    get rows() {
      return rows;
    },
  };
}

const runRender = new Function(
  'document',
  'DOM',
  'setupPlayerCount',
  'mascotNames',
  `${defaultNameBody}\n${escapeHtmlBody}\n${renderBody}\nrenderSetupPlayerInputs();`,
);

/** Drives the real function once and returns the rendered rows' `.value`s in seat order. */
function render(existingValues, count) {
  const container = makeContainer(existingValues);
  const document_ = { createElement: () => ({ className: '', innerHTML: '' }) };
  const DOM = {
    displayPlayerCount: { textContent: '' },
    labelPlayerCount: { textContent: '' },
    playerNamesContainer: container,
  };
  runRender(document_, DOM, count, mascotNames);
  return container.rows.map((r) => r.value);
}

test('gh#175 box: removing a player does not re-number or rename the players who remain', () => {
  const values = render(['พี่โต้ง', '', 'ชิบะ', 'น้องหมวย', 'Bank'], 3);
  assert.deepEqual(
    values,
    ['พี่โต้ง', '', 'ชิบะ'],
    'a surviving seat was renamed or shifted after later seats were removed',
  );
});

test('gh#175 box: renaming still persists as it does today (grow keeps every existing rename)', () => {
  const values = render(['พี่โต้ง', 'ชิบะ'], 4);
  assert.equal(values[0], 'พี่โต้ง', 'a typed name did not persist across a player-count change');
  assert.equal(values[1], 'ชิบะ', 'a typed name did not persist across a player-count change');
  // The two new seats are untyped -- an empty value, not a renumbered copy of an existing name.
  assert.equal(values[2], '');
  assert.equal(values[3], '');
});
