// gh#174, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, the
// roster holds the animal cast again, it holds exactly as many seats as before, and every name a
// player typed is gone.
//
// It runs the REAL bytes. main.js is a lifted IIFE with no exports, so resetPlayerNames is sliced out
// by source text and evaluated over a `game` object this file supplies -- the same technique, and the
// same brace-matching slicer, that fairness.test.mjs already uses on lockFairCounts. A rename or a
// rewrite of resetPlayerNames fails this file loudly instead of silently testing nothing.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly -- resetPlayerNames owns the
// state move and its handler owns saveDraft/renderSetup. What that costs is stated: this proves the
// WIPE, never that the button is wired to it. The wiring (trigger -> openDialog -> confirm button ->
// resetPlayerNames) is pinned by arm-reveal-paths.test.mjs, and neither file substitutes for the
// other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// The real cast, imported rather than re-listed here — a stand-in would test this file's idea of the
// reset instead of the one that ships.
import { MASCOTS, mascotNames, resetCastNames } from '../_mascots.ts';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices `const <name> = ...;` out of main.js by matching braces from the first `{` of its body. */
function sliceFn(name) {
  const decl = `const ${name} = `;
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${name} — this test is measuring nothing`);
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

// Applied, not returned: resetPlayerNames closes over main.js's `game` and over the shared cast's
// resetCastNames, so the wrapper supplies both and CALLS it.
const body = sliceFn('resetPlayerNames');
const applyReset = new Function('game', 'resetCastNames', `${body}; resetPlayerNames(); return game;`);

test('reset restores the animal cast, keeps the count, and loses every typed name', () => {
  // The screen a player is looking at when they press reset: four seats, two renamed by hand, one
  // renamed to a string that is not in the cast at all.
  const game = { players: ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'] };
  applyReset(game, resetCastNames);

  assert.equal(game.players.length, 4, 'the party changed size — reset must keep the count');
  assert.deepEqual(game.players, mascotNames(4));
  assert.ok(!game.players.includes('พี่โต้ง'), 'a typed name survived the reset');
  assert.ok(!game.players.includes('น้องหมวย'), 'a typed name survived the reset');
});

test('reset keeps the count at both ends of the 2-10 range', () => {
  for (const n of [2, 10]) {
    const game = { players: Array.from({ length: n }, (_, i) => `typed ${i}`) };
    applyReset(game, resetCastNames);
    assert.equal(game.players.length, n);
    assert.deepEqual(game.players, mascotNames(n));
  }
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetPlayerNames that did nothing at all leaves this red. Asserted here rather than left implicit,
// because a fixture that already satisfies the expectation is how a reset test passes on a no-op.
test('RED CALIBRATION: the fixture starts off-cast, so a no-op reset would fail', () => {
  const before = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  assert.notDeepEqual(before, mascotNames(4));
});

// main.js must have no numbered default left on any path a player can see. The visible-name paths are
// the state array it boots with, the placeholder, the blank-field fallback and the added seat; all
// four now route through the shared cast. Pinned by absence, which is fragile on its own, so the
// positive half is pinned too: the cast import has to still be there.
test('no numbered default remains in main.js', () => {
  const numbered = source
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /ผู้เล่น\s*(\$\{|\d)/.test(line))
    .filter(([, line]) => !line.trimStart().startsWith('//'));
  assert.deepEqual(numbered, [], `numbered default(s) left in main.js: ${JSON.stringify(numbered)}`);
  assert.match(source, /import \{[^}]*mascotNames[^}]*\} from '\.\.\/_mascots\.ts'/);
});

// gh#174 box 3: "the route reads the shared cast; it defines no list of its own" is a claim about
// the WHOLE directory, not about main.js alone — a hardcoded name anywhere here (markup.html,
// roster-bridge.ts, stick-canvas.ts, canvas-pixels-probe.mjs) falsifies it just as much as one in
// main.js would. Enumerated over the directory's own file list, not a hand-picked subset.
test('gh#174 box 3: no file in the route directory hardcodes a mascot name', () => {
  const dir = import.meta.dirname;
  const names = MASCOTS.map((m) => m.name);
  assert.ok(names.length > 0, 'MASCOTS is empty — this test would pass vacuously');
  const files = fs.readdirSync(dir).filter((f) => !f.endsWith('.test.mjs'));
  assert.ok(files.length > 0, 'the route directory is empty — this test would pass vacuously');
  const offenders = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    // Full-line `//` comments document history in prose (e.g. main.js's own note on a past bug that
    // named a mascot) and are not a list a caller reads from. Same idiom as
    // arm-reveal-paths.test.mjs's REVEAL_RE source. Files with a different comment syntax (markup.html,
    // *.css) are checked unstripped — nothing here currently needs stripping for them.
    const stripped = raw
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    for (const name of names) {
      if (stripped.includes(name)) offenders.push(`${file}: "${name}"`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `hardcoded mascot name(s) found outside _mascots.ts: ${offenders.join(', ')} — the route must ` +
      'read every name through mascotNames/resetCastNames/MASCOTS, never spell one out itself',
  );
});

