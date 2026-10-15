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

/** Both sets are read off the filesystem, never typed in here. A hand-written list of route names
 *  stops covering what it names at the next rename and stays green while doing it: this test read
 *  three of nine bridges for months while calling itself "every play route", and deleting a guard
 *  from one of the six it skipped left the whole suite green.
 *
 *  THIS FILE CONTAINS THE PATTERNS IT LOOKS FOR, in prose and in the matchers below. That is handled
 *  structurally, not by escaping: evidence is only ever read from play.astro files and from shipped
 *  .ts modules under src/play/, and this file is neither (it is a .test.mjs under src/shell/), so it
 *  can never be evidence about itself. Test files under a route directory are excluded for the same
 *  reason -- a route's own test naming a guard is prose about the guard, not the guard. */
const dirsWith = (root, child) =>
  readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(root, e.name, child)))
    .map((e) => e.name)
    .sort();

const playRoutes = dirsWith(PAGES_DIR, 'play.astro');

/** The set that owes an answer to the edit request is the set that OFFERS the control: every route
 *  whose play.astro mounts PlayExit. That set is owned by the pages tree, so it is derived from it
 *  here and never hand-listed (gh#185: a loop over a narrower, file-derived set once excluded two
 *  routes by construction while a floor kept it green). */
const mountingRoutes = playRoutes.filter((id) =>
  /PlayExit/.test(readFileSync(path.join(PAGES_DIR, id, 'play.astro'), 'utf8')),
);

/** A route's controller: its whole shipped .ts plus a lifted main.js. Tests are excluded (see above),
 *  and comments are stripped by codeOf. Read for EXISTENCE only -- that the controller mounts the ONE
 *  shared player screen, which answers the in-place request, is scripts/player-screen-mount-check.mjs's
 *  verdict, by parser. Null means there is no controller at all. */
const routeCode = (id) => {
  const dir = path.join(PLAY_DIR, id);
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((f) => (f.endsWith('.ts') || f === 'main.js') && !f.endsWith('.test.ts'))
    .map((f) => codeOf(path.join(dir, f)))
    .join('\n');
};

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

test('the X renders disabled — inert until armed, never a live tap surface on load', () => {
  assert.match(src, /<button[^>]*id="play-exit"[^>]*\bdisabled\b/);
});

