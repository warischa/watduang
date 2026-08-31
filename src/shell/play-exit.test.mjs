// gh#144 — pins the PlayExit guard so deleting it cannot ship green: arm-gate-coverage-check globs
// src/games/*.ts only, so nothing else polices this component. These are source-shape assertions
// (the component is an .astro file node cannot execute); the behavioral proof lives in the browser
// probe run recorded on gh#144.
// ponytail: text-marker pinning, not a DOM run — if PlayExit grows real logic branches, move to a
// jsdom/fake-dom run like the game tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const src = readFileSync(new URL('./PlayExit.astro', import.meta.url), 'utf8');

const PLAY_DIR = fileURLToPath(new URL('../play/', import.meta.url));
const PAGES_DIR = fileURLToPath(new URL('../pages/game/', import.meta.url));
const BRIDGE = 'roster-bridge.ts';

/** Both sets are read off the filesystem, never typed in here. A hand-written list of route names
 *  stops covering what it names at the next rename and stays green while doing it: this test read
 *  three of nine bridges for months while calling itself "every play route", and deleting a guard
 *  from one of the six it skipped left the whole suite green.
 *
 *  THIS FILE CONTAINS THE PATTERNS IT LOOKS FOR, in prose and in the matchers below. That is handled
 *  structurally, not by escaping: evidence is only ever read from files NAMED roster-bridge.ts or
 *  play.astro, and this file is neither, so it can never be evidence about itself. */
const dirsWith = (root, child) =>
  readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, child)))
    .map((e) => e.name)
    .sort();

const bridgeRoutes = dirsWith(PLAY_DIR, BRIDGE);
const playRoutes = dirsWith(PAGES_DIR, 'play.astro');

/** Whole-line comments always go. A trailing `//` goes only when no quote opened earlier on the line,
 *  so a `//` living inside a string never truncates real code. String CONTENTS are left intact on
 *  purpose (ADR-0046): a guard's own argument can be a string literal, and blanking it erases
 *  evidence. Prose about a guard is not a guard -- every bridge documents this hazard in a JSDoc
 *  block quoting the very shapes matched below, so matching raw source would fail open. */
function codeOf(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*');
    })
    .map((line) => {
      const i = line.indexOf('//');
      return i > 0 && !/['"`]/.test(line.slice(0, i)) ? line.slice(0, i) : line;
    })
    .join('\n');
}

// A bridge starts the match by clicking the mockup's own start control. `drive(` counts beside
// `.click()` because it IS the click now: armAllButtons leaves controls `disabled` for 400ms and
// `HTMLElement.click()` on a disabled control returns without dispatching, so every bridge routes
// through drive() and src/play/roster-bridge-drive.test.mjs fails any that does not.
const CLICK_SITE = /\.click\(\s*\)|\bdrive\(/g;

/** ponytail: brace depth counted without a string/regex-literal parser -- a `{` inside a string
 *  would mis-pair. No bridge has one today; if that changes, parse instead of counting. */
function blockEnd(code, openBrace) {
  let depth = 0;
  for (let i = openBrace; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}' && (depth -= 1) === 0) return i;
  }
  return -1;
}

/** Does this block leave the function unconditionally? Only a `return` that is a DIRECT child of the
 *  block counts, and only one that opens its own statement. `/return/` anywhere in the block is much
 *  weaker than it reads: it is satisfied by a `return` inside a nested callback (which returns from
 *  the callback, not the function), by a conditional `if (cond) return;`, and by a `return` in an
 *  unrelated function that happens to sit inside the braces. All three leave the start-click site
 *  reachable with `editing` true while the check stays green.
 *
 *  ponytail: brace-depth counting, not control-flow analysis, and that ceiling is REAL, not
 *  theoretical -- depth counting cannot see a `{` inside a string or a regex literal, cannot follow a
 *  brace-less arrow body, and cannot tell dead code from live code. A sound answer needs a parser
 *  (TypeScript's own, since these are .ts files). Not worth it while nine routes share four
 *  hand-written shapes; when a route needs a guard this cannot express, parse instead of widening. */
function blockReturnsUnconditionally(code, openBrace, closeBrace) {
  let depth = 0;
  for (const raw of code.slice(openBrace, closeBrace).split('\n')) {
    const line = raw.trim();
    if (depth === 1 && /^return\b/.test(line)) return true;
    for (const ch of raw) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
  }
  return false;
}

/** Is the LAST click site unreachable while `editing` is true? Reachability, not spelling: the nine
 *  bridges write this guard four different ways, and a regex per spelling is a list of names wearing
 *  a different hat. Two shapes count:
 *    - the click carries the flag itself, `if (!editing && ...) drive(start)`;
 *    - an earlier `if (editing)` BAILS OUT -- a one-line return, or a block that returns.
 *  The block form is brace-matched rather than line-counted because routes that boot on a menu open
 *  an `if (editing) { ... }` block earlier to honour the edit request, and that block does NOT
 *  return; accepting it would leave the start-click site unguarded under a green. */
