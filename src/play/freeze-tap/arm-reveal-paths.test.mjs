// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for freeze-tap.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? freeze-tap does, through its armPanel() wrapper -- and the gate would stay green with every
// call but one deleted. It counts calls per DIRECTORY, not per reveal, so it cannot know this route
// reveals controls on more than one path. The real rule (ADR-0017) is per reveal: the second contact
// of a double-tap must not land on a control the first contact just put under the finger -- and
// since ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- the game screens swapped into #mainContent and its overlays -- pinned
//      by the receiver each one writes to, on source text. A new receiver fails on the day it is added.
//   2. The SHARED PLAYER SCREEN mounted into #ftPlayers, which replaced the mockup's setup screen, its
//      reset-names modal and that modal's arming paths. Its reveals are driven for real
//      (revealPathCases): the shared code over THIS route's markup.html with the real arm gate, read
//      off this route's own header control. A screen mounted outside #app, or one that armed only its
//      own root, leaves #soundToggleBtn live and reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST. Full-line comments are stripped
// first, because prose about a reveal is not a reveal; and this proves the CALL SITE exists next to
// the reveal, never the browser-level 400ms (owner ruling on issue #232).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { revealPathCases } from '../_player-screen/screen-harness.mjs';

const MAIN = path.join(import.meta.dirname, 'main.js');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// The two ways a control becomes visible on this route: a container's markup is replaced wholesale,
// or an overlay that ships `display: none` is switched on. Hiding writes are not reveals and are not
// matched.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:innerHTML\s*=|style\.display\s*=\s*['"](?:block|flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'mainContent',
    'renderApp(): the one screen-to-screen path, every game screen. Armed on the last line of ' +
      'renderApp(), after the switch has drawn whichever screen the state selects, so one call ' +
      'covers all of them. No except list: the count steppers it used to spare went with the setup.',
  ],
  [
    'modal',
    '#interruptionModal, revealed by the visibilitychange and blur handlers. One button ' +
      '(#resumeTurnBtn) and it never passes through renderApp(). Armed at both reveal sites.',
  ],
  [
    'testModal',
    'the in-app test runner, revealed by #testRunnerOpenBtn. Armed. Note overrides.css hides both ' +
      'the opener and the modal with display:none !important, so no player can reach this path — ' +
      'it stays armed anyway, because the arming is one line and the hiding is one stylesheet away.',
  ],
  [
    'targetEl',
    'NOT a button reveal: the play surface writes two <span>s into it, the decoy and the live ' +
      'target. Arming it would also be wrong — the tap it takes is the game.',
  ],
  [
    'testResultsList',
    'NOT a button reveal: rows of <div>/<span>/<strong> inside #testModal, which is already armed ' +
      'at its own reveal.',
  ],
]);

test('every reveal receiver in freeze-tap/main.js is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, call armPanel on the revealed element if it does, and add it to EXPECTED with the ' +
      'reason. The arm-gate CI check will not tell you — it is already green.',
  );
  // The other direction: an entry that no longer matches anything is a stale decision, and a stale
  // EXPECTED is how this test would keep passing while the code it describes moved on.
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('each armed reveal receiver has an armPanel call naming it', () => {
  for (const receiver of ['mainContent', 'modal', 'testModal']) {
    assert.match(
      source,
      new RegExp(`armPanel\\([^)]*\\b${receiver}\\b`),
      `${receiver} is revealed but no armPanel call names it`,
    );
  }
});

// The setup screen was once deliberately left ungated by a state test in renderApp(). Pin its
// absence, and pin that the one call left arms the whole container with nothing excepted.
test('renderApp arms unconditionally — no screen is excepted by state', () => {
  assert.doesNotMatch(
    source,
    /if\s*\([^)]*GameState\.[A-Z_]+[^)]*\)\s*armPanel/,
    'renderApp() is skipping armPanel for a state again; ADR-0017 applies to every screen',
  );
  assert.match(source, /^\s*armPanel\(mainContent\);$/m);
});

test('the shared player screen is mounted into #ftPlayers, inside the #app it arms', () => {
  assert.match(source, /getElementById\('ftPlayers'\)/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  assert.ok(MARKUP.indexOf('id="app"') > -1 && MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="ftPlayers"'),
    '#ftPlayers must sit inside #app');
  assert.doesNotMatch(source, /renderSetupScreen|rapidTapControls|resetNamesModal/, 'a piece of the old setup survives');
  assert.doesNotMatch(MARKUP, /id="resetNamesModal"|id="decPlayerBtn"|id="startGameBtn"/, 'old setup markup survives');
});

// Every way back to the player screen goes through the shared screen: the header reset asks first
// when a round is live (the same request the chrome's edit control sends), the game-over edit opens
// it, and the SETUP state itself is the player screen.
test('the header reset, the game-over edit and the SETUP state all reach the player screen', () => {
  const reset = source.slice(source.indexOf("resetAppBtn.addEventListener('click'"));
  assert.match(reset.slice(0, reset.indexOf('});')), /dispatchEvent\(new CustomEvent\(EDIT_EVENT\)\)/);
  const edit = source.slice(source.indexOf("getElementById('editPlayersBtn').onclick"));
  assert.match(edit.slice(0, edit.indexOf('};')), /playerScreen\.open\(\)/);
  const setupCase = source.slice(source.indexOf('case GameState.SETUP:'));
  assert.match(setupCase.slice(0, setupCase.indexOf('break;')), /playerScreen\.open\(\)/);
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'ftPlayers', headerId: 'soundToggleBtn', label: 'freeze-tap' });
