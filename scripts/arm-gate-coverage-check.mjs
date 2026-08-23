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
// Secondary ceiling: function bodies are extracted by counting braces from each RENDER_HEADER_RE
// match (the declaration form `[export [default]] [async] function renderX(...) {`, or the
// assignment form `[export] const|let|var renderX = [async] (...) =>|function(...) {`) to its
// matching `}` — a raw-text scan like no-nav-in-stage-check.mjs's, not an AST walk. It is
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
// --- Ceiling: target-set derivation (gh#46, ADR-0019) ----------------------------------
// The target set is a flat `fs.readdirSync(src/games/)` filtered to `*.ts`, so a newly added game
// is scanned automatically — no list to remember. That glob does not recurse: a game shipped as
// src/games/<subdir>/foo.ts is invisible to it and ships unscanned. Pinned by the "flat,
// non-recursive" selftest case below; switching to a recursive glob must update this comment or
// that case goes red.
//
//   node scripts/arm-gate-coverage-check.mjs             -> scan the game modules, exit non-zero if any hit
//   node scripts/arm-gate-coverage-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptPath = fileURLToPath(import.meta.url);
// ponytail: GAMES_DIR_OVERRIDE exists only so the selftest can spawn this script for real
// against a directory it controls, to exercise main()'s actual empty-set exit path. Blocked
// whenever CI is truthy (guard below) so it can never narrow the scanned set in CI. Locally,
// with CI unset, it is still a foot-gun: pointing it at a directory holding one clean file
// gets a green claiming full coverage of a set that was never scanned — that risk is on
// whoever runs it manually, not on this script's default (no env var) invocation.
const gamesDir = process.env.GAMES_DIR_OVERRIDE
  ? path.resolve(process.env.GAMES_DIR_OVERRIDE)
  : path.join(repoRoot, 'src/games');

// ADR-0019: a gate's green must not imply coverage it has not earned. GAMES_DIR_OVERRIDE narrows
// the scanned set by construction, so it must never be usable where a green is actually trusted.
if (process.env.GAMES_DIR_OVERRIDE && process.env.CI) {
  console.error('arm-gate-coverage-check: GAMES_DIR_OVERRIDE must never narrow the scanned set in CI (docs/adr/0019) — unset GAMES_DIR_OVERRIDE or run outside CI.');
  process.exit(1);
}

// Every *.ts file directly under src/games/, minus the non-game files below. _template.ts STAYS
// IN SCOPE: it is the copy-paste seed for every new game (see no-nav-in-stage-check.mjs's header),
// so an ungated button planted there would propagate into every game created from it.
const EXCLUDED_FILES = new Set([
  'types.ts',     // shared type declarations, not a game module
  'manifest.ts',  // game registry/metadata, not a game module
  '_arm-gate.ts', // shared button-disabling helper the games import, not a renderer
]);

function listTargetFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !EXCLUDED_FILES.has(name))
    .sort();
}

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
  // src/games/pick-loser.ts, the "Exception (owner's call)" comment closing renderIdle — "pl-pick is
  // deliberately NOT gated. No hand-off exists in the pl-again -> pl-pick flow — the same hand that
  // tapped the again button taps this button next, so gating it would delay a real, single-user
  // action." Anchored to the symbol, not a line range: the range this used to carry had already
  // rotted past the comment it names, and renumbering it would only rot again.
  'pick-loser.ts::renderIdle',
]);

// Condition 2: render*() functions allowed to call armAllButtons(stage, except) with a non-empty
// `except` list — mapped to the EXACT argument the owner decision covers, not to "any non-empty
// argument". The decision exempts a named set; widening the argument is a new decision, so any other
// argument in the same function fails the gate.
const EXCEPT_ARG_EXCEPTIONS = new Map([
  // src/games/daily-fortune.ts, the "Exception (owner's call, not a judgement call to re-litigate)"
  // comment inside renderAsk — "the roster chips are exempt from the gate ... 'go' (df-go) is a
  // different finger's action ... and stays gated like every other control here." The call it sits
  // above is armAllButtons(stage, chipEls). The decision pins chipEls and gates df-go, so
  // `[...chipEls, goBtn]` is NOT covered by it. Anchored to the symbols, not a line range: the range
  // and call site this used to carry had both already rotted past the code they name.
  ['daily-fortune.ts::renderAsk', 'chipEls'],
]);