function startClickIsGuarded(code) {
  let site = -1;
  for (const m of code.matchAll(CLICK_SITE)) site = m.index;
  if (site < 0) return false;

  const line = code.slice(code.lastIndexOf('\n', site) + 1, code.indexOf('\n', site));
  if (/!editing/.test(line)) return true;

  for (const m of code.matchAll(/if \(editing\)\s*(return\s*;|\{)/g)) {
    if (m[1].startsWith('return')) {
      if (m.index + m[0].length < site) return true;
      continue;
    }
    const open = m.index + m[0].length - 1;
    const close = blockEnd(code, open);
    if (close > 0 && close < site && blockReturnsUnconditionally(code, open, close)) return true;
  }
  return false;
}

test('the X renders disabled — inert until armed, never a live tap surface on load', () => {
  assert.match(src, /<button[^>]*id="play-exit"[^>]*\bdisabled\b/);
});

test('the edit-players control renders disabled AND hidden — same guard as the X, shown only once the script confirms a saved group', () => {
  assert.match(src, /<button[^>]*id="play-edit-players"[^>]*\bdisabled\b[^>]*\bhidden\b/);
  // The player-visible label, verbatim Thai.
  assert.match(src, /แก้ผู้เล่น/);
});

test('one arm gate drives BOTH controls — a second control cannot arm on its own schedule', () => {
  // The gate operates over the controls list, so adding a control cannot bypass it: pin the loop
  // that sets `disabled` over the list rather than a per-id line.
  assert.match(src, /for\s*\(const c of controls\)\s*c\.el\.disabled\s*=\s*true/);
  assert.match(src, /setTimeout\(\s*\(\)\s*=>\s*\{[\s\S]*?for\s*\(const c of controls\)\s*c\.el\.disabled\s*=\s*false;[\s\S]*?\},\s*ARM_DELAY_MS\s*\)/);
  assert.match(src, /controls\.push\(\s*\{\s*el:\s*editBtn/);
});

test('the edit control re-enters the mockup setup through the shared bridge, never a second setup UI', () => {
  assert.match(src, /import\s*\{[^}]*requestSetupEdit[^}]*\}\s*from\s*['"][^'"]*_setup-bridge/);
  assert.match(src, /run:\s*requestSetupEdit/);
});

test('every play route persists what its setup finishes with, and answers the edit request', () => {
  assert.ok(bridgeRoutes.length >= 9, `found ${bridgeRoutes.length} roster bridges — expected every play route with a saved group`);
  for (const id of bridgeRoutes) {
    const bridge = codeOf(path.join(PLAY_DIR, id, BRIDGE));
    // Registrations, not prose: the write-back call and the flag read, plus the one thing that makes
    // the edit flow different from the seeded flow (setup is left on screen, not started).
    // The persisted control's constant is named per route (START on most, NAMES_DONE where the
    // setup finishes on a names step), so the shape is pinned, not one route's vocabulary.
    assert.match(bridge, /saveOnSetupComplete\(\s*[A-Z][A-Z_0-9]*,\s*NAME_INPUT\s*\)/, `${id} does not persist its setup`);
    assert.match(bridge, /takeSetupEditRequest\(\)/, `${id} ignores the edit request`);
    // The guard's effect at the start-click site, not the identifier: a `const editing = ...`
    // declaration, or a guard that bails somewhere else, must not satisfy this.
    assert.ok(startClickIsGuarded(bridge), `${id} starts the match even when editing`);
  }
});

test('the arm delay is the shared arm-gate constant, not a local copy that can drift', () => {
  assert.match(src, /import\s*\{[^}]*ARM_DELAY_MS[^}]*\}\s*from\s*['"][^'"]*_arm-gate/);
});

test('any contact restarts the quiet window — a tap burst keeps the X disarmed', () => {
  // Pin the listener REGISTRATIONS, not prose: comments in the component mention these words too,
  // so a bare word-match would stay green with the whole listener block deleted.
  assert.match(src, /addEventListener\(\s*['"]pointerdown['"]/);
  assert.match(src, /addEventListener\(\s*['"]pointerup['"]/);
  assert.match(src, /addEventListener\(\s*['"]pointercancel['"]/);
  assert.match(src, /setTimeout\([\s\S]*?ARM_DELAY_MS\s*\)/);
});

test('bfcache restore resets the exit state — the X works after browser back', () => {
  assert.match(src, /addEventListener\(\s*['"]pageshow['"]/);
});

test('every play route mounts the shared PlayExit', () => {
  // Derived from the pages tree, not from the bridge set: a play route with no saved group still
  // needs the exit, so this set is the wider one and covers routes with no roster-bridge.ts.
  assert.ok(playRoutes.length >= bridgeRoutes.length, `found ${playRoutes.length} play routes but ${bridgeRoutes.length} bridges`);
  for (const id of playRoutes) {
    const page = readFileSync(path.join(PAGES_DIR, id, 'play.astro'), 'utf8');
    assert.match(page, /PlayExit/, `${id} play route is missing PlayExit`);
  }
});
