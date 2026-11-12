#!/usr/bin/env node
// Static regression tripwire standing in for scripts/roster-lock-two-tab-race.mjs (backs the
// roster/checkpoint work and ADR-0010, docs/adr/0018-...) — see that harness's own header
// (its "Needs BOTH a fixed and an unfixed build" paragraph): it needs BOTH a fixed and an unfixed
// build to prove anything, and CI has no
// unfixed-build arm, so wiring it into CI would produce a number that means nothing. This script
// checks the structural property the fix rests on instead: the re-read sits INSIDE the lock's
// critical section, the critical section stays synchronous, and roster.ts stays the sole writer
// of the roster key. The structure scan covers EVERY caller of the shared withLock
// (src/shell/lock.ts), not just roster.ts — src/tools/name-list.ts runs the same pattern on its
// per-tool keys.
//
// ponytail: this is a raw source-text scan (brace/regex matching), not a real parser. It cannot
// distinguish a locked run from the no-lock fallback branch (the early-return guard inside
// src/shell/lock.ts's withLock()), which still loses a concurrent add on plain http, on
// Safari < 15.4, or on an opaque origin (sandboxed iframe, file://) — those all fall through
// to running `fn()` unlocked. The committed unit tests
// all exercise that fallback branch (src/shell/roster.test.mjs asserts the Node runner has no
// navigator.locks); the only committed coverage of the LOCKED path is a mocked navigator.locks at
// the test named "#data-loss the re-read is inside the critical section — a write landing before the
// grant is not clobbered". Real two-tab behaviour remains proven only by the manual harness
// (scripts/roster-lock-two-tab-race.mjs), run by hand against a real build.
//
// The sole-writer scan reads the key as a literal in any of the three JS quote characters, backticks
// included. It still cannot see a key that is never written literally — assembled by concatenation,
// or a template with an interpolation (`watduang:${ns}`) — and it reads comments as code, so a
// commented-out mention outside the allow-list fails the gate and a human decides.
//
// The prize-draw event key (gh#304) has the same sole-writer rule, closed tighter: its one writer is
// src/prize-event/event.ts's withEventLock, which fails closed (no unlocked fallback, unlike withLock), and
// the `tx.write` it hands out is the only setItem of that key. Every other writer (the setup page, every
// projector tab) goes through it. The key is exported as a constant, so a second writer would name the
// import, not the literal; condition 4 reads every src/** file's imports of it from event.ts (named, aliased
// or as a namespace) and flags any `.setItem(` call on those names or on the literal, and requires event.ts
// itself to hold exactly one `.setItem(`, inside withEventLock. DISCLOSED CEILING: a key handed on through a
// variable or a parameter (`const k = STORAGE_KEY; s.setItem(k, ...)`) is not seen, and scripts/** (browser
// probes that seed a fixture event in a test page) is outside the scan, as it is for the roster key.
//
//   node scripts/roster-lock-structure-check.mjs             -> scan every src/** importer of the shared
//                                                              withLock, plus src/** for key ownership
//   node scripts/roster-lock-structure-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.join(repoRoot, 'src');

