#!/usr/bin/env node
// Static regression tripwire for ADR-0016 (docs/adr/0016-a-gate-that-classifies-nothing-converges.md)
// and ADR-0017 (docs/adr/0017-two-sets-not-one-the-gate-covers-every-button.md): every button a
// render function adds to #stage must be gated by armAllButtons. scripts/arm-gate-probe.mjs (real
// touch over CDP, docs/adr/0018) is what actually proves the ghost tap is suppressed; that probe
// never runs in CI. This script stands in per ADR-0018's rule — it is a cheap source scan, not the
// proof, and it names what it cannot see.
//
// ADR-0017:44-45 claims the anti-rot property "a button added to any of these four games is gated
// automatically by armAllButtons, with no list to remember" — but that only covers a new BUTTON
// inside an already-gated render function. A new render*() that never calls armAllButtons at all
// ships fully ungated, and nothing else in CI or the unit tests looks for one. That is what this
// script checks.
//
// ponytail: this is a raw source scan, not a browser probe — it cannot see that a real touch on a
// `disabled` button still bubbles pointerdown to #stage, nor that a successor control actually
// occupies the first contact's coordinate. A green run here means "every render*() that builds a
// button also calls armAllButtons(stage" — never "a ghost tap is actually suppressed".
//
// Secondary ceiling: function bodies are extracted by counting braces from `function render*(...) {`
// to its matching `}` — a raw-text scan like no-nav-in-stage-check.mjs's, not an AST walk. It is
// fooled by an unbalanced `{` or `}` inside a string/template literal (none exist in these files
// today) and it only recognises this codebase's own idiom for a button: `el('button', ...)` /
// `el("button", ...)` or `createElement('button')`. A button built from a variable tag name escapes
// it completely, the same blind spot no-nav-in-stage-check.mjs already discloses for anchors.
//
// Comments are blanked out of the text before any of that runs, so an `armAllButtons(stage` sitting
// in a comment can no longer satisfy the "is this render function gated" test (commenting the live
// call out used to leave this script green and every button in that function ungated), and a
// commented-out `el('button'` / `armAllButtons(stage, [...])` can no longer trip either condition.
// The stripper is textual: a `//` inside a string literal (none in these seven files today) would be
// read as a comment. Blanking preserves offsets, so reported line numbers still point at real source.
//
//   node scripts/arm-gate-coverage-check.mjs             -> scan the game modules, exit non-zero if any hit
//   node scripts/arm-gate-coverage-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const gamesDir = path.join(repoRoot, 'src/games');

// Same six games plus _template.ts as no-nav-in-stage-check.mjs — see that script's header for why
// _template.ts is in scope (copy-paste seed) and _arm-gate.ts is not (shared helper, not a renderer).
const TARGET_FILES = [
  'daily-fortune.ts', 'love-match.ts', 'pick-loser.ts', 'short-stick.ts', 'siamsi.ts', 'timebomb.ts',
  '_template.ts',
];

// ---------------------------------------------------------------------------
// Closed exception sets. Every entry cites a recorded owner decision that already exists in the
// repo — this script offers no mechanism to add an entry without one. A violation with no matching
// entry here fails the run; a human decides, not this list.
// ---------------------------------------------------------------------------

// Condition 1: render*() functions that replace #stage and build a button, by owner decision left
// ungated (no armAllButtons(stage call at all).
const UNGATED_EXCEPTIONS = new Set([
  // docs/adr/0017-two-sets-not-one-the-gate-covers-every-button.md:56-57 — "renderPassing,
  // renderTicking, and renderBoom remain ungated; gating them is a behaviour change and needs
  // ADR-0016's per-path premise judgement."
  'short-stick.ts::renderPassing',
  'timebomb.ts::renderTicking',
  'timebomb.ts::renderBoom',
  // src/games/pick-loser.ts:64-68 — "Exception (owner's call): pl-pick is deliberately NOT gated.
  // No hand-off exists in the pl-again -> pl-pick flow — the same hand that tapped the again
  // button taps this button next, so gating it would delay a real, single-user action."
  'pick-loser.ts::renderIdle',
]);

