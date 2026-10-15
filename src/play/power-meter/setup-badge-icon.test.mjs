// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the match is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #pmPlayers. The
// first half runs that real screen over THIS route's markup.html at THIS route's declared range and
// reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js with
// the startNewMatch it hands on to and the route's own colour list, and run: the seats the match is
// played with must wear the glyph of the mascot the player screen gave them, and the colour that
// mascot always wore here -- with someone sitting out, a seat's index and its mascot differ, and that
// is exactly the case a positional default gets wrong.
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
import game from '../../games/power-meter.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'pmPlayers', range: game.players, mascots: MASCOTS, label: 'power-meter' });

function slice(header) {
  const found = sliceBlock(MAIN, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** A one-statement declaration, taken to its semicolon -- the route's own colour list. */
function sliceStatement(decl) {
  const at = MAIN.indexOf(decl);
  assert.notEqual(at, -1, `main.js no longer declares ${decl.trim()} — this test is measuring nothing`);
  return MAIN.slice(at, MAIN.indexOf(';', at) + 1);
}

const COLORS_DECL = sliceStatement('const PLAYER_COLORS = [');
const PLAYER_COLORS = new Function(`${COLORS_DECL} return PLAYER_COLORS;`)();

/** Runs the real startWithPlayers (and the startNewMatch it calls) over a stand-in match state. */
function seat(players) {
  const state = { players: [], state: 'PLAYERS' };
  const viewRoot = { hidden: true };
  let rendered = 0;
  const run = new Function(
    'game', 'viewRoot', 'soundSynth', 'GameState', 'renderUI',
    `${COLORS_DECL}\n${slice('function startWithPlayers(players)')}\n${slice('function startNewMatch()')}\nreturn startWithPlayers;`,
  )(state, viewRoot, { playClick() {} }, { TURN_INTRO: 'TURN_INTRO' }, () => { rendered += 1; });
  run(players);
  return { state, viewRoot, rendered };
}

test('power-meter gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and the fourth-to-fifth roster rows sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const { state, viewRoot, rendered } = seat(players);
  assert.deepEqual(state.players.map((p) => p.avatar), players.map((p) => p.emoji));
  assert.deepEqual(state.players.map((p) => p.name), ['p0', 'p1', 'p2']);
  assert.deepEqual(state.players.map((p) => p.color), [PLAYER_COLORS[0], PLAYER_COLORS[2], PLAYER_COLORS[5]],
    'the colour follows the mascot, not the seat index');
  assert.deepEqual(state.players.map((p) => p.id), ['player_1', 'player_2', 'player_3'], 'seat ids stay positional');
  assert.deepEqual(state.activePlayerIds, ['player_1', 'player_2', 'player_3'], 'every seat is in the turn order');
  assert.equal(state.state, 'TURN_INTRO', 'no options of its own: the match starts straight away (ADR-0071 ruling 1)');
  assert.equal(viewRoot.hidden, false, 'the view column the player screen hid is shown again');
  assert.equal(rendered, 1);
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional colour would differ here', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(PLAYER_COLORS[1], PLAYER_COLORS[2], 'seat 1 and mascot 2 must be distinguishable');
});
