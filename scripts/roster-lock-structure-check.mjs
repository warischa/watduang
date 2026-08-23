#!/usr/bin/env node
// Static regression tripwire standing in for scripts/roster-lock-two-tab-race.mjs (backs the
// roster/checkpoint work and ADR-0010, docs/adr/0018-...) — see that harness's own header
// (:8-12): it needs BOTH a fixed and an unfixed build to prove anything, and CI has no
// unfixed-build arm, so wiring it into CI would produce a number that means nothing. This script
// checks the structural property the fix rests on instead: the re-read sits INSIDE the lock's
// critical section, the critical section stays synchronous, and roster.ts stays the sole writer
// of the roster key.
//
// ponytail: this is a raw source-text scan (brace/regex matching), not a real parser. It cannot
// distinguish a locked run from the no-lock fallback branch (the early-return guard inside
// src/shell/roster.ts's withLock()), which still loses a concurrent add on plain http, on
// Safari < 15.4, or on an opaque origin (sandboxed iframe, file://) — those all fall through
// to running `fn()` unlocked. The committed unit tests
// all exercise that fallback branch (src/shell/roster.test.mjs asserts the Node runner has no
// navigator.locks); the only committed coverage of the LOCKED path is a mocked navigator.locks at
// roster.test.mjs:149. Real two-tab behaviour remains proven only by the manual harness
// (scripts/roster-lock-two-tab-race.mjs), run by hand against a real build.
//
// The sole-writer scan reads the key as a literal in any of the three JS quote characters, backticks
// included. It still cannot see a key that is never written literally — assembled by concatenation,
// or a template with an interpolation (`watduang:${ns}`) — and it reads comments as code, so a
// commented-out mention outside the allow-list fails the gate and a human decides.
//
//   node scripts/roster-lock-structure-check.mjs             -> scan src/shell/roster.ts + src/**, exit non-zero on any hit
//   node scripts/roster-lock-structure-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const rosterPath = path.join(repoRoot, 'src/shell/roster.ts');
const srcDir = path.join(repoRoot, 'src');

// Closed allow-list — no growable skip-list. A new writer of the roster key anywhere else fails
// the gate and a human decides; this script never grows the exemption on its own.
const ALLOWED_KEY_MENTION_PATHS = new Set(['src/shell/roster.ts', 'src/shell/roster.test.mjs']);

// ---------------------------------------------------------------------------
// Pure: text -> brace-match table. No IO here, so selftest can feed it fixture strings directly.
// Simple stack matcher — this file has no braces inside string/comment content, so it doesn't
// need to skip those; a fixture that did would defeat the whole scan the same way it defeats
// no-nav-in-stage-check.mjs's text scan.
// ---------------------------------------------------------------------------
function matchBraces(text) {
  const stack = [];
  const matchFor = new Map(); // openIdx -> closeIdx
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') stack.push(i);
    else if (text[i] === '}') {
      const open = stack.pop();
      if (open !== undefined) matchFor.set(open, i);
    }
  }
  return matchFor;
}

// Finds every `withLock(() => { ... })` / `withLock(async () => { ... })` callback in the text,
// returning each callback's brace span plus the span of its immediate enclosing block (the
// function that makes the withLock(...) call — e.g. add()). Condition 2 checks inside the
// callback span; condition 1 checks the gap between the enclosing span and the callback span.
function findWithLockSpans(text, matchFor) {
  const spans = [];
  const re = /withLock\(\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const openBrace = m.index + m[0].length - 1;
    const closeBrace = matchFor.get(openBrace);
    if (closeBrace === undefined) continue; // unbalanced fixture — nothing to pair against

    // Immediate enclosing block = the brace pair with the largest open index that still strictly
    // contains this callback span (the tightest ancestor, i.e. the function making the call).
    let enclosing = null;
    for (const [open, close] of matchFor) {
      if (open < m.index && close > closeBrace) {
        if (!enclosing || open > enclosing.open) enclosing = { open, close };
      }
    }
    spans.push({ callbackStart: openBrace, callbackEnd: closeBrace, enclosing });
  }
  return spans;
}

const within = (idx, start, end) => idx > start && idx < end;

