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
// The stripper is textual: a `//`, `/*` or `*/` inside a string literal is read as comment syntax.
// pinStripPrecondition() below pins exactly those two constructs -- a `//` opener inside a quoted
// value, and a `/*` or `*/` inside a quoted value -- and reds if any pinned module contains either,
// per run rather than against a file count that goes stale. Those two are the whole pinned set: the
// strip is textual everywhere else too, and nothing here makes it safe against any other construct.
// Blanking preserves offsets, so reported line numbers still point at real source.
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
import ts from 'typescript'; // devDependency (package.json), build-time only — nothing here ships in dist/

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
// gh#170: same rule, same reason, for the play-route region's own override.
if (process.env.PLAY_DIR_OVERRIDE && process.env.CI) {
  console.error('arm-gate-coverage-check: PLAY_DIR_OVERRIDE must never narrow the scanned set in CI (docs/adr/0019) — unset PLAY_DIR_OVERRIDE or run outside CI.');
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

// --- gh#170: the PLAY-ROUTE region ---------------------------------------------------------
// Everything above this block scans src/games/*.ts, where a game fills #stage from a render*()
// function. The party category's play routes do not work that way and do not render #stage at all:
// their controls are static markup in src/play/<id>/markup.html plus buttons their main.js/main.ts
// builds at runtime, and there is no render*() header for the extractor to find. So this gate was
// blind to 9 of the 11 live play routes while printing a green, and the src/games stub for one of
// them (src/games/freeze-tap.ts) even states "It builds no <button>, so there is nothing for
// armAllButtons to gate" — true of the stub, false of the route, and the gate could not tell.
//
// The protected region here is a DIRECTORY boundary, the same shape scripts/no-nav-in-stage-check.mjs
// uses for ADR-0014 (ADR-0055): everything directly under src/play/<id>/. The route ids are DERIVED
// from the manifest's own `playRoute` declarations (derivePlayRoutes below), never listed here — a
// twelfth port is covered the day its module declares a route, with no list to remember.
//
// ponytail: PLAY_DIR_OVERRIDE mirrors GAMES_DIR_OVERRIDE exactly — it exists so the selftest (and a
// human calibrating) can point the play scan at a fixture directory it controls, and it is blocked
// whenever CI is truthy by the same guard, so it can never narrow the scanned set where a green is
// trusted. Under the override the route set is derived from the fixture's own directories instead of
// the manifest, because a fixture has no manifest entries; that is a NARROWED run by construction and
// the success line says so.
const playDir = process.env.PLAY_DIR_OVERRIDE
  ? path.resolve(process.env.PLAY_DIR_OVERRIDE)
  : path.join(repoRoot, 'src/play');
const PLAY_EXTS = new Set(['.html', '.js', '.ts']);
const PLAY_SCRIPT_EXTS = new Set(['.js', '.ts']);

/** Every play-route directory directly under `dir`, sorted. Directories only: `_mascots.ts`,
 *  `_setup-bridge.ts` and the `*.test.mjs` files sit directly under src/play/ and are not routes. */
function listPlayRouteDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The scannable files directly inside one route directory.
 *
 *  ponytail: TWO disclosed ceilings, both inherited verbatim from no-nav-in-stage-check.mjs's
 *  listPlayFiles so the two gates cover the same file set and a reader can compare them.
 *  (1) Only files DIRECTLY inside src/play/<id>/ and only .html/.js/.ts — a route shipping
 *      src/play/<id>/parts/foo.js is invisible here. Pinned by the derivation selftest below.
 *  (2) *.test.* is skipped: a test that builds a <button> fixture is not a route rendering one. */
function listPlayRouteFiles(dir, id) {
  const abs = path.join(dir, id);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((name) => PLAY_EXTS.has(path.extname(name)) && !name.includes('.test.'))
    .sort();
}

/** Route ids the MANIFEST declares a `playRoute` for. Dynamic-import of the .ts module, the same
 *  idiom scripts/play-exit-guard-probe.mjs and landing-claims-check.mjs already use (Node strips the
 *  types), so the gate reads the one declaration the site itself routes on rather than a second copy
 *  of the list that can drift. */
async function derivePlayRoutes() {
  const { games } = await import(new URL('../src/games/manifest.ts', import.meta.url).href);
  return games.filter((g) => g.playRoute).map((g) => g.id).sort();
}

// Raw-text button detection, deliberately NOT routed through any comment stripper. ADR-0055 / gh#167:
// the textual stripComments() this file uses for src/games desynchronises on a quote-bearing regex
// literal and blanks live code out of the scan (fail-OPEN), and 7 files under a play route carry such
// a literal today. Raw has no walk to desync. The cost is over-detection — a `<button` inside a
// comment or a string counts as a button — and that direction is fail-CLOSED here: it can only make
// this gate DEMAND an arm gate for a route that maybe did not need one, never let an ungated one
// through. That is the opposite trade from no-nav-in-stage-check.mjs, where over-detection is the
// violation itself; here over-detection only widens the requirement.
const PLAY_BUTTON_RE = /<button[\s>]|\bel\(\s*(['"])button\1|createElement\(\s*(['"])button\2/i;

/** Does this script really WIRE the ghost-tap gate? Answered from the TypeScript parser's tree, not
 *  from a text match, and the distinction is the whole point:
 *   - a `// armAllButtons(panel)` in a comment is not a CallExpression, so it cannot satisfy this;
 *   - an `'armAllButtons('` inside a string is not one either;
 *   - `import { armAllButtons } from '.../_arm-gate.ts'` with no call site — import-without-wiring —
 *     yields imported=true, calls=0, and that is a violation, not a pass.
 *  Using the parser rather than a stripper is also what keeps this leg out of ADR-0055's hole: there
 *  is no textual walk here to desync on a regex literal. assertParses() upstream makes an unreadable
 *  module a RED, never a skip, so "zero calls found" can never mean "the file did not parse".
 *
 *  ponytail: DISCLOSED CEILING — this answers "is the gate wired in this route at all", never "is
 *  every button armed". Which element each call receives, and whether the panel visible at first
 *  paint is one of them, is a runtime fact about the rendered DOM; no source scan reaches it. The
 *  success line says so, and scripts/arm-gate-probe.mjs is the instrument for it. */
function findArmWiring(text) {
  let imported = false;
  let calls = 0;
  (function walk(node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /(^|\/)_arm-gate(\.[a-z]+)?$/.test(node.moduleSpecifier.text)
    ) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((e) => e.name.text === 'armAllButtons')) {
        imported = true;
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'armAllButtons' && node.arguments.length > 0) {
      calls++;
    }
    ts.forEachChild(node, walk);
  })(parseTs(text));
  return { imported, calls };
}

/** Every exception entry whose `<file>::<fn>` names a module that is NOT in the scanned set — a
 *  GHOST: a recorded carve-out with no subject. gh#154 deleted a game and took its entry with it by
 *  hand; nothing made that mandatory, and a ghost entry is a standing licence for whatever file
 *  later takes that name. Pure and injectable so both directions calibrate without touching
 *  src/games. Deliberately keyed on the FILE, not on the function: whether the named function still
 *  exists inside a module that does exist is a question the extractor already answers on every run
 *  (the exception simply stops matching and the violation reappears); a module that is gone is the
 *  case nothing else can see. */
function findGhostExceptions(scannedFiles, ungated = UNGATED_EXCEPTIONS, exceptArg = EXCEPT_ARG_EXCEPTIONS) {
  const present = new Set(scannedFiles);
  return [...ungated, ...exceptArg.keys()]
    .filter((entry) => !present.has(entry.split('::')[0]))
    .sort();
}

/** Fail-CLOSED reconciliation between what the manifest declares and what is on disk. Pure, so the
 *  selftest can calibrate both directions without planting a directory in src/play/ (which belongs
 *  to another owner). A directory the manifest does not declare is a route this gate would silently
 *  never scan — the exact shape of the hole gh#170 opened this ticket for. */
function reconcilePlayRoutes(declared, onDisk) {
  return {
    undeclared: onDisk.filter((id) => !declared.includes(id)),
    missingDir: declared.filter((id) => !onDisk.includes(id)),
  };
}

/** One route -> its violations. `read` is injectable so the selftest can drive this from strings.
 *  Returns { files, scriptFiles, hasButton, imported, calls, violations } — every number the caller
 *  prints comes from this object, so a printed count traces to the set that produced it. */
function checkPlayRoute(dir, id, read = (abs) => fs.readFileSync(abs, 'utf8')) {
  const files = listPlayRouteFiles(dir, id);
  let hasButton = false;
  let imported = false;
  let calls = 0;
  const scriptFiles = [];
  for (const name of files) {
    const text = read(path.join(dir, id, name));
    if (PLAY_BUTTON_RE.test(text)) hasButton = true;
    if (!PLAY_SCRIPT_EXTS.has(path.extname(name))) continue;
    scriptFiles.push(name);
    assertParses(text, `src/play/${id}/${name}`); // fail closed: an unreadable module must not read as "no calls"
    const wiring = findArmWiring(text);
    imported = imported || wiring.imported;
    calls += wiring.calls;
  }
  const violations = [];
  if (files.length === 0) {
    violations.push({
      id, kind: 'empty play route',
      detail: `src/play/${id}/ holds no .html/.js/.ts file — a route directory this gate reads as empty is a route it did not check (docs/adr/0019)`,
    });
  } else if (hasButton && !(imported && calls > 0)) {
    const missing = calls === 0
      ? (imported
        ? `imports armAllButtons from _arm-gate but never calls it — an import is not a wiring`
        : `never imports or calls armAllButtons`)
      : `calls armAllButtons but never imports it from _arm-gate, so the call resolves to something else`;
    violations.push({
      id, kind: 'ungated play route',
      detail: `src/play/${id}/ builds buttons (${files.join(', ')}) and ${missing}`,
    });
  }
  return { files, scriptFiles, hasButton, imported, calls, violations };
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

// Every token kind whose TEXT is a quoted value rather than code: a `//` landing inside one of
// these is not a comment opener, however it looks. The template chunks (head/middle/tail and the
// no-substitution form) are what make an interior line of a multi-line template literal correct
// without enumerating anything per line; the `${...}` expressions between them are NOT in this set,
// because a `//` there really is a comment.
const QUOTED_VALUE_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

const parseTs = (text) => ts.createSourceFile('scan.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

/** Character spans of every quoted value in `text`, from the TypeScript parser's own tree. The
 *  parser is what decides template-chunk and regex-literal boundaries, so escaped delimiters,
 *  `${}` nesting and a `//` inside a regex are classified by the owner of that grammar, not
 *  re-derived here. */
function quotedValueSpans(text) {
  const spans = [];
  (function walk(node) {
    if (QUOTED_VALUE_KINDS.has(node.kind)) spans.push([ts.skipTrivia(text, node.pos), node.end]);
    ts.forEachChild(node, walk);
  })(parseTs(text));
  return spans;
}

/** Fails CLOSED (throws) if `text` is not valid TypeScript. Classification above is deliberately
 *  error-tolerant — the selftest feeds it bare fragments (`ads: false, // x`) that are not valid
 *  programs — so the "did this file parse" question is asked once per REAL scanned module instead,
 *  where a tree built from a broken parse would silently classify too few spans. ADR-0019: a gate
 *  must never go green over a file it could not read. */
function assertParses(text, label) {
  const diagnostics = parseTs(text).parseDiagnostics;
  assert.ok(
    Array.isArray(diagnostics),
    `${label}: this TypeScript build no longer exposes sourceFile.parseDiagnostics, so a broken parse ` +
      'would classify silently. Failing closed rather than trusting the span walk (docs/adr/0019).',
  );
  assert.equal(
    diagnostics.length, 0,
    `${label}: does not parse as TypeScript (${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}). ` +
      'A file the parser cannot read yields too few quoted-value spans, which fails OPEN — the pin ' +
      'refuses to grade it rather than call it clean.',
  );
}

/** Every `//` that stripComments() above would treat as a line-comment opener — one per line, the
 *  first one, because that regex blanks from it to EOL and nothing after it is ever re-read.
 *  `inString` marks the ones that are NOT comment openers at all: the strip is textual, so a `//`
 *  inside a quoted value (`'https://watduang.com/x'`, `"//cdn/x.js"`, an interior line of a template
 *  literal) blanks the REST OF THAT LINE with it — an `el('button')` or an `armAllButtons(stage`
 *  after it stops existing for all four conditions, and this gate goes green on code it never read.
 *  Fail-OPEN, ADR-0019's hole class. Exists only to pin that precondition; the selftest below runs it
 *  over the real scanned modules.
 *
 *  In-string test: exact, not heuristic. The offset is looked up against quotedValueSpans() above —
 *  the TypeScript parser's own literal boundaries. JS lexical grammar is language-owned, so the
 *  per-line quote/backtick parity this replaced could only ever chase it one rung at a time (it
 *  missed: interior lines of multi-line templates, escaped backticks, `${}` tails, `//` inside a
 *  regex literal — all four are planted fixtures in the selftest below now, and all four were green
 *  under parity). It also had two false-RED shapes (`const q = '"';`, `"3\" x"`) that the parser
 *  simply reads correctly. Nothing about apostrophes, `:` or counting survives.
 *
 *  Block comments are still blanked textually first, in stripComments()'s own order — that is not a
 *  grammar approximation, it is a mirror of the artifact under test: this pin's whole question is
 *  "what would stripComments() blank", and stripComments() is textual by design.
 *
 *  ponytail: WHAT THE PARSER ROUTE DOES NOT COVER —
 *  1. A module that does not parse. The tree is then built from a broken parse and classifies too
 *     few spans, i.e. fails open. assertParses() above turns that into a red before any span is
 *     trusted; there is no third answer, and no skip.
 *  2. The `&&` in CI (`--selftest && <the real scan>`, .github/workflows/ci.yml). A red HERE means
 *     the scan never runs at all — the gate does not complain, it is absent. That is the trap
 *     ADR-0030 records, and it is why a red is worded as "fix the module or fix the classifier",
 *     never as something to wait out.
 *  3. The zero-openers control: a scan set that legitimately carries no `//` (every comment in block
 *     form) reds, because a detector returning nothing and a genuinely clean set are the same output
 *     (ADR-0019). Unchanged by this rewrite, and deliberately not softened.
 *  4. Scope. This function classifies `//` openers only; the block-comment delimiters that were the
 *     other half of the same hazard are pinned by findQuotedBlockDelimiters() below, which the pin
 *     calls alongside it. Together they cover in-string `//`, `/*` and its closer, and NOTHING else:
 *     they still say nothing about whether stripComments()'s regexes are right on code that is not
 *     inside a quoted value, nor about the brace-counting body extractor above — those keep their
 *     own ceilings, disclosed at the top of this file.
 *  5. A `//` inside an HTML comment inside a template literal now reads as in-string (it is), where
 *     the old note reasoned about it as a comment-shaped red. The verdict is unchanged in effect:
 *     stripComments() would still blank to end of line and eat a real attribute sharing it.
 *
 *  Deliberately NOT shared with the other gates' strippers: gh#72 / ADR-0030 refused a shared
 *  stripper on ownership grounds, and leave-confirm-check.mjs keeps its own different mechanism on
 *  purpose. This classifier stays local to this file. */
function findLineCommentOpeners(text) {
  const spans = quotedValueSpans(text);
  const found = [];
  let lineStart = 0;
  text.replace(/\/\*[\s\S]*?\*\//g, blank).split('\n').forEach((line, i) => {
    const col = line.indexOf('//');
    if (col >= 0) {
      const offset = lineStart + col;
      found.push({
        line: i + 1,
        inString: spans.some(([start, end]) => offset >= start && offset < end),
        text: line.trim(),
      });
    }
    lineStart += line.length + 1; // +1 for the '\n' the split consumed; blanking preserves offsets
  });
  return found;
}

// Every block-comment delimiter sitting inside a quoted value — the same fail-OPEN hazard class
// findLineCommentOpeners() pins for `//`, in the other comment form and strictly worse. A `/*`
// inside a string pairs with the NEXT real closer anywhere later in the FILE, not just later on
// the line, so stripComments() blanks every line between them: an el('button') in a render
// function inside that span stops existing for all four conditions. Reproduced end to end —
// a module opening with `const note = 'see /* spec';` and closing with a real block comment,
// wrapping an ungated render function, printed "2 module(s) ... clean" and exited 0.
// A stray closer is flagged too: it ends a block comment opened earlier, moving the blanked span.
// Kept out of findLineCommentOpeners(): that contract is "one `//` per line, the first one", which
// is line-shaped and consumed as such by the pin; block delimiters are offset-shaped.
function findQuotedBlockDelimiters(text) {
  const spans = quotedValueSpans(text);
  const found = [];
  for (const m of text.matchAll(/\/\*|\*\//g)) {
    if (!spans.some(([start, end]) => m.index >= start && m.index < end)) continue;
    found.push({
      line: text.slice(0, m.index).split('\n').length,
      delim: m[0],
      text: text.slice(text.lastIndexOf('\n', m.index) + 1).split('\n')[0].trim(),
    });
  }
  return found;
}

/** The pin itself, over whatever scan set `dir` resolves to — the SAME listTargetFiles() +
 *  EXCLUDED_FILES resolution main() scans with, so a fixture case and the real run exercise one
 *  code path, not two copies (docs/adr/0030: a fixture that never reaches the branch it is cited
 *  to pin proves nothing). Throws an AssertionError on the first violation; returns the counts so
 *  the caller can print what it actually covered. */
function pinStripPrecondition(dir) {
  const modules = listTargetFiles(dir);
  assert.ok(modules.length > 0, `the pin must resolve real modules under ${dir}, never an empty directory`);
  let openerCount = 0;
  for (const name of modules) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    assertParses(text, name); // fail closed: an unparseable module classifies too few spans (fails open)
    for (const o of findLineCommentOpeners(text)) {
      openerCount++;
      assert.ok(
        !o.inString,
        `${name}:${o.line}: this \`//\` sits inside a quoted value, not in a comment. ` +
          'stripComments() blanks from it to END OF LINE, so every live character after it on that ' +
          'line is invisible to all four conditions — an ungated button or a missing armAllButtons ' +
          'call after it would not be seen, and this gate may now be going green on code it never ' +
          `read. Move the value onto its own line, or give stripComments() the same parser-backed ` +
          `classification findLineCommentOpeners() uses. Line: ${o.text}`,
      );
    }
    for (const d of findQuotedBlockDelimiters(text)) {
      assert.fail(
        `${name}:${d.line}: this \`${d.delim}\` sits inside a quoted value, not in a comment. ` +
          "stripComments() blanks block comments textually, so this delimiter pairs with the next " +
          'real one ANYWHERE LATER IN THE FILE and every line between them becomes invisible to all ' +
          'four conditions — an ungated button in that span would not be seen, and this gate may now ' +
          'be going green on code it never read. Move the value onto its own line, or give ' +
          `stripComments() the same parser-backed classification this pin uses. Line: ${d.text}`,
      );
    }
  }
  assert.ok(
    openerCount > 0,
    `found zero \`//\` openers across the modules under ${dir} — the detector reported nothing, which is not ` +
      'the same as none existing (docs/adr/0019). Check findLineCommentOpeners() before trusting this pin.',
  );
  return { modules, openerCount };
}

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
    // shape short-stick.ts's and timebomb.ts's own render functions use verbatim. ---
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
    // gh#170: this case is about the GAMES success line, and the spawned run scans BOTH regions — so
    // the play region is pointed at a clean fixture too. Without that, a genuinely ungated play route
    // in the real tree reds this run and makes an assertion about src/games unrunnable for a reason
    // that has nothing to do with src/games. Isolating the other region is what keeps the case about
    // its own subject; it is not a relaxation, and the play region has its own cases below.
    const overridePlayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-override-note-play-'));
    fs.mkdirSync(path.join(overridePlayDir, 'one-clean-route'));
    fs.writeFileSync(path.join(overridePlayDir, 'one-clean-route', 'markup.html'), '<p>ไม่มีปุ่ม</p>');
    const overrideRun = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '', GAMES_DIR_OVERRIDE: overrideNoteTmpDir, PLAY_DIR_OVERRIDE: overridePlayDir },
      encoding: 'utf8',
    });
    fs.rmSync(overridePlayDir, { recursive: true, force: true });
    assert.equal(overrideRun.status, 0, 'a clean fixture under the override must still pass');
    assert.match(overrideRun.stdout, new RegExp(`1 module\\(s\\) in ${overrideNoteTmpDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} clean \\(GAMES_DIR_OVERRIDE active\\)`), 'the success line must name the resolved fixture directory and the real scanned count, not src/games/');
    console.log(`PASS override note: narrowed run's success line names the resolved fixture directory (${overrideNoteTmpDir}) and count (1), distinguishable from a full src/games/ run`);
  } finally {
    fs.rmSync(overrideNoteTmpDir, { recursive: true, force: true });
  }

  // --- stripComments() precondition (see findLineCommentOpeners' header): no `//` inside a quoted
  // value in any module this script feeds that strip. The pinned set is derived by the same
  // listTargetFiles() + EXCLUDED_FILES the gate scans with, so it follows the scan set automatically;
  // it resolves src/games from repoRoot, NOT from gamesDir, so GAMES_DIR_OVERRIDE cannot narrow the
  // pin the way it narrows a run. ---

  // Calibration, FIRING direction: without this the pin below is a guard that cannot fail.
  for (const [label, fixture] of [
    ['a URL in a single-quoted string', "const src = 'https://watduang.com/games/';"],
    ['a protocol-relative path in a double-quoted string', 'const s = "//cdn.example.com/x.js";'],
    ['a double slash inside a double-quoted string', 'const p = "a//b"; el(\'button\');'],
  ]) {
    const hits = findLineCommentOpeners(fixture).filter((o) => o.inString);
    assert.equal(hits.length, 1, `${label}: must read as a \`//\` inside a string, else the pin below cannot fail`);
  }
  console.log('PASS line-comment-opener detector, firing direction: a URL, a protocol-relative path, and a double slash inside a string all read as in-string');

  // Calibration, OTHER direction: the ordinary comment shapes these modules write constantly —
  // `ads: false, // play screen = never an ad slot` is in every game file. Any of these reading as
  // in-string would make the pin a false alarm on a tree that is fine.
  for (const [label, fixture] of [
    ['a line-start comment', '  // armAllButtons must be called with the live stage'],
    ['a line-start comment that quotes a URL', '  // see https://developer.mozilla.org/en-US/docs/Web/API/Element'],
    ['a trailing comment after code — the shape every game module really ships', '  ads: false, // play screen = never an ad slot'],
    ['a trailing comment after a string holding an apostrophe', "  const t = \"don't stop\"; // apostrophes must never be counted as quotes"],
    ['a comment after a block comment on the same line', '/* was: armAllButtons(stage) */ // now armed by the caller'],
  ]) {
    assert.deepEqual(findLineCommentOpeners(fixture).filter((o) => o.inString), [], `${label}: must NOT read as a \`//\` inside a string`);
  }
  console.log('PASS line-comment-opener detector, other direction: line-start comments, a URL quoted inside a comment, trailing comments, and an apostrophe in prose are all clean');

  // Planted hazard, routed through the REAL scan-set resolution (listTargetFiles + EXCLUDED_FILES,
  // the same seam GAMES_DIR_OVERRIDE points main() at) rather than through a hand-fed string: the
  // pin function under test here is the identical one the real src/games/ pin below calls. Each
  // hazard is a shape the per-line backtick-parity heuristic MISSED — every case in this loop was
  // green (no throw) before findLineCommentOpeners() was routed through the TypeScript parser.
  for (const [label, hazardLine, hazardFixture] of [
    [
      'a `//` on an interior line of a multi-line template literal — zero backticks on the line',
      3,
      ['const tpl = `', '  <p>x</p>', '  // el("button") after this is blanked to EOL', '`;'].join('\n'),
    ],
    [
      'a `//` after an escaped backtick inside a template literal',
      1,
      'const s = `a \\` b // c`; const btn = el(\'button\', \'x\');',
    ],
    [
      'a `//` on the tail line of a multi-line ${} interpolation',
      3,
      ['const s = `a ${', '  x', '} b // c`; const btn = el(\'button\', \'x\');'].join('\n'),
    ],
    [
      'a `//` inside a regular expression literal',
      1,
      "const r = /[//]/; const btn = el('button', 'x');",
    ],
  ]) {
    const hazardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-strip-precondition-'));
    try {
      fs.writeFileSync(path.join(hazardDir, 'hazard-game.ts'), hazardFixture);
      // The fixture must reach the in-string branch at the line claimed, or it pins nothing.
      const hits = findLineCommentOpeners(hazardFixture).filter((o) => o.inString);
      assert.deepEqual(hits.map((o) => o.line), [hazardLine], `${label}: must classify as in-string at line ${hazardLine}`);
      assert.throws(
        () => pinStripPrecondition(hazardDir),
        new RegExp(`hazard-game\\.ts:${hazardLine}: this \`//\` sits inside a quoted value`),
        `${label}: the pin must red on this file, through the real listTargetFiles() scan set`,
      );
      // Control: the same directory with the hazard removed must NOT red — and must still find an
      // opener, so this is a real green and not the zero-openers case.
      fs.writeFileSync(path.join(hazardDir, 'hazard-game.ts'), 'const btn = el(\'button\', \'x\'); // ordinary trailing comment\n');
      assert.deepEqual(pinStripPrecondition(hazardDir), { modules: ['hazard-game.ts'], openerCount: 1 }, `${label}: control — the same scan set without the hazard must stay green`);
    } finally {
      fs.rmSync(hazardDir, { recursive: true, force: true });
    }
    console.log(`PASS stripComments precondition, planted hazard: ${label} — pin reds at hazard-game.ts:${hazardLine}, and goes green once removed`);
  }

  // Planted hazard, block-comment form, through the same real scan-set resolution. This is the
  // reviewer's exact mutant: BEFORE findQuotedBlockDelimiters() existed, this fixture scanned green
  // — `arm-gate-coverage-check: 1 module(s) ... clean`, exit 0 — while renderFoo builds an
  // el('button') and never arms it, because the `/*` in the string paired with the closer below and
  // blanked the whole function. The gating violation is proven real by the control at the end.
  const blockHazard = [
    "const note = 'see /* spec';",
    "function renderFoo(): void {",
    "  stage.replaceChildren();",
    "  const btn = el('button', 'ไป');",
    "  stage.appendChild(btn);",
    "}",
    "/* end */",
  ].join('\n');
  const blockHazardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-block-precondition-'));
  try {
    fs.writeFileSync(path.join(blockHazardDir, 'hazard-game.ts'), blockHazard);
    // The fixture must reach the in-string branch at the line claimed, or it pins nothing (ADR-0030).
    assert.deepEqual(
      findQuotedBlockDelimiters(blockHazard).map((d) => [d.line, d.delim]), [[1, '/*']],
      'the fixture must classify the `/*` inside the string literal at line 1, and nothing else',
    );
    assert.throws(
      () => pinStripPrecondition(blockHazardDir),
      /hazard-game\.ts:1: this `\/\*` sits inside a quoted value/,
      'the pin must red on an in-string block-comment opener, through the real listTargetFiles() scan set',
    );
    // The blanking really does hide a genuine violation: strip the pin away and the scan calls it clean.
    assert.deepEqual(findViolations(blockHazard, 'hazard-game.ts'), [], 'documents the fail-open the pin now covers: the scan itself still sees nothing here');
    // Control: same shape, no `/*` in the quoted value -> green, and still finds a real opener, so
    // this is not the vacuous zero-openers case.
    fs.writeFileSync(
      path.join(blockHazardDir, 'hazard-game.ts'),
      blockHazard.replace("'see /* spec'", "'see the spec'") + ' // ordinary trailing comment\n',
    );
    assert.deepEqual(
      pinStripPrecondition(blockHazardDir), { modules: ['hazard-game.ts'], openerCount: 1 },
      'control — the same scan set without the in-string `/*` must stay green and still find one opener',
    );
    // ...and with the blanking gone, the ungated button it was hiding is flagged.
    const unhidden = findViolations(fs.readFileSync(path.join(blockHazardDir, 'hazard-game.ts'), 'utf8'), 'hazard-game.ts');
    assert.equal(unhidden.length, 1, 'the control fixture must expose the ungated render function the hazard hid');
    assert.equal(unhidden[0].kind, 'ungated render function');
  } finally {
    fs.rmSync(blockHazardDir, { recursive: true, force: true });
  }
  console.log('PASS stripComments precondition, planted hazard: a `/*` inside a quoted value pairing with a later real closer — pin reds on the opening line of the fixture module, and the same file without it goes green while the ungated button it hid becomes visible');

  // Other direction for the block-delimiter detector: the block comments these modules really write
  // must not read as in-string, or the pin is a false alarm on a tree that is fine.
  for (const [label, fixture] of [
    ['an ordinary block comment', '/* was: armAllButtons(stage) */\nconst btn = 1;'],
    ['a block comment holding a quote', "/* the 'except' arg */\nconst btn = 1;"],
    ['a JSDoc block above code', '/** does a thing */\nfunction renderFoo() {}'],
    ['a string with no comment syntax', "const s = 'https://watduang.com/x';"],
    ['a divide followed by a star in code', 'const r = a / b * c;'],
  ]) {
    assert.deepEqual(findQuotedBlockDelimiters(fixture), [], `${label}: must NOT read as a block delimiter inside a quoted value`);
  }
  console.log('PASS block-delimiter detector, other direction: ordinary block comments, JSDoc, a quoted URL and `a / b * c` are all clean');

  // Fail-closed calibration: a module the parser cannot read must RED, never be skipped or called
  // clean. A broken parse yields too few quoted-value spans, so tolerating it is fail-open — the
  // exact hole class ADR-0019 forbids.
  const unparsableDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-unparsable-'));
  try {
    fs.writeFileSync(path.join(unparsableDir, 'broken-game.ts'), 'function renderFoo( {\n  const s = "// x";\n');
    assert.throws(
      () => pinStripPrecondition(unparsableDir),
      /broken-game\.ts: does not parse as TypeScript/,
      'an unparseable module must fail the pin closed, not be classified on a broken tree',
    );
    console.log('PASS stripComments precondition, fail-closed: a module that does not parse reds the pin instead of being classified on a broken tree');
  } finally {
    fs.rmSync(unparsableDir, { recursive: true, force: true });
  }

  // The pin itself, over the REAL modules. Two things must hold, and the second is the positive
  // control: a detector returning nothing looks exactly like a clean tree (docs/adr/0019).
  const { modules: pinnedModules, openerCount } = pinStripPrecondition(path.join(repoRoot, 'src/games'));
  console.log(`PASS stripComments precondition: ${openerCount} \`//\` opener(s) across ${pinnedModules.length} pinned module(s) in src/games/, none inside a quoted value`);

  // --- gh#170: the PLAY-ROUTE region, calibrated both directions on a temp fixture. Never repo
  // content: src/play/** belongs to another owner, and a gate that can be retuned by fixing a route
  // is not a gate. Every case below runs through the same checkPlayRoute() main() calls. ---
  const playTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-play-'));
  try {
    const route = (id, files) => {
      fs.mkdirSync(path.join(playTmpDir, id), { recursive: true });
      for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(playTmpDir, id, name), text, 'utf8');
      return checkPlayRoute(playTmpDir, id);
    };
    const MARKUP = '<section id="p"><button id="p-go" type="button">ไป</button></section>\n';

    // Known-good: the shipped idiom, lifted from src/play/dice-loser/main.ts — a named import from
    // _arm-gate.ts and a real call on the panel.
    const good = route('good-route', {
      'markup.html': MARKUP,
      'main.ts': [
        "import { armAllButtons } from '../../games/_arm-gate.ts';",
        "const panel = document.getElementById('p');",
        'if (panel) armAllButtons(panel);',
      ].join('\n'),
    });
    assert.deepEqual(good.violations, [], 'a play route that imports and calls armAllButtons must report zero violations');
    console.log(`PASS play route, known-good: a route importing armAllButtons from _arm-gate and calling it is clean (${good.files.length} file(s), ${good.calls} call(s))`);

    // Known-bad, and this is the case ADR-0055 / gh#167 forces: NO comment stripper is used on play
    // files, so the only thing standing between a commented-out call and a false green is that the
    // TypeScript parser does not report a comment or a string as a CallExpression. Both spellings are
    // in this fixture on purpose. Replace findArmWiring's parser walk with a text match on
    // /armAllButtons\(/ and this case goes green while every button in the route ships ungated.
    const commented = route('commented-route', {
      'markup.html': MARKUP,
      'main.ts': [
        "const panel = document.getElementById('p');",
        '// armAllButtons(panel);',
        '/* armAllButtons(panel); */',
        "const note = 'armAllButtons(panel)';",
        "const esc = note.replace(/'/g, '&#039;');", // the quote-bearing regex literal that desyncs a textual stripper
      ].join('\n'),
    });
    assert.equal(commented.violations.length, 1, 'a route whose only armAllButtons occurrences are a comment and a string must be flagged');
    assert.equal(commented.violations[0].kind, 'ungated play route');
    assert.equal(commented.calls, 0, 'a commented-out or quoted armAllButtons( must not count as a call');
    console.log(`PASS play route, known-bad: ${commented.violations[0].detail}`);

    // The named hole: an IMPORT is not a wiring. A gate that only required the import would be green
    // here while nothing is ever armed.
    const importOnly = route('import-only-route', {
      'markup.html': MARKUP,
      'main.ts': "import { armAllButtons } from '../../games/_arm-gate.ts';\nconst panel = document.getElementById('p');\n",
    });
    assert.equal(importOnly.violations.length, 1, 'import-without-call must be flagged — an import is not a wiring');
    assert.match(importOnly.violations[0].detail, /an import is not a wiring/);
    console.log(`PASS play route, import-without-wiring: ${importOnly.violations[0].detail}`);

    // ...and the other half: a call to a LOCAL function that happens to be named armAllButtons is not
    // this gate. Without the import leg, a route could define a no-op stub and pass.
    const stubOnly = route('stub-route', {
      'markup.html': MARKUP,
      'main.ts': "function armAllButtons(el) { return () => {}; }\narmAllButtons(document.body);\n",
    });
    assert.equal(stubOnly.violations.length, 1, 'a locally defined armAllButtons stub must not satisfy the gate');
    assert.match(stubOnly.violations[0].detail, /never imports it from _arm-gate/);
    console.log(`PASS play route, local stub: ${stubOnly.violations[0].detail}`);

    // Other direction, so the rule is not "every route must arm": a route that builds no button at
    // all has nothing to gate and must stay clean. If this ever reds, PLAY_BUTTON_RE has started
    // matching prose and the requirement has widened past its subject.
    const noButtons = route('no-button-route', {
      'markup.html': '<section id="p"><p>ไม่มีปุ่ม</p></section>\n',
      'main.ts': "const panel = document.getElementById('p');\nif (panel) panel.hidden = false;\n",
    });
    assert.deepEqual(noButtons.violations, [], 'a route that builds no button must report zero violations');
    assert.equal(noButtons.hasButton, false);
    console.log('PASS play route, other direction: a route that builds no button is clean — the rule is "a route that builds buttons must wire the gate", not "every route must call armAllButtons"');

    // An EMPTY route directory must red, never read as clean: zero files scanned is zero coverage,
    // and a green there is ADR-0019's rule 1 exactly.
    fs.mkdirSync(path.join(playTmpDir, 'empty-route'), { recursive: true });
    const empty = checkPlayRoute(playTmpDir, 'empty-route');
    assert.equal(empty.violations.length, 1, 'an empty route directory must be flagged, not scanned as clean');
    assert.equal(empty.violations[0].kind, 'empty play route');
    console.log('PASS play route, empty directory: a route directory with no scannable file reds instead of passing on an empty scan');

    // Fail-closed: a script the parser cannot read yields zero CallExpressions, which is
    // indistinguishable from a route with no arm call — so it must THROW, never be graded.
    fs.mkdirSync(path.join(playTmpDir, 'broken-route'), { recursive: true });
    fs.writeFileSync(path.join(playTmpDir, 'broken-route', 'markup.html'), MARKUP);
    fs.writeFileSync(path.join(playTmpDir, 'broken-route', 'main.ts'), 'function ( {\n');
    assert.throws(
      () => checkPlayRoute(playTmpDir, 'broken-route'),
      /src\/play\/broken-route\/main\.ts: does not parse as TypeScript/,
      'an unparseable play script must fail the scan closed, not be graded on a broken tree',
    );
    console.log('PASS play route, fail-closed: a play script that does not parse reds instead of reading as "no armAllButtons call"');

    // File-set derivation and its two disclosed ceilings (non-recursive, *.test.* skipped).
    fs.mkdirSync(path.join(playTmpDir, 'derive-route', 'parts'), { recursive: true });
    for (const name of ['markup.html', 'main.js', 'roster-bridge.ts', 'play.css', 'fairness.test.mjs', 'shape.test.ts']) {
      fs.writeFileSync(path.join(playTmpDir, 'derive-route', name), '');
    }
    fs.writeFileSync(path.join(playTmpDir, 'derive-route', 'parts', 'hidden.js'), '');
    assert.deepEqual(
      listPlayRouteFiles(playTmpDir, 'derive-route'),
      ['main.js', 'markup.html', 'roster-bridge.ts'],
      'listPlayRouteFiles must take .html/.js/.ts directly in the route directory and exclude .css, *.test.* and nested files',
    );
    assert.deepEqual(listPlayRouteFiles(playTmpDir, 'does-not-exist'), [], 'a missing route directory must yield [] rather than throwing');
    console.log('PASS play route, file-set derivation: [main.js, markup.html, roster-bridge.ts] — excludes play.css, *.test.*, and parts/hidden.js (flat glob, disclosed ceiling)');

    // Route-set derivation: directories only, so the shared files sitting directly under src/play/
    // (_mascots.ts, _setup-bridge.ts, the *.test.mjs suites) are never mistaken for routes.
    fs.writeFileSync(path.join(playTmpDir, '_shared.ts'), '');
    assert.ok(
      listPlayRouteDirs(playTmpDir).includes('good-route') && !listPlayRouteDirs(playTmpDir).includes('_shared.ts'),
      'listPlayRouteDirs must return route directories only, never files sitting directly under src/play/',
    );
    console.log('PASS play route, route-set derivation: directories only — a file directly under src/play/ is not a route');
  } finally {
    fs.rmSync(playTmpDir, { recursive: true, force: true });
  }

  // --- gh#170: ghost exceptions, both directions. The comment above the success line used to CLAIM
  // this property ("scanTargetFiles fails on an entry naming a file that no longer exists") while
  // nothing implemented it — measured: a src/games copy with timebomb.ts and short-stick.ts removed
  // left all three UNGATED_EXCEPTIONS entries subjectless and the gate exited 0. ---
  assert.deepEqual(
    findGhostExceptions(['a.ts', 'b.ts'], new Set(['a.ts::renderX']), new Map([['b.ts::renderY', 'z']])),
    [],
    'entries whose modules are all in the scanned set must report no ghosts',
  );
  assert.deepEqual(
    findGhostExceptions(['a.ts'], new Set(['a.ts::renderX', 'gone.ts::renderZ']), new Map([['alsogone.ts::renderY', 'z']])),
    ['alsogone.ts::renderY', 'gone.ts::renderZ'],
    'an entry naming a module outside the scanned set must be reported from BOTH exception sets',
  );
  // Over the real sets and the real scan set: every recorded exception must have a live subject today.
  assert.deepEqual(
    findGhostExceptions(listTargetFiles(path.join(repoRoot, 'src/games'))), [],
    'a recorded exception in this file names a module that no longer exists in src/games/ — delete the entry or restore the module',
  );
  console.log(`PASS ghost exceptions: both directions calibrated, and all ${UNGATED_EXCEPTIONS.size + EXCEPT_ARG_EXCEPTIONS.size} recorded entries name a module that is really in the scanned set`);

  // Reconciliation, both directions. Calibrated as a pure function because the hazard it guards —
  // a route directory the manifest does not declare — cannot be planted in src/play/ from here:
  // that tree belongs to another owner, and a gate whose calibration edits its own subject is not
  // a calibration.
  assert.deepEqual(reconcilePlayRoutes(['a', 'b'], ['a', 'b']), { undeclared: [], missingDir: [] }, 'matching sets must reconcile clean');
  assert.deepEqual(reconcilePlayRoutes(['a'], ['a', 'b']), { undeclared: ['b'], missingDir: [] }, 'a directory with no manifest declaration must be reported — it would never be scanned');
  assert.deepEqual(reconcilePlayRoutes(['a', 'c'], ['a']), { undeclared: [], missingDir: ['c'] }, 'a declared route with no directory must be reported — the derivation is stale');
  console.log('PASS play route, manifest reconciliation: an undeclared directory and a declared-but-absent route are each reported, and matching sets reconcile clean');

  // The real derivation must resolve a non-empty route set, or every case above is calibrating a
  // scan that covers nothing (docs/adr/0019). Spawns the real script with no override and asserts
  // the success line names a route count > 0 OR the run reds with real per-route findings — both are
  // a gate that ran; a green naming zero routes is what must never happen.
  const realRun = spawnSync(process.execPath, [scriptPath], { env: { ...process.env, CI: '' }, encoding: 'utf8' });
  assert.ok(
    /(^|\s)([1-9]\d*) play route\(s\)/.test(realRun.stdout) || /src\/play\/\S+\/ · /.test(realRun.stderr),
    'the real run must either report a non-zero play-route count or name real per-route findings — a run that mentions no play route at all has lost the region (docs/adr/0019)',
  );
  console.log(
    `PASS play route, real derivation: the unnarrowed run ${realRun.status === 0 ? 'is green and names its route count' : `reds with ${(realRun.stderr.match(/src\/play\/\S+\/ · /g) || []).length} per-route finding(s)`} — the region is reached, not skipped`,
  );

  // --- CI guard: PLAY_DIR_OVERRIDE must never narrow the scanned set in CI, same rule and same
  // reason as GAMES_DIR_OVERRIDE above. ---
  const playCiGuardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-gate-play-ci-guard-'));
  try {
    fs.mkdirSync(path.join(playCiGuardDir, 'one-clean-route'));
    fs.writeFileSync(path.join(playCiGuardDir, 'one-clean-route', 'markup.html'), '<p>x</p>');
    const guard = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, CI: '1', PLAY_DIR_OVERRIDE: playCiGuardDir },
      encoding: 'utf8',
    });
    assert.notEqual(guard.status, 0, 'PLAY_DIR_OVERRIDE + CI must exit non-zero, never scan a narrowed set');
    assert.match(guard.stderr, /PLAY_DIR_OVERRIDE must never narrow the scanned set in CI/, 'the failure message must name the CI hazard');
    console.log('PASS play route, CI guard: PLAY_DIR_OVERRIDE + CI=1 refuses to run instead of scanning a narrowed play-route set');
  } finally {
    fs.rmSync(playCiGuardDir, { recursive: true, force: true });
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

  // gh#170: an exception entry whose module is gone is a ghost carve-out. Skipped under
  // GAMES_DIR_OVERRIDE only because that flag narrows the scan set by construction, so EVERY entry
  // would read as a ghost there — the narrowing is the reason, not a tolerance for ghosts.
  if (!process.env.GAMES_DIR_OVERRIDE) {
    const ghosts = findGhostExceptions(TARGET_FILES);
    if (ghosts.length) {
      console.error(
        `arm-gate-coverage-check: ${ghosts.length} recorded exception(s) name a module that is not in the scanned set: ${ghosts.join(', ')}. ` +
          'A carve-out with no subject is a standing licence for whatever file later takes that name — delete the entry, or restore the module (docs/adr/0019).',
      );
      process.exit(1);
    }
  }

  const { scannedCount, anyFail: gamesFail } = scanTargetFiles(gamesDir, TARGET_FILES);

  // gh#170: the play-route region. Not affected by GAMES_DIR_OVERRIDE — that flag narrows the game
  // glob only — so this region is scanned on every run unless PLAY_DIR_OVERRIDE narrows it explicitly.
  const onDisk = listPlayRouteDirs(playDir);
  // Under the override the fixture has no manifest entries, so the routes ARE the directories; that
  // is the narrowed run the success line reports. Otherwise the two sets must reconcile exactly.
  const declared = process.env.PLAY_DIR_OVERRIDE ? onDisk : await derivePlayRoutes();
  if (declared.length === 0) {
    console.error(`arm-gate-coverage-check: derived zero play routes for ${playDir} — the play-route set must never be empty (docs/adr/0019).`);
    process.exit(1);
  }
  // Fail CLOSED on either mismatch. A directory the manifest does not declare is a route this gate
  // would silently never scan; a declaration with no directory means the derivation is reading a
  // stale list. Neither may read as clean.
  const { undeclared, missingDir } = reconcilePlayRoutes(declared, onDisk);
  if (undeclared.length || missingDir.length) {
    console.error(
      `arm-gate-coverage-check: the play-route set does not reconcile with ${playDir}` +
        (undeclared.length ? ` — director(ies) with no manifest playRoute declaration: ${undeclared.join(', ')} (they would never be scanned)` : '') +
        (missingDir.length ? ` — declared playRoute(s) with no directory: ${missingDir.join(', ')} (the derivation is reading a stale list)` : '') +
        ' (docs/adr/0019).',
    );
    process.exit(1);
  }

  let playFail = false;
  let playFileCount = 0;
  for (const id of declared) {
    const route = checkPlayRoute(playDir, id);
    playFileCount += route.files.length;
    for (const v of route.violations) {
      console.error(`src/play/${v.id}/ · ${v.kind} · ${v.detail}`);
      playFail = true;
    }
  }

  const anyFail = gamesFail || playFail;
  if (anyFail) {
    console.error(
      '\nADR-0017: every button a render function adds must be gated by armAllButtons, with no list to ' +
      'remember (docs/adr/0017-two-sets-not-one-the-gate-covers-every-button.md). If this is a deliberate ' +
      'exception, it needs its own owner decision recorded in an ADR or inline comment before it can be ' +
      'added to this script\'s exception set — the set is closed on purpose.\n\n' +
      'gh#170, for a src/play/<id>/ hit: a play route renders no #stage and has no render*() function, ' +
      'so the rule there is the route-level one — a route that builds buttons must import armAllButtons ' +
      'from src/games/_arm-gate.ts AND call it. src/play/dice-loser/main.ts is the worked example: it ' +
      'arms the setup panel at module init and re-arms every panel its show() reveals.',
    );
    process.exit(1);
  }
  const overrideNote = process.env.GAMES_DIR_OVERRIDE ? ' (GAMES_DIR_OVERRIDE active)' : '';
  const playOverrideNote = process.env.PLAY_DIR_OVERRIDE ? ' (PLAY_DIR_OVERRIDE active — routes derived from the fixture directories, not the manifest)' : '';
  // "game module(s)" overstated this: scannedCount covers every .ts in src/games/ minus
  // EXCLUDED_FILES, which today means the 6 games PLUS the _-prefixed helpers that are not
  // EXCLUDED (_template.ts, _el.ts, _round-start.ts). Saying
  // "game" implied coverage of 8 games when 6 exist (ADR-0019). The count is real; the noun
  // was not. Excluding the two helpers instead would have traded a label for lost coverage.
  //
  // gh#66: gamesDir is always printed (not only when the override is set), so a narrowed run is
  // readable from the resolved directory alone — a fixture path visibly differs from src/games/,
  // rather than a reader having to infer narrowing from the absence of a failure.
  // gh#154 / ADR-0019 — the exception sets are sized in the success line, not left implied. The
  // deleted party game's `renderIdle` entry went with its module, and this STATIC gate keeps its
  // subjects: the three entries left are real ungated render functions in real modules.
  //
  // gh#170 CORRECTION, measured rather than carried forward: this paragraph used to say
  // "scanTargetFiles above fails on an entry naming a file that no longer exists, which is what stops
  // this list rotting into a set of ghosts". That was FALSE. scanTargetFiles iterates the SCANNED
  // files and skips any that is missing; it never reads the exception sets at all, so an entry whose
  // module was deleted was simply never consulted and the run stayed green. Reproduced: a copy of
  // src/games with timebomb.ts and short-stick.ts removed left all three UNGATED_EXCEPTIONS entries
  // pointing at nothing and the gate exited 0. findGhostExceptions() below is what makes the
  // sentence true — the property is now enforced, not asserted.
  //
  // What the deletion cost is a DYNAMIC leg, not this one. scripts/arm-gate-probe.mjs's `pl-pick
  // exception` leg proved a specific shape in a real browser: a control that a PRECEDING gated
  // control's tap renders, itself deliberately left live at t0. That subject is gone and the leg is
  // not repointed. Note the narrower wording — the three entries below ARE ungated in-#stage buttons
  // that still ship, so "no ungated button is left" would be false; what is gone is the one whose
  // liveness a real touch was driven against.
  //
  // gh#170 — the success line no longer NAMES scripts/arm-gate-probe.mjs as the thing that covers the
  // browser-only property. That sentence was false in practice, and it is the specific defect this
  // ticket exists to remediate: the probe is referenced nowhere in .github/workflows/, in
  // scripts/ci-probes.sh, in scripts/run-workflow-gates.sh or in package.json (re-measure with
  // `grep -rn arm-gate-probe .github/ scripts/ package.json`), so it runs in no gate and cannot red
  // anything; and its own first line records that its short-stick and timebomb scenarios drive
  // /game/<id>/ landing pages ADR-0050 ruling 2 deleted. A gate's green must not point at an
  // instrument that is not running (docs/adr/0019). Wording to restore only once that probe both
  // targets the play routes AND appears in a lane of scripts/ci-probes.sh with a BREAK_GUARD control
  // leg beside it, the way no-nav-in-stage does.
  console.log(
    `arm-gate-coverage-check: ${scannedCount} module(s) in ${gamesDir} clean${overrideNote}` +
    ` · ${declared.length} play route(s), ${playFileCount} file(s), under ${playDir} each wire armAllButtons${playOverrideNote}` +
    ` · recorded exceptions: ${UNGATED_EXCEPTIONS.size} ungated (${[...UNGATED_EXCEPTIONS].join(', ')}),` +
    ` ${EXCEPT_ARG_EXCEPTIONS.size} pinned except-arg` +
    ' · NOT covered here: WHICH buttons each armAllButtons call actually reaches, and whether a real' +
    ' touch inside the 400ms window is suppressed in a browser. Both are runtime facts and NOTHING IN' +
    ' CI MEASURES THEM TODAY — scripts/arm-gate-probe.mjs is the only instrument for them and it is' +
    ' wired into no gate and still aimed at deleted /game/<id>/ landings (gh#170). Read this green as' +
    ' "the gate is imported and called in every play route that builds a button", never as "no ghost' +
    ' tap gets through".',
  );
}

await main();
