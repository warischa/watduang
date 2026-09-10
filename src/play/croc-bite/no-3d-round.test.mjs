// ADR-0051's immovable condition, for the route that draws with WebGL: a play route NEVER blanks
// the page. If the context cannot be had, the player gets a readable screen saying so — not an empty
// one.
//
// THE DEFECT THIS REPRODUCES, and it is a boot-ORDER defect rather than a missing branch. The
// mockup builds its interface INSIDE the same `try` as its 3D stack. GameScene throws when a context
// request comes back null, so on a device with no usable GPU the throw happens before `this.ui` is
// ever assigned — and the catch's own `if (this.ui) this.ui.showWebGLError()` is then guarding a
// value that does not exist. The notice is unreachable, nothing is rendered, and the play surface is
// blank. Constructing the interface before the `try` is the whole fix, and it is invisible to every
// other check in this directory: nothing throws, no test fails, the page is simply empty.
//
// So this file boots the REAL GameApp with the renderer stubbed to fail, and reads the page back.
// GameApp, UIManager and GameState are sliced out of main.js and executed; only the four classes that
// need a live WebGL context are stubs, and the renderer's stub throws exactly what the real one
// throws on a null context.
//
// AND THE ROUND IS PLAYABLE, which is the rest of what that condition asks for: a notice is not a
// blank page, but it is not a usable one either. Three things used to stop the round on this path,
// and the file now drives all three: the engine registered its round lifecycle INSIDE the failing
// try, so no round could leave its intro; the DOM tooth board was installed only by the
// `webglcontextlost` handler, which a device that never got a context can never fire; and
// roster-bridge.ts read this very notice and declined to start the match. So the boot below is
// followed by the route's own no-context entry, and the round is played to its result on real
// buttons. The same board after a context is LOST mid-match is a separate path with its own file,
// src/play/croc-bite/webgl-context-loss.test.mjs.
//
// The third obligation the ADR names for a canvas — role, label, and a live region outside it — is
// the last test here. The live region is static markup; the canvas is created at runtime, so the
// method that creates it is executed and the element read back.
//
// ponytail: a stub page, not a DOM. Three guarantees are modelled and nothing else: an id/selector
// lookup answers a live node, a classList is a real set, and `innerHTML = ''` empties a container.
// Stated ceiling: this proves what the boot DOES to those nodes, never that Chrome hands back a null
// context on a real GPU-less device, nor that the notice is legible — scripts/webgl-pixels-probe.mjs
// and the browser-verification runbook own that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { sliceBlock } from '../_dom-stub.mjs';
import { MASCOTS } from '../_mascots.ts';
import { MIN_PLAYERS } from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const source = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const markup = fs.readFileSync(path.join(here, 'markup.html'), 'utf8');

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `main.js no longer contains ${from} — this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.js no longer contains ${to} after ${from}`);
  return source.slice(start, end);
}

function sliceOf(header) {
  const found = sliceBlock(source, header);
  assert.ok(found, `main.js no longer declares ${header} — this test is measuring nothing`);
  return found;
}

const RULES = region('const SAFE_ACTIONS = {', 'const PHASES = {');
const PHASE_CONSTS = region('const PHASES = {', 'class GameState ');
const STATE = sliceOf('class GameState ');
const UI = sliceOf('class UIManager ');
const APP = sliceOf('class GameApp ');

// ---- the route's own fallback, out of main.ts ----------------------------------------------------

const glue = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');

/** The same two markers the sibling context-loss test slices, so the board is executed here rather
 *  than a second copy of it being described. One contiguous region: the constants, toothRow,
 *  renderBoard, settle, cutTo2D and the no-context entry share module state a per-symbol slice would
 *  have to re-declare. */
function glueRegion(from, to) {
  const start = glue.indexOf(from);
  assert.notEqual(start, -1, `main.ts no longer contains ${from} — this test is measuring nothing`);
  const end = glue.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `main.ts no longer contains ${to} after ${from}`);
  return glue.slice(start, end);
}

