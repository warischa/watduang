// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? This route does, six times -- and the gate would stay green with five of those six
// deleted. It counts calls per DIRECTORY, not per reveal, so it has no way to know that this route
// puts controls under the finger on six separate paths (gh#176 added the sixth). The real rule
// (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just revealed.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to, with a recorded decision for every member. An eleventh receiver -- a new modal, a new
// panel toggled by display -- fails this test on the day it is added, and whoever adds it decides
// whether it needs a call and records that here. A receiver that no longer exists fails it too: a
// stale EXPECTED is how a pinning test keeps passing while the code it describes moves on.
//
// ponytail: matched on source text, not on a parsed AST. Two stated ceilings:
// (1) a reveal written inline as `document.getElementById('x').classList.add('active')` is recorded
//     under the receiver text `document.getElementById('x')`, so it still surfaces as an unexpected
//     receiver and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything. Only a real browser proves that, and this test claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MAIN = path.join(import.meta.dirname, 'main.js');
// Whole-line comments are dropped: this file's own main.js documents its reveal paths in prose, and
// a checker cannot tell use from mention. Only FULL-line comments go -- a trailing `//` inside a
// string would take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// Every write that can make a control visible: the `.active` class this route's CSS uses for both
// screens and its two modals, and a direct display write. `grid` is in the set because this route
// reveals its penalty presets with it, and a pattern that only knew block/flex would call that
// reveal nonexistent rather than classify it.
const REVEAL_RE =
  /([\w.'"()\-]+?)\.(?:classList\.add\(\s*['"]active['"]\s*\)|style\.display\s*=\s*['"](?:block|flex|grid|inline|inline-block|inline-flex)['"])/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  ['target', 'showScreen(): the screen-to-screen path, menu/setup/game. Armed on the line below.'],
  ['rulesModal', 'openRulesModal(): #modal-rules, 1 close button, opened by 2 controls, never through showScreen. Armed.'],
  ['modal', 'showDetonationModal(): #modal-detonation, 2 buttons, opened on an 850ms timer over the game screen. Armed.'],
  ['resetModal', 'gh#176: #modal-reset-names, 2 buttons, opened by btn-reset-names over the setup screen. Armed.'],
  ['actionBanner', 'setupTurn(): #turn-action-banner, revealed inside a screen already up. Armed LAST, after btn-trigger-scan is re-enabled.'],
  ['scanBtn', 'the button BEING revealed, not a container. Gated through its parent #turn-action-banner, which armAllButtons walks into.'],
  ['presetsGrid', 'NOT a button reveal: every .preset-chip in #penalty-presets-grid is a <div>, and armAllButtons gates <button> only.'],
  ['customInput', 'NOT a button reveal: #input-custom-penalty is a text input, nothing to ghost-tap.'],
  ['penaltyBox', 'NOT a button reveal: #penalty-result-container holds one text card. It also sits inside #modal-detonation, which is armed.'],
  ['flash', 'NOT a button reveal: #flash-overlay is an empty full-bleed colour wash.'],
  ['scissor', 'NOT a button reveal: #scissor-tool is a cursor-following SVG decoration.'],
]);

// The receivers above that carry buttons and therefore MUST have a call naming them. `target` is
// checked separately because its call is written against the variable, not the element id.
const MUST_BE_ARMED = ['rulesModal', 'modal', 'actionBanner', 'resetModal'];

test('every reveal receiver in wire-snip-panic/main.js is a known one', () => {
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
  // showScreen's, written against `target` inside the same guard as the class it adds.
  assert.match(source, /target\.classList\.add\('active'\);\s*\n\s*armAllButtons\(target\);/);
});

// The reveal that has no `.active` and no display write, so REVEAL_RE cannot see it at all:
// renderSetupPlayerList() rebuilds #player-list-container through innerHTML on open, on every add and
// on every remove -- a fresh .player-remove-btn lands at the coordinates of the one just pressed.
test('renderSetupPlayerList arms the container it rebuilds', () => {
  assert.match(source, /armAllButtons\(container\)/);
});

// The other half of the arming: the bridge that replays a saved group must survive it. A plain
// .click() on a disabled button returns without dispatching and without throwing, so this is the one
// break in this route that would be silent.
test('roster-bridge clears the gate around every programmatic click', () => {
  const bridge = fs.readFileSync(path.join(import.meta.dirname, 'roster-bridge.ts'), 'utf8');
  const code = bridge
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
    .join('\n');
  // Exactly one, and it is the one inside drive(). Any second call site is a raw click that bypasses
  // the unlock and dies silently on a gated button.
  assert.equal((code.match(/\.click\(\)/g) ?? []).length, 1);
  assert.match(code, /function drive\(el: HTMLElement\): void \{[^}]*el\.click\(\);/);
  assert.match(code, /const wasDisabled = btn\.disabled === true;/);
  assert.match(code, /if \(wasDisabled\) btn\.disabled = true;/);
});

