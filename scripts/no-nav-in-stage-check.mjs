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
  const overrideNote = process.env.GAMES_DIR_OVERRIDE ? ` (scanned ${gamesDir}, GAMES_DIR_OVERRIDE active)` : '';
  // "game module(s)" overstated this: scannedCount covers every .ts in src/games/ minus
  // EXCLUDED_FILES, which today means the 6 games PLUS _template.ts and _el.ts. Saying
  // "game" implied coverage of 8 games when 6 exist (ADR-0019). The count is real; the noun
  // was not. Excluding the two helpers instead would have traded a label for lost coverage.
  console.log(`no-nav-in-stage-check: ${scannedCount} module(s) in src/games/ clean${overrideNote}`);
}

await main();
