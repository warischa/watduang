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

test('removing a player enforces the two-player floor in the handler, not in the attribute', () => {
  assert.match(
    source,
    /remove-p-btn[\s\S]{0,500}?if \(game\.players\.length <= 2\) return;/,
    'the .remove-p-btn handler splices with no floor. The `disabled` attribute it renders with is ' +
      'not the invariant: armAllButtons re-enables every control it collected with one blanket ' +
      'write, clearing page-owned disabled state, so a 2-player party can be cut to 1 and then to ' +
      '0 — after which renderDraw divides by an empty roster',
  );
});
