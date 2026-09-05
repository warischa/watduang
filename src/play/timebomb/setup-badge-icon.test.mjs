// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge node's own text must equal the glyph the
// shared cast holds for that seat. Nothing here scans for digits, and that is deliberate -- this very
// row carries a legitimate numbered string one line below the badge, the name field's positional
// aria-label, and the count display above the list is a bare number too. A digit-scanning check would
// red on both. Equality with the cast is immune to the whole class.
//
// It runs the REAL bytes: renderRows is sliced out of main.ts and executed over the shared DOM stub,
// so the badge read back is the one the route builds. A rename of that function fails this file
// loudly rather than testing nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

const HEADER = 'function renderRows(): void';
const sliced = sliceBlock(source, HEADER);
assert.ok(sliced, `main.ts no longer declares ${HEADER} — this test is measuring nothing`);
// The one TypeScript token in the slice, dropped so `new Function` can compile it. The body itself
// is untouched.
const body = sliced.replace(HEADER, 'function renderRows()');

const runRender = new Function(
  'document', 'listEl', 'countEl', 'decEl', 'incEl', 'count',
  'MIN_PLAYERS', 'MAX_PLAYERS', 'MASCOTS', 'names', 'NAME_MAX', 'save',
  `${body}\nrenderRows();`,
);

/** Drives the real builder for `count` seats and returns the row nodes it appended, in seat order. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const listEl = el('tb-players');
  runRender(
    document, listEl, el('tb-count-num'), el('tb-count-dec'), el('tb-count-inc'), count,
    2, MASCOTS.length, MASCOTS, MASCOTS.map((m) => m.name), 12, () => {},
  );
  return listEl.children;
}

/** The badge inside one row: the single child carrying the emoji class the stylesheet paints. */
function badge(row) {
  const found = row.children.find((c) => c.className === 'tb-player-emoji');
  assert.ok(found, `no seat badge in the rendered row: ${JSON.stringify(row.children.map((c) => c.className))}`);
  return found;
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  const rows = render(5);
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((row) => badge(row).textContent),
    MASCOTS.slice(0, 5).map((m) => m.emoji),
  );
});

test('gh#209: the badge is aria-hidden — the name field already carries the seat identity', () => {
  for (const row of render(3)) assert.equal(badge(row).getAttribute('aria-hidden'), 'true');
});

test('gh#209: the row keeps its POSITIONAL numbered label, which this check must never flag', () => {
  const rows = render(4);
  rows.forEach((row, i) => {
    const input = row.children.find((c) => c.className === 'tb-player-name');
    assert.ok(input, 'the row no longer builds a name field');
    assert.match(input.getAttribute('aria-label'), new RegExp(`${i + 1}$`));
  });
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge. Asserted rather than assumed -- a fixture
// that already satisfies its own expectation is how a badge test passes on a badge never fixed.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
