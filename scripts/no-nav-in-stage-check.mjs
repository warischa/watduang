#!/usr/bin/env node
// Static regression tripwire for ADR-0014 (docs/adr/0014-no-navigation-target-inside-the-stage.md):
// a game renders no `<a href>` into #stage. This is a cheap source-text check wired into CI —
// it is NOT the proof. scripts/no-nav-in-stage-probe.mjs (build + serve + headless Chrome, reads
// the rendered DOM) is what actually proves the invariant; this script only catches the same
// mistake being reintroduced into source before that heavier probe ever runs.
//
// ponytail: this is a raw source-text scan, not an AST walk — it covers the literal forms this
// codebase's own idiom actually produces: an <a> tag or href= typed directly, document.createElement('a'),
// the local el('a', ...) helper call, and setAttribute('href', ...). It cannot see a tag name or
// attribute key assembled from a variable (el(tag) with tag built at runtime, node.setAttribute(key, ...)),
// or `el.innerHTML = someVariable` assembled from a variable — those escape it completely. Treat a
// green run here as "no obvious anchor literal in this codebase's idiom", never as "no navigation
// target reaches the DOM".
//
//   node scripts/no-nav-in-stage-check.mjs             -> scan the game modules, exit non-zero if any hit
//   node scripts/no-nav-in-stage-check.mjs --selftest  -> both-direction calibration on a temp fixture

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const gamesDir = path.join(repoRoot, 'src/games');

// The six shipped games. _template.ts is included too: it is the copy-paste seed for every new
// game (see its own header comment), so an anchor literal planted there would propagate into
// every game created from it — worth catching here at zero cost, since it carries none today.
// _arm-gate.ts is excluded: it is a shared button-disabling helper the games import, not a module
// that renders stage content itself.
const TARGET_FILES = [
  'daily-fortune.ts', 'love-match.ts', 'pick-loser.ts', 'short-stick.ts', 'siamsi.ts', 'timebomb.ts',
  '_template.ts',
];

// ---------------------------------------------------------------------------
// Pure: text -> violations. No file IO here, so the selftest can feed it strings directly.
// ---------------------------------------------------------------------------
const PATTERNS = [
  { name: 'anchor tag literal (<a )', re: /<a[\s>]/i },
  { name: 'href attribute literal (href=)', re: /\bhref\s*=/i },
  { name: "createElement('a') / createElement(\"a\")", re: /createElement\(\s*(['"])a\1\s*\)/ },
  { name: "el('a', ...) / el(\"a\", ...) — local helper with an anchor tag", re: /\bel\(\s*(['"])a\1/ },
  { name: "setAttribute('href', ...) / setAttribute(\"href\", ...)", re: /setAttribute\(\s*(['"])href\1/i },
];

function findViolations(text) {
  const violations = [];
  text.split('\n').forEach((line, i) => {
    for (const p of PATTERNS) {
      if (p.re.test(line)) violations.push({ line: i + 1, pattern: p.name, snippet: line.trim() });
    }
  });
  return violations;
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
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;
  for (const name of TARGET_FILES) {
    const abs = path.join(gamesDir, name);
    if (!fs.existsSync(abs)) continue; // ponytail: don't hard-fail if a listed file moves; validate-games.mjs already owns "does every game exist"
    const violations = findViolations(fs.readFileSync(abs, 'utf8'));
    for (const v of violations) {
      console.error(`src/games/${name}:${v.line} · ${v.pattern} · ${v.snippet}`);
      anyFail = true;
    }
  }
  if (anyFail) {
    console.error('\nADR-0014: a game must render no navigation target inside #stage (docs/adr/0014-no-navigation-target-inside-the-stage.md).');
    process.exit(1);
  }
  console.log(`no-nav-in-stage-check: ${TARGET_FILES.length} game module(s) clean`);
}

await main();
