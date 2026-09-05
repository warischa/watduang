// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge element's own text must equal the glyph
// the shared cast holds for that seat. Nothing here scans for digits, deliberately -- the same
// builder writes several legitimate numbers on the same screen (the stick count, the short count, and
// each row's own `data-index`), any of which a digit-scanning check would red on. Equality with the
// cast is immune to the whole class.
//
// It runs the REAL bytes: renderSetup is sliced out of main.js and executed over the shared DOM stub,
// and the badge is read out of the row markup that function itself writes. The route's own AVATARS
// derivation is sliced too rather than re-listed here, so the seat-to-glyph mapping under test is
// this route's and not the test's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji, mascotNames } from '../_mascots.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

const HEADER = 'const renderSetup = () =>';
const sliced = sliceBlock(source, HEADER);
assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);

/** A one-statement declaration, taken to its semicolon -- the route's own cast derivation. */
function sliceStatement(decl) {
  const at = source.indexOf(decl);
  assert.notEqual(at, -1, `main.js no longer declares ${decl.trim()} — this test is measuring nothing`);
  return source.slice(at, source.indexOf(';', at) + 1);
}

const runRender = new Function(
  'document', 'MASCOTS', '$', 'game', 'escapeHtml', 'defaultName', 'sounds', 'saveDraft', 'lockFairCounts', 'PENALTY_PRESETS',
  `${sliceStatement('const AVATARS = ')}\n${sliced};\nrenderSetup();`,
);

/** Drives the real builder for a party of `count` and returns the raw markup of each row. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const list = el('player-inputs-container');
  const game = {
    players: mascotNames(count),
    stickCount: count + 2,
    shortCount: 1,
    penaltyMode: 'preset',
    selectedPenalty: 'x',
  };
  runRender(
    document, MASCOTS, (id) => document.getElementById(id), game,
    (s) => String(s), (i) => mascotNames(i + 1)[i], { playClick() {} }, () => {}, () => {}, ['x'],
  );
  return list.children.map((row) => row.innerHTML);
}

/** The text of the .player-avatar-badge element -- the badge a player actually reads. */
function badgeText(rowHtml) {
  const m = /<div class="player-avatar-badge">([\s\S]*?)<\/div>/.exec(rowHtml);
  assert.ok(m, `no seat badge in the rendered row: ${rowHtml}`);
  return m[1].trim();
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  const rows = render(4);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(badgeText), MASCOTS.slice(0, 4).map((m) => m.emoji));
});

test('gh#209: the mapping holds across the product range, seat by seat', () => {
  for (const seats of [2, 6, 10]) {
    const rows = render(seats);
    assert.equal(rows.length, seats);
    assert.deepEqual(rows.map(badgeText), Array.from({ length: seats }, (_, i) => mascotEmoji(i)));
  }
});

test('gh#209: the row keeps its POSITIONAL index attribute, which this check must never flag', () => {
  render(3).forEach((row, i) => assert.match(row, new RegExp(`data-index="${i}"`)));
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
