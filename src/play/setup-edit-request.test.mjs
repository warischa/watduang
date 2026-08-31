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

/** Evaluates a source file that is written for the bundler, not for node: its imports are
 *  extensionless and its types are TS. Strip the types, turn every import into a stub lookup, drop
 *  `export`, and run the module body -- the same "execute the real text" idiom as
 *  mascot-defaults.test.mjs, which slices mockup functions out of main.js. */
function evaluateModule(file, resolve, globals) {
  const raw = fs.readFileSync(file, 'utf8');
  const js = stripTypeScriptTypes(raw, { mode: 'strip' })
    .replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm, (_m, binding, spec) => `const ${binding} = __require(${JSON.stringify(spec)});`)
    .replace(/^export\s+/gm, '');
  const exported = [...raw.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
  const keys = ['__require', ...Object.keys(globals)];
  // eslint-disable-next-line no-new-func -- executing the shipped file is the whole point.
  return new Function(...keys, `${js}\n;return { ${exported.join(', ')} };`)(
    resolve,
    ...Object.keys(globals).map((k) => globals[k]),
  );
}

/** One run of one bridge: fake sessionStorage with the flag set, a roster of exactly one name, and
 *  a document that records every control the bridge clicks rather than rendering a mockup. */
function runBridge(route) {
  const clicks = [];
  const store = new Map([[EDIT_KEY, '1']]);
  const sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
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

  const seam = evaluateModule(path.join(here, '_setup-bridge.ts'), (spec) => {
    if (spec.endsWith('shell/roster')) return { loadRoster: () => ({ names: () => ['เอ'], add: async () => {} }), saveGroup: () => {} };
    if (spec.endsWith('name-list.ts')) return { hasVisibleChar: (s) => s.trim().length > 0 };
    throw new Error(`unstubbed import in _setup-bridge.ts: ${spec}`);
  }, globals);

  evaluateModule(path.join(here, route, 'roster-bridge.ts'), (spec) => {
    // The divergent input: one name in the roster, nothing in the group.
    if (spec.endsWith('shell/roster')) return { loadGroup: () => [], loadRoster: () => ({ names: () => ['เอ'] }) };
    if (spec.endsWith('_setup-bridge')) return seam;
    if (spec.includes('_mascots')) return { applyMascotDefaults: () => {} };
    if (spec.includes('/games/')) return { MAX_PLAYERS: 10 };
    throw new Error(`unstubbed import in ${route}: ${spec}`);
  }, globals);

  return { clicks, flag: sessionStorage.getItem(EDIT_KEY) };
}

const routes = fs
  .readdirSync(here, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(here, d.name, 'roster-bridge.ts')))
  .map((d) => d.name);

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
