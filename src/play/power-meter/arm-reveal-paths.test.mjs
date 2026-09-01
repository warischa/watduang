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
    'openModal(): #help-modal and #tests-modal from the header icons, plus gh#175 #reset-names-modal ' +
      'from the setup-names view -- none go through renderUI(). Armed on its OWN slot.',
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

// gh#175. The reset control overwrites every typed name, so it asks first -- and the confirm it
// opens is itself a fresh pair of buttons appearing under the finger that just pressed reset. Both
// halves are pinned: the trigger reaches the modal only through openModal (which arms), and the
// wipe hangs off the confirm button, never the trigger.
test('the reset-names modal is opened through the arming path', () => {
  assert.match(
    source,
    /openResetNamesModal = \(\) => openModal\('reset-names-modal'\)/,
    '#btn-reset-names must open its confirm through openModal — a raw classList.add reveals two ' +
      'buttons with no ghost-tap window',
  );
  // The wipe hangs off the confirm button, never off the trigger: a reset that ran before the
  // question was answered would make the confirm decorative.
  assert.match(source, /confirmResetNames = \(\) => \{[\s\S]{0,240}?resetPlayerNames\(\)/);
});

// Found by adversarial review of gh#174, the pattern this ticket copies: the CLOSING of a reset
// confirm is a reveal too, because the redraw rebuilds #view-root's name inputs through innerHTML.
// Unlike short-stick, this route already centralises its re-arm inside renderUI() -- every state
// change calls armRenderedView() once, after the switch (pinned above) -- so the guard here is that
// the confirm routes its redraw through that same renderUI(), rather than a bespoke re-render that
// would skip it and leave the rebuilt inputs live under a double-tap on the confirm.
test('the reset confirm redraws through renderUI(), which re-arms the view it rebuilds', () => {
  assert.match(
    source,
    /confirmResetNames = \(\) => \{[\s\S]{0,320}?resetPlayerNames\(\);[\s\S]{0,120}?renderUI\(\);/,
    'confirmResetNames must call renderUI() after resetPlayerNames() — a bare re-render of the name ' +
      'inputs would rebuild them live under the finger that just confirmed',
  );
});

// gh#187, owner ruling 2026-09-01: closing a modal IS a reveal ADR-0017 gates, on its own, with no
// rebuild involved. The test above only covers the confirm branch; #btn-close-help and every cancel
// rebuild nothing, so they stayed green while the view under the card sat live. REVEAL_RE cannot see
// a closer either -- it matches writes that SHOW. This is the only pin on that path.
test('closeModal re-arms the view the modal was covering', () => {
  const at = source.indexOf('function closeModal(');
  assert.ok(at > -1, 'closeModal is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n    }', at));
  assert.match(
    body,
    /armRenderedView\(\)/,
    'closeModal no longer re-arms #view-root: a double-tap on any close or cancel control puts the ' +
      'second contact on whatever view button sits behind the card, its own arm window long expired',
  );
});