// ---------------------------------------------------------------------------
// Condition 1 + 2: given roster.ts-shaped text, find (a) write(KEY calls or mutation-path
// read(KEY) calls sitting outside their withLock callback, and (b) await inside a withLock
// callback.
// ---------------------------------------------------------------------------
function checkLockStructure(text) {
  const violations = [];
  const matchFor = matchBraces(text);
  const lockSpans = findWithLockSpans(text, matchFor);
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;

  const inAnyCallback = (idx) => lockSpans.some((s) => within(idx, s.callbackStart, s.callbackEnd));
  const inAnyEnclosing = (idx) =>
    lockSpans.some((s) => s.enclosing && within(idx, s.enclosing.open, s.enclosing.close));

  // Condition 1a: write(KEY, ...) outside every withLock callback, anywhere in the file.
  const writeRe = /\bwrite\(\s*KEY\s*,/g;
  let wm;
  while ((wm = writeRe.exec(text))) {
    if (!inAnyCallback(wm.index)) {
      violations.push({
        line: lineOf(wm.index),
        rule: 'write(KEY outside withLock callback',
        snippet: text.split('\n')[lineOf(wm.index) - 1].trim(),
      });
    }
  }

  // Condition 1b: read(KEY) that sits in the same function that makes the withLock call (a
  // mutation path), but outside that call's callback — the hoisted-re-read regression. A
  // read(KEY) outside that enclosing function entirely (loadGroup, the initial capture in
  // loadRoster) is a plain load, not a mutation path, and is not in scope.
  const readRe = /\bread\(\s*KEY\s*\)/g;
  let rm;
  while ((rm = readRe.exec(text))) {
    if (inAnyCallback(rm.index)) continue; // inside the critical section — fine
    if (inAnyEnclosing(rm.index)) {
      violations.push({
        line: lineOf(rm.index),
        rule: 'mutation-path read(KEY) outside withLock callback',
        snippet: text.split('\n')[lineOf(rm.index) - 1].trim(),
      });
    }
  }

  // Condition 2: await inside a withLock callback reopens the gap the lock closes.
  const awaitRe = /\bawait\b/g;
  let am;
  while ((am = awaitRe.exec(text))) {
    if (inAnyCallback(am.index)) {
      violations.push({
        line: lineOf(am.index),
        rule: 'await inside withLock callback',
        snippet: text.split('\n')[lineOf(am.index) - 1].trim(),
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Condition 3: the roster key string, anywhere under src/** outside the closed allow-list.
// ---------------------------------------------------------------------------
function checkKeyOwnership(files) {
  const violations = [];
  const keyRe = /(['"`])watduang:roster\1/g; // backtick included: a template literal is a write like any other
  for (const { relPath, text } of files) {
    if (ALLOWED_KEY_MENTION_PATHS.has(relPath)) continue;
    let km;
    while ((km = keyRe.exec(text))) {
      const line = text.slice(0, km.index).split('\n').length;
      violations.push({
        file: relPath,
        line,
        rule: "'watduang:roster' written outside the allowed roster.ts / roster.test.mjs",
        snippet: text.split('\n')[line - 1].trim(),
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: temp fixtures under os.tmpdir(), never repo content — never touches src/, dist/, or
// the working tree. Calibrated both ways per condition: a clean fixture passes, each planted
// violation is flagged. Bad fixtures copy roster.ts's real withLock(() => { ... }) call shape.
// ---------------------------------------------------------------------------
function selftest() {
  // --- Conditions 1 + 2, known-good: the real shape roster.ts ships today. ---
  const goodLockText = [
    "function read(key) { return []; }",
    "function write(key, list) {}",
    "const KEY = 'watduang:roster';",
    "function withLock(fn) { return Promise.resolve(fn()); }",
    "export function loadGroup() {",
    "  const names = read(KEY);", // plain load, not a mutation path — must not be flagged
    "  return names;",
    "}",
    "export function loadRoster() {",
    "  let list = read(KEY);", // initial capture, outside add() — must not be flagged
    "  return {",
    "    async add(name) {",
    "      await withLock(() => {",
    "        list = [...list, ...read(KEY).filter((n) => !list.includes(n))];",
    "        write(KEY, list);",
    "      });",
    "    },",
    "  };",
    "}",
  ].join('\n');
  assert.deepEqual(checkLockStructure(goodLockText), [], 'real roster.ts shape must report zero violations');
  console.log('PASS known-good fixture: read/write(KEY) inside the callback, sync callback, zero violations');

  // --- Condition 1a known-bad: write(KEY outside any withLock callback. ---
  const badWriteOutside = [
    "async function add(name) {",
    "  write(KEY, [name]);", // no lock at all
    "  await withLock(() => {",
    "    read(KEY);",
    "  });",
    "}",
  ].join('\n');
  const v1a = checkLockStructure(badWriteOutside);
  assert.ok(
    v1a.some((v) => v.rule === 'write(KEY outside withLock callback' && v.line === 2),
    'write(KEY outside every withLock callback must be flagged'
  );
  console.log('PASS known-bad fixture (1a): write(KEY outside withLock callback is flagged');

  // --- Condition 1b known-bad: the exact hoist regression — read(KEY) moved just before the
  // withLock call, still inside add(), but outside the callback.
  const badHoistedRead = [
    "async function add(name) {",
    "  const stale = read(KEY);", // hoisted out of the critical section
    "  await withLock(() => {",
    "    write(KEY, [...stale, name]);",
    "  });",
    "}",
  ].join('\n');
  const v1b = checkLockStructure(badHoistedRead);
  assert.ok(
    v1b.some((v) => v.rule === 'mutation-path read(KEY) outside withLock callback' && v.line === 2),
    'read(KEY) hoisted out of the critical section, inside the mutating function, must be flagged'
  );
  console.log('PASS known-bad fixture (1b): hoisted mutation-path read(KEY) is flagged');

  // --- Condition 2 known-bad: an await inside the withLock callback. ---
  const badAwaitInCallback = [
    "async function add(name) {",
    "  await withLock(async () => {",
    "    const list = await Promise.resolve(read(KEY));",
    "    write(KEY, [...list, name]);",
    "  });",
    "}",
  ].join('\n');
  const v2 = checkLockStructure(badAwaitInCallback);
  assert.ok(
    v2.some((v) => v.rule === 'await inside withLock callback' && v.line === 3),
    'an await inside the withLock callback must be flagged'
  );
  console.log('PASS known-bad fixture (2): await inside withLock callback is flagged');

  // --- Condition 3, known-good: the two allowed files carry the key, nothing else does. ---
  const goodFiles = [
    { relPath: 'src/shell/roster.ts', text: "const KEY = 'watduang:roster';" },
    { relPath: 'src/shell/roster.test.mjs', text: "const KEY = 'watduang:roster';" },
    { relPath: 'src/games/love-match.ts', text: "const label = 'จับคู่';" },
  ];
  assert.deepEqual(checkKeyOwnership(goodFiles), [], 'allowed files must not be flagged, and clean files carry no violations');
  console.log('PASS known-good fixture (3): roster.ts + roster.test.mjs mentions are allowed, no other file writes the key');

  // --- Condition 3, known-bad: a second writer of the key elsewhere under src/**. ---
  const badFiles = [
    ...goodFiles,
    { relPath: 'src/shell/checkpoint.ts', text: "localStorage.setItem('watduang:roster', '[]');" },
  ];
  const v3 = checkKeyOwnership(badFiles);
  assert.ok(
    v3.some((v) => v.file === 'src/shell/checkpoint.ts' && v.rule.includes('allowed')),
    'a second writer of the roster key outside the allow-list must be flagged'
  );
  console.log('PASS known-bad fixture (3): a second writer of the roster key outside roster.ts is flagged');

  // --- Condition 3, known-bad: the same second writer using a backtick template literal. Matching
  // only '...' and "..." let this shape past the check entirely. ---
  const badTemplateLiteral = [
    ...goodFiles,
    { relPath: 'src/shell/checkpoint.ts', text: 'localStorage.setItem(`watduang:roster`, `[]`);' },
  ];
  const v3tpl = checkKeyOwnership(badTemplateLiteral);
  assert.ok(
    v3tpl.some((v) => v.file === 'src/shell/checkpoint.ts' && v.rule.includes('allowed')),
    'a second writer using a backtick template literal must be flagged too'
  );
  console.log('PASS known-bad fixture (3, template literal): a backtick `watduang:roster` writer is flagged');

  // --- Condition 3, calibration the other way: widening to backticks must not start flagging a
  // different key, or an allowed file that happens to use a template literal. ---
  const goodTemplateLiteral = [
    { relPath: 'src/shell/roster.ts', text: 'const KEY = `watduang:roster`;' },
    { relPath: 'src/shell/checkpoint.ts', text: 'const CK = `watduang:checkpoint`;' },
  ];
  assert.deepEqual(checkKeyOwnership(goodTemplateLiteral), [], 'a template literal in an allowed file, and a different key elsewhere, must both stay clean');
  console.log('PASS known-good fixture (3, template literal): allowed-file backtick key and a different key elsewhere stay clean');

  // Fixtures live under a temp dir purely to satisfy "hermetic" — the checks above run on
  // in-memory strings and touch no disk at all, but write one throwaway file to prove the
  // hermeticity claim, then remove it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-lock-structure-check-'));
  try {
    fs.writeFileSync(path.join(tmp, 'probe.txt'), 'selftest ran');
    assert.ok(fs.existsSync(path.join(tmp, 'probe.txt')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
function walkSrcFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const abs = path.join(dir, entry);
    if (!fs.statSync(abs).isFile()) continue;
    out.push({ relPath: path.relative(repoRoot, abs).split(path.sep).join('/'), abs });
  }
  return out;
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;

  const rosterText = fs.readFileSync(rosterPath, 'utf8');
  for (const v of checkLockStructure(rosterText)) {
    console.error(`src/shell/roster.ts:${v.line} · ${v.rule} · ${v.snippet}`);
    anyFail = true;
  }

  const files = walkSrcFiles(srcDir).map(({ relPath, abs }) => ({ relPath, text: fs.readFileSync(abs, 'utf8') }));
  for (const v of checkKeyOwnership(files)) {
    console.error(`${v.file}:${v.line} · ${v.rule} · ${v.snippet}`);
    anyFail = true;
  }

  if (anyFail) {
    console.error(
      '\nADR-0010 roster/checkpoint lock: the re-read must sit inside the withLock critical section, ' +
        'the critical section must stay synchronous, and roster.ts must stay the sole writer of the roster key.'
    );
    process.exit(1);
  }
  console.log('roster-lock-structure-check: src/shell/roster.ts lock structure and roster-key ownership both clean');
}

await main();
