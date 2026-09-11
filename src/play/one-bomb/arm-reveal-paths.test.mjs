// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for one-bomb.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? This route does — and the gate would stay green with every call but one deleted, because it
// counts calls per DIRECTORY, not per reveal. The real rule (ADR-0014, ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger.
//
// THIS ROUTE'S SHAPE IS NOT THE OTHER ELEVEN'S, and that is what this file has to account for. The
// screens belong to a lifted engine (main.js) that is a sealed IIFE: it reveals a screen by flipping
// a class inside a closure with no hook, and the reveal that matters most — the result card, which
// puts "รอบต่อไป" under the finger that just tapped the bomb — lands well after that tap. No arming
// call can be written next to those reveals without editing a file scripts/extract-mockup.mjs owns.
// So main.ts OBSERVES them instead, and the pin below is a SET EQUALITY between the screens the
// engine reveals and the screens main.ts watches. A twelfth screen added to the engine by a
// re-extraction therefore fails this test on the day it lands, which is the property a hand-typed
// list of receivers could not give this route.
//
// ponytail: matched on source text, not on a parsed AST. Two stated ceilings, same as the other
// eleven: (1) a receiver renamed later still surfaces as unexpected and still fails — it does not
// slip through, it just reads worse; (2) this proves the observer and the call sites EXIST, never
// that the 400ms window really disables anything in a browser. Only scripts/arm-gate-probe.mjs
// proves that, and this test claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;

/** Whole-line comments are dropped: both files document their own reveal seams in prose, and a
 *  checker cannot tell use from mention. Only full-line comments go — a trailing `//` inside a string
 *  would take real code with it, and nothing here needs that. */
