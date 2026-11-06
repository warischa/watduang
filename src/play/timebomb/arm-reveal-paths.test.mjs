// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for timebomb.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? It counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is per reveal: the
// second contact of a double-tap must not land on a control the first contact just put under the
// finger. And since ADR-0057, every close, cancel and confirm path is a reveal too.
//
// Since gh#264 (ADR-0071) this route has three kinds of surface, each armed by its owner:
//   1. The SHARED PLAYER SCREEN mounted into #tb-setup, with its mid-round confirm, its reset confirm
//      and its undo bar. Its reveal paths are driven for real below (revealPathCases): the shared
//      screen's code over this route's own markup.html, with the real arm gate, reading this route's
//      own header control. That is what makes them THIS route's cases: a screen mounted outside
//      #app, or one that armed only its own root, leaves #tb-mute live and reds here.
//   2. The engine's #tb-stage, armed by the engine itself at mount (src/games/timebomb.ts). Not this
//      file's code, and pinned below as deliberately NOT armed a second time.
//   3. The header (#tb-top), on screen from first paint, armed by main.ts at load.
//
// The source-text cases keep the two stated ceilings of the other routes' tests: (1) matched on
// text, not an AST; (2) a call site next to a reveal, never proof of a browser-level 400ms. The
// driven cases are not text: they run the screen and read the gate's effect on real nodes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mountOnPage, revealPathCases } from '../_player-screen/screen-harness.mjs';
import { closeStaleEditConfirm } from './stale-edit-confirm.ts';

const MAIN = path.join(import.meta.dirname, 'main.ts');
const MARKUP = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
// Whole-line comments are dropped: main.ts documents its own reveal seams in prose, and a checker
// cannot tell use from mention.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// The ways this file makes something visible: unhiding an element, or a modal dialog.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:hidden\s*=\s*false|showModal\(\))/g;

// receiver -> why it is or is not armed here. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'stageEl',
    'begin(): the stage the engine mounts into. Deliberately NOT armed by main.ts — the engine arms ' +
      'the whole stage itself at mount time via armAllButtons(stage). Arming it again here would be ' +
      'a second, driftable copy of that gate, not a fix for a gap.',
  ],
]);

test('every reveal receiver in timebomb/main.ts is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, arm the revealed element if it does, and add it to EXPECTED with the reason.',
  );
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

