// gh#215's retired loss-halt used to pin the player-count stepper's MIN/MAX clamp incidentally: its
// own restart legs fed `setPlayerCount` and `currentCount` into `new Function` as bare parameter
// names and never called either, so the bound itself had no real assertion behind it. Retiring that
// halt this session took the only coverage with it. This file pins the clamp `setPlayerCount` itself
// applies.
//
// PINS THE WRITE, NOT THE READ-BACK. `currentCount()` carries its own independent
// `Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, shown))` clamp, so a value read back through it looks
// correct even when `setPlayerCount`'s own clamp is broken or missing entirely. A first draft of this
// file asserted the stepped-to value through `currentCount()` and stayed green against three broken
// variants of the clamp, including one with both bounds removed — a false pin, caught by review.
// Every assertion below instead reads `#playerCountVal`'s raw `textContent` straight off the stub,
// which is the value the player actually sees and the one `setPlayerCount` writes directly.
//
// The setup card is this route's own subject (setup-badge-icon.test.mjs already covers the seat
// rows next to it); the context-loss file is about what a MutationObserver sees on a lost context,
// not this control.
//
// Real bytes: setPlayerCount and currentCount are sliced out of main.ts and run over the shared DOM
// stub, wired the way installNoWebglRound wires them — a step reads the count back off the display
// setPlayerCount just wrote, the same round trip a real tap drives.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/one-bomb.ts';
import { makeDocumentStub, sliceBlock } from '../_dom-stub.mjs';

const source = fs.readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

const strip = (text, tokens, label) =>
  tokens.reduce((out, [from, to]) => {
    const next = out.replace(from, to);
    assert.notEqual(next, out, `${label} no longer contains ${from} — this substitution stripped nothing`);
    return next;
  }, text);

const setSliced = sliceBlock(source, 'function setPlayerCount(next: number): void');
assert.ok(setSliced, 'main.ts no longer declares setPlayerCount — this test is measuring nothing');
const setBody = strip(
  setSliced,
  [
    ['function setPlayerCount(next: number): void', 'function setPlayerCount(next)'],
    ["$<HTMLButtonElement>('playerMinus')", "$('playerMinus')"],
    ["$<HTMLButtonElement>('playerPlus')", "$('playerPlus')"],
  ],
  'setPlayerCount',
);
// The exact clamp line the MUST-RED mutant below substitutes out. Asserted here, once, so that
// mutant fails loudly as "measuring nothing" the day this line's shape changes instead of silently
// mutating some other statement.
const CLAMP_LINE = 'const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next));';
assert.ok(setBody.includes(CLAMP_LINE), 'setPlayerCount no longer clamps with this exact expression — the MUST-RED mutant below is measuring nothing');

const countSliced = sliceBlock(source, 'function currentCount(): number');
assert.ok(countSliced, 'main.ts no longer declares currentCount — this test is measuring nothing');
const countBody = strip(
  countSliced,
  [['function currentCount(): number', 'function currentCount()']],
  'currentCount',
);

/** Wires the real pair over the shared DOM stub and hands back the two buttons, the raw display
 *  node's text (the observable this file pins), and step helpers that read the count back the way a
 *  click listener does. `setBodySrc` defaults to the real `setPlayerCount`; the MUST-RED test below
 *  passes a mutated one instead. BOARD_GRID is irrelevant to the bound this file pins —
 *  setPlayerCount's own `??` falls back to a fixed pair for any count, so an empty stand-in is
 *  enough. */
function makeStepper(startCount, setBodySrc = setBody) {
  const { el } = makeDocumentStub();
  const minus = el('playerMinus');
  const plus = el('playerPlus');
  const display = el('playerCountVal');
  display.textContent = String(startCount);

  const { setPlayerCount, currentCount } = new Function(
    '$', 'MIN_PLAYERS', 'MAX_PLAYERS', 'BOARD_GRID',
    `${countBody}\n${setBodySrc}\nreturn { setPlayerCount, currentCount };`,
  )(el, MIN_PLAYERS, MAX_PLAYERS, {});

  setPlayerCount(startCount);
  return {
    minus,
    plus,
    displayText: () => display.textContent,
    stepDown: () => setPlayerCount(currentCount() - 1),
    stepUp: () => setPlayerCount(currentCount() + 1),
  };
}

