// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? It counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger -- and since ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- its screens, its two modals, the turn banner -- pinned by the receiver
//      each one writes to, on source text. A new receiver fails on the day it is added, and a stale
//      EXPECTED fails too.
//   2. The SHARED PLAYER SCREEN mounted into #wspPlayers, which replaced the mockup's add/remove
//      player list, the reset-names modal and their arming paths. Its reveals are driven for real
//      (revealPathCases): the shared code over THIS route's markup.html with the real arm gate, read
//      off this route's own header control. A screen mounted outside #app, or one that armed only its
//      own root, leaves #btn-sound-toggle live and reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST. Two stated ceilings:
// (1) a reveal written inline as `document.getElementById('x').classList.add('active')` is recorded
//     under the receiver text `document.getElementById('x')`, so it still surfaces as an unexpected
//     receiver and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. The driven cases below and in the shared harness are what run the gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { closerCases, mountOnPage, revealPathCases, settle } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import { ARM_DELAY_MS, armAllButtons } from '../../games/_arm-gate.ts';
import wireSnipPanic from '../../games/wire-snip-panic.ts';

const MAIN = path.join(import.meta.dirname, 'main.js');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
// Whole-line comments are dropped: this file's own main.js documents its reveal paths in prose, and
// a checker cannot tell use from mention. Only FULL-line comments go -- a trailing `//` inside a
// string would take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// Every write that can make a control visible: the `.active` class this route's CSS uses for both
// screens and its two modals, and a direct display write. `grid` is in the set because this route
// reveals its penalty presets with it, and a pattern that only knew block/flex would call that
// reveal nonexistent rather than classify it.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  ['target', 'showScreen(): the screen-to-screen path, menu/options/game. Armed on the line below.'],
  ['rulesModal', 'openRulesModal(): #modal-rules, 1 close button, opened by 2 controls, never through showScreen. Armed.'],
  ['modal', 'showDetonationModal(): #modal-detonation, 2 buttons, opened on an 850ms timer over the game screen. Armed.'],
  ['actionBanner', 'setupTurn(): #turn-action-banner, revealed inside a screen already up. Armed LAST, after btn-trigger-scan is re-enabled.'],
  ['scanBtn', 'the button BEING revealed, not a container. Gated through its parent #turn-action-banner, which armAllButtons walks into.'],
  ['presetsGrid', 'NOT a button reveal: every .preset-chip in #penalty-presets-grid is a <div>, and armAllButtons gates <button> only.'],
  ['customInput', 'NOT a button reveal: #input-custom-penalty is a text input, nothing to ghost-tap.'],
  ['penaltyBox', 'NOT a button reveal: #penalty-result-container holds one text card. It also sits inside #modal-detonation, which is armed.'],
  ['flash', 'NOT a button reveal: #flash-overlay is an empty full-bleed colour wash.'],
  ['scissor', 'NOT a button reveal: #scissor-tool is a cursor-following SVG decoration.'],
]);

// The receivers above that carry buttons and therefore MUST have a call naming them. `target` is
// checked separately because its call is written against the variable, not the element id.
const MUST_BE_ARMED = ['rulesModal', 'modal', 'actionBanner'];

test('every reveal receiver in wire-snip-panic/main.js is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, call armAllButtons on the revealed element if it does, and add it to EXPECTED with ' +
      'the reason. The arm-gate CI check will not tell you — it is already green.',
  );
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('each armed reveal receiver has an armAllButtons call naming it', () => {
  for (const receiver of MUST_BE_ARMED) {
    assert.match(
      source,
      new RegExp(`armAllButtons\\([^)]*\\b${receiver}\\b`),
      `${receiver} is revealed but no armAllButtons call names it`,
    );
  }
  // showScreen's, written against `target` inside the same guard as the class it adds.
  assert.match(source, /target\.classList\.add\('active'\);\s*\n\s*armAllButtons\(target\);/);
});

// gh#264: the shared screen's root sits inside #app (the surface its dialogs and undo bar arm), it
// ships hidden, and the menu -- this game's own intro -- stays the first screen (ADR-0071 ruling 1).
test('the shared player screen is mounted into #wspPlayers, inside the #app it arms, after the menu', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('wspPlayers'\);/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  assert.ok(MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="wspPlayers"'), '#wspPlayers must sit inside #app');
  assert.match(MARKUP, /<section id="wspPlayers" class="wsp-players" hidden>/, 'the root must ship hidden');
  assert.match(MARKUP, /class="screen active" id="screen-menu"/, 'the menu is this game\'s intro and stays first');
  assert.equal((MARKUP.match(/class="screen active"/g) ?? []).length, 1, 'exactly one screen ships active');
  // The tagline slot carries the module's own tagline, byte for byte.
  assert.ok(MARKUP.includes(`<p class="ps-tagline">${wireSnipPanic.tagline}</p>`), 'the tagline slot drifted from the module');
});

// Every way into the player screen goes through the shared screen's own open(), which arms it.
test('the menu start, the options back and the game-over edit all open the shared screen', () => {
  for (const id of ['btn-menu-start', 'btn-setup-back', 'btn-edit-players']) {
    const at = source.indexOf(`getElementById('${id}')`);
    assert.ok(at > -1, `#${id} is no longer wired — this test measures nothing`);
    const handler = source.slice(at, source.indexOf('});', at));
    assert.match(handler, /playerScreen\.open\(\)/, `#${id} no longer opens the shared player screen`);
    assert.doesNotMatch(handler, /showScreen\('screen-setup'\)/, `#${id} reaches the options screen without the players`);
  }
});

