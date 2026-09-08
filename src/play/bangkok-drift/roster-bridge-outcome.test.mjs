// gh#205 box 2 -- the outcome, not the mechanism.
//
// src/play/roster-bridge-drive.test.mjs pins the SET of bridges that route every click through
// drive(). It never asks what the click DID: a click landing on a disabled control, a reveal that
// got rebuilt underneath it, or a start handler that bails, all still pass that test while the
// mockup's own name-entry screen stays on screen. That is the gap this file closes.
//
// The invariant, stated once and asserted below: after the bridge seeds a roster that already has a
// group of two or more, the setup screen is not the active screen and the round ("turn") screen is.
//
// Both roster-bridge.ts and the setup slice of main.js are executed for real against one shared fake
// document -- the same "strip TS, stub the imports, run the real body" idiom as
// src/play/setup-edit-request.test.mjs (whose helpers are not exported, so a smaller equivalent is
// rebuilt here for the two files this test actually runs, both of which carry only named imports),
// and the same "slice the shipped bytes with a marker" idiom as this route's own
// drift-rules.test.mjs. Nothing about screen state, seeding or driving is reimplemented -- every
// screen toggle and every click this test observes is the shipped main.js and roster-bridge.ts.
//
// A 4-name roster is chosen on purpose: it matches main.js's own default game.count, so the seeded
// field count already equals the target and the stepper (#incPlayerBtn/#decPlayerBtn) is never
// exercised -- driving it would need a real renderRoster() rebuild, which is a DOM-tree feature this
// harness deliberately does not model (out of scope: this test is not about the stepper).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const HERE = import.meta.dirname;
const PLAY = path.join(HERE, '..');
const MAIN = path.join(HERE, 'main.js');

/** Strips TS types and rewrites every top-level named import into a stub lookup. Only the shape both
 *  files under test actually use -- `import { a, b } from '...'`, named only, no default -- so an
 *  import that stops matching throws loudly here instead of silently running against nothing. */
function evaluateModule(file, resolve, globals) {
  const raw = fs.readFileSync(file, 'utf8');
  const js = stripTypeScriptTypes(raw, { mode: 'strip' })
    .replace(/^import\s+(\{[^}]*\})\s+from\s+'([^']+)';/gm, (_m, names, spec) => `const ${names} = __require(${JSON.stringify(spec)});`)
    .replace(/^export\s+/gm, '');
  assert.ok(!/^import\s/m.test(js),
    `${path.basename(file)} carries an import shape this harness does not handle: ${js.match(/^import.*/m)}`);
  const exported = [...raw.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
  const keys = ['__require', ...Object.keys(globals)];
  // eslint-disable-next-line no-new-func -- executing the shipped file is the whole point.
  return new Function(...keys, `${js}\nreturn { ${exported.join(', ')} };`)(resolve, ...Object.values(globals));
}

// Every id the sliced main.js body reads via $()/getElementById, including the five SCREENS ids
// show() walks -- a real DOM returns null for anything not in this list, which is what lets the
// "element exists" assertions below catch a typo instead of reading a phantom node.
const KNOWN_IDS = new Set([
  'bd-cancel-reset-names', 'bd-confirm-reset-names', 'bd-modal-reset-names', 'bd-reset-names',
  'decPlayerBtn', 'incPlayerBtn', 'live', 'roster', 'startGameBtn', 'turn-count', 'turn-name',
  'screen-setup', 'screen-turn', 'screen-drive', 'screen-result', 'screen-final',
]);

/** One fake element: a real classList (backed by a Set, not the inert no-op _dom-stub.mjs uses), and
 *  a click() that fires this element's OWN listeners -- the same thing armAllButtons's target and
 *  roster-bridge.ts's drive() both act on. No document-level dispatch: neither module under test
 *  needs it to reach the invariant (saveOnSetupComplete's capture listeners register against a
 *  document.addEventListener that is a deliberate no-op below, exactly as setup-edit-request.test.mjs
 *  already gets away with, and for the same reason -- nothing here ever fires them). */
function makeEl(id) {
  const classes = new Set();
  const listeners = {};
  return {
    id,
    disabled: false,
    textContent: '',
    value: '',
    maxLength: 0,
    dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => { (on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c); },
      contains: (c) => classes.has(c),
    },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    click() {
      if (this.disabled) return;
      for (const fn of listeners.click || []) fn({ type: 'click', target: this });
    },
  };
}

/** One fake document, plus the roster-input fixtures a real renderRoster() would have already put on
 *  screen -- pre-populated rather than rendered, since rendering them is not what this test is about. */