// gh#187, owner ruling 2026-09-01: closing a modal IS a reveal ADR-0017 gates. REVEAL_RE matches
// `classList.add`, so a closer -- which only REMOVES the class -- is invisible to it, and the confirm
// was covered only incidentally, by the rebuild inside renderSetupPlayerList(). #btn-close-rules and
// #btn-cancel-reset-names rebuild nothing, so every check above stayed green while the screen under
// the card sat live with an expired window. Pinned on the one closer they now share.
test('closeModal re-arms the screen the modal was covering', () => {
  const at = source.indexOf('function closeModal(id)');
  assert.ok(at > -1, 'closeModal is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n    }', at));
  assert.match(
    body,
    /querySelector\('\.screen\.active'\)[\s\S]{0,80}?armAllButtons\(screen\)/,
    'closeModal no longer re-arms the live screen: a double-tap on #btn-close-rules or on ' +
      '#btn-cancel-reset-names puts the second contact on whatever button sits behind the card',
  );
  // Each dismissal that does NOT change screen has to route through it; a direct
  // classList.remove('active') is the regression, and it is what shipped before this ruling.
  for (const id of ['modal-rules', 'modal-reset-names']) {
    assert.match(
      source,
      new RegExp(`closeModal\\('${id}'\\)`),
      `${id} is dismissed without closeModal, so nothing re-arms the screen behind it`,
    );
  }
});

// ---------------------------------------------------------------------------
// gh#188 boxes 13-15. Two claims, both about #btn-trigger-scan, the one control this route disables
// for its own reason.
//
// The named mechanism box 15 asks about: keydown Escape calls closeModal('modal-rules'), which arms
// the whole live screen; keydown Enter then calls triggerScanSequence(). Before gh#188 the arm
// window's blanket re-enable cleared the mid-scan `disabled` set in triggerScanSequence, so the
// button came back live during its own sequence. Two independent legs close it and both are pinned
// below, because a general argument covers neither:
//   (1) the gate no longer re-enables a control that was already disabled when it was called
//       (games/_arm-gate.ts, pinned behaviourally in short-stick's arm-reveal-paths.test.mjs);
//   (2) triggerScanSequence writes game.state BEFORE it disables, so its own TURN_WAIT guard
//       rejects the re-entry regardless of what the button's `disabled` says. That is a source
//       ORDER, and order is exactly the kind of thing a refactor reorders silently.
//
// Ceiling: leg (2) is asserted as source order, not driven. Nothing here boots this route's DOM.
const OWNED_DISABLED = new Map([
  [
    'scanBtn',
    'renderTurnStart(): the pass-the-phone screen offers #btn-trigger-scan, enabled. armAllButtons ' +
      'is called AFTER this write, and the gate treats an ENABLED control as gateable — so the ' +
      'ghost-tap window still covers it. Setting false, not true, so nothing is preserved here.',
  ],
  [
    "document.getElementById('btn-trigger-scan')",
    'triggerScanSequence(): disabled for the duration of the scan. This is the one write the gate ' +
      'must preserve, and the reason box 15 exists.',
  ],
]);

test('gh#188 the set of game-owned disabled writes in wire-snip-panic/main.js is a known one', () => {
  const found = [...source.matchAll(/([\w.$'"()[\]-]+?)\.disabled\s*=/g)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the disabled-write pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !OWNED_DISABLED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new game-owned disabled write(s) ${unknown.join(', ')}: the arm window preserves a control ` +
      'already disabled when it was called, so record what state this write means and whether any ' +
      'reveal path re-exposes it.',
  );
  const stale = [...OWNED_DISABLED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `OWNED_DISABLED names writes that no longer exist: ${stale.join(', ')}`);
});

test('gh#188 box 15 — triggerScanSequence sets its state before it disables the button', () => {
  assert.match(
    source,
    /if \(game\.state !== GameState\.TURN_WAIT\) return;[\s\S]*?game\.state = GameState\.SCANNING_HINTS;\s*\n\s*document\.getElementById\('btn-trigger-scan'\)\.disabled = true;/,
    'the guard, the state write and the disable must appear in that order. If the disable moves ' +
      'above the state write, Escape (which arms the live screen) followed by Enter re-enters ' +
      'triggerScanSequence and starts a second scan over the first',
  );
  // The Escape leg is what makes the ordering above load-bearing rather than incidental: it is the
  // only path that touches the button's `disabled` without going through triggerScanSequence.
  assert.match(
    source,
    /if \(e\.key === 'Escape'\) \{\s*\n\s*closeModal\('modal-rules'\);/,
    'the Escape key must dismiss through closeModal — a bare classList.remove leaves the screen ' +
      'behind the modal ungated (ADR-0057)',
  );
});
