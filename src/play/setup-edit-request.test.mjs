// gh#169, pinned at the CLASS rather than at the one route the ticket names.
//
// The invariant, in one sentence: a bridge must never consume the edit request and then leave the
// device somewhere that is not the setup screen. `takeSetupEditRequest()` clears on read (that
// clear-on-read is deliberate -- it is what stops a manual refresh from trapping the device on
// setup), so a bridge that reads the flag and then bails eats the request, and the edit control
// reads as a dead button.
//
// WHY THE ASSERTION IS PER ROUTE. Ten mockups do not boot on the same screen:
//
//   * A route whose mockup opens on a MENU or a HERO needs a control clicked to reach setup. If the
//     bridge bails before clicking it, the reload lands on the menu with the flag gone -- gh#169
//     exactly. Those routes carry a `nav` selector below and must click it.
//   * A route whose mockup opens ON its own setup screen (or on the first step of it) needs no
//     click at all: the reload already shows setup, so the request WAS honoured. Those routes carry
//     `nav: null`, and what is pinned for them is that the bridge navigates nowhere -- a future
//     edit that makes one of them auto-start or step past setup on an under-two roster reds here.
//
// The route list is read off the filesystem, not hand-listed, and a bridge with no entry in the
// classification table fails: the next port has to be classified rather than silently uncovered.
//
// DIVERGENT INPUT: the edit flag set AND exactly one stored name (an empty group, a one-entry
// roster). Two or more names measures nothing -- both a fixed and an unfixed bridge seed the fields
// and reach setup.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** What each mockup boots on, and therefore what its bridge owes an edit request it cannot seed.
 *  `nav` is the selector that must be clicked to REACH setup; null means setup is already on screen. */
const BOOTS_ON = {
  // #screen-menu carries `class="screen active"` in markup.html -- setup is a click away.
  'zero-trigger': { nav: '#btn-goto-setup' },
  // Opens on a marketing hero; its setup view does not exist until this control renders it.
  'short-stick': { nav: '#btn-start-setup' },
  // The four below render their name fields at load -- their bridges fill them with no navigation.
  'cannon-flag': { nav: null },
  'cursed-number': { nav: null },
  'freeze-tap': { nav: null },
  'pinocchio-luck': { nav: null },
  // Opens on a menu whose #btn-menu-start is what renders the seat fields -- setup is a click away.
  'wire-snip-panic': { nav: '#btn-menu-start' },
  // These two open on the COUNT step, which is step one of their own setup, not a menu.
  'how-close-is-near': { nav: null },
  'power-meter': { nav: null },
};

const EDIT_KEY = 'watduang:edit-players';

/** Rewrites one import into a stub lookup. THREE shapes, because the eleven controllers use three:
 *  `{ named }`, a bare default, and a default followed by names. The old one-liner handled only the
 *  first and emitted `const game, { rollDice } = ...` for the third -- a SyntaxError, which is why
 *  neither main.ts route could be executed at all. An unrecognised shape THROWS.
 *  `import type { ... } from` needs no case: stripTypeScriptTypes blanks the whole statement, and an
 *  inline `type Foo` specifier inside a named list too. */
function rewriteImport(binding, spec, seq) {
  const req = `__require(${JSON.stringify(spec)})`;
  const named = /^(?:([A-Za-z_$][\w$]*)\s*,\s*)?(\{[\s\S]*\})$/.exec(binding.trim());
  if (named && !named[1]) return `const ${named[2]} = ${req};`;
  // A default binding reads `.default` when the stub offers one, and otherwise IS the stub -- the
  // nine bridge stubs hand back a plain object of named exports and must keep working unchanged.
  const tmp = `__imp${seq}`;
  if (named) return `const ${tmp} = ${req}; const ${named[1]} = ${tmp}.default ?? ${tmp}; const ${named[2]} = ${tmp};`;
  if (/^[A-Za-z_$][\w$]*$/.test(binding.trim())) return `const ${tmp} = ${req}; const ${binding.trim()} = ${tmp}.default ?? ${tmp};`;
  throw new Error(`unhandled import shape in ${spec}: ${JSON.stringify(binding)}`);
}

/** Evaluates a source file that is written for the bundler, not for node: its imports are
 *  extensionless and its types are TS. Strip the types, turn every import into a stub lookup, drop
 *  `export`, and run the module body -- the same "execute the real text" idiom as
 *  mascot-defaults.test.mjs, which slices mockup functions out of main.js. */
