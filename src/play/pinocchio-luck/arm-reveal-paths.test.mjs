// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for pinocchio-luck.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? pinocchio-luck does, through its armPanel() wrapper -- and the gate would stay green with
// every screen but one left ungated. It counts calls per DIRECTORY, not per reveal. The real rule
// (ADR-0017) is per reveal: the second contact of a double-tap must not land on a control the first
// contact just put under the finger.
//
// So the first two tests do not re-check the gate. They pin the SET of reveal sites by the receiver
// each one writes to; a second receiver -- a modal, an overlay switched on by display -- fails on
// the day it is added, and whoever adds it decides whether it needs a call and records that here.
//
// The last two tests are behavioural, not textual: they drive the real shared gate against a fake
// DOM to pin the property this route is the only one to need -- #start stays disabled at an invalid
// player count EVEN AFTER the arm window closes -- and they include the naive leg (arming with no
// re-validation) so the green is one that has been seen red.
//
// ponytail: the textual half matches source text, not a parsed AST. Two stated ceilings:
// (1) full-line comments are stripped from main.js before matching, because prose about a reveal is
//     not a reveal and a checker cannot tell use from mention. This file's own header is not
//     scanned at all -- only main.js is -- but main.js's comments do describe its reveals, so the
//     strip is load-bearing there. Only full-line comments go: a trailing `//` inside a template
//     string would take real code with it, and nothing here needs that;
// (2) the textual half proves the CALL SITE exists next to the reveal, never that the 400ms window
//     really disables anything in a browser. Only scripts/arm-gate-probe.mjs proves that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { armAllButtons, ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { FakeElement } from '../../games/_fake-dom.mjs';

const MAIN = path.join(import.meta.dirname, 'main.js');
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// The three ways a control becomes visible on this route: a container's markup is replaced
// wholesale, an element that ships hidden is switched on, or a <dialog> is opened. Hiding writes and
// .close() are not reveals and are not matched.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:innerHTML\s*=|style\.display\s*=\s*['"](?:block|flex)['"]|showModal\(\))/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'panel',
    'the only innerHTML reveal receiver on this route: every screen, setup included, is mounted by ' +
      "replacing #panel's markup. render() arms it on its last line for the six in-game screens, and " +
      'renderSetup() arms it itself for setup -- three of setup\'s four reveal sites (setSetupCount, ' +
      'editNames, module init) never pass through render(), so an arm placed in render() alone ' +
      'would have covered only the fourth.',
  ],
  [
    'dlg',
    'gh#179. openResetNames() showModal()s the reset-names confirm -- a fresh pair of buttons ' +
      'appearing directly under the finger that just tapped the trigger. Armed inside ' +
      'openResetNames(), scoped to the dialog rather than the whole panel.',
  ],
]);

