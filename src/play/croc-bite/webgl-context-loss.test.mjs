// What happens to this route when the browser takes the 3D context away mid-round.
//
// The failure this pins is not "a notice is missing" — it is that the engine SURVIVES the loss. Its
// render loop reschedules at the top of every frame with no guard, it shipped with no
// `webglcontextlost` handler at all, and GL calls against a lost context do not throw. So untouched,
// the loss leaves a live HUD naming whose turn it is over a board nobody can see, with the tooth
// input path still taking presses: those listeners sit on the CONTAINER, not on the canvas, and the
// raycast behind them is CPU-side and keeps answering.
//
// main.ts's answer is not one-bomb's halt panel. The engine's state machine is reachable
// (window.__khengApp), it holds the whole round, and every projection the players read is painted
// from state events — so the 3D half is cut and the round is FINISHED on real buttons. That makes the
// invariant a round-trip one, and it is what this file drives: after the loss, a press on a DOM tooth
// still reaches the engine's own state machine and still ends the round.
//
// Three things carry that and each reds on its own below: the loop is cancelled, the container is
// clone-replaced (which is what severs the 3D input path), and the board that replaces it is armed
// the moment it is built.
//
// It runs the REAL bytes on both sides: cutTo2D, renderBoard, toothRow and settle are sliced out of
// main.ts, and the state they drive is the engine's own GameState, sliced out of main.js. Neither is
// re-implemented here.
//
// ponytail: a purpose-built stub, not a DOM. It models exactly five platform guarantees and nothing
// else — cloneNode(false) returns a node with the same id, no children and NO listeners; replaceWith
// swaps a node in its parent; a click walks `closest` up the tree; `disabled` swallows an activation;
// and `style` is a plain object. Stated ceilings: this proves what main.ts DOES to those nodes,
// never that Chrome fires `webglcontextlost` on this route, nor that cancelling the loop really stops
// a rAF chain, nor that the arm window disables anything in a browser (scripts/arm-gate-probe.mjs
// owns that last one). No real timer is ever created: the handoff timer is captured and run by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { sliceBlock } from '../_dom-stub.mjs';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/croc-bite.ts';

const here = import.meta.dirname;
const glue = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

/** The source text between two markers, asserted present so a moved marker reds loudly. */
function region(source, from, to, label) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `${label} no longer contains ${from} — this test is measuring nothing`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${label} no longer contains ${to} after ${from}`);
  return source.slice(start, end);
}

// ---- the engine's own state machine -------------------------------------------------------------

const RULES = region(engineSource, 'const SAFE_ACTIONS = {', 'const PHASES = {', 'main.js');
const PHASE_CONSTS = region(engineSource, 'const PHASES = {', 'class GameState ', 'main.js');
const STATE = sliceBlock(engineSource, 'class GameState ');
assert.ok(STATE, 'main.js no longer declares class GameState — this test is measuring nothing');

function newState(count) {
  const store = new Map();
  // eslint-disable-next-line no-new-func -- executing main.js's own text is the whole point.
  const GameState = new Function(
    'localStorage', 'window', 'document',
    `${RULES}${PHASE_CONSTS}${STATE}\n;return GameState;`,
  )(
    { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    {},
    {},
  );
  const state = new GameState();
  state.setPlayerCount(count);
  return state;
}

// ---- the route's own no-3D round ----------------------------------------------------------------

// One contiguous region rather than five slices: BOARD_ID, the handoff constant, the disarm handle,
// toothRow, renderBoard, settle and cutTo2D are the whole "no-3D board" section of main.ts, in that
// order, and a slice per symbol would have to re-declare the module state they share.
const PHASE_NAMES = region(glue, "const PHASE_SETUP = 'SETUP'", '// ---- the shared muted state', 'main.ts');
const BOARD_SECTION = region(glue, '// ---- the no-3D board', '// ---- mount', 'main.ts');
for (const symbol of ['function toothRow', 'function renderBoard', 'function settle', 'function cutTo2D']) {
  assert.ok(BOARD_SECTION.includes(symbol), `${symbol} is no longer inside main.ts's no-3D board section — the slice would miss it`);
}

// ---- the stub -----------------------------------------------------------------------------------