test('the edit-players control renders disabled AND hidden — same guard as the X, shown only once the shared screen announces itself', () => {
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

// gh#264 / ADR-0071: every play route mounts the shared player screen, so the edit control has ONE
// answer -- ask that screen, in place. The flag-then-reload path through the per-route bridges is
// retired with the last bridge. Pinned on source here, and driven for real by the execution tests below.
test('the edit control asks the shared screen in place -- no bridge, no flag, no reload', () => {
  assert.doesNotMatch(src, /_setup-bridge|requestSetupEdit|sessionStorage|location\.reload/);
  assert.match(src, /document\.dispatchEvent\(new CustomEvent\('watduang:edit-players'\)\)/);
});

test('every route that mounts the edit control has a controller to answer it', () => {
  // Tied to the real set, not to a floor: a `>= 9` count passes while the two routes that leak are
  // outside the loop. If a play route stops mounting PlayExit, that shows up here as a mismatch
  // rather than as silently shrinking coverage.
  assert.equal(
    mountingRoutes.length,
    playRoutes.length,
    `${playRoutes.length} play routes but only ${mountingRoutes.length} mount PlayExit`,
  );
  // What stays here is the pair of facts that live in the pages tree -- the mounting set equals the
  // play-route set, and every mounted route has a controller at all. That the controller mounts the
  // shared screen, which answers the request, is the mount gate's (by parser, every route, no floor).
  for (const id of mountingRoutes) {
    assert.ok(routeCode(id), `${id} mounts PlayExit but has no src/play/${id}/ controller to answer the edit request`);
  }
  // The handoff is named, so deleting the gate that took over reds HERE rather than silently
  // dropping the invariant on the floor.
  assert.ok(
    existsSync(fileURLToPath(new URL('../../scripts/player-screen-mount-check.mjs', import.meta.url))),
    'the mount gate is gone -- nothing proves every route mounts the screen that answers the edit request',
  );
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
  // Derived from the pages tree: an empty set would make the loop below measure nothing.
  assert.notEqual(playRoutes.length, 0, 'no play routes found -- this loop is measuring nothing');
  for (const id of playRoutes) {
    const page = readFileSync(path.join(PAGES_DIR, id, 'play.astro'), 'utf8');
    assert.match(page, /PlayExit/, `${id} play route is missing PlayExit`);
  }
});

// ---- gh#264: the edit control's one answer, EXECUTED --------------------------------------------
//
// The component's script is run for real over a small fake page: its TypeScript stripped, its one
// import stubbed (an import of anything else throws, so a bridge or roster import coming back reds),
// its listeners driven by dispatching pointer events at the document. What it proves: with the shared
// screen announced (the attribute on <html>) the control sends the edit request, does NOT reload, and
// re-gates the controls rather than latching; with no screen announced it is never offered.
import { stripTypeScriptTypes } from 'node:module';

function runPlayExit({ sharedScreen }) {
  const script = src.slice(src.indexOf('<script>') + '<script>'.length, src.indexOf('</script>'));
  const timers = [];
  const docListeners = {};
  const events = [];
  const html = { attrs: new Map(sharedScreen ? [['data-player-screen', sharedScreen]] : []) };
  html.getAttribute = (n) => (html.attrs.has(n) ? html.attrs.get(n) : null);
  const button = (id) => ({
    id, disabled: true, hidden: id === 'play-edit-players', listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    contains(node) { return node === this; },
    getBoundingClientRect: () => ({ left: 0, right: 44, top: 0, bottom: 44 }),
  });
  const exit = button('play-exit');
  const edit = button('play-edit-players');
  const calls = { reload: 0, navigated: null };
  const document = {
    documentElement: html,
    getElementById: (id) => ({ 'play-exit': exit, 'play-edit-players': edit }[id] ?? null),
    addEventListener: (type, fn) => { (docListeners[type] ??= []).push(fn); },
    dispatchEvent: (ev) => { events.push(ev.type); for (const fn of docListeners[ev.type] ?? []) fn(ev); return true; },
  };
  const window = {
    addEventListener() {},
    location: { set href(v) { calls.navigated = v; }, reload() { calls.reload += 1; } },
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const modules = {
    '../games/_arm-gate': {
      ARM_DELAY_MS: 400,
      inputClockGate: () => ({ hold() {}, anchor() {}, isOpen: () => true }),
    },
  };
  const js = stripTypeScriptTypes(script, { mode: 'strip' })
    .replace(/^\s*import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm, (_m, names, spec) => `const {${names}} = __mod(${JSON.stringify(spec)});`);
  new Function('__mod', 'document', 'window', 'CustomEvent', 'setTimeout', 'clearTimeout', 'Node', js)(
    (spec) => { if (!(spec in modules)) throw new Error(`unstubbed import ${spec}`); return modules[spec]; },
    document, window, CustomEvent,
    (fn) => { timers.push(fn); return timers.length; }, () => {}, Object,
  );
  const flush = () => { while (timers.length) timers.shift()(); };
  const fire = (type, target) => {
    for (const fn of docListeners[type] ?? []) fn({ type, target, timeStamp: 1e6, clientX: 10, clientY: 10 });
  };
  const tap = (el) => { fire('pointerdown', el); fire('pointerup', el); };
  return { exit, edit, calls, events, flush, tap, document };
}

test('gh#264: with no shared screen announced the control is never offered, and nothing reloads', () => {
  const page = runPlayExit({ sharedScreen: null });
  assert.equal(page.edit.hidden, true, 'nothing on this page answers the request, so it is not offered');
  page.flush();
  page.tap(page.edit);
  assert.equal(page.calls.reload, 0, 'the retired reload path is gone');
  page.flush();
  page.tap(page.exit);
  assert.equal(page.calls.navigated, '/', 'the X still leaves');
});

test('gh#264: a route on the shared screen edits in place -- the request goes to the screen, nothing reloads, the gate re-arms', () => {
  const page = runPlayExit({ sharedScreen: 'closed' });
  assert.equal(page.edit.hidden, false, 'shown while the shared screen is closed, saved names or not');
  page.flush();
  page.tap(page.edit);
  assert.deepEqual(page.events, ['watduang:edit-players'], 'the in-place request was sent once');
  assert.equal(page.calls.reload, 0, 'and the page did not reload');
  assert.equal(page.edit.disabled, true, 'the controls are re-gated over what just appeared');
  page.flush();
  page.tap(page.exit);
  assert.equal(page.calls.navigated, '/', 'no one-way latch was left behind: the X still leaves');
});

test('gh#264: on a converted route the control follows the screen -- hidden while it is open', () => {
  const page = runPlayExit({ sharedScreen: 'open' });
  assert.equal(page.edit.hidden, true, 'open on load: the control would offer what is on screen');
  page.document.documentElement.attrs.set('data-player-screen', 'closed');
  page.document.dispatchEvent({ type: 'watduang:player-screen', detail: { open: false } });
  assert.equal(page.edit.hidden, false, 'shown once the screen closes');
});

// The names are spelled in the component (it imports nothing of the screen's, on purpose); they must
// stay the names the screen actually uses.
test('gh#264: the component spells the shared screen\'s attribute and event names exactly', async () => {
  const ps = await import('../play/_player-screen/player-screen.ts');
  assert.ok(src.includes(`'${ps.SCREEN_ATTR}'`), 'SCREEN_ATTR drifted');
  assert.ok(src.includes(`'${ps.EDIT_EVENT}'`), 'EDIT_EVENT drifted');
  assert.ok(src.includes(`'${ps.STATE_EVENT}'`), 'STATE_EVENT drifted');
});
