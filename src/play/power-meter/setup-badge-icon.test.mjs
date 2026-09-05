// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge element's own text must equal the glyph
// the shared cast holds for that seat. Nothing here scans for digits, deliberately -- the very same
// row carries a legitimate numbered string, the name field's positional aria-label. A digit-scanning
// check would red on it. Equality with the cast is immune to the whole class.
//
// It runs the REAL bytes on the REAL seats. The badge value on this route comes from state, not from
// a call inside the row builder, so two slices of main.js are driven in sequence: goToSetupNames,
// which is where a seat is handed its avatar, and renderSetupNamesView, which writes the row. The
// cast that feeds them is the route's own PLAYER_AVATARS, sliced rather than re-listed here.
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

/** A one-statement declaration, taken to its semicolon -- the route's own cast derivations. */
function sliceStatement(decl) {
  const at = source.indexOf(decl);
  assert.notEqual(at, -1, `main.js no longer declares ${decl.trim()} — this test is measuring nothing`);
  return source.slice(at, source.indexOf(';', at) + 1);
}

const factory = new Function(
  'document', 'MASCOTS', 'viewRoot', 'game', 'GameState', 'renderUI', 'announceSR', 'escapeHtml', 'defaultName', 'soundSynth',
  `${sliceStatement('const PLAYER_AVATARS = ')}
   const PLAYER_COLORS = ['#000'];
   return {
     goToSetupNames: ${slice('function goToSetupNames()')},
     renderSetupNamesView: ${slice('function renderSetupNamesView()')},
   }`,
);

/** Builds `count` seats the way the route builds them, renders the names view, returns row markup. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const viewRoot = el('view-root');
  const game = { players: [], playerCount: count, state: null };
  const parts = factory(
    document, MASCOTS, viewRoot, game, { SETUP_NAMES: 'SETUP_NAMES' },
    () => {}, () => {}, (s) => String(s), (i) => mascotNames(i + 1)[i], { playClick() {} },
  );
  parts.goToSetupNames();
  parts.renderSetupNamesView();
  return viewRoot.innerHTML;
}

/** Every .avatar-badge text in the rendered view, in seat order -- the badges a player reads. */
function badges(html) {
  const found = [...html.matchAll(/<div class="avatar-badge"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1].trim());
  assert.ok(found.length > 0, `no seat badges in the rendered view: ${html.slice(0, 400)}`);
  return found;
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  assert.deepEqual(badges(render(4)), MASCOTS.slice(0, 4).map((m) => m.emoji));
});

test('gh#209: the mapping holds across the product range, seat by seat', () => {
  for (const seats of [2, 6, 10]) {
    assert.deepEqual(badges(render(seats)), Array.from({ length: seats }, (_, i) => mascotEmoji(i)));
  }
});

test('gh#209: the row keeps its POSITIONAL numbered label, which this check must never flag', () => {
  const labels = [...render(3).matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(labels.length, 3);
  labels.forEach((label, i) => assert.match(label, new RegExp(`${i + 1}$`)));
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