function evaluateModule(file, resolve, globals) {
  const raw = fs.readFileSync(file, 'utf8');
  let seq = 0;
  const js = stripTypeScriptTypes(raw, { mode: 'strip' })
    .replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm, (_m, binding, spec) => rewriteImport(binding, spec, seq++))
    .replace(/^export\s+/gm, '');
  const exported = [...raw.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
  const keys = ['__require', ...Object.keys(globals)];
  // eslint-disable-next-line no-new-func -- executing the shipped file is the whole point.
  return new Function(...keys, `${js}\n;return { ${exported.join(', ')} };`)(
    resolve,
    ...Object.keys(globals).map((k) => globals[k]),
  );
}

/** One tab's sessionStorage, shared across however many routes the test loads into it. `reads`
 *  records what each getItem of the edit flag ACTUALLY returned, which is how the cross-game leg
 *  below observes that the second game never saw the flag rather than inferring it from the map. */
function makeTab(initial = {}) {
  const store = new Map(Object.entries(initial));
  const reads = [];
  return {
    store,
    reads,
    getItem(k) {
      const v = store.has(k) ? store.get(k) : null;
      if (k === EDIT_KEY) reads.push(v);
      return v;
    },
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

/** What is left in the tab, read from the map rather than through getItem so a read-back never
 *  pollutes the `reads` log the cross-game leg asserts on. */
const flagIn = (tab) => (tab.store.has(EDIT_KEY) ? tab.store.get(EDIT_KEY) : null);

/** The shared seam both loaders run against: the REAL _setup-bridge.ts, so takeSetupEditRequest's
 *  read-and-clear is the one under test and not a re-implementation of it. */
const makeSeam = (globals) => evaluateModule(path.join(here, '_setup-bridge.ts'), (spec) => {
  if (spec.endsWith('shell/roster')) return { loadRoster: () => ({ names: () => ['เอ'], add: async () => {} }), saveGroup: () => {} };
  if (spec.endsWith('name-list.ts')) return { hasVisibleChar: (s) => s.trim().length > 0 };
  throw new Error(`unstubbed import in _setup-bridge.ts: ${spec}`);
}, globals);

/** One run of one bridge: fake sessionStorage with the flag set, a roster of exactly one name, and
 *  a document that records every control the bridge clicks rather than rendering a mockup. */
function runBridge(route, sessionStorage = makeTab({ [EDIT_KEY]: '1' })) {
  const clicks = [];
  const control = (selector) => ({
    click() { clicks.push(selector); },
    disabled: false,
    textContent: '',
    dataset: {},
    value: '',
    maxLength: 0,
    dispatchEvent: () => true,
  });
  const document = {
    readyState: 'complete',
    addEventListener() {},
    querySelector: (sel) => control(sel),
    // No mockup is rendered, so no fields exist yet -- which is also true of the real menu screen.
    querySelectorAll: () => [],
    getElementById: (id) => control(`#${id}`),
  };
  const globals = { document, window: { addEventListener() {}, location: { reload() {} } }, sessionStorage, Event: class { constructor(type) { this.type = type; } } };

  const seam = makeSeam(globals);

  evaluateModule(path.join(here, route, 'roster-bridge.ts'), (spec) => {
    // The divergent input: one name in the roster, nothing in the group.
    if (spec.endsWith('shell/roster')) return { loadGroup: () => [], loadRoster: () => ({ names: () => ['เอ'] }) };
    if (spec.endsWith('_setup-bridge')) return seam;
    if (spec.includes('_mascots')) return { applyMascotDefaults: () => {} };
    if (spec.includes('/games/')) return { MAX_PLAYERS: 10 };
    throw new Error(`unstubbed import in ${route}: ${spec}`);
  }, globals);

  return { clicks, flag: flagIn(sessionStorage) };
}

/** Twenty stand-ins for the shared cast. Only the LENGTH and the two fields the setup screens read
 *  matter here -- src/play/mascot-defaults.test.mjs is what pins the real cast. */
const MASCOTS = Array.from({ length: 20 }, (_, i) => ({ name: `m${i}`, emoji: '*' }));

/** The two routes that own their setup screen outright answer from `main.ts`, with no bridge and no
 *  mockup to drive. They get a document whose every lookup returns null, and that is the STRICT
 *  apparatus rather than a weak one: both controllers read elements through getElementById and
 *  null-guard every use, so the module body runs to the end and only its UNCONDITIONAL top-level
 *  statements have an effect. A route that moved its takeSetupEditRequest() inside `if (someEl)`
 *  therefore reds here -- correctly, because a clear that needs an element can be skipped on the
 *  real page too. src/games/_fake-dom.mjs is not reused on purpose: it models an element tree for an
 *  engine mounting into a root, and has no getElementById and no document-level listeners, which is
 *  the whole surface a play-route controller reads. */
function loadMainRoute(route, sessionStorage) {
  const localStore = new Map();
  const globals = {
    document: {
      readyState: 'complete',
      addEventListener() {},
      removeEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => { throw new Error(`${route} rendered a row against a document with no fields`); },
    },
    window: { addEventListener() {}, removeEventListener() {}, location: { reload() {} } },
    sessionStorage,
    localStorage: {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k),
    },
    Event: class { constructor(type) { this.type = type; } },
  };

  const seam = makeSeam(globals);

  evaluateModule(path.join(here, route, 'main.ts'), (spec) => {
    // Same divergent input as the bridges: one name, so nothing seeds and nothing auto-starts.
    if (spec.endsWith('shell/roster')) return { loadGroup: () => [], loadRoster: () => ({ names: () => ['เอ'] }), saveGroup: () => {} };
    if (spec.endsWith('shell/session')) return { loadSession: () => ({ played: [], markPlayed: () => {} }) };
    if (spec.endsWith('_setup-bridge')) return seam;
    if (spec.includes('_arm-gate')) return { armAllButtons: () => {} };
    if (spec.includes('_mascots')) return {
      MASCOTS,
      mascotNames: (n) => MASCOTS.slice(0, n).map((m) => m.name),
      resetCastNames: (names) => names.map(() => ''),
    };
    // The engine, imported default-plus-named. Only the declared range is read at module scope; the
    // rule functions are reached from a control this document does not have.
    if (spec.includes('/games/')) return {
      default: { players: [2, 10], dispose: () => {}, mount: () => {} },
      MAX_PLAYERS: 10,
      rollDice: () => ({ pips: [] }),
      resolveRound: () => ({ losingScore: 0, losers: [] }),
      CONDITION_LABEL: { HIGH_LOSES: 'x', LOW_LOSES: 'y' },
    };
    if (spec.includes('bomb-canvas')) return { startBombCanvas: () => {} };
    throw new Error(`unstubbed import in ${route}/main.ts: ${spec}`);
  }, globals);

  return { clicks: [], flag: flagIn(sessionStorage) };
}

/** Loads one route's controller into a tab. Which file that is belongs to the route, not to this
 *  test: nine ports answer from roster-bridge.ts, two from main.ts. */
const loadRoute = (route, tab) =>
  (fs.existsSync(path.join(here, route, 'roster-bridge.ts')) ? runBridge : loadMainRoute)(route, tab);

const routes = fs
  .readdirSync(here, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(here, d.name, 'roster-bridge.ts')))
  .map((d) => d.name);