let uid = 0;

/** One fake element. `cloneNode(false)` keeps the id and drops the children AND the listeners, which
 *  is the guarantee the severing rests on; `replaceWith` swaps it in its parent; `closest` walks up.
 *  Nothing else about the DOM is modelled. */
function makeNode(tag = 'div') {
  const node = {
    tagName: tag.toUpperCase(),
    uid: (uid += 1),
    id: '',
    className: '',
    type: '',
    disabled: false,
    textContent: '',
    dataset: {},
    style: {},
    children: [],
    parent: null,
    listeners: {},
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    removeEventListener() {},
    listenerCount: (type) => (node.listeners[type] || []).length,
    appendChild(child) {
      child.parent = node;
      node.children.push(child);
      return child;
    },
    append(...kids) { for (const kid of kids) node.appendChild(kid); },
    replaceChildren(...kids) {
      node.children = [];
      for (const kid of kids) node.appendChild(kid);
    },
    cloneNode(deep) {
      assert.equal(deep, false, 'the severing relies on a SHALLOW clone: a deep clone carries the dead canvas across');
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
     *  listener runs. Without this every arm-gate assertion below would pass vacuously. */
    click() {
      if (node.disabled) return;
      for (let el = node; el; el = el.parent) {
        for (const fn of el.listeners.click || []) fn({ target: node });
      }
    },
    descendants() {
      return node.children.flatMap((c) => [c, ...c.descendants()]);
    },
  };
  return node;
}

/** The page as it stands the instant the context is lost: a live round, a canvas container carrying
 *  the engine's own pointer listeners, and a canvas inside it. */
function makePage(seats) {
  const root = makeNode('div');
  const container = makeNode('div');
  container.id = 'canvas-container';
  container.className = 'stage';
  root.appendChild(container);
  const canvas = container.appendChild(makeNode('canvas'));
  // The engine binds its tooth input on the CONTAINER, which is why removing the canvas alone would
  // leave every press still raycasting into a scene nobody draws.
  let engineHits = 0;
  for (const type of ['pointerdown', 'pointerup', 'keydown']) {
    container.addEventListener(type, () => { engineHits += 1; });
  }

  // A LIVE id index, walked rather than a map built up front: main.ts installs the board by creating
  // a node, giving it an id and appending it, and then looks that id back up on every rebuild. A map
  // seeded at construction answers null for it and renderBoard returns without building a single
  // tooth — measured, and it read as "the board is not armed" rather than as a broken instrument.
  const findById = (node, id) => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  };
  const document = {
    getElementById: (id) => findById(root, id),
    createElement: (tag) => makeNode(tag),
  };

  const armed = [];
  const disarms = [];
  const timers = [];
  const cancelled = [];
  const window = {
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
  };

  const state = newState(seats);
  const app = {
    animationFrameId: 4242,
    state,
    ui: { renderMascotInputs() {} },
    audio: { setMuted() {} },
  };

  const code = stripTypeScriptTypes(`${PHASE_NAMES}${BOARD_SECTION}`, { mode: 'strip' });
  // eslint-disable-next-line no-new-func -- executing main.ts's own text is the whole point.
  const api = new Function(
    'document', 'window', 'cancelAnimationFrame', 'armAllButtons', '$',
    `${code}\n;return { BOARD_ID, TURN_HANDOFF_MS, cutTo2D, renderBoard, settle };`,
  )(
    document,
    window,
    (id) => cancelled.push(id),
    (el) => {
      armed.push(el.id);
      const disarm = () => disarms.push(el.id);
      return disarm;
    },
    (id) => document.getElementById(id),
  );

  // The container the DOM board must end up inside is whatever is in the tree AFTER the swap, so it
  // is always read back rather than captured.
  const liveContainer = () => root.children.find((c) => c.id === 'canvas-container');
  const board = () => liveContainer()?.children.find((c) => c.id === api.BOARD_ID) ?? null;
  const teeth = () => (board()?.descendants() ?? []).filter((n) => n.dataset.tooth !== undefined);

  return {
    api, app, state, root, container, canvas, document, window,
    armed, disarms, timers, cancelled,
    engineHits: () => engineHits,
    liveContainer, board, teeth,
    tooth: (id) => teeth().find((n) => n.dataset.tooth === id),
    runTimers() {
      const due = timers.splice(0, timers.length);
      for (const t of due) t.fn();
    },
  };
}