// gh#187: closing a modal IS a reveal. The rules modal opens from the header, so it can sit over the
// open player screen; closing it must re-arm THAT screen, not hunt for a .screen that is not up.
// Driven: the real closeModal bytes, the real gate, this route's real markup and the real screen.
test('closing the rules modal over the open player screen re-arms the player screen', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'wspPlayers', range: wireSnipPanic.players });
  page.screen.open();
  await settle();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(page.part('start').disabled, false, 'start must be live before the close, or nothing is measured');
  const body = sliceBlock(source, 'function closeModal(id)');
  assert.ok(body, 'closeModal is gone — this test measures nothing');
  const closeModal = new Function('document', 'armAllButtons', 'playerScreen', `${body}\nreturn closeModal;`)(page.doc, armAllButtons, page.screen);
  page.byId('modal-rules').classList.add('active');
  closeModal('modal-rules');
  assert.equal(page.byId('modal-rules').classList.contains('active'), false, 'the modal did not close');
  assert.equal(page.part('start').disabled, true, 'the player screen uncovered by the close was not armed');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(page.part('start').disabled, false, 'start never came back after the window');
});

// gh#264 REFUTE round 4: the same closer, read for what it leaves start holding (closerCases).
closerCases({
  test,
  assert,
  routeMarkup: MARKUP,
  rootId: 'wspPlayers',
  range: wireSnipPanic.players,
  label: 'wire-snip-panic',
  close: (page) => {
    const body = sliceBlock(source, 'function closeModal(id)');
    assert.ok(body, 'closeModal is gone — this test measures nothing');
    const closeModal = new Function('document', 'armAllButtons', 'playerScreen', `${body}\nreturn closeModal;`)(page.doc, armAllButtons, page.screen);
    page.byId('modal-rules').classList.add('active');
    closeModal('modal-rules');
  },
});

test('closeModal re-arms the screen the modal was covering', () => {
  const at = source.indexOf('function closeModal(id)');
  assert.ok(at > -1, 'closeModal is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n    }', at));
  assert.match(
    body,
    /querySelector\('\.screen\.active'\)[\s\S]{0,80}?armAllButtons\(screen\)/,
    'closeModal no longer re-arms the live screen: a double-tap on #btn-close-rules puts the second ' +
      'contact on whatever button sits behind the card',
  );
  // A dismissal that does NOT change screen has to route through it; a direct
  // classList.remove('active') is the regression, and it is what shipped before this ruling.
  assert.match(source, /closeModal\('modal-rules'\)/, 'modal-rules is dismissed without closeModal');
});

// ---------------------------------------------------------------------------
// gh#188 boxes 13-15. Two claims, both about #btn-trigger-scan, the one control this route disables
// for its own reason.
//
// The named mechanism box 15 asks about: keydown Escape calls closeModal('modal-rules'), which arms
// the whole live screen; keydown Enter then calls triggerScanSequence(). Before gh#188 the arm
// window's blanket re-enable cleared the mid-scan `disabled` set in triggerScanSequence, so the
// button came back live during its own sequence. Two independent legs close it and both are pinned
// below, because a general argument covers neither:
//   (1) the gate no longer re-enables a control that was already disabled when it was called
//       (games/_arm-gate.ts, pinned behaviourally in short-stick's arm-reveal-paths.test.mjs);
//   (2) triggerScanSequence writes game.state BEFORE it disables, so its own TURN_WAIT guard
//       rejects the re-entry regardless of what the button's `disabled` says. That is a source
//       ORDER, and order is exactly the kind of thing a refactor reorders silently.
//
// Ceiling: leg (2) is asserted as source order, not driven.
const OWNED_DISABLED = new Map([
  [
    'scanBtn',
    'renderTurnStart(): the pass-the-phone screen offers #btn-trigger-scan, enabled. armAllButtons ' +
      'is called AFTER this write, and the gate treats an ENABLED control as gateable — so the ' +
      'ghost-tap window still covers it. Setting false, not true, so nothing is preserved here.',
  ],
  [
    "document.getElementById('btn-trigger-scan')",
    'triggerScanSequence(): disabled for the duration of the scan. This is the one write the gate ' +
      'must preserve, and the reason box 15 exists.',
  ],
]);

test('gh#188 the set of game-owned disabled writes in wire-snip-panic/main.js is a known one', () => {
  const found = [...source.matchAll(/([\w.$'"()[\]-]+?)\.disabled\s*=/g)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the disabled-write pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !OWNED_DISABLED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new game-owned disabled write(s) ${unknown.join(', ')}: the arm window preserves a control ` +
      'already disabled when it was called, so record what state this write means and whether any ' +
      'reveal path re-exposes it.',
  );
  const stale = [...OWNED_DISABLED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `OWNED_DISABLED names writes that no longer exist: ${stale.join(', ')}`);
});

test('gh#188 box 15 — triggerScanSequence sets its state before it disables the button', () => {
  assert.match(
    source,
    /if \(game\.state !== GameState\.TURN_WAIT\) return;[\s\S]*?game\.state = GameState\.SCANNING_HINTS;\s*\n\s*document\.getElementById\('btn-trigger-scan'\)\.disabled = true;/,
    'the guard, the state write and the disable must appear in that order. If the disable moves ' +
      'above the state write, Escape (which arms the live screen) followed by Enter re-enters ' +
      'triggerScanSequence and starts a second scan over the first',
  );
  // The Escape leg is what makes the ordering above load-bearing rather than incidental: it is the
  // only path that touches the button's `disabled` without going through triggerScanSequence.
  assert.match(
    source,
    /if \(e\.key === 'Escape'\) \{\s*\n\s*closeModal\('modal-rules'\);/,
    'the Escape key must dismiss through closeModal — a bare classList.remove leaves the screen ' +
      'behind the modal ungated (ADR-0057)',
  );
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'wspPlayers', headerId: 'btn-sound-toggle', label: 'wire-snip-panic' });
