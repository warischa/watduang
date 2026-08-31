// gh#163 box 7: the losing rule of the zero-trigger party game, pinned deterministically.
//
// THE RULE. A turn ends when the player stops the clock. The clock's reading is formatted to the
// round's precision tier, and the player loses if the LAST DIGIT OF WHAT THE SCREEN SHOWS equals the
// round's forbidden digit. Not the raw milliseconds, not a rounded value -- the displayed string, so
// what the player reads is exactly what judges them.
//
// Driven through the mockup's OWN formatTime() and resolveTurn(), sliced out of main.js by source
// text and evaluated (the same idiom as mascot-defaults.test.mjs and short-stick/fairness.test.mjs),
// because main.js is a lifted mockup with no exports. Nothing here re-implements the comparison: if
// the rule moves, the slice or a case goes red rather than this file quietly measuring a copy.
//
// THE DIVERGENT INPUT: 2470ms with forbidden digit 7. The three tiers format it as "02.4", "02.47"
// and "02.470", so the same stopped clock loses on tier 2 and is safe on tiers 1 and 3. Any
// implementation that reads a fixed decimal place, compares against the raw milliseconds, or rounds
// instead of truncating agrees with the real rule on ordinary inputs and diverges here.
// Second divergent input: 1999ms on tier 1. Truncating gives "01.9" (digit 9); rounding gives "02.0"
// (digit 0) -- one input where floor and round give opposite verdicts against forbidden digit 9.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

/** Brace-walking slice of a CLASS METHOD, which is the shape every rule in this mockup has. */
function sliceMethod(name) {
  const start = source.search(new RegExp(`^\\s*${name}\\(`, 'm'));
  assert.notEqual(start, -1, `zero-trigger/main.js no longer declares ${name}() -- this test is measuring nothing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(source.indexOf(name, start), i + 1);
    }
  }
  throw new Error(`unbalanced braces slicing ${name}()`);
}

const formatTimeSrc = sliceMethod('formatTime');
const resolveTurnSrc = sliceMethod('resolveTurn');

/** Builds the pair of methods on a bare object, with every collaborator resolveTurn() reaches for
 *  replaced by a recorder. The DOM, the synth and the particle engine are decoration around the
 *  verdict; the verdict is what is asserted. */
function makeEngine({ elapsedMs, tier, forbidden }) {
  const calls = [];
  const el = () => ({ className: '', classList: { add() {}, remove() {} }, textContent: '' });
  const engine = {
    state: {
      tier,
      turnIndex: 0,
      forbiddenDigit: forbidden,
      players: [{ id: 1, name: 'เอ', avatar: '🐱', score: 0 }],
      timer: { formattedString: '' },
    },
    stopTimerLoop() {},
    synth: { playExplosion: () => calls.push('explosion'), playSafeChime: () => calls.push('safeChime') },
    fx: { addTrauma() {}, spawnExplosion() {}, spawnSafeSparkles() {} },
    showDefeatModal: (loser, stoppedTime, matchedDigit) => calls.push(`defeat:${loser.name}:${stoppedTime}:${matchedDigit}`),
    showToast: () => calls.push('safeToast'),
    advanceTurn() {},
    calls,
  };
  const api = new Function(
    'document', 'setTimeout',
    `return { ${formatTimeSrc}, ${resolveTurnSrc} };`,
  )({ getElementById: el }, (fn) => { fn(); });
  engine.formatTime = api.formatTime;
  engine.resolveTurn = api.resolveTurn;
  // The screen's own string is what the rule reads, so it is produced the way the timer loop
  // produces it rather than written in by hand.
  engine.state.timer.formattedString = engine.formatTime(elapsedMs, tier);
  return engine;
}

/** true = the active player lost this turn. Read off which collaborator resolveTurn() drove, never
 *  off a comparison this file performs. */
function loses(input) {
  const engine = makeEngine(input);
  engine.resolveTurn();
  const defeat = engine.calls.some((c) => c.startsWith('defeat:'));
  const safe = engine.calls.includes('safeToast');
  assert.notEqual(defeat, safe, `resolveTurn() reached neither verdict or both: ${JSON.stringify(engine.calls)}`);
  return defeat;
}

test('formatTime truncates to the tier, and never rounds up', () => {
  const engine = makeEngine({ elapsedMs: 0, tier: 1, forbidden: 0 });
  assert.equal(engine.formatTime(2470, 1), '02.4');
  assert.equal(engine.formatTime(2470, 2), '02.47');
  assert.equal(engine.formatTime(2470, 3), '02.470');
  // The floor-versus-round input: 1ms short of two seconds must still read as one second and nine.
  assert.equal(engine.formatTime(1999, 1), '01.9');
  assert.equal(engine.formatTime(1999, 3), '01.999');
});

test('the last digit of the DISPLAYED time decides, so the tier changes the verdict', () => {
  // The divergent input, all three tiers, one forbidden digit.
  assert.equal(loses({ elapsedMs: 2470, tier: 1, forbidden: 7 }), false, 'tier 1 shows 02.4 -- last digit 4');
  assert.equal(loses({ elapsedMs: 2470, tier: 2, forbidden: 7 }), true, 'tier 2 shows 02.47 -- last digit 7');
  assert.equal(loses({ elapsedMs: 2470, tier: 3, forbidden: 7 }), false, 'tier 3 shows 02.470 -- last digit 0');
});

test('truncation, not rounding, decides the edge case', () => {
  assert.equal(loses({ elapsedMs: 1999, tier: 1, forbidden: 9 }), true, '01.9 -- a rounding build would show 02.0 and survive');
  assert.equal(loses({ elapsedMs: 1999, tier: 1, forbidden: 0 }), false, 'only a rounding build would lose here');
});

test('every digit 0-9 can be the forbidden one, and exactly one of them loses', () => {
  // A rule that hard-coded a digit, or compared with < or >, passes the cases above and dies here.
  const losers = [];
  for (let d = 0; d <= 9; d += 1) if (loses({ elapsedMs: 3050, tier: 2, forbidden: d })) losers.push(d);
  assert.deepEqual(losers, [5], '03.05 must lose to 5 and to nothing else');
});

test('the defeat modal is told the digit and the time the player actually saw', () => {
  const engine = makeEngine({ elapsedMs: 2470, tier: 2, forbidden: 7 });
  engine.resolveTurn();
  assert.deepEqual(engine.calls, ['explosion', 'defeat:เอ:02.47:7']);
});

// What this file does NOT cover: which player is active when the turn resolves (advanceTurn and the
// tier escalation are stubbed out here), the 1000ms anti-cheat lock, and how the forbidden digit is
// drawn each round. Those are turn order and input gating, not the losing rule.
