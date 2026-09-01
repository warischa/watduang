// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned for this route.
//
// That gate asks ONE question of a play route: does it call armAllButtons somewhere? short-stick
// does, three times, and has since ADR-0017 -- so the gate is already green and will stay green for
// every reveal path added after today, armed or not. A sibling route shipped three bypasses hiding
// 23 ungated buttons behind exactly that green.
//
// So this file does not re-check the gate. It pins the SET of reveal sites in main.js, keyed by the
// receiver each one writes to, with a recorded decision for every member. A new receiver -- another
// dialog, another panel toggled by display -- fails this test on the day it is added, and whoever
// adds it decides whether a control lands under the finger and records the answer here. A receiver
// that disappears fails it too: a stale EXPECTED is how a pinning test keeps passing while the code
// it describes moves on.
//
// gh#174 adds the reset-names confirm. It is a new tap surface revealed on top of the control that
// was just pressed, which is the sharpest ghost-tap shape there is, so its reveal path is asserted
// here by name rather than left to the receiver set: it goes through openDialog, which arms.
//
// ponytail: matched on source text, not on a parsed AST. Three stated ceilings:
// (1) an inline reveal is recorded under its whole receiver expression, so it still surfaces as an
//     unexpected receiver and still fails -- it reads worse, it does not slip through;
// (2) this proves a call site exists at the reveal, never that the 400ms window really disables
//     anything. Only a real browser proves that, and nothing here claims it;
// (3) the set is reveals by VISIBILITY -- an "active" class, a display write, `hidden`, showModal.
//     A re-render that replaces innerHTML under an already-visible panel is a different shape and is
//     out of this set; renderDraw handles its own (main.js arms #view-draw after rebuilding the
//     straws) and renderSetup does not. That asymmetry is real and is NOT closed here.
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

// Every write that can put a control on screen that was not on screen a frame earlier.
const REVEAL_RE =
  /([\w.$'"()[\]-]+?)\.(?:classList\.(?:add|toggle)\(\s*['"]active['"]|style\.display\s*=|hidden\s*=|showModal\(\))/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'el',
    'setView(): the view-to-view path, start/setup/draw/result. Armed -- setView re-queries the ' +
      'shown view as `shown` and calls armAllButtons on it.',
  ],
  [
    'dlg',
    'openDialog(): every <dialog> on the route, including the hazard reveal that pops 300ms after ' +
      'the tap that drew the short stick, and gh#174 reset confirm. Armed inside openDialog.',
  ],
  [
    "$('penalty-preset-wrapper')",
    'renderSetup(): revealed by a change on #penalty-mode-select, and it holds the preset chips, ' +
      'which ARE buttons. NOT armed. The trigger is a native select picker, not a button in the ' +
      'place the chips appear, so no second contact of a double-tap lands on them. Recorded as an ' +
      'accepted gap, not as proven safe -- an owner who decides otherwise arms it here.',
  ],
  [
    "$('penalty-custom-wrapper')",
    'renderSetup(): same select-change trigger. Holds one text input and no button. NOT armed; ' +
      'armAllButtons gates buttons, so it would change nothing here.',
  ],
  [
    'penaltyBox',
    'renderResult(): #result-penalty-box is a heading and a line of text, no control inside it, ' +
      'and it is filled while #view-result is being revealed by a setView that already armed. ' +
      'NOT armed, and nothing to arm.',
  ],
]);

// Which arming call must name each armed receiver. setView writes through `el` in its loop and arms
// the shown view under a second name, so the pair is asserted as text rather than by receiver name.
const MUST_BE_ARMED = new Set(['dlg']);

