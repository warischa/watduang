// gh#140: the setup roster row opens with the seat's ANIMAL, not a seat number. The shared shell
// panel already satisfied that ticket; this route builds its own names screen, so its .player-badge
// disc kept rendering `1`, `2`, `3` beside the mascot placeholders until this test's subject was
// fixed.
//
// It runs the REAL bytes -- renderPlayerNamesScreen is sliced out of main.js and driven over a fake
// DOM this file supplies, reading the badge back out of the row markup the real function writes. The
// fake is memoised by selector, so the #nameList the function looks up is the same node this file
// then reads its rows from; every other lookup lands on a throwaway node, which is all the modal
// wiring below the loop needs to survive the call.
//
// This route's row has NO aria-label to guard: the input carries only a placeholder, and the badge is
// aria-hidden because it pictures the animal that placeholder already names. The seat's POSITION is a
// separate channel and is deliberately not sourced from the cast -- see the sibling routes that do
// carry a numbered label (gh#177).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast and the real icon lookup, imported rather than re-listed here.
import { MASCOTS, mascotEmoji, mascotNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `function <name>(...)` out of main.js by matching braces from the first `{` of its body. */
function sliceFunction(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
  const open = source.indexOf('{', start);
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

const renderBody = sliceFunction('renderPlayerNamesScreen');
// defaultName is the arrow the loop closes over for the placeholder -- sliced too, so the row this
// file sees is the whole row main.js writes, badge and placeholder together.
const defaultNameDecl = 'const defaultName = ';
const defaultNameDeclAt = source.indexOf(defaultNameDecl);
assert.notEqual(defaultNameDeclAt, -1, 'main.js no longer declares defaultName — this test is measuring nothing');
const defaultNameBody = source.slice(defaultNameDeclAt, source.indexOf(';', defaultNameDeclAt) + 1);

/** A fake element good for exactly what renderPlayerNamesScreen does to a node: write innerHTML, set
 *  a class or an attribute, append children, look one up, hang an onclick on it. */
function makeEl() {
  const bySelector = new Map();
  return {
    className: '',
    id: '',
    innerHTML: '',
    style: {},
    onclick: null,
    value: '',
    kids: [],
    setAttribute() {},
    appendChild(node) {
      this.kids.push(node);
      return node;
    },
    // Memoised: the same selector hands back the same node every time, which is what lets the test
    // read the rows out of the very #nameList the function appended into.
    querySelector(sel) {
      if (!bySelector.has(sel)) bySelector.set(sel, makeEl());
      return bySelector.get(sel);
    },
    querySelectorAll() {
      return [];
    },
  };
}

const runRender = new Function(
  'document',
  'container',
  'game',
  'sound',
  'render',
  'GameState',
  'armAllButtons',
  'resetNameInputs',
  'mascotNames',
  'mascotEmoji',
  `${defaultNameBody}\n${renderBody}\nrenderPlayerNamesScreen();\nreturn container.kids[0];`,
);

/** Drives the real function for a party of `count` and returns each rendered row's raw markup. */
function render(count) {
  const container = makeEl();
  const noop = () => {};
  const card = runRender(
    { createElement: makeEl },
    container,
    { playerCount: count, typedNames: [] },
    { playClick: noop },
    noop,
    { PLAYER_COUNT: 'player_count', LOSE_CONDITION: 'lose_condition' },
    noop,
    noop,
    mascotNames,
    mascotEmoji,
  );
  assert.ok(card, 'renderPlayerNamesScreen appended no card — this test is measuring nothing');
  return card.querySelector('#nameList').kids.map((row) => row.innerHTML);
}

/** The text between the .player-badge disc's own tags -- the badge a player actually reads. */
function badgeText(rowHtml) {
  const m = /<div class="player-badge"[^>]*>([\s\S]*?)<\/div>/.exec(rowHtml);
  assert.ok(m, `no .player-badge in the rendered row: ${rowHtml}`);
  return m[1].trim();
}

test('gh#140: every setup row badge is that seat mascot emoji', () => {
  const rows = render(4);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map(badgeText),
    MASCOTS.slice(0, 4).map((m) => m.emoji),
  );
});

test('gh#140: no setup row badge is a seat number', () => {
  render(6).forEach((row, i) => {
    assert.doesNotMatch(badgeText(row), /\d/, `seat ${i} badge still renders a number: ${badgeText(row)}`);
  });
});

test('gh#140: the badge is aria-hidden, because the placeholder already names that animal', () => {
  for (const row of render(3)) {
    assert.match(row, /<div class="player-badge" aria-hidden="true">/);
  }
  // The pairing itself: seat 0's badge is the cat icon and its placeholder is the cat's name.
  assert.match(render(3)[0], new RegExp(`placeholder="${mascotNames(1)[0]}"`));
});

// Calibration, in the shape that can actually fail: the digits a broken badge would render are NOT
// what the cast holds, so the harness above can tell the two apart. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a badge test passes on a
// badge that was never fixed.
test('RED CALIBRATION: a seat number is not a value the cast can produce', () => {
  const digits = Array.from({ length: 6 }, (_, i) => String(i + 1));
  const icons = Array.from({ length: 6 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, digits);
  for (const icon of icons) assert.doesNotMatch(icon, /\d/);
});
