// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #ftPlayers. The
// first half runs that real screen over THIS route's markup.html at THIS route's declared range and
// reads the badges back off the rows it built (against the shared cast, which is what the screen reads).
//
// The second half is the engine entry the screen starts, FreezeTapEngine.startWithPlayers, sliced out
// of main.js together with the setPlayerCount it seats through and the route's own inline cast
// (MASCOT_PLAYERS -- pinned row for row against the shared cast by ../mascot-defaults.test.mjs). The
// seats the round is played with must wear the glyph, the name and the colour of the mascot the
// player screen gave them -- with someone sitting out, a seat's index and its mascot differ, and that
// is exactly the case a positional default gets wrong.
//
// Equality with the cast throughout, never a digit scan: the name field beside the badge carries a
// legitimate numbered positional label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game from '../../games/freeze-tap.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'ftPlayers', range: game.players, mascots: MASCOTS, label: 'freeze-tap' });

function slice(header) {
  const found = sliceBlock(source, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** The route's own inline cast, by matching brackets from its declaration. */
function sliceCast() {
  const at = source.indexOf('const MASCOT_PLAYERS = [');
  assert.notEqual(at, -1, 'main.js no longer declares MASCOT_PLAYERS — this test is measuring nothing');
  const open = source.indexOf('[', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced brackets while slicing MASCOT_PLAYERS');
}

const factory = new Function(
  `const MASCOT_PLAYERS = ${sliceCast()};
   return {
     cast: MASCOT_PLAYERS,
     setPlayerCount: function ${slice('setPlayerCount(count)')},
     startWithPlayers: function ${slice('startWithPlayers(players)')},
   }`,
);

/** Runs the real handoff on a stand-in engine carrying the real seat method; returns that engine. */
function seat(players) {
  const parts = factory();
  const engine = {
    players: [],
    playerCount: 0,
    cleared: 0,
    started: 0,
    setPlayerCount: parts.setPlayerCount,
    clearTimers() { this.cleared += 1; },
    // The real startNewRound copies the seats into the round's own list and draws a rule; only the
    // copy is what this file reads.
    startNewRound() { this.started += 1; this.activeRoster = [...this.players]; },
  };
  parts.startWithPlayers.call(engine, players);
  return { engine, cast: parts.cast };
}

test('freeze-tap gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and the fourth to fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const { engine, cast } = seat(players);
  assert.deepEqual(engine.players.map((p) => p.emoji), players.map((p) => p.emoji));
  assert.deepEqual(engine.players.map((p) => p.name), ['p0', 'p1', 'p2']);
  assert.deepEqual(engine.players.map((p) => p.color), [0, 2, 5].map((m) => cast[m].color),
    'the colour follows the mascot, not the seat index');
  assert.equal(new Set(engine.players.map((p) => p.id)).size, 3, 'every seat keeps its own id -- the loser is found by id');
  assert.equal(engine.started, 1, 'no game option of its own on this route: the round starts at once (ADR-0071 ruling 1)');
  assert.deepEqual(engine.activeRoster.map((p) => p.name), ['p0', 'p1', 'p2'], 'the round iterates exactly the seats handed over');
});

test('freeze-tap: the handoff seats every player it is handed, at both ends of the declared range', () => {
  for (const n of game.players) {
    const players = Array.from({ length: n }, (_, i) => ({ name: `s${i}`, emoji: MASCOTS[i].emoji, mascot: i }));
    const { engine } = seat(players);
    assert.equal(engine.playerCount, n);
    assert.deepEqual(engine.players.map((p) => p.name), players.map((p) => p.name));
  }
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional colour would differ here', () => {
  const { cast } = seat([0, 1].map((m) => ({ name: 'x', emoji: MASCOTS[m].emoji, mascot: m })));
  const icons = cast.map((m) => m.emoji);
  assert.ok(icons.length >= 10, `the route's cast has shrunk to ${icons.length} seats`);
  assert.notDeepEqual(icons.slice(0, 10), Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notDeepEqual([0, 2, 5].map((m) => cast[m].color), [0, 1, 2].map((m) => cast[m].color),
    'seat-index colours and mascot colours must be distinguishable in the gap case above');
});