// ---- the eleven routes that offer the edit control ---------------------------------------------
//
// DERIVED, and from two independent places, because the count is where gh#185 went wrong: a set
// built from `roster-bridge.ts` yields NINE and leaves timebomb and dice-loser outside the loop BY
// CONSTRUCTION, which a `>= 9` floor then reports as green.
//
//   * the route directory (src/pages/game/<id>/play.astro) is what SHIPS the edit control, and
//   * src/games/manifest.ts is the registry of what a game even is.
//
// The equality below is against the derived count, never a floor: if a play route stops mounting
// PlayExit, or a new route lands, this reds instead of quietly shrinking.
const PAGES_DIR = path.join(here, '..', 'pages', 'game');
const GAMES_DIR = path.join(here, '..', 'games');

const playRoutes = fs
  .readdirSync(PAGES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(PAGES_DIR, d.name, 'play.astro')))
  .map((d) => d.name)
  .sort();

const mountingRoutes = playRoutes.filter((id) =>
  /PlayExit/.test(fs.readFileSync(path.join(PAGES_DIR, id, 'play.astro'), 'utf8')),
);

/** Registered in the manifest AND declaring itself party. ADR-0040: the fortune pages and the
 *  randomizer tools are not games and have no roster, so they can never be in this set. */
const partyGames = [...fs.readFileSync(path.join(GAMES_DIR, 'manifest.ts'), 'utf8')
  .matchAll(/^import\s+\w+\s+from\s+'\.\/([\w-]+)\.ts';$/gm)]
  .map((m) => m[1])
  .filter((id) => /category:\s*'party'/.test(fs.readFileSync(path.join(GAMES_DIR, `${id}.ts`), 'utf8')));

