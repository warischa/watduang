// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #cnPlayers. The
// first half runs that real screen over THIS route's markup.html at THIS route's declared range and
// reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js and
// run against the real CursedNumberGameModel: the seats the round is played with must wear the
// glyph and the colour token of the mascot the player screen gave them -- with someone sitting out,
// a seat's index and its mascot differ, and that is exactly the case a positional default gets wrong.
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
import game, { CursedNumberGameModel, seatColorVar } from '../../games/cursed-number.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'cnPlayers', range: game.players, mascots: MASCOTS, label: 'cursed-number' });

const HEADER = 'startWithPlayers(players)';
const sliced = sliceBlock(MAIN, HEADER);
assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);

/** Runs the real startWithPlayers against a stand-in controller and returns the model it seated. */
function seat(players) {
  const badge = { textContent: '' };
  const document = { getElementById: () => badge };
  const window = {};
  const run = new Function('CursedNumberGameModel', 'seatColorVar', 'document', 'window', `return function ${sliced};`)(
    CursedNumberGameModel, seatColorVar, document, window,
  );
  const controller = { shown: null, showScreen(id) { this.shown = id; } };
  run.call(controller, players);
  return { model: controller.game, shown: controller.shown, badge, window };
}

test('cursed-number gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const { model, shown, badge, window } = seat(players);
  assert.deepEqual(model.players.map((p) => p.avatar), players.map((p) => p.emoji));
  assert.deepEqual(model.players.map((p) => p.name), ['p0', 'p1', 'p2']);
  assert.deepEqual(model.players.map((p) => p.color), ['var(--mascot-1)', 'var(--mascot-3)', 'var(--mascot-6)'],
    'the colour token follows the mascot, not the seat index');
  assert.equal(shown, 'screenSetup', 'the game\'s own options come next (ADR-0071 ruling 1)');
  assert.equal(badge.textContent, '3 คน');
  assert.equal(window.gameEngine, model, 'probes read the live model off window');
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional colour would differ here', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(seatColorVar(1), seatColorVar(2), 'seat 1 and mascot 2 must be distinguishable');
});