// The lock-structure scan set is DERIVED, not listed: every file under src/** that imports the shared
// withLock from src/shell/lock.ts. Deriving it off the IMPORT (not off the call shape) is deliberate —
// a file whose call sites stopped matching findWithLockSpans must stay in the set so the gate can fail
// on it, instead of quietly dropping out and reading green. main() fails if the set is empty, and if any
// file in it yields zero recognised call sites.
const LOCK_IMPORT_RE = /from\s*(['"])(?:[^'"]*\/)?lock\.ts\1/;

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

// Finds every `withLock(() => { ... })` / `withLock(KEY, () => { ... })` callback in the text (both
// with an optional `async`), returning each callback's brace span plus the span of its immediate
// enclosing block (the function that makes the withLock(...) call — e.g. add()). Condition 2 checks
// inside the callback span; condition 1 checks the gap between the enclosing span and the callback span.
//
// The optional leading `<identifier>,` is the lock NAME argument the shared src/shell/lock.ts takes.
// Both shapes stay matched because the one-argument form is still what a fixture, a mock or a future
// caller may write; what the regex still REQUIRES is the literal `withLock(` and a zero-parameter arrow
// with a block body, so it cannot drift onto unrelated code — the optional part is a single identifier
// and a comma, nothing more.
function findWithLockSpans(text, matchFor) {
  const spans = [];
  const re = /withLock\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?(?:async\s*)?\(\s*\)\s*=>\s*\{/g;
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

  // Condition 1a: write(KEY, ...) outside every withLock callback, anywhere in the file. `key` (the
  // per-tool storage key name-list.ts is handed) counts as the same thing. The `function` lookbehind on
  // both this and the read regex below is what keeps a DECLARATION (`function write(key, list)`) out of
  // the call set — the colon in the TS annotation does that too, but only in TS, and the selftest
  // fixtures are plain JS. Without it the good fixture flagged its own helper declaration.
  // DISCLOSED CEILING: only the write() helper is matched, not a bare localStorage.setItem(key, ...).
  // Matching setItem too would flag roster.ts's own write() helper, which sits outside every callback
  // by design. Condition 1b below is what covers the regression that actually shipped (gh#132): the
  // re-read hoisted out of the critical section.
  const writeRe = /(?<!function\s+)\bwrite\(\s*(?:KEY|key)\s*,/g;
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
  const readRe = /(?<!function\s+)\bread\(\s*(?:KEY|key)\s*\)/g;
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
// Condition 4: the prize-draw event key has exactly one setItem, inside event.ts's withEventLock.
// ---------------------------------------------------------------------------
const EVENT_KEY_OWNER = 'src/prize-event/event.ts';
const EVENT_KEY_LITERAL_RE = /(['"`])watduang:prize-draw:event\1/g;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The names a file can reach the event key by: its imports of STORAGE_KEY from event.ts, under any alias or
 *  namespace, plus STORAGE_KEY itself in the owner, where it is declared. */
function eventKeyNames(relPath, text) {
  const names = relPath === EVENT_KEY_OWNER ? ['STORAGE_KEY'] : [];
  const fromEvent = String.raw`\s*from\s*(['"])(?:[^'"]*\/)?event(?:\.ts)?\2`;
  for (const m of text.matchAll(new RegExp(String.raw`import\s*(?:type\s+)?\{([^}]*)\}` + fromEvent, 'g'))) {
    for (const spec of m[1].split(',')) {
      const s = spec.trim().match(/^STORAGE_KEY(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (s) names.push(s[1] ?? 'STORAGE_KEY');
    }
  }
  for (const m of text.matchAll(new RegExp(String.raw`import\s*\*\s*as\s+([A-Za-z_$][\w$]*)` + fromEvent, 'g'))) {
    names.push(`${m[1]}.STORAGE_KEY`);
  }
  return names;
}

function checkEventKeyWriter(files) {
  const violations = [];
  const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
  const push = (relPath, text, idx, rule) =>
    violations.push({ file: relPath, line: lineOf(text, idx), rule, snippet: text.split('\n')[lineOf(text, idx) - 1].trim() });
  let owner = null;
  for (const { relPath, text } of files) {
    if (relPath === EVENT_KEY_OWNER) owner = text;
    else for (const m of text.matchAll(EVENT_KEY_LITERAL_RE)) push(relPath, text, m.index, `the event key written as a literal outside ${EVENT_KEY_OWNER}`);
    const names = eventKeyNames(relPath, text);
    if (relPath === EVENT_KEY_OWNER || !names.length) continue;
    const callRe = new RegExp(String.raw`\.setItem\(\s*(?:${names.map(escapeRe).join('|')})(?![\w$])`, 'g');
    for (const m of text.matchAll(callRe)) push(relPath, text, m.index, `a second writer of the event key: setItem outside ${EVENT_KEY_OWNER}'s withEventLock`);
  }
  if (owner === null) {
    violations.push({ file: EVENT_KEY_OWNER, line: 0, rule: 'the event key owner is missing: the sole-writer scan checked nothing', snippet: '' });
    return violations;
  }
  const head = owner.match(/export function withEventLock\([\s\S]*?\)\s*:\s*[^{;]*\{/);
  if (!head) {
    violations.push({ file: EVENT_KEY_OWNER, line: 0, rule: 'no withEventLock(...) { found: the sole-writer scan went blind', snippet: '' });
    return violations;
  }
  const open = head.index + head[0].length - 1;
  const close = matchBraces(owner).get(open);
  const sets = [...owner.matchAll(/\.setItem\(/g)].map((m) => m.index);
  for (const idx of sets) {
    if (close === undefined || !within(idx, open, close)) push(EVENT_KEY_OWNER, owner, idx, 'a setItem in event.ts outside withEventLock');
  }
  if (sets.length !== 1) {
    violations.push({ file: EVENT_KEY_OWNER, line: 0, rule: `event.ts holds ${sets.length} setItem calls; the one writer is exactly one, in withEventLock`, snippet: '' });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: temp fixtures under os.tmpdir(), never repo content — never touches src/, dist/, or
// the working tree. Calibrated both ways per condition: a clean fixture passes, each planted
// violation is flagged. EVERY lock-structure fixture runs TWICE, once per call shape: the
// two-argument `withLock(KEY, () => { ... })` that src/shell/roster.ts and src/tools/name-list.ts
// ship today, and the one-argument `withLock(() => { ... })` the regex still accepts. A fixture set
// carrying only one shape would prove nothing about the other, which is exactly how widening the
// call-site regex could have left the gate matching nothing and reporting green.
// ---------------------------------------------------------------------------
const CALL_SHAPES = [
  { label: 'withLock(fn)', open: 'withLock(', openAsync: 'withLock(async ' },
  { label: 'withLock(NAME, fn)', open: 'withLock(KEY, ', openAsync: 'withLock(KEY, async ' },
];

function selftest() {
  // A single-argument callback is NOT a lock callback — the widened regex must not start matching it,
  // or a `withLock(name, (grant) => {...})` body would be scanned as if it were the critical section.
  const shapeProbe = "await withLock(KEY, (grant) => {\n  write(KEY, []);\n});";
  assert.equal(
    findWithLockSpans(shapeProbe, matchBraces(shapeProbe)).length,
    0,
    'a callback that takes a parameter must not be recognised as a withLock critical section'
  );
  console.log('PASS regex calibration: a non-zero-argument arrow callback is not matched');

  for (const shape of CALL_SHAPES) {
    // --- Conditions 1 + 2, known-good: the real shape roster.ts ships today. ---
    const goodLockText = [
      "function read(key) { return []; }",
      "function write(key, list) {}",
      "const KEY = 'watduang:roster';",
      "export function loadGroup() {",
      "  const names = read(KEY);", // plain load, not a mutation path — must not be flagged
      "  return names;",
      "}",
      "export function loadRoster() {",
      "  let list = read(KEY);", // initial capture, outside add() — must not be flagged
      "  return {",
      "    async add(name) {",
      `      await ${shape.open}() => {`,
      "        list = [...list, ...read(KEY).filter((n) => !list.includes(n))];",
      "        write(KEY, list);",
      "      });",
      "    },",
      "  };",
      "}",
    ].join('\n');
    assert.deepEqual(checkLockStructure(goodLockText), [], `real roster.ts shape must report zero violations [${shape.label}]`);
    console.log(`PASS known-good fixture [${shape.label}]: read/write(KEY) inside the callback, sync callback, zero violations`);

    // --- Condition 1a known-bad: write(KEY outside any withLock callback. ---
    const badWriteOutside = [
      "async function add(name) {",
      "  write(KEY, [name]);", // no lock at all
      `  await ${shape.open}() => {`,
      "    read(KEY);",
      "  });",
      "}",
    ].join('\n');
    const v1a = checkLockStructure(badWriteOutside);
    assert.ok(
      v1a.some((v) => v.rule === 'write(KEY outside withLock callback' && v.line === 2),
      `write(KEY outside every withLock callback must be flagged [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (1a) [${shape.label}]: write(KEY outside withLock callback is flagged`);

    // --- Condition 1b known-bad: the exact hoist regression — read(KEY) moved just before the
    // withLock call, still inside add(), but outside the callback.
    const badHoistedRead = [
      "async function add(name) {",
      "  const stale = read(KEY);", // hoisted out of the critical section
      `  await ${shape.open}() => {`,
      "    write(KEY, [...stale, name]);",
      "  });",
      "}",
    ].join('\n');
    const v1b = checkLockStructure(badHoistedRead);
    assert.ok(
      v1b.some((v) => v.rule === 'mutation-path read(KEY) outside withLock callback' && v.line === 2),
      `read(KEY) hoisted out of the critical section, inside the mutating function, must be flagged [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (1b) [${shape.label}]: hoisted mutation-path read(KEY) is flagged`);

    // --- Condition 1b known-bad, the tools spelling: the same hoist written with the lowercase
    // per-tool `key` src/tools/name-list.ts is handed, which the KEY-only regexes never saw. ---
    const badHoistedToolRead = [
      "export function saveToolNames(key, names) {",
      "  const seen = read(key);", // hoisted out of the critical section
      `  return ${shape.open}() => {`,
      "    localStorage.setItem(key, JSON.stringify([...seen, ...names]));",
      "  });",
      "}",
    ].join('\n');
    const v1bTool = checkLockStructure(badHoistedToolRead);
    assert.ok(
      v1bTool.some((v) => v.rule === 'mutation-path read(KEY) outside withLock callback' && v.line === 2),
      `a hoisted read(key) on the per-tool key must be flagged too [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (1b, per-tool key) [${shape.label}]: hoisted read(key) is flagged`);

    // --- Condition 2 known-bad: an await inside the withLock callback. ---
    const badAwaitInCallback = [
      "async function add(name) {",
      `  await ${shape.openAsync}() => {`,
      "    const list = await Promise.resolve(read(KEY));",
      "    write(KEY, [...list, name]);",
      "  });",
      "}",
    ].join('\n');
    const v2 = checkLockStructure(badAwaitInCallback);
    assert.ok(
      v2.some((v) => v.rule === 'await inside withLock callback' && v.line === 3),
      `an await inside the withLock callback must be flagged [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (2) [${shape.label}]: await inside withLock callback is flagged`);
  }

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

  // --- Condition 4, known-good: the shipped shape. event.ts's one setItem inside withEventLock; a screen
  // that imports the key for the lock name and reads; a file writing another key. ---
  const ownerGood = [
    "export const STORAGE_KEY = 'watduang:prize-draw:event';",
    'export function readEvent(storage) { return storage.getItem(STORAGE_KEY); }',
    'export function withEventLock(locks, storage, fn: (tx: EventTx) => void): Promise<boolean> {',
    '  const tx = { write(state) { try { storage.setItem(STORAGE_KEY, encodeEvent(state)); return true; } catch { return false; } } };',
    '  return locks.request(STORAGE_KEY, () => fn(tx));',
    '}',
  ].join('\n');
  const eventGood = [
    { relPath: 'src/prize-event/event.ts', text: ownerGood },
    { relPath: 'src/play/prize-draw/stage.ts', text: "import { STORAGE_KEY, withEventLock } from '../../prize-event/event.ts';\nconst k = changed === STORAGE_KEY;\nstorage.getItem(STORAGE_KEY);" },
    { relPath: 'src/pages/tool/number.ts', text: "import { STORAGE_KEY } from './number-store.ts';\nlocalStorage.setItem(STORAGE_KEY, '1');" },
  ];
  assert.deepEqual(checkEventKeyWriter(eventGood), [], 'the shipped one-writer shape must report zero violations');
  console.log('PASS known-good fixture (4): one setItem in withEventLock; a reader of the key and another module\'s STORAGE_KEY stay clean');

  // --- Condition 4, known-bad: each way a second writer can be written. ---
  const plants = {
    'a second setItem through the import': ['src/play/prize-draw/stage.ts', "import { STORAGE_KEY } from '../../prize-event/event.ts';\nstorage.setItem(STORAGE_KEY, encodeEvent(next));"],
    'an aliased import': ['src/prize-event/setup-page.ts', "import { createEvent, STORAGE_KEY as EV } from './event.ts';\nwin.localStorage.setItem( EV, raw);"],
    'a namespace import': ['src/prize-event/setup-page.ts', "import * as E from './event';\nwin.localStorage.setItem(E.STORAGE_KEY, raw);"],
    'the key as a literal': ['src/play/prize-draw/stage.ts', "storage.setItem(`watduang:prize-draw:event`, raw);"],
    'a second setItem in event.ts, outside withEventLock': [
      'src/prize-event/event.ts',
      ownerGood + '\nexport function saveEvent(storage, state) { storage.setItem(STORAGE_KEY, encodeEvent(state)); return true; }',
    ],
  };
  for (const [what, [relPath, text]] of Object.entries(plants)) {
    const files = [...eventGood.filter((f) => f.relPath !== relPath), { relPath, text }];
    const v = checkEventKeyWriter(files);
    assert.ok(v.some((x) => x.file === relPath && x.line > 0), `${what} must be flagged at its line`);
    console.log(`PASS known-bad fixture (4): ${what} is flagged`);
  }
  // A scan that loses the owner, or its withEventLock, must say so rather than read green.
  assert.ok(checkEventKeyWriter(eventGood.slice(1)).some((x) => x.rule.includes('missing')), 'a missing owner must fail');
  assert.ok(
    checkEventKeyWriter([{ relPath: 'src/prize-event/event.ts', text: ownerGood.replace('withEventLock', 'withLockRenamed') }]).some((x) => x.rule.includes('blind')),
    'an owner without withEventLock must fail'
  );
  console.log('PASS blind-scan fixtures (4): a missing owner and a renamed withEventLock both fail');

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

  const files = walkSrcFiles(srcDir).map(({ relPath, abs }) => ({ relPath, text: fs.readFileSync(abs, 'utf8') }));

  // Scan set: every src file that imports the shared withLock. Derived, so a third caller is guarded
  // the day it is written — nobody has to remember this list.
  const lockCallers = files.filter((f) => LOCK_IMPORT_RE.test(f.text));
  if (lockCallers.length === 0) {
    console.error(
      'roster-lock-structure-check: no file under src/** imports src/shell/lock.ts — the scan set is ' +
        'empty, so this gate checked nothing. Either the lock module moved or the import shape changed.'
    );
    process.exit(1);
  }
  for (const { relPath, text } of lockCallers) {
    // A file that imports withLock but shows no recognised `withLock(... () => {` call site means the
    // call-site regex has gone blind, not that the file is clean. That reads as green otherwise, which
    // is the one failure this gate cannot afford.
    if (findWithLockSpans(text, matchBraces(text)).length === 0) {
      console.error(
        `${relPath} · imports withLock but no withLock(... () => { ... }) call site was recognised — ` +
          'the call-site regex in findWithLockSpans no longer matches this file'
      );
      anyFail = true;
    }
    for (const v of checkLockStructure(text)) {
      console.error(`${relPath}:${v.line} · ${v.rule} · ${v.snippet}`);
      anyFail = true;
    }
  }
  for (const v of checkKeyOwnership(files)) {
    console.error(`${v.file}:${v.line} · ${v.rule} · ${v.snippet}`);
    anyFail = true;
  }
  for (const v of checkEventKeyWriter(files)) {
    console.error(`${v.file}:${v.line} · ${v.rule} · ${v.snippet}`);
    anyFail = true;
  }

  if (anyFail) {
    console.error(
      '\nADR-0010 roster/checkpoint lock: the re-read must sit inside the withLock critical section, ' +
        'the critical section must stay synchronous, and roster.ts must stay the sole writer of the roster key. ' +
        'gh#304: the prize-draw event key has one setItem, inside event.ts withEventLock.'
    );
    process.exit(1);
  }
  const eventReaders = files.filter((f) => f.relPath !== EVENT_KEY_OWNER && eventKeyNames(f.relPath, f.text).length).length;
  console.log(
    `roster-lock-structure-check: lock structure clean in ${lockCallers.length} withLock caller(s) ` +
      `(${lockCallers.map((f) => f.relPath).join(', ')}); roster-key ownership clean; event key: one setItem, ` +
      `in ${EVENT_KEY_OWNER} withEventLock, and no setItem on it in the ${eventReaders} other file(s) importing it`
  );
}

await main();
