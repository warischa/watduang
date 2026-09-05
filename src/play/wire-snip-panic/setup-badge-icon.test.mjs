// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge element's own text must equal the glyph
// the shared cast holds for that seat. Nothing here scans for digits, deliberately -- this same
// builder writes a player-count badge reading like "4 คน", a legitimate number a digit-scanning check
// would red on. Equality with the cast cannot be fooled by it.
//
// It runs the REAL bytes: renderSetupPlayerList is sliced out of main.js and executed over the shared
// DOM stub, and the badge is read out of the row markup that function itself writes. avatarFor is
// sliced too rather than re-implemented here, so the seat-to-glyph mapping under test is the route's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji, mascotNames } from '../_mascots.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

function slice(header) {
  const found = sliceBlock(source, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

const renderBody = slice('function renderSetupPlayerList()');
const escapeBody = slice('function escapeHtml(str)');
// The route's own seat-to-glyph arrow. One statement, so it is taken to its semicolon rather than by
// brace matching.
const avatarDecl = 'const avatarFor = ';
const avatarAt = source.indexOf(avatarDecl);
assert.notEqual(avatarAt, -1, 'main.js no longer declares avatarFor — this test is measuring nothing');
const avatarBody = source.slice(avatarAt, source.indexOf(';', avatarAt) + 1);

const runRender = new Function(
  'document', 'game', 'MASCOTS', 'armAllButtons', 'soundSynth', 'saveSettings',
  `${escapeBody}\n${avatarBody}\n${renderBody}\nrenderSetupPlayerList();`,
);

/** Drives the real builder for a party of `count` and returns the raw markup of each row. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const container = el('player-list-container');
  const game = { players: mascotNames(count), scores: new Array(count).fill(0) };
  runRender(document, game, MASCOTS, () => {}, { playClick() {} }, () => {});
  return { rows: container.children.map((row) => row.innerHTML), countBadge: el('player-count-badge').textContent };
}

/** The text of the .player-avatar element -- the badge a player actually reads. */
function badgeText(rowHtml) {
  const m = /<div class="player-avatar">([\s\S]*?)<\/div>/.exec(rowHtml);
  assert.ok(m, `no seat badge in the rendered row: ${rowHtml}`);
  return m[1].trim();
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  const { rows } = render(5);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(badgeText), MASCOTS.slice(0, 5).map((m) => m.emoji));
});

test('gh#209: the mapping holds across the whole product range, seat by seat', () => {
  for (const seats of [2, 6, 10]) {
    const { rows } = render(seats);
    assert.equal(rows.length, seats);
    assert.deepEqual(rows.map(badgeText), Array.from({ length: seats }, (_, i) => mascotEmoji(i)));
  }
});

test('gh#209: the count badge keeps its legitimate number, which this check must never flag', () => {
  assert.match(render(4).countBadge, /\b4\b/);
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
