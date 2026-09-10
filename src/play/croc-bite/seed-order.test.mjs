// The one bug `docs/agents/porting-a-mockup-game.md` names THIS engine for: a roster bridge that
// seeds before the engine has built a single seat field. Nothing throws, nothing is logged — the
// bridge queries `.mascot-name-input`, gets an empty list, returns, and a group that typed its names
// once is asked to type them again.
//
// Which makes this the check that guide requires be broken on purpose before its green is trusted,
// and both ways it can break are planted and recorded: the registration moved to `document`, and the
// registration replaced by the ready-state-immediate branch the other bridges take. Each one is a
// one-line edit that looks equivalent, and each one puts this file's assertions red.
//
// SO THE HARNESS MODELS ORDER, and that is the only reason it is not simply a source grep. Three
// facts about a browser are modelled and nothing else is:
//   * every listener on `document`'s DOMContentLoaded runs before ANY listener on `window`'s;
//   * within one target, listeners run in registration order;
//   * a deferred module body runs while `document.readyState` is already past 'loading', so a
//     ready-state-immediate branch fires at module scope.
// The engine is represented by the only thing about it that matters here: a `window` listener,
// registered first (main.js is imported first), that publishes `__khengApp` and builds the fields.
//
// ponytail: no jsdom, no build. What that costs is stated: this proves the bridge cannot run before
// the fields exist, never that Chrome fires the two events in the order modelled above (that is
// platform behaviour, not this route's) and never that the engine's real renderMascotInputs runs in
// its own boot — src/play/croc-bite/setup-badge-icon.test.mjs is what runs that builder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
// The real ceiling, from the module the bridge itself reads it from: a retyped 6 here would go on
// agreeing with a game whose range had moved (ADR-0065).
import { MAX_PLAYERS } from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const BRIDGE = path.join(here, 'roster-bridge.ts');

/** The names a returning group already told this device. More than MAX_PLAYERS on purpose: the
 *  ceiling is part of what the seeding has to respect. */
const STORED = ['ต้น', 'เบียร์', 'มิ้น', 'ก้อง', 'ฟ้า', 'ปอ', 'นัท', 'เอ'];

// ---- the fake page ------------------------------------------------------------------------------

function makeField(maxLength) {
  const field = {
    value: '',
    maxLength,
    events: [],
    dispatchEvent(ev) {
      field.events.push(ev.type);
      return true;
    },
  };
  return field;
}

function makeControl(label, onClick) {
  return {
    label,
    disabled: false,
    presses: 0,
    click() {
      // A disabled control dispatches no activation — the platform swallows it before any listener
      // runs. Modelled, because the bridge's `drive` exists precisely to clear that flag for one
      // call, and without this the arm-gate half of the seeding would pass vacuously.
      if (this.disabled) return;
      this.presses += 1;
      onClick?.(this);
    },
  };
}

/** A page whose seat fields DO NOT EXIST until the engine's boot listener builds them, which is the
 *  whole subject of this file. `docListeners` and `winListeners` are kept apart so the fire order
 *  below is the browser's, not a single queue's. */
