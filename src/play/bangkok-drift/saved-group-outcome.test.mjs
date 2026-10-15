// gh#205 box 2 -- the outcome, not the mechanism -- re-expressed for the shared player screen.
//
// Before gh#264 a returning device skipped this route's own setup screen: a roster bridge replayed
// the saved names into it and pressed start. ADR-0071 retired that bridge, and its "Accepted losses"
// section records the new behaviour on purpose: a return visit shows the pre-filled player screen and
// costs one tap. So the invariant this file used to pin ("a saved group never sees the setup screen")
// is overturned by decision, and what is pinned instead is the outcome of that one tap:
//
//   a device with a saved roster and a saved group opens the shared screen in its SAVED mode (no
//   stepper, no reset), with exactly the group ticked; one press on start hands exactly that group,
//   in roster order, to this route's startWithPlayers; and the route then puts the round screen up
//   for the group's first player, counting the group's size -- the player screen put away.
//
// Both halves run for real against ONE page: the shared screen over this route's markup.html through
// the screen harness, and main.js's own round wiring (the bytes from the logic marker to the
// readyBtn wiring, the same slice this file always ran) against that same page document.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mountOnPage, settle } from '../_player-screen/screen-harness.mjs';
import game from '../../games/bangkok-drift.ts';

const HERE = import.meta.dirname;
const MARKUP = fs.readFileSync(path.join(HERE, 'markup.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(HERE, 'main.js'), 'utf8');

/** main.js's round wiring, evaluated against `document`. Everything after the readyBtn wiring needs
 *  a canvas this test has no reason to model, and is cut off. */
function routeOn(document) {
  const start = MAIN.indexOf('// @logic-start');
  const end = MAIN.indexOf("$('readyBtn')");
  assert.ok(start !== -1 && end > start,
    'main.js no longer carries its logic marker or the readyBtn wiring -- this test would measure nothing');
  const armed = [];
  const api = new Function('document', 'armAllButtons', 'matchMedia',
    `${MAIN.slice(start, end)}\nreturn { startWithPlayers, round };`,
  )(document, (el) => armed.push(el.id), () => ({ matches: false }));
  return { ...api, armed };
}

test('a saved group opens the saved player screen, and its one start puts that group into the round', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const roster = ['ต้น', 'มายด์', 'บอส', 'แนน'];
  const group = ['มายด์', 'แนน'];
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'bd-players', roster, group, range: game.players });
  page.screen.open();
  await settle();

  assert.equal(page.root.hidden, false, 'the player screen is the first screen on a return visit (ADR-0071)');
  assert.equal(page.part('count').hidden, true, 'a saved roster shows no stepper (ruling 3)');
  const ticked = [...page.root.querySelectorAll('.ps-tick')].map((b) => b.getAttribute('aria-pressed'));
  assert.deepEqual(ticked, ['false', 'true', 'false', 'true'], 'exactly the saved group starts ticked');

  t.mock.timers.tick(401); // the opening arm window
  assert.equal(page.part('start').click(), true, 'start is live once the window has passed');
  await settle();
  assert.equal(page.calls.started.length, 1, 'one tap hands the players over');
  const players = page.calls.started[0];
  assert.deepEqual(players.map((p) => p.name), group, 'the group, in roster order, and nobody else');

  const route = routeOn(page.doc);
  route.startWithPlayers(players);
  const turn = page.doc.getElementById('screen-turn');
  assert.ok(turn, 'screen-turn does not exist in the page');
  assert.equal(turn.classList.contains('active'), true, 'the round screen never came up');
  assert.equal(page.root.hidden, true, 'the player screen is still up over the round');
  assert.equal(page.doc.getElementById('turn-name').textContent, 'มายด์', 'the first seat is the group\'s first player');
  assert.equal(page.doc.getElementById('turn-count').textContent, 'คนที่ 1 จาก 2', 'the turn count is the group\'s size');
  assert.deepEqual(route.armed, ['screen-turn'], 'the revealed round screen is armed (ADR-0017)');
});
