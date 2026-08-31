// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for dice-loser.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? dice-loser does, three times -- and the gate would stay green even if two of those three
// were deleted, because it counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is
// per reveal: the second contact of a double-tap must not land on a control the first contact just
// put under the finger.
//
// So this test does not re-check the gate. It pins the SET of reveal sites, by the receiver each one
// writes to, with a recorded decision for every member. A fourth receiver -- a new panel, a new
// control revealed by unhiding it -- fails this test on the day it is added, and whoever adds it
// decides whether it needs an arming call and records that here.
//
// ponytail: matched on source text, not on a parsed AST. Two stated ceilings, same as the other ten:
// (1) an inline reveal is recorded under its whole receiver expression, so a receiver renamed later
//     still surfaces as unexpected and still fails -- it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything in a browser. Only scripts/arm-gate-probe.mjs proves that, and this test
//     claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// No compiled main.js exists for this route (unlike cannon-flag/cursed-number, dice-loser ships
// main.ts straight from src/play -- same as timebomb). Reading the .ts source is fine here: the
// regexes below match plain text, not parsed JS, so TypeScript syntax is inert to them.
const MAIN = path.join(import.meta.dirname, 'main.ts');
// Whole-line comments are dropped: main.ts documents its own reveal seams in prose, and a checker
// cannot tell use from mention. Only full-line comments go -- a trailing `//` inside a string would
// take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// This route reveals a control by clearing the native `hidden` attribute -- no classList('active')
// and no style.display write anywhere in the file. Two shapes both count as a reveal: a literal
// `= false`, and show()'s loop form `el.hidden = el !== panel` (false exactly when `el` is the
// panel being switched to). `.hidden = true` (a HIDE) matches neither branch and is excluded.
// gh#175 adds a third shape: showModal(), for the reset-names <dialog> -- a dialog is not in the
// PANELS array show() walks, so it needs its own branch here or it would be invisible to this test.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:hidden\s*=\s*(?:false\b|\w+\s*!==\s*\w+)|showModal\(\))/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'el',
    "show(): the screen-to-screen path, all five panels (setup/play/summary/tiebreak/final). Armed " +
      'on the next line via armAllButtons(panel).',
  ],
  [
    'rollEl',
    'renderTurn(): reveals #dl-roll. Armed on the FIRST turn of a round only -- startRound() calls ' +
      'show(playEl) two lines after renderTurn(), and that arms the whole panel. nextTurn() calls ' +
      'renderTurn() directly on every later turn with NO arming call anywhere near it, so #dl-roll ' +
      'comes back on screen already enabled (armAllButtons(playEl) at the end of roll() had already ' +
      're-enabled it while it sat hidden). A double-tap aimed at #dl-next -- same screen slot, both ' +
      'are the sole .game-btn-primary in #dl-play -- can put the NEXT player’s #dl-roll under the ' +
      'second contact with nothing gating it. FIXED 2026-08-31: renderTurn() now arms playEl itself, ' +
      'so both call paths are covered and startRound()`s show(playEl) is no longer load-bearing. ' +
      'The assertion below pins that call; it goes red again if the call is removed.',
  ],
  [
    'nextEl',
    "roll()'s setTimeout callback: reveals #dl-next once the tumble settles. Armed two lines below " +
      'via armAllButtons(playEl).',
  ],
  [
    'resetDialogEl',
    'gh#175: the reset-names confirm, opened directly by its trigger with no panel change to hang ' +
      "the arming on -- it is not one of show()'s five PANELS, so armAllButtons has to be called " +
      'here explicitly. Armed on the next line via armAllButtons(resetDialogEl).',
  ],
]);

test('every reveal receiver in dice-loser/main.ts is a known one', () => {
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
  // show(): the panel loop, armed the line right after.
  assert.match(
    source,
    /el\.hidden = el !== panel;\s*\n\s*\}\s*\n\s*if \(panel\) armAllButtons\(panel\);/,
    'el is revealed but the panel-swap in show() lost its adjacent armAllButtons(panel) call',
  );
  // roll(): #dl-next, armed two lines below its reveal.
  assert.match(
    source,
    /nextEl\.hidden = false;\s*\n\s*\}\s*\n\s*if \(playEl\) armAllButtons\(playEl\);/,
    'nextEl is revealed but the arming call after it is missing',
  );
  // renderTurn(): #dl-roll. Was the confirmed gap; fixed 2026-08-31 and pinned here.
  // The `if (playEl)` guard is REQUIRED, not incidental: playEl is nullable and every other arming
  // call in this file guards it the same way, so an assertion demanding a bare call would force
  // code that throws when the element is absent. The intervening hide of #dl-next is pinned too,
  // for the same reason the other two assertions pin their intervening text -- this file matches
  // source, and adjacency IS the property being checked.
  assert.match(
    source,
    /if \(rollEl\) rollEl\.hidden = false;\s*\n\s*if \(nextEl\) nextEl\.hidden = true;\s*\n\s*if \(playEl\) armAllButtons\(playEl\);/,
    'rollEl is revealed by renderTurn() with no arming call next to it on the nextTurn() path — see ' +
      'the rollEl entry in EXPECTED for the game-safety reasoning; main.ts needs a fix, not this test',
  );
  // resetDialogEl (gh#175): showModal(), armed the very next line.
  assert.match(
    source,
    /resetDialogEl\.showModal\(\);\s*\n\s*armAllButtons\(resetDialogEl\);/,
    'resetDialogEl is revealed but the arming call right after showModal() is missing',
  );
});

// Found by adversarial review, 2026-08-31, and invisible to every assertion above: CLOSING the
// dialog is a reveal too. #dl-begin sits behind it, enabled, its own 400ms window long expired --
// and that expiry is exactly why a second contact activates it. The wave shipped three routes whose
// comments argued the opposite ("nothing is rebuilt, so nothing to re-arm"); the rebuild is not the
// hazard, the reveal is. Pinned on the shared closer so all three branches stay covered by one call.
test('closing the reset dialog re-arms the setup screen behind it', () => {
  assert.match(
    source,
    /resetDialogEl\.close\(\);[\s\S]{0,120}?if \(setupEl\) armAllButtons\(setupEl\);/,
    'closeResetDialog no longer arms #dl-setup: a double-tap on close, cancel or confirm puts the ' +
      'second contact on #dl-begin and starts the round with the phone still in one player\'s hand',
  );
});
