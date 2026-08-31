// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for freeze-tap.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? freeze-tap does, through its armPanel() wrapper -- and the gate would stay green with every
// call but one deleted. It counts calls per DIRECTORY, not per reveal, so it cannot know this route
// reveals controls on more than one path. The real rule (ADR-0017) is per reveal: the second contact
// of a double-tap must not land on a control the first contact just put under the finger.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to. A sixth receiver -- a new modal, a new container swapped by innerHTML -- fails this test
// on the day it is added, and whoever adds it decides whether it needs a call and records that here.
//
// ponytail: matched on source text, not on a parsed AST. Two stated ceilings:
// (1) full-line comments are stripped before matching, because prose about a reveal is not a reveal
//     and a checker cannot tell use from mention. Only full-line ones: a trailing `//` inside a
//     template string would take real code with it, and nothing here needs that;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. Only scripts/arm-gate-probe.mjs in a real browser proves that, and this
//     test claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MAIN = path.join(import.meta.dirname, 'main.js');
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
    'renderApp(): the one screen-to-screen path, every game screen including setup. Armed on the ' +
      'last line of renderApp(), after the switch has drawn whichever screen the state selects, so ' +
      'one call covers all eight. The count steppers are passed as the except list.',
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
  [
    'resetNamesModal',
    'gh#177 — the confirm guarding #resetNamesBtn (inside renderSetupScreen, distinct from the ' +
      'non-destructive #resetAppBtn). Revealed and armed together in the same handler.',
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
  for (const receiver of ['mainContent', 'modal', 'testModal', 'resetNamesModal']) {
    assert.match(
      source,
      new RegExp(`armPanel\\([^)]*\\b${receiver}\\b`),
      `${receiver} is revealed but no armPanel call names it`,
    );
  }
});

// The setup screen is the one that was deliberately left ungated, and the guard that skipped it was
// a state test in renderApp(). Pin its absence: this is the exact line whose return would silently
// un-arm eight controls again while both tests above stayed green.
test('renderApp arms unconditionally — no screen is excepted by state', () => {
  assert.doesNotMatch(
    source,
    /if\s*\([^)]*GameState\.SETUP[^)]*\)\s*armPanel/,
    'renderApp() is skipping armPanel for a state again; ADR-0017 applies to setup too, and ' +
      'roster-bridge.ts drive() is what makes seeding survive it.',
  );
  assert.match(source, /^\s*armPanel\(mainContent, rapidTapControls\(\)\);$/m);
});
