// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? power-meter did, from armRenderedView(), and stayed green for the whole time openModal()
// revealed two modals with no arm at all -- the gate counts calls per DIRECTORY, not per reveal. The
// real rule (ADR-0017) is per reveal: the second contact of a double-tap must not land on a control
// the first contact just put under the finger.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to, with a recorded decision for every member. A third receiver -- a new modal, a new panel
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
// modals, the `.show` class its toast uses, and a direct display write. `show` is in the set on
// purpose -- a pattern that did not know this route's second visibility class would call that reveal
// nonexistent rather than classify it.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"](?:active|show)['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'modal',
    'openModal(): #help-modal and #tests-modal, opened straight from the header icons, never through renderUI(). Armed on its OWN slot.',
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
// place that arms them, deliberately after the switch rather than inside each of the eight builders.
test('renderUI arms the view it just drew', () => {
  assert.match(source, /function armRenderedView\(\) \{[\s\S]*?armAllButtons\(viewRoot/);
  assert.match(source, /armRenderedView\(\);\s*\n\s*\}\s*\n/);
});
