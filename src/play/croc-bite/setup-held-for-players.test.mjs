// gh#264: on this route the shared player screen comes first and the game's own setup screen
// (#screen-setup) comes up only when that screen's start hands the players over. The invariant: while
// a players root exists, the setup screen is never painted -- not at first paint, not through the
// boot, not mid-fade -- until startWithPlayers reveals it; with no players root the setup screen is
// the first screen and shows as before.
//
// Why `hidden` is not enough, and why this file reads a SECOND class: the boot un-hides setup for the
// SETUP phase (UIManager's constructor runs updateUI) and the player-screen mount hides it again, and
// `.setup-overlay.hidden` is a 0.25s opacity/visibility transition that needs frames to finish. A
// device whose boot blocks frames, or a background tab, keeps the setup screen painted for seconds
// while the player screen's open waits on its migration. So the screen carries a hold class from the
// markup on, whose rule takes effect with no transition, and only the reveal removes it.
//
// The engine side runs from main.js's own text: updateUI, mountPlayers, startWithPlayers and
// clearForPlayers are sliced out and called on the route's real markup with the real shared screen
// mounted. Ceiling: this proves which classes the boot leaves on the node and that the stylesheet
// gives the hold class a no-transition hidden state; that Chrome paints nothing in that state is the
// browser's, measured by the fit probe's control leg.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from '../_dom-stub.mjs';
import { makePage, installStorage, settle } from '../_player-screen/screen-harness.mjs';
import game from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const ENGINE = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const MARKUP = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');
const OVERRIDES = fs.readFileSync(path.join(here, 'overrides.css'), 'utf8');

const HELD = 'held-for-players';

function slice(header) {
  const found = sliceBlock(ENGINE, header);
  assert.ok(found, `main.js no longer declares ${header} -- this test is measuring nothing`);
  return found;
}
const PHASES_SRC = (() => {
  const from = ENGINE.indexOf('const PHASES = {');
  const to = ENGINE.indexOf('class GameState ', from);
  assert.ok(from >= 0 && to > from, 'main.js no longer declares PHASES ahead of GameState');
  return ENGINE.slice(from, to);
})();
const UPDATE_UI = slice('updateUI()');
const MOUNT = slice('mountPlayers()');
const HANDOFF = slice('startWithPlayers(players)');
const CLEAR = slice('clearForPlayers()');

const held = (el) => el.classList.contains(HELD);
const painted = (el) => !el.classList.contains('hidden') && !held(el);

/** The route's markup with the engine's boot run over it, step by step. */
async function bootOn(markup, { mount } = {}) {
  installStorage();
  const doc = makePage(markup);
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const { mountPlayerScreen } = await import('../_player-screen/player-screen.ts');
  const el = (id) => doc.getElementById(id) ?? { classList: { toggle() {}, add() {}, remove() {}, contains: () => false } };
  // eslint-disable-next-line no-new-func -- main.js's own method bytes, bound to a minimal engine.
  const methods = new Function('document', 'mountPlayerScreen', 'crocBite',
    `${PHASES_SRC}\nreturn { PHASES, ui: { ${UPDATE_UI} }, app: { ${MOUNT}, ${HANDOFF}, ${CLEAR} } };`,
  )(doc, mount ?? mountPlayerScreen, game);
  const state = {
    phase: methods.PHASES.SETUP,
    players: [],
    playerCount: 0,
    setPlayerCount(n) { this.playerCount = n; this.players = Array.from({ length: n }, () => ({})); },
    updatePlayerName() {},
  };
  const ui = Object.assign(methods.ui, {
    state,
    elSetup: el('screen-setup'),
    elHud: el('screen-hud'),
    elResult: el('screen-result'),
    elModalReset: el('modal-reset'),
    openModal() {},
    closeModal() {},
    updateTurnDisplay() {},
    updateTeethDescription() {},
  });
  const app = Object.assign(methods.app, { ui, state, roundActive: () => false, returnToSetup() {} });
  return { doc, ui, app, setup: ui.elSetup, players: doc.getElementById('croc-players') };
}