test('the play stage is not armed a second time by this file', () => {
  assert.doesNotMatch(
    source,
    /armAllButtons\(\s*stageEl\b/,
    'stageEl now has its own armAllButtons call — the engine already arms the whole stage at mount.',
  );
});

// gh#264: the player screen is mounted into #tb-setup and nowhere else, and it is #tb-setup's ONLY
// arming owner now -- a second arm of #tb-setup here would be a racing duplicate of the screen's own.
test('the shared player screen is mounted into #tb-setup, which sits inside the #app it arms', () => {
  assert.match(source, /const setupEl = document\.getElementById\('tb-setup'\)/);
  assert.match(source, /mountPlayerScreen\(\{\s*root: setupEl,/);
  assert.doesNotMatch(source, /armAllButtons\(\s*setupEl\b/, 'main.ts arms #tb-setup itself again');
  assert.ok(MARKUP.indexOf('id="app"') < MARKUP.indexOf('id="tb-setup"'), '#tb-setup must sit inside #app');
});

// ADR-0071 ruling 6 needs the round to be put away when it is ended AND when the screen opens over a
// finished one. Both go through putAwayRound, which is the only code that re-hides the stage.
test('the stage is put away only through putAwayRound, wired to both abortRound and onOpen', () => {
  assert.match(source, /abortRound: putAwayRound,/);
  assert.match(source, /onOpen: putAwayRound,/);
  const hides = [...source.matchAll(/stageEl\.hidden\s*=\s*true/g)];
  assert.equal(hides.length, 1, 'one place re-hides the stage');
  const at = source.indexOf('function putAwayRound');
  assert.ok(at > -1 && hides[0].index > at && hides[0].index < source.indexOf('\n}', at), 'and it is putAwayRound');
});

// A live round is the fuse burning, not the result screen after the bang.
test('roundActive reads the burning fuse, not merely a visible stage', () => {
  const at = source.indexOf('function roundActive');
  assert.ok(at > -1, 'roundActive is gone — this test measures nothing');
  assert.match(source.slice(at, source.indexOf('\n}', at)), /querySelector\('#tb-fuse'\)/);
});

// gh#165: the sound toggle sits in the page header with no reveal write of its own, so it needs an
// unconditional arm at first paint. Sliced first, matched second: a lazy unbounded match over the
// whole source would find some other armAllButtons(topEl) and stay green with this one deleted.
test('gh#165: the sound toggle is armed at first paint, not just at a reveal', () => {
  const at = source.indexOf('if (muteEl && topEl) {');
  assert.ok(at > -1, 'the first-paint arm block is gone — this test measures nothing');
  const end = source.indexOf('\n}', at);
  assert.ok(end > at, 'the first-paint arm block has no top-level close — this test measures nothing');
  assert.match(source.slice(at, end), /armAllButtons\(topEl\)/);
});

// The shared screen's reveal paths, driven over THIS route's markup and read off THIS route's header.
revealPathCases({ test, assert, routeMarkup: MARKUP, rootId: 'tb-setup', headerId: 'tb-mute', label: 'timebomb' });

// gh#295 A2 (d). The mid-round confirm ("เล่นรอบนี้ต่อ" / end the round) asks about a round that is
// running. When the fuse runs out under it, the question is void -- there is no round left to keep
// playing -- so the route closes it. That close is a reveal (ADR-0057): the boom screen and the header
// come out from under the dialog, and a finger already on its way to the dialog's answer lands on
// them. The close must arm both, through the screen's own gate.
// The engine's boom screen is stood in for by one button with its id; the engine itself is not run.
async function confirmOpenAtDetonation(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'tb-setup', roster: ['ต้น', 'มายด์'], round: true });
  const dialog = page.byId('ps-edit-dialog');
  page.doc.dispatchEvent({ type: page.ps.EDIT_EVENT });
  assert.equal(dialog.open, true, 'setup: a live round did not ask first');
  const again = page.doc.createElement('button');
  again.setAttribute('id', 'tb-again');
  page.byId('tb-stage').append(again);
  t.mock.timers.tick(401);
  assert.equal(page.byId('tb-mute').disabled, false, 'setup: the header must be live before the close');
  assert.equal(again.disabled, false, 'setup: the boom control must be live before the close');
  page.live.round = false; // the fuse ran out
  return { page, dialog, again };
}

test('gh#295: the bomb going off closes the mid-round confirm, and the close arms what it uncovers', async (t) => {
  const { page, dialog, again } = await confirmOpenAtDetonation(t);
  assert.equal(closeStaleEditConfirm(page.doc, page.screen.arm), true);
  assert.equal(dialog.open, false, 'the confirm still offers to keep playing a round that is over');
  assert.equal(page.byId('tb-mute').disabled, true, 'the close did not arm the header it uncovered');
  assert.equal(again.disabled, true, 'the close did not arm the boom screen it uncovered');
  t.mock.timers.tick(401);
  assert.equal(again.disabled, false, 'the boom control never came back after the window');
});

test('gh#295: with no confirm open, the detonation closer does nothing and arms nothing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await mountOnPage({ routeMarkup: MARKUP, rootId: 'tb-setup', roster: ['ต้น', 'มายด์'] });
  t.mock.timers.tick(401);
  assert.equal(closeStaleEditConfirm(page.doc, page.screen.arm), false);
  assert.equal(page.byId('tb-mute').disabled, false, 'a closer with nothing to close armed the header anyway');
});

// The wiring: the stage observer runs the closer when the boom screen appears, with the screen's own
// gate. Sliced to the observer callback first, so another call elsewhere cannot keep this green.
test('gh#295: main.ts runs the closer from the stage observer when the boom screen appears', () => {
  const at = source.indexOf('new MutationObserver(');
  assert.ok(at > -1, 'the stage observer is gone — this test measures nothing');
  const body = source.slice(at, source.indexOf('.observe(stageEl', at));
  assert.match(body, /querySelector\('#tb-again'\)/, 'the observer no longer recognises the boom screen');
  assert.match(body, /closeStaleEditConfirm\(document, playerScreen\.arm\)/, 'the observer does not close the stale confirm');
});
