// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #wspPlayers.
// The first half runs that real screen over THIS route's markup.html at THIS route's declared range
// and reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js and
// run together with the route's own avatarFor: the seats the round is played with must wear the
// glyph of the mascot the player screen gave them -- with someone sitting out, a seat's index and
// its mascot differ, and that is exactly the case a positional default gets wrong.
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
import game from '../../games/wire-snip-panic.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'wspPlayers', range: game.players, mascots: MASCOTS, label: 'wire-snip-panic' });

const HEADER = 'function startWithPlayers(players)';
const sliced = sliceBlock(MAIN, HEADER);
assert.ok(sliced, `main.js no longer declares ${HEADER} — this test is measuring nothing`);
// The route's own seat-to-glyph arrow. One statement, so it is taken to its semicolon.
const avatarAt = MAIN.indexOf('const avatarFor = ');
assert.notEqual(avatarAt, -1, 'main.js no longer declares avatarFor — this test is measuring nothing');
const avatarDecl = MAIN.slice(avatarAt, MAIN.indexOf(';', avatarAt) + 1);

/** Runs the real startWithPlayers over a fresh engine state and returns what it seated. */
function seat(players) {
  const state = { state: 'MENU', players: [], avatars: [], scores: [] };
  const shown = [];
  let penaltyRendered = 0;
  const run = new Function('game', 'GameState', 'showScreen', 'renderPenaltyUI',
    `${avatarDecl}\n${sliced}\nreturn { startWithPlayers, avatarFor };`,
  )(state, new Proxy({}, { get: (_t, k) => k }), (id) => shown.push(id), () => { penaltyRendered += 1; });
  run.startWithPlayers(players);
  return { state, shown, penaltyRendered, avatarFor: run.avatarFor };
}

test('wire-snip-panic gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const { state, shown, penaltyRendered, avatarFor } = seat(players);
  assert.deepEqual(state.players, ['p0', 'p1', 'p2']);
  assert.deepEqual([0, 1, 2].map(avatarFor), [mascotEmoji(0), mascotEmoji(2), mascotEmoji(5)],
    'the glyph follows the mascot, not the seat index');
  assert.deepEqual(state.scores, [0, 0, 0], 'every seat starts the match at zero');
  assert.equal(state.state, 'SETUP');
  assert.deepEqual(shown, ['screen-setup'], 'the game\'s own options come next (ADR-0071 ruling 1)');
  assert.equal(penaltyRendered, 1, 'the options screen is drawn as it is shown');
});

test('wire-snip-panic gh#209: the whole declared range seats, seat by seat', () => {
  for (const n of game.players) {
    const players = Array.from({ length: n }, (_, i) => ({ name: `s${i}`, emoji: MASCOTS[i].emoji, mascot: i }));
    const { state, avatarFor } = seat(players);
    assert.equal(state.players.length, n);
    assert.deepEqual(state.players.map((_, i) => avatarFor(i)), players.map((p) => p.emoji));
  }
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional glyph would differ here', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(mascotEmoji(1), mascotEmoji(2), 'seat 1 and mascot 2 must be distinguishable');
});