test('gh#264: the hold class has a hidden state that needs no frame -- no transition to wait out', () => {
  const rule = new RegExp(`\\.setup-overlay\\.${HELD}\\s*\\{([^}]*)\\}`).exec(OVERRIDES)?.[1];
  assert.ok(rule, `overrides.css has no .setup-overlay.${HELD} rule, so the class in the markup holds nothing`);
  assert.match(rule, /visibility:\s*hidden\s*!important/);
  assert.match(rule, /opacity:\s*0\s*!important/);
  assert.match(rule, /transition:\s*none\s*!important/, 'a transition here is the same mid-fade the hold exists to remove');
  assert.doesNotMatch(rule, /display:\s*none/, 'display:none takes the overlay out of flow and moves every fit number measured with it');
});

test('gh#264: with a players root, setup is never painted from the markup through the boot, until start reveals it', async () => {
  const page = await bootOn(MARKUP);
  assert.ok(page.players, 'the route markup has no #croc-players -- this case is not the converted branch');
  assert.ok(held(page.setup), 'the setup screen is paintable at FIRST PAINT, before any script ran');
  page.ui.updateUI(); // UIManager's constructor: SETUP phase un-hides setup
  assert.ok(held(page.setup), 'the constructor\'s updateUI made the setup screen paintable');
  page.app.mountPlayers();
  assert.ok(held(page.setup), 'the mount left the setup screen paintable while the open is still pending');
  await settle();
  assert.equal(page.players.hidden, false, 'the shared screen did not open -- the boot below was never reached');
  assert.ok(held(page.setup) && !painted(page.setup), 'the setup screen is paintable under the open player screen');
  page.ui.updateUI(); // a phaseChange before start re-runs it
  assert.ok(held(page.setup), 'a re-render before start made the setup screen paintable');
  page.app.startWithPlayers([{ name: 'A', emoji: 'x' }, { name: 'B', emoji: 'y' }]);
  assert.ok(painted(page.setup), 'start did not bring the game\'s own screen up');
});

test('gh#264: with NO players root (the no-player-screen fallback), setup is the first screen and shows', async () => {
  const markup = MARKUP.replace(/<section id="croc-players"[\s\S]*?<\/section>/, '');
  assert.notEqual(markup, MARKUP, 'the players section was not removed -- this case would boot the converted branch');
  const page = await bootOn(markup);
  assert.equal(page.players, null);
  page.ui.updateUI();
  page.app.mountPlayers();
  assert.ok(painted(page.setup), 'with no player screen to come first, the setup screen stayed held and the page shows nothing');
});

test('gh#264 REFUTE r1: a player screen that fails to mount releases the hold -- the error stays loud, the page is not a dead end', async () => {
  const page = await bootOn(MARKUP, { mount: () => { throw new Error('mount failed'); } });
  page.ui.updateUI();
  assert.ok(held(page.setup), 'precondition: the hold is on before the mount runs');
  assert.throws(() => page.app.mountPlayers(), /mount failed/, 'the mount failure was swallowed');
  assert.ok(painted(page.setup), 'the shared screen will never come, and the setup screen stayed held: nothing on the page is playable');
});

test('gh#264 REFUTE r2: an open that fails LATER (a rejected migration) shows the setup screen -- the error stays unhandled', async () => {
  const failing = () => ({ open: () => Promise.reject(new Error('locks refused')), close() {}, arm() {} });
  const page = await bootOn(MARKUP, { mount: failing });
  page.ui.updateUI();
  const runner = process.listeners('unhandledRejection');
  const seen = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => seen.push(e.message));
  try {
    page.app.mountPlayers();
    assert.ok(held(page.setup), 'the hold went before the open had failed');
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (const l of runner) process.on('unhandledRejection', l);
  }
  assert.ok(painted(page.setup), 'the shared screen never opened and the setup screen stayed held (or hidden): the page shows nothing');
  assert.deepEqual(seen, ['locks refused'], 'the failure was swallowed (or reported twice) instead of staying one unhandled rejection');
});
