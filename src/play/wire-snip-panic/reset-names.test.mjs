// gh#176, the invariant a reader of the diff cannot check by eye: after the reset confirm is accepted,
// every seat shows its animal name again, the party is exactly as big as it was, and every name a
// player typed is gone.
//
// Since gh#264 (ADR-0071) the mockup's add/remove list, this route's reset control, its modal and
// resetPlayerNames are gone; the reset lives in the shared player screen, mounted into #wspPlayers.
// This file runs that real screen over THIS route's markup.html and the real dialog markup, clicks
// through the confirm and reads the rows back. The confirm's gate is arm-reveal-paths.test.mjs's
// job; neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { resetCases } from '../_player-screen/screen-harness.mjs';
import game from '../../games/wire-snip-panic.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
// Whole-line comments dropped: main.js's header records what was removed, by name, and a checker
// cannot tell use from mention.
const MAIN = fs
  .readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'wspPlayers', range: game.players, mascots: MASCOTS, label: 'wire-snip-panic' });

// The route's own wipe must not come back beside the shared one: two resets over two name stores is
// the drift gh#176 was about.
test('wire-snip-panic: no route-local reset survives beside the shared one', () => {
  assert.doesNotMatch(MAIN, /resetPlayerNames|resetCastNames|modal-reset-names|btn-reset-names/);
  assert.doesNotMatch(MARKUP, /id="btn-reset-names"|id="modal-reset-names"/);
});

// Nor the list it reset: the mockup's add/remove rows and their builder are the player system the
// shared screen replaced. A hidden leftover is not a conversion. The storage KEY is allowed back since
// the owner ruling of 2026-10-15 (ADR-0071 § Data) -- for the penalty choice only; that it holds no
// player, read or written, is run for real in ./settings-persistence.test.mjs.
test('wire-snip-panic: the mockup player list is gone from the markup and the engine', () => {
  assert.doesNotMatch(MARKUP, /id="player-list-container"|id="btn-add-player"|id="input-new-player"/);
  assert.doesNotMatch(MAIN, /renderSetupPlayerList|player-list-container|btn-add-player|parsed\.players|players: game\.players/);
});
