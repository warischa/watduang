// gh#264 (REFUTE round 2): on this route the shared player screen mounts INSIDE the menu card, between
// the hero and the game's own how-to and settings, so the menu is the screen's frame. The frame
// without the screen is the route's own menu, and it was painted from first paint until the open
// landed -- seconds on a slow device (the fit probe's first-screen check measured 66 chars of it).
// The invariant: while a player screen is coming, #menuOverlay is never painted until the open that
// shows the screen; with no screen coming (no root, or a mount that threw) the menu shows as before.
//
// Run from main.ts's own text: putAwayRound (the screen's onOpen), the hold release and the boot
// wrapper are sliced, types stripped, and called on the route's real markup with the real shared
// screen mounted. Ceiling: the classes the boot leaves on the node and the stylesheet's no-transition
// hidden state; that Chrome then paints nothing is the fit probe's first-screen check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { sliceBlock } from '../_dom-stub.mjs';
import { makePage, installStorage, settle } from '../_player-screen/screen-harness.mjs';
import game from '../../games/one-bomb.ts';

const here = import.meta.dirname;
const GLUE = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');
const MARKUP = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');
const OVERRIDES = fs.readFileSync(path.join(here, 'overrides.css'), 'utf8');

const HELD = 'held-for-players';

function slice(header) {
  const found = sliceBlock(GLUE, header);
  assert.ok(found, `main.ts no longer declares ${header} -- this test is measuring nothing`);
  return found;
}

/** The page and the sliced functions, bound to it. `mount` stands in for main.ts's mount(): by default an open still in flight. */
async function onPage(markup, mount = () => new Promise(() => {})) {
  installStorage();
  const doc = makePage(markup);
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const round = { accepting: true, live: true };
  const code = stripTypeScriptTypes(
    `${slice('function releaseMenuHold(): void')}\n${slice('function putAwayRound(): void')}\n${slice('function boot(): void')}\n`,
    { mode: 'strip' },
  ) + '\nreturn { releaseMenuHold, putAwayRound, boot };';
  // eslint-disable-next-line no-new-func -- main.ts's own bytes, run against the stub page.
  const fns = new Function('$', 'round', 'mount', code)((id) => doc.getElementById(id), round, mount);
  return { doc, ...fns, menu: doc.getElementById('menuOverlay'), root: doc.getElementById('ob-player-screen') };
}

const held = (el) => el.classList.contains(HELD);
const painted = (el) => !el.classList.contains('hidden') && !held(el);

test('gh#264 r2: the hold class has a hidden state that needs no frame, and keeps the menu in flow', () => {
  const rule = new RegExp(`\\.menuOverlay\\.${HELD}\\s*\\{([^}]*)\\}`).exec(OVERRIDES)?.[1];
  assert.ok(rule, `overrides.css has no .menuOverlay.${HELD} rule, so the class in the markup holds nothing`);
  assert.match(rule, /visibility:\s*hidden\s*!important/);
  assert.match(rule, /opacity:\s*0\s*!important/);
  assert.match(rule, /transition:\s*none\s*!important/, 'a transition here is the same mid-fade the hold exists to remove');
  assert.doesNotMatch(rule, /display:\s*none/, 'display:none takes the overlay out of flow and moves every fit number measured with it');
});

test('gh#264 r2: the menu is held from the markup until the open that shows the screen, and shown with it', async () => {
  const page = await onPage(MARKUP);
  assert.ok(page.root, 'the markup has no #ob-player-screen -- this case is not the converted branch');
  assert.ok(held(page.menu), 'the menu is paintable at FIRST PAINT, before any script ran');
  const { mountPlayerScreen } = await import('../_player-screen/player-screen.ts');
  const screen = mountPlayerScreen({
    root: page.root, range: game.players, onStart() {}, roundActive: () => false, abortRound: page.putAwayRound, onOpen: page.putAwayRound,
  });
  page.boot();
  assert.ok(held(page.menu), 'a boot with a screen coming released the hold before the screen opened');
  screen.open();
  assert.ok(held(page.menu), 'the menu is paintable while the open is still pending');
  await settle();
  assert.equal(page.root.hidden, false, 'the shared screen did not open -- the release below was never reached');
  assert.ok(painted(page.menu), 'the screen opened inside a menu that stayed held: the player screen is invisible');
});

test('gh#264 r2: the release is not animated -- the style is flushed shown with no transition before the class goes', async () => {
  const rule = /\.menuOverlay\.ob-unheld\s*\{([^}]*)\}/.exec(OVERRIDES)?.[1];
  assert.match(rule ?? '', /transition:\s*none\s*!important/, 'no untransitioned release state: the menu fades in over the open screen');
  const page = await onPage(MARKUP);
  const atFlush = [];
  Object.defineProperty(page.menu, 'offsetWidth', { get: () => { atFlush.push([...page.menu.classList.contains(HELD) ? [HELD] : [], ...page.menu.classList.contains('ob-unheld') ? ['ob-unheld'] : []]); return 0; } });
  page.releaseMenuHold();
  assert.deepEqual(atFlush, [['ob-unheld']], 'the style was not flushed in the shown, untransitioned state -- the 0.35s fade-in runs');
  assert.ok(painted(page.menu) && !page.menu.classList.contains('ob-unheld'), 'the release left a class behind, and every later menu fade would be instant');
  page.releaseMenuHold();
  assert.deepEqual(atFlush.length, 1, 'a second release flushed again -- every later open would force a style recalc');
});

test('gh#264 r2: with NO player screen to come (no root), the menu is the first screen and shows', async () => {
  const page = await onPage(MARKUP, () => false);
  page.boot();
  assert.ok(painted(page.menu), 'with no player screen coming, the menu stayed held and the page shows nothing');
});

test('gh#264 REFUTE r2: an open that fails LATER (a rejected migration) releases the hold -- the error stays unhandled', async () => {
  const page = await onPage(MARKUP, () => Promise.reject(new Error('locks refused')));
  const runner = process.listeners('unhandledRejection');
  const seen = [];
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (e) => seen.push(e.message));
  try {
    page.boot();
    assert.ok(held(page.menu), 'the hold went before the open had failed');
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    process.removeAllListeners('unhandledRejection');
    for (const l of runner) process.on('unhandledRejection', l);
  }
  assert.ok(painted(page.menu), 'the open failed and the menu stayed held: the page shows nothing, for good');
  assert.deepEqual(seen, ['locks refused'], 'the failure was swallowed (or reported twice) instead of staying one unhandled rejection');
});

test('gh#264 r2: a mount that throws releases the hold -- the error stays loud, the page is not a dead end', async () => {
  const page = await onPage(MARKUP, () => { throw new Error('mount failed'); });
  assert.throws(() => page.boot(), /mount failed/, 'the mount failure was swallowed');
  assert.ok(painted(page.menu), 'the shared screen will never come, and the menu stayed held: nothing on the page is playable');
});
