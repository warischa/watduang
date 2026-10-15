// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? cannon-flag did, and it stayed green while #test-modal was revealed with no arm two
// functions below an armed shot modal -- the gate counts calls per DIRECTORY, not per reveal, so an
// inconsistency inside ONE file was invisible to it. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just revealed.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- its game-screens, the shot modal, the test modal -- pinned by the
//      receiver each one writes to, with a recorded decision for every member. A new receiver fails
//      on the day it is added; a receiver that no longer exists fails too, because a stale EXPECTED
//      is how a pinning test keeps passing while the code it describes moves on.
//   2. The SHARED PLAYER SCREEN mounted into #cf-players, which replaced the mockup's setup screen,
//      its reset-names overlay and that overlay's arming paths. Its reveals are driven for real
//      (revealPathCases): the shared code over THIS route's markup.html with the real arm gate, read
//      off this route's own header control. A screen mounted outside #app-container, or one that
//      armed only its own root, leaves #btn-sound-toggle live and reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST. Two stated ceilings:
// (1) an inline reveal is recorded under its whole receiver expression, so it still surfaces as an
//     unexpected receiver and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. Only a real browser proves that, and this test claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { revealPathCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';

const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
const MAIN = path.join(import.meta.dirname, 'main.js');
// Whole-line comments are dropped: main.js documents its own reveal seams in prose, and a checker
// cannot tell use from mention. Only FULL-line comments go -- a trailing `//` inside a string would
// take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// Every write that can make a control visible: the `.active` class this route's CSS uses for both
// its game-screens and its two modals, and a direct display write. State classes written with other
// names (`danger`, `warning`, `charging`, `direct-hit`) are not in the set: they restyle a control
// that was already on screen, they do not put a new one under the finger.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  ['screenEl', 'showScreen(): the screen-to-screen path, pass-device/gameplay/results. Armed through armPanel.'],
  [
    'DOM.shotModalOverlay',
    'showShotResultModal(): lands on top of the FIRE button the player was just holding. Armed through armPanel.',
  ],
  [
    'DOM.testModal',
    'the #btn-open-tests handler: opened from the header, never through showScreen. Armed through armTestModal, on its own slot.',
  ],
]);

// Which wrapper each armed receiver must be named by. armPanel and armTestModal both end in
// armAllButtons; they differ only in which cancel slot they hold, and that difference is load-bearing
// (see the separate-slot test below), so it is asserted per receiver rather than flattened.
const MUST_BE_ARMED = new Map([
  ['screenEl', 'armPanel'],
  ['DOM.shotModalOverlay', 'armPanel'],
  ['DOM.testModal', 'armTestModal|armAllButtons'],
]);

