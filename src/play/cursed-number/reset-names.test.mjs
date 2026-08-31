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
