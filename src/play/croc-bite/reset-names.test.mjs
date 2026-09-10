// gh#175, the invariant a reader of the diff cannot check by eye: after the reset confirm is
// accepted, the seat names hold the animal cast again, the party keeps exactly as many seats as
// before, and every name a player typed is gone.
//
// It runs the REAL bytes on BOTH sides of the seam, which is what makes it more than a unit test of
// one function: `resetToCast` is sliced out of main.ts, and the state it writes into is the engine's
// own GameState, sliced out of main.js. So the wipe is applied through the same
// `updatePlayerName` the players' own typing goes through, and the names read back afterwards are
// the ones the next `renderMascotInputs` would paint.
//
// WHY THAT MATTERS ON THIS ROUTE specifically: the engine keeps every seat's typed text in its own
// state and rebuilds all the fields from THAT, so a reset written to the input elements would be
// undone by the next seat change. Writing through the engine is the fix, and asserting on the
// engine's state afterwards is the only place the fix is visible.
//
// ponytail: no DOM. The reset splits cleanly — resetToCast owns the state move, and the confirm
// handler owns closing the overlay and asking the engine to repaint. What that costs is stated: this
// proves the WIPE and, separately by source, that the confirm is wired to it and repaints. That the
// confirm's own buttons are inert for their arm window is arm-reveal-paths.test.mjs's job, and
// neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
// The real cast and the real wipe, imported rather than re-listed here — a stand-in would test this
// file's idea of the reset instead of the one that ships.
import { mascotNames, resetCastNames } from '../_mascots.ts';
import { sliceBlock } from '../_dom-stub.mjs';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const glue = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

