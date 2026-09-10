// gh#209: this route's setup roster row opens with the seat's ANIMAL, not a seat number.
//
// The assertion is POSITIVE and it is an equality: the badge node's own text must equal the glyph the
// shared cast holds for that seat. Nothing here scans for digits, and that is deliberate — this very
// row carries a legitimate numbered string one line below the badge (the name field's positional
// aria-label), the seat-count pills above the list are bare numbers, and the tooth caption beside
// them is a number too. A digit-scanning check would red on all three. Equality with the cast is
// immune to the whole class.
//
// It runs the REAL bytes: renderMascotInputs is sliced out of main.js and executed over the shared
// DOM stub, and the seats it renders come from the engine's own GameState rather than from a fixture
// this file wrote. So the badge read back is the one the route builds, for the seats the route
// builds. A rename of either fails this file loudly rather than testing nothing.
//
// WHAT ELSE THIS PINS, because it is not obvious from the name: the engine keeps its OWN cast array
// (main.js is a lifted mockup and scripts/extract-mockup.mjs owns it, so it cannot import
// _mascots.ts), and the equality below is against the SHARED cast. A drift between the two therefore
// reds here — the same guarantee src/play/mascot-defaults.test.mjs gives freeze-tap's inline copy.
//
// THIS IS ALSO THIS ROUTE'S SEAT-RANGE PROOF. The range is 2-6 and it is this game's own, not the
// category's (ADR-0065): every seat count in it renders, and both ends clamp. MIN_PLAYERS and
// MAX_PLAYERS are imported rather than retyped, so a range that moves reds instead of agreeing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/croc-bite.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

const HEADER = 'renderMascotInputs()';
const sliced = sliceBlock(source, HEADER);
assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);
// A bare class method, so `function` is prefixed to make it a declaration `new Function` can compile.
// The body itself is untouched.
const builder = `function ${sliced}`;

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `main.js no longer contains ${from} — this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.js no longer contains ${to} after ${from}`);
  return source.slice(start, end);
}

// Marker to marker, not symbol by symbol: the rules section is a run of `const` arrays, and a
// brace-matching slicer walks out of an array declaration into whatever follows it.
const RULES = region('const SAFE_ACTIONS = {', 'const PHASES = {');
const PHASE_CONSTS = region('const PHASES = {', 'class GameState ');
const STATE = sliceBlock(source, 'class GameState ');
assert.ok(STATE, 'main.js no longer declares class GameState — the seats this renders would be a fixture, not the route\'s');

/** The engine's own seat roster for `count` players, built by the shipped GameState. */
function seats(count) {
  const store = new Map();
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const factory = new Function(
    'localStorage', 'window', 'document',
    `${RULES}${PHASE_CONSTS}${STATE}\n;return GameState;`,
  );
  const GameState = factory(
    { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    {},
    {},
  );
  const state = new GameState();
  state.setPlayerCount(count);
  return state;
}

/** Drives the real builder for `count` seats and returns the row nodes it appended, in seat order. */
function render(count) {
  const { document, el } = makeDocumentStub();
  const list = el('setup-mascots-list');
  const state = seats(count);
  // eslint-disable-next-line no-new-func -- same reason: the shipped builder, not a re-write of it.
  const run = new Function('document', `${builder}\n;return renderMascotInputs;`)(document);
  run.call({ elSetupMascots: list, state });
  return { rows: list.children, state };
}

/** The badge inside one row: the single child carrying the avatar class the stylesheet paints. */
function badge(row) {
  const found = row.children.find((c) => c.className === 'mascot-avatar');
  assert.ok(found, `no avatar badge in the rendered row: ${JSON.stringify(row.children.map((c) => c.className))}`);
  return found;
}

const nameField = (row) => row.children.find((c) => c.className === 'mascot-name-input');

test('gh#209: every setup row badge equals that seat mascot glyph', () => {
  const { rows } = render(MAX_PLAYERS);
  assert.equal(rows.length, MAX_PLAYERS);
  assert.deepEqual(
    rows.map((row) => badge(row).textContent),
    Array.from({ length: MAX_PLAYERS }, (_, i) => mascotEmoji(i)),
    'a setup row opened with a glyph the shared cast does not hold for that seat',
  );
});

test('the engine\'s own cast has not drifted from the shared one over the seats it uses', () => {
  // The reason the equality above can be trusted as a CAST check and not just a self-check: main.js
  // cannot import _mascots.ts, so the two lists are independent copies and this is what pins them.
  const { state } = render(MAX_PLAYERS);
  assert.deepEqual(
    state.players.map((p) => p.emoji),
    MASCOTS.slice(0, MAX_PLAYERS).map((m) => m.emoji),
  );
  assert.deepEqual(
    state.players.map((p) => p.name),
    MASCOTS.slice(0, MAX_PLAYERS).map((m) => m.name),
  );
});

test('ADR-0065: every seat count in this game\'s own 2-6 range renders its own seats', () => {
  for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
    const { rows } = render(count);
    assert.equal(rows.length, count, `${count} seats rendered ${rows.length} rows`);
    assert.deepEqual(
      rows.map((row) => badge(row).textContent),
      Array.from({ length: count }, (_, i) => mascotEmoji(i)),
      `a badge is wrong at ${count} seats`,
    );
  }
});

test('ADR-0065: the range clamps at both ends, so no seat outside it can be rendered', () => {
  assert.equal(MIN_PLAYERS, 2);
  assert.equal(MAX_PLAYERS, 6);
  assert.equal(render(MAX_PLAYERS + 4).rows.length, MAX_PLAYERS, 'a party above the range rendered rows');
  assert.equal(render(MIN_PLAYERS - 1).rows.length, MIN_PLAYERS, 'a party below the range rendered fewer rows than the floor');
});

test('gh#209: the row keeps its POSITIONAL numbered label, which this check must never flag', () => {
  const { rows } = render(4);
  rows.forEach((row, i) => {
    const input = nameField(row);
    assert.ok(input, 'the row no longer builds a name field');
    assert.match(input.getAttribute('aria-label'), new RegExp(`${i + 1}$`));
  });
});

// The length cap is an ATTRIBUTE, not a trim on read: a paste is clamped the same as typing, and the
// roster bridge reads that attribute back rather than carrying a cap of its own.
test('the name field caps its own length', () => {
  for (const row of render(3).rows) assert.equal(nameField(row).maxLength, 16);
});

// The field opens EMPTY with the mascot as its placeholder, never with the mascot typed into it: a
// prefilled value is a name the player has to clear before typing their own, and it would also make
// the reset control's wipe indistinguishable from a no-op.
test('the field opens empty, with the seat mascot as its placeholder', () => {
  const { rows } = render(MAX_PLAYERS);
  rows.forEach((row, i) => {
    const input = nameField(row);
    assert.equal(input.value, '');
    assert.equal(input.placeholder, MASCOTS[i].name);
  });
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality above can tell a digit badge from a glyph badge. Asserted rather than assumed — a fixture
// that already satisfies its own expectation is how a badge test passes on a badge never fixed.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: MAX_PLAYERS }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: MAX_PLAYERS }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  // And the seats in range hold DISTINCT glyphs, which is what makes a wrapped or truncated cast
  // visible at all: a cast whose entries repeated would satisfy the equality after any wrap.
  assert.equal(new Set(icons).size, MAX_PLAYERS, 'two seats in range share a glyph — a wrapped cast would pass unnoticed');
});
