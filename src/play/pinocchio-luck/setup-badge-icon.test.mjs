// gh#140 / gh#209: this route's setup rows open with the seat's ANIMAL, never a seat number.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #plPlayers. The
// first half runs that real screen over THIS route's markup.html at THIS route's declared range and
// reads the badges back off the rows it built, including the row's positional numbered label, which
// stays numbered on purpose (gh#177) and must never be flagged.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js and
// run against the real makeMatch: the round must be played by exactly the players handed over, in
// the order handed over, under the names the screen gave them. This route's seats carry a name only
// -- the round's player orb shows the name's first character, not a mascot -- so there is no mascot
// to follow onto the seats here, unlike cursed-number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game, { makeMatch, liveRng } from '../../games/pinocchio-luck.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'plPlayers', range: game.players, mascots: MASCOTS, label: 'pinocchio-luck' });

const HEADER = 'function startWithPlayers(players)';
const sliced = sliceBlock(MAIN, HEADER);

/** Runs the real startWithPlayers against stand-ins for the presentation it touches. */
function seat(players) {
  assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);
  const env = { game: null, panel: { hidden: true }, rendered: 0 };
  const run = new Function('env', 'makeMatch', 'liveRng',
    `let game=null;const panel=env.panel;const visual={};const sounds={click(){}};` +
    `function render(){env.rendered+=1;env.game=game;}\n${sliced}\nreturn startWithPlayers;`)(env, makeMatch, liveRng);
  run(players);
  return env;
}

test('pinocchio-luck: the round is played by exactly the players handed over, in order, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const { game: match, panel, rendered } = seat(players);
  assert.deepEqual(match.players.map((p) => p.name), ['p0', 'p1', 'p2']);
  assert.equal(match.turnOrder.length, 3, 'every seated player gets a turn');
  assert.equal(panel.hidden, false, 'the round panel is shown again');
  assert.equal(rendered, 1, 'the first round screen is rendered');
});

test('pinocchio-luck: a mascot-named player keeps that name on the seat', () => {
  const players = [{ name: MASCOTS[3].name, emoji: MASCOTS[3].emoji, mascot: 3 }, { name: 'ต้น', emoji: MASCOTS[1].emoji, mascot: 1 }];
  assert.deepEqual(seat(players).game.players.map((p) => p.name), [MASCOTS[3].name, 'ต้น']);
});

// Calibration, in the shape that can fail: a seat number is not a value the cast can produce, so the
// equality in the badge cases above can tell a digit badge from a glyph badge.
test('RED CALIBRATION: a seat number is not a value the cast can produce', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d/);
});
