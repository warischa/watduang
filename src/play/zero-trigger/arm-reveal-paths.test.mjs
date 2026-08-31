// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? zero-trigger does, three times -- and the gate would stay green with two of those three
// deleted. It counts calls per DIRECTORY, not per reveal, so it has no way to know that this route
// puts controls under the finger on three separate paths. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just revealed.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to, with a recorded decision for every member. A fifth receiver -- a new modal, a new panel
// toggled by display -- fails this test on the day it is added, and whoever adds it decides whether
// it needs a call and records that here. A receiver that no longer exists fails it too: a stale
// EXPECTED is how a pinning test keeps passing while the code it describes moves on.
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
    'openModal(): shared by modal-rules, modal-avatar-picker, modal-result and the gh#177 reset ' +
      'confirm modal-reset-cast. Armed on the line below the reveal.',
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
// `grep -n "switchScreen('" src/play/zero-trigger/main.js` is the command this enumerates, and a new
// destination added anywhere in the file (a 4th screen, a renamed one) is picked up automatically.
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

// The reveal REVEAL_RE cannot see at all: renderPlayerRoster() rebuilds #player-roster-container
// through innerHTML on every addNewPlayer/removePlayer/selectAvatar call, and each rebuilt row ships
// a fresh .avatar-btn and (when the roster has more than 2 players) a fresh .remove-player-btn -- one
// of them lands at the coordinates of the button the player just pressed. Unlike wire-snip-panic's
// renderSetupPlayerList (the same shape, and armed), renderPlayerRoster here never calls
// armAllButtons on the container it rebuilds. Fixed in the same session this file was written; the
// assertion stays as the pin, because nothing else in the fleet can see this reveal.
test('renderPlayerRoster arms the container it rebuilds', () => {
  assert.match(source, /armAllButtons\(container\)/);
});

// gh#177 adds a FIFTH way into that rebuild, and it is the worst-placed one: the reset confirm closes
// the modal that was covering the roster and redraws every row underneath it, so the second contact of
// a double-tap on the confirm lands on a freshly built .avatar-btn at almost the same coordinates --
// the short-stick bug (eb9891f), one route over. The arming that covers it lives inside
// renderPlayerRoster (pinned above); what is pinned HERE is that the confirm still goes through
// renderPlayerRoster rather than touching the DOM some other way, because the day it stops, the arming
// above is still green and covers nothing on this path.
test('the reset confirm redraws through the armed renderPlayerRoster', () => {
  const handler = source.slice(source.indexOf("getElementById('btn-confirm-reset-cast')"));
  const upToEnd = handler.slice(0, handler.indexOf('});'));
  assert.ok(upToEnd.length > 0, 'the reset confirm handler was not found -- this test is vacuous');
  assert.match(
    upToEnd,
    /this\.renderPlayerRoster\(\)/,
    'the reset confirm rebuilds the roster without going through renderPlayerRoster, so nothing arms ' +
      'the rows it puts back under the finger that just confirmed',
  );
});
