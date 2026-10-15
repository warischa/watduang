// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned for this route.
//
// That gate asks ONE question of a play route: does it call armAllButtons somewhere? short-stick
// does, three times, and has since ADR-0017 -- so the gate is already green and will stay green for
// every reveal path added after today, armed or not. A sibling route shipped three bypasses hiding
// 23 ungated buttons behind exactly that green.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.js's OWN reveals -- its views and its dialogs -- pinned by the receiver each one writes
//      to, on source text, with a recorded decision for every member. A new receiver fails on the
//      day it is added; one that disappears fails too (a stale EXPECTED keeps passing while the code
//      it describes moves on).
//   2. The SHARED PLAYER SCREEN mounted into #ssPlayers, which replaced the mockup's name rows, its
//      add and remove controls, its reset-names dialog and that dialog's arming paths. Its reveals
//      are driven for real (revealPathCases): the shared code over THIS route's markup.html with the
//      real arm gate, read off #btn-start-setup -- the hero control that opens the screen, inside
//      #app and outside the screen's root. A screen mounted outside #app, or one that armed only its
//      own root, leaves that control live and reds here.
//
// ponytail: half 1 is matched on source text, not on a parsed AST. Three stated ceilings:
// (1) an inline reveal is recorded under its whole receiver expression, so it still surfaces as an
//     unexpected receiver and still fails -- it reads worse, it does not slip through;
// (2) this proves a call site exists at the reveal, never that the 400ms window really disables
//     anything. Only a real browser proves that, and nothing here claims it;
// (3) the set is reveals by VISIBILITY -- an "active" class, a display write, `hidden`, showModal.
//     A re-render that replaces innerHTML under an already-visible panel is a different shape and is
//     out of this set; renderDraw handles its own (main.js arms #view-draw after rebuilding the
//     straws) and renderSetup does not. That asymmetry is real and is NOT closed here.
// Stated, not hidden: the route's top bar (<header class="topnav">) sits OUTSIDE #app, so neither
// setView nor the shared screen ever arms it. That was true before gh#264 and is unchanged by it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { closerCases, revealPathCases } from '../_player-screen/screen-harness.mjs';
import { sliceBlock } from '../_dom-stub.mjs';
import shortStick from '../../games/short-stick.ts';

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
      'the tap that drew the short stick. Armed inside openDialog.',
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

// gh#187, owner ruling 2026-09-01: closing a dialog IS a reveal ADR-0017 gates, with no rebuild
// anywhere in it. Pinned on closeDialog, the one function every pure closer routes through. Since
// gh#264 the live screen can be the shared player screen, which is not a `.view`: the rules dialog
// opens from the top bar over it, so closing that dialog must re-arm the player screen's root when
// no view is active, or the dismissal re-arms nothing at all (ADR-0057).
test('closeDialog re-arms the live screen every dismissal uncovers, the player screen included', () => {
  const at = source.indexOf('const closeDialog = (id) =>');
  assert.ok(at > -1, 'closeDialog is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('};', at));
  assert.match(
    body,
    /querySelector\('\.view\.active'\)[\s\S]{0,120}?armAllButtons\(shown\)/,
    'closeDialog no longer re-arms the live view: a double-tap on a close X or a cancel puts the ' +
      'second contact on whatever button sits behind the dialog, armed on entry and enabled since',
  );
  assert.match(
    body,
    /else if \(!playersRoot\.hidden\) playerScreen\.arm\(\)/,
    'closeDialog no longer falls back to the open player screen: closing the rules dialog over it ' +
      're-arms nothing',
  );
  // Each pure closer routes through it. A closer that calls .close() directly is the regression:
  // it dismisses the dialog and leaves the view underneath ungated, which is what shipped before.
  for (const id of ['rules-dialog', 'leave-dialog']) {
    assert.match(
      source,
      new RegExp(`closeDialog\\('${id}'\\)`),
      `the ${id} closers no longer go through closeDialog, so nothing re-arms the view behind it`,
    );
  }
});

