// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge control's own text must equal the glyph
// the shared cast holds for that seat. Nothing here scans for digits, deliberately -- the same
// builder writes a player-count badge reading like "4 / 10 คน", a legitimate number a digit-scanning
// check would red on. Equality with the cast is immune to it.
//
// It runs the REAL bytes on the REAL seats. The badge value on this route comes from state, not from
// a call inside the row builder, so four pieces of main.js are sliced and driven together: the route's
// own AVATAR_LIST declaration, the two opening seats' array literal out of the engine's initial state,
// addNewPlayer for every seat past them, and renderPlayerRoster for the markup. The cast is sliced
// rather than re-derived here on purpose -- a test that builds the list itself never exercises the
// route's declaration, and reverting that declaration to seat numbers would leave this file green.
//
// A seat's avatar is deliberately PLAYER-EDITABLE on this route (the badge is a button that opens an
// avatar picker). What is pinned here is the DEFAULT a seat opens with, which is the thing gh#140
// was about; a player's own later pick is their choice and no check owns it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

function slice(header) {
  const found = sliceBlock(source, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** The `players: [...]` array literal out of the engine's initial state, by matching brackets. */
function sliceOpeningSeats() {
  const at = source.indexOf('players: [');
  assert.notEqual(at, -1, 'main.js no longer seeds an opening roster — this test is measuring nothing');
  const open = source.indexOf('[', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced brackets while slicing the opening roster');
}

/** A one-statement declaration, taken to its semicolon -- the route's own cast derivation. */
function sliceStatement(decl) {
  const at = source.indexOf(decl);
  assert.notEqual(at, -1, `main.js no longer declares ${decl.trim()} — this test is measuring nothing`);
  return source.slice(at, source.indexOf(';', at) + 1);
}

const factory = new Function(
  'document', 'MASCOTS', 'defaultPlayerName', 'escapeHtml', 'armAllButtons',
  `${sliceStatement('const AVATAR_LIST = ')}
   return {
     openingSeats: () => (${sliceOpeningSeats()}),
     addNewPlayer: function ${slice('addNewPlayer()')},
     renderPlayerRoster: function ${slice('renderPlayerRoster()')},
   }`,
);

/** Grows the route's own roster to `count` seats through its own addNewPlayer, renders the rows. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const container = el('player-roster-container');
  const parts = factory(document, MASCOTS, (i) => MASCOTS[i].name, (s) => String(s), () => {});
  const engine = {
    state: { players: parts.openingSeats(), penaltyMode: 'preset' },
    synth: { playClick() {} },
    showToast() {},
    saveStorage() {},
    openModal() {},
    removePlayer() {},
    addNewPlayer: parts.addNewPlayer,
    renderPlayerRoster: parts.renderPlayerRoster,
  };
  while (engine.state.players.length < count) engine.addNewPlayer();
  engine.renderPlayerRoster();
  return { rows: container.children.map((row) => row.innerHTML), countBadge: el('setup-player-count-badge').textContent };
}

/** The text of the .avatar-btn control -- the badge a player actually reads. */
function badgeText(rowHtml) {
  const m = /<button class="avatar-btn"[^>]*>([\s\S]*?)<\/button>/.exec(rowHtml);
  assert.ok(m, `no seat badge in the rendered row: ${rowHtml}`);
  return m[1].trim();
}

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  const { rows } = render(4);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(badgeText), MASCOTS.slice(0, 4).map((m) => m.emoji));
});

test('gh#209: the mapping holds across the product range, seat by seat', () => {
  for (const seats of [2, 6, 10]) {
    const { rows } = render(seats);
    assert.equal(rows.length, seats);
    assert.deepEqual(rows.map(badgeText), Array.from({ length: seats }, (_, i) => mascotEmoji(i)));
  }
});

test('gh#209: the count badge keeps its legitimate numbers, which this check must never flag', () => {
  assert.match(render(4).countBadge, /\b4\b/);
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