// ---- the engine's own seat state ---------------------------------------------------------------

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(from, to) {
  const start = engineSource.indexOf(from);
  assert.notEqual(start, -1, `main.js no longer contains ${from} — this test is measuring nothing`);
  const end = engineSource.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.js no longer contains ${to} after ${from}`);
  return engineSource.slice(start, end);
}

const RULES = region('const SAFE_ACTIONS = {', 'const PHASES = {');
const PHASE_CONSTS = region('const PHASES = {', 'class GameState ');
const STATE = sliceBlock(engineSource, 'class GameState ');
assert.ok(STATE, 'main.js no longer declares class GameState — this test is measuring nothing');

function newState(count) {
  const store = new Map();
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const GameState = new Function(
    'localStorage', 'window', 'document',
    `${RULES}${PHASE_CONSTS}${STATE}\n;return GameState;`,
  )(
    { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    {},
    {},
  );
  const state = new GameState();
  state.setPlayerCount(count);
  return state;
}

// ---- the route's own reset ----------------------------------------------------------------------

const HEADER = 'function resetToCast(app: KhengApp): void';
const sliced = sliceBlock(glue, HEADER);
assert.ok(sliced, `main.ts no longer declares ${HEADER} — this test is measuring nothing`);
// The annotations come off through node's own stripper rather than a hand-written substitution list:
// a substitution that silently matched nothing is how a slice reaches `new Function` still carrying
// a type and fails as a SyntaxError somewhere unrelated. The body itself is untouched.
const resetSource = stripTypeScriptTypes(sliced, { mode: 'strip' });
assert.doesNotMatch(resetSource, /:\s*KhengApp\b/, 'the annotation survived the strip — this slice would not compile');

/** The shipped reset, applied to the engine's state. `resetCastNames` is the REAL module: an
 *  identity stub would green a reset that copied the typed names back, and a hand-rolled stub would
 *  drift from the cast the rest of the site paints. */
function runReset(state) {
  const repaints = [];
  // eslint-disable-next-line no-new-func -- same reason: the shipped function, not a re-write of it.
  const resetToCast = new Function('resetCastNames', `${resetSource}\n;return resetToCast;`)(resetCastNames);
  resetToCast({ state, ui: { renderMascotInputs: () => repaints.push(state.players.length) } });
  return repaints;
}

const TYPED = ['พี่โต้ง', 'น้องหมวย', 'Bank'];

/** Three seats renamed by hand, one of them to a string no cast holds. */
function withTypedNames(count) {
  const state = newState(count);
  TYPED.forEach((typed, i) => state.updatePlayerName(i, typed));
  return state;
}

test('reset restores the animal cast and loses every typed name', () => {
  const state = withTypedNames(MAX_PLAYERS);
  const cast = mascotNames(MAX_PLAYERS);
  assert.notDeepEqual(state.players.map((p) => p.name), cast, 'the seed is already on-cast — a no-op reset would pass');

  runReset(state);

  assert.deepEqual(state.players.map((p) => p.name), cast);
  for (const typed of TYPED) {
    assert.ok(
      !state.players.some((p) => p.name === typed || p.rawName === typed),
      `a typed name survived the reset: ${typed}`,
    );
  }
});

test('the wipe reaches the RAW name too, which is what the fields are rebuilt from', () => {
  // The half a name-only assertion would miss on this route: renderMascotInputs reads `rawName`, so
  // a reset that fixed `name` and left `rawName` alone would show every typed name again the moment
  // a player pressed a seat pill.
  const state = withTypedNames(5);
  runReset(state);
  assert.deepEqual(state.players.map((p) => p.rawName), mascotNames(5));
});

test('reset keeps the party the same size, at every seat count in range', () => {
  for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
    const state = withTypedNames(count);
    runReset(state);
    assert.equal(state.players.length, count, `a reset at ${count} seats left ${state.players.length}`);
    assert.equal(state.playerCount, count);
  }
});

test('the reset asks the engine to repaint, once, after the state has moved', () => {
  const state = withTypedNames(4);
  const repaints = runReset(state);
  // The recorded value is the seat count AT REPAINT TIME: a repaint asked for before the wipe would
  // redraw the typed names, and a repaint never asked for leaves the old fields on screen.
  assert.deepEqual(repaints, [4], 'the reset repainted the seat list a number of times other than once');
});

test('the reset never touches the seat count or the input elements directly', () => {
  // Pinned as an ABSENCE, and on this route that absence is the guarantee: the seat count lives in
  // the engine and is reached only through its pills, and the fields are rebuilt from state. A reset
  // that named either would be moving the party's size or writing values the next rebuild discards.
  assert.doesNotMatch(resetSource, /setPlayerCount|playerCount|count-pill/,
    'resetToCast now reaches for the player count — the confirm promises the party keeps its size');
  assert.doesNotMatch(resetSource, /document|querySelector|\.value\s*=/,
    'resetToCast now writes the input elements — the engine rebuilds every field from its own state, so that write is discarded');
  assert.match(resetSource, /updatePlayerName/, 'the wipe no longer goes through the engine\'s own name writer');
});

// ---- the wiring and the copy the pure slice cannot see -------------------------------------------

test('the confirm runs the reset and closes its own overlay; the cancel only closes', () => {
  const confirm = glue.match(/\$\('btn-reset-names-confirm'\)\?\.addEventListener\('click',[\s\S]*?\n\s*\}\);/);
  assert.ok(confirm, 'the reset confirm handler is no longer recognisable — this test measures nothing');
  assert.match(confirm[0], /\bresetToCast\(app\)/);
  assert.match(confirm[0], /classList\.remove\('open'\)/);

  const cancel = glue.match(/\$\('btn-reset-names-cancel'\)\?\.addEventListener\('click',[^\n]*\);/);
  assert.ok(cancel, 'the reset cancel handler is no longer recognisable — this test measures nothing');
  assert.match(cancel[0], /classList\.remove\('open'\)/);
  // gh#175's own smallest-fix trap: a cancel that also reset would make the confirm meaningless.
  assert.doesNotMatch(cancel[0], /resetToCast/, 'the cancel path now performs the reset it exists to decline');

  const trigger = glue.match(/\$\('btn-reset-names'\)\?\.addEventListener\('click',[^\n]*\);/);
  assert.ok(trigger, 'the setup trigger no longer opens the confirm — the control would be a dead button');
  assert.match(trigger[0], /classList\.add\('open'\)/);
});

test('the confirm copy still names the loss and what survives', () => {
  // Pinned as text because it is the only part of this feature a player reads, and a well-meaning
  // edit that drops the clause about what survives is invisible to every other check here. Both
  // strings are copied out of RESET_MODAL_HTML in this route's own main.ts.
  const dialog = glue.match(/const RESET_MODAL_HTML = `([\s\S]*?)`;/);
  assert.ok(dialog, 'RESET_MODAL_HTML no longer parses out of main.ts — this test measures nothing');
  assert.match(dialog[1], /ชื่อที่พิมพ์ไว้ทั้งหมดจะหายไป/, 'the confirm no longer says the typed names are lost');
  assert.match(dialog[1], /จำนวนผู้เล่นยังเท่าเดิม/, 'the confirm no longer says the party keeps its size');
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetToCast that did nothing at all leaves the first test red. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a reset test passes on a
// no-op — and separately, a typed name that HAPPENED to be a cast name would prove nothing.
test('RED CALIBRATION: the typed fixtures are off-cast, so a no-op reset would fail', () => {
  const cast = mascotNames(MAX_PLAYERS);
  for (const typed of TYPED) assert.ok(!cast.includes(typed), `the typed fixture ${typed} is a cast name`);
  const state = withTypedNames(MAX_PLAYERS);
  assert.notDeepEqual(state.players.map((p) => p.name), cast);
  assert.notDeepEqual(state.players.map((p) => p.rawName), cast);
});
