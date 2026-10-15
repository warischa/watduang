// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #zt-players.
// The first half runs that real screen over THIS route's markup.html at THIS route's declared range
// and reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js and
// run against a stand-in engine: the seats the round is played with must wear the glyph of the
// mascot the player screen gave them -- with someone sitting out, a seat's index and its mascot
// differ, and that is exactly the case a positional default gets wrong. (The mockup's avatar picker,
// which let a player swap a seat's glyph, went with the rest of its setup: the identity is the
// shared screen's now, ADR-0054 ruling 1.)
//
// Equality with the cast throughout, never a digit scan: the name field beside the badge carries a
// legitimate numbered positional label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game from '../../games/zero-trigger.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'zt-players', range: game.players, mascots: MASCOTS, label: 'zero-trigger' });

const HEADER = 'startWithPlayers(players)';

/** Runs the real startWithPlayers against a stand-in engine and returns what it seated and where it
 *  went next. `skipOptions` is the quick-start flag the menu sets before opening the player screen. */
function seat(players, skipOptions = false) {
  const sliced = sliceBlock(MAIN, HEADER);
  assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);
  const run = new Function(`return function ${sliced};`)();
  const engine = {
    state: { players: [], penaltyMode: 'preset' },
    skipOptions,
    shown: null,
    matchStarted: false,
    switchScreen(name) { this.shown = name; },
    startNewMatch() { this.matchStarted = true; },
  };
  run.call(engine, players);
  return engine;
}

test('zero-trigger gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const engine = seat(players);
  assert.deepEqual(engine.state.players.map((p) => p.avatar), players.map((p) => p.emoji));
  assert.deepEqual(engine.state.players.map((p) => p.name), ['p0', 'p1', 'p2']);
  assert.deepEqual(engine.state.players.map((p) => p.score), [0, 0, 0], 'a new player list starts every score at zero');
  assert.equal(engine.shown, 'SETUP', 'the game\'s own options come next (ADR-0071 ruling 1)');
  assert.equal(engine.matchStarted, false);
});

test('zero-trigger: quick start goes from the player screen straight into the match, once', () => {
  const players = [0, 1].map((m) => ({ name: MASCOTS[m].name, emoji: MASCOTS[m].emoji, mascot: m }));
  const engine = seat(players, true);
  assert.equal(engine.matchStarted, true, 'the quick-start path skips the options screen');
  assert.equal(engine.shown, null);
  assert.equal(engine.skipOptions, false, 'the flag is spent, so the next start (an edit mid-match) shows the options again');
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional glyph would differ here', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(mascotEmoji(1), mascotEmoji(2), 'seat 2 and mascot 3 must be distinguishable');
});
