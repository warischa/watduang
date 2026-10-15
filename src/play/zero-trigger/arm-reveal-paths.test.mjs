// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? It counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger -- and since ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- its three screens, its modals, the penalty toggle -- pinned by the
//      receiver each one writes to, on source text. A new receiver fails on the day it is added.
//   2. The SHARED PLAYER SCREEN mounted into #zt-players, which replaced the mockup's roster rows,
//      its add / remove / random-avatar controls, its avatar picker and its reset-cast modal, and
//      every arming path those carried. Its reveals are driven for real (revealPathCases): the shared
//      code over THIS route's markup.html with the real arm gate, read off this route's own header
//      control. A screen mounted outside #app-container, or one that armed only its own root, leaves
//      #btn-audio-toggle live and reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST, so (1) a one-expression reveal
// is recorded under its whole receiver text and still fails as unexpected, and (2) this proves the
// CALL SITE exists next to the reveal, never the browser-level 400ms (owner ruling on issue #232).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { revealPathCases } from '../_player-screen/screen-harness.mjs';

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
// its three screens and its modals, and a direct display write.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'target',
    "switchScreen(): the screen-to-screen path, menu/setup/game (see the switchScreen call-site " +
      'enumeration below). Armed on the line below the reveal.',
  ],
  [
    'modal',
    'openModal(): shared by modal-rules and modal-result. Armed on the line below the reveal.',
  ],
  [
    'homeBtn',
    'the player screen\'s onOpen: shows the header house icon while the player screen is up. Armed ' +
      'by the shared screen itself, which arms #app-container (the header included) right after ' +
      'onOpen returns -- the revealPathCases below read a header control to prove that surface.',
  ],
  [
    'btn',
    'the .penalty-btn click handler: restyles a button the player is already tapping, not a new ' +
      'control put under the finger. No fresh <button> is created or revealed.',
  ],
  [
    'penaltyBox',
    'NOT a button reveal: #modal-penalty-box (showDefeatModal) is a text-only card, and it also sits ' +
      "inside #modal-result, which openModal() already arms.",
  ],
]);

const MUST_BE_ARMED = ['target', 'modal'];

test('every reveal receiver in zero-trigger/main.js is a known one', () => {
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
  // Both calls have to sit at the reveal itself, on the very next line -- an arm anywhere else in
  // the file would not prove it covers THIS reveal.
  assert.match(source, /target\.classList\.add\('active'\);\s*\n\s*armAllButtons\(target\);/);
  assert.match(source, /modal\.classList\.add\('active'\);\s*\n\s*armAllButtons\(modal\);/);
  // First paint is a transition too: #screen-menu ships `active` in markup and never passes
  // switchScreen, so it is armed once at startup.
  assert.match(source, /if \(firstScreen\) armAllButtons\(firstScreen\);/);
});

// The set of switchScreen destinations, derived from its OWN call sites rather than hand-listed --
// a new destination added anywhere in the file (a 4th screen, a renamed one) is picked up
// automatically. The player screen is not one of them: it is the shared screen's own root, opened
// through its own open(), never through switchScreen.
test('switchScreen is called with exactly the known set of destinations', () => {
  const calls = [...source.matchAll(/\bswitchScreen\('([A-Z]+)'\)/g)].map((m) => m[1]);
  assert.ok(calls.length > 0, 'no switchScreen(...) call sites found — this test would pass vacuously');
  const destinations = [...new Set(calls)].sort();
  assert.deepEqual(
    destinations,
    ['GAME', 'MENU', 'SETUP'],
    'switchScreen is now called with a destination this test does not know about — every one routes ' +
      'through the single `target` receiver armed above, but a screen-${x} id with no matching markup ' +
      'section fails silently at runtime, so a new destination still needs a human look.',
  );
});

