// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge element's own text must equal the glyph
// the shared cast holds for that seat. Nothing here scans for digits, deliberately -- the very same
// row carries a legitimate numbered string, the name field's positional aria-label, and main.js
// argues in place why that one stays numbered. A digit-scanning check would red on it. Equality with
// the cast is immune to the whole class.
//
// It runs the REAL bytes on the REAL seats: the badge value on this route comes from model state, not
// from a call inside the row builder, so the test drives the route's own model
// (CursedNumberGameModel, seeded with the shared cast exactly as main.js seeds it) and then executes
// renderMascotsList sliced out of main.js. Neither half is re-implemented here, so a change to either
// the seat construction or the row markup fails this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { CursedNumberGameModel } from '../../games/cursed-number.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

function slice(header) {
  const found = sliceBlock(source, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

// The class method is turned into a plain function declaration by prefixing `function`, so its `this`
// can be bound to a stand-in controller carrying only the model. The body is untouched.
const renderFactory = new Function(
  'document', 'escapeHtml',
  `return function ${slice('renderMascotsList()')}`,
);

/** Seeds the route's own model with `count` seats and runs the real row builder over it. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const container = el('mascotsListContainer');
  const game = new CursedNumberGameModel(MASCOTS);
  game.setPlayerCount(count);
  renderFactory(document, (s) => String(s)).call({ game });
  return container.children.map((row) => row.innerHTML);
}

/** The text of the .mascot-avatar-badge element -- the badge a player actually reads. */
function badgeText(rowHtml) {
  const m = /<div class="mascot-avatar-badge">([\s\S]*?)<\/div>/.exec(rowHtml);
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

test('gh#209: the row keeps its POSITIONAL numbered label, which this check must never flag', () => {
  render(3).forEach((row, i) => {
    const m = /aria-label="([^"]*)"/.exec(row);
    assert.ok(m, 'the row no longer labels its name field');
    assert.match(m[1], new RegExp(`${i + 1}$`));
  });
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
