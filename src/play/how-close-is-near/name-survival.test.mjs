// gh#196, the invariant this route lost: a name a player typed on the names screen survives every
// REBUILD of that screen, and only a seat that was removed loses its name.
//
// The bug it pins. `renderPlayerNamesScreen` built each field with a `placeholder` and no value, and
// nothing outside the live DOM held the typed text. Both ways back onto that screen re-run the
// render, so both wiped every name: `#btnBackToCount` (the reachable path in the ticket -- go back,
// change the count, come forward) and `#btnBackToNames` on the losing-rule screen one step further
// in. Fixing only the first would have left the second broken, which is why both are driven here.
//
// This is NOT a test of the reset control. Reset is SUPPOSED to lose the typed names, it is guarded
// by its own confirm, and reset-names.test.mjs owns it. The one thing this file says about reset is
// the interaction the fix could have broken: after a reset the animal names are what the screen
// holds, so they are what a later visit must show -- a store that quietly resurrected the pre-reset
// text would undo a confirmed, irreversible action.
//
// It runs the REAL bytes, same idiom as reset-names.test.mjs: main.js is a lifted IIFE with no
// exports, so the three screen renderers are sliced out by source text and evaluated. A rename or a
// rewrite fails this file loudly instead of silently testing nothing.
//
// TWO STATED CEILINGS.
// (1) `game` here is a plain object carrying the three fields these renderers touch, not the real
//     GameModel -- slicing that class would drag in the draw, the turn order and the losing rule for
//     no gain. So that the store really is initialised on the model a player gets, the constructor
//     line is pinned by source at the bottom. A behavioural test plus that one pin; neither alone.
// (2) `src/games/_fake-dom.mjs` does not map a parsed `id=` attribute onto `node.id`, so
//     `querySelector('#btnNextNames')` finds nothing there and these renderers cannot run against it
//     unmodified. That file belongs to the whole fleet and is not this ticket's to edit, so the
//     `El` subclass below adopts the attribute after each parse and nothing else about the fake
//     changes. It models one thing a real DOM does; it is not a second DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FakeElement, makeDocument } from '../../games/_fake-dom.mjs';
// The real cast. A stand-in would test this file's idea of the seat defaults instead of the shipped one.
import { mascotNames } from '../_mascots.ts';

const MAIN = path.join(import.meta.dirname, 'main.js');
const source = fs.readFileSync(MAIN, 'utf8');

/** Slices `function <name>(...)` out of main.js by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} -- this test is measuring nothing`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `no body found for ${name}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces while slicing ${name}`);
}

// GameState is `Object.freeze({...})`, so the brace walk above would stop one character early and
// hand back unparseable text. Taken to the end of its own statement instead, and its shape asserted.
const stateStart = source.indexOf('const GameState = ');
assert.notEqual(stateStart, -1, 'main.js no longer declares GameState');
const gameStateDecl = source.slice(stateStart, source.indexOf('});', stateStart) + 3);
assert.match(gameStateDecl, /PLAYER_COUNT:\s*'player_count'/, 'GameState no longer names PLAYER_COUNT');

/** A FakeElement that adopts a parsed `id=` onto `node.id` -- see ceiling (2) in the header. */
function adoptIds(node) {
  const id = node.getAttribute('id');
  if (id) node.id = id;
  node.children.forEach(adoptIds);
}
class El extends FakeElement {
  set innerHTML(v) {
    super.innerHTML = v;
    this.children.forEach(adoptIds);
  }
  get innerHTML() {
    return super.innerHTML;
  }
  // The count chips move a `selected` class around, and the shared fake has no classList either --
  // same ceiling (2) as the ids, same reason it is modelled here and not there. Backed by className,
  // so `.count-chip` still selects the chips after one is marked.
  get classList() {
    const words = () => this.className.split(/\s+/).filter(Boolean);
    return {
      add: (c) => { if (!words().includes(c)) this.className = [...words(), c].join(' '); },
      remove: (c) => { this.className = words().filter((w) => w !== c).join(' '); },
      contains: (c) => words().includes(c),
    };
  }
}

/** A live screen: the three renderers wired to one container and one `render()` that dispatches on
 *  `game.state`, exactly as main.js's own render() does. Returns the handles a test drives. */
function mountScreen({ playerCount = 3 } = {}) {
  const doc = makeDocument();
  doc.createElement = (tag) => new El(String(tag).toLowerCase(), doc);
  const container = new El('div', doc);
  const armed = [];
  const initPlayersCalls = [];

  const game = {
    state: 'player_names',
    playerCount,
    typedNames: [],
    loseCondition: 'nearest',
    initPlayers(names) {
      initPlayersCalls.push([...names]);
    },
  };

  const api = {};
  const stubs = {
    document: doc,
    container,
    game,
    defaultName: (i) => mascotNames(i + 1)[i],
    sound: { playClick() {} },
    armAllButtons: (root) => armed.push(root),
    // Reset has its own file. Supplied so the confirm handler's identifier resolves; never called here.
    resetNameInputs: () => {},
    LoseCondition: { NEAREST_LOSES: 'nearest', FARTHEST_LOSES: 'farthest' },
    render: () => {
      container.children = [];
      if (game.state === 'player_count') api.renderPlayerCountScreen();
      else if (game.state === 'player_names') api.renderPlayerNamesScreen();
      else if (game.state === 'lose_condition') api.renderLoseConditionScreen();
      armed.push(container);
    },
  };

  const names = ['renderPlayerCountScreen', 'renderPlayerNamesScreen', 'renderLoseConditionScreen'];
  const keys = Object.keys(stubs);
  // eslint-disable-next-line no-new-func -- the whole point is to execute main.js's own text.
  const factory = new Function(
    ...keys,
    `${gameStateDecl}\n;${names.map(sliceFn).join('\n;\n')}\n;return { ${names.join(', ')} };`,
  );
  Object.assign(api, factory(...keys.map((k) => stubs[k])));

  const card = () => container.children[0];
  return {
    game,
    armed,
    initPlayersCalls,
    card,
    render: stubs.render,
    /** Every name field on screen, in seat order. */
    fields: () => card().querySelectorAll('.player-text-input'),
    values: () => card().querySelectorAll('.player-text-input').map((el) => el.value),
    type: (typed) => typed.forEach((v, i) => { card().querySelectorAll('.player-text-input')[i].value = v; }),
    press: (id) => card().querySelector(`#${id}`).onclick(),
    // Matched on the chip's own label, which is the count followed by the route's Thai word for
    // "people" -- built from the same template the renderer uses, so a copy change reds this rather
    // than silently selecting nothing. Written as a line comment with no Thai in it: the repo's
    // stripper exempts text inside backticks, and leaning on that exemption is how a comment ends up
    // carrying Thai the rule says it must not.
    pickCount: (n) => {
      const chip = card().querySelectorAll('.count-chip').find((c) => c.textContent.trim() === `${n} คน`);
      assert.ok(chip, `no count chip for ${n} players`);
      chip.onclick();
    },
  };
}