function readCode(name) {
  return fs
    .readFileSync(path.join(here, name), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const engine = readCode('main.js');
const main = readCode('main.ts');

/** EVERY WAY THIS ROUTE MAKES SOMETHING APPEAR, read off its own source rather than off a general
 *  list of DOM idioms — the two checks below share it so neither can be widened without the other.
 *  What main.ts actually uses: `classList.add('show')` (the toast and the result card),
 *  `classList.add('open')` (the two modals), `classList.remove('hidden')` (the HUD and the menu),
 *  `classList.remove('ob-away')` (the board wrapper) and `showModal()` (the reset confirm).
 *  `hidden = false` is carried because the sibling routes use it and a re-write here might.
 *
 *  Their opposites are deliberately absent: `add('hidden')`, `add('ob-away')` and `remove('show')`
 *  are HIDES, and `add('active' | 'loser' | 'is-bomb' | 'is-open')` and `toggle('on')` restyle a
 *  control that was already on screen. A hide puts nothing under a finger. */
const REVEAL_IDIOM =
  "hidden\\s*=\\s*false\\b|showModal\\(\\)|classList\\.add\\('(?:show|open)'\\)|classList\\.remove\\('(?:hidden|ob-away)'\\)";

// A reveal in the lifted engine is one of two class writes, and which one depends on how the screen
// spells "away": #hud and #menuOverlay carry `hidden` while they are gone, so REMOVING it reveals
// them; #resultCard and the two modals carry `show`/`open` while they are present, so ADDING it
// reveals them. `.classList.add('hidden')` is a HIDE and matches neither branch.
const ENGINE_REVEAL_RE =
  /getElementById\('([\w-]+)'\)\.classList\.(?:remove\('hidden'\)|add\('(?:show|open)'\))/g;

// The transient toast is deliberately NOT a screen: it carries no control, it is never tapped, and it
// takes itself away on a timer. It reveals through a captured local (`t.classList.add('show')`), not
// through a getElementById chain, so the pattern above does not see it either — recorded here so a
// reader does not go looking for a missing entry.
const NOT_A_SCREEN = new Set(['toast']);

test('main.ts watches every screen the lifted engine reveals', () => {
  const revealed = [...new Set([...engine.matchAll(ENGINE_REVEAL_RE)].map((m) => m[1]))]
    .filter((id) => !NOT_A_SCREEN.has(id))
    .sort();
  assert.ok(
    revealed.length > 0,
    'the engine reveal pattern matched nothing in main.js — this test would pass vacuously',
  );

  // The watched set, read out of REVEAL_CONTAINERS in main.ts rather than retyped here: a list typed
  // in a test is a second copy that can agree with nothing.
  const watched = [...new Set([...main.matchAll(/\{\s*id:\s*'([\w-]+)',\s*cls:/g)].map((m) => m[1]))].sort();
  assert.ok(watched.length > 0, 'REVEAL_CONTAINERS no longer parses out of main.ts — this test is measuring nothing');

  assert.deepEqual(
    watched,
    revealed,
    'the screens main.ts arms and the screens the lifted engine reveals have drifted apart: an ' +
      'engine screen nobody watches comes back on screen with its buttons already enabled, and a ' +
      'watched id the engine never reveals arms nothing. The arm-gate CI check will not tell you — ' +
      'it is already green.',
  );
});

test('the observer arms on the rising edge only, and it arms the screen that appeared', () => {
  // Rising edge: arming on every mutation would re-arm a screen that merely restyled, and arming
  // without the was/now comparison would re-arm on the HIDE too, disabling the screen a player just
  // arrived on. Both halves are pinned because both are what makes the observer a reveal gate rather
  // than a mutation counter.
  assert.match(
    main,
    /const now = visible\(\);\s*\n\s*if \(now && !wasVisible\) armAllButtons\(el\);\s*\n\s*wasVisible = now;/,
    'the engine-reveal observer lost its rising-edge comparison or its armAllButtons call',
  );
  assert.match(
    main,
    /\.observe\(el, \{ attributes: true, attributeFilter: \['class'\] \}\)/,
    'the observer no longer watches the class attribute, which is the only signal the sealed engine emits',
  );
});

test('ADR-0057: closing a modal arms what it was covering', () => {
  // No class on the screen BEHIND a modal changes when the modal closes, so the observer above is
  // blind to this one and it needs its own listener. This is the case three routes in this repo
  // shipped a comment arguing AGAINST ("nothing is rebuilt, so nothing to re-arm") — the control
  // behind the modal is enabled and its arm window expired long ago, which is exactly why a second
  // contact fires it.
  assert.match(
    main,
    /closest\('\.closeModal'\)[\s\S]{0,120}armWhatTheModalCovered\(\)/,
    "the engine's modal close path no longer arms the screen behind it",
  );
  assert.match(
    main,
    /function armWhatTheModalCovered[\s\S]{0,400}armAllButtons\(el\)/,
    'armWhatTheModalCovered no longer arms anything',
  );
});

test('ADR-0057: the backdrop close is gated at the PRESS, and the board behind it is armed', () => {
  // The measured defect this pins: with the settings modal up, one 120ms press on the backdrop over
  // a stone closed the modal AND took `.ob-tile.is-open` from 0 to 1, with nothing disabled. A plain
  // tap does not reproduce it — the press has to outlast the visibility transition (0.001s under
  // forced reduced motion), after which the release hit-tests against the board underneath. Two
  // things carry the fix and neither had a guard; each half below reds on its own.

  // HALF ONE — the arming runs on a document-capture `pointerdown`. Capture is what puts it ahead of
  // the engine's own backdrop close, which is the last moment a gate can still disable the stone
  // before that click is dispatched. The bubble-`click` registration stays alongside it and is
  // pinned by the test above via `.closeModal`: a click-built window anchors to the RELEASE, a
  // pointerdown-built one to the PRESS, and a long press needs both.
  const registration = main.match(
    /document\.addEventListener\(\s*'pointerdown',\s*([A-Za-z_$][\w$]*)\s*,\s*true\s*\)/,
  );
  assert.ok(
    registration,
    'the backdrop close is no longer gated on a document-capture pointerdown: by the time any click ' +
      'runs the overlay is already hidden, so the release of the press that closed the modal is ' +
      'hit-tested against the board and opens a stone',
  );
  const [, handlerName] = registration;
  const definedAt = main.indexOf(handlerName);
  assert.match(
    main.slice(definedAt, registration.index),
    // The CALL form, not the bare name: `armWhatTheModalCovered(): void` in the declaration would
    // satisfy a looser pattern if this slice ever grew backwards past it.
    /armWhatTheModalCovered\(\);/,
    `the document-capture pointerdown handler ${handlerName} no longer arms what the modal covered`,
  );

  // HALF TWO — that arming reaches #ob-board-wrap. The board is this route's own DOM, deliberately
  // NOT in REVEAL_CONTAINERS (the set-equality test above is right to keep it out), so it is armed
  // explicitly and nothing else watches it. Read out of the function's OWN slice: a fixed-length
  // window would run into the next function and let a sibling satisfy the match, and the id also
  // appears in this file's markup string, which is not an arming call.
  const from = main.indexOf('function armWhatTheModalCovered');
  assert.notEqual(from, -1, 'armWhatTheModalCovered no longer exists in main.ts');
  const next = main.indexOf('\nfunction ', from + 1);
  const body = main.slice(from, next === -1 ? main.length : next);
  assert.match(
    body,
    /'ob-board-wrap'[\s\S]{0,200}armAllButtons\(/,
    'closing a modal no longer arms #ob-board-wrap: the board is armed on rebuild and on nothing ' +
      'else, so every stone a modal was covering is still enabled with its arm window long expired',
  );
});

test('gh#215: the WebGL-loss path reveals nothing, which is the only reason it needs no arming', () => {
  // The halt panel this used to pin was retired on 2026-09-11: a lost context now costs the 3D
  // backdrop and the DOM round plays on. So the assertion inverts rather than disappears. The loss
  // can land with a finger already down on the canvas, and anything the handler put under that
  // finger would take the release of a tap aimed at a stone — a reveal, which ADR-0057 and ADR-0059
  // make an armed region with every close path gated. While it reveals nothing there is nothing to
  // arm, and the day it reveals again this test says so instead of shipping the hole.
  //
  // Read off the REGISTRATION, so a renamed handler is still the one measured.
  const registered = main.match(/addEventListener\('webglcontextlost',\s*([A-Za-z_$][\w$]*)/);
  assert.ok(registered, 'main.ts no longer registers a webglcontextlost handler — this test is measuring nothing');
  const from = main.indexOf(`function ${registered[1]}`);
  assert.notEqual(from, -1, `main.ts registers ${registered[1]} for the loss but declares no such function`);
  const next = main.indexOf('\nfunction ', from + 1);
  const body = main.slice(from, next === -1 ? main.length : next);
  assert.doesNotMatch(
    body,
    new RegExp(`insertAdjacentHTML|${REVEAL_IDIOM}`),
    'the loss path reveals something again. It is a reveal under a finger that may already be down ' +
      'on the canvas: arm the region it puts up, and give its close path a case in this file',
  );
});

test("the route's own reveals — the reset confirm — are armed at their call sites", () => {
  // main.ts reveals exactly one thing of its own: the reset-names confirm dialog. It is not one of
  // the engine's screens and no observer covers it, so it arms itself on open, and the screen behind
  // it arms on every one of the three ways out (cancel, confirm, and the confirm's re-render).
  assert.match(
    main,
    /dialog\?\.showModal\(\);\s*\n\s*if \(dialog\) armAllButtons\(dialog\);/,
    'the reset confirm is revealed with no arming call next to it',
  );
  // ONE HANDLER PER SLICE, and that bound is the whole assertion. A fixed-length window starting at
  // the control's id runs past the end of its own handler into the next one, and the sibling's
  // armSetup() then satisfies the match — measured: deleting the cancel path's armSetup() left this
  // test green until the slice was cut at the next `$('` instead. Each handler is now read alone.
  const handler = (control) => {
    const from = main.indexOf(`$('${control}')`);
    assert.notEqual(from, -1, `${control} is no longer wired in main.ts`);
    const next = main.indexOf("$('", from + 3);
    return main.slice(from, next === -1 ? main.length : next);
  };
  for (const [control, why] of [
    ['ob-reset-cancel', 'the cancel path'],
    ['ob-reset-confirm', 'the confirm path'],
  ]) {
    assert.match(
      handler(control),
      /dialog\?\.close\(\);[\s\S]{0,160}armSetup\(\)/,
      `${why} closes the confirm without arming the setup screen behind it (ADR-0057)`,
    );
  }
});

test('every reveal receiver in one-bomb/main.ts is a known one', () => {
  // The same shape the other eleven routes use, kept so a reveal written into main.ts in some OTHER
  // form than the observer — a `hidden = false`, a second showModal — cannot land unnoticed. Widened
  // to the class-write idioms this route reveals with: those were the hole, because main.ts makes a
  // screen appear that way far more often than it sets a property.
  const REVEAL_RE = new RegExp(`([\\w.?'"()$\\-]+?)\\.(?:${REVEAL_IDIOM})`, 'g');
  const EXPECTED = new Map([
    [
      'dialog?',
      'the reset-names confirm, opened by its own trigger with no engine screen change to hang the ' +
        'arming on. Armed on the next line via armAllButtons(dialog).',
    ],
    // The five screens the observer owns. main.ts writes the same class the engine writes, so its
    // own reveal raises the same rising edge and is armed by watchEngineReveals — the set equality
    // at the top of this file is what keeps that true.
    ["$('hud')?", 'a REVEAL_CONTAINERS screen: remove(hidden) raises the observer that arms it'],
    ["$('menuOverlay')?", 'a REVEAL_CONTAINERS screen: remove(hidden) raises the observer that arms it'],
    ["$('resultCard')?", 'a REVEAL_CONTAINERS screen: add(show) raises the observer that arms it'],
    ["$('howModal')?", 'a REVEAL_CONTAINERS modal: add(open) raises the observer that arms it'],
    ["$('settingsModal')?", 'a REVEAL_CONTAINERS modal: add(open) raises the observer that arms it'],
    [
      "$('ob-board-wrap')?",
      'the board wrapper, un-hidden by startMatch. Not observer-armed and it does not need to be: ' +
        'the stones inside it are rebuilt by renderBoard on the same call and armed there, which is ' +
        'the arm the gh#170 close-path case already pins.',
    ],
    [
      'toast',
      'NOT a screen, and the same exemption NOT_A_SCREEN records for the engine\'s copy: it carries ' +
        'no control, is never tapped, and takes itself away on a 900ms timer.',
    ],
  ]);
  const found = [...new Set([...main.matchAll(REVEAL_RE)].map((m) => m[1]))];
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  assert.deepEqual(
    found.filter((r) => !EXPECTED.has(r)).sort(),
    [],
    'new reveal path(s) in main.ts: decide whether each one puts a <button> under the finger, arm ' +
      'the revealed element if it does, and add it to EXPECTED with the reason.',
  );
  assert.deepEqual(
    [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort(),
    [],
    'EXPECTED names reveal receivers that no longer exist',
  );
});