test('the shared player screen is mounted into #ssPlayers, inside the #app it arms', () => {
  assert.match(source, /const playersRoot = document\.getElementById\('ssPlayers'\);/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersRoot,/);
  const app = MARKUP.indexOf('id="app"');
  const root = MARKUP.indexOf('id="ssPlayers"');
  assert.ok(app > -1 && root > app && root < MARKUP.indexOf('</main>'), '#ssPlayers must sit inside #app');
});

// ADR-0071 ruling 1: hero -> player screen -> this game's own options -> play. Every way back to the
// players goes through the shared screen, never through a bare view swap to the options.
test('the hero, the options back control and the result edit all open the player screen', () => {
  for (const id of ['btn-start-setup', 'btn-setup-back', 'btn-edit-players']) {
    const at = source.indexOf(`$('${id}').addEventListener('click'`);
    assert.ok(at > -1, `#${id} has no click handler — this test measures nothing`);
    const handler = source.slice(at, source.indexOf('\n', at));
    assert.match(handler, /playerScreen\.open\(\)/, `#${id} no longer opens the shared player screen`);
    assert.doesNotMatch(handler, /setView\('setup'\)/, `#${id} skips the player screen straight to the options`);
  }
});

// A round on this route outlives its screen: handleDrawStick resolves 450ms after the tap and pops the
// hazard dialog 300ms after that. An edit confirmed inside that window must not let either timer act
// on the round it ended -- the hazard dialog would open over the player screen.
test('abortRound ends the round for its pending timers too', () => {
  const at = source.indexOf('const abortRound = () =>');
  assert.ok(at > -1, 'abortRound is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('};', at));
  assert.match(body, /roundEpoch \+= 1;/, 'abortRound no longer invalidates the timers of the round it ends');
  const draw = source.slice(source.indexOf('const handleDrawStick'));
  const guards = draw.slice(0, draw.indexOf('\n      };')).match(/if \(epoch !== roundEpoch\) return;/g) ?? [];
  assert.equal(guards.length, 2, 'both of handleDrawStick\'s timers must bail once the round is ended');
});

revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'ssPlayers', headerId: 'btn-start-setup', label: 'short-stick' });

// gh#264 REFUTE round 4: the real closeDialog bytes over the open player screen, read for what they
// leave start holding (closerCases).
closerCases({
  test,
  assert,
  routeMarkup: MARKUP,
  rootId: 'ssPlayers',
  range: shortStick.players,
  label: 'short-stick',
  close: (page) => {
    // No view is live while the player screen is up.
    page.doc.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
    const body = sliceBlock(source, 'const closeDialog = (id) =>');
    assert.ok(body, 'closeDialog is gone — this test measures nothing');
    const closeDialog = new Function('$', 'document', 'armAllButtons', 'playersRoot', 'playerScreen', `${body}\nreturn closeDialog;`)(
      (id) => page.doc.getElementById(id), page.doc, armAllButtons, page.root, page.screen,
    );
    page.byId('rules-dialog').showModal();
    closeDialog('rules-dialog');
  },
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
// One ceiling, stated rather than hidden: this drives the gate directly. It proves the gate's
// contract, not that this route's markup puts these particular ids inside the container closeDialog
// arms. (A second ceiling, the markup-rendered `disabled` attribute on the row remove control, went
// with that control in gh#264: the rows are the shared player screen's now.)
import { armAllButtons, ARM_DELAY_MS } from '../../games/_arm-gate.ts';
import { FakeElement } from '../../games/_fake-dom.mjs';

// Every `.disabled =` write in main.js, keyed by its receiver expression, with the decision. A new
// game-owned disabled write fails this on the day it is added; one that disappears fails it too.
const OWNED_DISABLED = new Map([
  ["$('btn-fewer-sticks')", 'renderSetup(): floor, stickCount <= roster size.'],
  ["$('btn-more-sticks')", 'renderSetup(): ceiling, stickCount >= 20.'],
  ["$('btn-fewer-shorts')", 'renderSetup(): floor, shortCount <= 1.'],
  ["$('btn-more-shorts')", 'renderSetup(): ceiling, min(3, roster-1).'],
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
