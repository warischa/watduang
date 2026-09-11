// The board shape is declared TWICE on this route, and this test is what stops the two from drifting.
//
// WHY THERE ARE TWO. The lifted engine (main.js) holds BOARD_GRID_MAP inside a sealed IIFE that
// exports nothing, and its whole body sits BELOW an early return taken when there is no WebGL
// context — so on the one condition that matters here (a browser with no context, which is what
// `--disable-gpu` gives on a Mac and NOT what CI's runner gives: measured in-page on the runner,
// where every context type comes back live) that constant is not merely unreachable, it never
// evaluates. The
// no-3D board in main.ts therefore carries its own copy. Importing across the two is impossible and
// patching the lift is forbidden: scripts/extract-mockup.mjs owns main.js and overwrites it.
//
// So the copy is pinned instead, the same way src/play/mascot-defaults.test.mjs pins the one other
// duplicated constant in this repo: a re-extraction that changes the engine's board sizing fails
// here on the day it lands, rather than shipping two boards that quietly disagree about how many
// stones a party of nine plays on.
//
// ponytail: matched on source text, not parsed. Stated ceiling — this proves the two literals agree,
// never that either one is the shape a player sees rendered. Only the browser walk shows that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const read = (name) => fs.readFileSync(path.join(here, name), 'utf8');

/** Pulls `<int>: [<int>, <int>]` pairs out of the first brace-delimited block after `name`. */
function grid(src, name) {
  const from = src.indexOf(name);
  assert.notEqual(from, -1, `${name} is no longer declared — this test would measure nothing`);
  const open = src.indexOf('{', from);
  const close = src.indexOf('}', open);
  assert.ok(open !== -1 && close !== -1, `${name} is no longer an object literal`);
  const pairs = [...src.slice(open, close).matchAll(/(\d+)\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)];
  assert.ok(pairs.length > 0, `${name} parsed to nothing — this test would pass vacuously`);
  return Object.fromEntries(pairs.map((m) => [m[1], `${m[2]}x${m[3]}`]));
}

test('the no-3D board is sized from the same table the lifted engine uses', () => {
  const engine = grid(read('main.js'), 'BOARD_GRID_MAP');
  const fallback = grid(read('main.ts'), 'BOARD_GRID');
  assert.deepEqual(
    fallback,
    engine,
    'the DOM board and the 3D board disagree about grid size for at least one player count: a ' +
      'party would see one board with WebGL and a different one without it, and the odds the HUD ' +
      'prints would be wrong on whichever screen lost the argument.',
  );
});

test('the table covers the whole declared seat range', () => {
  const fallback = grid(read('main.ts'), 'BOARD_GRID');
  // 2..10 is this route's own range (MIN_PLAYERS/MAX_PLAYERS in src/games/one-bomb.ts). A gap here
  // is a party size that falls back to 5x5 silently, which is a wrong board, not a missing one.
  for (let n = 2; n <= 10; n += 1) {
    assert.ok(fallback[String(n)], `no board shape declared for ${n} players`);
  }
});
