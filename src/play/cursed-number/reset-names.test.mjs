// gh#177, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, every
// seat shows its animal name again, the party is exactly as big as it was, and every name a player
// typed is gone.
//
// It runs the REAL bytes on the REAL model. main.js is a lifted IIFE with no exports, so
// resetPlayerNames is sliced out by source text and applied to a CursedNumberGameModel seeded with the
// shared cast -- the same object main.js builds in its constructor. A rename or a rewrite of
// resetPlayerNames fails this file loudly instead of quietly testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly -- resetPlayerNames owns the
// state move while its handler owns renderMascotsList and the re-arm. What that costs is stated: this
// proves the WIPE, never that the button is wired to it. The wiring (trigger -> modal -> confirm ->
// resetPlayerNames, then the re-arm) is pinned by ./arm-reveal-paths.test.mjs, and neither file
// substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// Imported, not re-listed: a stand-in cast would test this file's idea of the reset instead of the one
// that ships. These are the two collaborators main.js itself puts together.
import { CursedNumberGameModel } from '../../games/cursed-number.ts';
import { MASCOTS } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices the `resetPlayerNames() { ... }` class method out of main.js by matching braces. */
function sliceMethod(name) {
  const start = source.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `main.js no longer declares ${name}() — this test is measuring nothing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while slicing ${name}`);
}

// Applied, not returned. The method reads `this.game`, so it is dropped into a bare object literal
// carrying one and CALLED -- no controller, no DOM, no sound.
const method = sliceMethod('resetPlayerNames');
const applyReset = new Function('game', `const host = { game, ${method} }; host.resetPlayerNames(); return host.game;`);

/** The screen a player is looking at when they press reset: `count` seats, all renamed by hand. */
function typedParty(count) {
  const game = new CursedNumberGameModel(MASCOTS);
  game.setPlayerCount(count);
  game.players.forEach((_, i) => game.updatePlayerName(i, `พี่โต้ง ${i}`));
  return game;
}

const animalNames = (count) => MASCOTS.slice(0, count).map((m) => m.name);

test('reset restores the animal cast, keeps the count, and loses every typed name', () => {
  const game = typedParty(4);
  const before = game.players.map((p) => p.name);
  applyReset(game);

  assert.equal(game.players.length, 4, 'the party changed size — reset must keep the count');
  assert.equal(game.playerCount, 4, 'playerCount drifted from the roster it counts');
  assert.deepEqual(game.players.map((p) => p.name), animalNames(4));
  // The typed string is gone from the only place it was kept, so nothing can put it back.
  assert.deepEqual(game.players.map((p) => p.rawName), ['', '', '', '']);
  for (const typed of before) {
    assert.ok(!game.players.some((p) => p.name === typed || p.rawName === typed), `a typed name survived: ${typed}`);
  }
});

test('reset keeps the count at both ends of the range this setup offers', () => {
  for (const n of [2, 20]) {
    const game = typedParty(n);
    applyReset(game);
    assert.equal(game.players.length, n);
    assert.deepEqual(game.players.map((p) => p.name), animalNames(n));
  }
});

// The seat is back to UNTOUCHED, not merely back to the same string. That distinction is the reason
// resetPlayerNames writes '' instead of pushing cast strings in: a later count change must not treat a
// restored animal name as a name the player asked to keep.
test('a reset seat is untouched, so a later count change re-seats it from the cast', () => {
  const game = typedParty(3);
  applyReset(game);
  game.setPlayerCount(2);
  game.setPlayerCount(3);
  assert.deepEqual(game.players.map((p) => p.rawName), ['', '', '']);
  assert.deepEqual(game.players.map((p) => p.name), animalNames(3));
});

// Calibration, in the shape that can actually fail: the fixture starts OFF-cast, so a resetPlayerNames
// that did nothing at all leaves the assertions above red. Asserted rather than left implicit, because
// a fixture that already satisfies the expectation is how a reset test passes on a no-op.
test('RED CALIBRATION: the fixture starts off-cast, so a no-op reset would fail', () => {
  const game = typedParty(4);
  assert.notDeepEqual(game.players.map((p) => p.name), animalNames(4));
  assert.notDeepEqual(game.players.map((p) => p.rawName), ['', '', '', '']);
});

// gh#177 box: "their visible cast is unchanged when nobody presses reset — this ticket must not alter
// what a player sees on open". Proved as a set claim rather than a spot check: resetPlayerNames(
// appears exactly twice in the whole file -- its own declaration and one call site, which the next
// test shows sits inside confirmResetNamesBtn's click handler. There being no third occurrence is what
// rules out a call on the route's own init/render path (or any other path a player reaches without
// pressing reset).
test('gh#177 box: resetPlayerNames has exactly one call site, and it is the confirm click', () => {
  const occurrences = source.split('resetPlayerNames(').length - 1;
  assert.equal(occurrences, 2, `resetPlayerNames( appears ${occurrences} time(s) — expected exactly 2 (the declaration and the one call inside the confirm handler)`);
});

// The wiring the pure slice above cannot see: the confirm calls the wipe and redraws the list. Without
// this box the count above would be satisfied by a call anywhere at all, including a load path.
test('the confirm handler calls the wipe and redraws', () => {
  const handler = source.match(/getElementById\('confirmResetNamesBtn'\)\.addEventListener\('click',[\s\S]*?\n {8}\}\);/);
  assert.ok(handler, 'the reset confirm handler is no longer recognisable — this test measures nothing');
  assert.match(handler[0], /this\.resetPlayerNames\(\)/);
  assert.match(handler[0], /this\.renderMascotsList\(\)/);
});

// gh#177 box: "renaming still persists as it does today, on all four". This route has no localStorage
// of its own (grep confirms it — the model IS the persistence layer for the session, same as short
// game state anywhere else in this file). updatePlayerName is the input handler's own write path;
// setPlayerCount is what a player can trigger next without touching reset, and it must not be what
// silently discards a typed name.
test('gh#177 box: a typed name persists across a player-count change, same as today', () => {
  const game = new CursedNumberGameModel(MASCOTS);
  game.setPlayerCount(4);
  game.updatePlayerName(1, 'พี่โต้ง');
  assert.equal(game.players[1].name, 'พี่โต้ง');

  // No reset pressed -- only a count change, which every player can reach from the setup screen.
  game.setPlayerCount(6);
  game.setPlayerCount(4);
  assert.equal(game.players[1].name, 'พี่โต้ง', 'a typed name did not persist across a player-count change');
  assert.equal(game.players[1].rawName, 'พี่โต้ง', 'the typed value itself was lost, not just its display');
});
