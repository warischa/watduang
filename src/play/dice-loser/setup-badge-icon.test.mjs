// gh#140: the setup roster row opens with the seat's ANIMAL, not a seat number. The shared shell
// panel already satisfied that ticket; this route builds its own setup screen, so its badge kept
// rendering `1`, `2`, `3` beside the mascot names until this test's subject was fixed.
//
// It runs the REAL bytes. main.ts is a module whose top level touches `document`, so it cannot be
// imported here; renderRows is sliced out by source text and driven over a fake DOM this file
// supplies -- the same technique reset-names.test.mjs uses on resetNames. A rewrite of renderRows
// fails this file loudly instead of silently testing nothing.
//
// THE TRAP this file also guards: the row's aria-label stays NUMBERED on purpose (gh#177). It is the
// field's positional label, not an identity, and sourcing it from the cast would make it lie the
// moment a player types. The last test below pins that it is still a number, so a future edit that
// "finishes the job" by casting the label too goes red here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed -- a stand-in would test this file's idea of the
// mascots instead of the one that ships.
import { MASCOTS, mascotEmoji } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

/** Slices `function <name>(...)` out of main.ts by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `function ${name}(`;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.ts no longer declares ${name} — this test is measuring nothing`);
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

// `new Function` parses JavaScript, not TypeScript. The slice carries exactly one annotation, the
// return type, and it is stripped here -- asserted first, so a rewrite that changes the declaration's
// shape fails loudly instead of quietly evaluating something this file did not read.
const sliced = sliceFn('renderRows');
assert.match(sliced, /^function renderRows\(\): void \{/);
const body = sliced.replace('function renderRows(): void {', 'function renderRows() {');

/** A fake element good for exactly the nodes renderRows builds: it remembers what was written to it
 *  and what was appended, and nothing else. */
function makeEl(tag) {
  return {
    tag,
    className: '',
    textContent: '',
    type: '',
    value: '',
    maxLength: 0,
    attrs: {},
    kids: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener() {},
    append(...nodes) {
      this.kids.push(...nodes);
    },
  };
}

const runRender = new Function(
  'document',
  'listEl',
  'countEl',
  'count',
  'names',
  'MIN_PLAYERS',
  'MAX_PLAYERS',
  'NAME_MAX',
  'mascotEmoji',
  'save',
  `let decEl = null; let incEl = null;\n${body}\nrenderRows();`,
);

/** Drives the real renderRows for a party of `count` and returns one entry per rendered row. */
function render(count) {
  const listEl = {
    kids: [],
    replaceChildren() {
      this.kids = [];
    },
    appendChild(row) {
      this.kids.push(row);
    },
  };
  runRender(
    { createElement: makeEl },
    listEl,
    { textContent: '' },
    count,
    MASCOTS.map((m) => m.name),
    2,
    MASCOTS.length,
    12,
    mascotEmoji,
    () => {},
  );
  return listEl.kids.map((row) => {
    const [badge, input] = row.kids;
    return { badge: badge.textContent, label: input.attrs['aria-label'] };
  });
}

test('gh#140: every setup row badge is that seat mascot emoji', () => {
  const rows = render(4);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((r) => r.badge),
    MASCOTS.slice(0, 4).map((m) => m.emoji),
  );
});

test('gh#140: no setup row badge is a seat number', () => {
  for (const [i, row] of render(6).entries()) {
    assert.doesNotMatch(row.badge, /\d/, `seat ${i} badge still renders a number: ${row.badge}`);
  }
});

// Calibration, in the shape that can actually fail: the digits a broken badge would render are NOT
// what the cast holds, so the harness above can tell the two apart. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a badge test passes on
// a badge that was never fixed.
test('RED CALIBRATION: a seat number is not a value the cast can produce', () => {
  const digits = Array.from({ length: 6 }, (_, i) => String(i + 1));
  const icons = Array.from({ length: 6 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, digits);
  for (const icon of icons) assert.doesNotMatch(icon, /\d/);
});

// THE TRAP, pinned so a later edit cannot quietly extend the icon into the accessible name. gh#177:
// this label is the field's POSITION ("the name of the Nth player"), never an identity -- it is never
// rendered as a name, never persisted, and never handed to the engine. Sourcing it from the cast
// would make it lie the moment a player types, and would give two seats the same label once two are
// renamed alike.
test('gh#177: the row aria-label stays numbered and is not sourced from the cast', () => {
  const castNames = new Set(MASCOTS.map((m) => m.name));
  for (const [i, row] of render(5).entries()) {
    assert.match(row.label, /\d/, `seat ${i} lost its positional aria-label: ${row.label}`);
    assert.ok(!castNames.has(row.label), `seat ${i} aria-label was sourced from the cast: ${row.label}`);
  }
  // Verbatim, because the label is the only part of this row a screen-reader user hears as position.
  assert.equal(render(3)[2].label, 'ชื่อผู้เล่นคนที่ 3');
});