function makePage() {
  const page = {
    readyState: 'interactive',
    docListeners: [],
    winListeners: [],
    fields: [],
    noticeHidden: true,
    started: 0,
    seatCount: 4,
  };

  const pills = new Map();
  // The seat pills are STATIC markup and exist before any script runs; the seat FIELDS are not —
  // they are built by the engine's own renderMascotInputs, so a pill press before the engine has
  // booted moves nothing a bridge can write to. That asymmetry is the defect's whole mechanism, and
  // flattening it (fields on any pill press) is what made an earlier version of this harness unable
  // to see either planted break.
  const setSeatCount = (n) => {
    page.seatCount = n;
    if (page.window.__khengApp === undefined) return;
    // The engine rebuilds every field from its own state on a seat change, which is why the bridge
    // re-queries after the press instead of holding the list it had before.
    page.fields = Array.from({ length: n }, () => makeField(16));
  };
  for (let n = 2; n <= MAX_PLAYERS; n += 1) {
    pills.set(`.count-pill[data-count="${n}"]`, makeControl(`pill-${n}`, () => setSeatCount(n)));
  }
  const start = makeControl('start', () => { page.started += 1; });

  page.document = {
    get readyState() { return page.readyState; },
    addEventListener(type, fn) { page.docListeners.push([type, fn]); },
    removeEventListener() {},
    querySelector(sel) {
      if (pills.has(sel)) return pills.get(sel);
      if (sel === '#btn-start-game') return start;
      if (sel === '#webglUnsupportedNotice') {
        return page.noticeHidden ? null : { classList: { contains: () => false } };
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.mascot-name-input') return page.fields;
      return [];
    },
    getElementById: () => null,
  };
  page.window = {
    addEventListener(type, fn) { page.winListeners.push([type, fn]); },
    removeEventListener() {},
    location: { reload() {} },
  };

  /** The engine, reduced to the one thing that matters here. Registered on `window` because that is
   *  where main.js registers its boot, and registered FIRST because main.js is imported first. */
  page.installEngine = () => {
    page.window.addEventListener('DOMContentLoaded', () => {
      page.window.__khengApp = { state: {}, ui: {} };
      setSeatCount(page.seatCount);
    });
  };

  /** document's listeners, then window's — in registration order within each. */
  page.fireDomContentLoaded = () => {
    page.readyState = 'complete';
    for (const [type, fn] of [...page.docListeners]) if (type === 'DOMContentLoaded') fn({ type });
    for (const [type, fn] of [...page.winListeners]) if (type === 'DOMContentLoaded') fn({ type });
  };

  page.pillPresses = () => [...pills.values()].filter((p) => p.presses > 0).map((p) => p.label);
  page.startControl = start;
  return page;
}

// ---- the bridge, as shipped ---------------------------------------------------------------------

/** Rewrites one import into a stub lookup. Two shapes are enough for this file — a named list and a
 *  bare default — and an unrecognised one THROWS rather than emitting something that will not parse.
 *  The same idiom src/play/setup-edit-request.test.mjs already runs the bridges through. */
function rewriteImport(binding, spec, seq) {
  const req = `__require(${JSON.stringify(spec)})`;
  const trimmed = binding.trim();
  if (trimmed.startsWith('{')) return `const ${trimmed} = ${req};`;
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    const tmp = `__imp${seq}`;
    return `const ${tmp} = ${req}; const ${trimmed} = ${tmp}.default ?? ${tmp};`;
  }
  throw new Error(`unhandled import shape in ${spec}: ${JSON.stringify(binding)}`);
}

/** Runs the REAL roster-bridge.ts module body against `page`, with every import stubbed. Returns
 *  what the bridge's own collaborators were asked for, so an assertion can tell "seeded nothing"
 *  from "fell back to the first-time-device path". */
function loadBridge(page, { editing = false, group = [], roster = STORED } = {}) {
  const raw = fs.readFileSync(BRIDGE, 'utf8');
  let seq = 0;
  const js = stripTypeScriptTypes(raw, { mode: 'strip' })
    .replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm, (_m, binding, spec) => rewriteImport(binding, spec, seq += 1))
    .replace(/^export\s+/gm, '');
  assert.doesNotMatch(js, /^import\s/m, 'an import in roster-bridge.ts was not rewritten — the module body would not run');

  const calls = { defaults: 0, saveOnSetupComplete: 0, editRequests: 0 };
  const resolve = (spec) => {
    if (spec.endsWith('shell/roster')) {
      return { loadGroup: () => group, loadRoster: () => ({ names: () => roster }) };
    }
    if (spec.endsWith('_setup-bridge')) {
      return {
        saveOnSetupComplete: () => { calls.saveOnSetupComplete += 1; },
        takeSetupEditRequest: () => { calls.editRequests += 1; return editing; },
      };
    }
    // The real ceiling module, not a stub: the bridge clamps the seat count with it.
    if (spec.includes('/games/')) return { MAX_PLAYERS };
    if (spec.includes('_mascots')) return { applyMascotDefaults: () => { calls.defaults += 1; } };
    throw new Error(`unstubbed import in roster-bridge.ts: ${spec}`);
  };

  // eslint-disable-next-line no-new-func -- executing the shipped module body is the whole point.
  new Function('__require', 'document', 'window', 'Event', js)(
    resolve,
    page.document,
    page.window,
    class { constructor(type) { this.type = type; } },
  );
  return calls;
}

/** One whole page load, in the order a browser performs it. */
function boot(options = {}) {
  const page = makePage();
  page.installEngine();
  const calls = loadBridge(page, options);
  page.fireDomContentLoaded();
  return { page, calls };
}

const seededNames = (page) => page.fields.map((f) => f.value);

// ---- the invariant ------------------------------------------------------------------------------

test('the group\'s stored names reach the seat fields the engine built', () => {
  const { page } = boot();
  assert.equal(page.fields.length, MAX_PLAYERS, 'the seat count was not driven up to the ceiling');
  assert.deepEqual(
    seededNames(page),
    STORED.slice(0, MAX_PLAYERS),
    'the seat fields did not receive the stored roster — a returning group is asked to type its names again',
  );
});

test('nothing is seeded before the engine has published itself and built the fields', () => {
  // The order claim, observed rather than inferred: the bridge is loaded while the page still has no
  // fields at all, and NOTHING may have happened by the time the module body returns.
  const page = makePage();
  page.installEngine();
  loadBridge(page);
  assert.deepEqual(page.fields, [], 'the fields existed before the engine booted — this test cannot see the defect');
  assert.deepEqual(page.pillPresses(), [], 'the bridge drove a seat pill at module scope, before the engine had booted');
  assert.equal(page.startControl.presses, 0, 'the bridge started the match at module scope');

  page.fireDomContentLoaded();
  assert.deepEqual(seededNames(page), STORED.slice(0, MAX_PLAYERS));
});

