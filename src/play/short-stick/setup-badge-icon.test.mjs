// gh#209: this route's seat identity is the seat's ANIMAL, never a seat number -- on the setup rows
// and on the seats the round is then played with.
//
// Since gh#264 (ADR-0071) the setup rows are the shared player screen's, mounted into #ssPlayers. The
// first half runs that real screen over THIS route's markup.html at THIS route's declared range and
// reads the badges back off the rows it built.
//
// The second half is the engine entry the screen starts, startWithPlayers, sliced out of main.js and
// run, then the real renderDraw over what it seated: the turn badge and every strip chip must wear
// the glyph of the mascot the player screen gave that seat. With someone sitting out, a seat's index
// and its mascot differ -- exactly the case the mockup's positional AVATARS[i] got wrong.
//
// Equality with the cast throughout, never a digit scan: the name field beside the badge carries a
// legitimate numbered positional label.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
import { badgeCases } from '../_player-screen/screen-harness.mjs';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';
import game from '../../games/short-stick.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

badgeCases({ test, assert, routeMarkup: MARKUP, rootId: 'ssPlayers', range: game.players, mascots: MASCOTS, label: 'short-stick' });

function slice(header) {
  const found = sliceBlock(MAIN, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

/** Runs the real startWithPlayers, then the real renderDraw over the state it left. */
function seatAndDraw(players) {
  const { document, el } = makeDocumentStub();
  const state = { players: [], avatars: [], lengths: [12, 3, 9], used: [false, false, false], shortIndices: [1], turn: 0, drawIndex: 0, isResolving: false };
  const calls = { shown: null, setup: 0, locked: 0 };
  const run = new Function(
    'game', 'document', '$', 'lockFairCounts', 'renderSetup', 'setView', 'calculateOdds', 'sounds', 'escapeHtml',
    'mountStripOverflowCounter', 'handleDrawStick', 'armAllButtons',
    `${'function ' + slice('startWithPlayers(players)')}\n${slice('const renderDraw = () =>')};\nreturn { startWithPlayers, renderDraw };`,
  )(
    state, document, (id) => document.getElementById(id),
    () => { calls.locked += 1; }, () => { calls.setup += 1; }, (v) => { calls.shown = v; },
    () => ({ remaining: 3, isCritical: false }), { playHeartbeat() {} }, (s) => String(s),
    () => {}, () => {}, () => {},
  );
  run.startWithPlayers(players);
  run.renderDraw();
  const chips = el('draw-player-strip').children.map((c) => /^<span>([\s\S]*?)<\/span>/.exec(c.innerHTML)?.[1]);
  return { state, calls, badge: el('draw-player-avatar').textContent, chips };
}

test('short-stick gh#209: the seats played wear the player screen\'s mascots, sitting-out gap included', () => {
  // Mascots 0, 2 and 5: the second and the fourth-to-fifth roster seats sat out.
  const players = [0, 2, 5].map((m, i) => ({ name: `p${i}`, emoji: MASCOTS[m].emoji, mascot: m }));
  const { state, calls, badge, chips } = seatAndDraw(players);
  assert.deepEqual(state.players, ['p0', 'p1', 'p2'], 'every handed player is seated, in the order handed');
  assert.deepEqual(state.avatars, players.map((p) => p.emoji));
  assert.equal(badge, MASCOTS[0].emoji, 'the turn badge wears seat 0\'s mascot');
  assert.deepEqual(chips, players.map((p) => p.emoji), 'each strip chip wears its own seat\'s mascot, not AVATARS[index]');
  assert.equal(calls.locked, 1, 'the fairness lock re-runs over the new roster (one stick per player)');
  assert.equal(calls.shown, 'setup', 'the game\'s own options come next (ADR-0071 ruling 1)');
});

test('RED CALIBRATION: no seat glyph is a digit, and a positional glyph would differ here', () => {
  const icons = Array.from({ length: 10 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, Array.from({ length: 10 }, (_, i) => String(i + 1)));
  for (const icon of icons) assert.doesNotMatch(icon, /\d|#/);
  assert.notEqual(MASCOTS[1].emoji, MASCOTS[2].emoji, 'seat 1 and mascot 2 must be distinguishable');
});
