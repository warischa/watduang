// gh#177, the invariant a reader of the diff cannot check by eye: after the confirm is accepted, the
// roster holds the animal cast again, it holds exactly as many seats as before, and every name a
// player typed is gone.
//
// It runs the REAL bytes. main.js is a lifted IIFE with no exports, so the engine's resetPlayerNames
// method is sliced out by source text and evaluated as a method on a plain object this file supplies
// -- the same brace-matching slicer short-stick/reset-names.test.mjs uses on its own reset. A rename
// or a rewrite of resetPlayerNames fails this file loudly instead of silently testing nothing.
//
// MASCOT_PLAYERS is sliced too, not stubbed: this route keeps its own copy of the cast on purpose
// (the file is a verbatim mockup lift), so the names the reset writes must come from the array that
// ships. That the copy still matches src/play/_mascots.ts row for row is mascot-defaults.test.mjs's
// job, and this file leans on it rather than repeating it.
//
// ponytail: no DOM. This repo has no jsdom, and the reset splits cleanly -- resetPlayerNames owns the
// state move plus its own savePlayers(), and the confirm handler owns renderApp(). What that costs is
// stated: this proves the WIPE, and separately (by source, at the bottom) that the confirm is wired
// to it. That the modal's buttons are inert for their arm window is arm-reveal-paths.test.mjs's job,
// and neither file substitutes for the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.js'), 'utf8');

/** Slices a declaration out of main.js by matching from `open` to its partner. */
function sliceFrom(decl, open, close) {
  const start = source.indexOf(decl);
  assert.notEqual(start, -1, `main.js no longer declares ${decl.trim()} -- this test is measuring nothing`);
  const from = source.indexOf(open, start);
  assert.notEqual(from, -1, `no body found for ${decl.trim()}`);
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${open}${close} while slicing ${decl.trim()}`);
}

const castDecl = sliceFrom('const MASCOT_PLAYERS = [', '[', ']');
const method = sliceFrom('resetPlayerNames() {', '{', '}');

// Applied, not returned: resetPlayerNames is a method that reads `this.players` and calls the
// engine's own savePlayers(), so the wrapper gives it a receiver carrying both and CALLS it.
// savePlayers is the one stub -- it writes localStorage, which is not what this file measures; the
// call is recorded so the persistence half is still asserted rather than assumed.
const run = new Function(
  'seed',
  `${castDecl};
   let saved = null;
   const engine = {
     players: seed,
     savePlayers() { saved = this.players; },
     ${method}
   };
   engine.resetPlayerNames();
   return { players: engine.players, saved, cast: MASCOT_PLAYERS };`,
);

const { cast } = run([]);
const castNames = cast.map((m) => m.defaultName);
// A slice that silently matched nothing would agree with an empty roster and read as a pass.
assert.equal(castNames.length, 20, 'the sliced MASCOT_PLAYERS is not the cast this route ships');

/** The roster shape the engine holds: one object per seat, name plus the mascot fields it keeps. */
const seat = (i, name) => ({ id: `p${i + 1}`, name, emoji: cast[i].emoji, defaultName: cast[i].defaultName });

test('reset restores the animal cast, keeps the count, and loses every typed name', () => {
  // The screen a player is looking at when they press reset: five seats, three renamed by hand, one
  // renamed to a string that is not in the cast at all.
  const typed = ['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้', 'Bank'];
  const { players, saved } = run(typed.map((name, i) => seat(i, name)));

  assert.equal(players.length, 5, 'the party changed size -- reset must keep the count');
  assert.deepEqual(players.map((p) => p.name), castNames.slice(0, 5));
  for (const name of ['พี่โต้ง', 'น้องหมวย', 'Bank']) {
    assert.ok(!players.some((p) => p.name === name), `a typed name survived the reset: ${name}`);
  }
  // The seat's own identity is untouched -- a reset renames, it does not rebuild the roster.
  assert.deepEqual(players.map((p) => p.id), ['p1', 'p2', 'p3', 'p4', 'p5']);
  // Without this the typed names come back on the next load, which is the opposite of what the
  // confirm's copy promises ("เอากลับคืนไม่ได้").
  assert.equal(saved, players, 'the reset did not persist -- savePlayers was never called on the result');
});

// Both ends of the range setPlayerCount clamps to. That clamp is wider than the 2-10 the manifest
// advertises for this game, and the wider one is used here on purpose: the reset must hold over every
// roster the engine can actually be holding, not only the sizes the hub promises.
test('reset keeps the count at both ends of the range the engine clamps to', () => {
  for (const n of [2, 20]) {
    const { players } = run(Array.from({ length: n }, (_, i) => seat(i, `typed ${i}`)));
    assert.equal(players.length, n);
    assert.deepEqual(players.map((p) => p.name), castNames.slice(0, n));
  }
});

// Calibration, in the shape that can actually fail: the roster handed in is NOT the cast, so a
// resetPlayerNames that did nothing at all leaves the tests above red. Asserted here rather than left
// implicit, because a fixture that already satisfies the expectation is how a reset test passes on a
// no-op.
test('RED CALIBRATION: the fixtures start off-cast, so a no-op reset would fail', () => {
  assert.notDeepEqual(['พี่โต้ง', 'ชิบะ', 'น้องหมวย', 'ฟร็อกกี้', 'Bank'], castNames.slice(0, 5));
  assert.notDeepEqual(Array.from({ length: 20 }, (_, i) => `typed ${i}`), castNames);
});

// The wiring the pure slice above cannot see: the confirm calls the wipe and redraws the app.
test('the confirm handler calls the wipe and redraws', () => {
  const handler = source.match(/getElementById\('confirmResetNamesBtn'\)\.addEventListener\('click',[\s\S]*?\n {2}\}\);/);
  assert.ok(handler, 'the reset confirm handler is no longer recognisable -- this test measures nothing');
  assert.match(handler[0], /engine\.resetPlayerNames\(\)/);
  assert.match(handler[0], /renderApp\(\)/);
});

// The confirm's copy names every loss it causes, per docs/agents/src-edit-rules.md. Pinned as text
// because it is the only part of this feature a player reads, and a well-meaning edit that drops the
// irreversibility clause is invisible to every other check in this directory.
test('the confirm copy still names the loss and what survives', () => {
  const markup = fs.readFileSync(path.join(import.meta.dirname, 'markup.html'), 'utf8');
  assert.match(
    markup,
    /ชื่อผู้เล่นที่พิมพ์ไว้จะถูกแทนด้วยชื่อสัตว์ทั้งหมด และเอากลับคืนไม่ได้ จำนวนผู้เล่นและกติกาที่ตั้งไว้จะยังคงอยู่/,
  );
  // The two answers, verbatim from the gh#174 pattern; the trigger itself is rendered by main.js.
  assert.match(markup, /เก็บชื่อเดิมไว้/);
  assert.match(source, /↺ รีเซ็ตเป็นชื่อสัตว์/);
});
