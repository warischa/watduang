// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge element's own text must equal the glyph
// this route's cast holds for that seat. Nothing here scans for digits, deliberately -- the same
// screen writes the party size as a bare number and a row of "2 คน", "3 คน" preset pills, all
// legitimate, all of which a digit-scanning check would red on. Equality with the cast is immune.
//
// WHICH cast, and why this route is the odd one. main.js declares MASCOT_PLAYERS inline instead of
// importing the shared module: the file is a verbatim mockup lift whose thai-comments exemption is
// keyed to its basename, so giving it an import would weaken the claim that it is unmodified. That
// inline copy is pinned row for row against the shared cast by ../mascot-defaults.test.mjs, which is
// the instrument for the two agreeing. This file therefore asserts the badge against the ROUTE's own
// copy, sliced out of main.js, and leaves the drift question where it already lives -- asserting
// against the shared module here would make one regression red two files and neither of them clearly.
//
// It runs the REAL bytes on the REAL seats: setPlayerCount is where a seat is handed its emoji, and
// renderSetupScreen writes the row, so both are sliced and driven in sequence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

function slice(header) {
  const found = sliceBlock(source, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** The route's own inline cast, by matching brackets from its declaration. */
function sliceCast() {
  const at = source.indexOf('const MASCOT_PLAYERS = [');
  assert.notEqual(at, -1, 'main.js no longer declares MASCOT_PLAYERS — this test is measuring nothing');
  const open = source.indexOf('[', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced brackets while slicing MASCOT_PLAYERS');
}

const factory = new Function(
  'document', 'mainContent', 'engine', 'escapeHtml',
  `const MASCOT_PLAYERS = ${sliceCast()};
   return {
     cast: MASCOT_PLAYERS,
     setPlayerCount: function ${slice('setPlayerCount(count)')},
     renderSetupScreen: ${slice('function renderSetupScreen()')},
   }`,
);

/** Seats `count` players the way the route seats them, renders setup, returns the roster markup. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const mainContent = el('main-content');
  const engine = { players: [], playerCount: count, savePlayers() {} };
  const parts = factory(document, mainContent, engine, (s) => String(s));
  parts.setPlayerCount.call(engine, count);
  parts.renderSetupScreen();
  return { html: mainContent.innerHTML, cast: parts.cast };
}

/** Every roster row's badge text, in seat order -- the badges a player actually reads. */
function badges(html) {
  const rows = [...html.matchAll(/<div class="roster-item"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  assert.ok(rows.length > 0, `no roster rows in the rendered screen: ${html.slice(0, 400)}`);
  return rows.map((row) => {
    const m = /<span[^>]*>([\s\S]*?)<\/span>/.exec(row);
    assert.ok(m, `no seat badge in the rendered row: ${row}`);
    return m[1].trim();
  });
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  const { html, cast } = render(4);
  assert.deepEqual(badges(html), cast.slice(0, 4).map((m) => m.emoji));
});

test('gh#209: the mapping holds across the product range, seat by seat', () => {
  for (const seats of [2, 6, 10]) {
    const { html, cast } = render(seats);
    const got = badges(html);
    assert.equal(got.length, seats);
    assert.deepEqual(got, Array.from({ length: seats }, (_, i) => cast[i % cast.length].emoji));
  }
});

// Calibration, in the shape that can fail: a seat number is not a value this cast can produce, so
// the equality above can tell a digit badge from a glyph badge. Run against the SLICED cast, so a
// cast gutted to numbers reds here rather than passing quietly.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const { cast } = render(2);
  const icons = cast.map((m) => m.emoji);
  assert.ok(icons.length >= 10, `the route's cast has shrunk to ${icons.length} seats`);
  assert.notDeepEqual(icons.slice(0, 10), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
