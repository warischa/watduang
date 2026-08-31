// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? cannon-flag did, and it stayed green while #test-modal was revealed with no arm two
// functions below an armed shot modal -- the gate counts calls per DIRECTORY, not per reveal, so an
// inconsistency inside ONE file was invisible to it. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just revealed.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to, with a recorded decision for every member. A fourth receiver -- a new modal, a new
// panel toggled by display -- fails this test on the day it is added, and whoever adds it decides
// whether it needs a call and records that here. A receiver that no longer exists fails it too: a
// stale EXPECTED is how a pinning test keeps passing while the code it describes moves on.
//
// ponytail: matched on source text, not on a parsed AST. Two stated ceilings:
// (1) an inline reveal is recorded under its whole receiver expression, so it still surfaces as an
//     unexpected receiver and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. Only a real browser proves that, and this test claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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
  ['screenEl', 'showScreen(): the screen-to-screen path, setup/pass-device/gameplay/results. Armed through armPanel.'],
  [
    'DOM.shotModalOverlay',
    'showShotResultModal(): lands on top of the FIRE button the player was just holding. Armed through armPanel.',
  ],
  [
    'DOM.testModal',
    'the #btn-open-tests handler: opened from the header, never through showScreen. Armed through armTestModal, on its own slot.',
  ],
  [
    'DOM.resetNamesConfirm',
    'gh#175/ADR-0054. #btn-reset-names sits inside #screen-setup, same as the FIRE button sits inside ' +
      '#screen-gameplay before shotModalOverlay lands on top of it, so this reveal reuses the shared ' +
      'armPanel slot the same way. Armed through armPanel.',
  ],
]);

// Which wrapper each armed receiver must be named by. armPanel and armTestModal both end in
// armAllButtons; they differ only in which cancel slot they hold, and that difference is load-bearing
// (see the separate-slot test below), so it is asserted per receiver rather than flattened.
const MUST_BE_ARMED = new Map([
  ['screenEl', 'armPanel'],
  ['DOM.shotModalOverlay', 'armPanel'],
  ['DOM.testModal', 'armTestModal|armAllButtons'],
  ['DOM.resetNamesConfirm', 'armPanel'],
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
  // First paint is a transition too: #screen-setup ships `active` in markup and never passes
  // showScreen, so it is armed once at startup.
  assert.match(source, /armPanel\(DOM\.screenSetup\)/);
});

// #test-modal must NOT share armPanel's slot. Its trigger #btn-open-tests sits in the header, outside
// every game-screen, so it is never gated: through the shared slot, a tap on it inside a screen's
// window would cancel that screen's pending arm, and the canceller does not re-enable. The setup
// screen's buttons would stay disabled with no control left that could call showScreen() again.
test('the test modal arms on its own slot, not the panel slot', () => {
  assert.match(source, /disarmTestModal = armAllButtons\(DOM\.testModal\)/);
  assert.doesNotMatch(source, /disarmActive = armAllButtons\(DOM\.testModal\)/);
});

// gh#175. The reset control overwrites every typed name, so it asks first. "Opened through armPanel"
// alone (asserted above, generically, for every receiver in EXPECTED) would not catch a reset wired
// to run before the question is answered, so the wipe itself gets its own pinning here.
test('the reset-names confirm is opened through the arming path, and the wipe hangs off the confirm button', () => {
  assert.match(
    source,
    /DOM\.btnResetNames\.addEventListener\('click', \(\) => \{[\s\S]{0,240}?armPanel\(DOM\.resetNamesConfirm\)/,
    '#btn-reset-names must reveal its confirm through armPanel — a raw classList.add with no arm ' +
      'leaves two fresh buttons under the finger with no ghost-tap window',
  );
  assert.match(
    source,
    /DOM\.btnConfirmResetNames\.addEventListener\('click',[\s\S]{0,240}?resetPlayerNames\(/,
    'the wipe must hang off the confirm button, never off the trigger',
  );
  assert.doesNotMatch(
    source,
    /DOM\.btnResetNames\.addEventListener\('click', \(\) => \{[\s\S]{0,240}?resetPlayerNames\(/,
    'the trigger itself calls resetPlayerNames — the confirm would be asking about work already done',
  );
});

// Found by adversarial review, 2026-08-31, and invisible to every assertion above: CLOSING the
// overlay is a reveal too. #btn-start-match sits behind it, enabled, its own 400ms window long
// expired -- and that expiry is exactly why a second contact activates it. The rebuild is not the
// hazard, the reveal is. Pinned on the shared closer so all three branches stay covered by one call.
test('closing the reset overlay re-arms the setup screen behind it', () => {
  assert.match(
    source,
    /resetNamesConfirm\.classList\.remove\('active'\);[\s\S]{0,120}?armPanel\(DOM\.screenSetup\);/,
    'closeResetNamesConfirm no longer arms #screen-setup: a double-tap on close, cancel or confirm ' +
      'puts the second contact on #btn-start-match and begins the match with the phone unpassed',
  );
});