test('the seeding drives the engine\'s own seat pill, and clamps at this game\'s ceiling', () => {
  // Eight stored names against a six-seat game: seeding past the top pill would silently drop names,
  // and reaching for a seventh pill would find nothing to press.
  const { page } = boot();
  assert.ok(STORED.length > MAX_PLAYERS, 'the fixture no longer exceeds the ceiling — the clamp is untested');
  assert.deepEqual(page.pillPresses(), [`pill-${MAX_PLAYERS}`]);
});

test('each field is written through an input event, not by value alone', () => {
  // Load-bearing on this route rather than habit: the engine keeps each seat's typed name in its own
  // state and rebuilds every field from THAT on the next pill press, so a value-only write is erased
  // by the first seat change a player makes.
  const { page } = boot();
  for (const field of page.fields) assert.deepEqual(field.events, ['input']);
});

test('a name longer than the field advertises is cut to the attribute, not past it', () => {
  const long = 'ก'.repeat(40);
  const { page } = boot({ roster: [long, ...STORED.slice(1)] });
  assert.equal(page.fields[0].value.length, 16, 'a long stored name overflowed the field\'s own cap');
});

test('an edit request leaves the prefilled setup screen up instead of starting the match', () => {
  const { page, calls } = boot({ editing: true });
  assert.equal(calls.editRequests, 1, 'the edit request was read a number of times other than once');
  assert.deepEqual(seededNames(page), STORED.slice(0, MAX_PLAYERS), 'an edit request stopped the seeding as well as the start');
  assert.equal(page.startControl.presses, 0, 'the edit request was consumed and the match started over the top of it');
});

test('a first-time device is left on its own setup screen with the cast in the fields', () => {
  const { page, calls } = boot({ roster: ['เอ'] });
  assert.equal(calls.defaults, 1, 'a device with fewer than two names did not fall back to the shared cast');
  assert.deepEqual(page.pillPresses(), [], 'a one-name device drove a seat pill');
  assert.equal(page.startControl.presses, 0);
});

test('the group the player last ticked wins over the wider roster', () => {
  const { page } = boot({ group: ['ก', 'ข', 'ค'] });
  assert.deepEqual(seededNames(page), ['ก', 'ข', 'ค']);
});

// ---- the arm gate, which the seeding has to get past without weakening ---------------------------

test('seeding clears the ghost-tap gate for its own press and puts it straight back', () => {
  // ADR-0017: every button on a freshly revealed screen ships `disabled` for the arm window, and
  // `click()` on a disabled control dispatches nothing. Seeding is not a tap — it replays what the
  // player already told the device — so it clears the flag for the one call. What must NOT happen is
  // the flag being left off: the gate's own timer still owns when a HUMAN may press.
  const page = makePage();
  page.installEngine();
  loadBridge(page);
  const pill = page.document.querySelector(`.count-pill[data-count="${MAX_PLAYERS}"]`);
  pill.disabled = true;
  page.startControl.disabled = true;

  page.fireDomContentLoaded();
  assert.equal(pill.presses, 1, 'the disabled seat pill swallowed the seeding press');
  assert.equal(pill.disabled, true, 'the seeding left the seat pill enabled inside its arm window');
  assert.equal(page.startControl.disabled, true, 'the seeding left the start button enabled inside its arm window');
});

// ---- calibration --------------------------------------------------------------------------------

test('RED CALIBRATION: the harness really does hold the fields back, and the order it fires is the browser\'s', () => {
  const page = makePage();
  // No engine installed at all: the fields never appear, so a bridge that seeded on any signal other
  // than the engine's own boot has nothing to write to and this file's first assertion goes red. If
  // this ever renders fields, every order claim above is measuring nothing.
  loadBridge(page);
  page.fireDomContentLoaded();
  assert.deepEqual(page.fields, [], 'the harness built seat fields with no engine — the order tests are vacuous');

  // And the fire order itself, asserted rather than assumed: document before window.
  const order = [];
  const probe = makePage();
  probe.window.addEventListener('DOMContentLoaded', () => order.push('window'));
  probe.document.addEventListener('DOMContentLoaded', () => order.push('document'));
  probe.fireDomContentLoaded();
  assert.deepEqual(order, ['document', 'window'],
    'the harness no longer runs document listeners ahead of window listeners — the whole defect is invisible to it');

  // The module body runs past 'loading', which is what makes the ready-state-immediate branch a real
  // alternative a porter could reach for — and therefore a real must-red.
  assert.notEqual(makePage().readyState, 'loading');
});
