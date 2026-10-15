// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? how-close-is-near did, from render(), and stayed green while #testModal -- a SIBLING of the
// #screenContainer that call walks -- was revealed with no arm reaching it. The gate counts calls per
// DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the second contact of a
// double-tap must not land on a control the first contact just put under the finger -- and since
// ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- render()'s rebuild of #screenContainer, the test modal, the rejection
//      banner -- pinned by the receiver each one writes to, on source text. A new receiver fails on
//      the day it is added, and a receiver that no longer exists fails too: a stale EXPECTED is how a
//      pinning test keeps passing while the code it describes moves on.
//   2. The SHARED PLAYER SCREEN mounted into #hcPlayers, which replaced the mockup's count and names
//      screens, its reset-names modal and that modal's arming paths. Its reveals are driven for real
//      (revealPathCases): the shared code over THIS route's markup.html with the real arm gate, read
//      off this route's own header control. A screen mounted outside #appRoot, or one that armed only
//      its own root, leaves #btnAudioToggle live and reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST. Two stated ceilings:
// (1) an inline reveal is recorded under its whole receiver expression, so it still surfaces as an
//     unexpected receiver and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. Half 2 runs the real gate; half 1 claims nothing about it.
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

// Every write that can make a control visible: a direct display write, which is how this route
// reveals its modal and its rejection banner, plus the `.active` class the rest of the fleet uses --
// included so a screen added in the fleet's idiom cannot land here unclassified. The `selected` class
// the mode cards take is NOT in the set: it restyles a control that was already on screen.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'testModal',
    'the #btnTestRunner handler: #testModal is a SIBLING of #screenContainer, so render() armAllButtons(container) never walks into it. Armed at the reveal.',
  ],
  [
    'banner',
    'NOT a button reveal: #rejectionBanner is a role="alert" text strip inside the number-entry card, and it holds no control.',
  ],
]);

const MUST_BE_ARMED = ['testModal'];

test('every reveal receiver in how-close-is-near/main.js is a known one', () => {
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
      new RegExp(`armAllButtons\\([^)]*\\b${receiver.replace(/\./g, '\\.')}\\b`),
      `${receiver} is revealed but no armAllButtons call names it`,
    );
  }
  // The arm has to sit at the reveal itself: the modal is outside the container render() arms, so a
  // call anywhere else in the file would not cover this path.
  assert.match(source, /testModal\.style\.display = 'flex';\s*\n\s*armAllButtons\(testModal\);/);
});

// The reveal REVEAL_RE cannot see at all: render() empties #screenContainer and rebuilds the whole
// screen, so a fresh control lands at the coordinates of the one just pressed. The arm is written
// once after the switch, not inside each screen builder.
test('render arms the container it just rebuilt', () => {
  assert.match(source, /armAllButtons\(container\);\s*\n\s*\}/);
});

test('the shared player screen is mounted into #hcPlayers, inside the #appRoot it arms', () => {
  assert.match(source, /getElementById\('hcPlayers'\)/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  const appRoot = MARKUP.indexOf('id="appRoot"');
  const players = MARKUP.indexOf('id="hcPlayers"');
  assert.ok(appRoot > -1 && players > appRoot, '#hcPlayers must sit inside #appRoot');
  // render() empties #screenContainer on every screen change: a root inside it would be wiped.
  assert.ok(players < MARKUP.indexOf('id="screenContainer"'), '#hcPlayers must be a sibling of #screenContainer, never inside it');
  // The mockup's own setup is gone, not hidden: no count chip, no name field, no reset of its own.
  assert.doesNotMatch(source, /count-chip|player-text-input|btnResetNames|resetNamesModal/);
});

// Every way back to the players goes through the shared screen: the lose-condition screen's back
// button and the results screen's new-setup button both open it. Neither is a live round, so the
// screen opens straight away (ADR-0071 ruling 6) -- never a bare state swap to a setup that is gone.
test('the lose-condition back and the results new-setup both open the shared player screen', () => {
  for (const id of ['#btnBackToNames', '#btnNewSetup']) {
    const at = source.indexOf(`querySelector('${id}').onclick`);
    assert.ok(at > -1, `${id} has no handler — this test measures nothing`);
    const body = source.slice(at, source.indexOf('};', at));
    assert.match(body, /playerScreen\.open\(\)/, `${id} no longer opens the shared player screen`);
    assert.doesNotMatch(body, /PLAYER_COUNT|PLAYER_NAMES/, `${id} swaps to a setup state that no longer exists`);
  }
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'hcPlayers', headerId: 'btnAudioToggle', label: 'how-close-is-near' });