/** A page whose round is live and waiting for a press. */
function inRound(seats = 4) {
  const page = makePage(seats);
  page.state.startNewRound();
  page.state.beginPlayerTurn();
  return page;
}

// ---- the loop -----------------------------------------------------------------------------------

test('the loss cancels the render loop', () => {
  // It reschedules at the top of every frame, so the id always holds a pending request, and a frame
  // that runs after the container is gone reads a null clientWidth.
  const page = inRound();
  page.api.cutTo2D(page.app);
  assert.deepEqual(page.cancelled, [4242], 'the pending animation frame was not cancelled');
});

test('a route that never had a loop to cancel does not try to cancel one', () => {
  const page = inRound();
  page.app.animationFrameId = null;
  page.api.cutTo2D(page.app);
  assert.deepEqual(page.cancelled, []);
});

// ---- the 3D input path --------------------------------------------------------------------------

test('the loss severs the tooth input path, and keeps the box the stylesheet positions', () => {
  const page = inRound();
  const before = page.container;
  assert.ok(before.listenerCount('pointerdown') > 0, 'the fixture carries no engine listener — the severing test measures nothing');

  page.api.cutTo2D(page.app);

  const after = page.liveContainer();
  assert.notEqual(after, before, 'the canvas container was not replaced — its listeners are still live');
  assert.equal(after.id, 'canvas-container', 'the replacement lost the id the stylesheet and the loss handler both read');
  assert.equal(after.className, before.className, 'the replacement lost the class that positions it');
  for (const type of ['pointerdown', 'pointerup', 'keydown']) {
    assert.equal(after.listenerCount(type), 0,
      `the replacement carries the engine's ${type} listener: every press still raycasts into a scene nobody draws`);
  }
  assert.ok(!after.children.some((c) => c.tagName === 'CANVAS'), 'the dead canvas survived the swap');
  assert.equal(page.engineHits(), 0);
});

test('the loss cannot be acted on twice, and a route with no container does nothing', () => {
  const page = inRound();
  // No container at all: with no context ever created the engine never built one, and a route with
  // no context to lose cannot lose one.
  page.document.getElementById = () => null;
  page.api.cutTo2D(page.app);
  assert.equal(page.board(), null);
  assert.deepEqual(page.armed, [], 'a board was armed on a page that has no container to put it in');
});

// ---- the board that replaces it -----------------------------------------------------------------

test('the DOM board is installed inside the replacement container and armed as it is built', () => {
  const page = inRound();
  page.api.cutTo2D(page.app);

  const board = page.board();
  assert.ok(board, 'no DOM board was installed: the round is over with nothing pressable on screen');
  assert.equal(board.parent, page.liveContainer());
  assert.ok(
    page.armed.includes(board.id),
    'the board is inserted without arming it (ADR-0014, ADR-0057): the context can be lost with a ' +
      'finger already down on the canvas, so the release of that tap falls on a tooth',
  );
});

test('the board carries one button per tooth in the round, at every seat count in range', () => {
  for (let seats = MIN_PLAYERS; seats <= MAX_PLAYERS; seats += 1) {
    const page = inRound(seats);
    page.api.cutTo2D(page.app);
    assert.deepEqual(
      page.teeth().map((n) => n.dataset.tooth).sort(),
      [...page.state.teeth.keys()].sort(),
      `${seats} seats: the board and the round hold different teeth`,
    );
  }
});

test('a rebuild disarms the gate the previous build left holding detached nodes', () => {
  const page = inRound();
  page.api.cutTo2D(page.app);
  const armsAfterCut = page.armed.length;
  page.api.renderBoard(page.app);
  assert.equal(page.armed.length, armsAfterCut + 1, 'the rebuild did not arm the board it just built');
  assert.deepEqual(page.disarms, [page.api.BOARD_ID],
    'the previous gate was not disarmed: its timer is still holding a set of nodes this rebuild detached');
});

