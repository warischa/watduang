// gh#140: the setup roster row opens with the seat's ANIMAL, not a seat number. The shared shell
// panel already satisfied that ticket; this route builds its own setup screen, so its .player-tag
// badge kept rendering `#1`, `#2`, `#3` beside the mascot placeholders until this test's subject was
// fixed.
//
// It runs the REAL bytes -- renderSetupPlayerInputs is sliced out of main.js and driven over the same
// minimal container reset-names.test.mjs uses on it, reading the badge back out of the row markup the
// real function writes. A rewrite of that function fails this file loudly instead of testing nothing.
//
// This route's row has NO aria-label to guard: the input carries only a placeholder, and the badge is
// aria-hidden because it pictures the animal that placeholder already names. The seat's POSITION is a
// separate channel and is deliberately not sourced from the cast -- see the sibling routes that do
// carry a numbered label (gh#177).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast and the real icon lookup, imported rather than re-listed here.
import { MASCOTS, mascotEmoji, mascotNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `function <name>(...)` out of main.js by matching braces from the first `{` of its body. */
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
// defaultName is the arrow renderSetupPlayerInputs closes over for the placeholder -- sliced too, so
// the row this file sees is the whole row main.js writes, badge and placeholder together.
const defaultNameDecl = 'const defaultName = ';
const defaultNameDeclAt = source.indexOf(defaultNameDecl);
assert.notEqual(defaultNameDeclAt, -1, 'main.js no longer declares defaultName — this test is measuring nothing');
const defaultNameBody = source.slice(defaultNameDeclAt, source.indexOf(';', defaultNameDeclAt) + 1);

/** One container that keeps the raw markup of every row the real function appends. */
function makeContainer() {
  let rows = [];
  return {
    querySelectorAll: () => [],
    set innerHTML(_v) {
      rows = [];
    },
    get innerHTML() {
      return '';
    },
    appendChild(row) {
      rows.push(row.innerHTML);
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
  'mascotEmoji',
  `${defaultNameBody}\n${escapeHtmlBody}\n${renderBody}\nrenderSetupPlayerInputs();`,
);

/** Drives the real function once and returns the raw markup of each rendered row, in seat order. */
function render(count) {
  const container = makeContainer();
  const document_ = { createElement: () => ({ className: '', innerHTML: '' }) };
  const DOM = {
    displayPlayerCount: { textContent: '' },
    labelPlayerCount: { textContent: '' },
    playerNamesContainer: container,
  };
  runRender(document_, DOM, count, mascotNames, mascotEmoji);
  return container.rows;
}

/** The text between the .player-tag span's own tags -- the badge a player actually reads. */
function badgeText(rowHtml) {
  const m = /<span class="player-tag"[^>]*>([\s\S]*?)<\/span>/.exec(rowHtml);
  assert.ok(m, `no .player-tag badge in the rendered row: ${rowHtml}`);
  return m[1].trim();
}

test('gh#140: every setup row badge is that seat mascot emoji', () => {
  const rows = render(4);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map(badgeText),
    MASCOTS.slice(0, 4).map((m) => m.emoji),
  );
});

test('gh#140: no setup row badge is a seat number', () => {
  render(6).forEach((row, i) => {
    assert.doesNotMatch(badgeText(row), /\d/, `seat ${i} badge still renders a number: ${badgeText(row)}`);
    // The `#` the old marker carried goes with it -- a bare `#` beside an animal reads as leftovers.
    assert.doesNotMatch(badgeText(row), /#/, `seat ${i} badge still carries the seat marker`);
  });
});

test('gh#140: the badge is aria-hidden, because the placeholder already names that animal', () => {
  for (const row of render(3)) {
    assert.match(row, /<span class="player-tag" aria-hidden="true">/);
  }
  // The pairing itself: seat 0's badge is the cat icon and its placeholder is the cat's name.
  assert.match(render(3)[0], new RegExp(`placeholder="${mascotNames(1)[0]}"`));
});

// Calibration, in the shape that can actually fail: the digits a broken badge would render are NOT
// what the cast holds, so the harness above can tell the two apart. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a badge test passes on a
// badge that was never fixed.
test('RED CALIBRATION: a seat number is not a value the cast can produce', () => {
  const digits = Array.from({ length: 6 }, (_, i) => `#${i + 1}`);
  const icons = Array.from({ length: 6 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, digits);
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