// gh#187, owner ruling 2026-09-01: closing a modal IS a reveal ADR-0017 gates. Every modal on this
// route overlays the live surface and every dismissal goes through closeModal. Since gh#264 the live
// surface can be the player screen, which is not a `.screen` -- so a closer that re-armed only
// `.screen.active` would arm NOTHING when the rules sheet is closed over the player screen, and the
// second contact of a double-tap on its close button would land on a live seat-row control.
test('closeModal re-arms the surface the modal was covering, the player screen included', () => {
  const at = source.indexOf('closeModal(modalId) {');
  assert.ok(at > -1, 'closeModal is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n      }', at));
  assert.match(body, /querySelector\('\.screen\.active'\)/, 'closeModal no longer looks up the live screen');
  assert.match(body, /this\.playersRoot/, 'closeModal no longer falls back to the player screen root');
  assert.match(body, /armAllButtons\(screen\)/, 'closeModal no longer re-arms the live surface');
});

test('the shared player screen is mounted into #zt-players, inside the #app-container it arms', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('zt-players'\)/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  // Order only; that the root really sits INSIDE the container is proved by revealPathCases below,
  // whose header assertions red when the screen's closest('#app-container') misses.
  assert.ok(MARKUP.indexOf('id="app-container"') < MARKUP.indexOf('id="zt-players"'), '#zt-players must sit inside #app-container');
  // ADR-0071 ruling 1: the game's own intro comes first on this route -- the menu stays the screen a
  // load shows, and the player screen ships hidden until a menu button (or the chrome's edit
  // control) opens it.
  assert.match(MARKUP, /<section id="screen-menu" class="screen active">/, 'the menu is no longer the first screen');
  assert.match(MARKUP, /<section id="zt-players" class="zt-players" hidden>/, 'the player screen root must ship hidden');
});

// Both menu buttons lead to the player screen, never straight past it: a round only starts from
// the players the shared screen hands over.
test('both menu buttons open the player screen; neither starts a match or shows setup itself', () => {
  for (const id of ['btn-quick-start', 'btn-goto-setup']) {
    const at = source.indexOf(`getElementById('${id}')`);
    assert.ok(at > -1, `#${id} has no handler — this test measures nothing`);
    const handler = source.slice(at, source.indexOf('});', at));
    assert.match(handler, /this\.players\.open\(\)/, `#${id} no longer opens the player screen`);
    assert.doesNotMatch(handler, /startNewMatch|switchScreen/, `#${id} goes past the player screen`);
  }
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'zt-players', headerId: 'btn-audio-toggle', label: 'zero-trigger' });

// ---------------------------------------------------------------------------
// gh#188 box 13. This route takes the "state why a blanket re-enable is correct here" branch, and
// the statement is a count rather than a judgement: zero-trigger writes `disabled` on no control at
// all. Every button is enabled whenever it is on screen, so closeModal's armAllButtons over the live
// screen re-asserts exactly the state the route already holds — there is nothing to except.
//
// The reason this is a test and not a comment: that claim is true today and one render function away
// from false. A `disabled` write added anywhere in main.js fails here, and whoever adds it then owns
// the decision — the shared gate preserves a control already disabled when it was called
// (games/_arm-gate.ts, gh#188), but a control disabled DURING the window still needs the onArm hook.
test('gh#188 zero-trigger owns no button disabled state, so the arm window has nothing to preserve', () => {
  const writes = [...source.matchAll(/([\w.$'"()[\]-]+?)\.disabled\s*=/g)].map((m) => m[1]);
  const attrs = [...source.matchAll(/(?:set|toggle)Attribute\(\s*['"]disabled['"]/g)].map(() => 'setAttribute');
  assert.deepEqual(
    [...writes, ...attrs].sort(),
    [],
    'main.js now owns button disabled state. closeModal() and switchScreen() arm the whole live ' +
      'screen, so decide whether this control must survive the window: if the write happens BEFORE ' +
      'the arming call the gate already preserves it, and if it happens during the window pass an ' +
      'onArm callback that re-asserts it. Then record the answer in closeModal()\'s comment.',
  );
  // Positive control: the pattern must be able to see a write at all, or the empty result above
  // would mean nothing. The gate module has one.
  const gate = fs.readFileSync(path.join(import.meta.dirname, '../../games/_arm-gate.ts'), 'utf8');
  assert.ok(
    /\.disabled\s*=/.test(gate),
    'the disabled-write pattern found nothing in _arm-gate.ts either — the pattern is broken, not ' +
      'the route',
  );
});