const PHASE_NAMES = glueRegion("const PHASE_SETUP = 'SETUP'", '// ---- the shared muted state');
const BOARD_SECTION = glueRegion('// ---- the no-3D board', '// ---- mount');
for (const symbol of ['function renderBoard', 'function settle', 'function cutTo2D', 'function bootWithout3D']) {
  assert.ok(BOARD_SECTION.includes(symbol), `${symbol} is no longer inside main.ts's no-3D board section — the slice would miss it`);
}
const BOARD_ID = /const BOARD_ID = '([\w-]+)'/.exec(BOARD_SECTION)?.[1];
assert.ok(BOARD_ID, 'main.ts no longer names the board id as a literal — the board could not be read back');

// ---- the stub page ------------------------------------------------------------------------------

/** One fake element. `classList` is a real set because every reveal and every hide on this route is
 *  a class flip, and a classList that answered `false` to everything would make the notice's own
 *  reveal unobservable. */
function makeNode(tag = 'div') {
  const set = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    id: '',
    type: '',
    className: '',
    textContent: '',
    placeholder: '',
    value: '',
    maxLength: 0,
    disabled: false,
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    attributes: {},
    children: [],
    parent: null,
    listeners: {},
    classes: set,
    classList: {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
      toggle: (c, force) => (force === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (force ? set.add(c) : set.delete(c))),
    },
    setAttribute(k, v) { node.attributes[k] = String(v); },
    getAttribute: (k) => (k in node.attributes ? node.attributes[k] : null),
    appendChild(child) { child.parent = node; node.children.push(child); return child; },
    append(...kids) { for (const kid of kids) node.appendChild(kid); },
    replaceChildren(...kids) { node.children = []; for (const kid of kids) node.appendChild(kid); },
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    removeEventListener() {},
    remove() {},
    focus() {},
    dispatchEvent: () => true,
    querySelector: () => null,
    querySelectorAll: () => [],
    // The four the DOM tooth board needs, and nothing more. The board is installed by SWAPPING the
    // canvas container for a shallow clone of itself, painted by createElement, and pressed through
    // one delegated click listener — so a parent chain, a shallow clone, the swap and `closest` are
    // exactly the guarantees the round below rests on.
    cloneNode(deep) {
      assert.equal(deep, false, 'the board relies on a SHALLOW clone: a deep clone carries the dead canvas across');
      const clone = makeNode(tag);
      clone.id = node.id;
      clone.className = node.className;
      return clone;
    },
    replaceWith(next) {
      const parent = node.parent;
      assert.ok(parent, 'replaceWith was called on a node with no parent — the stub cannot model the swap');
      parent.children = parent.children.map((c) => (c === node ? next : c));
      next.parent = parent;
      node.parent = null;
    },
    closest(selector) {
      const attr = selector.match(/^\[([\w-]+)\]$/);
      assert.ok(attr, `the stub's closest() only answers a single attribute selector, got ${selector}`);
      const key = attr[1].replace(/^data-/, '');
      for (let el = node; el; el = el.parent) if (el.dataset[key] !== undefined) return el;
      return null;
    },
    /** A disabled control dispatches no activation: the platform swallows the click before any
     *  listener runs, so a press on a tooth the arm gate is holding must reach nothing. */
    click() {
      if (node.disabled) return;
      for (let el = node; el; el = el.parent) {
        for (const fn of el.listeners.click || []) fn({ target: node });
      }
    },
    descendants() { return node.children.flatMap((c) => [c, ...c.descendants()]); },
  };
  // The one container write the boot performs: renderMascotInputs empties the seat list before it
  // rebuilds it, and a stub that dropped the write would report rows a rebuild had already removed.
  Object.defineProperty(node, 'innerHTML', {
    get: () => '',
    set: () => { node.children = []; },
  });
  return node;
}

/** A page whose ids and selectors both answer out of ONE live index, so the element the boot caches
 *  and the element this test reads back are the same node. */
