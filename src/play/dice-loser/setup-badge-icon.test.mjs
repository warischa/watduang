// gh#140: the setup roster row opens with the seat's ANIMAL, not a seat number.
//
// Since gh#264 (ADR-0071) the rows are the shared player screen's, mounted into #dl-players. So the
// real thing is run: the shared screen's code over THIS route's markup.html, at THIS route's declared
// range, and the badges read back off the rows it built. A route that stopped mounting the screen, or
// mounted it somewhere this markup does not have, fails here rather than testing nothing.
//
// The second half is the handoff the screen starts, startWithPlayers, sliced out of main.ts and run:
// the round must be played under exactly the names the screen handed over, in the order given --
// with someone sitting out, a seat's index and its mascot differ, and a positional default (the cast
// name for seat i) is exactly what would come back wrong.
//
// Equality with the cast throughout, never a digit scan: the name field beside the badge carries a
// legitimate numbered positional label (gh#177).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game from '../../games/dice-loser.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'dl-players', range: game.players, mascots: MASCOTS, label: 'dice-loser' });

const HEADER = 'startWithPlayers(players: Player[]): void';
const sliced = sliceBlock(MAIN, HEADER);
assert.ok(sliced, `main.ts no longer declares ${HEADER} — this test is measuring nothing`);

/** Runs the real startWithPlayers against stand-in module state and returns what it left. */
function seat(players) {
  const env = { names: ['stale'], shown: null, setupEl: { id: 'dl-setup' } };
  env.show = (panel) => {
    env.shown = panel?.id ?? null;
  };
  const run = new Function('__env', `with (__env) { return ${stripTypeScriptTypes(`function ${sliced}`)} }`)(env);
  run(players);
  return env;
}

test('dice-loser gh#264: the handoff seats exactly the players handed over, in order, then shows the rule screen', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const env = seat(players);
  assert.deepEqual(env.names, ['p0', 'p1', 'p2'], 'the round plays under the names handed over, not a positional default');
  assert.equal(env.shown, 'dl-setup', "the game's own option (the scoring rule) comes next (ADR-0071 ruling 1)");
  const max = Array.from({ length: game.players[1] }, (_, i) => ({ name: MASCOTS[i].name, emoji: MASCOTS[i].emoji, mascot: i }));
  assert.equal(seat(max).names.length, game.players[1], 'every seat up to the declared maximum is kept');
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// badge equality above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: no seat glyph is a digit, so the equality can separate the two', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
});
