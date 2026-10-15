// gh#140: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the match is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #cf-players.
// The first half runs that real screen over THIS route's markup.html at THIS route's declared range
// and reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js with
// the real MatchEngine class beside it and run: every player handed over must be seated under the
// name the player screen gave it -- with someone sitting out, a seat's index and its mascot differ,
// and that is exactly the case a positional default (defaultName) gets wrong. setupMatch shuffles the
// turn order on purpose (ADR-0071 ruling 5: a game that shuffles keeps shuffling), so the seated
// names are compared as a set, never by position.
//
// Equality with the cast throughout, never a digit scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game from '../../games/cannon-flag.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'cf-players', range: game.players, mascots: MASCOTS, label: 'cannon-flag' });

const ENGINE = sliceBlock(MAIN, 'class MatchEngine');
const HANDOFF = sliceBlock(MAIN, 'function startWithPlayers(players)');

/** Runs the real startWithPlayers over a real MatchEngine; returns the engine and what it showed. */
function seat(players) {
  assert.ok(ENGINE, 'main.js no longer declares class MatchEngine — this test is measuring nothing');
  assert.ok(HANDOFF, 'main.js no longer declares startWithPlayers(players) — this test is measuring nothing');
  const shown = [];
  const DOM = { hudMatchSeed: { textContent: '' } };
  const run = new Function(
    'DOM', 'sound', 'showPassDeviceScreen', 'generateEnvironment', 'defaultName',
    `${ENGINE}\nconst gameEngine = new MatchEngine();\n${HANDOFF}\nreturn { gameEngine, startWithPlayers };`,
  )(DOM, { init() {}, playClick() {} }, () => shown.push('pass-device'), () => ({ seed: 4242 }), (i) => `default-${i}`);
  run.startWithPlayers(players);
  return { engine: run.gameEngine, shown, DOM };
}

test('cannon-flag gh#140: the seats played wear the player screen\'s names, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and the fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m) => ({ name: MASCOTS[m].name, emoji: MASCOTS[m].emoji, mascot: m }));
  const { engine, shown, DOM } = seat(players);
  assert.equal(engine.players.length, 3);
  assert.equal(engine.playerCount, 3);
  assert.equal(engine.activePlayerPool.length, 3, 'every seated player takes a turn');
  assert.deepEqual(engine.players.map((p) => p.name).sort(), players.map((p) => p.name).sort(),
    'the seated names are the handed names -- no positional default replaced a mascot that sat in a gap');
  assert.deepEqual(engine.players.map((p) => p.turnOrder).sort((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(shown, ['pass-device'], 'play comes next: this route has no option screen after the players (ADR-0071 ruling 1)');
  assert.equal(DOM.hudMatchSeed.textContent, 'SEED: #4242');
});

test('cannon-flag: the handoff seats the declared maximum, one seat per handed player', () => {
  const players = Array.from({ length: game.players[1] }, (_, i) => ({ name: MASCOTS[i].name, emoji: MASCOTS[i].emoji, mascot: i }));
  const { engine } = seat(players);
  assert.equal(engine.players.length, game.players[1]);
  assert.equal(new Set(engine.players.map((p) => p.name)).size, game.players[1], 'no seat was duplicated or dropped');
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional default differs from a gap mascot', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(MASCOTS[1].name, MASCOTS[2].name, 'seat 1 and mascot 2 must be distinguishable');
});