test('the floor: stepping down to MIN_PLAYERS disables #playerMinus, and stepping back up re-enables it', () => {
  const stepper = makeStepper(MAX_PLAYERS);
  for (let i = 0; i < MAX_PLAYERS - MIN_PLAYERS; i += 1) stepper.stepDown();
  assert.equal(stepper.displayText(), String(MIN_PLAYERS), 'the stepper did not settle on the floor');
  assert.equal(stepper.minus.disabled, true, '#playerMinus is not disabled at MIN_PLAYERS');

  // One more decrement past the floor: the DISPLAYED count must not fall through it.
  stepper.stepDown();
  assert.equal(
    stepper.displayText(),
    String(MIN_PLAYERS),
    'a decrement past the floor moved the displayed count below MIN_PLAYERS',
  );
  assert.equal(stepper.minus.disabled, true, '#playerMinus re-enabled itself while still parked on the floor');

  stepper.stepUp();
  assert.equal(stepper.displayText(), String(MIN_PLAYERS + 1), 'stepping up off the floor did not move the displayed count');
  assert.equal(stepper.minus.disabled, false, '#playerMinus stayed disabled one step off the floor');
});

test('the ceiling: stepping up to MAX_PLAYERS disables #playerPlus, and stepping back down re-enables it', () => {
  const stepper = makeStepper(MIN_PLAYERS);
  for (let i = 0; i < MAX_PLAYERS - MIN_PLAYERS; i += 1) stepper.stepUp();
  assert.equal(stepper.displayText(), String(MAX_PLAYERS), 'the stepper did not settle on the ceiling');
  assert.equal(stepper.plus.disabled, true, '#playerPlus is not disabled at MAX_PLAYERS');

  // One more increment past the ceiling: the DISPLAYED count must not push through it.
  stepper.stepUp();
  assert.equal(
    stepper.displayText(),
    String(MAX_PLAYERS),
    'an increment past the ceiling moved the displayed count above MAX_PLAYERS',
  );
  assert.equal(stepper.plus.disabled, true, '#playerPlus re-enabled itself while still parked on the ceiling');

  stepper.stepDown();
  assert.equal(stepper.displayText(), String(MAX_PLAYERS - 1), 'stepping down off the ceiling did not move the displayed count');
  assert.equal(stepper.plus.disabled, false, '#playerPlus stayed disabled one step off the ceiling');
});

test('the displayed count never leaves [MIN_PLAYERS, MAX_PLAYERS] across a sweep well past both ends', () => {
  const stepper = makeStepper(MIN_PLAYERS);
  const past = MAX_PLAYERS - MIN_PLAYERS + 5;
  for (let i = 0; i < past; i += 1) stepper.stepUp();
  assert.equal(stepper.displayText(), String(MAX_PLAYERS), 'the sweep up overshot MAX_PLAYERS');
  for (let i = 0; i < past + (MAX_PLAYERS - MIN_PLAYERS); i += 1) stepper.stepDown();
  assert.equal(stepper.displayText(), String(MIN_PLAYERS), 'the sweep down undershot MIN_PLAYERS');
});

test('MUST-RED: the floor-overshoot assertion above cannot pass with both clamp bounds removed', () => {
  // One substitution off the real source, not code this file wrote: with the clamp gone entirely,
  // setPlayerCount writes whatever it is handed, including a value outside [MIN_PLAYERS, MAX_PLAYERS].
  const mutant = setBody.replace(CLAMP_LINE, 'const count = next;');
  assert.notEqual(mutant, setBody, 'the clamp line no longer reads as written — this mutant substituted nothing');

  const stepper = makeStepper(MAX_PLAYERS, mutant);
  for (let i = 0; i < MAX_PLAYERS - MIN_PLAYERS; i += 1) stepper.stepDown();
  stepper.stepDown(); // one decrement past the floor
  assert.equal(
    stepper.displayText(),
    String(MIN_PLAYERS - 1),
    'the floor-overshoot assertion above (displayText === MIN_PLAYERS) cannot tell a build with no ' +
      'clamp at all from one that clamps correctly — it would pass on both',
  );
});
