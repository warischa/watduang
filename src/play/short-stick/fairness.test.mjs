// The one invariant this port could lose silently: the draw must be uniform across turn positions.
// src/games/short-stick.ts states it ("uniform over turns = uniform over players, so which stick a
// player taps changes nothing") and gets it by construction — one stick per player, one short. The
// lifted mockup does NOT get it by construction: its setup lets the stick count exceed the player
// count, and then the turn order wraps and the earliest seats draw twice. Nothing on screen shows
// that. main.js's lockFairCounts is what closes it, and this file is what proves lockFairCounts is
// load-bearing rather than decorative.
//
// It runs the REAL bytes. generateLengths and lockFairCounts are sliced out of main.js by source
// text and evaluated, because main.js is a lifted IIFE with no exports — importing it would need a
// DOM, an AudioContext and a canvas. The slice is brace-matched from each declaration, so a rename
// or a rewrite of either function fails this file loudly instead of silently testing nothing.
//
// CALIBRATION IS THE POINT. The same chi-square runs twice: once against the mockup's own unlocked
// default (6 sticks, 4 players) where it MUST go red, once against the locked counts where it must
// go green. A uniformity check that has never rejected anything measures nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

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

// eslint-disable-next-line no-new-func -- the whole point is to execute main.js's own text.
const generateLengths = new Function(`${sliceFn('generateLengths')}; return generateLengths;`)();
// Applied, not returned: lockFairCounts closes over main.js's `game` object, so the wrapper has to
// supply one and CALL it. (Handing back the inner function instead left `game` untouched and turned
// every green leg red on the first run — an honest red, and the reason this comment exists.)
const applyLockFairCounts = new Function(
  'game',
  `${sliceFn('lockFairCounts')}; lockFairCounts(); return game;`,
);

/** Deterministic PRNG. A seeded run keeps a statistical gate from flaking in CI, where a red nobody
 *  can reproduce trains everyone to re-run it. mulberry32. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One round, exactly as main.js plays it: lengths are generated, the shortest are flagged, and the
 *  players draw in turn until a short surfaces. Returns the turn position that lost.
 *  `pick` is the player's strategy — the invariant must hold for EVERY strategy, so it is a parameter
 *  rather than always-random. A test that only ever picks at random cannot tell a fair board from one
 *  that hides the short at a fixed index. */
function playRound(playerCount, stickCount, shortCount, pick) {
  const lengths = generateLengths(stickCount, shortCount);
  // startMatch()'s own shortIndices derivation, kept identical on purpose.
  const sorted = [...lengths].sort((a, b) => a - b);
  const shortestValues = sorted.slice(0, shortCount);
  const shortIndices = [];
  lengths.forEach((len, idx) => {
    if (shortestValues.includes(len) && shortIndices.length < shortCount) shortIndices.push(idx);
  });

  const remaining = lengths.map((_, i) => i);
  for (let turn = 0; remaining.length > 0; turn += 1) {
    const at = pick(remaining.length);
    const [stick] = remaining.splice(at, 1);
    if (shortIndices.includes(stick)) return turn % playerCount;
  }
  throw new Error('round ended with no short stick drawn — shortCount was 0');
}

/** Chi-square over the observed loser-per-turn-position counts against a flat expectation. */
function chiSquare(counts, rounds) {
  const expected = rounds / counts.length;
  return counts.reduce((acc, n) => acc + ((n - expected) ** 2) / expected, 0);
}

const ROUNDS = 12000;
const PLAYERS = 4;
// Upper tail of chi-square with 3 degrees of freedom at p = 0.001. A fair board lands here about once
// in a thousand runs, and the PRNG is seeded, so "about" never becomes "sometimes in CI".
const CHI2_DF3_P001 = 16.27;

const STRATEGIES = {
  'always the leftmost remaining stick': () => 0,
  'always the rightmost remaining stick': (n) => n - 1,
  'a random remaining stick': (() => {
    const rnd = seeded(0x5eed);
    return (n) => Math.floor(rnd() * n);
  })(),
};

function measure(stickCount, shortCount, pick, seed) {
  const real = Math.random;
  Math.random = seeded(seed);
  try {
    const counts = new Array(PLAYERS).fill(0);
    for (let i = 0; i < ROUNDS; i += 1) counts[playRound(PLAYERS, stickCount, shortCount, pick)] += 1;
    return { counts, chi2: chiSquare(counts, ROUNDS) };
  } finally {
    Math.random = real;
  }
}

test('lockFairCounts pins one stick per player and exactly one short', () => {
  const game = { players: ['a', 'b', 'c', 'd', 'e'], stickCount: 17, shortCount: 3 };
  applyLockFairCounts(game);
  assert.equal(game.stickCount, 5, 'stickCount must equal the player count');
  assert.equal(game.shortCount, 1, 'shortCount must be 1');
});

test('RED CALIBRATION: the mockup default (6 sticks, 4 players) is measurably unfair', () => {
  // Not a hypothetical. 6 sticks for 4 players means turns 4 and 5 exist, and they belong to seats 0
  // and 1 — those two carry 2/6 of the loss each while seats 2 and 3 carry 1/6. If this leg ever goes
  // green, the detector below is broken and its green means nothing.
  const { counts, chi2 } = measure(6, 1, STRATEGIES['a random remaining stick'], 0xfa17);
  console.log(`  red leg   6 sticks/4 players: counts=${counts.join(',')} chi2=${chi2.toFixed(1)}`);
  assert.ok(
    chi2 > CHI2_DF3_P001,
    `the unfair board passed the uniformity check (chi2=${chi2.toFixed(2)}) — the check is dead`,
  );
});

for (const [label, pick] of Object.entries(STRATEGIES)) {
  test(`GREEN: locked counts are uniform over turn positions — ${label}`, () => {
    const game = { players: new Array(PLAYERS).fill('p'), stickCount: 6, shortCount: 3 };
    applyLockFairCounts(game);
    const { counts, chi2 } = measure(game.stickCount, game.shortCount, pick, 0xc0ffee);
    console.log(`  green leg ${label}: counts=${counts.join(',')} chi2=${chi2.toFixed(1)}`);
    assert.ok(
      chi2 < CHI2_DF3_P001,
      `the locked board is not uniform over turn positions (chi2=${chi2.toFixed(2)}, counts=${counts.join(',')})`,
    );
  });
}
