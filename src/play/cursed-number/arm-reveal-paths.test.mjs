// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? It counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger -- and since ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- its screens, the rules modal, the input-mode panels -- pinned by the
//      receiver each one writes to, on source text. A new receiver fails on the day it is added.
//   2. The SHARED PLAYER SCREEN mounted into #cnPlayers, which replaced the mockup's setup, its
//      reset-names modal and that modal's three arming paths. Its reveals are driven for real
//      (revealPathCases): the shared code over THIS route's markup.html with the real arm gate,
//      read off this route's own header control. A screen mounted outside #app, or one that armed
//      only its own root, leaves #soundToggleBtn live and reds here.
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
// Whole-line comments are dropped: the header comment of main.js DOCUMENTS the reveal paths, and a
// checker cannot tell use from mention.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// Every write that can make a control visible or change which control is the live one.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  ['target', 'showScreen(): the screen-to-screen path. Armed on the line below the reveal.'],
  ['modal', 'the rulesBtn handler: #rulesModal, 2 buttons, never passes showScreen. Armed.'],
  ['sliderCont', 'setInputMode(): 9 step buttons revealed inside a screen already up. Armed.'],
  ['keypadCont', 'setInputMode(): 12 keys revealed inside a screen already up. Armed.'],
  ['sliderTab', 'NOT a reveal: an .active state class on a tab button that was already visible.'],
  ['keypadTab', 'NOT a reveal: an .active state class on a tab button that was already visible.'],
  ['customInput', 'NOT a button reveal: #customPenaltyInput is a text input, nothing to ghost-tap.'],
  ['penaltyBox', 'NOT a button reveal: #penaltyResultBox holds a label and a text div, no button.'],
]);

test('every reveal receiver in cursed-number/main.js is a known one', () => {
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
  for (const receiver of ['modal', 'sliderCont', 'keypadCont']) {
    assert.match(
      source,
      new RegExp(`armAllButtons\\([^)]*\\b${receiver}\\b`),
      `${receiver} is revealed but no armAllButtons call names it`,
    );
  }
  assert.match(source, /target\.classList\.add\('active'\);\s*\n\s*armAllButtons\(target\);/);
});

// gh#187: closing a modal IS a reveal. While the player screen is up, the live screen IS the player
// screen's root, so the closer must re-arm whatever currentScreen names -- the player root included.
test('closing the rules modal re-arms the live screen behind it, the player screen included', () => {
  const at = source.indexOf('const closeRules');
  assert.ok(at > -1, 'closeRules is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('};', at));
  assert.match(body, /armAllButtons\(screen\)/, 'closeRules no longer re-arms the live screen');
  assert.match(body, /getElementById\(this\.currentScreen\)/, 're-arm target is no longer the live screen');
  assert.match(source, /this\.currentScreen = 'cnPlayers';/, 'the player screen no longer registers as the live screen');
});

test('the shared player screen is mounted into #cnPlayers, inside the #app it arms', () => {
  assert.match(source, /getElementById\('cnPlayers'\)/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  assert.ok(MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="cnPlayers"'), '#cnPlayers must sit inside #app');
  assert.doesNotMatch(MARKUP, /class="screen active"/, 'no game screen may ship active over the player screen');
});

// Every way back to the player screen goes through the shared screen: the house icon asks first
// when a round is live (the request the chrome's edit control sends), the game-over edit opens it.
test('the house icon and the game-over edit both reach the player screen, never a bare screen swap', () => {
  const home = source.slice(source.indexOf("getElementById('homeResetBtn')"));
  assert.match(home.slice(0, home.indexOf('});')), /dispatchEvent\(new CustomEvent\(EDIT_EVENT\)\)/);
  const edit = source.slice(source.indexOf("getElementById('editPlayersBtn')"));
  assert.match(edit.slice(0, edit.indexOf('});')), /this\.players\.open\(\)/);
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'cnPlayers', headerId: 'soundToggleBtn', label: 'cursed-number' });
