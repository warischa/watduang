// gh#177, the invariant a reader of the diff cannot check by eye: after the reset confirm is
// accepted, the roster holds the animal cast again, it holds exactly as many seats as before, and
// every name a player typed is gone.
//
// It runs the REAL bytes. main.ts is a module whose top level touches `document`, so it cannot be
// imported here; resetNames is sliced out by source text and evaluated over a `names` array this file
// supplies — the same technique short-stick's reset-names.test.mjs uses on resetPlayerNames. A rename
// or a rewrite of resetNames fails this file loudly instead of silently testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly — resetNames owns the state
// move and the confirm handler owns save() and renderRows(). What that costs is stated: this proves
// the WIPE, and separately (by source, at the bottom) that the confirm handler is wired to it and
// persists the result. That the button is inert for 400ms first is arm-reveal-paths.test.mjs's job,
// and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here — a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { MASCOTS, resetCastNames } from '../_mascots.ts';

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
// return type, and it is stripped here — asserted first, so a rewrite that changes the declaration's
// shape fails loudly instead of quietly evaluating something this file did not read.
const sliced = sliceFn('resetNames');
assert.match(sliced, /^function resetNames\(\): void \{/);
const body = sliced.replace('function resetNames(): void {', 'function resetNames() {');

// Applied, not returned: resetNames closes over main.ts's module-level `names` and over the shared
// cast's resetCastNames, so the wrapper supplies both and CALLS it.
const applyReset = new Function(
  'seed',
  'resetCastNames',
  `let names = seed; ${body}; resetNames(); return names;`,
);

// What main.ts's own `names` always holds: one entry per mascot seat, whatever the count is.
const SEATS = MASCOTS.length;
const castNames = MASCOTS.map((m) => m.name);

test('reset restores the animal cast and loses every typed name', () => {
  // The screen a player is looking at when they press reset: mascot seats, three renamed by hand,
  // one of them to a string that is not in the cast at all.
  const seed = castNames.slice();
  seed[0] = 'พี่โต้ง';
  seed[3] = 'น้องหมวย';
  seed[7] = 'Bank';

  const after = applyReset(seed, resetCastNames);

  assert.deepEqual(after, castNames);
  for (const typed of ['พี่โต้ง', 'น้องหมวย', 'Bank']) {
    assert.ok(!after.includes(typed), `a typed name survived the reset: ${typed}`);
  }
});

test('reset keeps the seat array the same length, so the player count cannot move', () => {
  const after = applyReset(
    Array.from({ length: SEATS }, (_, i) => `typed ${i}`),
    resetCastNames,
  );
  assert.equal(after.length, SEATS);
  // The count lives in a separate variable that resetNames does not name at all — pinned as absence,
  // because the promise the confirm's copy makes is exactly that the party keeps its size.
  assert.doesNotMatch(body, /\bcount\b/, 'resetNames now touches `count` — the confirm promises it survives');
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetNames that did nothing at all leaves the first test red. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a reset test passes on a
// no-op.
test('RED CALIBRATION: the fixtures start off-cast, so a no-op reset would fail', () => {
  const seed = castNames.slice();
  seed[0] = 'พี่โต้ง';
  assert.notDeepEqual(seed, castNames);
  assert.notDeepEqual(
    Array.from({ length: SEATS }, (_, i) => `typed ${i}`),
    castNames,
  );
});

// The wiring the pure slice above cannot see: the confirm persists the wipe and redraws the rows.
// Without save() the typed names come back on the next load, which is the opposite of what the copy
// promises ("เอากลับคืนไม่ได้").
test('the confirm handler persists the wipe and redraws the rows', () => {
  const handler = source.match(/resetConfirmEl\.addEventListener\('click',[\s\S]*?\n {2}\}\);/);
  assert.ok(handler, 'the reset confirm handler is no longer recognisable — this test measures nothing');
  assert.match(handler[0], /\bresetNames\(\)/);
  assert.match(handler[0], /\bsave\(\)/);
  assert.match(handler[0], /\brenderRows\(\)/);
});

// The confirm's copy names every loss it causes, per docs/agents/src-edit-rules.md. Pinned as text
// because it is the only part of this feature a player reads, and a well-meaning edit that drops the
// irreversibility clause is invisible to every other check in this directory.
test('the confirm copy still names the loss and what survives', () => {
  const markup = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
  assert.match(
    markup,
    /ชื่อผู้เล่นที่พิมพ์ไว้จะถูกแทนด้วยชื่อสัตว์ทั้งหมด และเอากลับคืนไม่ได้ จำนวนผู้เล่นที่ตั้งไว้จะยังคงอยู่/,
  );
  // The trigger and the two answers, verbatim from the gh#174 pattern.
  assert.match(markup, /↺ รีเซ็ตเป็นชื่อสัตว์/);
  assert.match(markup, /เก็บชื่อเดิมไว้/);
});

// gh#177 box: "their visible cast is unchanged when nobody presses reset — this ticket must not alter
// what a player sees on open". Proved as a set claim rather than a spot check: resetNames( appears
// exactly twice in the whole file -- its own declaration and the one call site the test above already
// showed sits inside resetConfirmEl's click handler. There being no third occurrence is what rules out
// a call on the module's own load path (or any other path a player reaches without pressing reset).
test('gh#177 box: resetNames has exactly one call site, and it is the confirm click', () => {
  const occurrences = source.split('resetNames(').length - 1;
  assert.equal(occurrences, 2, `resetNames( appears ${occurrences} time(s) — expected exactly 2 (the declaration and the one call inside the confirm handler)`);
});

// gh#177 box: "renaming still persists as it does today, on all four". load()/save() are this route's
// whole persistence layer -- no shared roster, ADR-0053's deliberate exception (see the comment on
// STORE_KEY above). Sliced the same way resetNames is: real bytes, TS annotations stripped and
// asserted first so a rewrite of either function's shape fails loudly instead of quietly evaluating
// nothing.
const loadSliced = sliceFn('load');
assert.match(loadSliced, /^function load\(\): void \{/);
assert.match(loadSliced, / as Partial<Saved>/);
const loadBody = loadSliced.replace('function load(): void {', 'function load() {').replace(' as Partial<Saved>', '');

const saveSliced = sliceFn('save');
assert.match(saveSliced, /^function save\(\): void \{/);
assert.match(saveSliced, / satisfies Saved/);
const saveBody = saveSliced.replace('function save(): void {', 'function save() {').replace(' satisfies Saved', '');

const storeKeyMatch = source.match(/const STORE_KEY = '([^']+)';/);
assert.ok(storeKeyMatch, 'STORE_KEY is gone from main.ts — this test measures nothing');
const STORE_KEY = storeKeyMatch[1];
const nameMaxMatch = source.match(/const NAME_MAX = (\d+);/);
assert.ok(nameMaxMatch, 'NAME_MAX is gone from main.ts — this test measures nothing');
const NAME_MAX = Number(nameMaxMatch[1]);

const applySave = new Function(
  'STORE_KEY',
  'localStorage',
  'seedCount',
  'seedNames',
  `let count = seedCount; let names = seedNames; ${saveBody}\nsave();`,
);
const applyLoad = new Function(
  'MASCOTS',
  'MAX_PLAYERS',
  'MIN_PLAYERS',
  'NAME_MAX',
  'STORE_KEY',
  'localStorage',
  'seedCount',
  'seedNames',
  `let count = seedCount; let names = seedNames; ${loadBody}\nload();\nreturn { count, names };`,
);

test('gh#177 box: a typed name persists across a save/load round trip', () => {
  const store = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const typed = MASCOTS.map((m) => m.name);
  typed[0] = 'พี่โต้ง';
  applySave(STORE_KEY, fakeLocalStorage, 6, typed);

  // A fresh load, on names that start off the typed value — a load() that does nothing would leave
  // this exactly as it starts, which is why the seed is deliberately NOT the saved shape already.
  const reloaded = applyLoad(
    MASCOTS,
    MASCOTS.length,
    2,
    NAME_MAX,
    STORE_KEY,
    fakeLocalStorage,
    6,
    MASCOTS.map((m) => m.name),
  );
  assert.equal(reloaded.count, 6);
  assert.equal(reloaded.names[0], 'พี่โต้ง', 'a typed name did not survive the save/load round trip');
});