test('every reveal receiver in cannon-flag/main.js is a known one', () => {
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

test('each armed reveal receiver has an arming call naming it', () => {
  for (const [receiver, wrappers] of MUST_BE_ARMED) {
    const name = receiver.replace(/\./g, '\\.');
    assert.match(
      source,
      new RegExp(`(?:${wrappers})\\([^)]*\\b${name}\\b`),
      `${receiver} is revealed but no arming call names it`,
    );
  }
  // The test modal's arm is written inside armTestModal, so the reveal site names the wrapper only.
  assert.match(source, /DOM\.testModal\.classList\.add\('active'\);\s*\n\s*armTestModal\(\);/);
});

// #test-modal must NOT share armPanel's slot. Its trigger #btn-open-tests sits in the header, outside
// every game-screen, so it is never gated: through the shared slot, a tap on it inside a screen's
// window would cancel that screen's pending arm, and the canceller does not re-enable. The setup
// screen's buttons would stay disabled with no control left that could call showScreen() again.
test('the test modal arms on its own slot, not the panel slot', () => {
  assert.match(source, /disarmTestModal = armAllButtons\(DOM\.testModal\)/);
  assert.doesNotMatch(source, /disarmActive = armAllButtons\(DOM\.testModal\)/);
});

// --- Half 2: the shared player screen (gh#264, ADR-0071) ---------------------------------------

test('the shared player screen is mounted into #cf-players, inside the #app-container it arms', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('cf-players'\);/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  const app = MARKUP.indexOf('id="app-container"');
  const root = MARKUP.indexOf('id="cf-players"');
  assert.ok(root > -1, 'markup.html has no #cf-players for the screen to mount into');
  assert.ok(app > -1 && app < root, '#cf-players must sit inside #app-container');
  assert.doesNotMatch(MARKUP, /class="game-screen active"/, 'no game screen may ship active over the player screen');
});

// The mount's hooks, by name: onStart is the handoff seat-cap-check runs, and abortRound/onOpen are
// the one function that puts a round away (below).
test('the mount hands over the named handoff and puts the round away on abort and on open', () => {
  const at = source.indexOf('mountPlayerScreen({');
  assert.ok(at > -1, 'main.js mounts no player screen');
  const call = source.slice(at, source.indexOf('});', at));
  assert.match(call, /range: game\.players,/);
  assert.match(call, /onStart: startWithPlayers,/);
  assert.match(call, /roundActive,/);
  assert.match(call, /abortRound: putAwayRound,/);
  assert.match(call, /onOpen: putAwayRound,/);
});

// ADR-0071 ruling 6 / ADR-0008: confirming the mid-round edit ENDS the round. Here a round outlives
// its screens three ways -- the aim timer interval, the ball's rAF flight, and the 700ms timeout that
// lands the shot modal -- so hiding the screens alone would let a shot already in flight pop its
// result modal over the player screen and record a shot for a match that is gone.
test('putting a round away stops its timer and fences off a shot already in flight', () => {
  const body = sliceBlock(source, 'function putAwayRound()');
  assert.ok(body, 'putAwayRound is gone — this test measures nothing');
  assert.match(body, /roundSeq \+= 1;/, 'the round token is not advanced, so a shot in flight still lands');
  assert.match(body, /clearInterval\(aimTimerInterval\);/, 'the aim timer keeps running under the player screen');
  assert.match(body, /isAimingLocked = true;/, 'a held FIRE released later still fires');
  assert.match(body, /DOM\.shotModalOverlay\.classList\.remove\('active'\);/);
  assert.match(body, /showScreen\(null\);/);
  const shot = sliceBlock(source, 'function executeShot()');
  assert.ok(shot, 'executeShot is gone — this test measures nothing');
  assert.match(shot, /const seq = roundSeq;/);
  assert.match(sliceBlock(shot, 'function animBall()'), /if \(seq !== roundSeq\)/, 'the flight does not check the round token');
  const impact = sliceBlock(source, 'function handleShotImpact(simResult)');
  assert.ok(impact, 'handleShotImpact is gone — this test measures nothing');
  assert.match(impact, /const seq = roundSeq;/);
  assert.match(impact, /setTimeout\(\(\) => \{\s*if \(seq === roundSeq\) showShotResultModal\(simResult\);/, 'the 700ms modal timeout does not check the round token');
});

// Every way back to the player screen goes through the shared screen. The results screen's own
// "new setup" button sends the same request the chrome's edit control sends, so the one rule in
// roundActive decides whether to ask: a decided match opens straight away, a tie still owed its
// sudden death asks first (ADR-0008), instead of being dropped silently as the mockup's setup did.
test('results "new setup" requests the player screen, never a bare screen swap', () => {
  const at = source.indexOf('DOM.btnNewSetup.addEventListener');
  assert.ok(at > -1, '#btn-new-setup lost its handler');
  const body = source.slice(at, source.indexOf('});', at));
  assert.match(body, /document\.dispatchEvent\(new CustomEvent\(EDIT_EVENT\)\)/);
  assert.doesNotMatch(body, /showScreen\(/);
  const live = sliceBlock(source, 'function roundActive()');
  assert.ok(live, 'roundActive is gone — this test measures nothing');
  assert.match(live, /screenPassDevice/);
  assert.match(live, /screenGameplay/);
  assert.match(live, /btn-start-sudden-death/, 'a tie still owed its sudden death is not counted as a live round');
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'cf-players', headerId: 'btn-sound-toggle', label: 'cannon-flag' });