// ---------------------------------------------------------------------------
// Pure: text -> render-function bodies. No file IO here, so the selftest can feed it strings.
// ---------------------------------------------------------------------------
// Two spellings of "a render function is defined here", both anchored at column 0 (this codebase
// defines every render*() at module top level). The bare `^function render…(` this started as was a
// single-spelling needle: `export function renderGhost()` and `const renderGhost = (): void => {`
// both parsed as NOT-a-render-function, so their bodies were never extracted and conditions 1 and 2
// never ran on them at all. Planted verbatim in src/games/pick-loser.ts — an exported render function
// that calls stage.replaceChildren(), builds el('button', …) and never arms it — and the gate printed
// "8 module(s) … clean". A missing header is the worst failure shape this file has: it is not a missed
// pattern inside a checked function, it is a whole function that was never checked.
// `export` / `export default` / `async` are the modifiers TypeScript allows in front of a declaration;
// the assignment arm covers `const|let|var` bound to an arrow or a function expression.
const RENDER_HEADER_RE = new RegExp(
  [
    // declaration: [export [default]] [async] function renderX(...) ... {
    '^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s+(render\\w*)\\s*\\([^)]*\\)[^{]*\\{',
    // assignment: [export] const|let|var renderX[: T] = [async] [function] (...) [: T] [=>] {
    //             ...or the parenthesis-free arrow `= [async] param => {`, which TypeScript allows
    //             whenever the parameter carries no type annotation. Typed params force the parens,
    //             which is why this codebase has none today — but "none today" is not a guard, and a
    //             header spelling this needle misses is a whole function no condition ever runs on.
    '^(?:export\\s+)?(?:const|let|var)\\s+(render\\w*)\\s*(?::[^=\\n]+)?=\\s*(?:async\\s+)?(?:(?:function\\s*)?\\([^)]*\\)\\s*(?::[^={\\n]+)?(?:=>\\s*)?|\\w+\\s*=>\\s*)\\{',
  ].join('|'),
  'gm',
);
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
    const name = m[1] ?? m[2]; // group 1 = declaration arm, group 2 = assignment arm
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

    // --- Condition 1, DEFINITION SPELLINGS: the header needle decides which functions get checked at
    // all, so a spelling it does not know is not a missed pattern — it is a function no condition ever
    // runs on. Each of these is the badGating body verbatim with only its first line changed, and each
    // reported ZERO violations before the header was widened (measured by planting the exported one in
    // src/games/pick-loser.ts: "8 module(s) ... clean"). Narrow RENDER_HEADER_RE back to
    // /^function (render\w*)\(/ and every case here goes green. ---
    const ungatedBody = [
      "  const stage = stageEl;",
      "  if (!stage) return;",
      "  stage.replaceChildren();",
      "  const btn = el('button', 'ไป');",
      "  stage.appendChild(btn);",
      "}",
    ];
    for (const [label, header, closer] of [
      ['export function', 'export function renderFoo(): void {', '}'],
      ['export default function', 'export default function renderFoo(): void {', '}'],
      ['async function', 'async function renderFoo(): Promise<void> {', '}'],
      ['export async function', 'export async function renderFoo(): Promise<void> {', '}'],
      ['const arrow', 'const renderFoo = (): void => {', '};'],
      ['export const arrow', 'export const renderFoo = (): void => {', '};'],
      ['const async arrow', 'const renderFoo = async (): Promise<void> => {', '};'],
      ['const function expression', 'const renderFoo = function (): void {', '};'],
      ['let arrow', 'let renderFoo = (): void => {', '};'],
      ['bare-param arrow (no parens)', 'const renderFoo = ctx => {', '};'],
      ['bare-param async arrow (no parens)', 'const renderFoo = async ctx => {', '};'],
    ]) {
      const text = [header, ...ungatedBody.slice(0, -1), closer].join('\n');
      const fns = extractRenderFunctions(text).map((f) => f.name);
      assert.deepEqual(fns, ['renderFoo'], `${label}: the render function must be extracted at all, or no condition ever runs on it`);
      const v = findViolations(text, 'spelling.ts');
      assert.equal(v.length, 1, `${label}: an ungated render function must be flagged exactly once`);
      assert.equal(v[0].kind, 'ungated render function');
    }
    console.log('PASS condition 1, definition spellings: export / export default / async / const+let arrow / function-expression / parenthesis-free arrow render definitions are all extracted and flagged when ungated — a header spelling the needle misses is a function no condition runs on');

    // Other direction: the widening must not start extracting things that are not render functions,
    // or every non-render helper in these files would be graded against a rule it never had.
    const notRenderFns = [
      "function mount(): void { stage.replaceChildren(); }",
      "const renderer = { go() { return 1; } };", // `renderer` is not render\\w* bound to a function
      "export const RENDER_LIMIT = 3;",
      "const rendered = true;",
      "cleanup.push(armAllButtons(stage));",
    ].join('\n');
    assert.deepEqual(extractRenderFunctions(notRenderFns), [], 'the widened header must not extract non-render declarations');
    console.log('PASS condition 1, definition spellings other direction: mount(), a `renderer` object literal, RENDER_LIMIT and `rendered` are not extracted as render functions');

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

  // --- Target-set derivation (gh#46): glob src/games/*.ts, minus known non-game files, plus the
  // non-recursive ceiling that shape carries. ---
  const globTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-target-set-'));
  try {
    for (const name of ['real-game.ts', '_template.ts', 'types.ts', 'manifest.ts', '_arm-gate.ts', 'notes.md']) {
      fs.writeFileSync(path.join(globTmpDir, name), '');
    }
    fs.mkdirSync(path.join(globTmpDir, 'nested'));
    fs.writeFileSync(path.join(globTmpDir, 'nested', 'hidden-game.ts'), '');
    const listed = listTargetFiles(globTmpDir);
    assert.deepEqual(listed, ['_template.ts', 'real-game.ts'], 'listTargetFiles must include _template.ts and real .ts games, and exclude types.ts/manifest.ts/_arm-gate.ts/non-.ts files/nested files');
    console.log(`PASS target-set derivation: [${listed.join(', ')}] — excludes types.ts, manifest.ts, _arm-gate.ts, notes.md, and nested/hidden-game.ts (flat glob, disclosed ceiling)`);
    assert.deepEqual(listTargetFiles(path.join(globTmpDir, 'does-not-exist')), [], 'a missing games directory must yield an empty list, never throw');
    console.log('PASS target-set derivation: a missing games directory yields [] rather than throwing');
  } finally {
    fs.rmSync(globTmpDir, { recursive: true, force: true });
  }

  // --- Guard exit path: main() must actually exit non-zero when the derived set is empty, not
  // just that listTargetFiles() returns [] (the case above only pins the derivation). Spawns the
  // real script as a child process against a directory with zero matching files, so deleting the
  // non-empty assert out of main() shows up here, not only in a manual repointing probe. ---
  const emptyGuard = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, CI: '', GAMES_DIR_OVERRIDE: path.join(os.tmpdir(), 'arm-gate-empty-guard-does-not-exist') },
    encoding: 'utf8',
  });
  assert.notEqual(emptyGuard.status, 0, 'main() must exit non-zero when the derived target set is empty');
  assert.match(emptyGuard.stderr, /target set must never be empty/, 'the failure message must say the set was empty');
  console.log('PASS empty-set guard: spawning the real script against a directory with zero matching .ts files exits non-zero and says the set was empty');

  // --- CI guard: GAMES_DIR_OVERRIDE must never narrow the scanned set in CI. Coordinator finding:
  // pointing the override at a dir holding 1 clean file went green at count 1, having scanned 1 of
  // 7 real modules — ADR-0019 rule 1, a green implying coverage it has not earned. Spawns the real
  // script (no --selftest) with CI=1 and the override set; it must refuse before scanning anything.
  // ---
  const ciGuardTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-coverage-check-ci-guard-'));
  try {
    fs.writeFileSync(path.join(ciGuardTmpDir, 'one-clean-game.ts'), '');
    const ciGuard = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '1', GAMES_DIR_OVERRIDE: ciGuardTmpDir },
      encoding: 'utf8',
    });
    assert.notEqual(ciGuard.status, 0, 'GAMES_DIR_OVERRIDE + CI must exit non-zero, never scan a narrowed set');
    assert.match(ciGuard.stderr, /GAMES_DIR_OVERRIDE must never narrow the scanned set in CI/, 'the failure message must name the CI hazard');
    console.log('PASS CI guard: GAMES_DIR_OVERRIDE + CI=1 refuses to run instead of scanning a narrowed set');
  } finally {
    fs.rmSync(ciGuardTmpDir, { recursive: true, force: true });
  }

  // --- Printed count reflects files actually scanned, not the length of the target list (gh#46).
  // Calibrated: reverting scanTargetFiles to print files.length instead of scannedCount makes this
  // fail (it would report 3, not 2). ---
  const scanTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-scan-count-'));
  try {
    fs.writeFileSync(path.join(scanTmpDir, 'present-a.ts'), '');
    fs.writeFileSync(path.join(scanTmpDir, 'present-b.ts'), '');
    const { scannedCount, anyFail } = scanTargetFiles(scanTmpDir, ['present-a.ts', 'present-b.ts', 'missing.ts'], () => {});
    assert.equal(scannedCount, 2, 'scannedCount must count only files actually read (2), not the 3-entry target list');
    assert.equal(anyFail, false);
    console.log(`PASS printed count: scanned 2 of 3 listed files (1 missing) — scannedCount is ${scannedCount}, not files.length`);
  } finally {
    fs.rmSync(scanTmpDir, { recursive: true, force: true });
  }

  // --- gh#66: a narrowed GAMES_DIR_OVERRIDE run must be distinguishable from a full run by
  // reading the success line alone. Spawns the real script (no --selftest) with the override set
  // to a fixture dir holding exactly 1 clean game, CI unset, and asserts the printed line names
  // both the resolved fixture directory and the true count (1) — never src/games/ or the real
  // repo's game count. Calibrated: reverting the success line back to the hardcoded 'src/games/'
  // literal (this script's pre-fix shape) makes the directory assertion below fail. ---
  const overrideNoteTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-override-note-'));
  try {
    fs.writeFileSync(path.join(overrideNoteTmpDir, 'one-clean-game.ts'), '');
    const overrideRun = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', GAMES_DIR_OVERRIDE: overrideNoteTmpDir },
      encoding: 'utf8',
    });
    assert.equal(overrideRun.status, 0, 'a clean fixture under the override must still pass');
    assert.match(overrideRun.stdout, new RegExp(`1 module\\(s\\) in ${overrideNoteTmpDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} clean \\(GAMES_DIR_OVERRIDE active\\)`), 'the success line must name the resolved fixture directory and the real scanned count, not src/games/');
    console.log(`PASS override note: narrowed run's success line names the resolved fixture directory (${overrideNoteTmpDir}) and count (1), distinguishable from a full src/games/ run`);
  } finally {
    fs.rmSync(overrideNoteTmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Scans `files` under `dir`, returning how many were actually read (not files.length) and whether
// any carried a violation. `log` is injectable so the selftest can silence real output.
function scanTargetFiles(dir, files, log = console.error) {
  let scannedCount = 0;
  let anyFail = false;
  for (const name of files) {
    const abs = path.join(dir, name);
    if (!fs.existsSync(abs)) continue; // ponytail: don't hard-fail if a listed file moves; validate-games.mjs already owns "does every game exist"
    scannedCount++;
    const violations = findViolations(fs.readFileSync(abs, 'utf8'), name);
    for (const v of violations) {
      log(`src/games/${v.file}:${v.line} ${v.name}() · ${v.kind} · ${v.detail}`);
      anyFail = true;
    }
  }
  return { scannedCount, anyFail };
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const TARGET_FILES = listTargetFiles(gamesDir);
  if (TARGET_FILES.length === 0) {
    console.error(`arm-gate-coverage-check: src/games/*.ts matched zero target files under ${gamesDir} — the target set must never be empty (docs/adr/0019).`);
    process.exit(1);
  }

  const { scannedCount, anyFail } = scanTargetFiles(gamesDir, TARGET_FILES);
  if (anyFail) {
    console.error(
      '\nADR-0017: every button a render function adds must be gated by armAllButtons, with no list to ' +
      'remember (docs/adr/0017-two-sets-not-one-the-gate-covers-every-button.md). If this is a deliberate ' +
      'exception, it needs its own owner decision recorded in an ADR or inline comment before it can be ' +
      'added to this script\'s exception set — the set is closed on purpose.',
    );
    process.exit(1);
  }
  const overrideNote = process.env.GAMES_DIR_OVERRIDE ? ' (GAMES_DIR_OVERRIDE active)' : '';
  // "game module(s)" overstated this: scannedCount covers every .ts in src/games/ minus
  // EXCLUDED_FILES, which today means the 6 games PLUS _template.ts and _el.ts. Saying
  // "game" implied coverage of 8 games when 6 exist (ADR-0019). The count is real; the noun
  // was not. Excluding the two helpers instead would have traded a label for lost coverage.
  //
  // gh#66: gamesDir is always printed (not only when the override is set), so a narrowed run is
  // readable from the resolved directory alone — a fixture path visibly differs from src/games/,
  // rather than a reader having to infer narrowing from the absence of a failure.
  console.log(`arm-gate-coverage-check: ${scannedCount} module(s) in ${gamesDir} clean${overrideNote}`);
}

await main();