function makeRoot(seatCount) {
  const byId = new Map();
  const rosterInputs = Array.from({ length: seatCount }, () => {
    const input = makeEl(undefined);
    input.maxLength = 15;
    return input;
  });
  const document = {
    readyState: 'complete',
    getElementById(id) {
      if (!KNOWN_IDS.has(id)) return null;
      if (!byId.has(id)) byId.set(id, makeEl(id));
      return byId.get(id);
    },
    querySelector(sel) {
      if (sel === '.roster-input') return rosterInputs[0] ?? null;
      if (sel.startsWith('#')) return document.getElementById(sel.slice(1));
      throw new Error(`test document: unhandled selector ${sel}`);
    },
    querySelectorAll(sel) {
      if (sel === '.roster-input') return rosterInputs;
      throw new Error(`test document: unhandled selector ${sel}`);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { document, el: (id) => document.getElementById(id) };
}

/** Runs the real main.js setup/round wiring plus the real roster-bridge.ts against one shared
 *  document, seeded with a saved group of `groupNames`. Returns the document accessor so a test can
 *  read back whichever screen it cares about. */
function run(groupNames) {
  const { document, el } = makeRoot(4); // main.js's own default game.count
  // markup.html boots with #screen-setup carrying class="screen active" -- seeded here rather than
  // assumed, so the assertions below observe a real transition and not a screen that was never on.
  el('screen-setup').classList.add('active');
  const globals = { document, Event: class { constructor(type) { this.type = type; } } };

  // main.js is a real ES module with no build step here, so its shipped bytes from the two logic
  // markers (drift-rules.test.mjs's own seam) through the setup/round wiring are evaluated directly --
  // everything after showTurn() needs a canvas this harness has no reason to model and is cut off.
  const mainSrc = fs.readFileSync(MAIN, 'utf8');
  const start = mainSrc.indexOf('// @logic-start');
  const end = mainSrc.indexOf("$('readyBtn')");
  assert.ok(start !== -1 && end > start,
    'main.js no longer carries its logic markers or the readyBtn wiring -- this test would measure nothing');
  new Function(
    'document', 'armAllButtons', 'MASCOTS', 'mascotEmoji', 'matchMedia',
    mainSrc.slice(start, end),
  )(document, () => {}, [], () => '', () => ({ matches: false }));

  // roster-bridge.ts runs on import (document.readyState is 'complete' above), so evaluating it here
  // IS the seed-and-drive this test is about.
  evaluateModule(path.join(HERE, 'roster-bridge.ts'), (spec) => {
    if (spec.endsWith('shell/roster')) {
      return { loadGroup: () => groupNames, loadRoster: () => ({ names: () => groupNames }) };
    }
    if (spec.endsWith('_setup-bridge')) {
      return evaluateModule(path.join(PLAY, '_setup-bridge.ts'), (setupSpec) => {
        if (setupSpec.endsWith('shell/roster')) return { loadRoster: () => ({ add: async () => {} }), saveGroup: () => {} };
        if (setupSpec.endsWith('name-list.ts')) return { hasVisibleChar: (n) => n.trim().length > 0 };
        throw new Error(`unstubbed import in _setup-bridge.ts: ${setupSpec}`);
      }, globals);
    }
    if (spec.endsWith('_mascots')) return { applyMascotDefaults: () => {} };
    if (spec.endsWith('games/bangkok-drift')) return { MAX_PLAYERS: 10 };
    throw new Error(`unstubbed import in roster-bridge.ts: ${spec}`);
  }, globals);

  return { el };
}

test('a device with a saved group of two or more never sees the setup screen: the round screen replaces it', () => {
  const { el } = run(['เอ', 'บี', 'ซี', 'ดี']);

  // Element existence is its own assertion, with its own message -- a `?.` here would read a typo'd
  // id as a silent pass instead of the loud failure a wrong selector deserves.
  const setupScreen = el('screen-setup');
  const turnScreen = el('screen-turn');
  assert.ok(setupScreen, 'screen-setup does not exist in the test document');
  assert.ok(turnScreen, 'screen-turn does not exist in the test document');

  // The invariant: after the bridge seeds a >=2-name group, the setup screen is not the active
  // screen and the round screen is. `.active` is what this route's CSS keys `display: none` vs
  // `display: flex` on (style.css: `.screen { display: none }` / `.screen.active { display: flex }`),
  // so it is the player-visible signal, not a bookkeeping flag.
  assert.equal(setupScreen.classList.contains('active'), false,
    'the setup screen is still the active screen after seeding a returning device\'s group -- ' +
      'the mockup\'s own name-entry screen reappeared instead of the round starting');
  assert.equal(turnScreen.classList.contains('active'), true,
    'the round screen never became active -- seeding a saved group did not drive the device into the round');
});
