// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? power-meter did, from armRenderedView(), and stayed green for the whole time openModal()
// revealed two modals with no arm at all -- the gate counts calls per DIRECTORY, not per reveal. The
// real rule (ADR-0017) is per reveal: the second contact of a double-tap must not land on a control
// the first contact just put under the finger -- and since ADR-0057, every close, cancel and confirm
// path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- the views renderUI() draws into #view-root, the header modals and
//      their closer -- pinned by the receiver each one writes to, on source text. A new receiver
//      fails on the day it is added, and whoever adds it records the decision here.
//   2. The SHARED PLAYER SCREEN mounted into #pmPlayers, which replaced the mockup's count view, its
//      names view, the reset-names modal and that modal's arming paths. Its reveals are driven for
//      real (revealPathCases): the shared code over THIS route's markup.html with the real arm gate,
//      read off this route's own header control. A screen mounted outside #app-container, or one
//      that armed only its own root, leaves #btn-help-modal live and reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST, so (1) an inline reveal is
// recorded under its whole receiver expression and still fails as unexpected, and (2) this proves
// the CALL SITE exists next to the reveal, never the browser-level 400ms.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { closerCases, revealPathCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import { armAllButtons } from '../../games/_arm-gate.ts';
import powerMeter from '../../games/power-meter.ts';

const MAIN = path.join(import.meta.dirname, 'main.js');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
// Whole-line comments are dropped: main.js documents its own reveal seams in prose, and a checker
// cannot tell use from mention. Only FULL-line comments go -- a trailing `//` inside a string would
// take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// Every write that can make a control visible: the `.active` class this route's CSS uses for both
// modals, the `.show` class its toast uses, and a direct display write. `show` is in the set on
// purpose -- a pattern that did not know this route's second visibility class would call that reveal
// nonexistent rather than classify it.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"](?:active|show)['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'modal',
    'openModal(): #help-modal and #tests-modal from the header icons -- neither goes through ' +
      'renderUI(). Armed on its OWN slot.',
  ],
  ['toast', 'NOT a button reveal: #toast-msg is a transient text status line with no control in it.'],
]);

const MUST_BE_ARMED = ['modal'];

test('every reveal receiver in power-meter/main.js is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, arm the revealed element if it does, and add it to EXPECTED with the reason. The ' +
      'arm-gate CI check will not tell you — it is already green.',
  );
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('each armed reveal receiver has an armAllButtons call naming it', () => {
  for (const receiver of MUST_BE_ARMED) {
    assert.match(
      source,
      new RegExp(`armAllButtons\\([^)]*\\b${receiver.replace(/\./g, '\\.')}\\b`),
      `${receiver} is revealed but no armAllButtons call names it`,
    );
  }
});

// The modal arm must NOT share armRenderedView()'s slot. #btn-help-modal and #btn-tests-modal sit in
// the header, outside #view-root, so they are never gated: through a shared slot, a tap on one of
// them during a fresh view's window would cancel that view's pending arm, and the canceller does not
// re-enable. The view's buttons would stay disabled with nothing left that could call renderUI().
test('openModal arms on its own slot, not the view slot', () => {
  assert.match(source, /disarmModal = armAllButtons\(modal\)/);
  assert.doesNotMatch(source, /disarmActive = armAllButtons\(modal\)/);
});

// The reveal REVEAL_RE cannot see at all: every view is written into #view-root by innerHTML, which
// puts a fresh set of controls at the coordinates of the ones just pressed. renderUI() is the single
// place that arms them, deliberately after the switch rather than inside each of the builders.
test('renderUI arms the view it just drew', () => {
  assert.match(source, /function armRenderedView\(\) \{[\s\S]*?armAllButtons\(viewRoot/);
  assert.match(source, /armRenderedView\(\);\s*\n\s*\}\s*\n/);
});

// gh#187, owner ruling 2026-09-01: closing a modal IS a reveal ADR-0017 gates, on its own, with no
// rebuild involved. REVEAL_RE cannot see a closer -- it matches writes that SHOW -- so this is the
// only pin on that path. Since gh#264 there are two surfaces a header modal can cover: a view in
// #view-root, or the shared player screen while it is up (#view-root is empty and hidden then).
// The closer must re-arm whichever is live, so both branches are pinned.
test('closeModal re-arms the surface the modal was covering, the player screen included', () => {
  const at = source.indexOf('function closeModal(');
  assert.ok(at > -1, 'closeModal is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n    }', at));
  assert.match(
    body,
    /armRenderedView\(\)/,
    'closeModal no longer re-arms #view-root: a double-tap on any close control puts the second ' +
      'contact on whatever view button sits behind the card, its own arm window long expired',
  );
  assert.match(
    body,
    /game\.state === GameState\.PLAYERS[\s\S]*playerScreen\.arm\(\)/,
    'closeModal no longer re-arms the player screen while it is up: start, the ticks and the x ' +
      'controls sit live under the help card',
  );
  // The player screen's state is the one onOpen sets; without it the branch above never runs.
  assert.match(source, /onOpen: \(\) => \{[\s\S]{0,400}?game\.state = GameState\.PLAYERS;/,
    'onOpen no longer marks the player screen as the live surface');
});

test('the shared player screen is mounted into #pmPlayers, inside the #app-container it arms', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('pmPlayers'\);/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  const container = MARKUP.indexOf('id="app-container"');
  const players = MARKUP.indexOf('id="pmPlayers"');
  const view = MARKUP.indexOf('id="view-root"');
  assert.ok(container > -1 && players > container, '#pmPlayers must sit inside #app-container');
  // renderUI() replaces #view-root wholesale on every state change, so a root inside it would be
  // wiped by the first view drawn after the screen closes.
  assert.ok(view > -1 && players < view, '#pmPlayers must sit beside #view-root, never inside it');
});

// Every way back to the player screen goes through the shared screen: the game-over control that
// used to re-render the count view opens it instead. The round is over there, so nothing is asked.
test('the game-over setup control opens the player screen, never a bare state swap', () => {
  const at = source.indexOf('function resetToSetup()');
  assert.ok(at > -1, 'resetToSetup is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n    }', at));
  assert.match(body, /playerScreen\.open\(\)/);
  assert.doesNotMatch(body, /renderUI\(\)/, 'resetToSetup re-renders a view instead of opening the player screen');
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'pmPlayers', headerId: 'btn-help-modal', label: 'power-meter' });

// gh#264 REFUTE round 4: the real closeModal bytes over the open player screen, read for what they
// leave start holding (closerCases). The state is the one the route's onOpen sets.
closerCases({
  test,
  assert,
  routeMarkup: MARKUP,
  rootId: 'pmPlayers',
  range: powerMeter.players,
  label: 'power-meter',
  close: (page) => {
    const body = sliceBlock(source, 'function closeModal(id)');
    assert.ok(body, 'closeModal is gone — this test measures nothing');
    const GameState = { PLAYERS: 'PLAYERS' };
    const closeModal = new Function(
      'soundSynth', 'document', 'game', 'GameState', 'playersRoot', 'playerScreen', 'armAllButtons', 'armRenderedView',
      `${body}\nreturn closeModal;`,
    )({ playClick() {} }, page.doc, { state: GameState.PLAYERS }, GameState, page.root, page.screen, armAllButtons, () => {
      throw new Error('closeModal re-armed the view while the player screen was up');
    });
    page.byId('help-modal').classList.add('active');
    closeModal('help-modal');
  },
});