// Condition 2: render*() functions allowed to call armAllButtons(stage, except) with a non-empty
// `except` list — mapped to the EXACT argument the owner decision covers, not to "any non-empty
// argument". The decision exempts a named set; widening the argument is a new decision, so any other
// argument in the same function fails the gate.
const EXCEPT_ARG_EXCEPTIONS = new Map([
  // src/games/daily-fortune.ts:223-228 — "Exception (owner's call, not a judgement call to
  // re-litigate): the roster chips are exempt from the gate ... 'go' (df-go) is a different
  // finger's action ... and stays gated like every other control here." Call site is
  // daily-fortune.ts:228, armAllButtons(stage, chipEls). The decision pins chipEls and gates df-go,
  // so `[...chipEls, goBtn]` is NOT covered by it.
  ['daily-fortune.ts::renderAsk', 'chipEls'],
]);

// ---------------------------------------------------------------------------
// Pure: text -> render-function bodies. No file IO here, so the selftest can feed it strings.
// ---------------------------------------------------------------------------
const RENDER_HEADER_RE = /^function (render\w*)\([^)]*\)[^{]*\{/gm;
const REPLACE_RE = /stage\.replaceChildren\(\)/;
const BUTTON_RE = /\bel\(\s*(['"])button\1|createElement\(\s*(['"])button\2\s*\)/;
const ARM_CALL_RE = /armAllButtons\(\s*stage\b/;
const EXCEPT_ARG_CALL_RE = /armAllButtons\(\s*stage\s*,\s*([^)]+)\)/g;

// Comments are replaced by spaces, not deleted, so every offset and line number below is unchanged.
// This is the one choke point all four conditions read through, which is what makes both directions
// hold at once: a comment can neither satisfy the positive check (armAllButtons must be present) nor
// trip the negative ones (a commented-out el('button' / except arg must not be flagged).
const blank = (m) => m.replace(/[^\n]/g, ' ');
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank);

/** Splits `text` into its top-level `function render*() { ... }` bodies by counting braces from
 *  each header's opening `{` to its matching `}`. See the secondary ponytail note at the top of
 *  this file for what that misses. */
function extractRenderFunctions(rawText) {
  const text = stripComments(rawText);
  const fns = [];
  RENDER_HEADER_RE.lastIndex = 0;
  let m;
  while ((m = RENDER_HEADER_RE.exec(text))) {
    const name = m[1];
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    const body = text.slice(bodyStart, i - 1);
    const startLine = text.slice(0, m.index).split('\n').length;
    fns.push({ name, body, startLine });
  }
  return fns;
}

// Condition 1: a render*() that replaces #stage and builds a button must also arm it, unless it
// carries a recorded exception.
function checkGating(fn, file, exceptions) {
  const hasReplace = REPLACE_RE.test(fn.body);
  const hasButton = BUTTON_RE.test(fn.body);
  const hasArm = ARM_CALL_RE.test(fn.body);
  if (hasReplace && hasButton && !hasArm && !exceptions.has(`${file}::${fn.name}`)) {
    return [{
      file, name: fn.name, line: fn.startLine, kind: 'ungated render function',
      detail: `function ${fn.name}() builds a button and calls stage.replaceChildren() but never calls armAllButtons(stage`,
    }];
  }
  return [];
}

// Condition 2: a non-empty `except` argument to armAllButtons must carry a recorded exception.
function checkExceptArg(fn, file, exceptions) {
  const violations = [];
  EXCEPT_ARG_CALL_RE.lastIndex = 0;
  let m;
  while ((m = EXCEPT_ARG_CALL_RE.exec(fn.body))) {
    const arg = m[1].trim().replace(/\s+/g, ' ');
    if (!arg) continue;
    const allowed = exceptions.get(`${file}::${fn.name}`);
    if (allowed !== arg) {
      violations.push({
        file, name: fn.name, line: fn.startLine, kind: 'unrecorded except arg',
        detail: allowed === undefined
          ? `armAllButtons(stage, ${arg}) has no recorded owner exception`
          : `armAllButtons(stage, ${arg}) does not match the recorded exception, which covers exactly \`${allowed}\` — widening the exempt set is a new owner decision`,
      });
    }
  }
  return violations;
}

function findViolations(text, file, ungatedExceptions = UNGATED_EXCEPTIONS, exceptArgExceptions = EXCEPT_ARG_EXCEPTIONS) {
  const violations = [];
  for (const fn of extractRenderFunctions(text)) {
    violations.push(...checkGating(fn, file, ungatedExceptions));
    violations.push(...checkExceptArg(fn, file, exceptArgExceptions));
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: real files under a temp dir (never repo content, never src/ or dist/), calibrated both
// ways per condition — a clean fixture must pass, a planted violation in this codebase's real
// idiom must be flagged, and the exception carve-out itself must suppress only what it names.
// ---------------------------------------------------------------------------
function selftest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-coverage-check-'));
  try {
    const write = (name, text) => {
      const abs = path.join(tmpDir, name);
      fs.writeFileSync(abs, text, 'utf8');
      return fs.readFileSync(abs, 'utf8');
    };

    // --- Condition 1: known-good — a render function that arms what it builds. ---
    const goodGating = write('good-gating.ts', [
      "function renderFoo(): void {",
      "  const stage = stageEl;",
      "  if (!stage) return;",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'ไป');",
      "  btn.type = 'button';",
      "  on(btn, 'click', doThing);",
      "  stage.appendChild(btn);",
      "  cleanup.push(armAllButtons(stage));",
      "}",
    ].join('\n'));
    assert.deepEqual(findViolations(goodGating, 'good-gating.ts'), [], 'a gated render function must report zero violations');
    console.log('PASS condition 1, known-good: a render function that builds a button and calls armAllButtons(stage reports zero violations');

    // --- Condition 1: known-bad — this codebase's real idiom for the regression: replaceChildren,
    // el('button', ...), appendChild, no armAllButtons call. Not a synthetic string; this is the
    // shape short-stick.ts/timebomb.ts/pick-loser.ts's own render functions use verbatim. ---
    const badGating = write('bad-gating.ts', [
      "function renderFoo(): void {",
      "  const stage = stageEl;",
      "  if (!stage) return;",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'ไป');",
      "  btn.type = 'button';",
      "  on(btn, 'click', doThing);",
      "  stage.appendChild(btn);",
      "}",
    ].join('\n'));
    const badGatingViolations = findViolations(badGating, 'bad-gating.ts');
    assert.equal(badGatingViolations.length, 1, 'an ungated render function must be flagged exactly once');
    assert.equal(badGatingViolations[0].name, 'renderFoo');
    assert.equal(badGatingViolations[0].kind, 'ungated render function');
    console.log(`PASS condition 1, known-bad: ${badGatingViolations[0].file}::${badGatingViolations[0].name} flagged as "${badGatingViolations[0].kind}"`);

    // --- Condition 1: the exception carve-out suppresses only the named (file, fn) pair, and only
    // when it is passed in — proves the mechanism, not just that a hardcoded list exists. ---
    const gatingCarveOut = new Set(['bad-gating.ts::renderFoo']);
    assert.deepEqual(findViolations(badGating, 'bad-gating.ts', gatingCarveOut, EXCEPT_ARG_EXCEPTIONS), [], 'a recorded exception must suppress the same violation the known-bad fixture proved is real');
    console.log('PASS condition 1, carve-out: naming bad-gating.ts::renderFoo as an exception suppresses the same violation proven above, and only that pair');

    // --- Condition 2: known-good — armAllButtons(stage) with no except arg. ---
    const goodExceptArg = write('good-except.ts', [
      "function renderBar(): void {",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'x');",
      "  stage.appendChild(btn);",
      "  cleanup.push(armAllButtons(stage));",
      "}",
    ].join('\n'));
    assert.deepEqual(findViolations(goodExceptArg, 'good-except.ts'), [], 'armAllButtons(stage) with no except arg must report zero violations');
    console.log('PASS condition 2, known-good: armAllButtons(stage) with no except arg reports zero violations');

    // --- Condition 2: known-bad — a non-empty except arg with no recorded exception. ---
    const badExceptArg = write('bad-except.ts', [
      "function renderBar(): void {",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'x');",
      "  stage.appendChild(btn);",
      "  cleanup.push(armAllButtons(stage, [btn]));",
      "}",
    ].join('\n'));
    const badExceptViolations = findViolations(badExceptArg, 'bad-except.ts');
    assert.equal(badExceptViolations.length, 1, 'a non-empty except arg with no recorded exception must be flagged exactly once');
    assert.equal(badExceptViolations[0].name, 'renderBar');
    assert.equal(badExceptViolations[0].kind, 'unrecorded except arg');
    console.log(`PASS condition 2, known-bad: ${badExceptViolations[0].file}::${badExceptViolations[0].name} flagged as "${badExceptViolations[0].kind}"`);

    // --- Condition 2: the exception carve-out, same both-ways proof as condition 1. ---
    const exceptCarveOut = new Map([['bad-except.ts::renderBar', '[btn]']]);
    assert.deepEqual(findViolations(badExceptArg, 'bad-except.ts', UNGATED_EXCEPTIONS, exceptCarveOut), [], 'a recorded exception must suppress the same except-arg violation proven above');
    console.log('PASS condition 2, carve-out: naming bad-except.ts::renderBar with its exact argument suppresses the same violation proven above, and only that pair');

    // --- Condition 2: the exception pins the ARGUMENT, not just the (file, fn) pair. Same recorded
    // pair, a widened except list -> still flagged. Without this the carve-out would license every
    // future argument in that function, which is the bypass finding 2 named. ---
    const badWidenedExceptArg = write('bad-widened.ts', [
      "function renderBar(): void {",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'x');",
      "  stage.appendChild(btn);",
      "  cleanup.push(armAllButtons(stage, [btn, goBtn]));",
      "}",
    ].join('\n'));
    const widenedCarveOut = new Map([['bad-widened.ts::renderBar', '[btn]']]);
    const widenedViolations = findViolations(badWidenedExceptArg, 'bad-widened.ts', UNGATED_EXCEPTIONS, widenedCarveOut);
    assert.equal(widenedViolations.length, 1, 'an except arg wider than the recorded one must still be flagged');
    assert.ok(widenedViolations[0].detail.includes('covers exactly'), 'the message must name the argument the decision actually covers');
    console.log(`PASS condition 2, pinned arg: ${widenedViolations[0].detail}`);

    // --- Condition 2, against the REAL exception entry: daily-fortune.ts::renderAsk is exempt for
    // exactly `chipEls` (the decision at daily-fortune.ts:223-228 gates df-go by name). The shipped
    // call passes; the ghost-tap-on-go widening does not. ---
    const dfGood = write('daily-fortune.ts', [
      "function renderAsk(): void {",
      "  stage.replaceChildren();",
      "  const goBtn = el('button', 'ไป');",
      "  stage.appendChild(goBtn);",
      "  cleanup.push(armAllButtons(stage, chipEls));",
      "}",
    ].join('\n'));
    assert.deepEqual(findViolations(dfGood, 'daily-fortune.ts'), [], 'the shipped armAllButtons(stage, chipEls) call must stay clean under the real exception');
    const dfWidened = write('daily-fortune-widened.ts', [
      "function renderAsk(): void {",
      "  stage.replaceChildren();",
      "  const goBtn = el('button', 'ไป');",
      "  stage.appendChild(goBtn);",
      "  cleanup.push(armAllButtons(stage, [...chipEls, goBtn]));",
      "}",
    ].join('\n'));
    const dfWidenedViolations = findViolations(dfWidened, 'daily-fortune.ts');
    assert.equal(dfWidenedViolations.length, 1, 'armAllButtons(stage, [...chipEls, goBtn]) must be flagged — df-go stays gated per the recorded decision');
    console.log('PASS condition 2, real exception: chipEls passes, [...chipEls, goBtn] is flagged (df-go stays gated)');

    // --- Finding 1: a positive-presence check must not be satisfied by a COMMENT. Commenting out
    // the live armAllButtons call is the exact reproduction: before comments were stripped this
    // fixture reported zero violations while every button in renderFoo shipped ungated. ---
    const commentedArm = write('commented-arm.ts', [
      "function renderFoo(): void {",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'ไป');",
      "  stage.appendChild(btn);",
      "  // cleanup.push(armAllButtons(stage));",
      "  /* cleanup.push(armAllButtons(stage)); */",
      "}",
    ].join('\n'));
    const commentedArmViolations = findViolations(commentedArm, 'commented-arm.ts');
    assert.equal(commentedArmViolations.length, 1, 'a commented-out armAllButtons call must not satisfy the gate');
    assert.equal(commentedArmViolations[0].kind, 'ungated render function');
    assert.equal(commentedArmViolations[0].line, 1, 'blanking comments must leave the reported line number pointing at real source');
    console.log('PASS finding 1: a commented-out armAllButtons(stage) call no longer satisfies the gate');

    // --- Finding 1, other direction: a comment must not TRIP a check either. Neither the
    // commented-out button (condition 1) nor the commented-out except arg (condition 2) is real. ---
    const commentedHazards = write('commented-hazards.ts', [
      "function renderFoo(): void {",
      "  stage.replaceChildren();",
      "  // const btn = el('button', 'ไป');",
      "  // cleanup.push(armAllButtons(stage, [btn]));",
      "  stage.appendChild(el('p', 'x'));",
      "}",
      "function renderBaz(): void {",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'x');",
      "  stage.appendChild(btn);",
      "  /* was: armAllButtons(stage, [btn]) */",
      "  cleanup.push(armAllButtons(stage));",
      "}",
    ].join('\n'));
    assert.deepEqual(findViolations(commentedHazards, 'commented-hazards.ts'), [], 'a commented-out button or except arg must not trip either condition');
    console.log('PASS finding 1, both directions: a commented-out el(\'button\' / except arg trips nothing, while a commented-out arm call satisfies nothing');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true }); // ponytail: hermetic — nothing under src/, dist/, or the working tree is ever touched
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;
  for (const name of TARGET_FILES) {
    const abs = path.join(gamesDir, name);
    if (!fs.existsSync(abs)) continue; // ponytail: don't hard-fail if a listed file moves; validate-games.mjs already owns "does every game exist"
    const violations = findViolations(fs.readFileSync(abs, 'utf8'), name);
    for (const v of violations) {
      console.error(`src/games/${v.file}:${v.line} ${v.name}() · ${v.kind} · ${v.detail}`);
      anyFail = true;
    }
  }
  if (anyFail) {
    console.error(
      '\nADR-0017: every button a render function adds must be gated by armAllButtons, with no list to ' +
      'remember (docs/adr/0017-two-sets-not-one-the-gate-covers-every-button.md). If this is a deliberate ' +
      'exception, it needs its own owner decision recorded in an ADR or inline comment before it can be ' +
      'added to this script\'s exception set — the set is closed on purpose.',
    );
    process.exit(1);
  }
  console.log(`arm-gate-coverage-check: ${TARGET_FILES.length} game module(s) clean`);
}

await main();
