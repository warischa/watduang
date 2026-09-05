// gh#140: the setup roster row opens with the seat's ANIMAL, not a seat number. The shared shell
// panel already satisfied that ticket; this route builds its own setup screen, so the circle beside
// each name field kept rendering `1`, `2`, `3` until this test's subject was fixed.
//
// It runs the REAL bytes -- setupMarkup is sliced out of main.js and called. That function is a pure
// string builder over `setupCount`, `setupNames`, `esc` and the two cast lookups, so there is no DOM
// to fake here at all: the markup it returns IS the observable, and the badge is read out of it.
//
// THE TRAP this file also guards: the row's aria-label stays NUMBERED on purpose (gh#177). It is the
// field's positional label, never an identity -- it is never rendered as a name, never persisted, and
// never handed to the engine. The last test pins that it is still a number, so a future edit that
// "finishes the job" by casting the label too goes red here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast and the real lookups, imported rather than re-listed here.
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

// defaultName is the arrow setupMarkup closes over for the placeholder -- sliced too, so the row this
// file sees is the whole row main.js writes, badge and placeholder together.
const defaultNameDecl = 'const defaultName=';
const defaultNameDeclAt = source.indexOf(defaultNameDecl);
assert.notEqual(defaultNameDeclAt, -1, 'main.js no longer declares defaultName — this test is measuring nothing');
const defaultNameBody = source.slice(defaultNameDeclAt, source.indexOf(';', defaultNameDeclAt) + 1);

const buildMarkup = new Function(
  'setupCount',
  'setupNames',
  'esc',
  'mascotNames',
  'mascotEmoji',
  `${defaultNameBody}\n${sliceFunction('setupMarkup')}\nreturn setupMarkup();`,
);

/** The real markup for a party of `count`, with every seat still untyped. */
function markup(count) {
  return buildMarkup(count, [], (v) => String(v ?? ''), mascotNames, mascotEmoji);
}

/** Every .name-field row's badge text, in seat order. */
function badges(count) {
  const rows = markup(count).match(/<label class="name-field">[\s\S]*?<\/label>/g) ?? [];
  assert.notEqual(rows.length, 0, 'no .name-field rows in the rendered setup markup');
  return rows.map((row) => {
    // The span is the badge; the input beside it is not matched, so a stray digit in the field's own
    // markup cannot be mistaken for the badge's content.
    const m = /<span aria-hidden="true">([\s\S]*?)<\/span>/.exec(row);
    assert.ok(m, `no badge span in the rendered row: ${row}`);
    return m[1].trim();
  });
}

test('gh#140: every setup row badge is that seat mascot emoji', () => {
  const found = badges(4);
  assert.equal(found.length, 4);
  assert.deepEqual(
    found,
    MASCOTS.slice(0, 4).map((m) => m.emoji),
  );
});

test('gh#140: no setup row badge is a seat number', () => {
  badges(6).forEach((badge, i) => {
    assert.doesNotMatch(badge, /\d/, `seat ${i} badge still renders a number: ${badge}`);
  });
});

test('gh#140: the badge is aria-hidden, because the placeholder already names that animal', () => {
  const rows = markup(3).match(/<label class="name-field">[\s\S]*?<\/label>/g);
  for (const row of rows) assert.match(row, /<span aria-hidden="true">/);
  // The pairing itself: seat 0's badge is the cat icon and its placeholder is the cat's name.
  assert.match(rows[0], new RegExp(`placeholder="${mascotNames(1)[0]}"`));
});

// Calibration, in the shape that can actually fail: the digits a broken badge would render are NOT
// what the cast holds, so the reader above can tell the two apart. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a badge test passes on a
// badge that was never fixed.
test('RED CALIBRATION: a seat number is not a value the cast can produce', () => {
  const digits = Array.from({ length: 6 }, (_, i) => String(i + 1));
  const icons = Array.from({ length: 6 }, (_, i) => mascotEmoji(i));
  assert.notDeepEqual(icons, digits);
  for (const icon of icons) assert.doesNotMatch(icon, /\d/);
});

// THE TRAP, pinned so a later edit cannot quietly extend the icon into the accessible name. gh#177:
// this label is the field's POSITION, never an identity. Sourcing it from the cast would make it lie
// the moment a player types, and would give two seats the same label once two are renamed alike.
test('gh#177: the row aria-label stays numbered and is not sourced from the cast', () => {
  // Scoped to the .name-field rows, not the whole screen: the stepper above them carries aria-labels
  // of its own, and a filter on their text would be a guess about copy rather than about structure.
  const rows = markup(5).match(/<label class="name-field">[\s\S]*?<\/label>/g) ?? [];
  const labels = rows.map((row) => {
    const m = /aria-label="([^"]*)"/.exec(row);
    assert.ok(m, `a name-field row lost its aria-label: ${row}`);
    return m[1];
  });
  assert.equal(labels.length, 5, `expected one name-field label per seat, got ${labels.length}`);
  const castNames = new Set(MASCOTS.map((m) => m.name));
  labels.forEach((label, i) => {
    assert.match(label, /\d/, `seat ${i} lost its positional aria-label: ${label}`);
    assert.ok(!castNames.has(label), `seat ${i} aria-label was sourced from the cast: ${label}`);
  });
  assert.equal(labels[2], 'ชื่อผู้เล่น 3');
});
