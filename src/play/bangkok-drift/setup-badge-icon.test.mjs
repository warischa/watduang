// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge element's own text must equal the glyph
// the shared cast holds for that seat. Nothing here scans for digits, deliberately -- the very same
// row carries a legitimate numbered string, the name field's positional aria-label and its
// placeholder. A digit-scanning check would red on both. Equality with the cast is immune to the
// whole class.
//
// It runs the REAL bytes on the REAL seats: renderRoster is sliced out of the shipped main.js and
// executed, so a change to the row's construction fails this file rather than passing on a copy.
// The row builder appends real nodes (it does not write markup through innerHTML), so the badges are
// read off the children of the roster container the builder filled.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');
const body = sliceBlock(source, 'function renderRoster()');
assert.ok(body, 'main.js no longer declares renderRoster() — this test is measuring nothing');

/** Builds `count` seats the way the route builds them and returns the roster container's rows. */
function render(count) {
  const stub = makeDocumentStub();
  // The builder also writes the count display through a bare `document.querySelector`, which the stub
  // does not answer. One stand-in node keeps the builder on its own path instead of throwing, and it
  // is read back below so this shim can never quietly become the thing under test.
  const countDisplay = stub.document.createElement('span');
  const document = { ...stub.document, querySelector: () => countDisplay };
  const game = { count };
  const factory = new Function('document', '$', 'game', 'mascotEmoji', `return ${body};`);
  factory(document, stub.el, game, mascotEmoji)();
  return { rows: stub.el('roster').children, countDisplay };
}

/** Every badge text in the rendered roster, in seat order -- the glyphs a player reads. */
function badges(count) {
  const { rows } = render(count);
  assert.equal(rows.length, count, `renderRoster built ${rows.length} rows for ${count} seats`);
  return rows.map((row) => {
    const badge = row.children.find((child) => child.className === 'roster-badge');
    assert.ok(badge, 'a seat row carries no badge element at all');
    return badge.textContent;
  });
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  assert.deepEqual(badges(4), MASCOTS.slice(0, 4).map((m) => m.emoji));
});

test('gh#209: the mapping holds across the product range, seat by seat', () => {
  for (const seats of [2, 6, 10]) {
    assert.deepEqual(badges(seats), Array.from({ length: seats }, (_, i) => mascotEmoji(i)));
  }
});

test('gh#209: the row keeps its POSITIONAL numbered label, which this check must never flag', () => {
  const { rows, countDisplay } = render(3);
  const labels = rows.map((row) => {
    const input = row.children.find((child) => child.className === 'roster-input');
    assert.ok(input, 'a seat row carries no name field');
    return input.getAttribute('aria-label');
  });
  labels.forEach((label, i) => assert.match(label, new RegExp(`${i + 1}$`)));
  // The shim really was the count display, so the builder ran its whole body rather than bailing.
  assert.equal(countDisplay.textContent, 3);
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