test('every reveal receiver in short-stick/main.js is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a control under the ` +
      'finger, arm the revealed element if it does, and add it to EXPECTED with the reason. The ' +
      'arm-gate CI check will not tell you — it is already green.',
  );
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('each armed reveal receiver has an arming call naming it', () => {
  for (const receiver of MUST_BE_ARMED) {
    assert.match(
      source,
      new RegExp(`armAllButtons\\(\\s*${receiver}\\b`),
      `${receiver} is revealed but no arming call names it`,
    );
  }
  // setView: the toggle and the arm are the same element under two names, so both halves are pinned.
  assert.match(source, /const shown = \$\(`view-\$\{viewName\}`\);\s*\n\s*if \(shown\) armAllButtons\(shown\);/);
  // The straw grid is rebuilt inside an already-visible #view-draw, and every rebuild is a handover
  // to the next player. main.js arms it there rather than at setView; that call is load-bearing.
  assert.match(source, /const drawView = \$\('view-draw'\);\s*\n\s*if \(drawView\) armAllButtons\(drawView\);/);
});

// gh#174. The reset control overwrites every typed name, so it asks first -- and the confirm it
// opens is itself a fresh pair of buttons appearing under the finger that just pressed reset. Both
// halves are pinned: the trigger reaches the dialog only through openDialog (which arms), and the
// destructive branch is the only one that wipes.
test('the reset-names confirm is opened through the arming path', () => {
  assert.match(
    source,
    /\$\('btn-reset-names'\)\.addEventListener\('click', \(\) => \{[^}]*openDialog\('reset-names-dialog'\)/,
    '#btn-reset-names must open its confirm through openDialog — a raw showModal() reveals two ' +
      'buttons with no ghost-tap window',
  );
  assert.doesNotMatch(
    source,
    /\$\('reset-names-dialog'\)\.showModal\(\)/,
    'the reset dialog is shown by a raw showModal(), which skips the arming in openDialog',
  );
  // The wipe hangs off the confirm button, never off the trigger: a reset that ran before the
  // question was answered would make the confirm decorative.
  assert.match(source, /\$\('btn-confirm-reset-names'\)\.addEventListener\('click',[\s\S]{0,240}?resetPlayerNames\(\)/);
  assert.doesNotMatch(
    source,
    /\$\('btn-reset-names'\)\.addEventListener\('click', \(\) => \{[^}]*resetPlayerNames\(\)/,
    'the trigger itself calls resetPlayerNames — the confirm would be asking about work already done',
  );
});

// Found by adversarial review of this diff, 2026-08-31, and invisible to every other check here:
// the CLOSING of the confirm is a reveal too. renderSetup rebuilds the row X buttons through
// innerHTML, and the gate setView installed on entry has already fired and removed itself, so the
// rebuilt rows land live under the finger that just confirmed. Two independent things stop a
// double-tap on the confirm from deleting a player, and both are pinned below because the suite
// passed identically before either existed.
test('the reset confirm re-arms the setup rows it rebuilds', () => {
  assert.match(
    source,
    /renderSetup\(\);\s*\n\s*const setupView = \$\('view-setup'\);\s*\n\s*if \(setupView\) armAllButtons\(setupView\);/,
    'the reset confirm calls renderSetup without re-arming #view-setup: the second contact of a ' +
      'double-tap on the confirm lands on a freshly rebuilt row X, which removes a player — the one ' +
      'thing this dialog\'s own copy promises survives',
  );
});

// gh#187, owner ruling 2026-09-01: closing a dialog IS a reveal ADR-0017 gates, with no rebuild
// anywhere in it. The test above covers the confirm only; close, cancel and the rules OK rebuild
// nothing at all, and every check in this file stayed green while the view under the card sat live
// with an expired window. Pinned on closeDialog, the one function all of them now route through.
test('closeDialog re-arms the live view every dismissal uncovers', () => {
  const at = source.indexOf('const closeDialog = (id) =>');
  assert.ok(at > -1, 'closeDialog is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('};', at));
  assert.match(
    body,
    /querySelector\('\.view\.active'\)[\s\S]{0,80}?armAllButtons\(shown\)/,
    'closeDialog no longer re-arms the live view: a double-tap on a close X or a cancel puts the ' +
      'second contact on whatever button sits behind the dialog, armed on entry and enabled since',
  );
  // Each pure closer routes through it. A closer that calls .close() directly is the regression:
  // it dismisses the dialog and leaves the view underneath ungated, which is what shipped before.
  for (const id of ['rules-dialog', 'reset-names-dialog', 'leave-dialog']) {
    assert.match(
      source,
      new RegExp(`closeDialog\\('${id}'\\)`),
      `the ${id} closers no longer go through closeDialog, so nothing re-arms the view behind it`,
    );
  }
});

test('removing a player enforces the two-player floor in the handler, not in the attribute', () => {
  assert.match(
    source,
    /remove-p-btn[\s\S]{0,500}?if \(game\.players\.length <= 2\) return;/,
    'the .remove-p-btn handler splices with no floor. The `disabled` attribute it renders with is ' +
      'not the invariant — gh#188 makes the gate preserve it in a real browser, but nothing here ' +
      'depends on attribute reflection and a row re-rendered mid-window is disabled by neither. ' +
      'Without this check a 2-player party can be cut to 1 and then to 0 — after which renderDraw ' +
      'divides by an empty roster',
  );
});

// ---------------------------------------------------------------------------
// gh#188 box 14 — the arm window must not clear `disabled` the GAME owns.
//
// The bug this pins is in the shared gate, not in this route: armAfterQuiet disabled every control
// it collected, then re-enabled ALL of them when the window closed. A control the game had already
// disabled for its OWN reason -- a count pill at its cap, a straw already drawn -- came back
// enabled, and closeDialog() calls armAllButtons on the whole live view, so every dismissal of the
// rules dialog on the setup screen ran that blanket write across all five pills.
//
// The fix is one line in games/_arm-gate.ts: the gate snapshots which collected controls were
// ALREADY disabled when it was called and leaves those alone at arm time. The game's own state is
// the exception list, computed at arm time -- which is why nothing here is hand-listed and why
// renderDraw()'s per-straw write (`btn.disabled = isUsed || game.isResolving`, inside the loop that
// builds the straw grid) cannot rot it.
//
// Two ceilings, stated rather than hidden:
// (1) the fake DOM does not reflect a boolean `disabled` ATTRIBUTE onto the property, so the
//     markup-rendered case -- renderSetup()'s `.remove-p-btn`, which carries a bare `disabled`
//     attribute in its row template -- is NOT covered by the behavioural test below. A real browser does reflect it, so the gate preserves it there; the handler-side floor
//     is kept anyway as defence in depth and is pinned by its own test above.
// (2) this drives the gate directly. It proves the gate's contract, not that this route's markup
//     puts these particular ids inside the container closeDialog arms.
import { armAllButtons, ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { FakeElement } from '../../games/_fake-dom.mjs';

// Every `.disabled =` write in main.js, keyed by its receiver expression, with the decision. A new
// game-owned disabled write fails this on the day it is added; one that disappears fails it too.
const OWNED_DISABLED = new Map([
  ["$('btn-fewer-sticks')", 'renderSetup(): floor, stickCount <= roster size.'],
  ["$('btn-more-sticks')", 'renderSetup(): ceiling, stickCount >= 20.'],
  ["$('btn-fewer-shorts')", 'renderSetup(): floor, shortCount <= 1.'],
  ["$('btn-more-shorts')", 'renderSetup(): ceiling, min(3, roster-1).'],
  ["$('btn-add-player')", 'renderSetup(): roster cap of 10.'],
  ['btn', 'renderDraw(): a straw already drawn, or the draw is resolving. Written in a render loop.'],
]);

test('gh#188 the set of game-owned disabled writes in short-stick/main.js is a known one', () => {
  const found = [...source.matchAll(/([\w.$'"()[\]-]+?)\.disabled\s*=/g)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the disabled-write pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !OWNED_DISABLED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new game-owned disabled write(s) ${unknown.join(', ')}: the arm window preserves them, so add ` +
      'each one here with the state the game means it to hold.',
  );
  const stale = [...OWNED_DISABLED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `OWNED_DISABLED names writes that no longer exist: ${stale.join(', ')}`);
});

test('gh#188 the arm window leaves game-owned disabled alone and re-enables the rest', async () => {
  const view = new FakeElement('div');
  // The divergence input: a container holding BOTH kinds of button. A correct gate and the blanket
  // one agree on every button the game left enabled, so a fixture with only those measures nothing.
  const capPill = view.appendChild(new FakeElement('button')); // #btn-more-sticks at 20 sticks
  const usedStraw = view.appendChild(new FakeElement('button')); // a straw already drawn
  const freeStraw = view.appendChild(new FakeElement('button')); // a straw still in the bundle
  capPill.disabled = true;
  usedStraw.disabled = true;

  let clicks = 0;
  for (const b of [capPill, usedStraw, freeStraw]) b.addEventListener('click', () => { clicks++; });

  const cancel = armAllButtons(view);
  assert.deepEqual(
    [capPill.disabled, usedStraw.disabled, freeStraw.disabled],
    [true, true, true],
    'inside the window every button is inert, including the ones the game already owned',
  );

  await new Promise((resolve) => setTimeout(resolve, ARM_DELAY_MS + 100));
  cancel();

  assert.equal(capPill.disabled, true, 'the pill at its cap must STAY disabled after the window closes');
  assert.equal(usedStraw.disabled, true, 'a straw already drawn must STAY disabled after the window closes');
  // The other direction, and the positive control: a gate that simply stopped re-enabling anything
  // would satisfy the two assertions above and break the game. It must not.
  assert.equal(freeStraw.disabled, false, 'a button the game left enabled must be tappable again');

  for (const b of [capPill, usedStraw, freeStraw]) b.click();
  assert.equal(clicks, 1, 'exactly one of the three activates — the one the game left enabled');
});

// gh#188 follow-up. The snapshot above cannot tell the CALLER's `disabled` from the gate's own
// disable-all residue, and the canceller re-enables nothing, so cancel-then-rearm on the same
// non-rebuilt nodes used to strand every control permanently: gate 1 disables all, the disarmer
// clears the timer without arming, gate 2 then snapshots that residue as caller intent and re-enables
// nobody. Pre-fix the blanket re-enable self-healed this in one window. Reachable through the
// `if (disarm) disarm(); disarm = armAllButtons(modal);` idiom on the header-triggered modals, where
// the trigger keeps focus and a held Enter fires the handler twice inside one window -- leaving the
// player behind an overlay whose close button is dead, with reload the only exit.
//
// This lives in short-stick's file because short-stick is the route whose owned-disabled controls the
// same hunk protects: the two properties are one seam and they trade off against each other, so a
// fix for either must be read against both. The third button is what pins that trade-off.
test('gh#188 cancelling the gate mid-window does not strand the controls it disabled', async () => {
  const modal = new FakeElement('div');
  const closeBtn = modal.appendChild(new FakeElement('button'));
  const confirmBtn = modal.appendChild(new FakeElement('button'));
  // The other half of the trade-off: a control the GAME owns must still survive the whole sequence,
  // or this test would pass against a plain revert of the snapshot.
  const ownedPill = modal.appendChild(new FakeElement('button'));
  ownedPill.disabled = true;

  const first = armAllButtons(modal);
  assert.equal(closeBtn.disabled, true, 'gate 1 opened its window');
  first();
  const second = armAllButtons(modal);
  await new Promise((resolve) => setTimeout(resolve, ARM_DELAY_MS + 100));
  second();

  assert.equal(
    closeBtn.disabled,
    false,
    'the close control is permanently dead: gate 1 disabled it, the disarmer left it that way, and ' +
      'gate 2 read that residue as caller intent. The player is stuck behind the overlay',
  );
  assert.equal(confirmBtn.disabled, false, 'same stranding, on the confirm control');
  assert.equal(ownedPill.disabled, true, 'and the game-owned control must STILL be preserved');
});