// gh#174 box 4: renaming a player is untouched by this issue's work, but nothing pinned that a typed
// name actually survives — only that a RESET discards it. loadDraft/saveDraft are the persistence
// half of that path (the input handler writes into game.players and calls saveDraft; renderSetup
// reads game.players back). Sliced the same way as resetPlayerNames: real bytes, no DOM, a rename or
// rewrite of either function fails this loudly.
const saveBody = sliceFn('saveDraft');
const loadBody = sliceFn('loadDraft');
// Two callables, not one: saveDraft writes from `game`, loadDraft writes INTO `game` — sharing one
// Function body and calling both would silently run save-then-save (a bug caught while writing this
// test: it called saveDraft() twice and the round trip "passed" on an untouched fixture).
const applySave = new Function('game', 'localStorage', 'draftKey', `${saveBody}\nsaveDraft();`);
const applyLoad = new Function('game', 'localStorage', 'draftKey', `${loadBody}\nloadDraft();\nreturn game;`);

test('gh#174 box 4: a typed name persists across a save/load round trip', () => {
  const store = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  const renamed = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้'];
  const saved = {
    players: renamed,
    stickCount: 4,
    shortCount: 1,
    penaltyMode: 'none',
    selectedPenalty: '',
  };
  applySave(saved, fakeLocalStorage, 'short-stick-pro-v2');

  // A fresh load, on an object that starts off the renamed values — a loadDraft that does nothing
  // would leave this exactly as it starts, which is why the fixture is deliberately NOT the saved
  // shape already.
  const reloaded = { players: ['SHOULD NOT SURVIVE'], stickCount: 6, shortCount: 1, penaltyMode: 'none', selectedPenalty: '' };
  applyLoad(reloaded, fakeLocalStorage, 'short-stick-pro-v2');

  assert.deepEqual(reloaded.players, renamed, 'a typed name did not survive the save/load round trip');
});

// gh#174 box 2, second half: the loss box 1/2 describe must be SAID before it happens, not just true
// after. Pinned against the actual dialog copy in markup.html, not against the mere presence of a
// confirm — a confirm with blank or generic copy would satisfy every other check in this file.
test('gh#174 box 2: the reset confirm states the loss before it happens', () => {
  const markupPath = path.join(import.meta.dirname, 'markup.html');
  const markup = fs.readFileSync(markupPath, 'utf8');
  const marker = 'id="reset-names-dialog"';
  const markerAt = markup.indexOf(marker);
  assert.notEqual(markerAt, -1, 'reset-names-dialog is gone from markup.html — this test measures nothing');
  const openAt = markup.lastIndexOf('<dialog', markerAt);
  const closeAt = markup.indexOf('</dialog>', markerAt);
  const dialog = markup.slice(openAt, closeAt);

  assert.match(
    dialog,
    /ชื่อผู้เล่นที่พิมพ์ไว้จะถูกแทนด้วยชื่อสัตว์ทั้งหมด/,
    'the confirm no longer names the loss — a player pressing reset is not told typed names are replaced',
  );
  assert.match(
    dialog,
    /เอากลับคืนไม่ได้/,
    'the confirm no longer says the loss cannot be undone',
  );
  assert.match(
    dialog,
    /จำนวนผู้เล่น.*จะยังคงอยู่/,
    'the confirm no longer promises the player count survives the reset',
  );
});
