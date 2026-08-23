#!/usr/bin/env node
// Static regression tripwire for ADR-0014 (docs/adr/0014-no-navigation-target-inside-the-stage.md):
// a game renders no `<a href>` into #stage. This is a cheap source-text check wired into CI —
// it is NOT the proof. scripts/no-nav-in-stage-probe.mjs (build + serve + headless Chrome, reads
// the rendered DOM) is what actually proves the invariant; this script only catches the same
// mistake being reintroduced into source before that heavier probe ever runs.
//
// ponytail: this is a raw source-text scan, not an AST walk — it covers the literal forms this
// codebase's own idiom actually produces: an <a> tag or href=/href: typed directly,
// document.createElement('a'), the local el('a', ...) helper call, and setAttribute('href', ...).
// It cannot see a tag name or
// attribute key assembled from a variable (el(tag) with tag built at runtime, node.setAttribute(key, ...)),
// or `el.innerHTML = someVariable` assembled from a variable — those escape it completely. Treat a
// green run here as "no obvious anchor literal in this codebase's idiom", never as "no navigation
// target reaches the DOM".
//
// Matching is WHOLE-TEXT, not line-by-line. Per-line matching quietly made every pattern single-line:
// a wrapped `document.createElement(\n  'a',\n)` plus its wrapped `setAttribute(\n  'href',\n  …)`
// scanned clean while the anchor was real — that is just what a formatter does to a long call, not an
// exotic spelling. Line numbers are derived from the match offset, so output is unchanged.
//
// It runs on CODE ONLY: comments and TypeScript type space are blanked first (stripComments,
// stripTypeSpace). Whole-text matching without that made prose and types into violations — a comment
// citing ADR-0014 was a violation of ADR-0014, and `interface LinkCfg { href: string }` was one too.
// Neither strip can hide a live hazard sharing the line; each function says why, and both directions
// are pinned by selftest.
//
// ponytail: SCOPE CEILING — the scanned set is src/games/*.ts, i.e. the game modules. #stage is also
// reachable from src/pages/game/[id].astro, which holds the element and hands it to mount(); today it
// only READS stage.dataset.gameId (measured: zero `href`, zero `<a`, no write into #stage), so nothing
// hides there now. It is deliberately not scanned: it is a page file whose CHROME is required by
// ADR-0014 to carry an `<a href="/games/">`, so a whole-file scan would ban the very link the ADR
// mandates. Upgrade path if a stage-writing branch ever lands there: scan only that file's
// <script> block, not its markup.
//
// --- Ceiling: target-set derivation (gh#46, ADR-0019) ----------------------------------
// The target set is a flat `fs.readdirSync(src/games/)` filtered to `*.ts`, so a newly added game
// is scanned automatically — no list to remember. That glob does not recurse: a game shipped as
// src/games/<subdir>/foo.ts is invisible to it and ships unscanned. Pinned by the "flat,
// non-recursive" selftest case below; switching to a recursive glob must update this comment or
// that case goes red.
//
//   node scripts/no-nav-in-stage-check.mjs             -> scan the game modules, exit non-zero if any hit
//   node scripts/no-nav-in-stage-check.mjs --selftest  -> both-direction calibration on a temp fixture

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
  console.error('no-nav-in-stage-check: GAMES_DIR_OVERRIDE must never narrow the scanned set in CI (docs/adr/0019) — unset GAMES_DIR_OVERRIDE or run outside CI.');
  process.exit(1);
}

// Every *.ts file directly under src/games/, minus the non-game files below. _template.ts STAYS
// IN SCOPE: it is the copy-paste seed for every new game (see its own header comment), so an
// anchor literal planted there would propagate into every game created from it.
const EXCLUDED_FILES = new Set([
  'types.ts',     // shared type declarations, not a game module
  'manifest.ts',  // game registry/metadata, not a game module
  '_arm-gate.ts', // shared button-disabling helper the games import, not a module that renders stage content
]);

function listTargetFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !EXCLUDED_FILES.has(name))
    .sort();
}

// ---------------------------------------------------------------------------
// Pure: text -> violations. No file IO here, so the selftest can feed it strings directly.
// ---------------------------------------------------------------------------
// Matched against the WHOLE file, not line by line, and every pattern is global. A per-line scan made
// each pattern silently single-line: `document.createElement(\n  'a',\n)` and the `setAttribute(\n
// 'href',\n …)` that arms it both went green while the anchor was real — the formatter's own output for
// a wrapped call is enough to defeat it. Line numbers come from the match offset, so reporting is
// unchanged. An `<a` wrapped onto the next line is caught by its `href` (see the anchor pattern's
// trailing class below for why the newline is deliberately NOT in it).
//
// `href` is matched before `=` OR `:` — the property-literal form `Object.assign(link, { href: url })`
// builds exactly the same navigation target and carried no `=` at all. `href:` appears nowhere in the
// scanned set today (measured: src/games/*.ts has zero `href` tokens), so this costs no false positive.
//
// The anchor pattern's trailing class is ` \t>` and deliberately NOT `\s`: with whole-text matching a
// `\s` there spans the newline, so any line ENDING in `<a` — a comparison a formatter wrapped after
// the operator — became an anchor tag. Nothing is lost by excluding the newline: an `<a>` broken
// across lines still carries its `href` on one of them, and an `<a>` with no href is not a navigation
// target at all, which is the only thing ADR-0014 bans. Pinned both ways below.
const PATTERNS = [
  { name: 'anchor tag literal (<a )', re: /<a[ \t>]/gi },
  { name: 'href attribute or property literal (href= / href:)', re: /\bhref\s*[:=]/gi },
  { name: "createElement('a') / createElement(\"a\")", re: /createElement\(\s*(['"])a\1\s*,?\s*\)/g },
  { name: "el('a', ...) / el(\"a\", ...) — local helper with an anchor tag", re: /\bel\(\s*(['"])a\1/g },
  { name: "setAttribute('href', ...) / setAttribute(\"href\", ...)", re: /setAttribute\(\s*(['"])href\1/gi },
];

// Comments and TypeScript type space are blanked (to spaces, never deleted, so every offset and line
// number is unchanged) before any pattern runs — the one choke point findViolations reads through.
// Without it, whole-text matching turned prose and types into ADR-0014 violations: `// no href: or <a
// in this module`, a comment that CITES the ADR, was a violation of it, and `interface LinkCfg { href:
// string }` was one too (five of the seven scanned modules already declare an interface or a type
// alias, so that shape is live in this tree today, not hypothetical).
const blank = (m) => m.replace(/[^\n]/g, ' ');

/** Blanks `//` and `/* *\/` comments, walking the text with STRING STATE rather than replacing on a
 *  bare /\/\/[^\n]* \/ regex.
 *
 *  Why the walk, and why blanking here cannot hide a hazard on the same line: the naive regex reads
 *  the `//` inside `'https://games/'` as a comment opener and blanks the REST OF THAT LINE with it —
 *  so `const u = 'https://games/'; link.setAttribute('href', u);` would scan clean while building a
 *  real anchor. That is ADR-0019's recorded hole class (the `'https://schema.org'` one). Skipping
 *  string literals means a comment opener is only ever recognised where the JS parser would recognise
 *  one, so the blanked span is exactly a comment and everything else on the line still scans. Strings
 *  themselves are never blanked — an `<a href>` lives in a template literal, which is precisely where
 *  this gate must keep looking.
 *
 *  ponytail: a regex literal containing an unbalanced quote (`/['"]/`) would desync the string state.
 *  Measured: the four regex literals in src/games/*.ts today contain no quote character. Upgrade path
 *  if one ever lands: skip regex literals too, which needs the previous significant token to tell a
 *  literal from division. */
function stripComments(text) {
  const out = [...text];
  let i = 0;
  const blankTo = (end) => { for (let k = i; k < end; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < text.length) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      blankTo(end);
      i = end;
    } else if (two === '/*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      blankTo(end);
      i = end;
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

const TYPE_DECL_RE = /^(?:export\s+)?(?:declare\s+)?(?:interface\s+\w+|type\s+\w+[^\n=]*=)[^{;\n]*\{/gm;

/** Blanks the BODY of an `interface X { … }` / `type X = { … }` declaration, brace-matched from its
 *  opening `{` — the same brace-counting idiom extractRenderFunctions() uses in
 *  scripts/arm-gate-coverage-check.mjs.
 *
 *  Why this cannot hide a hazard: TypeScript type space is erased at compile time, so nothing inside
 *  a type body can ever construct a DOM node — there is no navigation target in there to hide. And
 *  the blanked span ends at the MATCHING brace, not at end of line, so a statement sharing the line
 *  (`interface X { href: string } const link = el('a');`) is still scanned. Pinned both ways below.
 *  A `}` inside a string literal type ends the match early, which blanks LESS and scans more —
 *  the fail-safe direction. The one fail-OPEN residue is an unclosed brace, which blanks to end of
 *  file; that file does not compile, and `npx astro check` runs ahead of this gate in CI. */
function stripTypeSpace(text) {
  let out = text;
  TYPE_DECL_RE.lastIndex = 0;
  let m;
  while ((m = TYPE_DECL_RE.exec(text))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    const end = depth === 0 ? i - 1 : text.length;
    out = out.slice(0, bodyStart) + blank(out.slice(bodyStart, end)) + out.slice(end);
    TYPE_DECL_RE.lastIndex = end;
  }
  return out;
}

function findViolations(rawText) {
  const text = stripTypeSpace(stripComments(rawText));
  const violations = [];
  const lines = rawText.split('\n'); // snippets quote REAL source, which is what blanking (not deleting) buys
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      const line = lineOf(m.index);
      violations.push({ line, pattern: p.name, snippet: lines[line - 1].trim() });
    }
  }
  return violations.sort((a, b) => a.line - b.line || a.pattern.localeCompare(b.pattern));
}

// ---------------------------------------------------------------------------
// Self-test: a temp fixture, never repo content, so fixing a game can't retune the check.
// Calibrated both ways — a clean fixture must pass, and each planted pattern must be flagged.
// ---------------------------------------------------------------------------
function selftest() {
  // Known-good: the actual idiom this codebase uses to build non-anchor elements — el(tag) with
  // a variable tag, el('button', ...) with a non-anchor literal tag, no setAttribute('href', ...).
  const cleanText = [
    "function el(tag) { return document.createElement(tag); }",
    "const label = `${players.length} คน`;",
    "el('button', 'ต่อไป');",
  ].join('\n');
  const clean = findViolations(cleanText);
  assert.deepEqual(clean, [], 'known-good fixture must report zero violations');
  console.log('PASS known-good fixture: clean createElement(tag)/template/el() calls report zero violations');

  // Known-bad: one line per pattern, plus the realistic two-line construct this codebase's own
  // el() helper actually forces a regression into — el() takes no attributes parameter, so
  // el('a', ...) followed by setAttribute('href', ...) is the only way to build a link with it.
  const dirtyText = [
    "const html = `<a href=\"/games/\">กลับ</a>`;", //  1  anchor tag + href, both patterns
    "const link = document.createElement('a');", //     2  createElement('a')
    "const link2 = document.createElement(\"a\");", //  3  createElement("a")
    "const link3 = el('a', 'ดูเกมอื่น');", //           4  el('a', ...)
    "link3.setAttribute('href', '/games/');", //         5  setAttribute('href', ...)
  ].join('\n');
  const dirty = findViolations(dirtyText);
  const byLine = (n) => dirty.filter((v) => v.line === n).map((v) => v.pattern);
  assert.deepEqual(byLine(1).sort(), PATTERNS.slice(0, 2).map((p) => p.name).sort(), 'line 1 must flag both anchor-tag and href patterns');
  assert.equal(byLine(2).length, 1, "line 2 must flag createElement('a')");
  assert.equal(byLine(3).length, 1, 'line 3 must flag createElement("a")');
  assert.equal(byLine(4).length, 1, "line 4 must flag el('a', ...)");
  assert.equal(byLine(5).length, 1, "line 5 must flag setAttribute('href', ...)");
  console.log(`PASS known-bad fixture flags all 5 patterns (6 hits across 5 lines, line 1 double-flags):\n${dirty.map((v) => `     line ${v.line} · ${v.pattern} · ${v.snippet}`).join('\n')}`);

  // Known-bad, MULTI-LINE: the same two constructs a formatter wraps when the call gets long. Under
  // the old per-line scan both of these reported ZERO — planted verbatim into a real game module and
  // measured, not reasoned. Revert findViolations to text.split('\n') and this case goes green.
  const wrappedText = [
    "  const link = document.createElement(", //  1
    "    'a',", //                                2  createElement('a') closes here
    "  );", //                                    3
    "  link.setAttribute(", //                    4
    "    'href',", //                             5  setAttribute('href' closes here
    "    '/games/',", //                          6
    "  );", //                                    7
    "  const wrapped = el(", //                   8
    "    'a',", //                                9  el('a' closes here
    "  );", //                                   10
  ].join('\n');
  const wrapped = findViolations(wrappedText);
  const wrappedPatterns = new Set(wrapped.map((v) => v.pattern));
  assert.ok(wrappedPatterns.has(PATTERNS[2].name), "a createElement( ... 'a' ... ) wrapped across lines must be flagged");
  assert.ok(wrappedPatterns.has(PATTERNS[4].name), "a setAttribute( ... 'href' ... ) wrapped across lines must be flagged");
  assert.ok(wrappedPatterns.has(PATTERNS[3].name), "an el( ... 'a' ... ) wrapped across lines must be flagged");
  console.log(`PASS known-bad multi-line: wrapped createElement/setAttribute/el calls flagged (${wrapped.length} hit(s)) — a per-line scan reported zero on all three`);

  // Known-bad, PROPERTY form: the same navigation target built without a single `=`. Also measured
  // green against the old pattern set.
  const propForm = "Object.assign(link, { href: '/games/' });";
  const prop = findViolations(propForm);
  assert.equal(prop.length, 1, 'an href: property literal must be flagged exactly once');
  assert.equal(prop[0].pattern, PATTERNS[1].name);
  console.log(`PASS known-bad property form: ${prop[0].snippet} flagged as ${prop[0].pattern}`);

  // Other direction for both widenings: the codebase's real non-anchor idiom must stay clean, and a
  // wrapped call that builds a BUTTON must not be dragged in by the whole-text match.
  const wrappedClean = [
    "  const btn = el(",
    "    'button',",
    "    'เล่นอีกรอบ',",
    "  );",
    "  const node = document.createElement(",
    "    tag,",
    "  );",
  ].join('\n');
  assert.deepEqual(findViolations(wrappedClean), [], 'wrapped el(\'button\')/createElement(tag) calls must stay clean under whole-text matching');
  console.log("PASS whole-text matching, other direction: wrapped el('button', …) and createElement(tag) report zero violations");

  // --- NOT CODE: prose and TypeScript type space. Every case here was measured RED against the
  // pre-strip whole-text scan — including a comment that CITES ADR-0014 being a violation of it, and
  // an `interface { href: string }`, a shape five of the seven scanned modules already carry. Delete
  // the stripComments()/stripTypeSpace() calls out of findViolations and every case goes red. ---
  for (const [label, text] of [
    ['line comment citing the ADR', '// this module renders no href: and no <a into #stage (ADR-0014)'],
    ['block comment', '/* renders no <a href="/games/"> inside the stage */'],
    ['JSDoc block comment', '/**\n * Builds the panel. Never an <a href>.\n */\nconst x = 1;'],
    ['interface declaration', 'interface LinkCfg { href: string }'],
    ['exported interface, wrapped', 'export interface LinkCfg {\n  href: string;\n  label: string;\n}'],
    ['type alias object', 'type LinkCfg = {\n  href: string;\n};'],
    ['comparison wrapped after the operator', 'const ok = counts[i] <a\n  .length;'],
  ]) {
    assert.deepEqual(findViolations(text), [], `${label}: not code that can build a navigation target — must not be a violation`);
  }
  console.log('PASS not-code, other direction: a line comment citing ADR-0014, a block comment, a JSDoc block, `interface LinkCfg { href: string }`, a wrapped interface, a `type X = { href }` alias and a comparison wrapped after `<` are all clean');

  // --- and neither strip may become a bypass. These are the two ways blanking could hide a real
  // hazard on the SAME LINE, and both must still be flagged:
  //   1. the `//` inside 'https://games/' is not a comment opener (ADR-0019's recorded hole class) —
  //      a naive /\/\/[^\n]*\/ replace blanks the rest of that line and the anchor with it;
  //   2. a type body is blanked only to its MATCHING brace, never to end of line. ---
  for (const [label, text, expectPattern] of [
    ['url containing // then a real setAttribute', "const u = 'https://games/'; link.setAttribute('href', u);", PATTERNS[4].name],
    ['type declaration then a real el(\'a\') on one line', "interface LinkCfg { href: string } const link = el('a');", PATTERNS[3].name],
    ['trailing comment after a real anchor', "const link = el('a', 'ดูเกมอื่น'); // back to the game list", PATTERNS[3].name],
    ['anchor literal wrapped across lines', "const html = `<a\n  href=\"/games/\">กลับ</a>`;", PATTERNS[1].name],
  ]) {
    const v = findViolations(text);
    assert.ok(v.some((x) => x.pattern === expectPattern), `${label}: the live hazard on this line must still be flagged (${expectPattern})`);
  }
  console.log("PASS no bypass: 'https://games/' does not blank its own line, a type body is blanked only to its matching brace, a trailing comment does not blank the anchor before it, and an `<a` wrapped onto the next line is still caught by its href");

  // --- Target-set derivation (gh#46): glob src/games/*.ts, minus known non-game files, plus the
  // non-recursive ceiling that shape carries. Calibrated: reverting listTargetFiles to a hardcoded
  // list makes this case meaningless (nothing to derive); reverting the exclusion set or the
  // .ts filter makes the assertion below fail. ---
  const globTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-target-set-'));
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
    env: { ...process.env, CI: '', GAMES_DIR_OVERRIDE: path.join(os.tmpdir(), 'no-nav-empty-guard-does-not-exist') },
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
  const ciGuardTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-in-stage-check-ci-guard-'));
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
  const scanTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-scan-count-'));
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
  const overrideNoteTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nav-override-note-'));
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
    const violations = findViolations(fs.readFileSync(abs, 'utf8'));
    for (const v of violations) {
      log(`src/games/${name}:${v.line} · ${v.pattern} · ${v.snippet}`);
      anyFail = true;
    }
  }
  return { scannedCount, anyFail };
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const TARGET_FILES = listTargetFiles(gamesDir);
  if (TARGET_FILES.length === 0) {
    console.error(`no-nav-in-stage-check: src/games/*.ts matched zero target files under ${gamesDir} — the target set must never be empty (docs/adr/0019).`);
    process.exit(1);
  }

  const { scannedCount, anyFail } = scanTargetFiles(gamesDir, TARGET_FILES);
  if (anyFail) {
    console.error('\nADR-0014: a game must render no navigation target inside #stage (docs/adr/0014-no-navigation-target-inside-the-stage.md).');
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
  console.log(`no-nav-in-stage-check: ${scannedCount} module(s) in ${gamesDir} clean${overrideNote}`);
}

await main();
