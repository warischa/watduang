// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for pinocchio-luck.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? pinocchio-luck does, through its armPanel() wrapper -- and the gate would stay green with
// every screen but one left ungated. It counts calls per DIRECTORY, not per reveal. The real rule
// (ADR-0017) is per reveal: the second contact of a double-tap must not land on a control the first
// contact just put under the finger -- and since ADR-0057, every close, cancel and confirm path is a
// reveal too.
//
// Three parts since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- the in-game screens rendered into #panel -- pinned by the receiver
//      each one writes to, on source text. A new receiver fails on the day it is added.
//   2. The arm gate's onArm contract, on a fixture: a control whose `disabled` belongs to a validator
//      must still be re-validated when the window closes. This route's own setup was the first user
//      of that contract (gh#188); the shared player screen that replaced the setup relies on the same
//      contract for its start button, so the fixture tests stay and guard it.
//   3. The SHARED PLAYER SCREEN mounted into #plPlayers, which replaced the route's setup, its
//      reset-names dialog and that dialog's arming paths. Its reveals are driven for real
//      (revealPathCases): the shared code over THIS route's markup.html with the real arm gate, read
//      off this route's own header control. A screen mounted outside #app, or one that armed only its
//      own root, leaves #soundBtn live and reds here.
//
// ponytail, for part 1: matched on source text, not on a parsed AST. Full-line comments are stripped
// from main.js first (prose about a reveal is not a reveal), and the match proves the CALL SITE
// exists next to the reveal, never the browser-level 400ms (owner ruling on issue #232).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { armAllButtons, ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { FakeElement } from '../../games/_fake-dom.mjs';
import { mountOnPage, revealPathCases, settle } from '../_player-screen/screen-harness.mjs';
import game from '../../games/pinocchio-luck.ts';

const MAIN = path.join(import.meta.dirname, 'main.js');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
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
    "the only innerHTML reveal receiver on this route: every in-game screen is mounted by replacing " +
      "#panel's markup, and render() arms it on its last line. The setup that used to render here is " +
      "the shared player screen's now (#plPlayers), which arms itself.",
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

test('render() arms #panel on every in-game screen, cancelling the previous window first', () => {
  assert.match(source, /^\s*armPanel\(\);$/m, "render()'s own arm is gone");
  // #panel is the SAME node across screens: arming again without cancelling would stack a second
  // pointerdown listener on it.
  assert.match(source, /function armPanel\(\)\{\s*\n\s*if\(disarmPanel\)disarmPanel\(\);\s*\n\s*disarmPanel=armAllButtons\(panel\);/);
});

/** A panel whose #start is owned by a validator, one plain button that nothing but the gate owns,
 *  and two rapid-tap steppers excepted from the gate. `validate` is the validator's one load-bearing
 *  line. The shape this route's own setup had (gh#188), and the shape the shared player screen has
 *  now: its steppers are excepted and its start is re-asserted by the screen's own hook. */
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
  // steppers do -- they stay live through the window by design -- and it is the one hazard the gate's
  // own snapshot cannot see, so it is what the naive leg below reproduces.
  const step = (to) => {
    count = to;
    validate();
  };
  return { panel, start, other, steppers: [minus, plus], validate, step };
}

test('#start stays disabled at an invalid count after the arm window closes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  // The naive implementation: arm with no re-validation. Kept as the must-red leg -- without it the
  // assertion below is a green nobody has seen fail.
  //
  // gh#188 RESTATED. The snapshot is taken at construction, so what the gate cannot see is the count
  // going invalid DURING the window: #start is enabled and gateable at the arm call, the player taps
  // an excepted stepper (live by design, which is what makes this reachable rather than
  // hypothetical), and when the window closes the gate hands #start back enabled from a snapshot that
  // is now stale. onArm is the only thing that re-asserts the validator.
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

// Excepting the steppers must not carry #start out of the gate with them or stop the hook running.
// Stepping to an invalid count is exactly the sequence that produces both at once.
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
  // setTimeout(validate, ARM_DELAY_MS) race the gate and lose.
  t.mock.timers.tick(ARM_DELAY_MS - 1);
  panel.dispatch('pointerdown');
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(start.disabled, true, '#start must be re-validated after the DEFERRED arm too');
});

// --- The shared player screen on this route (gh#264, ADR-0071) ------------------------------------

test('the shared player screen is mounted into #plPlayers, inside the #app it arms, with this route\'s range', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('plPlayers'\);/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  assert.match(source, /range: pinocchioLuck\.players,/);
  assert.match(source, /onStart: startWithPlayers,/);
  assert.ok(MARKUP.indexOf('id="app"') > -1 && MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="plPlayers"'), '#plPlayers must sit inside #app');
  // #panel holds the round; it must not show an empty card over or beside the player screen on load.
  assert.match(MARKUP, /<section class="panel" id="panel" aria-label="[^"]*" hidden><\/section>/, '#panel no longer ships hidden');
});

test('the tagline slot carries this game\'s own tagline, byte for byte', () => {
  assert.ok(MARKUP.includes(`<p class="ps-tagline">${game.tagline}</p>`), 'the tagline slot drifted from the module\'s `tagline`');
});

// The way back to the player screen from the results: the round is over there, so it opens straight
// away -- there is nothing to confirm losing (ADR-0071 ruling 6).
test('the results screen\'s edit control opens the shared player screen, never a route-local setup', () => {
  assert.match(source, /'edit-names':editNames,/);
  const at = source.indexOf('function editNames(){');
  assert.ok(at > -1, 'editNames is gone — this test measures nothing');
  assert.match(source.slice(at, source.indexOf('\n}', at)), /playerScreen\.open\(\)/);
});

// ADR-0071 ruling 4, on this route: start is refused while fewer than the game's minimum are ticked,
// and the window closing does not hand it back -- the contract the fixture tests above pin, driven
// on the real screen over this route's markup at this route's declared range.
test('pinocchio-luck: start stays refused under the minimum after the window closes, and returns at it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'plPlayers', roster: ['ต้น', 'มายด์'], range: game.players });
  page.screen.open();
  await settle();
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(page.part('start').disabled, false, 'two ticked of a minimum of two: start is live');
  const tick = () => page.root.querySelectorAll('.ps-tick')[1];
  assert.equal(tick().click(), true);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(page.part('start').disabled, true, 'one ticked of a minimum of two: start must stay refused');
  assert.equal(page.part('start').click(), false);
  assert.equal(page.calls.started.length, 0);
  assert.equal(tick().click(), true);
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  assert.equal(page.part('start').disabled, false, 'back at the minimum: start is live again');
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'plPlayers', headerId: 'soundBtn', label: 'pinocchio-luck' });
