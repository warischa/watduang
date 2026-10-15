// gh#175, the invariant a reader of the diff cannot check by eye: after the reset confirm is accepted,
// every seat shows its animal name again, the party is exactly as big as it was, and every name a
// player typed is gone.
//
// Since gh#264 (ADR-0071) the mockup's names view, its reset control, the reset modal and
// resetPlayerNames are gone with the rest of the mockup's setup; the reset lives in the shared player
// screen, mounted into #pmPlayers. This file runs that real screen over THIS route's markup.html and
// the real dialog markup, clicks through the confirm and reads the rows back. The confirm's gate is
// arm-reveal-paths.test.mjs's job; neither file substitutes for the other.
//
// The gh#175 boxes about removing and renaming players are driven the same way, through the shared
// screen's own x control and on into this route's real startWithPlayers: the old count-grid rebuild
// they used to slice is gone, and a removal is now a per-row x, not a lower count.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MASCOTS } from '../_mascots.ts';
import { mountOnPage, resetCases, settle } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import game from '../../games/power-meter.ts';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

resetCases({ test, assert, routeMarkup: MARKUP, rootId: 'pmPlayers', range: game.players, mascots: MASCOTS, label: 'power-meter' });

// The mockup's own wipe must not come back beside the shared one: two resets over two name stores is
// the drift gh#175 and gh#177 were about.
test('power-meter: no route-local reset survives beside the shared one', () => {
  assert.doesNotMatch(MAIN, /resetPlayerNames|openResetNamesModal|confirmResetNames|reset-names-modal/);
  assert.doesNotMatch(MARKUP, /id="reset-names-modal"/);
});

// main.js must have no numbered default left on any path a player can see. Pinned by absence, which
// is fragile on its own, so the positive half is pinned too: every name a seat plays under now comes
// from the shared player screen, which resolves a blank row to its mascot's name.
test('no numbered default remains in main.js', () => {
  const numbered = MAIN
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(MAIN, /mountPlayerScreen\(\{\s*root: playersRoot,[\s\S]{0,120}?onStart: startWithPlayers,/);
});

// gh#175 box: "All three open with animal names, and a search for the numbered default returns
// nothing a player can see" — markup.html is a second surface a player reads and gets the same check.
test('gh#175 box: no numbered default remains in markup.html', () => {
  const numbered = MARKUP
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line));
  assert.deepEqual(numbered, [], `numbered default(s) left in markup.html: ${JSON.stringify(numbered)}`);
});

/** Runs the real startWithPlayers over a stand-in match state; returns the seats it built. */
function seatInRoute(players) {
  const colors = MAIN.slice(MAIN.indexOf('const PLAYER_COLORS = ['), MAIN.indexOf('];', MAIN.indexOf('const PLAYER_COLORS = [')) + 2);
  const handoff = sliceBlock(MAIN, 'function startWithPlayers(players)');
  const start = sliceBlock(MAIN, 'function startNewMatch()');
  assert.ok(handoff && start, 'main.js no longer declares startWithPlayers/startNewMatch — this test measures nothing');
  const state = { players: [] };
  new Function('game', 'viewRoot', 'soundSynth', 'GameState', 'renderUI', `${colors}\n${handoff}\n${start}\nreturn startWithPlayers;`)(
    state, {}, { playClick() {} }, {}, () => {},
  )(players);
  return state.players;
}

// Past the arm window, so the click is the player's and not a ghost the gate swallows.
const quiet = () => new Promise((resolve) => setTimeout(resolve, 450));

test('gh#175 box: removing a player does not re-number or rename the players who remain', async () => {
  const roster = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย'];
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'pmPlayers', range: game.players, roster });
  page.screen.open();
  await settle();
  await quiet();
  page.root.querySelectorAll('.ps-p')[1].querySelector('.ps-rm').click();
  assert.deepEqual(page.root.querySelectorAll('.ps-n').map((f) => f.value), ['พี่โต้ง', 'น้องหมวย'],
    'a remaining row was renamed or shifted after another was removed');
  await quiet();
  page.part('start').click();
  await settle();
  assert.equal(page.calls.started.length, 1, 'start handed nobody over');
  const handed = page.calls.started[0];
  const seats = seatInRoute(handed);
  assert.deepEqual(seats.map((p) => p.name), ['พี่โต้ง', 'น้องหมวย'], 'the route renamed or dropped a remaining player');
  // Each keeps its OWN animal: the third roster name stays the third mascot, it does not slide down.
  assert.deepEqual(seats.map((p) => p.avatar), [MASCOTS[0].emoji, MASCOTS[2].emoji]);
});

test('gh#175 box: a renamed player plays under the typed name, and a blank row as its animal', async () => {
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'pmPlayers', range: game.players });
  page.screen.open();
  await settle();
  const field = page.root.querySelectorAll('.ps-n')[1];
  field.value = 'ชิบะ';
  field.dispatchEvent({ type: 'input' });
  await quiet();
  page.part('start').click();
  await settle();
  const seats = seatInRoute(page.calls.started[0]);
  const count = Number(page.part('count-num').textContent);
  assert.equal(seats.length, count, 'the route seated a different number than the screen chose');
  assert.deepEqual(seats.map((p) => p.name), MASCOTS.slice(0, count).map((m, i) => (i === 1 ? 'ชิบะ' : m.name)));
});
