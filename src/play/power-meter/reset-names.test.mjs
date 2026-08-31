// gh#175, the invariant a reader of the diff cannot check by eye: after the confirm is accepted,
// every seat keeps its id/avatar/color, the roster holds the animal cast again, it holds exactly as
// many seats as before, and every name a player typed is gone. Mirrors
// src/play/short-stick/reset-names.test.mjs (gh#174), the pattern this route copies.
//
// It runs the REAL bytes. power-meter/main.js is a plain module script with no exports at all --
// unlike short-stick's lifted IIFE, there isn't even a wrapper to strip -- so resetPlayerNames is
// sliced out by source text and evaluated over a `game` object this file supplies, the same
// brace-matching technique fairness.test.mjs and short-stick's reset-names.test.mjs already use. A
// rename or a rewrite of resetPlayerNames fails this file loudly instead of silently testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and resetPlayerNames touches neither DOM nor storage --
// what that costs is stated: this proves the WIPE, never that the button is wired to it. The wiring
// (trigger -> openModal -> confirm button -> resetPlayerNames -> renderUI) is pinned by
// arm-reveal-paths.test.mjs, and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here — a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { mascotNames, resetCastNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `function <name>() { ... }` out of main.js by matching braces from its first `{`. */
function sliceFn(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `no body found for ${name}`);
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

// Applied, not returned: resetPlayerNames closes over main.js's `game` and over the shared cast's
// resetCastNames, so the wrapper supplies both and CALLS it.
const body = sliceFn('resetPlayerNames');
const applyReset = new Function('game', 'resetCastNames', `${body}; resetPlayerNames(); return game;`);

const seat = (id, name) => ({ id, name, avatar: '🦊', color: '#000' });

test('reset restores the animal cast, keeps the count and seat identity, and loses every typed name', () => {
  // The screen a player is looking at when they press reset: four seats, two renamed by hand, one
  // renamed to a string that is not in the cast at all.
  const game = {
    players: [
      seat('player_1', 'พี่โต้ง'),
      seat('player_2', 'ชิบะ'),
      seat('player_3', 'น้องหมวย'),
      seat('player_4', 'ฟร็อกกี้'),
    ],
  };
  applyReset(game, resetCastNames);

  assert.equal(game.players.length, 4, 'the party changed size — reset must keep the count');
  assert.deepEqual(game.players.map((p) => p.name), mascotNames(4));
  assert.deepEqual(
    game.players.map((p) => p.id),
    ['player_1', 'player_2', 'player_3', 'player_4'],
    'reset must not touch seat identity (id/avatar/color)',
  );
  assert.ok(!game.players.some((p) => p.name === 'พี่โต้ง'), 'a typed name survived the reset');
  assert.ok(!game.players.some((p) => p.name === 'น้องหมวย'), 'a typed name survived the reset');
});

test('reset keeps the count at both ends of the 2-10 range', () => {
  for (const n of [2, 10]) {
    const game = { players: Array.from({ length: n }, (_, i) => seat(`player_${i + 1}`, `typed ${i}`)) };
    applyReset(game, resetCastNames);
    assert.equal(game.players.length, n);
    assert.deepEqual(game.players.map((p) => p.name), mascotNames(n));
  }
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetPlayerNames that did nothing at all leaves this red. Asserted here rather than left implicit,
// because a fixture that already satisfies the expectation is how a reset test passes on a no-op.
test('RED CALIBRATION: the fixture starts off-cast, so a no-op reset would fail', () => {
  const before = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  assert.notDeepEqual(before, mascotNames(4));
});

// main.js must have no numbered default left on any path a player can see. The visible-name paths
// are the seat built when count is chosen, the placeholder, and the blank-name backfill at match
// start; all three now route through the shared cast. Pinned by absence, which is fragile on its
// own, so the positive half is pinned too: the cast import has to still be there.
test('no numbered default remains in main.js', () => {
  const numbered = source
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(source, /import \{[^}]*mascotNames[^}]*\} from '\.\.\/_mascots\.ts'/);
});