const seat = (i) => mascotNames(i + 1)[i];

test('back to the count screen, change the count, forward again -- every remaining name survives', () => {
  const s = mountScreen({ playerCount: 3 });
  s.render();
  s.type(['พี่โต้ง', 'ชิบะ', 'น้องหมวย']);

  s.press('btnBackToCount');
  assert.equal(s.game.state, 'player_count', 'Back did not reach the count screen');
  s.pickCount(4);
  s.press('btnNextCount');

  assert.equal(s.game.state, 'player_names');
  assert.deepEqual(s.values(), ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', ''],
    'the typed names did not survive the rebuild -- gh#196');
  // The new seat shows its animal name as a placeholder, not as typed text: an empty field still
  // means "not named", which is what initPlayers reads to fall back to the cast.
  assert.equal(s.fields()[3].getAttribute('placeholder'), seat(3));
});

test('lowering the count drops only the seats it removed, and does not hand their names to new seats', () => {
  const s = mountScreen({ playerCount: 5 });
  s.render();
  s.type(['ก', 'ข', 'ค', 'ง', 'จ']);

  s.press('btnBackToCount');
  s.pickCount(3);
  s.press('btnNextCount');
  assert.deepEqual(s.values(), ['ก', 'ข', 'ค'], 'a remaining seat lost its name on a shrink');

  // Back up to five. The two seats that were removed are gone for good -- the decided behaviour,
  // and the one that matters: seat 4 must not inherit the name of the player who left.
  s.press('btnBackToCount');
  s.pickCount(5);
  s.press('btnNextCount');
  assert.deepEqual(s.values(), ['ก', 'ข', 'ค', '', '']);
});

test('back from the losing-rule screen also keeps the names', () => {
  const s = mountScreen({ playerCount: 3 });
  s.render();
  s.type(['ก', '', 'ค']);

  s.press('btnNextNames');
  assert.equal(s.game.state, 'lose_condition');
  assert.deepEqual(s.initPlayersCalls, [['ก', '', 'ค']], 'Next stopped passing the typed names on');

  s.press('btnBackToNames');
  assert.equal(s.game.state, 'player_names');
  assert.deepEqual(s.values(), ['ก', '', 'ค'], 'the second way back onto this screen still wipes it');
});

test('a hostile name round-trips as text and writes no value attribute', () => {
  // The same payload as name-escaping.test.mjs: the leading `">` closes any attribute the name lands
  // in, and the anchor is an element in body context. The fix restores the name as a DOM property,
  // so there is no attribute for it to escape from -- this asserts that, rather than assuming it.
  const HOSTILE = 'นัท"><a href="/x">boom</a>';
  const s = mountScreen({ playerCount: 2 });
  s.render();
  s.type([HOSTILE, 'ข']);

  s.press('btnBackToCount');
  s.press('btnNextCount');

  assert.deepEqual(s.values(), [HOSTILE, 'ข'], 'the name did not survive as text');
  assert.equal(s.fields()[0].getAttribute('value'), null,
    'the name was written into a value= attribute -- that is a new HTML sink, escape it or stop');
  assert.equal(s.card().querySelectorAll('a').length, 0,
    'the name introduced an element -- ADR-0026');
});

test('after a reset, a later visit shows the animal names and never the text they replaced', () => {
  const s = mountScreen({ playerCount: 3 });
  s.render();
  s.type(['พี่โต้ง', 'ชิบะ', 'น้องหมวย']);

  // What the confirmed reset leaves behind: resetNameInputs writes each seat's animal name straight
  // onto the live inputs. reset-names.test.mjs proves that write; this only takes it as the state.
  s.fields().forEach((f, i) => { f.value = seat(i); });

  s.press('btnBackToCount');
  s.press('btnNextCount');
  assert.deepEqual(s.values(), [seat(0), seat(1), seat(2)],
    'the store resurrected names a player had already confirmed away');
});

test('the model a player gets initialises the store this screen reads', () => {
  // Ceiling (1) in the header: the harness above supplies its own `game`, so the real constructor is
  // pinned here instead. Without this line game.typedNames is undefined on a fresh device and the
  // first render throws.
  const ctor = source.slice(source.indexOf('class GameModel {'), source.indexOf('startNewGame()'));
  assert.match(ctor, /this\.typedNames = \[\];/,
    'GameModel no longer initialises typedNames -- the names screen would throw on a fresh device');
});