// ---- the round finishes -------------------------------------------------------------------------

test('a press on a DOM tooth reaches the engine and passes the phone on', () => {
  const page = inRound(4);
  page.api.cutTo2D(page.app);
  const safeId = [...page.state.teeth.values()].find((t) => !t.isLosing).id;
  const turnBefore = page.state.currentPlayerIndex;

  page.tooth(safeId).click();

  assert.notEqual(page.state.teeth.get(safeId).state, 'unresolved', 'the press never reached the engine');
  assert.equal(page.state.phase, 'TURN_TRANSITION',
    'the press was taken but never settled: the engine completes a press from the 3D hand animation, ' +
      'which the cancelled loop will never deliver, so the round stops on the first tooth');
  assert.equal(page.state.currentPlayerIndex, (turnBefore + 1) % 4);

  // The handoff is the pause when the phone is passed, and it is a real timer on the page — captured
  // here rather than waited for.
  assert.deepEqual(page.timers.map((t) => t.ms), [page.api.TURN_HANDOFF_MS]);
  page.runTimers();
  assert.equal(page.state.phase, 'PLAYER_TURN', 'the next player never got their turn');
});

test('a whole round plays out on the board and reaches its result', () => {
  const page = inRound(4);
  page.api.cutTo2D(page.app);
  const safeIds = [...page.state.teeth.values()].filter((t) => !t.isLosing).map((t) => t.id);

  for (const id of safeIds) {
    page.tooth(id).click();
    page.runTimers();
  }
  assert.equal(page.state.phase, 'PLAYER_TURN', 'the round ended early — a safe tooth bit');

  page.tooth(page.state.losingToothId).click();
  assert.equal(page.state.phase, 'RESULT', 'the losing press never raised the result: the round cannot be finished');
  assert.ok(page.state.loserPlayer, 'nobody was recorded as the loser');
  const survivors = page.state.players.filter((p) => p.id !== page.state.loserPlayer.id);
  assert.deepEqual(survivors.map((p) => page.state.getPlayerScore(p.id)), survivors.map(() => 1));
  // A losing press settles at once: nothing is scheduled, because there is no phone to pass.
  assert.deepEqual(page.timers, []);
});

test('an already-pressed tooth comes back disabled, not enabled', () => {
  // Set BEFORE the gate walks the board: the gate reads an already-disabled control it did not
  // disable itself as the caller's own intent, so a spent tooth is not handed back pressable.
  const page = inRound(4);
  page.api.cutTo2D(page.app);
  const safeId = [...page.state.teeth.values()].find((t) => !t.isLosing).id;
  page.tooth(safeId).click();
  page.runTimers();

  assert.equal(page.tooth(safeId).disabled, true, 'a resolved tooth is pressable again on the rebuilt board');
  const unresolved = [...page.state.teeth.values()].filter((t) => t.state === 'unresolved').map((t) => t.id);
  for (const id of unresolved) assert.equal(page.tooth(id).disabled, false, `${id} is unresolved but not pressable`);
});

test('a press that lands on the board but not on a tooth changes nothing', () => {
  const page = inRound();
  page.api.cutTo2D(page.app);
  const before = [...page.state.teeth.values()].filter((t) => t.state === 'unresolved').length;
  page.board().click();
  assert.equal([...page.state.teeth.values()].filter((t) => t.state === 'unresolved').length, before);
});

// ---- the loss that lands between a press and its resolution --------------------------------------

test('a loss mid-resolution finishes the press whose animation callback will never arrive', () => {
  // That completion was waiting on a hand animation the cancelled loop cannot deliver. Finishing it
  // here is what keeps the round from opening on a board where nothing is pressable.
  const page = inRound(4);
  const safeId = [...page.state.teeth.values()].find((t) => !t.isLosing).id;
  page.state.pressTooth(safeId);
  assert.equal(page.state.phase, 'RESOLVING_SAFE');

  page.api.cutTo2D(page.app);
  assert.equal(page.state.phase, 'TURN_TRANSITION', 'the interrupted press was never settled');
  page.runTimers();
  assert.equal(page.state.phase, 'PLAYER_TURN', 'the round opened on a board with nobody able to press');
});

