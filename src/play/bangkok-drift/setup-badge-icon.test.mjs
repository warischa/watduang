// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #bd-players.
// The first half runs that real screen over THIS route's markup.html at THIS route's declared range
// and reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js and
// run: the round must be played by exactly the players the screen handed over, in that order. With
// someone sitting out, a seat's index and its mascot differ, and a blank row plays under its
// mascot's name (ADR-0054 ruling 3) -- so a route that rebuilt names positionally ("player N") or
// dropped the screen's order would differ from the hand here.
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
import game from '../../games/bangkok-drift.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'bd-players', range: game.players, mascots: MASCOTS, label: 'bangkok-drift' });

const HEADER = 'function startWithPlayers(players)';
const sliced = sliceBlock(MAIN, HEADER);
assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);

/** Runs the real startWithPlayers against a stand-in round state and returns what it seated. */
function seat(players) {
  const round = { count: 4, names: ['stale'], turn: 3, track: null, results: [] };
  let started = 0;
  new Function('round', 'startRound', `${sliced}\nreturn startWithPlayers;`)(round, () => { started += 1; })(players);
  return { round, started };
}

test('bangkok-drift gh#209: the round is played by the player screen\'s players, in its order, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out. The middle seat was left
  // blank on the screen, so it arrives under its mascot's own name.
  const players = [
    { name: 'ต้น', emoji: MASCOTS[0].emoji, mascot: 0 },
    { name: MASCOTS[2].name, emoji: MASCOTS[2].emoji, mascot: 2 },
    { name: 'บอส', emoji: MASCOTS[5].emoji, mascot: 5 },
  ];
  const { round, started } = seat(players);
  assert.deepEqual(round.names, ['ต้น', MASCOTS[2].name, 'บอส']);
  assert.equal(round.count, 3, 'the turn count follows the hand, not the old default of 4');
  assert.equal(started, 1, 'the round starts once the players are seated (no option screen on this route)');
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional name would differ here', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(MASCOTS[2].name, MASCOTS[1].name, 'seat 2 and mascot 3 must be distinguishable');
});
