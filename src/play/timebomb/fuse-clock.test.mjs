// The invariant this play route exists to NOT lose, stated once and falsifiably:
//
//   after a stretch of wall-clock time in which no frame ran (a backgrounded tab, a locked screen),
//   the first frame back must report the fuse as it is NOW — expired if the deadline has passed —
//   never as the sum of the frames that were allowed to run.
//
// A fuse built by accumulating per-frame deltas passes every desk test and fails exactly here: the
// browser throttles timers on a hidden tab, so the accumulated clock is short by however long the
// phone was away, and the bomb goes off late (or never). The shipped engine avoids it by recomputing
// from Date.now() against an ABSOLUTE deadline every frame — see src/games/timebomb.ts's header.
//
// Calibration is built in, so this file cannot pass while measuring nothing:
//   * `mutantUrgency` below is a deliberately ACCUMULATED clock. Test 2 asserts it FAILS the
//     invariant — if a future edit made the mutant pass, the assertion here is what goes red.
//   * TB_FUSE_MUTANT=1 feeds that same mutant into test 1, the real assertion, which then fails.
//     That is the must-red run: `TB_FUSE_MUTANT=1 node --test src/play/timebomb/fuse-clock.test.mjs`.
//
//   node --test src/play/timebomb/fuse-clock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickDeadline, urgencyAt } from '../../games/timebomb.ts';

const START = 1_700_000_000_000;
// rand = 0.5 lands mid-range; the exact fuse length does not matter, only that the gap outlives it.
const DEADLINE = pickDeadline(START, () => 0.5);
const FRAME_MS = 16;
const FRAMES_BEFORE_HIDE = 60; // ~1s of visible play before the phone is put away
const GAP_MS = 120_000; // two minutes backgrounded — longer than the longest fuse (90s, gh#151)

/** The shipped clock: every sample is recomputed from the absolute deadline. */
const absoluteUrgency = (now, framesRendered) => urgencyAt(now, START, DEADLINE);

/** The mutant: urgency comes from how many frames were RENDERED, so time nobody watched never
 *  elapsed. This is the exact shape the engine's header forbids. */
const mutantUrgency = (now, framesRendered) => {
  const elapsed = framesRendered * FRAME_MS;
  const total = DEADLINE - START;
  const ratio = elapsed / total;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
};

/** Runs the visible frames, then the throttled gap in which NO frame runs, and returns what the
 *  clock under test reports on the first frame after the phone comes back. */
function urgencyOnFirstFrameBack(read) {
  let frames = 0;
  let now = START;
  for (; frames < FRAMES_BEFORE_HIDE; frames += 1) {
    now += FRAME_MS;
    read(now, frames + 1);
  }
  // Hidden: wall clock advances, the frame counter does not.
  now += GAP_MS;
  frames += 1; // the one frame the browser delivers on return
  return read(now, frames);
}

const underTest = process.env.TB_FUSE_MUTANT === '1' ? mutantUrgency : absoluteUrgency;

test('the fuse is absolute: a 120s background gap over a ~60s fuse comes back expired', () => {
  assert.ok(GAP_MS > DEADLINE - START, 'the gap must outlive the fuse or this proves nothing');
  assert.equal(
    urgencyOnFirstFrameBack(underTest),
    1,
    'the first frame back read the fuse as still running — the clock is accumulating, not absolute',
  );
});

test('calibration: an accumulated clock fails that same assertion', () => {
  const reported = urgencyOnFirstFrameBack(mutantUrgency);
  assert.notEqual(reported, 1, 'the accumulated mutant no longer diverges — this file measures nothing');
  assert.ok(reported < 0.1, `accumulated clock reported ${reported}, barely moved while 120s passed`);
});

// The link between the proven function above and what this ROUTE actually runs: main.ts must mount the
// shipped module rather than re-deriving a fuse of its own. A copy of the loop inside main.ts would
// leave both tests above green while the play route drifted.
test('the play route mounts the shipped engine instead of re-deriving the clock', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const main = fs.readFileSync(path.join(here, 'main.ts'), 'utf8');
  assert.match(main, /import game from '\.\.\/\.\.\/games\/timebomb\.ts'/);
  assert.match(main, /game\.mount\(/);
  assert.doesNotMatch(main, /requestAnimationFrame|setInterval|Date\.now/);
});

// The canvas renderer is the one file that DOES run a frame loop, which is the shape most likely to
// grow a clock of its own ("elapsed += dt") and quietly replace the deadline. It is allowed rAF and
// performance.now (both absolute, both cosmetic); it is not allowed to compute remaining time. What it
// reads from the engine's fuse element is one bit — whether the ticking screen is up (gh#151).
test('the canvas renderer reads the fuse instead of timing it', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const renderer = fs.readFileSync(path.join(here, 'bomb-canvas.ts'), 'utf8');
  assert.match(renderer, /getElementById\('tb-fuse'\)/);
  // Comments are dropped first, because that file's own header EXPLAINS the rule by naming
  // `Date.now()` and "deadline" in prose — a checker cannot tell use from mention, and without this
  // the assertion below would be measuring the documentation instead of the code. Ceiling: the strip
  // is line-based (`//`, `/*`, and JSDoc ` *` continuations) and would also blank those tokens inside
  // a string literal that begins with a comment marker; that file contains no such string.
  const code = renderer
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
  assert.doesNotMatch(code, /Date\.now|setInterval|deadline|pickDeadline|urgencyAt\(/);
});

// gh#151, the DRAWING half of "nothing reveals the remaining time". The engine's own test file pins
// the DOM channels; the canvas is the one channel no DOM assertion can see, because its output is
// pixels. What makes it safe is structural — the renderer takes no time-derived input at all — so
// that is what is asserted here: it may ask whether #tb-fuse exists, and it may not read a value off
// it or carry any notion of urgency to scale a drawing by.
test('gh#151: the canvas renderer draws nothing proportional to the time left', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const renderer = fs.readFileSync(path.join(here, 'bomb-canvas.ts'), 'utf8');
  const code = renderer
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
  assert.match(code, /getElementById\('tb-fuse'\)/, 'the renderer no longer detects the ticking screen');
  assert.doesNotMatch(code, /urgenc/i, 'the renderer carries an urgency value again — that is a drawable countdown');
  assert.doesNotMatch(
    code,
    /style\.width|getComputedStyle|getBoundingClientRect\(\)\.width\s*\/|offsetWidth/,
    'the renderer reads a width back off the fuse element — that value is the remaining time',
  );
});