test('every play route has a gh#169 classification', () => {
  // A new port with no entry is uncovered, and an uncovered bridge is where this defect came back.
  assert.notEqual(routes.length, 0, 'no bridges found -- this file is measuring nothing');
  for (const route of routes) assert.ok(BOOTS_ON[route], `${route} is unclassified: does its mockup boot on setup, or does it need a control clicked?`);
});

for (const route of routes) {
  test(`${route}: an edit request with one stored name is not eaten`, () => {
    const { nav } = BOOTS_ON[route] ?? {};
    const { clicks, flag } = runBridge(route);
    if (nav) {
      // gh#169's own definition of done: open the setup screen, or leave the request for next time.
      assert.ok(
        flag === '1' || clicks.includes(nav),
        `${route} consumed the edit request and clicked ${JSON.stringify(clicks)} -- the reload lands on the menu with the flag gone`,
      );
    } else {
      // Setup is already what the reload shows; the bridge owes it only that it does not leave.
      assert.deepEqual(clicks, [], `${route} boots on setup, so an under-two roster should drive nothing`);
    }
  });
}

// ---- gh#185 / gh#188: the round trip, not the source shape -------------------------------------
//
// What replaced what, and why. src/shell/play-exit.test.mjs used to assert `takeSetupEditRequest()`
// appears in each route's source. That pinned SPELLING: it stays green on a call that is dead code,
// on a call inside a branch nothing reaches, and on a call whose return value is thrown away before
// the clear -- and it says nothing about the one thing a player feels, which is the NEXT game in the
// same tab opening on its setup screen. These tests set the flag, execute the route, and read the
// tab back.

test('the eleven routes that offer the edit control are derived, not listed', () => {
  assert.equal(
    mountingRoutes.length,
    playRoutes.length,
    `${playRoutes.length} play routes but only ${mountingRoutes.length} mount PlayExit: ${JSON.stringify(playRoutes.filter((id) => !mountingRoutes.includes(id)))}`,
  );
  // Printed so the number this file loops over is readable in the run, not inferred from a pass.
  console.log(`round trip covers ${mountingRoutes.length} routes: ${mountingRoutes.join(', ')}`);
  for (const id of mountingRoutes) {
    assert.ok(partyGames.includes(id), `${id} ships a play route but is not a registered party game`);
    assert.ok(
      fs.existsSync(path.join(here, id, 'roster-bridge.ts')) || fs.existsSync(path.join(here, id, 'main.ts')),
      `${id} mounts the edit control but has no controller in src/play/${id}/ to answer it`,
    );
  }
  // The trap, stated as an assertion: the bridge set is STRICTLY smaller, so a loop over it is not
  // this loop. If a future edit points the round trip at `routes`, this reds.
  assert.ok(routes.length < mountingRoutes.length, 'the bridge set is no longer smaller than the mounting set -- re-derive');
});

for (const route of mountingRoutes) {
  test(`${route}: an edit request is CLEARED by loading the route, not just mentioned in its source`, () => {
    const tab = makeTab({ [EDIT_KEY]: '1' });
    loadRoute(route, tab);
    assert.equal(
      tab.store.has(EDIT_KEY) ? tab.store.get(EDIT_KEY) : null,
      null,
      `${route} left ${EDIT_KEY} in sessionStorage -- the next party game opened in this tab lands on its setup screen`,
    );
  });
}

test('after ระเบิดเวลา, no other party game in the same tab sees the edit flag', () => {
  // The Goal, executed end to end in one tab: the chrome's pill writes the flag, timebomb loads, and
  // then every other route is opened into the SAME store. `reads` is what each of those routes got
  // back from getItem -- an inference from the map would not distinguish "never set" from "cleared
  // after being seen", and only the second is honouring the request.
  const tab = makeTab({ [EDIT_KEY]: '1' });
  loadRoute('timebomb', tab);
  assert.equal(tab.store.has(EDIT_KEY), false, 'timebomb ate the reload and left the flag behind');

  for (const next of mountingRoutes.filter((id) => id !== 'timebomb')) {
    const before = tab.reads.length;
    loadRoute(next, tab);
    const seen = tab.reads.slice(before);
    assert.ok(seen.length > 0, `${next} never read ${EDIT_KEY} at all -- it cannot be honouring or declining a request it does not look at`);
    assert.deepEqual(
      seen.filter((v) => v !== null),
      [],
      `${next}, opened after timebomb, saw the edit flag and will open on its setup screen`,
    );
    assert.equal(tab.store.has(EDIT_KEY), false, `${next} wrote ${EDIT_KEY} back into the tab`);
  }
});
