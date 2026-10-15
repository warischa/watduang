// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for dice-loser.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? It counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger -- and since ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Two halves since gh#264 (ADR-0071):
//   1. main.ts's OWN reveals -- its five panels and the two turn controls -- pinned by the receiver
//      each one writes to, on source text. A new receiver fails on the day it is added.
//   2. The SHARED PLAYER SCREEN mounted into #dl-players, which replaced this route's stepper, name
//      rows, reset control and reset dialog (and that dialog's arming paths). Its reveals are driven
//      for real (revealPathCases): the shared code over THIS route's markup.html with the real arm
//      gate. This route's header holds no control, so the case reads #dl-begin instead: a button
//      outside the screen's root and inside #app, which a screen that armed only its own root -- or
//      one mounted outside #app -- leaves live, and that reds here.
//
// ponytail, for half 1: matched on source text, not on a parsed AST, so (1) a one-expression reveal
// is recorded under its whole receiver text and still fails as unexpected, and (2) this proves the
// CALL SITE exists next to the reveal, never the browser-level 400ms (owner ruling on issue #232).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { revealPathCases } from '../_player-screen/screen-harness.mjs';

// No compiled main.js exists for this route: dice-loser ships main.ts straight from src/play, like
// timebomb. The regexes below match plain text, so TypeScript syntax is inert to them.
const MAIN = path.join(import.meta.dirname, 'main.ts');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
// Whole-line comments are dropped: main.ts documents its own reveal seams in prose, and a checker
// cannot tell use from mention. Only full-line comments go -- a trailing `//` inside a string would
// take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// This route reveals a control by clearing the native `hidden` attribute. Two shapes count: a literal
// `= false`, and show()'s loop form `el.hidden = el !== panel` (false exactly when `el` is the panel
// being switched to). showModal() is matched too, so a dialog added back to this file surfaces here.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:hidden\s*=\s*(?:false\b|\w+\s*!==\s*\w+)|showModal\(\))/g;

// receiver -> why it is or is not armed. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'el',
    "show(): the screen-to-screen path, all five panels (rule/play/summary/tiebreak/final). Armed " +
      'on the next line via armAllButtons(panel).',
  ],
  [
    'rollEl',
    'renderTurn(): reveals #dl-roll. nextTurn() calls renderTurn() directly on every later turn with ' +
      'no panel change, so renderTurn() arms playEl itself (fixed 2026-08-31); the assertion below ' +
      'pins that call.',
  ],
  [
    'nextEl',
    "roll()'s setTimeout callback: reveals #dl-next once the tumble settles. Armed two lines below " +
      'via armAllButtons(playEl).',
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
  assert.match(
    source,
    /el\.hidden = el !== panel;\s*\n\s*\}\s*\n\s*if \(panel\) armAllButtons\(panel\);/,
    'el is revealed but the panel-swap in show() lost its adjacent armAllButtons(panel) call',
  );
  assert.match(
    source,
    /nextEl\.hidden = false;\s*\n\s*\}\s*\n\s*if \(playEl\) armAllButtons\(playEl\);/,
    'nextEl is revealed but the arming call after it is missing',
  );
  // The `if (playEl)` guard is REQUIRED: playEl is nullable and every other arming call in this file
  // guards it the same way. The intervening hide of #dl-next is pinned too: adjacency IS the property.
  assert.match(
    source,
    /if \(rollEl\) rollEl\.hidden = false;\s*\n\s*if \(nextEl\) nextEl\.hidden = true;\s*\n\s*if \(playEl\) armAllButtons\(playEl\);/,
    'rollEl is revealed by renderTurn() with no arming call next to it on the nextTurn() path',
  );
});

// gh#264: the player screen is mounted into #dl-players and nowhere else, and it is that root's ONLY
// arming owner -- a second arm of the root here would be a racing duplicate of the screen's own.
test('the shared player screen is mounted into #dl-players, which sits inside the #app it arms', () => {
  assert.match(source, /const playersEl = document\.getElementById\('dl-players'\)/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: playersEl,/);
  assert.match(source, /onStart: startWithPlayers,/, 'the handoff is handed over by name (seat-cap-check runs it)');
  assert.doesNotMatch(source, /armAllButtons\(\s*playersEl\b/, 'main.ts arms #dl-players itself again');
  assert.ok(MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="dl-players"'), '#dl-players must sit inside #app');
  assert.match(MARKUP, /<section id="dl-setup"[^>]*\bhidden\b/, 'the rule screen must not ship over the player screen');
});

// The route's own setup is gone, not hidden: no stepper, no name rows, no reset, no private list.
test('no route-local player setup survives beside the shared screen', () => {
  for (const id of ['dl-count-dec', 'dl-count-inc', 'dl-count-num', 'dl-reset-names', 'dl-reset-dialog', 'dl-player-name']) {
    assert.ok(!MARKUP.includes(id) && !source.includes(id), `#${id} or .${id} is still in the route`);
  }
  assert.doesNotMatch(source, /STORE_KEY|localStorage|saveOnSetupComplete|takeSetupEditRequest|renderRows|setCount/);
});

// ADR-0071 ruling 6 needs the round put away when it is ended AND when the screen opens over a
// finished one; both go through putAwayRound. A live round is one of the three round panels.
test('the round is put away through putAwayRound on abort and on open; the result screen is not a round', () => {
  assert.match(source, /abortRound: putAwayRound,/);
  assert.match(source, /onOpen: putAwayRound,/);
  const at = source.indexOf('function roundActive');
  assert.ok(at > -1, 'roundActive is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('\n}', at));
  assert.match(body, /playEl/);
  assert.match(body, /summaryEl/);
  assert.match(body, /tiebreakEl/);
  assert.doesNotMatch(body, /finalEl|setupEl/, 'the result and rule screens hold nothing to lose');
  const away = source.indexOf('function putAwayRound');
  assert.ok(away > -1, 'putAwayRound is gone — this test measures nothing');
  assert.match(source.slice(away, source.indexOf('\n}', away)), /clearTimeout\(rollTimer\)/,
    'a roll in flight would land its faces on a round that was put away');
});

// Every way back to the players goes through the shared screen, never a bare panel swap.
test('the result screen\'s new-setup control opens the shared screen', () => {
  const at = source.indexOf('newSetupEl?.addEventListener');
  assert.ok(at > -1, 'the new-setup wiring is gone — this test measures nothing');
  assert.match(source.slice(at, source.indexOf(');', at) + 2), /screen\??\.open\(\)/);
});

// The shared screen's reveal paths, driven over THIS route's markup.
revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'dl-players', headerId: 'dl-begin', label: 'dice-loser' });