test('every reveal receiver in pinocchio-luck/main.js is a known one', () => {
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

// Setup was the last deliberately-unarmed screen on the site. These are the exact lines whose loss
// would un-arm it again while the test above stayed green.
test('setup arms itself, and hands validateCount to the gate as the re-validation hook', () => {
  assert.match(source, /panel\.innerHTML=setupMarkup\(\);\s*\n\s*validateCount\(\);\s*\n\s*armPanel\(countSteppers\(\),validateCount\);/);
  // armPanel must forward both, or the arguments above are silently dropped.
  assert.match(source, /function armPanel\(except=\[\],onArm\)\{[\s\S]*?armAllButtons\(panel,except,onArm\)/);
  // The except list is the two rapid-tap steppers and nothing else — #start must never join it.
  assert.match(source, /function countSteppers\(\)\{\s*\n\s*return \[document\.querySelector\('#minus'\),document\.querySelector\('#plus'\)\]\.filter\(Boolean\);/);
  // render()'s own arm, for the six screens that do go through it: no except list, no hook.
  assert.match(source, /^\s*armPanel\(\);$/m);
});

/** A setup panel as renderSetup() leaves it: #start owned by the validator, one plain button that
 *  nothing but the gate owns, and the two rapid-tap steppers renderSetup() excepts. `validate` is
 *  validateCount()'s one load-bearing line. */
function setupPanel(count) {
  // Children appended rather than written through innerHTML: the fake's querySelector matches `#id`
  // against a node property this fake never sets from markup, so a markup build would hand back
  // null and the whole test would pass on nothing.
  const panel = new FakeElement('div');
  const start = panel.appendChild(new FakeElement('button'));
  const other = panel.appendChild(new FakeElement('button'));
  const minus = panel.appendChild(new FakeElement('button'));
  const plus = panel.appendChild(new FakeElement('button'));
  const validate = () => {
    start.disabled = !(count >= 2 && count <= 10);
  };
  validate();
  // gh#188: the count must be able to change WHILE the window is open. That is what the excepted
  // #minus/#plus do on the real route -- they stay live through the window by design -- and it is the
  // one hazard the gate's own snapshot cannot see, so it is what the naive leg below reproduces.
  const step = (to) => {
    count = to;
    validate();
  };
  return { panel, start, other, steppers: [minus, plus], validate, step };
}

test('#start stays disabled at an invalid count after the arm window closes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  // The naive implementation this route shipped against: arm with no re-validation. Kept as the
  // must-red leg — without it the assertion below is a green nobody has seen fail.
  //
  // gh#188 RESTATED, and the restatement is the point. This leg used to arm an ALREADY-disabled
  // #start (count 1 from construction) and rely on the gate's blanket re-enable to force it live.
  // The gate no longer re-enables a control that was disabled when it was called, so that scenario
  // stopped reproducing anything and the leg became a control that could not fire. It is NOT retired,
  // because the hazard it guards is still live — it moved. The snapshot is taken at construction, so
  // what it cannot see is the count going invalid DURING the window: #start is enabled and gateable
  // at the arm call, the player taps the excepted #minus (live by design, which is what makes this
  // reachable rather than hypothetical), and when the window closes the gate hands #start back
  // enabled from a snapshot that is now stale. onArm is the only thing that re-asserts the validator.
  const naive = setupPanel(2);
  armAllButtons(naive.panel, naive.steppers);
  naive.step(1);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(naive.start.disabled, false, 'naive leg no longer reproduces the bug — this test is no longer calibrated');
  // Second half of the same control, and it is what stops the leg passing for the wrong reason: a
  // #start left enabled is only a BUG if the count behind it is invalid. Re-running the validator
  // must flip it — if it does not, the re-enable above was legitimate and reproduced nothing.
  naive.validate();
  assert.equal(
    naive.start.disabled,
    true,
    'naive leg is enabled at a VALID count — the re-enable it observed was legitimate, so the leg ' +
      'reproduces no bug and this test is no longer calibrated',
  );

  const fixed = setupPanel(2);
  armAllButtons(fixed.panel, fixed.steppers, fixed.validate);
  fixed.step(1);
  assert.equal(fixed.start.disabled, true, 'the window is open: every button is inert');
  assert.equal(fixed.other.disabled, true, 'the window is open: every button is inert');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(fixed.start.disabled, true, 'the count is 1 — #start must not be offered as startable');
  // The other direction of the same hook: re-validating must not become a way to skip arming.
  assert.equal(fixed.other.disabled, false, 'the window closed — every other setup button is live');

  // And a valid roster is not held hostage by the hook: #start arms like anything else.
  const valid = setupPanel(4);
  armAllButtons(valid.panel, [], valid.validate);
  assert.equal(valid.start.disabled, true, 'gated during the window even at a valid count');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(valid.start.disabled, false);
});

// The two halves of this change meet here: the steppers are excepted so a player can walk the roster
// without waiting, and excepting them must not carry #start out of the gate with them or stop the
// hook running. Stepping to an invalid count is exactly the sequence that produces both at once.
test('excepted steppers stay live throughout, and #start is still re-validated at the close', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { panel, start, other, steppers, validate } = setupPanel(1);
  armAllButtons(panel, steppers, validate);

  assert.deepEqual(
    steppers.map((b) => b.disabled),
    [false, false],
    'the steppers were gated — a player stepping 2 to 10 would wait 400ms on every tap',
  );
  assert.equal(start.disabled, true);
  assert.equal(other.disabled, true, 'excepting the steppers must not un-gate the rest of the panel');

  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.deepEqual(steppers.map((b) => b.disabled), [false, false], 'never gated, so nothing to un-gate');
  assert.equal(start.disabled, true, '#start is excepted from nothing — the hook still owns it at an invalid count');
  assert.equal(other.disabled, false);
});

test('the hook fires at the real arm, not at a fixed timeout the deferral outruns', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { panel, start, validate } = setupPanel(1);
  armAllButtons(panel, [], validate);

  // A finger resting in the panel restarts the window; this is what makes a caller-side
  // setTimeout(validateCount, ARM_DELAY_MS) race the gate and lose.
  t.mock.timers.tick(ARM_DELAY_MS - 1);
  panel.dispatch('pointerdown');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(start.disabled, true, '#start must be re-validated after the DEFERRED arm too');
});

// gh#179. The reset control overwrites every typed name, so it asks first -- and the confirm it
// opens is itself a fresh pair of buttons appearing under the finger that just pressed reset.
test('the reset-names confirm is opened and armed at the moment it is revealed', () => {
  assert.match(
    source,
    /function openResetNames\(\)\{[\s\S]*?dlg\.showModal\(\);\s*\n\s*if\(disarmDialog\)disarmDialog\(\);\s*\n\s*disarmDialog=armAllButtons\(dlg\);/,
    'openResetNames must showModal() the dialog and arm it fresh -- a dialog armed only once at ' +
      "panel mount carries a long-expired window, live under the finger that just tapped the trigger",
  );
  // The wipe hangs off the confirm button, never off the trigger: a reset that ran before the
  // question was answered would make the confirm decorative.
  assert.match(source, /function confirmResetNames\(\)\{[\s\S]{0,200}?resetSetupNames\(\);/);
  assert.doesNotMatch(
    source,
    /function openResetNames\(\)\{[^}]*resetSetupNames\(\)/,
    'openResetNames calls resetSetupNames — the confirm would be asking about work already done',
  );
});

// The class gh#174's adversarial review found on short-stick: a confirm that rebuilds its own
// screen without re-arming leaves the rebuilt controls live under a double-tap. This route's shape
// closes it differently -- renderSetup() is the ONE path every setup rebuild goes through, and it
// already ends in armPanel(), pinned above -- so the fix here is that confirmResetNames goes through
// renderSetup() rather than patching the DOM itself.
test('the reset confirm rebuilds through renderSetup, not by patching the DOM directly', () => {
  assert.match(source, /function confirmResetNames\(\)\{[^}]*renderSetup\(\);\s*\n\}/);
});

// gh#187, owner ruling 2026-09-01: closing a modal IS a reveal ADR-0017 gates, and the rebuild was
// never the hazard. Close and cancel rebuild nothing, so every assertion above stays green with this
// call deleted -- the reveal is the dialog going away over a live #panel. This is the only pin on it.
test('closing the reset-names dialog re-arms the setup panel behind it', () => {
  assert.match(
    source,
    /function closeResetNames\(\)\{[^}]*armPanel\(countSteppers\(\),validateCount\);/,
    'closeResetNames no longer re-arms #panel: a double-tap on close or cancel puts the second ' +
      'contact on #start or a name row, live behind the dialog with a long-expired arm window',
  );
});