test('a loss mid-bite still ends the round on the result card', () => {
  const page = inRound(4);
  page.state.pressTooth(page.state.losingToothId);
  assert.equal(page.state.phase, 'RESOLVING_LOSS');

  page.api.cutTo2D(page.app);
  assert.equal(page.state.phase, 'RESULT', 'the bite the loss interrupted never resolved: the HUD keeps naming a live turn');
});

test('a loss during the round intro needs nothing, and must not be settled anyway', () => {
  // The engine's own roundReset handler already scheduled the first turn on a plain timer, and that
  // timer survives the loss. Settling here would advance a turn nobody had taken.
  const page = makePage(4);
  page.state.startNewRound();
  assert.equal(page.state.phase, 'ROUND_INTRO');
  page.api.cutTo2D(page.app);
  assert.equal(page.state.phase, 'ROUND_INTRO');
  assert.deepEqual(page.timers, []);
});

test('a handoff scheduled by a round the player has left cannot start a turn in the next one', () => {
  const page = inRound(4);
  page.api.cutTo2D(page.app);
  const safeId = [...page.state.teeth.values()].find((t) => !t.isLosing).id;
  page.tooth(safeId).click();
  assert.equal(page.timers.length, 1, 'the handoff was not scheduled — this test measures nothing');

  // The player restarts before the handoff fires. The token moves, and the pending callback belongs
  // to a round that no longer exists.
  page.state.startNewRound(true);
  page.state.beginPlayerTurn();
  page.state.pressTooth(page.state.losingToothId);
  const phaseBefore = page.state.phase;
  page.runTimers();
  assert.equal(page.state.phase, phaseBefore, 'a stale handoff started a turn in the round that replaced its own');
});

// ---- the registration, which the executed slice cannot see ----------------------------------------

test('the loss is listened for on the canvas, once, and the default is not prevented', () => {
  // The canvas, not the container: `webglcontextlost` is dispatched at the canvas. Optional chaining
  // is load-bearing rather than defensive habit — with no context at all the engine never created a
  // canvas. `once`, because the canvas is gone by the end of the handler.
  const registration = glue.match(
    /document\s*\n?\s*\.querySelector\('#canvas-container canvas'\)\s*\n?\s*\?\.addEventListener\('webglcontextlost',[\s\S]{0,120}?\);/,
  );
  assert.ok(registration, 'the route no longer listens for webglcontextlost on the engine\'s canvas');
  assert.match(registration[0], /cutTo2D\(app\)/, 'the loss no longer cuts the route to its DOM board');
  assert.match(registration[0], /\{ once: true \}/, 'the listener is no longer once-only, and the canvas is gone by the end of it');
  // preventDefault is deliberately absent: the programs and geometry were built inside the engine,
  // so a `webglcontextrestored` this file cannot act on would be worse than none.
  assert.doesNotMatch(registration[0], /preventDefault/,
    'the handler now prevents the default, which asks for a restore nothing on this route can rebuild');
});

// ---- calibration ----------------------------------------------------------------------------------

test('RED CALIBRATION: the fixture really is a live round with a live 3D input path', () => {
  const page = inRound(4);
  // A round that had already ended, or a container with no listeners, would let every assertion above
  // pass on a route that severed nothing.
  assert.equal(page.state.phase, 'PLAYER_TURN');
  assert.equal([...page.state.teeth.values()].filter((t) => t.state === 'unresolved').length, page.state.teeth.size);
  assert.ok(page.container.listenerCount('pointerdown') > 0);
  assert.notEqual(page.app.animationFrameId, null);
  // And the stub's own discriminating behaviour: a disabled button swallows its activation. Without
  // this, the resolved-tooth assertion would pass on a board that re-enabled everything.
  const probe = makeNode('button');
  let fired = 0;
  probe.dataset.tooth = 'x';
  probe.addEventListener('click', () => { fired += 1; });
  probe.disabled = true;
  probe.click();
  assert.equal(fired, 0, 'the stub lets a disabled control fire — every arm-gate assertion here is vacuous');
  probe.disabled = false;
  probe.click();
  assert.equal(fired, 1, 'the stub lets no control fire at all — every press assertion here is vacuous');
});