function makePage() {
  // The classes each element OPENS with, read out of markup.html rather than assumed empty. Without
  // this every screen reads as on display and the notice reads as revealed before the boot has run —
  // measured: the working-renderer comparison could not tell the two branches apart at all. Both
  // attribute orders are matched because the markup uses both.
  const initialClasses = new Map();
  for (const re of [/id="([\w-]+)"\s+class="([^"]*)"/g, /class="([^"]*)"\s+id="([\w-]+)"/g]) {
    const idFirst = re.source.startsWith('id=');
    for (const m of markup.matchAll(re)) {
      const [id, cls] = idFirst ? [m[1], m[2]] : [m[2], m[1]];
      if (!initialClasses.has(id)) initialClasses.set(id, cls.split(/\s+/).filter(Boolean));
    }
  }
  assert.ok(initialClasses.get('webglUnsupportedNotice')?.includes('hidden'),
    'the no-3D notice no longer opens hidden in markup.html — the comparison below cannot separate the two branches');

  const byKey = new Map();
  const node = (key, tag = 'div') => {
    if (!byKey.has(key)) {
      const el = makeNode(tag);
      el.id = key.replace(/^#/, '');
      for (const cls of initialClasses.get(el.id) ?? []) el.classList.add(cls);
      byKey.set(key, el);
    }
    return byKey.get(key);
  };

  // The seat-count pills are static markup, one per seat count this game offers — read off
  // markup.html rather than invented, so a pill row that changed shape reds instead of agreeing.
  const counts = [...markup.matchAll(/class="count-pill[^"]*"\s+data-count="(\d+)"/g)].map((m) => Number(m[1]));
  const pills = counts.map((count) => {
    const pill = makeNode('button');
    pill.dataset.count = String(count);
    return pill;
  });

  const root = makeNode('div');
  root.id = 'ui-root';
  root.querySelector = (sel) => node(sel);
  root.querySelectorAll = (sel) => (sel === '.count-pill' ? pills : []);

  // A LIVE tree for the canvas container, walked rather than answered out of the index: the fallback
  // REPLACES that container with a clone of itself and then looks the board back up by id, and an
  // index seeded at construction would keep answering the detached original — the board would be
  // painted somewhere nothing reads. Everything else on this page is a screen the engine caches once,
  // so the index still answers those.
  const body = makeNode('body');
  body.appendChild(node('#canvas-container'));
  const findById = (from, id) => {
    if (from.id === id) return from;
    for (const child of from.children) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  };

  const document = {
    getElementById: (id) => (id === 'ui-root' ? root : findById(body, id) ?? node(`#${id}`)),
    createElement: (tag) => makeNode(tag),
    createTextNode: (text) => ({ textContent: String(text) }),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    visibilityState: 'visible',
  };
  // The container to read the board out of is whatever is in the tree AFTER the swap, so it is always
  // read back rather than captured.
  const liveContainer = () => body.children.find((c) => c.id === 'canvas-container');
  return {
    document, root, pills, counts, body, liveContainer,
    el: (sel) => node(sel),
    board: () => liveContainer()?.children.find((c) => c.id === BOARD_ID) ?? null,
    teeth: () => (liveContainer()?.descendants() ?? []).filter((n) => n.dataset.tooth !== undefined),
  };
}

/** Boots the REAL GameApp with the renderer stubbed. `rendererThrows` is the first variable: with it
 *  false the boot is the ordinary one, which is what makes the no-3D assertions discriminating
 *  rather than merely true. `appendsCanvas` is the second, and it models the real scene's own order —
 *  the canvas goes into the container partway through setup, so a failure after that leaves the
 *  element on the page with nothing behind it. */
function boot({ rendererThrows = true, appendsCanvas = false } = {}) {
  const page = makePage();
  const built = [];
  const errors = [];

  class GameScene {
    constructor(container) {
      built.push('scene');
      if (appendsCanvas) container.appendChild(makeNode('canvas'));
      // What the real GameScene throws when a context request comes back null.
      if (rendererThrows) throw new Error('WEBGL_NOT_SUPPORTED');
      this.scene = {};
    }
    onResize() {}
    update() {}
    render() {}
    triggerCameraShake() {}
  }
  class Component {
    constructor() { built.push('component'); }
    setupTeeth() {}
    resetAll() {}
    reset() {}
    update() {}
  }

  // Every property answers a no-op function: a round that runs to its result calls sounds this file
  // has no reason to enumerate, and a missing one would throw inside the engine's emit loop and read
  // as a broken round rather than as a short stub.
  const audio = new Proxy({}, { get: () => () => {} });
  const consoleStub = {
    error: (...args) => errors.push(args.map(String).join(' ')),
    warn: () => {},
    log: () => {},
  };

  // One array for BOTH clocks the round runs on: the engine's own intro pause before the first turn,
  // and the handoff the route's board schedules between two players. Captured rather than waited for,
  // and captured rather than swallowed — a `setTimeout` stubbed to return 0 leaves the round parked in
  // its intro forever, which looks exactly like a round lifecycle that was never wired.
  const timers = [];
  const scheduler = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  const windowStub = { addEventListener() {}, matchMedia: undefined, setTimeout: scheduler };

  // eslint-disable-next-line no-new-func -- executing main.js's own boot is the whole point.
  const GameApp = new Function(
    'document', 'window', 'localStorage', 'THREE', 'GameScene', 'Crocodile', 'PlayerHand',
    'InputHandler', 'audio', 'console', 'requestAnimationFrame', 'setTimeout',
    `${RULES}${PHASE_CONSTS}${STATE}\n${UI}\n${APP}\n;return GameApp;`,
  )(
    page.document,
    windowStub,
    { getItem: () => null, setItem() {} },
    { Clock: class { getDelta() { return 0; } } },
    GameScene,
    Component,
    Component,
    Component,
    audio,
    consoleStub,
    () => 1,
    scheduler,
  );

  const app = new GameApp();

  // The route's own fallback, executed from main.ts rather than described: the same DOM tooth board
  // the mid-match loss cuts to, entered here through the no-context door.
  const armed = [];
  const code = stripTypeScriptTypes(`${PHASE_NAMES}${BOARD_SECTION}`, { mode: 'strip' });
  // eslint-disable-next-line no-new-func -- executing main.ts's own text is the whole point.
  const fallback = new Function(
    'document', 'window', 'cancelAnimationFrame', 'armAllButtons', '$',
    `${code}\n;return { bootWithout3D, cutTo2D };`,
  )(
    page.document,
    windowStub,
    () => {},
    (el) => { armed.push(el.id); return () => {}; },
    (id) => page.document.getElementById(id),
  );

  return {
    app, page, built, errors, timers, armed, fallback,
    runTimers() {
      for (const t of timers.splice(0, timers.length)) t.fn();
    },
  };
}

const NOTICE = '#webglUnsupportedNotice';
const SEAT_LIST = '#setup-mascots-list';
const SCREENS = ['#screen-setup', '#screen-hud', '#screen-result'];

const visible = (el) => !el.classes.has('hidden');

// ---- the immovable condition --------------------------------------------------------------------

test('ADR-0051: with no context, the interface is still built', () => {
  const { app, page, built } = boot();
  assert.ok(built.includes('scene'), 'the renderer stub was never constructed — this test is measuring nothing');
  assert.ok(app.ui, 'the boot left no interface at all: the catch has nothing to show the notice on, and the page is blank');
  assert.ok(app.state, 'the boot left no state');
  assert.ok(!built.includes('component'), 'a 3D component was built after the renderer failed');
  assert.equal(page.el(SEAT_LIST).children.length > 0, true);
});

test('ADR-0051: the seat fields are filled, one row per seat, before any 3D exists', () => {
  const { app, page } = boot();
  const rows = page.el(SEAT_LIST).children;
  assert.equal(rows.length, app.state.playerCount, 'the seat list does not hold one row per seat');
  assert.ok(rows.length >= MIN_PLAYERS);
  // The rows are real: each carries the seat's mascot badge and its own name field. A count alone
  // would pass on rows built empty.
  rows.forEach((row, i) => {
    const avatar = row.children.find((c) => c.className === 'mascot-avatar');
    const input = row.children.find((c) => c.className === 'mascot-name-input');
    assert.ok(avatar, `seat ${i} has no mascot badge`);
    assert.ok(input, `seat ${i} has no name field`);
    assert.equal(avatar.textContent, MASCOTS[i].emoji);
    assert.equal(input.placeholder, MASCOTS[i].name);
  });
});

test("ADR-0051: the engine's own boot leaves the readable notice up, and no screen over it", () => {
  // The engine half, before the route's fallback runs: the notice is revealed and nothing is left on
  // display above it. What the PLAYER is left with is the round below — this pins the state the
  // fallback takes over from, which is why the notice has to exist for it to replace.
  const { page } = boot();
  assert.ok(visible(page.el(NOTICE)), 'the no-3D notice is still hidden: the play surface is blank');
  for (const screen of SCREENS) {
    assert.ok(!visible(page.el(screen)), `${screen} is still on display over the no-3D notice`);
  }
  assert.ok(!page.el('#modal-reset').classes.has('open'), 'a modal was left open over the notice');
});

test('the notice a player is left with is readable, and carries no control', () => {
  // The panel is static markup, so what this pins is that the reveal above lands on something with
  // words in it. ADR-0005 and ADR-0014 are why it carries no reload trigger: an inline handler
  // cannot execute under this site's CSP, and a navigation control has no place in a play surface.
  const at = markup.indexOf('id="webglUnsupportedNotice"');
  assert.notEqual(at, -1, 'the no-3D panel is no longer in markup.html — the reveal above lands on nothing');
  const panel = markup.slice(at, markup.indexOf('\n      </div>', at));
  assert.match(panel, /<h2>[^<]*\S[^<]*<\/h2>/, 'the no-3D panel has no heading text');
  assert.match(panel, /<p>[^<]*\S[^<]*<\/p>/, 'the no-3D panel has no explanatory text');
  assert.doesNotMatch(panel, /<button|<a\s/, 'the no-3D panel now carries a control, which nothing arms');
});

test('the failure is reported once and swallowed, so the page is not left mid-boot', () => {
  const { errors } = boot();
  assert.equal(errors.length, 1, `the boot logged ${errors.length} error(s) — the throw was re-raised or lost`);
  assert.match(errors[0], /WEBGL_NOT_SUPPORTED/);
});

// ---- the order that carries the fix, and only the order ------------------------------------------

test('the interface is constructed BEFORE the try the 3D stack lives in', () => {
  // Pinned as an order over the source text as well as behaviourally, because the two failures look
  // nothing alike: the behavioural assertions above red on a blank page, and this one names the cause.
  // Anchored on the METHOD, not the first mention: the lifecycle is now CALLED before the try, so a
  // slice cut at the first occurrence of the name would end above the try and measure nothing.
  const declared = APP.indexOf('\n  setupLifecycleEvents() {');
  assert.notEqual(declared, -1, 'main.js no longer declares setupLifecycleEvents() on GameApp — this test is measuring nothing');
  const body = APP.slice(0, declared);
  const ui = body.indexOf('this.ui = new UIManager(');
  const attempt = body.indexOf('try {');
  const scene = body.indexOf('new GameScene(');
  assert.notEqual(ui, -1, 'the boot no longer constructs UIManager — this test is measuring nothing');
  assert.notEqual(attempt, -1, 'the boot no longer guards its 3D stack with a try');
  assert.ok(ui < attempt,
    'the interface is constructed inside the try again: GameScene throws before this.ui is assigned, the ' +
      'catch guards a value that does not exist, and the play surface is blank');
  assert.ok(attempt < scene, 'the renderer is constructed outside the try — the throw would reach the page');
});

// ---- the round the ADR asks for, on a device that never had a context -----------------------------

/** The whole route on a device with no context: the engine's boot, then the route's fallback, in the
 *  order the page loads them. */
function bootWithFallback() {
  const h = boot();
  h.fallback.bootWithout3D(h.app);
  return h;
}

test('ADR-0051: the fallback puts a pressable board where the 3D board would have been', () => {
  const h = bootWithFallback();
  assert.ok(h.page.board(), 'no DOM board was installed: the notice is all there is and no round is reachable');
  assert.ok(!visible(h.page.el(NOTICE)), 'the engine notice is still up over the board, centred on the seat list');
  assert.ok(visible(h.page.el('#screen-setup')),
    'the setup screen is still hidden: the engine hid it to show the notice, so nobody can start the round');
  assert.deepEqual(h.armed, [BOARD_ID], 'the board went up without the ghost-tap gate, or something else was armed');
});

test('the no-context path is entered from mount, ahead of the block that arms what it reveals', () => {
  // The connector the executed slice above cannot see: with nothing calling it, every assertion in
  // this section still passes on a route that never reaches the fallback at all. The order is part of
  // the claim — putting the setup screen back is a reveal, and the setup arming block is what covers
  // it, so the entry has to come first.
  const mountBody = glueRegion('function mount(): void', "// WINDOW's DOMContentLoaded");
  const entry = mountBody.indexOf('bootWithout3D(app);');
  assert.notEqual(entry, -1,
    'nothing on the route enters the no-3D fallback when the engine never got a context: the notice is ' +
      'all the player gets and no round is reachable');
  const arming = mountBody.indexOf('if (app.state.phase === PHASE_SETUP)');
  assert.notEqual(arming, -1, 'mount no longer arms the setup screen — this order is measuring nothing');
  assert.ok(entry < arming, 'the fallback reveals the setup screen after the only block that arms it');
});

test('the fallback is entered on a scene that threw AFTER appending its canvas', () => {
  // mount is not executed here, so the condition is lifted out of its own text and evaluated against
  // two real boots. The discriminating input is the half-built scene: the canvas reached the page and
  // the setup that follows it did not, so a condition reading the container answers "3D is up",
  // declines the fallback, and leaves a live interface over a dead scene.
  const mountBody = glueRegion('function mount(): void', "// WINDOW's DOMContentLoaded");
  const condition = /\n\s*if \((.+)\) bootWithout3D\(app\);/.exec(mountBody)?.[1];
  assert.ok(condition, 'mount no longer enters the fallback from a single-line condition — nothing to evaluate');
  // eslint-disable-next-line no-new-func -- evaluating main.ts's own condition is the whole point.
  const needsFallback = new Function('app', 'document', `return (${condition});`);

  const canvasOf = (h) => h.page.liveContainer()?.children.find((c) => c.tagName === 'CANVAS') ?? null;
  const documentFor = (h) => ({
    querySelector: (sel) => (sel === '#canvas-container canvas' ? canvasOf(h) : null),
  });

  const halfBuilt = boot({ appendsCanvas: true });
  assert.ok(canvasOf(halfBuilt), 'the half-built scene left no canvas behind — this leg is measuring nothing');
  assert.equal(needsFallback(halfBuilt.app, documentFor(halfBuilt)), true,
    'a scene that threw after appending its canvas is read as a working 3D boot: the round is unreachable ' +
      'and the notice sits over an interface with no scene behind it (ADR-0051)');

  // The control, and it is what kills a condition stuck at true: a boot that really did complete must
  // NOT be sent down the fallback, or every device with a GPU plays on the DOM board.
  const working = boot({ appendsCanvas: true, rendererThrows: false });
  assert.notEqual(working.app.animationFrameId, null, 'the working boot never started its loop — the control is void');
  assert.equal(needsFallback(working.app, documentFor(working)), false,
    'a complete 3D boot is sent down the no-3D fallback as well — the condition separates nothing');
});

test('ADR-0051: with no context the DOM board takes a press and the round reaches its result', () => {
  const h = bootWithFallback();

  // Started the way the roster bridge starts it, through the engine's own entry point.
  h.app.startNewMatch();
  assert.equal(h.app.state.phase, 'ROUND_INTRO', 'the round did not begin');
  h.runTimers();
  // The discriminating step, measured with the lifecycle wiring reverted: the intro's first turn is
  // scheduled by the round lifecycle, and with that registered inside the failing try the round parks
  // here forever — no tooth is pressable and the presses below reach nothing.
  assert.equal(h.app.state.phase, 'PLAYER_TURN',
    'the round never left its intro: the round lifecycle was not wired on a boot with no 3D context');

  const teeth = h.page.teeth();
  assert.equal(teeth.length, h.app.state.teeth.size, 'the board does not carry one button per tooth in the round');
  assert.ok(teeth.length > 0, 'the board carries no teeth — the press below would measure nothing');

  // Every safe tooth, then the losing one: the round is played to its end on real buttons.
  for (const t of [...h.app.state.teeth.values()].filter((t) => !t.isLosing)) {
    h.page.teeth().find((n) => n.dataset.tooth === t.id).click();
    h.runTimers();
  }
  assert.equal(h.app.state.phase, 'PLAYER_TURN', 'the round ended early — a safe tooth bit');

  h.page.teeth().find((n) => n.dataset.tooth === h.app.state.losingToothId).click();
  assert.equal(h.app.state.phase, 'RESULT',
    'the losing press never raised the result: the round cannot be finished without the 3D surface');
  assert.ok(h.app.state.loserPlayer, 'nobody was recorded as the loser');
});

test('the round survives the order the page actually loads: the match starts BEFORE the board goes up', () => {
  // play.astro imports the roster bridge above main.ts, so the bridge's start runs first and the
  // fallback installs its board into a round already in progress. The leg above installs the board
  // first, which no visitor ever does, and would stay green through a regression in this direction.
  const h = boot();
  h.app.startNewMatch();
  assert.equal(h.app.state.phase, 'ROUND_INTRO', 'the round did not begin — the order below measures nothing');

  h.fallback.bootWithout3D(h.app);
  assert.ok(h.page.board(), 'no DOM board was installed into a round that had already started');
  assert.ok(!visible(h.page.el(NOTICE)), 'the engine notice is still up over the board');
  assert.ok(!visible(h.page.el('#screen-setup')),
    'the setup screen was put back over a round already in progress: the player is asked to pick seats mid-round');

  h.runTimers();
  assert.equal(h.app.state.phase, 'PLAYER_TURN',
    'the round never left its intro when the board arrived after the start');

  const teeth = h.page.teeth();
  assert.equal(teeth.length, h.app.state.teeth.size, 'the board does not carry one button per tooth in the round');
  assert.ok(teeth.length > 0, 'the board carries no teeth — the presses below would measure nothing');

  for (const t of [...h.app.state.teeth.values()].filter((tooth) => !tooth.isLosing)) {
    h.page.teeth().find((n) => n.dataset.tooth === t.id).click();
    h.runTimers();
  }
  assert.equal(h.app.state.phase, 'PLAYER_TURN', 'the round ended early — a safe tooth bit');

  h.page.teeth().find((n) => n.dataset.tooth === h.app.state.losingToothId).click();
  assert.equal(h.app.state.phase, 'RESULT', 'the losing press never raised the result on this order');
  assert.ok(h.app.state.loserPlayer, 'nobody was recorded as the loser');
});

test('the home button on that result does not throw with no 3D stack to reset', () => {
  // Reached from the result card, on exactly this path: returnToSetup resets the crocodile and the
  // hand, and unguarded those two derefs threw after the state had already left the round.
  const h = bootWithFallback();
  h.app.startNewMatch();
  h.runTimers();
  h.app.returnToSetup();
  assert.equal(h.app.state.phase, 'SETUP');
});

// ---- ADR-0051's other obligation: the canvas is not invisible to assistive technology -------------

test('ADR-0051: the canvas the engine creates carries role="img" and a Thai label', () => {
  // createRenderer is executed rather than grepped, because the canvas is created at runtime and
  // markup.html ships an empty container: the attributes have to be on the element the engine hands
  // to the page, and only running the method can say whether they are.
  const LABEL_DECL = region('const BOARD_ARIA_LABEL', '\n');
  const CREATE = region('  createRenderer() {', '\n  }');
  const made = [];
  const documentStub = {
    createElement: (tag) => {
      const el = makeNode(tag);
      el.getContext = () => ({});
      made.push(el);
      return el;
    },
  };
  const THREE = {
    WebGLRenderer: class { constructor(opts) { this.domElement = opts.canvas; this.shadowMap = {}; } setSize() {} setPixelRatio() {} },
    PCFSoftShadowMap: 'pcf',
    ACESFilmicToneMapping: 'aces',
  };
  // eslint-disable-next-line no-new-func -- executing main.js's own createRenderer is the whole point.
  const scene = new Function('document', 'window', 'THREE', 'console',
    `${LABEL_DECL}\nreturn { width: 320, height: 640, ${CREATE}\n} };`,
  )(documentStub, { devicePixelRatio: 3 }, THREE, { error() {} });

  assert.ok(scene.createRenderer(), 'the stubbed context path returned no renderer — this test is measuring nothing');
  assert.equal(made.length, 1, 'createRenderer no longer creates exactly one canvas');
  const canvas = made[0];
  assert.equal(canvas.tagName, 'CANVAS');
  assert.equal(canvas.getAttribute('role'), 'img',
    'the canvas carries no role="img": to assistive technology it is an unlabelled empty element (ADR-0051)');
  const label = canvas.getAttribute('aria-label');
  assert.ok(label, 'the canvas carries no aria-label');
  // Escapes, never literal glyphs: the two ends of the Thai block are unassigned codepoints and would
  // be invisible in every editor and lost to any normalising pass.
  assert.match(label, /[\u0E00-\u0E7F]/, 'the canvas label is not Thai — it is read aloud to a player');
  // Declared ONCE in main.js and read twice: the same text labels the container region the keyboard
  // listeners set up, so the two cannot drift and the label was not written a second time.
  assert.equal(source.split(label).length - 1, 1, 'the label text is spelled more than once in main.js');
  assert.match(source, /this\.container\.setAttribute\('aria-label', BOARD_ARIA_LABEL\)/,
    'the container region no longer announces the same label the canvas carries');
});

test('the context is requested once, WITH the attributes, and that context is what the renderer is given', () => {
  // Executed for the same reason as the test above, and against the same stubs: whether an attribute
  // is applied is a question about the call, not about the text. Per the WebGL spec a second
  // getContext on a canvas that already holds a context ignores the attributes it is handed, so
  // attributes passed to the renderer after the context exists are silently dropped — the request
  // itself is the only place they can be applied.
  const LABEL_DECL = region('const BOARD_ARIA_LABEL', '\n');
  const CREATE = region('  createRenderer() {', '\n  }');
  const requests = [];
  const context = { getContextAttributes: () => ({ alpha: true }) };
  const rendererOpts = [];
  const documentStub = {
    createElement: (tag) => {
      const el = makeNode(tag);
      el.getContext = (name, attrs) => { requests.push({ name, attrs }); return context; };
      return el;
    },
  };
  const THREE = {
    WebGLRenderer: class { constructor(opts) { rendererOpts.push(opts); this.domElement = opts.canvas; this.shadowMap = {}; } setSize() {} setPixelRatio() {} },
    PCFSoftShadowMap: 'pcf',
    ACESFilmicToneMapping: 'aces',
  };
  // eslint-disable-next-line no-new-func -- executing main.js's own createRenderer is the whole point.
  const scene = new Function('document', 'window', 'THREE', 'console',
    `${LABEL_DECL}\nreturn { width: 320, height: 640, ${CREATE}\n} };`,
  )(documentStub, { devicePixelRatio: 3 }, THREE, { error() {} });

  assert.ok(scene.createRenderer(), 'the stubbed context path returned no renderer — this test is measuring nothing');
  assert.equal(requests.length, 1,
    `the context was requested ${requests.length} times: a canvas locks to its first context type, so a ` +
      'second request answers null and any attributes it carries are ignored');
  assert.equal(requests[0].name, 'webgl2');
  assert.equal(requests[0].attrs?.antialias, true,
    'antialias does not ride the context request, so nothing applies it: the teeth ship with stepped edges');
  assert.equal(requests[0].attrs?.powerPreference, 'high-performance',
    'powerPreference does not ride the context request, so the round draws on whichever GPU the default picks');
  assert.equal(rendererOpts[0]?.context, context,
    'the renderer was not handed the context that was already created, so it requests a second one — and the ' +
      'attributes above are lost with it');
});

// ---- the discriminating comparison ----------------------------------------------------------------

test('RED CALIBRATION: with a working renderer the same boot shows no notice at all', () => {
  // The input where right and wrong visibly diverge, and the proof that the assertions above are
  // reading the notice rather than a node that is revealed either way.
  const { app, page, built } = boot({ rendererThrows: false });
  assert.ok(built.includes('component'), 'the 3D components were not built on the working branch');
  assert.ok(!visible(page.el(NOTICE)), 'the no-3D notice is shown even when the context was available');
  assert.ok(visible(page.el('#screen-setup')), 'the setup screen is hidden on a working boot');
  assert.ok(app.ui, 'the working boot built no interface either — this comparison measures nothing');
  // And the seat rows are the same on both branches, which is the point: nothing about the interface
  // depends on the 3D stack.
  assert.equal(page.el(SEAT_LIST).children.length, app.state.playerCount);
});
